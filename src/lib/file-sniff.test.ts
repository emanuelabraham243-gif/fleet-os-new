import { describe, expect, it } from 'vitest';
import { sniffMime, MIME_EXT } from './file-sniff';

const u = (...n: number[]) => new Uint8Array(n);
const ascii = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
const NUL4 = String.fromCharCode(0, 0, 0, 0);

describe('sniffMime', () => {
  it('detects valid types', () => {
    expect(sniffMime(u(0xff, 0xd8, 0xff, 0xe0, 0))).toBe('image/jpeg');
    expect(sniffMime(u(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png');
    expect(sniffMime(ascii('RIFF' + NUL4 + 'WEBPVP8 '))).toBe('image/webp');
    expect(sniffMime(ascii('%PDF-1.7\n'))).toBe('application/pdf');
  });
  it('rejects empty and short input', () => {
    expect(sniffMime(new Uint8Array())).toBeNull();
    expect(sniffMime(u(0xff, 0xd8))).toBeNull();
    expect(sniffMime(u(0x89, 0x50, 0x4e, 0x47))).toBeNull();
    expect(sniffMime(ascii('%PDF'))).toBeNull();
  });
  it('rejects spoofed or wrong headers', () => {
    expect(sniffMime(ascii('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffMime(ascii('MZ' + NUL4))).toBeNull();
    expect(sniffMime(ascii('RIFF' + NUL4 + 'WAVEfmt '))).toBeNull();
    expect(sniffMime(ascii('GIF89a'))).toBeNull();
    expect(sniffMime(u(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b))).toBeNull();
    expect(sniffMime(u(0, 0xff, 0xd8, 0xff))).toBeNull();
  });
  it('maps extensions from sniffed type', () => {
    expect(MIME_EXT['image/jpeg']).toBe('jpg');
    expect(MIME_EXT['application/pdf']).toBe('pdf');
  });
});
