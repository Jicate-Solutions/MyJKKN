// __tests__/events/event-ig-reception.test.ts
//
// Cover for the two rules an Events → Instagram link stands or falls on, both
// of which a browser test would confirm only by accident:
//
//   1. URL resolution. A pasted Instagram link must reduce to the shortcode
//      that ig_posts.permalink is matched on. Getting this wrong does not
//      throw — it silently finds no post, and the person is told their real
//      post "isn't tracked".
//   2. The signal sum. Engagement is saves + shares + comments and NEVER
//      likes. A likes leak would inflate every event's reception and nothing
//      would look broken.
//
// Plus the two honesty rules that make the numbers trustworthy: an unreadable
// account contributes nothing rather than a zero, and an event with no dates
// yields no suggestion window rather than an empty list.
//
// Pure functions — no React, no Supabase, no env.

import { describe, it, expect } from 'vitest';
import {
  extractIgShortcode,
  latestSnapshotByPost,
  realSignal,
  receptionCaveats,
  signalUnavailable,
  suggestionWindow,
  sumReception,
  SUGGESTION_LEADING_DAYS,
  SUGGESTION_TRAILING_DAYS,
  type EventIgPost,
} from '@/lib/services/events/event-ig-reception-service';

/** A linked post with sane defaults; override just what a case is about. */
const post = (over: Partial<EventIgPost> = {}): EventIgPost => ({
  link_id: 'link-1',
  ig_post_id: 'post-1',
  permalink: 'https://www.instagram.com/p/ABC123/',
  caption: null,
  media_type: 'IMAGE',
  posted_at: '2026-03-02T10:00:00Z',
  account_username: 'jkknpharmacy',
  other_institution: false,
  saves: 0,
  shares: 0,
  comments: 0,
  reach: null,
  realSignal: 0,
  signal_unavailable: false,
  ...over,
});

describe('extractIgShortcode — the URL the person actually pastes', () => {
  it('reads a plain post URL', () => {
    expect(extractIgShortcode('https://www.instagram.com/p/ABC123/')).toBe('ABC123');
  });

  it('reads a reel URL — reels are the format the loop says wins', () => {
    expect(extractIgShortcode('https://www.instagram.com/reel/XYZ789/')).toBe('XYZ789');
  });

  it('survives the share tracking parameters Instagram appends', () => {
    expect(
      extractIgShortcode('https://www.instagram.com/p/ABC123/?igsh=MTk0abcd&img_index=1')
    ).toBe('ABC123');
  });

  it('survives a missing trailing slash and a missing www', () => {
    expect(extractIgShortcode('https://instagram.com/p/ABC123')).toBe('ABC123');
  });

  it('rejects a profile link — there is no post to resolve', () => {
    expect(extractIgShortcode('https://www.instagram.com/jkknpharmacy/')).toBeNull();
  });

  it('rejects a non-Instagram URL and empty input', () => {
    expect(extractIgShortcode('https://facebook.com/p/ABC123/')).toBeNull();
    expect(extractIgShortcode('')).toBeNull();
  });
});

describe('realSignal — saves + shares + comments, never likes', () => {
  it('sums the three real actions', () => {
    expect(realSignal({ saves: 4, shares: 3, comments: 2 })).toBe(9);
  });

  it('ignores likes even when they are present on the row', () => {
    // The shape carries likes in production; the function must not see them.
    const withLikes = { saves: 1, shares: 1, comments: 1, likes: 5000 } as never;
    expect(realSignal(withLikes)).toBe(3);
  });

  it('treats nulls as zero and a missing snapshot as zero', () => {
    expect(realSignal({ saves: null, shares: 2, comments: null })).toBe(2);
    expect(realSignal(undefined)).toBe(0);
    expect(realSignal(null)).toBe(0);
  });
});

describe('latestSnapshotByPost — one poll per hour means hundreds of rows', () => {
  it('keeps only the newest snapshot per post regardless of input order', () => {
    const rows = [
      { post_id: 'a', snapshot_at: '2026-03-01T00:00:00Z', saves: 1, shares: 0, comments: 0, reach: 10 },
      { post_id: 'a', snapshot_at: '2026-03-05T00:00:00Z', saves: 9, shares: 0, comments: 0, reach: 90 },
      { post_id: 'a', snapshot_at: '2026-03-03T00:00:00Z', saves: 5, shares: 0, comments: 0, reach: 50 },
      { post_id: 'b', snapshot_at: '2026-03-02T00:00:00Z', saves: 2, shares: 0, comments: 0, reach: 20 },
    ];
    const latest = latestSnapshotByPost(rows);
    expect(latest.get('a')?.saves).toBe(9);
    expect(latest.get('b')?.saves).toBe(2);
    expect(latest.size).toBe(2);
  });

  it('does not mutate the caller\'s array', () => {
    const rows = [
      { post_id: 'a', snapshot_at: '2026-03-01T00:00:00Z', saves: 1, shares: 0, comments: 0, reach: null },
      { post_id: 'a', snapshot_at: '2026-03-05T00:00:00Z', saves: 9, shares: 0, comments: 0, reach: null },
    ];
    latestSnapshotByPost(rows);
    expect(rows[0].snapshot_at).toBe('2026-03-01T00:00:00Z');
  });
});

