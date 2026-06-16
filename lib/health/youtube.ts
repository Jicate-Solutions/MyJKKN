// lib/health/youtube.ts
// Shared YouTube-link helpers for Health → Wellness Programs.
// Created: 2026-06-16.
//
// Director directive (2026-06-16): program day videos are YouTube links ONLY —
// no file upload, no Drive/Vimeo. Admins upload to YouTube as **Unlisted** (not
// searchable, but anyone with the link can watch) and paste the link. A URL
// cannot reveal a video's privacy status, so "Unlisted" is enforced by guidance,
// not by API. These helpers replace the two duplicated `toEmbedSrc()` copies that
// lived in the consume page and the public /p/[token] page.

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extract the 11-char YouTube video id from any common link form, else null.
 * Accepts: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed|shorts|live|v/ID,
 * youtube-nocookie.com/embed/ID, or a bare 11-char id. Extra params (list, t, …)
 * are ignored.
 */
export function parseYouTubeId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  if (YT_ID.test(s)) return s; // bare id pasted directly

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }

  const host = u.hostname
    .replace(/^www\./, '')
    .replace(/^m\./, '')
    .toLowerCase();

  if (host === 'youtu.be') {
    const id = u.pathname.split('/').filter(Boolean)[0] ?? '';
    return YT_ID.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    if (v && YT_ID.test(v)) return v;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
      return YT_ID.test(parts[1]) ? parts[1] : null;
    }
  }

  return null;
}

/** True when `raw` is a YouTube link we can extract a playable video id from. */
export function isYouTubeUrl(raw: string | null | undefined): boolean {
  return parseYouTubeId(raw) !== null;
}

/**
 * Privacy-enhanced embeddable src for a YouTube link, or null if not parseable.
 * Uses youtube-nocookie.com so tracking is deferred until the viewer plays.
 */
export function toYouTubeEmbed(raw: string | null | undefined): string | null {
  const id = parseYouTubeId(raw);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}
