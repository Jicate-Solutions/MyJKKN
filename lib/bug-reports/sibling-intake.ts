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
 * (POST to file a bug; GET for the widget's "My bugs" drawer, which still
 * preflights because of the custom header). lib/api-keys/cors.ts does not
 * allow X-API-Key, so the preflight would fail with it. No credentials: the
 * SDK sends none.
 */
export const intakeCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

/** Escape LIKE wildcards so an email is matched literally (case-insensitive). */
export function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ── The reporter's read routes (the widget's "My bugs" drawer) ──────────────
//
// The key is public and the reporter's email is a claim (the POST stores
// metadata.reporter_verified = false on every sibling row). So these routes
// always answer with the MINIMAL view of a bug: what the reporter already
// typed, its status and its dates. Never the screenshot, console logs,
// network trace, browser details, reporter email/name or MyJKKN profile id,
// institution/department, or anything the team wrote internally.

/** Every status bug_reports allows (bug_reports_status_check). */
export const BUG_STATUSES = ['new', 'seen', 'in_progress', 'resolved', 'wont_fix', 'duplicate'] as const;

/** Sort fields the central reporter's /me accepts, all real columns here. */
export const SORTABLE_FIELDS = ['created_at', 'resolved_at', 'status'] as const;

/** Longest description or title excerpt a read returns. */
export const EXCERPT_CHARS = 200;

/**
 * Columns a read selects. Title and source app are pulled out of metadata by
 * PostgREST so the rest of metadata (client details, network trace, the
 * reporter's email) never leaves the database.
 */
export const REPORTER_BUG_SELECT =
  'id, display_id, status, category, description, created_at, updated_at, resolved_at, ' +
  'title:metadata->>title, source_app:metadata->>source_app';

/** Same normalisation the POST applies before storing metadata.reporter_email. */
export function normalizeReporterEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A bug id that is not a UUID can only be "not found" (and must not 500). */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function excerpt(value: unknown, max = EXCERPT_CHARS): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * The only shape a bug ever leaves these routes in. `metadata.title` is where
 * the SDK's MyBugsPanel reads the title from.
 */
export function minimalBug(row: Record<string, unknown>) {
  return {
    id: row.id ?? null,
    display_id: row.display_id ?? null,
    status: row.status ?? null,
    category: row.category ?? null,
    description: excerpt(row.description),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    resolved_at: row.resolved_at ?? null,
    metadata: { title: excerpt(row.title), source_app: row.source_app ?? null },
  };
}

/**
 * Search text made safe for a PostgREST or() logic tree, as the central
 * reporter does it: quotes, backslashes, wildcards, commas and brackets go.
 */
export function sanitizeSearch(search: string | null): string {
  return (search ?? '').replace(/["\\%*,()]/g, '').trim().slice(0, 100);
}
