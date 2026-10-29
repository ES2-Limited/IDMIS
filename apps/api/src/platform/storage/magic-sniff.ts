/**
 * Magic byte MIME sniffing to verify actual file payload against declared MIME types.
 */
export function sniffMimeType(buffer: Buffer): string | null {
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'application/pdf';
  }

  // ZIP / OpenXML (docx, xlsx)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return 'application/zip';
  }

  // PNG
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // Text / CSV (check if printable ASCII / UTF-8 without NUL bytes)
  let isText = true;
  const checkLen = Math.min(buffer.length, 512);
  for (let i = 0; i < checkLen; i++) {
    const byte = buffer[i];
    if (byte === 0) {
      isText = false;
      break;
    }
  }
  if (isText && checkLen > 0) {
    return 'text/plain';
  }

  return null;
}

export function isMimeTypeCompatible(sniffed: string | null, declared: string): boolean {
  if (!sniffed) return false;
  if (sniffed === declared) return true;

  // OpenXML Excel (.xlsx) files are ZIP archives internally
  if (
    sniffed === 'application/zip' &&
    (declared === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      declared === 'application/vnd.ms-excel' ||
      declared === 'application/zip')
  ) {
    return true;
  }

  // CSV files are plain text
  if (sniffed === 'text/plain' && (declared === 'text/csv' || declared === 'text/plain')) {
    return true;
  }

  return false;
}
