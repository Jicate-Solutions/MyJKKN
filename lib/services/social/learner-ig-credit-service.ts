/**
 * Crediting a learner for an Instagram post about JKKN.
 *
 * Director's rulings, 2026-10-01 22:45:
 *   1. All three crediting paths: the learner pastes the post link, Instagram's
 *      own collaboration data, or a staff member attributes it. `ClaimOrigin`
 *      carries all three; nothing produces 'auto_collab' yet.
 *   2. Award on BOTH post count AND saves+shares+comments, side by side, with a
 *      HUMAN picking winners. Nothing here ranks or picks.
 *   3. Under-18 learners are included.
 *
 * What this module deliberately does NOT handle: an Instagram handle, for
 * anybody. A claim is learner <-> a post we already hold, so under ruling 3 the
 * stored fact is "which of our posts was this learner's", not a minor's social
 * identity.
 *
 * The numeric helpers are IMPORTED from the events reception service rather than
 * re-derived. realSignal and latestSnapshotByPost are the same arithmetic the
 * social loop route proved, and ig_post_metrics averages 627 snapshots per post
 * (max 2,753, measured 2026-10-03) — summing across snapshots instead of taking
 * the latest inflates every number by roughly six hundred times.
 */

import {
  extractIgShortcode,
  realSignal,
  latestSnapshotByPost,
  signalUnavailable,
  type IgMetricSnapshot,
} from '@/lib/services/events/event-ig-reception-service';

export { extractIgShortcode, realSignal, latestSnapshotByPost, signalUnavailable };

export type ClaimOrigin = 'learner_link' | 'staff_link' | 'auto_collab';
export type ClaimStatus = 'pending' | 'confirmed' | 'rejected';

export interface LearnerClaim {
  id: string;
  learner_id: string;
  ig_post_id: string;
  origin: ClaimOrigin;
  status: ClaimStatus;
  claimed_at: string;
  reviewed_at: string | null;
  review_note: string | null;
}

/** One row of the award board: a learner, both numbers, side by side. */
export interface LearnerCreditRow {
  learner_id: string;
  learner_name: string;
  institution_id: string;
  /** Ruling 2, first number: how many confirmed posts. */
  confirmed_posts: number;
  /** Ruling 2, second number: what those posts earned. */
  saves: number;
  shares: number;
  comments: number;
  real_signal: number;
  /**
   * Confirmed posts on an account we can only read through Instagram's public
   * window, which returns no saves, shares or comments. Their engagement is
   * UNKNOWN, not zero, and is excluded from real_signal above. A human picking
   * winners must see this or they are comparing a real number against a false
   * zero — which would quietly corrupt ruling 2.
   */
  posts_without_signal: number;
  pending_claims: number;
}

/** Why a pasted link could not be credited. Each is shown to the person as-is. */
export type ClaimRejection =
  | { reason: 'not_a_post_link'; message: string }
  | { reason: 'post_not_ours'; message: string; shortcode: string }
  | { reason: 'already_claimed'; message: string };

export const NOT_A_POST_LINK =
  'That does not look like a link to an Instagram post or reel. Copy the link to the post itself, not to a profile or a story.';

export function postNotOursMessage(shortcode: string): string {
  return `We do not hold that post. Only posts on a JKKN department or institution Instagram account can be credited, because those are the only ones whose saves, shares and comments we can read. If the department posted it and invited you as a collaborator, ask them to check the post is on their account. (Reference: ${shortcode})`;
}

export const ALREADY_CLAIMED =
  'That post is already claimed by you. If it was rejected, ask the department rather than filing it again.';

/**
 * Turn a pasted URL into the shortcode to look up, or say why not.
 * Resolution against ig_posts happens in the route, which has the database.
 */
export function parsePostLink(url: string): { shortcode: string } | ClaimRejection {
  const trimmed = (url ?? '').trim();
  if (trimmed.length === 0) return { reason: 'not_a_post_link', message: NOT_A_POST_LINK };
  const shortcode = extractIgShortcode(trimmed);
  if (!shortcode) return { reason: 'not_a_post_link', message: NOT_A_POST_LINK };
  return { shortcode };
}

export interface ClaimedPostInput {
  ig_post_id: string;
  status: ClaimStatus;
  /** metrics_source of the account the post sits on. */
  metrics_source: string | null;
}

/**
 * Build one board row from a learner's claims and the latest snapshot per post.
 * Only CONFIRMED claims count toward either number — a pending claim is an
 * assertion nobody has checked, and counting it would let a learner inflate
 * their own standing by filing claims.
 */
export function buildCreditRow(
  learner: { learner_id: string; learner_name: string; institution_id: string },
  claims: ClaimedPostInput[],
  latestByPost: Map<string, IgMetricSnapshot>
): LearnerCreditRow {
  let confirmed_posts = 0;
  let saves = 0;
  let shares = 0;
  let comments = 0;
  let real_signal = 0;
  let posts_without_signal = 0;
  let pending_claims = 0;

  for (const c of claims) {
    if (c.status === 'pending') {
      pending_claims += 1;
      continue;
    }
    if (c.status !== 'confirmed') continue;

    confirmed_posts += 1;

    if (signalUnavailable(c.metrics_source)) {
      // Unknown, not zero. Counted as a post, excluded from the engagement.
      posts_without_signal += 1;
      continue;
    }

    const m = latestByPost.get(c.ig_post_id);
    saves += m?.saves ?? 0;
    shares += m?.shares ?? 0;
    comments += m?.comments ?? 0;
    real_signal += realSignal(m);
  }

  return {
    learner_id: learner.learner_id,
    learner_name: learner.learner_name,
    institution_id: learner.institution_id,
    confirmed_posts,
    saves,
    shares,
    comments,
    real_signal,
    posts_without_signal,
    pending_claims,
  };
}

/**
 * The notes shown under the board. Returns [] when there is nothing to warn
 * about. Deliberately NOT a ranking: ruling 2 puts the pick with a person, so
 * this module offers no winner, no score and no sort order.
 */
export function boardCaveats(rows: LearnerCreditRow[]): string[] {
  const out: string[] = [];

  const unreadable = rows.reduce((n, r) => n + r.posts_without_signal, 0);
  if (unreadable > 0) {
    out.push(
      `${unreadable} confirmed ${unreadable === 1 ? 'post sits' : 'posts sit'} on an account we can only read through Instagram's public window, which returns no saves, shares or comments. That engagement is unknown, not zero, and is left out of the totals — so a learner with such posts may look quieter than they were.`
    );
  }

  const pending = rows.reduce((n, r) => n + r.pending_claims, 0);
  if (pending > 0) {
    out.push(
      `${pending} ${pending === 1 ? 'claim is' : 'claims are'} still waiting for somebody to confirm or reject ${pending === 1 ? 'it' : 'them'}. Waiting claims count toward neither number.`
    );
  }

  out.push(
    'Both numbers are shown side by side on purpose. Nothing here picks a winner — that decision is a person’s.'
  );

  return out;
}
