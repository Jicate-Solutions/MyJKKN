// File: lib/onemark/assets/sanitize.ts
//
// OneMark Wave 3 Lane D — what happens to the bytes of a question picture
// between the author's file picker and the private bucket.
//
// Two jobs, both done here so the route stays a thin gate and so a test can
// exercise them without a network or a database:
//
//   1. STRIP EXIF from a PNG. A circuit diagram photographed on a phone and
//      exported as PNG can still carry an `eXIf` chunk with the GPS fix of the
//      staff room it was taken in. Every metadata chunk is dropped and the
//      pixels are left byte-identical — PNG chunks are self-delimiting and
//      carry their own CRC, so removing whole chunks needs no re-encoding and
//      cannot corrupt the image. (No `sharp` in this repo; a re-encode would
//      be a new dependency for a job that is a byte filter.)
//
//   2. REFUSE a hostile SVG rather than rewrite one. An SVG is a document: it
//      can carry <script>, an inline event handler, a <foreignObject> full of
//      HTML, an external <use>/<image> reference that phones home with the
//      viewer's IP, or an XML entity that reads a file off the server. A
//      sanitiser that strips those silently hands the author back a diagram
//      that is no longer the diagram they drew. We say no, and name what we
//      found, so they can re-export it. (Spec Lane D item 4 flags this as
//      [risky]: rejecting is the choice made here.)
//
// Nothing in this file touches Supabase, React or Next — it is pure bytes in,
// bytes or a refusal out.

export interface SanitiseFailure {
  ok: false;
  /** Shown to the author, verbatim. Says what was found, not "invalid file". */
  reason: string;
}

export interface SanitiseSuccess {
  ok: true;
  bytes: Uint8Array;
  /** Metadata chunks / constructs removed, for the route's log line. */
  removed: string[];
}

export type SanitiseResult = SanitiseSuccess | SanitiseFailure;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** PNG chunks that carry authored metadata rather than picture. `eXIf` is the
 *  EXIF block itself; the text chunks routinely carry camera, software, and
 *  in some exporters the full original file path. */
const PNG_METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

export function looksLikePng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

export function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * Rewrite a PNG without its metadata chunks.
 *
 * Returns a failure when the bytes are not a PNG at all (a JPEG or a PDF
 * renamed to .png reaches here) or when the chunk table does not walk cleanly
 * to IEND — a truncated or crafted file is refused rather than stored.
 */
export function stripPngMetadata(bytes: Uint8Array): SanitiseResult {
  if (looksLikeJpeg(bytes)) {
    return {
      ok: false,
      reason:
        'That file is a JPEG, whatever its name says. Export the diagram as PNG or SVG and attach it again.',
    };
  }
  if (!looksLikePng(bytes)) {
    return { ok: false, reason: 'That file is not a PNG image — the PNG signature is missing.' };
  }

  const out: Uint8Array[] = [bytes.subarray(0, 8)];
  const removed: string[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let sawIend = false;

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    // 4 length + 4 type + data + 4 CRC
    const end = offset + 12 + length;
    if (length > bytes.length || end > bytes.length) {
      return { ok: false, reason: 'That PNG is truncated or malformed — its chunk table does not add up.' };
    }
    let type = '';
    for (let i = 0; i < 4; i += 1) type += String.fromCharCode(bytes[offset + 4 + i]);

    if (PNG_METADATA_CHUNKS.has(type)) {
      removed.push(type);
    } else {
      out.push(bytes.subarray(offset, end));
    }
    offset = end;
    if (type === 'IEND') {
      sawIend = true;
      break;
    }
  }

  if (!sawIend) {
    return { ok: false, reason: 'That PNG is truncated — it has no end-of-image marker.' };
  }

  let total = 0;
  for (const part of out) total += part.length;
  const merged = new Uint8Array(total);
  let cursor = 0;
  for (const part of out) {
    merged.set(part, cursor);
    cursor += part.length;
  }
  return { ok: true, bytes: merged, removed };
}

/** One hostile construct an SVG may carry, and the sentence the author reads. */
interface SvgRule {
  label: string;
  test: RegExp;
  reason: string;
}

const SVG_RULES: SvgRule[] = [
  {
    label: 'script',
    test: /<\s*script[\s>/]/i,
    reason: 'that SVG contains a <script> element',
  },
  {
    label: 'foreignObject',
    test: /<\s*foreignObject[\s>/]/i,
    reason: 'that SVG contains a <foreignObject> element',
  },
  {
    label: 'event handler',
    // on… attributes: onload=, onclick=, onmouseover=… (quoted or bare)
    test: /\son[a-z]+\s*=\s*["'a-z0-9]/i,
    reason: 'that SVG carries an inline event handler (an on… attribute)',
  },
  {
    label: 'javascript: URI',
    test: /(?:href|src|xlink:href)\s*=\s*["']?\s*javascript:/i,
    reason: 'that SVG carries a javascript: link',
  },
  {
    label: 'external reference',
    // A remote <image>, <use> or anything else pulling bytes at view time
    // would leak the reader's IP to a third party and can change after review.
    test: /(?:href|src|xlink:href)\s*=\s*["']?\s*(?:https?:)?\/\//i,
    reason: 'that SVG loads something from another website',
  },
  {
    label: 'XML entity',
    test: /<!\s*(?:ENTITY|DOCTYPE)[^>]*(?:SYSTEM|PUBLIC|ENTITY)/i,
    reason: 'that SVG declares an XML entity, which can be used to read files off the server',
  },
  {
    label: 'embedded stylesheet import',
    test: /@import\b/i,
    reason: 'that SVG imports a stylesheet',
  },
];

/**
 * An SVG passes only if it is a picture. Every rule that fires is named, so an
 * author fixing an export sees all of it at once, not one refusal per round.
 */
export function inspectSvg(source: string): SanitiseResult {
  const text = source ?? '';
  if (!/<\s*svg[\s>]/i.test(text)) {
    return { ok: false, reason: 'That file does not contain an <svg> element.' };
  }
  const hits = SVG_RULES.filter((r) => r.test.test(text));
  if (hits.length > 0) {
    const reasons = hits.map((h) => h.reason);
    const list =
      reasons.length === 1
        ? reasons[0]
        : `${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}`;
    return {
      ok: false,
      reason: `Cannot attach this drawing: ${list}. Re-export it as a plain SVG (or a PNG) and try again — we do not edit a diagram to make it safe.`,
    };
  }
  return { ok: true, bytes: new TextEncoder().encode(text), removed: [] };
}

/** Route-level entry point: sanitise by declared kind. */
export function sanitiseAssetBytes(kind: 'png' | 'svg', bytes: Uint8Array): SanitiseResult {
  if (kind === 'png') return stripPngMetadata(bytes);
  return inspectSvg(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
}
