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
 * value still has to look like one of ours. Every one of the stored values is a
 * Supabase public-object URL, so that shape is the allowlist: anything else
 * simply renders no image, which is a harmless outcome.
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

  return raw;
}
