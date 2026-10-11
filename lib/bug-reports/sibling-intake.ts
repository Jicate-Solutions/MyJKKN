/**
 * Pure helpers for the college-app bug intake (app/api/v1/public/bug-reports).
 * Kept out of route.ts because a Next.js route file may export only handlers.
 */

/** Same bucket and path shape as the signed-in intake (app/api/bug-reports). */
export const BUG_REPORTS_BUCKET = 'bug-reports';

/**
 * Largest screenshot accepted, in decoded bytes. Vercel refuses a function
 * request body over 4.5 MB before it reaches us; base64 adds a third, so 3 MB
 * of image is about 4 MB on the wire and leaves room for logs.
 */
export const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;

/** Whole request body cap, in characters (the JSON body is ASCII). */
export const MAX_BODY_CHARS = 4_500_000;

const SCREENSHOT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

/**
 * CORS for a browser request from another origin with the X-API-Key header
 * (POST to file a bug; the custom header makes the browser preflight it).
 * Submit-only: there are no read routes for this key. lib/api-keys/cors.ts does not
 * allow X-API-Key, so the preflight would fail with it. No credentials: the
 * SDK sends none.
 */
export const intakeCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, x-api-key',
  'Access-Control-Max-Age': '86400',
};

/** PNG, JPEG and WebP file signatures, checked against the decoded bytes. */
export function hasImageSignature(buf: Buffer, contentType: string): boolean {
  const at = (offset: number, bytes: number[]) => bytes.every((b, i) => buf[offset + i] === b);
  if (contentType === 'image/png') return at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') return at(0, [0xff, 0xd8, 0xff]);
  if (contentType === 'image/webp') return at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50]);
  return false;
}

export type DecodedScreenshot = { buffer: Buffer; contentType: string; ext: string };

/**
 * Decode a `data:image/...;base64,...` URL. Returns 'too_large' without
 * decoding when the base64 length already proves it is over the cap.
 */
export function decodeScreenshot(dataUrl: string): DecodedScreenshot | 'invalid' | 'too_large' {
  const comma = dataUrl.indexOf(',');
  if (comma < 0 || comma > 100) return 'invalid';
  const header = dataUrl.slice(0, comma).toLowerCase();
  const match = /^data:(image\/[a-z]+);base64$/.exec(header);
  if (!match) return 'invalid';
  const contentType = match[1];
  const ext = SCREENSHOT_TYPES[contentType];
  if (!ext) return 'invalid';

  const b64 = dataUrl.slice(comma + 1);
  // 4 base64 characters carry 3 bytes; checked before decoding anything.
  if (Math.floor((b64.length * 3) / 4) - 2 > MAX_SCREENSHOT_BYTES) return 'too_large';
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return 'invalid';

  const buffer = Buffer.from(b64, 'base64');
  if (buffer.length === 0) return 'invalid';
  // The bytes must really be the declared image type, not anything with an
  // image header in front of it.
  if (!hasImageSignature(buffer, contentType)) return 'invalid';
  if (buffer.length > MAX_SCREENSHOT_BYTES) return 'too_large';
  return { buffer, contentType: contentType === 'image/jpg' ? 'image/jpeg' : contentType, ext };
}

/** The POST's normalisation before storing metadata.reporter_email. */
export function normalizeReporterEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/** An IPv6 address as its 8 groups, or null if it is not one. */
function ipv6Groups(address: string): number[] | null {
  let text = address;
  // A dotted IPv4 tail (::ffff:203.0.113.9) becomes its two hex groups.
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    const octets = tail.split('.').map((o) => (/^\d{1,3}$/.test(o) ? Number(o) : NaN));
    if (octets.length !== 4 || octets.some((o) => !(o >= 0 && o <= 255))) return null;
    const hex = (hi: number, lo: number) => ((hi << 8) | lo).toString(16);
    text = `${text.slice(0, lastColon + 1)}${hex(octets[0], octets[1])}:${hex(octets[2], octets[3])}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/**
 * The caller key for the intake's rate limit, caps and double-submit guard.
 * IPv4 as is. An IPv4-mapped IPv6 address (::ffff:a.b.c.d) is that IPv4
 * address. Any other IPv6 address is its /64, fully expanded with leading
 * zeros dropped, because one host can rotate freely inside its /64. Shared by
 * the in-memory limiter (sibling-intake-auth.ts) and the database caps
 * (route.ts), so both see the same caller.
 */
export function callerKeyFromIp(ip: string): string {
  const address = ip.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (!address.includes(':')) return address;
  const groups = ipv6Groups(address);
  // Not a parseable address: keep it whole rather than merge it with others.
  if (!groups) return `raw:${address}`;
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join('.');
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
}

/** Size of a value as stored: the UTF-8 bytes of its JSON (an upper bound). */
export function jsonBytes(value: unknown): number {
  if (value === undefined) return 0;
  return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
}

/** The value if its JSON fits in maxBytes, else null. */
export function boundedJson<T>(value: T, maxBytes: number): T | null {
  if (value === undefined || value === null) return null;
  return jsonBytes(value) <= maxBytes ? value : null;
}

/**
 * The newest entries of a log array whose JSON fits in maxBytes together
 * (oldest dropped first; an entry too big on its own is dropped). Null if
 * nothing fits or there was nothing.
 */
export function newestEntriesWithin(entries: unknown[] | null | undefined, maxBytes: number): unknown[] | null {
  if (!entries || entries.length === 0) return null;
  const kept: unknown[] = [];
  let used = 2; // the brackets
  for (let i = entries.length - 1; i >= 0; i--) {
    const entryBytes = jsonBytes(entries[i] ?? null);
    if (entryBytes + 2 > maxBytes) continue; // too big on its own
    const size = entryBytes + (kept.length > 0 ? 1 : 0); // comma
    if (used + size > maxBytes) break;
    used += size;
    kept.unshift(entries[i]);
  }
  return kept.length > 0 ? kept : null;
}
