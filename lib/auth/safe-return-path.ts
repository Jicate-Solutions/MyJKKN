/**
 * Where to send someone after they sign in, taken from a query value
 * (`redirectedFrom` on /auth/login, `next` on /auth/callback and
 * /auth/complete-profile).
 *
 * The value comes from the URL, so anyone can write it. It is accepted only
 * when it is a path on THIS site: one leading '/', never '//' or '/\' (both are
 * read by browsers as "another host"), no backslash, no scheme, no encoded
 * slash or backslash, no whitespace or control characters. Anything else
 * returns null and the caller keeps its normal landing page.
 *
 * Auth pages and the error page are refused too, so a return path can never
 * loop someone back into sign-in.
 *
 * Returns the value unchanged when it passes, so a query string and '#'
 * travel with it (proxy.ts stores path + search).
 */
const PROBE_ORIGIN = 'https://return-path.invalid';

const REFUSED_PREFIXES = ['/auth/login', '/auth/callback', '/error'];

export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;
  // Whitespace and control characters: browsers strip some of them before
  // parsing, which is how '/\t/evil.com' becomes '//evil.com'.
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f || /\s/.test(raw[i])) return null;
  }
  if (raw[0] !== '/') return null;
  if (raw[1] === '/' || raw[1] === '\\') return null;
  if (raw.includes('\\')) return null;
  // The value arrives already decoded once; an encoded slash or backslash
  // here means it was encoded twice to slip past the checks above.
  if (/%(2f|5c)/i.test(raw)) return null;
  if (raw.includes('__nextjs_original-stack-frames')) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (parsed.origin !== PROBE_ORIGIN) return null;

  const path = parsed.pathname;
  for (const refused of REFUSED_PREFIXES) {
    if (path === refused || path.startsWith(`${refused}/`)) return null;
  }

  return raw;
}
