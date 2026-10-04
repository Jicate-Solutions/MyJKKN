/**
 * Turn a stored `bug_reports.page_url` into a link we are willing to render.
 *
 * WHY THIS EXISTS. `page_url` is written by the browser from
 * `window.location.href` and stored raw, so it is UNTRUSTED input. A live audit
 * of the column found four different origins (www.jkkn.ai, my.jkkn.ac.in,
 * myadmin.jkkn.ac.in, localhost:3000). Linking the stored value as-is would be
 * an open redirect — a crafted report could aim the link anywhere — and would
 * also hand hundreds of reporters a link to a host that no longer serves them.
 *
 * THE RULE: the origin is DISCARDED, always. We keep pathname + search only and
 * return a same-origin RELATIVE href, so the link can never leave this app no
 * matter what was stored.
 *
 * Pure function, no I/O — safe to call on the server or the client.
 */

/** Parsed against a base so relative values work; the base is never returned. */
const PARSE_BASE = 'https://placeholder.invalid';

/**
 * A leading `//` (or `\\`, which WHATWG normalises to `//`) makes a href
 * protocol-relative: the browser reads what follows as a HOST. `new URL()`
 * resolves such a string against our base and hands back an innocent-looking
 * pathname, so this has to be caught on the RAW string, before parsing.
 */
const PROTOCOL_RELATIVE = /^[/\\]{2}/;

/**
 * Build a same-origin relative href from an untrusted stored page URL.
 *
 * Returns `null` — meaning "render no link" — when the value cannot be reduced
 * to a safe in-app path, or when the path carries no information (a bare `/`).
 */
export function safeReportHref(pageUrl: string | null): string | null {
  if (!pageUrl) return null;

  const raw = pageUrl.trim();
  if (!raw) return null;

  // Protocol-relative: `//evil.example.com/x` would navigate off-origin.
  if (PROTOCOL_RELATIVE.test(raw)) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw, PARSE_BASE);
  } catch {
    return null;
  }

  // Only real web pages. Kills javascript:, data:, vbscript:, mailto:, …
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const pathname = parsed.pathname;

  // A path must be absolute, and must not itself be protocol-relative:
  // `https://x.com//evil` parses to the pathname `//evil`, which as a bare
  // href is once again a host, not a path.
  if (!pathname.startsWith('/')) return null;
  if (pathname.startsWith('//')) return null;

  // Drop the cache-buster the app appends (`?v=1775003469061`) and any param
  // left with an empty value — neither helps the reporter recognise the page,
  // and a stale buster just looks like noise.
  const kept = new URLSearchParams();
  new URLSearchParams(parsed.search).forEach((value, key) => {
    if (value === '') return;
    if (key === 'v' && /^\d+$/.test(value)) return;
    kept.append(key, value);
  });
  const search = kept.toString();

  // The fragment is deliberately dropped: it is never load-bearing here.
  if (pathname === '/' && !search) return null;

  return search ? `${pathname}?${search}` : pathname;
}
