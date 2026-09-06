// lib/media/youtube.ts
// Shared YouTube-link helpers. Domain-neutral home for logic that started in
// Health → Wellness Programs (lib/health/youtube.ts, 2026-06-16) and now has a
// second consumer in Notifications (YouTube link-preview cards, 2026-08-13).
//
// The parsing below is a verbatim move — no behaviour change — because
// lib/health/youtube.ts was itself created to kill two duplicated `toEmbedSrc()`
// copies, and importing across domains would have re-created that smell in a new
// shape. lib/health/youtube.ts is now a pure re-export of this file, so every
// existing Health call site keeps working untouched.
//
// Director directive still in force for Health (2026-06-16): program day videos
// are YouTube links ONLY. A URL cannot reveal a video's privacy status, so
// "Unlisted" is enforced by guidance, not by API.

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

/**
 * Poster image for a video id. Derived purely from the id — no network call and
 * no API key — so a preview card can still render when oEmbed lookup fails.
 */
export function youTubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/** Canonical watch page for a video id. */
export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * oEmbed lookup URL for a video id, built against a hard-coded youtube.com
 * origin.
 *
 * This exists so the server route never has to interpolate a caller-supplied
 * string into a fetch target. Pass it the output of `parseYouTubeId` and the
 * resulting URL is, by construction, a youtube.com address — which is the whole
 * SSRF defence. Callers must not pass unvalidated input.
 */
export function buildYouTubeOEmbedUrl(videoId: string): string {
  const watchUrl = youTubeWatchUrl(videoId);
  return `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
}
