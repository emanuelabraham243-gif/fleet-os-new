const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type SniffedMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | typeof XLSX_MIME;

const startsWith = (b: Uint8Array, sig: readonly number[], offset = 0): boolean =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);

// XLSX is a ZIP container. The entry name "xl/workbook.xml" is stored as raw
// ASCII in the local file header (uncompressed), so a byte-for-byte scan
// reliably identifies a real Excel workbook without needing a zip parser.
const isZip = (b: Uint8Array): boolean =>
  startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]);

const zipHasEntry = (b: Uint8Array, name: string): boolean =>
  new TextDecoder('latin1').decode(b).includes(name);

/**
 * Detects the real file type from magic bytes. The client-declared type and
 * filename are never trusted. Returns null for anything unrecognised.
 */
export function sniffMime(bytes: Uint8Array): SniffedMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // "RIFF" + 4 size bytes + "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (isZip(bytes) && zipHasEntry(bytes, 'xl/workbook.xml')) return XLSX_MIME;
  return null;
}

export const MIME_EXT: Record<SniffedMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  [XLSX_MIME]: 'xlsx',
};

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
