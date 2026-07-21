// __tests__/lib/services/pde-jpeg-metadata.test.ts
// Guards the fail-closed metadata assertion for clinical teaching images.
// A regression here silently lets EXIF/GPS-bearing patient imagery into a
// public bucket, so the negative cases matter more than the positive one.

import { describe, it, expect } from 'vitest';

import { scanJpegForMetadata, isJpegMagic } from '@/lib/services/pde/jpeg-metadata';

/** Build a minimal JPEG byte stream from a list of [marker, payloadLength] segments. */
function buildJpeg(segments: Array<{ marker: number; payload: number }>): Uint8Array {
  const parts: number[] = [0xff, 0xd8]; // SOI
  for (const { marker, payload } of segments) {
    parts.push(0xff, marker);
    const len = payload + 2;
    parts.push((len >> 8) & 0xff, len & 0xff);
    for (let i = 0; i < payload; i++) parts.push(0x00);
  }
  parts.push(0xff, 0xda, 0x00, 0x02); // SOS
  parts.push(0x01, 0x02, 0x03); // entropy-coded data
  return new Uint8Array(parts);
}

const APP0 = 0xe0;
const APP1 = 0xe1; // EXIF lives here
const APP13 = 0xed; // IPTC
const COM = 0xfe;
const DQT = 0xdb;
const SOF0 = 0xc0;
const DHT = 0xc4;

describe('isJpegMagic', () => {
  it('accepts JPEG magic bytes', () => {
    expect(isJpegMagic(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
  });

  it('rejects PNG magic bytes', () => {
    expect(isJpegMagic(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });

  it('rejects a buffer too short to classify', () => {
    expect(isJpegMagic(new Uint8Array([0xff]))).toBe(false);
  });
});

describe('scanJpegForMetadata', () => {
  it('passes a clean re-encoded JPEG (JFIF + structural segments only)', () => {
    const jpeg = buildJpeg([
      { marker: APP0, payload: 14 },
      { marker: DQT, payload: 65 },
      { marker: SOF0, payload: 15 },
      { marker: DHT, payload: 29 },
    ]);
    expect(scanJpegForMetadata(jpeg)).toEqual({ ok: true, offending: [] });
  });

  it('FAILS a JPEG carrying an EXIF (APP1) segment', () => {
    const jpeg = buildJpeg([
      { marker: APP0, payload: 14 },
      { marker: APP1, payload: 120 }, // EXIF — may hold GPS, device serial, timestamps
      { marker: DQT, payload: 65 },
    ]);
    const result = scanJpegForMetadata(jpeg);
    expect(result.ok).toBe(false);
    expect(result.offending).toContain('APP1');
  });

  it('FAILS a JPEG carrying IPTC (APP13) and reports every offending segment', () => {
    const jpeg = buildJpeg([
      { marker: APP1, payload: 40 },
      { marker: APP13, payload: 40 },
      { marker: DQT, payload: 65 },
    ]);
    const result = scanJpegForMetadata(jpeg);
    expect(result.ok).toBe(false);
    expect(result.offending).toEqual(expect.arrayContaining(['APP1', 'APP13']));
  });

  it('FAILS a JPEG carrying a free-text comment (COM) segment', () => {
    const jpeg = buildJpeg([
      { marker: APP0, payload: 14 },
      { marker: COM, payload: 32 },
    ]);
    const result = scanJpegForMetadata(jpeg);
    expect(result.ok).toBe(false);
    expect(result.offending).toContain('COM');
  });

  it('fails closed on a non-JPEG buffer rather than passing it through', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = scanJpegForMetadata(png);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_jpeg');
  });

  it('fails closed on a truncated JPEG that never reaches scan data', () => {
    const truncated = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = scanJpegForMetadata(truncated);
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('fails closed on an empty buffer', () => {
    expect(scanJpegForMetadata(new Uint8Array([])).ok).toBe(false);
  });

  it('fails closed on a desynced segment stream', () => {
    // Valid magic + a well-formed APP0, then a byte that is not a marker prefix
    // where the next segment should start.
    const desynced = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0, length 4 (2 payload bytes)
      0x11, 0x22, // garbage where 0xFF should be
    ]);
    const result = scanJpegForMetadata(desynced);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('desync');
  });
});
