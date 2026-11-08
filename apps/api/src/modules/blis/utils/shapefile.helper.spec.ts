import { describe, it, expect } from 'vitest';
import * as zlib from 'node:zlib';
import { extractAndValidateShapefileZip, parsePrjSrid } from './shapefile.helper';

function createSimpleZip(entries: Array<{ name: string; content: Buffer }>): Buffer {
  const localHeaders: Buffer[] = [];
  const cdHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const compData = zlib.deflateRawSync(entry.content);

    // Local header
    const lh = Buffer.alloc(30 + nameBuf.length + compData.length);
    lh.writeUInt32LE(0x04034b50, 0); // signature
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0, 6); // flags
    lh.writeUInt16LE(8, 8); // compression = deflate
    lh.writeUInt16LE(0, 10); // time
    lh.writeUInt16LE(0, 12); // date
    lh.writeUInt32LE(0, 14); // crc32
    lh.writeUInt32LE(compData.length, 18); // comp size
    lh.writeUInt32LE(entry.content.length, 22); // uncomp size
    lh.writeUInt16LE(nameBuf.length, 26); // name length
    lh.writeUInt16LE(0, 28); // extra length
    nameBuf.copy(lh, 30);
    compData.copy(lh, 30 + nameBuf.length);
    localHeaders.push(lh);

    // CD header
    const cdh = Buffer.alloc(46 + nameBuf.length);
    cdh.writeUInt32LE(0x02014b50, 0); // signature
    cdh.writeUInt16LE(20, 4); // version made by
    cdh.writeUInt16LE(20, 6); // version needed
    cdh.writeUInt16LE(0, 8); // flags
    cdh.writeUInt16LE(8, 10); // compression = deflate
    cdh.writeUInt16LE(0, 12); // time
    cdh.writeUInt16LE(0, 14); // date
    cdh.writeUInt32LE(0, 16); // crc32
    cdh.writeUInt32LE(compData.length, 20); // comp size
    cdh.writeUInt32LE(entry.content.length, 24); // uncomp size
    cdh.writeUInt16LE(nameBuf.length, 28); // name length
    cdh.writeUInt16LE(0, 30); // extra length
    cdh.writeUInt16LE(0, 32); // comment length
    cdh.writeUInt16LE(0, 34); // disk num
    cdh.writeUInt16LE(0, 36); // int attr
    cdh.writeUInt32LE(0, 38); // ext attr
    cdh.writeUInt32LE(offset, 42); // local header offset
    nameBuf.copy(cdh, 46);
    cdHeaders.push(cdh);

    offset += lh.length;
  }

  const cdTotalSize = cdHeaders.reduce((sum, h) => sum + h.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdTotalSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...cdHeaders, eocd]);
}

/**
 * Creates minimal valid .shp, .shx, .dbf, .prj files for a single Point feature.
 */
function createMinimalPointShapefile(lon = 8.52, lat = 11.99, name = 'Kano Point') {
  // 1. SHP buffer (100-byte header + 1 record of 28 bytes)
  const shp = Buffer.alloc(100 + 28);
  shp.writeInt32BE(9994, 0); // file code
  shp.writeInt32BE((100 + 28) / 2, 24); // length in 16-bit words
  shp.writeInt32LE(1000, 28); // version
  shp.writeInt32LE(1, 32); // shape type = Point (1)
  shp.writeDoubleLE(lon, 36); // Xmin
  shp.writeDoubleLE(lat, 44); // Ymin
  shp.writeDoubleLE(lon, 52); // Xmax
  shp.writeDoubleLE(lat, 60); // Ymax

  // Record 1
  shp.writeInt32BE(1, 100); // record number
  shp.writeInt32BE(10, 104); // content length (10 16-bit words = 20 bytes)
  shp.writeInt32LE(1, 108); // shape type = Point
  shp.writeDoubleLE(lon, 112); // X
  shp.writeDoubleLE(lat, 120); // Y

  // 2. SHX buffer (100-byte header + 1 index record of 8 bytes)
  const shx = Buffer.alloc(100 + 8);
  shx.writeInt32BE(9994, 0);
  shx.writeInt32BE((100 + 8) / 2, 24);
  shx.writeInt32LE(1000, 28);
  shx.writeInt32LE(1, 32);
  shx.writeInt32BE(50, 100); // offset (50 words = byte 100)
  shx.writeInt32BE(10, 104); // content length

  // 3. DBF buffer (Header 32 bytes + 1 field of 32 bytes + terminator 1 byte + 1 record)
  const fieldLen = 20;
  const headerLen = 32 + 32 + 1;
  const recLen = 1 + fieldLen;
  const dbf = Buffer.alloc(headerLen + recLen);
  dbf[0] = 0x03; // dBase III
  dbf.writeInt32LE(1, 4); // 1 record
  dbf.writeInt16LE(headerLen, 8);
  dbf.writeInt16LE(recLen, 10);

  // Field 1: NAME, Character (C), 20 bytes
  Buffer.from('NAME\0\0\0\0\0\0\0', 'ascii').copy(dbf, 32);
  dbf[32 + 11] = 'C'.charCodeAt(0);
  dbf[32 + 16] = fieldLen;
  dbf[headerLen - 1] = 0x0d; // Header terminator

  // Record 1
  dbf[headerLen] = 0x20; // Active (space)
  Buffer.from(name.padEnd(fieldLen, ' '), 'utf8').copy(dbf, headerLen + 1);

  // 4. PRJ
  const prj = Buffer.from(
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295],AUTHORITY["EPSG","4326"]]',
    'utf8',
  );

  return { shp, shx, dbf, prj };
}

