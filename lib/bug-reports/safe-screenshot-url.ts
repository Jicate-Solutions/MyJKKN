/**
 * Vet a stored `bug_reports.screenshot_url` before it becomes a link target.
 *
 * WHY. The prompt card now renders the reporter's screenshot AND makes it
 * tappable, so the stored string ends up in an `<a href>`, not only an
 * `<img src>`. That promotes a column we do not control into a navigation
 * target, and `javascript:` in a href executes where the same value in an img
 * src would merely fail to load.
 *
 * The bucket URLs are public by design (buckets `bug-screenshots` and
 * `bug-reports` are public=true), so no signed-URL work is needed — but the
 * value still has to be one of OURS.
 *
 * The path shape alone is not an allowlist. `/storage/v1/object/public/` can be
 * served by any host, so a value like
 * `https://evil.example.com/storage/v1/object/public/a.png` satisfies it, and so
 * does `https://xyz.supabase.co.evil.com/...` — the suffix only LOOKS like ours.
 * The origin is therefore pinned to the configured Supabase project, and an
 * unset or unparseable NEXT_PUBLIC_SUPABASE_URL rejects everything rather than
 * falling open. Rejection renders no image, which is a harmless outcome.
 *
 * Not exploitable today — screenshot_url is always server-derived from
 * getPublicUrl() and /mine returns only the viewer's own rows — so this is
 * depth, not a live hole. It is here because THIS change is what promotes the
 * value from an `<img src>` into an `<a href>`.
 *
 * Pure function, no I/O.
 */

/** The public-object path every Supabase storage URL carries. */
const PUBLIC_OBJECT_PATH = '/storage/v1/object/public/';

/**
 * Return the URL unchanged when it is safe to render and link, else `null`.
 */
export function safeScreenshotUrl(screenshotUrl: string | null): string | null {
  if (!screenshotUrl) return null;

  const raw = screenshotUrl.trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    // No base: a screenshot URL is always absolute. A relative value parses as
    // a throw here, which is exactly the rejection we want.
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.pathname.includes(PUBLIC_OBJECT_PATH)) return null;

  // Pin to our own project. Compared as a parsed origin, never a string suffix:
  // `xyz.supabase.co.evil.com` ends with nothing we trust once parsed.
  const expected = supabaseOrigin();
  if (!expected || parsed.origin !== expected) return null;

  return raw;
}

/** The configured Supabase origin, or null when it is absent or unparseable. */
function supabaseOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured) return null;
  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}
