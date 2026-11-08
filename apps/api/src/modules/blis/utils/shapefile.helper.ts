import { BadRequestException } from '@nestjs/common';
import * as zlib from 'node:zlib';

export const MAX_ZIP_COMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_ZIP_UNCOMPRESSED_BYTES = 500 * 1024 * 1024; // 500 MB
export const MAX_ZIP_ENTRIES = 50;

export interface ExtractedShapefile {
  shp: Buffer;
  shx: Buffer;
  dbf: Buffer;
  prj: Buffer;
  sourceSrid: number;
  features: Array<{
    properties: Record<string, unknown>;
    geometry: {
      type: string;
      coordinates: unknown;
    };
  }>;
}

/**
 * Extracts and securely validates a zipped shapefile archive.
 */
export function extractAndValidateShapefileZip(zipBuffer: Buffer): ExtractedShapefile {
  if (zipBuffer.length > MAX_ZIP_COMPRESSED_BYTES) {
    throw new BadRequestException(
      `Zip archive exceeds maximum compressed size of 50 MB (got ${zipBuffer.length} bytes)`,
    );
  }

  // 1. Locate End of Central Directory (EOCD)
  // EOCD signature is 0x06054b50 (PK\x05\x06), minimum size 22 bytes.
  let eocdOffset = -1;
  for (let i = zipBuffer.length - 22; i >= Math.max(0, zipBuffer.length - 65557); i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new BadRequestException('Invalid zip archive: End of Central Directory not found');
  }

  const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
  const cdSize = zipBuffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

  if (totalEntries > MAX_ZIP_ENTRIES) {
    throw new BadRequestException(
      `Zip archive contains more than ${MAX_ZIP_ENTRIES} entries (got ${totalEntries})`,
    );
  }

  if (cdOffset + cdSize > zipBuffer.length) {
    throw new BadRequestException('Corrupted zip archive: Central Directory out of bounds');
  }

  // 2. Read Central Directory headers & validate security constraints
  let currentCdOffset = cdOffset;
  let totalUncompressedBytes = 0;
  const files = new Map<string, Buffer>();

  for (let e = 0; e < totalEntries; e++) {
    if (currentCdOffset + 46 > zipBuffer.length) {
      throw new BadRequestException('Corrupted zip archive: invalid header offset');
    }

    const sig = zipBuffer.readUInt32LE(currentCdOffset);
    if (sig !== 0x02014b50) {
      throw new BadRequestException(
        'Corrupted zip archive: expected Central Directory header signature',
      );
    }

    const compressionMethod = zipBuffer.readUInt16LE(currentCdOffset + 10);
    const compressedSize = zipBuffer.readUInt32LE(currentCdOffset + 20);
    const uncompressedSize = zipBuffer.readUInt32LE(currentCdOffset + 24);
    const fileNameLength = zipBuffer.readUInt16LE(currentCdOffset + 28);
    const extraFieldLength = zipBuffer.readUInt16LE(currentCdOffset + 30);
    const fileCommentLength = zipBuffer.readUInt16LE(currentCdOffset + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(currentCdOffset + 42);

    const fileName = zipBuffer.toString(
      'utf8',
      currentCdOffset + 46,
      currentCdOffset + 46 + fileNameLength,
    );

    // Security Checks: Reject directory traversal, absolute paths, and Windows drive letters
    if (fileName.includes('..')) {
      throw new BadRequestException(`Directory traversal detected in zip archive: ${fileName}`);
    }
    if (fileName.startsWith('/') || fileName.startsWith('\\')) {
      throw new BadRequestException(`Absolute path detected in zip archive: ${fileName}`);
    }
    if (/^[a-zA-Z]:/.test(fileName)) {
      throw new BadRequestException(`Drive letter path detected in zip archive: ${fileName}`);
    }

    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
      throw new BadRequestException(
        `Zip archive exceeds maximum uncompressed size of 500 MB (accumulated ${totalUncompressedBytes} bytes)`,
      );
    }

    // Read local header and extract content if not a directory
    if (!fileName.endsWith('/') && !fileName.endsWith('\\')) {
      if (localHeaderOffset + 30 > zipBuffer.length) {
        throw new BadRequestException(`Corrupted local header for entry: ${fileName}`);
      }

      const localSig = zipBuffer.readUInt32LE(localHeaderOffset);
      if (localSig !== 0x04034b50) {
        throw new BadRequestException(`Corrupted local header signature for entry: ${fileName}`);
      }

      const localNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const dataEnd = dataStart + compressedSize;

      if (dataEnd > zipBuffer.length) {
        throw new BadRequestException(`Corrupted data length for entry: ${fileName}`);
      }

      const compressedData = zipBuffer.subarray(dataStart, dataEnd);
      let fileContent: Buffer;

      if (compressionMethod === 0) {
        // Stored (no compression)
        fileContent = Buffer.from(compressedData);
      } else if (compressionMethod === 8) {
        // Deflated
        try {
          fileContent = zlib.inflateRawSync(compressedData);
        } catch (err: unknown) {
          throw new BadRequestException(
            `Failed to decompress entry ${fileName}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else {
        throw new BadRequestException(
          `Unsupported compression method ${compressionMethod} in entry ${fileName}`,
        );
      }

      // Normalized base name (lowercase extension for matching)
      const baseName = fileName.split(/[/|\\]/).pop() || fileName;
      files.set(baseName.toLowerCase(), fileContent);
    }

    currentCdOffset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  // 3. Find required .shp, .shx, .dbf, .prj files
  let shpFile: Buffer | undefined;
  let shxFile: Buffer | undefined;
  let dbfFile: Buffer | undefined;
  let prjFile: Buffer | undefined;

  for (const [name, content] of files.entries()) {
    if (name.endsWith('.shp')) shpFile = content;
    else if (name.endsWith('.shx')) shxFile = content;
    else if (name.endsWith('.dbf')) dbfFile = content;
    else if (name.endsWith('.prj')) prjFile = content;
  }

  if (!shpFile || !shxFile || !dbfFile || !prjFile) {
    const missing: string[] = [];
    if (!shpFile) missing.push('.shp');
    if (!shxFile) missing.push('.shx');
    if (!dbfFile) missing.push('.dbf');
    if (!prjFile) missing.push('.prj');
    throw new BadRequestException(
      `Shapefile archive missing required files: ${missing.join(', ')}`,
    );
  }

  // 4. Parse PRJ for SRID
  const prjText = prjFile.toString('utf8');
  const sourceSrid = parsePrjSrid(prjText);

  // 5. Parse DBF attributes
  const records = parseDbf(dbfFile);

  // 6. Parse SHP geometries and join with DBF
  const features = parseShp(shpFile, records);

  return {
    shp: shpFile,
    shx: shxFile,
    dbf: dbfFile,
    prj: prjFile,
    sourceSrid,
    features,
  };
}

/**
 * Extracts EPSG / SRID from PRJ WKT string. Defaults to 4326.
 */
export function parsePrjSrid(prjText: string): number {
  if (!prjText || prjText.trim().length === 0) {
    return 4326;
  }

  // Check for EPSG code in AUTHORITY["EPSG","4326"]
  const authorityMatch = /AUTHORITY\s*\[\s*"EPSG"\s*,\s*"?(\d+)"?\s*\]/i.exec(prjText);
  if (authorityMatch) {
    const srid = parseInt(authorityMatch[1], 10);
    if (!Number.isNaN(srid) && srid > 0) return srid;
  }

  // Check for common strings
  if (/WGS_1984|WGS 84|4326/i.test(prjText)) {
    return 4326;
  }
  if (/Nigeria West Belt|26391/i.test(prjText)) {
    return 26391;
  }
  if (/Nigeria Mid Belt|26392/i.test(prjText)) {
    return 26392;
  }
  if (/Nigeria East Belt|26393/i.test(prjText)) {
    return 26393;
  }
  if (/3857|Web Mercator/i.test(prjText)) {
    return 3857;
  }

  return 4326;
}

/**
 * Parses dBase III / IV (.dbf) binary table.
 */
export function parseDbf(dbfBuffer: Buffer): Array<Record<string, unknown>> {
  if (dbfBuffer.length < 32) {
    return [];
  }

  const numRecords = dbfBuffer.readInt32LE(4);
  const headerLength = dbfBuffer.readInt16LE(8);
  const recordLength = dbfBuffer.readInt16LE(10);

  // Parse field descriptors
  const fields: Array<{ name: string; type: string; length: number; offset: number }> = [];
  let fieldOffset = 0;

  for (let offset = 32; offset < headerLength - 1; offset += 32) {
    if (dbfBuffer[offset] === 0x0d) break; // Header terminator

    const fieldName = dbfBuffer
      .toString('ascii', offset, offset + 11)
      .replace(/\0.*$/g, '')
      .trim();
    const fieldType = String.fromCharCode(dbfBuffer[offset + 11]);
    const fieldLength = dbfBuffer[offset + 16];

    fields.push({
      name: fieldName,
      type: fieldType,
      length: fieldLength,
      offset: fieldOffset,
    });
    fieldOffset += fieldLength;
  }

  const records: Array<Record<string, unknown>> = [];

  for (let r = 0; r < numRecords; r++) {
    const recStart = headerLength + r * recordLength;
    if (recStart + recordLength > dbfBuffer.length) break;

    const deletionFlag = dbfBuffer[recStart];
    if (deletionFlag === 0x2a) continue; // Deleted record ('*')

    const props: Record<string, unknown> = {};
    for (const f of fields) {
      const valBytes = dbfBuffer.subarray(
        recStart + 1 + f.offset,
        recStart + 1 + f.offset + f.length,
      );
      const valStr = valBytes.toString('utf8').trim();

      if (f.type === 'N' || f.type === 'F') {
        const num = Number(valStr);
        props[f.name] = Number.isNaN(num) ? valStr : num;
      } else if (f.type === 'L') {
        props[f.name] = valStr === 'T' || valStr === 't' || valStr === 'Y' || valStr === 'y';
      } else {
        props[f.name] = valStr;
      }
    }
    records.push(props);
  }

  return records;
}

/**
 * Parses ESRI .shp binary geometry stream and joins with attribute records.
 */
export function parseShp(
  shpBuffer: Buffer,
  records: Array<Record<string, unknown>>,
): Array<{
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}> {
  if (shpBuffer.length < 100) {
    throw new BadRequestException('Invalid shapefile: file size less than 100 bytes');
  }

  const fileCode = shpBuffer.readInt32BE(0);
  if (fileCode !== 9994) {
    throw new BadRequestException(`Invalid shapefile: file code 9994 expected, got ${fileCode}`);
  }

  const fileLengthBytes = shpBuffer.readInt32BE(24) * 2;
  const actualLength = Math.min(fileLengthBytes, shpBuffer.length);

  const features: Array<{
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown };
  }> = [];

  let offset = 100;
  let recordIdx = 0;

  while (offset + 8 <= actualLength) {
    const contentLengthBytes = shpBuffer.readInt32BE(offset + 4) * 2;
    const recordContentOffset = offset + 8;
    offset += 8 + contentLengthBytes;

    if (recordContentOffset + 4 > shpBuffer.length) break;

    const shapeType = shpBuffer.readInt32LE(recordContentOffset);
    const properties = records[recordIdx] || {};
    recordIdx++;

    if (shapeType === 0) {
      // Null shape
      continue;
    }

    if (shapeType === 1) {
      // Point: X (double), Y (double)
      const x = shpBuffer.readDoubleLE(recordContentOffset + 4);
      const y = shpBuffer.readDoubleLE(recordContentOffset + 12);
      features.push({
        properties,
        geometry: {
          type: 'Point',
          coordinates: [x, y],
        },
      });
    } else if (shapeType === 3 || shapeType === 5) {
      // Polyline (3) or Polygon (5)
      // Bounding box: 4 doubles = 32 bytes (offset 4..36)
      const numParts = shpBuffer.readInt32LE(recordContentOffset + 36);
      const numPoints = shpBuffer.readInt32LE(recordContentOffset + 40);

      const parts: number[] = [];
      for (let p = 0; p < numParts; p++) {
        parts.push(shpBuffer.readInt32LE(recordContentOffset + 44 + p * 4));
      }

      const pointsOffset = recordContentOffset + 44 + numParts * 4;
      const allPoints: Array<[number, number]> = [];
      for (let i = 0; i < numPoints; i++) {
        const px = shpBuffer.readDoubleLE(pointsOffset + i * 16);
        const py = shpBuffer.readDoubleLE(pointsOffset + i * 16 + 8);
        allPoints.push([px, py]);
      }

      // Group into rings / lines
      const rings: Array<Array<[number, number]>> = [];
      for (let p = 0; p < numParts; p++) {
        const start = parts[p];
        const end = p + 1 < numParts ? parts[p + 1] : numPoints;
        rings.push(allPoints.slice(start, end));
      }

      if (shapeType === 5) {
        features.push({
          properties,
          geometry: {
            type: 'Polygon',
            coordinates: rings,
          },
        });
      } else {
        features.push({
          properties,
          geometry: {
            type: rings.length === 1 ? 'LineString' : 'MultiLineString',
            coordinates: rings.length === 1 ? rings[0] : rings,
          },
        });
      }
    }
  }

  return features;
}
