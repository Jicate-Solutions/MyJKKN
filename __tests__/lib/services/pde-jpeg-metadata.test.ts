// __tests__/lib/services/pde-jpeg-metadata.test.ts
// Guards the fail-closed metadata assertion for clinical teaching images.
// A regression here silently lets EXIF/GPS-bearing patient imagery into a
// public bucket, so the negative cases matter more than the positive one.

import { describe, it, expect } from 'vitest';

import {
  scanJpegForMetadata,
  isJpegMagic,
  stripJpegMetadata,
} from '@/lib/services/pde/jpeg-metadata';

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
const APP2 = 0xe2; // ICC colour profile — what a browser canvas attaches to its own output
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

  it('flags APP2 — the ICC profile a browser canvas attaches to its own output', () => {
    // Regression guard: this exact case rejected a legitimate upload on prod
    // before stripJpegMetadata existed. The scan SHOULD still flag it; the route
    // strips it first rather than rejecting the browser's output.
    const jpeg = buildJpeg([
      { marker: APP0, payload: 14 },
      { marker: APP2, payload: 500 },
    ]);
    const result = scanJpegForMetadata(jpeg);
    expect(result.ok).toBe(false);
    expect(result.offending).toContain('APP2');
  });
});

describe('stripJpegMetadata', () => {
  it('removes an ICC (APP2) profile so a canvas-encoded upload passes', () => {
    const jpeg = buildJpeg([
      { marker: APP0, payload: 14 },
      { marker: APP2, payload: 500 }, // Chrome's ICC profile
      { marker: DQT, payload: 65 },
    ]);
    expect(scanJpegForMetadata(jpeg).ok).toBe(false); // dirty before

    const cleaned = stripJpegMetadata(jpeg);
    expect(cleaned).not.toBeNull();
    expect(scanJpegForMetadata(cleaned!)).toEqual({ ok: true, offending: [] }); // clean after
    expect(cleaned!.length).toBeLessThan(jpeg.length);
  });

  it('removes EXIF, IPTC and comments together', () => {
    const jpeg = buildJpeg([
      { marker: APP0, payload: 14 },
      { marker: APP1, payload: 200 }, // EXIF/GPS
      { marker: APP13, payload: 90 }, // IPTC
      { marker: COM, payload: 40 },
      { marker: DQT, payload: 65 },
      { marker: SOF0, payload: 15 },
    ]);
    const cleaned = stripJpegMetadata(jpeg);
    expect(cleaned).not.toBeNull();
    expect(scanJpegForMetadata(cleaned!).ok).toBe(true);
  });

  it('preserves the structural segments and the scan data verbatim', () => {
    const jpeg = buildJpeg([
      { marker: APP1, payload: 60 },
      { marker: DQT, payload: 65 },
      { marker: SOF0, payload: 15 },
      { marker: DHT, payload: 29 },
    ]);
    const cleaned = stripJpegMetadata(jpeg)!;
    // SOI intact
    expect([cleaned[0], cleaned[1]]).toEqual([0xff, 0xd8]);
    // trailing entropy-coded bytes survive unchanged
    expect(Array.from(cleaned.slice(-3))).toEqual([0x01, 0x02, 0x03]);
    // the dropped APP1 payload is gone
    expect(cleaned.length).toBe(jpeg.length - (60 + 4));
  });

  it('is idempotent — stripping an already-clean file changes nothing', () => {
    const jpeg = buildJpeg([
      { marker: APP0, payload: 14 },
      { marker: DQT, payload: 65 },
    ]);
    const once = stripJpegMetadata(jpeg)!;
    const twice = stripJpegMetadata(once)!;
    expect(Array.from(twice)).toEqual(Array.from(once));
  });

  it('returns null (reject) for a non-JPEG rather than passing bytes through', () => {
    expect(stripJpegMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });

  it('returns null for a truncated JPEG that never reaches scan data', () => {
    expect(stripJpegMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBeNull();
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
