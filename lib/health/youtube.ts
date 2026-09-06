// lib/health/youtube.ts
// Shared YouTube-link helpers for Health → Wellness Programs.
// Created: 2026-06-16. Moved to lib/media/youtube.ts on 2026-08-13.
//
// Director directive (2026-06-16): program day videos are YouTube links ONLY —
// no file upload, no Drive/Vimeo. Admins upload to YouTube as **Unlisted** (not
// searchable, but anyone with the link can watch) and paste the link. A URL
// cannot reveal a video's privacy status, so "Unlisted" is enforced by guidance,
// not by API. These helpers replaced the two duplicated `toEmbedSrc()` copies
// that lived in the consume page and the public /p/[token] page.
//
// 2026-08-13: Notifications became a second consumer (YouTube link-preview
// cards), so the implementation moved to the domain-neutral lib/media/youtube.ts
// rather than being imported across domains. This file is now a pure re-export —
// the three Health call sites (day-editor, /health/programs/[slug], /p/[token])
// are unchanged, and this module's public API is unchanged.

export {
  parseYouTubeId,
  isYouTubeUrl,
  toYouTubeEmbed
} from '@/lib/media/youtube';