describe('sumReception — the number shown on the event console', () => {
  it('adds each post\'s real signal across the event', () => {
    const totals = sumReception([
      post({ ig_post_id: 'p1', saves: 4, shares: 3, comments: 2, realSignal: 9 }),
      post({ ig_post_id: 'p2', saves: 1, shares: 1, comments: 1, realSignal: 3 }),
    ]);
    expect(totals.posts).toBe(2);
    expect(totals.saves).toBe(5);
    expect(totals.shares).toBe(4);
    expect(totals.comments).toBe(3);
    expect(totals.realSignal).toBe(12);
    expect(totals.posts_without_signal).toBe(0);
  });

  it('counts an unreadable post as unreadable, not as a zero-engagement post', () => {
    // A business_discovery account returns 0 because Instagram's public window
    // does not expose engagement. Averaging that in would understate the event.
    const totals = sumReception([
      post({ ig_post_id: 'p1', saves: 4, shares: 3, comments: 2, realSignal: 9 }),
      post({ ig_post_id: 'p2', signal_unavailable: true }),
    ]);
    expect(totals.realSignal).toBe(9);
    expect(totals.posts).toBe(2);
    expect(totals.posts_without_signal).toBe(1);
  });

  it('an event with nothing linked totals zero across the board', () => {
    const totals = sumReception([]);
    expect(totals).toEqual({
      posts: 0,
      saves: 0,
      shares: 0,
      comments: 0,
      realSignal: 0,
      posts_without_signal: 0,
    });
  });
});

describe('signalUnavailable', () => {
  it('flags business_discovery and nothing else', () => {
    expect(signalUnavailable('business_discovery')).toBe(true);
    expect(signalUnavailable('graph_api')).toBe(false);
    expect(signalUnavailable(null)).toBe(false);
  });
});

describe('suggestionWindow — timing only, and only when dates exist', () => {
  it('brackets start_date/end_date by the leading and trailing days', () => {
    const w = suggestionWindow({
      start_date: '2026-03-10T00:00:00Z',
      end_date: '2026-03-12T00:00:00Z',
      event_date: null,
    });
    expect(w).not.toBeNull();
    expect(new Date(w!.from).toISOString().slice(0, 10)).toBe('2026-03-07'); // −3
    expect(new Date(w!.to).toISOString().slice(0, 10)).toBe('2026-03-19'); // +7
    expect(SUGGESTION_LEADING_DAYS).toBe(3);
    expect(SUGGESTION_TRAILING_DAYS).toBe(7);
  });

  it('falls back to event_date — 22 of 51 production events carry only that', () => {
    const w = suggestionWindow({
      start_date: null,
      end_date: null,
      event_date: '2026-03-10T00:00:00Z',
    });
    expect(new Date(w!.from).toISOString().slice(0, 10)).toBe('2026-03-07');
    expect(new Date(w!.to).toISOString().slice(0, 10)).toBe('2026-03-17');
  });

  it('returns null — not an empty window — when the event has no date', () => {
    // The caller must say "no dates, so no suggestions". An empty window would
    // render as "nothing was posted", which is a different and false claim.
    expect(
      suggestionWindow({ start_date: null, end_date: null, event_date: null })
    ).toBeNull();
  });

  it('returns null on an unparseable date rather than an Invalid Date range', () => {
    expect(
      suggestionWindow({ start_date: 'not-a-date', end_date: null, event_date: null })
    ).toBeNull();
  });
});

describe('receptionCaveats — what the card says out loud', () => {
  it('says nothing when every post is readable and the event has dates', () => {
    const totals = sumReception([post({ realSignal: 3, saves: 3 })]);
    expect(receptionCaveats(totals, true)).toEqual([]);
  });

  it('names how many posts could not be read', () => {
    const totals = sumReception([
      post({ ig_post_id: 'p1', realSignal: 9, saves: 9 }),
      post({ ig_post_id: 'p2', signal_unavailable: true }),
    ]);
    const out = receptionCaveats(totals, true);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('1 of 2');
    expect(out[0]).toContain('unknown, not zero');
  });

  it('explains a missing date window instead of showing an empty suggestion list', () => {
    const out = receptionCaveats(sumReception([]), false);
    expect(out.some((c) => c.includes('no start or end date'))).toBe(true);
  });
});
