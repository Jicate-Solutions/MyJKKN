// lib/services/events/event-ig-reception-service.ts
// ============================================================================
// Event → Instagram reception. The pure half of "how was this event received
// on Instagram?" — no Supabase client, no request, so every rule below is
// testable on its own (__tests__/events/event-ig-reception.test.ts).
//
// Two things are deliberately NOT reinvented here:
//
//   1. URL → post resolution. extractIgShortcode is imported from
//      lib/services/ai-pulse/pulse-impact-service, the function AI Pulse's
//      publication submit route already uses. One regex for Instagram URLs in
//      this codebase, not two that drift.
//
//   2. What "engagement" means. realSignal is saves + shares + comments and
//      never likes — the definition set by app/api/social/loop/route.ts
//      ("REAL signal (saves + shares + comments; never likes)"). It is
//      restated here rather than imported because the loop's copy is a private
//      function inside a route file; the comment is the contract.
// ============================================================================

import { extractIgShortcode } from '@/lib/services/ai-pulse/pulse-impact-service';

export { extractIgShortcode };

/** One metrics snapshot, as ig_post_metrics stores it. */
export interface IgMetricSnapshot {
  post_id: string;
  snapshot_at: string;
  saves: number | null;
  shares: number | null;
  comments: number | null;
  reach: number | null;
}

/** A post as the event console shows it. */
export interface EventIgPost {
  link_id: string | null;
  ig_post_id: string;
  permalink: string | null;
  caption: string | null;
  media_type: string | null;
  posted_at: string | null;
  account_username: string | null;
  /** True when the posting account is not the event's own institution. */
  other_institution: boolean;
  saves: number;
  shares: number;
  comments: number;
  reach: number | null;
  realSignal: number;
  /**
   * True when the account is read through Instagram's public
   * business_discovery window, which returns no engagement at all — so this
   * post's saves/shares/comments are 0 because they are UNAVAILABLE, not
   * because nobody engaged. Shown, never silently averaged in.
   */
  signal_unavailable: boolean;
}

export interface EventIgReception {
  linked: EventIgPost[];
  totals: {
    posts: number;
    saves: number;
    shares: number;
    comments: number;
    realSignal: number;
    /** Posts whose engagement cannot be read at all (business_discovery). */
    posts_without_signal: number;
  };
  suggestions: EventIgPost[];
  /** Plain-English notes the card renders verbatim. Never swallowed. */
  caveats: string[];
}

/**
 * realSignal — the only thing scored. Likes are vanity and excluded.
 * Mirrors realSignal() in app/api/social/loop/route.ts.
 */
export function realSignal(
  m: Pick<IgMetricSnapshot, 'saves' | 'shares' | 'comments'> | undefined | null
): number {
  if (!m) return 0;
  return (m.saves ?? 0) + (m.shares ?? 0) + (m.comments ?? 0);
}

/**
 * Reduce many snapshots to the latest one per post. ig_post_metrics keeps a
 * row per poll, so a post has hundreds; only the newest describes it now.
 * First-wins over a descending sort, the same reduce the social routes use.
 */
export function latestSnapshotByPost(
  rows: IgMetricSnapshot[]
): Map<string, IgMetricSnapshot> {
  const byPost = new Map<string, IgMetricSnapshot>();
  const sorted = [...rows].sort(
    (a, b) => new Date(b.snapshot_at).getTime() - new Date(a.snapshot_at).getTime()
  );
  for (const r of sorted) {
    if (!byPost.has(r.post_id)) byPost.set(r.post_id, r);
  }
  return byPost;
}

/** Sum the real signal across an event's linked posts. */
export function sumReception(posts: EventIgPost[]): EventIgReception['totals'] {
  return posts.reduce(
    (acc, p) => ({
      posts: acc.posts + 1,
      saves: acc.saves + p.saves,
      shares: acc.shares + p.shares,
      comments: acc.comments + p.comments,
      realSignal: acc.realSignal + p.realSignal,
      posts_without_signal:
        acc.posts_without_signal + (p.signal_unavailable ? 1 : 0),
    }),
    {
      posts: 0,
      saves: 0,
      shares: 0,
      comments: 0,
      realSignal: 0,
      posts_without_signal: 0,
    }
  );
}

/**
 * How many days after an event ends a post may still be counted as coverage.
 * A recap or a photo dump lands days late, so the window is deliberately
 * generous — it only ever widens what is SUGGESTED, never what is linked.
 */
export const SUGGESTION_TRAILING_DAYS = 7;

/** How many days before an event a promo post is still plausible coverage. */
export const SUGGESTION_LEADING_DAYS = 3;

export interface EventDates {
  start_date: string | null;
  end_date: string | null;
  event_date: string | null;
}

/**
 * The window in which a post is worth SUGGESTING as coverage of this event.
 *
 * Anchors on start_date/end_date and falls back to event_date, because in
 * production 46 of 51 events carry start_date/end_date while only 22 carry
 * event_date. Returns null when the event has no usable date at all — the
 * caller must then say "this event has no dates, so we cannot suggest
 * anything" rather than quietly returning an empty list, which would read as
 * "nothing was posted".
 */
export function suggestionWindow(
  event: EventDates
): { from: string; to: string } | null {
  const startRaw = event.start_date ?? event.event_date;
  const endRaw = event.end_date ?? event.event_date ?? event.start_date;
  if (!startRaw || !endRaw) return null;

  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const from = new Date(start);
  from.setUTCDate(from.getUTCDate() - SUGGESTION_LEADING_DAYS);
  const to = new Date(end);
  to.setUTCDate(to.getUTCDate() + SUGGESTION_TRAILING_DAYS);

  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * Accounts read through business_discovery return saves/shares/comments as 0
 * because Instagram's public window does not expose engagement — documented in
 * app/api/social/loop/route.ts. A 0 from such an account means "not readable",
 * not "nobody engaged", and the two must never be added together silently.
 */
export const NO_SIGNAL_METRICS_SOURCE = 'business_discovery';

export function signalUnavailable(metricsSource: string | null): boolean {
  return metricsSource === NO_SIGNAL_METRICS_SOURCE;
}

/**
 * The notes shown under the numbers. Returns [] when there is nothing to warn
 * about, so the card renders no empty box.
 */
export function receptionCaveats(
  totals: EventIgReception['totals'],
  hasWindow: boolean
): string[] {
  const out: string[] = [];
  if (totals.posts_without_signal > 0) {
    out.push(
      `${totals.posts_without_signal} of ${totals.posts} linked ${
        totals.posts === 1 ? 'post is' : 'posts are'
      } on an account we can only read through Instagram's public window, which does not return saves, shares or comments. Their engagement is unknown, not zero — it is excluded from the total above.`
    );
  }
  if (!hasWindow) {
    out.push(
      'This event has no start or end date, so we cannot suggest posts that might have covered it. Add dates to the event, or paste a post link directly.'
    );
  }
  return out;
}
