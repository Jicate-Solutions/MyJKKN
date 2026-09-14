/**
 * Online Meetings — meeting-link validation.
 *
 * WHY THIS EXISTS
 *   `online_meetings.meet_url` is free text typed by a host and then rendered
 *   into an `<a href>` for EVERY participant, including external guests on the
 *   public /join/[token] page. React does not sanitise href, so a host who
 *   stored `javascript:...` would have had it execute in the session of every
 *   colleague and every outside guest who clicked "Open the video call".
 *
 *   That is a stored cross-site-scripting hole with an unusually wide blast
 *   radius, because 78 of 104 active roles can create a meeting and the link
 *   reaches unauthenticated visitors. Found by review before anyone used it.
 *
 * WHY http AND https ONLY
 *   Every real meeting link is a web URL: Teams (`https://teams.microsoft.com/l/…`),
 *   Google Meet, Zoom, Jitsi. Application deep-link schemes such as `msteams://`
 *   or `zoommtg://` are not script vectors in themselves, but allowing an
 *   open-ended scheme list is how the hole reopens. If a deep link is ever
 *   genuinely needed, add that one scheme here deliberately.
 *
 * BOTH ENDS, ALWAYS
 *   Validated on write so a bad value never reaches the database, and again on
 *   render so a row written by any other path — a migration, a script, a future
 *   importer, an older row — still cannot execute. Client-safe on purpose: no
 *   server imports, so the live console and the guest page can both use it.
 */

/** Schemes a meeting link may use. Deliberately short. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * True when `value` is a URL safe to place in an href.
 *
 * Uses the URL parser rather than a regular expression, because the parser is
 * what the browser will use. A pattern test can be walked past with leading
 * whitespace, control characters, or `java\tscript:`; the parser normalises all
 * of that before reporting the protocol.
 */
export function isSafeMeetingUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    return ALLOWED_PROTOCOLS.has(new URL(trimmed).protocol);
  } catch {
    // Not an absolute URL at all. A relative link is meaningless for a meeting
    // and would resolve against MyJKKN's own origin, so it is refused too.
    return false;
  }
}

/**
 * The value to put in an href: the URL when it is safe, otherwise null.
 *
 * Callers render a plain, non-clickable string when this returns null, so a
 * bad row is visible and inert rather than hidden or dangerous.
 */
export function safeMeetingHref(value: unknown): string | null {
  return isSafeMeetingUrl(value) ? value.trim() : null;
}

/** The message a host sees when their link is refused. */
export const MEETING_URL_ERROR =
  'That does not look like a meeting link. Paste the full web address, starting with https://';
