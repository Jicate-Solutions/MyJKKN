// __tests__/lib/id-cards/mono-back.test.ts
// 2026-10-01 — the back handed to the print bridge is strictly black & white.
// The ribbon's black resin panel prints black or nothing; greys and colour on
// the back are what let a station spend a second colour set on it.

import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';

vi.mock('server-only', () => ({}));

import { MONO_BACK_THRESHOLD, monochromeBackForPrint } from '@/lib/id-cards/artwork-boost.server';

async function png(pixels: Array<[number, number, number, number]>): Promise<ArrayBuffer> {
  const raw = Buffer.from(pixels.flat());
  const buf = await sharp(raw, { raw: { width: pixels.length, height: 1, channels: 4 } }).png().toBuffer();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function decode(out: ArrayBuffer) {
  const { data, info } = await sharp(Buffer.from(out)).raw().toBuffer({ resolveWithObject: true });
  const px: number[][] = [];
  for (let i = 0; i < data.length; i += info.channels) px.push([...data.subarray(i, i + info.channels)]);
  return { px, info };
}

describe('monochromeBackForPrint', () => {
  it('leaves only pure black and pure white, in 3-channel RGB', async () => {
    const out = await monochromeBackForPrint(
      await png([
        [0, 0, 0, 255], // black text
        [255, 255, 255, 255], // paper
        [110, 110, 110, 255], // dark grey anti-alias → black
        [200, 200, 200, 255], // light grey anti-alias → white
        [11, 109, 65, 255], // brand green → black (dark)
        [255, 230, 120, 255] // pale yellow → white
      ])
    );
    const { px, info } = await decode(out);
    expect(info.channels).toBe(3);
    expect(px).toEqual([
      [0, 0, 0],
      [255, 255, 255],
      [0, 0, 0],
      [255, 255, 255],
      [0, 0, 0],
      [255, 255, 255]
    ]);
  });

  it('prints transparent areas as white paper, never black', async () => {
    const { px } = await decode(await monochromeBackForPrint(await png([[0, 0, 0, 0]])));
    expect(px).toEqual([[255, 255, 255]]);
  });

  it('cuts a little above mid-grey so thin strokes keep their weight', () => {
    expect(MONO_BACK_THRESHOLD).toBeGreaterThan(128);
    expect(MONO_BACK_THRESHOLD).toBeLessThan(200);
  });

  it('fails soft: bytes that are not an image come back untouched', async () => {
    const junk = new Uint8Array([1, 2, 3, 4]).buffer;
    expect(await monochromeBackForPrint(junk)).toBe(junk);
  });
});
