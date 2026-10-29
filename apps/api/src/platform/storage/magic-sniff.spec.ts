import { describe, expect, it } from 'vitest';
import { isMimeTypeCompatible, sniffMimeType } from './magic-sniff';

describe('Magic Byte MIME Sniffing Specification (BE-1.7)', () => {
  it('correctly sniffs PDF headers', () => {
    const pdfBuffer = Buffer.from('%PDF-1.7 header content here');
    expect(sniffMimeType(pdfBuffer)).toBe('application/pdf');
    expect(isMimeTypeCompatible('application/pdf', 'application/pdf')).toBe(true);
    expect(isMimeTypeCompatible('application/pdf', 'image/png')).toBe(false);
  });

  it('correctly sniffs ZIP / OpenXML (Excel .xlsx) headers', () => {
    // PK\x03\x04
    const zipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(sniffMimeType(zipBuffer)).toBe('application/zip');
    expect(
      isMimeTypeCompatible(
        'application/zip',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe(true);
    expect(isMimeTypeCompatible('application/zip', 'application/pdf')).toBe(false);
  });

  it('correctly sniffs PNG headers', () => {
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    expect(sniffMimeType(pngBuffer)).toBe('image/png');
    expect(isMimeTypeCompatible('image/png', 'image/png')).toBe(true);
    expect(isMimeTypeCompatible('image/png', 'text/plain')).toBe(false);
  });

  it('correctly sniffs JPEG headers', () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffMimeType(jpegBuffer)).toBe('image/jpeg');
    expect(isMimeTypeCompatible('image/jpeg', 'image/jpeg')).toBe(true);
  });

  it('correctly sniffs UTF-8 text / CSV files', () => {
    const csvBuffer = Buffer.from('id,name,state\n1,Kano,Kano');
    expect(sniffMimeType(csvBuffer)).toBe('text/plain');
    expect(isMimeTypeCompatible('text/plain', 'text/csv')).toBe(true);
    expect(isMimeTypeCompatible('text/plain', 'application/pdf')).toBe(false);
  });

  it('rejects binary executables or unknown buffers when declaring image/pdf', () => {
    // Windows PE EXE (MZ header)
    const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const sniffed = sniffMimeType(exeBuffer);
    expect(isMimeTypeCompatible(sniffed, 'image/jpeg')).toBe(false);
    expect(isMimeTypeCompatible(sniffed, 'application/pdf')).toBe(false);
  });
});