describe('Shapefile & Zip Security Helpers', () => {
  it('extracts and parses valid shapefile zip archive with 4326 projection', () => {
    const { shp, shx, dbf, prj } = createMinimalPointShapefile(8.52, 11.99, 'Kano Station');
    const zip = createSimpleZip([
      { name: 'points.shp', content: shp },
      { name: 'points.shx', content: shx },
      { name: 'points.dbf', content: dbf },
      { name: 'points.prj', content: prj },
    ]);

    const result = extractAndValidateShapefileZip(zip);
    expect(result.sourceSrid).toBe(4326);
    expect(result.features.length).toBe(1);
    expect(result.features[0].geometry.type).toBe('Point');
    expect(result.features[0].geometry.coordinates).toEqual([8.52, 11.99]);
    expect(result.features[0].properties.NAME).toBe('Kano Station');
  });

  it('rejects zip archive with directory traversal path (..)', () => {
    const { shp, shx, dbf, prj } = createMinimalPointShapefile();
    const zip = createSimpleZip([
      { name: '../evil.shp', content: shp },
      { name: 'points.shx', content: shx },
      { name: 'points.dbf', content: dbf },
      { name: 'points.prj', content: prj },
    ]);

    expect(() => extractAndValidateShapefileZip(zip)).toThrowError(
      /Directory traversal detected in zip archive/,
    );
  });

  it('rejects zip archive with absolute path', () => {
    const { shp, shx, dbf, prj } = createMinimalPointShapefile();
    const zip = createSimpleZip([
      { name: '/etc/evil.shp', content: shp },
      { name: 'points.shx', content: shx },
      { name: 'points.dbf', content: dbf },
      { name: 'points.prj', content: prj },
    ]);

    expect(() => extractAndValidateShapefileZip(zip)).toThrowError(
      /Absolute path detected in zip archive/,
    );
  });

  it('rejects zip archive with Windows drive letter path', () => {
    const { shp, shx, dbf, prj } = createMinimalPointShapefile();
    const zip = createSimpleZip([
      { name: 'C:\\evil.shp', content: shp },
      { name: 'points.shx', content: shx },
      { name: 'points.dbf', content: dbf },
      { name: 'points.prj', content: prj },
    ]);

    expect(() => extractAndValidateShapefileZip(zip)).toThrowError(
      /Drive letter path detected in zip archive/,
    );
  });

  it('rejects zip archive missing required files (.prj)', () => {
    const { shp, shx, dbf } = createMinimalPointShapefile();
    const zip = createSimpleZip([
      { name: 'points.shp', content: shp },
      { name: 'points.shx', content: shx },
      { name: 'points.dbf', content: dbf },
    ]);

    expect(() => extractAndValidateShapefileZip(zip)).toThrowError(
      /Shapefile archive missing required files: \.prj/,
    );
  });

  it('rejects zip archive exceeding 50 entries', () => {
    const entries = Array.from({ length: 51 }, (_, i) => ({
      name: `file_${i}.txt`,
      content: Buffer.from(`content ${i}`),
    }));
    const zip = createSimpleZip(entries);

    expect(() => extractAndValidateShapefileZip(zip)).toThrowError(
      /Zip archive contains more than 50 entries/,
    );
  });

  it('parses Nigeria Minna projection from PRJ', () => {
    const prjMinna =
      'PROJCS["Minna / Nigeria West Belt",GEOGCS["Minna",...],AUTHORITY["EPSG","26391"]]';
    expect(parsePrjSrid(prjMinna)).toBe(26391);
  });
});
