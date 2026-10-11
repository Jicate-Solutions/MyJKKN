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
  if (buffer.length > MAX_SCREENSHOT_BYTES) return 'too_large';
  return { buffer, contentType: contentType === 'image/jpg' ? 'image/jpeg' : contentType, ext };
}

/** The POST's normalisation before storing metadata.reporter_email. */
export function normalizeReporterEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}
