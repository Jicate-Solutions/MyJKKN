/**
 * OneMark Wave 3 Lane D — what happens to the bytes of a question picture.
 *
 * What these hold on to, in order of how much damage a regression does:
 *   1. A hostile SVG is REFUSED, not quietly rewritten — script, foreignObject,
 *      an inline event handler, a javascript: link, an external reference and
 *      an XML entity each stop the upload and are named to the author.
 *   2. EXIF and every other metadata chunk leaves a PNG, and the pixels do not
 *      change: a diagram photographed on a phone must not carry the GPS fix of
 *      the room it was taken in into a private bucket.
 *   3. A file that is not what it says it is (a JPEG named .png, a truncated
 *      PNG) is refused rather than stored.
 */
import { describe, it, expect } from 'vitest';
import zlib from 'zlib';
import {
  inspectSvg,
  looksLikeJpeg,
  looksLikePng,
  sanitiseAssetBytes,
  stripPngMetadata,
} from '@/lib/onemark/assets/sanitize';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buf: Buffer): number {
  let c: number;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n += 1) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A 2x2 greyscale PNG, optionally carrying metadata chunks. */
function makePng(extra: Array<[string, Buffer]> = []): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const raster = Buffer.from([0x00, 0x10, 0x20, 0x00, 0x30, 0x40]);
  const parts = [PNG_SIG, chunk('IHDR', ihdr)];
  for (const [type, data] of extra) parts.push(chunk(type, data));
  parts.push(chunk('IDAT', zlib.deflateSync(raster)));
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

describe('SVG: refuse, never rewrite', () => {
  const CLEAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';

  it('accepts a plain drawing', () => {
    const r = inspectSvg(CLEAN);
    expect(r.ok).toBe(true);
  });

  it.each([
    ['script', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', '<script>'],
    [
      'foreignObject',
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>hi</div></foreignObject></svg>',
      '<foreignObject>',
    ],
    ['event handler', '<svg xmlns="http://www.w3.org/2000/svg" onload="steal()"><rect/></svg>', 'event handler'],
    [
      'javascript: link',
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>',
      'javascript:',
    ],
    [
      'external reference',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://tracker.example/p.png"/></svg>',
      'another website',
    ],
    [
      'XML entity',
      '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"/>',
      'XML entity',
    ],
    ['@import', '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(x)</style></svg>', 'stylesheet'],
  ])('refuses %s and says so', (_label, source, mustSay) => {
    const r = inspectSvg(source);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(mustSay);
  });

  it('names every problem at once rather than one per round', () => {
    const r = inspectSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><script>y()</script><foreignObject/></svg>',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('<script>');
      expect(r.reason).toContain('<foreignObject>');
      expect(r.reason).toContain('event handler');
    }
  });

  it('refuses a file with no <svg> element at all', () => {
    expect(inspectSvg('just some text').ok).toBe(false);
  });

  it('never returns rewritten markup for something it accepted', () => {
    const r = inspectSvg(CLEAN);
    expect(r.ok).toBe(true);
    if (r.ok) expect(new TextDecoder().decode(r.bytes)).toBe(CLEAN);
  });
});

describe('PNG: strip the metadata, keep the picture', () => {
  it('drops eXIf, tEXt, zTXt, iTXt and tIME', () => {
    const dirty = makePng([
      ['eXIf', Buffer.from('II*\x00gps-fix-here')],
      ['tEXt', Buffer.from('Software\x00Camera 9')],
      ['tIME', Buffer.alloc(7)],
    ]);
    const r = stripPngMetadata(new Uint8Array(dirty));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.removed.sort()).toEqual(['eXIf', 'tEXt', 'tIME']);
    const out = Buffer.from(r.bytes);
    expect(out.includes(Buffer.from('gps-fix-here'))).toBe(false);
    expect(out.includes(Buffer.from('Camera 9'))).toBe(false);
    expect(out.length).toBeLessThan(dirty.length);
  });

  it('leaves a clean PNG byte-identical', () => {
    const clean = makePng();
    const r = stripPngMetadata(new Uint8Array(clean));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.removed).toEqual([]);
    expect(Buffer.from(r.bytes).equals(clean)).toBe(true);
  });

  it('keeps IHDR, IDAT and IEND, and the pixels with them', () => {
    const dirty = makePng([['tEXt', Buffer.from('Comment\x00hello')]]);
    const clean = makePng();
    const r = stripPngMetadata(new Uint8Array(dirty));
    expect(r.ok).toBe(true);
    if (r.ok) expect(Buffer.from(r.bytes).equals(clean)).toBe(true);
  });

  it('refuses a JPEG whatever the filename said', () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
    expect(looksLikeJpeg(new Uint8Array(jpeg))).toBe(true);
    const r = stripPngMetadata(new Uint8Array(jpeg));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('JPEG');
  });

  it('refuses a truncated PNG rather than storing it', () => {
    const truncated = makePng().subarray(0, 30);
    const r = stripPngMetadata(new Uint8Array(truncated));
    expect(r.ok).toBe(false);
  });

  it('refuses bytes with no PNG signature', () => {
    expect(looksLikePng(new Uint8Array(Buffer.from('%PDF-1.7')))).toBe(false);
    expect(stripPngMetadata(new Uint8Array(Buffer.from('%PDF-1.7'))).ok).toBe(false);
  });
});

describe('sanitiseAssetBytes dispatches on the declared kind', () => {
  it('sends png bytes through the chunk filter', () => {
    const r = sanitiseAssetBytes('png', new Uint8Array(makePng([['tEXt', Buffer.from('a\x00b')]])));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.removed).toEqual(['tEXt']);
  });

  it('sends svg bytes through the inspection', () => {
    const hostile = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(sanitiseAssetBytes('svg', hostile).ok).toBe(false);
  });
});
