// lib/id-cards/barcode.ts
// Dependency-free Code 39 barcode encoder → SVG → data URL.
//
// Why Code 39: it is the symbology on the institution's existing physical
// card backs, every laser scanner reads it out of the box, and it encodes
// exactly the payloads we print (learner roll numbers / team-member id
// codes) without a checksum requirement. No npm package needed — the whole
// symbology is a 44-entry width table.
//
// Encoding model (standard Code 39):
//   • Each character is 9 elements — 5 bars and 4 spaces, interleaved
//     bar-first — of which exactly 3 are wide (except the $/%,+,/ symbol
//     class, which this module does not expose).
//   • Narrow:wide ratio is 1:3 (the spec allows 1:2..1:3; 3 is the most
//     scanner-tolerant and matches the physical cards).
//   • The value is framed by start/stop asterisks; characters are separated
//     by one narrow inter-character gap; a 10-narrow-module quiet zone pads
//     both ends.
//
// The public surface is pure and synchronous (no I/O, no randomness), so it
// is fully unit-testable and safe to call inside the render route.

export type Code39Options = {
  /** Bar height in px (default 100, clamped 20–400). */
  height?: number;
  /** Narrow-module width in px (default 2, clamped 1–10). */
  scale?: number;
  /**
   * Render the human-readable value beneath the bars inside the SVG
   * (default true). The card compositor passes false and draws the value
   * with satori text instead — resvg (which rasterizes embedded SVGs inside
   * next/og) has no font database, so an SVG <text> node is not guaranteed
   * to render there. Any non-satori consumer should keep the default.
   */
  showText?: boolean;
};

/**
 * Character → 9-element width pattern ('n' narrow / 'w' wide), elements
 * interleaved bar,space,bar,… starting and ending with a bar.
 * Verified against the standard Code 39 table (bars/spaces wide-bit form).
 */
export const CODE39_PATTERNS: Record<string, string> = {
  '0': 'nnnwwnwnn',
  '1': 'wnnwnnnnw',
  '2': 'nnwwnnnnw',
  '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn',
  '6': 'nnwwwnnnn',
  '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn',
  '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw',
  B: 'nnwnnwnnw',
  C: 'wnwnnwnnn',
  D: 'nnnnwwnnw',
  E: 'wnnnwwnnn',
  F: 'nnwnwwnnn',
  G: 'nnnnnwwnw',
  H: 'wnnnnwwnn',
  I: 'nnwnnwwnn',
  J: 'nnnnwwwnn',
  K: 'wnnnnnnww',
  L: 'nnwnnnnww',
  M: 'wnwnnnnwn',
  N: 'nnnnwnnww',
  O: 'wnnnwnnwn',
  P: 'nnwnwnnwn',
  Q: 'nnnnnnwww',
  R: 'wnnnnnwwn',
  S: 'nnwnnnwwn',
  T: 'nnnnwnwwn',
  U: 'wwnnnnnnw',
  V: 'nwwnnnnnw',
  W: 'wwwnnnnnn',
  X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn',
  Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw',
  '.': 'wwnnnnwnn',
  ' ': 'nwwnnnwnn',
  '*': 'nwnnwnwnn'
};

/** Start/stop framing character (never valid inside a value). */
export const CODE39_START_STOP = '*';

/** Longest accepted payload — roll numbers / id codes are far shorter. */
export const CODE39_MAX_LENGTH = 32;

/**
 * Uppercase + trim the value and verify every character is encodable
 * (A–Z, 0–9, dash, dot, space). Returns null for empty, over-long or
 * unencodable input — callers fail-soft (card renders without a barcode).
 */
export function normalizeCode39Value(value: string | null | undefined): string | null {
  const normalized = (value ?? '').trim().toUpperCase();
  if (normalized === '' || normalized.length > CODE39_MAX_LENGTH) return null;
  for (const char of normalized) {
    if (char === CODE39_START_STOP || CODE39_PATTERNS[char] === undefined) return null;
  }
  return normalized;
}

/**
 * Width patterns for the framed value: ['*', …value chars…, '*'].
 * Returns null when the value cannot be encoded.
 */
export function encodeCode39(value: string | null | undefined): string[] | null {
  const normalized = normalizeCode39Value(value);
  if (normalized === null) return null;
  const chars = [CODE39_START_STOP, ...normalized, CODE39_START_STOP];
  return chars.map((c) => CODE39_PATTERNS[c]);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

/**
 * Full barcode as `data:image/svg+xml;base64,…`, or null when the value is
 * not encodable. White background, black bars, optional human-readable line
 * beneath the bars (see Code39Options.showText).
 *
 * The value alphabet (A–Z 0–9 - . space) contains no XML metacharacters,
 * so the SVG needs no escaping.
 */
export function makeCode39SvgDataUrl(
  value: string | null | undefined,
  options: Code39Options = {}
): string | null {
  const normalized = normalizeCode39Value(value);
  if (normalized === null) return null;
  const patterns = encodeCode39(normalized);
  if (patterns === null) return null;

  const barHeight = clampInt(options.height ?? 100, 20, 400);
  const narrow = clampInt(options.scale ?? 2, 1, 10);
  const showText = options.showText ?? true;
  const wide = narrow * 3;
  const gap = narrow;
  const quiet = narrow * 10;

  const bars: string[] = [];
  let x = quiet;
  patterns.forEach((pattern, charIndex) => {
    for (let i = 0; i < pattern.length; i += 1) {
      const width = pattern[i] === 'w' ? wide : narrow;
      // Even indexes are bars, odd indexes are spaces.
      if (i % 2 === 0) {
        bars.push(`<rect x="${x}" y="0" width="${width}" height="${barHeight}" fill="#000000"/>`);
      }
      x += width;
    }
    if (charIndex < patterns.length - 1) x += gap;
  });
  const totalWidth = x + quiet;

  const fontSize = Math.max(12, narrow * 7);
  const textPad = Math.round(fontSize * 0.4);
  const totalHeight = showText ? barHeight + textPad + fontSize : barHeight;
  const text = showText
    ? `<text x="${totalWidth / 2}" y="${barHeight + textPad + fontSize - 2}" ` +
      `text-anchor="middle" font-family="monospace" font-size="${fontSize}" ` +
      `letter-spacing="${Math.round(narrow * 1.5)}" fill="#000000">${normalized}</text>`
    : '';

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" ` +
    `viewBox="0 0 ${totalWidth} ${totalHeight}">` +
    `<rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="#ffffff"/>` +
    bars.join('') +
    text +
    `</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}
