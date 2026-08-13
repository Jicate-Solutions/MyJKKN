import { describe, it, expect } from 'vitest';
import * as media from '@/lib/media/youtube';
import * as health from '@/lib/health/youtube';

// ---------------------------------------------------------------------------
// lib/health/youtube.ts's parsing moved verbatim to lib/media/youtube.ts on
// 2026-08-13 when Notifications became a second consumer, and lib/health became
// a pure re-export. Two things must hold and neither is obvious from the diff:
//
//   1. parseYouTubeId still answers identically for every link form Health
//      relies on (day-editor, /health/programs/[slug], /p/[token]).
//   2. lib/health/youtube.ts keeps its exact public API — the three Health call
//      sites import from it by name and were deliberately left untouched.
// ---------------------------------------------------------------------------

const ID = '1LbkGBuCmpA'; // the Director's reference video
const ALT = 'dQw4w9WgXcQ';

const PARSE_CASES: Array<[string, string | null]> = [
  // Every form the original doc comment promised.
  ['https://www.youtube.com/watch?v=1LbkGBuCmpA', ID],
  ['https://youtube.com/watch?v=1LbkGBuCmpA', ID],
  ['https://m.youtube.com/watch?v=1LbkGBuCmpA', ID],
  ['https://youtu.be/1LbkGBuCmpA', ID],
  ['https://www.youtube.com/embed/1LbkGBuCmpA', ID],
  ['https://www.youtube.com/shorts/1LbkGBuCmpA', ID],
  ['https://www.youtube.com/live/1LbkGBuCmpA', ID],
  ['https://www.youtube.com/v/1LbkGBuCmpA', ID],
  ['https://www.youtube-nocookie.com/embed/1LbkGBuCmpA', ID],
  ['1LbkGBuCmpA', ID], // bare id
  ['  1LbkGBuCmpA  ', ID], // trimmed
  // Extra params are ignored, not treated as part of the id.
  ['https://www.youtube.com/watch?v=1LbkGBuCmpA&t=30s', ID],
  ['https://www.youtube.com/watch?v=1LbkGBuCmpA&list=PLabc123', ID],
  ['https://youtu.be/1LbkGBuCmpA?t=42', ID],
  // Rejections.
  ['', null],
  ['   ', null],
  ['not a url at all', null],
  ['https://vimeo.com/123456789', null],
  ['https://example.com/watch?v=1LbkGBuCmpA', null],
  ['https://www.youtube.com/', null],
  ['https://www.youtube.com/watch?v=tooshort', null],
  ['https://www.youtube.com/watch?v=waaaaaaaaytoolong', null],
  ['https://youtu.be/', null],
  ['https://www.youtube.com/embed/', null],
  ['https://www.youtube.com/results?search_query=jkkn', null]
];

describe('lib/media/youtube — parseYouTubeId', () => {
  it.each(PARSE_CASES)('parses %j → %j', (input, expected) => {
    expect(media.parseYouTubeId(input)).toBe(expected);
  });

  it('handles null/undefined without throwing', () => {
    expect(media.parseYouTubeId(null)).toBeNull();
    expect(media.parseYouTubeId(undefined)).toBeNull();
  });
});

describe('lib/health/youtube — behaviour after the move', () => {
  // The regression that matters: Health's three call sites must not change
  // answer for ANY input. Comparing the two modules case-by-case is stronger
  // than asserting the re-export exists, because a future edit to lib/media
  // that breaks Health would fail here.
  it.each(PARSE_CASES)('agrees with lib/media for %j', (input) => {
    expect(health.parseYouTubeId(input)).toBe(media.parseYouTubeId(input));
  });

  it('keeps its public API — the three names Health imports', () => {
    expect(typeof health.parseYouTubeId).toBe('function');
    expect(typeof health.isYouTubeUrl).toBe('function');
    expect(typeof health.toYouTubeEmbed).toBe('function');
  });

  it('re-exports the same function objects, not copies', () => {
    // Identity proves it is a re-export rather than a re-implementation that
    // could drift.
    expect(health.parseYouTubeId).toBe(media.parseYouTubeId);
    expect(health.isYouTubeUrl).toBe(media.isYouTubeUrl);
    expect(health.toYouTubeEmbed).toBe(media.toYouTubeEmbed);
  });

  it('still produces privacy-enhanced embeds for Health players', () => {
    expect(health.toYouTubeEmbed(`https://youtu.be/${ID}`)).toBe(
      `https://www.youtube-nocookie.com/embed/${ID}`
    );
    expect(health.toYouTubeEmbed('https://vimeo.com/1')).toBeNull();
  });

  it('still answers isYouTubeUrl the same way', () => {
    expect(health.isYouTubeUrl(`https://www.youtube.com/watch?v=${ID}`)).toBe(true);
    expect(health.isYouTubeUrl('https://example.com')).toBe(false);
  });
});

describe('lib/media/youtube — the new notification helpers', () => {
  it('derives a thumbnail from the id alone (no network, no API key)', () => {
    expect(media.youTubeThumbnailUrl(ID)).toBe(
      `https://img.youtube.com/vi/${ID}/hqdefault.jpg`
    );
  });

  it('builds the canonical watch URL', () => {
    expect(media.youTubeWatchUrl(ID)).toBe(
      `https://www.youtube.com/watch?v=${ID}`
    );
  });

  it('builds an oEmbed URL that is always a youtube.com address', () => {
    const url = media.buildYouTubeOEmbedUrl(ID);
    expect(new URL(url).origin).toBe('https://www.youtube.com');
    expect(url).toBe(
      'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D1LbkGBuCmpA&format=json'
    );
  });

  it('round-trips: an id parsed out of any form rebuilds the same URLs', () => {
    for (const form of [
      `https://youtu.be/${ALT}`,
      `https://www.youtube.com/shorts/${ALT}`,
      `https://www.youtube.com/watch?v=${ALT}&list=PLx`
    ]) {
      const parsed = media.parseYouTubeId(form)!;
      expect(parsed).toBe(ALT);
      expect(media.youTubeWatchUrl(parsed)).toBe(
        `https://www.youtube.com/watch?v=${ALT}`
      );
    }
  });
});
