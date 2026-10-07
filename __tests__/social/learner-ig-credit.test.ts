/**
 * Crediting a learner for an Instagram post — the arithmetic and the refusals.
 *
 * WHY EACH TEST EXISTS, since the diff does not say it. Measured on production
 * 2026-10-03:
 *
 *  1. ig_post_metrics averages 627 snapshots per post and the worst post has
 *     2,753. Summing across snapshot rows instead of taking the latest per post
 *     inflates every engagement number by roughly six hundred times. A board
 *     built that way would still look plausible — big numbers, right order — and
 *     would be wrong by two orders of magnitude.
 *
 *  2. 12 of 71 Instagram accounts are read through Instagram's public window,
 *     which returns NO saves, shares or comments. A post there scores 0 because
 *     it is unreadable, not because nobody engaged. The Director ruled that a
 *     HUMAN picks the winners, so that human must never be shown a true 0 and an
 *     unreadable 0 as the same thing.
 *
 *  3. Only CONFIRMED claims may count. A pending claim is an assertion nobody
 *     has checked; counting it would let a learner inflate their own standing
 *     just by filing claims.
 *
 *  4. A pasted link we do not hold must be refused WITH A REASON (rule 27:
 *     permission and resolution failures are explicit, never silent). Storing it
 *     anyway would give a learner a post count with no engagement figure, which
 *     quietly corrupts the side-by-side comparison the ruling asks for.
 */

import { describe, it, expect } from 'vitest';
import {
  parsePostLink,
  buildCreditRow,
  boardCaveats,
  realSignal,
  latestSnapshotByPost,
  NOT_A_POST_LINK,
  type ClaimedPostInput,
  type CreditSnapshot,
} from '@/lib/services/social/learner-ig-credit-service';

const learner = {
  learner_id: 'L1',
  learner_name: 'A Learner',
  institution_id: 'INST1',
};

function snap(post_id: string, at: string, saves: number, shares: number, comments: number, likes = 0) {
  return {
    post_id,
    snapshot_at: at,
    saves,
    shares,
    comments,
    likes,
    reach: null,
  } as CreditSnapshot;
}

/** latestSnapshotByPost returns the rows it was given; restore the board type it drops. */
const latest = (rows: CreditSnapshot[]) => latestSnapshotByPost(rows) as Map<string, CreditSnapshot>;

describe('reading a pasted post link', () => {
  it('accepts a post link and a reel link', () => {
    expect(parsePostLink('https://www.instagram.com/p/AbC123/')).toEqual({ shortcode: 'AbC123' });
    expect(parsePostLink('https://instagram.com/reel/XyZ789/?igsh=1')).toEqual({ shortcode: 'XyZ789' });
  });

  it('refuses a profile link, a story link and an empty box, each with a reason', () => {
    for (const bad of ['https://www.instagram.com/jkknpharmacy/', 'https://instagram.com/stories/x/1/', '', '   ']) {
      const out = parsePostLink(bad);
      expect(out).toHaveProperty('reason', 'not_a_post_link');
      expect((out as { message: string }).message).toBe(NOT_A_POST_LINK);
    }
  });
});

describe('the two numbers, side by side', () => {
  it('takes the LATEST snapshot per post — summing them inflates by ~600x', () => {
    // One post, three snapshots as the poller saw it grow. Only the last is true.
    const snapshots = [
      snap('P1', '2026-09-01T00:00:00.000Z', 1, 0, 0),
      snap('P1', '2026-09-20T00:00:00.000Z', 5, 2, 1),
      snap('P1', '2026-10-01T00:00:00.000Z', 9, 4, 3),
    ];
    const latestMap = latest(snapshots);
    const claims: ClaimedPostInput[] = [{ ig_post_id: 'P1', status: 'confirmed', metrics_source: 'graph' }];

    const row = buildCreditRow(learner, claims, latestMap);

    expect(row.confirmed_posts).toBe(1);
    expect(row.saves).toBe(9);
    expect(row.shares).toBe(4);
    expect(row.comments).toBe(3);
    expect(row.real_signal).toBe(16);
    // The sum across all three snapshots would be 15+6+4 = 25. Guard it.
    expect(row.real_signal).not.toBe(25);
  });

  it('counts an unreadable post as a post but keeps its PARTIAL numbers out', () => {
    // Measured on production 2026-10-03, across the 101 posts on accounts read
    // through Instagram's public window: 12 have comments above zero, and NOT ONE
    // has a save or a share. So such a post arrives with a real comment count and
    // saves/shares that are unknown-reported-as-zero. Letting it through would add
    // the comments while silently treating the unknown saves and shares as zero —
    // a partial reading mixed into a total that is presented as complete.
    //
    // An earlier version of this test gave P2 no snapshot at all, so falling
    // through added nothing and the test passed against the broken code. It
    // proved nothing. P2 now carries the shape production actually produces.
    const latestMap = latest([
      snap('P1', '2026-10-01T00:00:00.000Z', 9, 4, 3),
      snap('P2', '2026-10-01T00:00:00.000Z', 0, 0, 7),
    ]);
    const claims: ClaimedPostInput[] = [
      { ig_post_id: 'P1', status: 'confirmed', metrics_source: 'graph' },
      { ig_post_id: 'P2', status: 'confirmed', metrics_source: 'business_discovery' },
    ];

    const row = buildCreditRow(learner, claims, latestMap);

    expect(row.confirmed_posts).toBe(2);
    expect(row.posts_without_signal).toBe(1);
    // P2 contributes nothing at all, not even its 7 real comments.
    expect(row.comments).toBe(3);
    expect(row.real_signal).toBe(16);
    expect(row.real_signal).not.toBe(23);
  });

  it('ignores pending and rejected claims in both numbers', () => {
    const latestMap = latest([
      snap('P1', '2026-10-01T00:00:00.000Z', 9, 4, 3),
      snap('P2', '2026-10-01T00:00:00.000Z', 100, 100, 100),
      snap('P3', '2026-10-01T00:00:00.000Z', 50, 50, 50),
    ]);
    const claims: ClaimedPostInput[] = [
      { ig_post_id: 'P1', status: 'confirmed', metrics_source: 'graph' },
      { ig_post_id: 'P2', status: 'pending', metrics_source: 'graph' },
      { ig_post_id: 'P3', status: 'rejected', metrics_source: 'graph' },
    ];

    const row = buildCreditRow(learner, claims, latestMap);

    expect(row.confirmed_posts).toBe(1);
    expect(row.real_signal).toBe(16);
    expect(row.pending_claims).toBe(1);
  });

  it('a learner with no confirmed claims reads as zeroes, not as missing', () => {
    const row = buildCreditRow(learner, [], new Map());
    expect(row.confirmed_posts).toBe(0);
    expect(row.real_signal).toBe(0);
    expect(row.posts_without_signal).toBe(0);
  });

  it('counts likes on the board — engagement includes them, real_signal does not', () => {
    // Ruling 4 (2026-10-07): likes count on THIS board only. real_signal keeps the
    // system-wide meaning so the posting advice and the events page are unchanged.
    const latestMap = latest([snap('P1', '2026-10-01T00:00:00.000Z', 9, 4, 3, 120)]);
    const row = buildCreditRow(learner, [{ ig_post_id: 'P1', status: 'confirmed', metrics_source: 'graph' }], latestMap);

    expect(row.likes).toBe(120);
    expect(row.real_signal).toBe(16);
    expect(row.engagement).toBe(136);
  });

  it('takes likes from the LATEST snapshot, not a sum of them', () => {
    const latestMap = latest([
      snap('P1', '2026-09-01T00:00:00.000Z', 0, 0, 0, 40),
      snap('P1', '2026-10-01T00:00:00.000Z', 0, 0, 0, 90),
    ]);
    const row = buildCreditRow(learner, [{ ig_post_id: 'P1', status: 'confirmed', metrics_source: 'graph' }], latestMap);
    expect(row.likes).toBe(90);
    expect(row.likes).not.toBe(130);
  });

  it('keeps an unreadable post\u2019s likes OUT too — a partial reading is not added to a complete one', () => {
    const latestMap = latest([
      snap('P1', '2026-10-01T00:00:00.000Z', 9, 4, 3, 120),
      snap('P2', '2026-10-01T00:00:00.000Z', 0, 0, 7, 500),
    ]);
    const row = buildCreditRow(learner, [
      { ig_post_id: 'P1', status: 'confirmed', metrics_source: 'graph' },
      { ig_post_id: 'P2', status: 'confirmed', metrics_source: 'business_discovery' },
    ], latestMap);
    expect(row.likes).toBe(120);
    expect(row.engagement).toBe(136);
    expect(row.posts_without_signal).toBe(1);
  });

  it('excludes likes from the signal — they are vanity', () => {
    // realSignal must never read a likes field even when one is present.
    const withLikes = { saves: 1, shares: 2, comments: 3, likes: 9999 } as unknown as Parameters<typeof realSignal>[0];
    expect(realSignal(withLikes)).toBe(6);
  });
});

describe('what the board says about itself', () => {
  it('warns when some posts are unreadable, and says unknown rather than zero', () => {
    const rows = [{ ...buildCreditRow(learner, [{ ig_post_id: 'P2', status: 'confirmed' as const, metrics_source: 'business_discovery' }], new Map()) }];
    const notes = boardCaveats(rows);
    // Those accounts return comments and likes but never saves or shares (measured
    // 2026-10-03: 12 of 101 had comments, 0 had a save or share). The note must
    // say the reading is partial, not that nothing came back.
    expect(notes.join(' ')).toMatch(/never saves or shares/i);
    expect(notes.join(' ')).toMatch(/partial reading/i);
  });

  it('warns when claims are still waiting on a person', () => {
    const rows = [buildCreditRow(learner, [{ ig_post_id: 'P2', status: 'pending', metrics_source: 'graph' }], new Map())];
    expect(boardCaveats(rows).join(' ')).toMatch(/waiting for somebody/i);
  });

  it('always says the pick is a person’s — the board must never imply a winner', () => {
    const notes = boardCaveats([buildCreditRow(learner, [], new Map())]);
    expect(notes.join(' ')).toMatch(/nothing here picks a winner/i);
  });
});
