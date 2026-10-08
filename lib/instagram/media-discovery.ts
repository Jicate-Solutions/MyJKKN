/**
 * Which of the media Instagram just handed us are NEW to us.
 *
 * WHY THIS EXISTS. The hourly poller used to ask Instagram only for media
 * timestamped after its previous visit (`since: last_polled_at`). A
 * collaboration post keeps its AUTHOR's timestamp. When another account posts
 * and a JKKN handle accepts the invite later — even minutes after one of our
 * hourly visits — the post enters the JKKN feed already "older" than our last
 * visit, and a since-filtered fetch never returns it. Proven on 2026-10-07: a
 * youth_tn_assembly post with jkkninstitutions as collaborator (28 Sep) is
 * visible on the jkkninstitutions profile, while we hold 82 jkkninstitutions
 * posts including 7 from that week and not that one.
 *
 * So the poller now fetches the latest page WITHOUT the time filter, and this
 * module decides what to do with it. Two rules, each guarding a real failure:
 *
 *  1. ONLY UNKNOWN MEDIA ARE MEASURED. Re-measuring the whole page every hour
 *     would multiply Graph traffic: 25 media x every account, and a reel costs
 *     nine insight calls. Media we already hold are left to the existing
 *     re-poll pass, exactly as before.
 *
 *  2. THE RE-POLL SKIP LIST HOLDS ONLY WHAT WAS MEASURED. The re-poll pass
 *     skips every id it is handed, to avoid writing two snapshots of one post
 *     in a tick. Hand it the whole fetched page and the media we deliberately
 *     did NOT measure would be skipped by both steps — every recent post's
 *     numbers would silently freeze.
 *
 * `lateDiscovered` is the instrument that settles the question the code alone
 * cannot: it counts media that are new to us AND timestamped before our last
 * visit — precisely the posts the old filter dropped for ever. If it is ever
 * non-zero in production, posts were being missed. If it stays zero while a
 * known collaboration is still absent, Instagram is not returning such posts on
 * the collaborator's feed at all, and no change to this poller can see them.
 */

export interface DiscoverableMedia {
  id: string;
  /** ISO-8601, as returned by the Graph API. */
  timestamp: string;
}

export interface MediaPartition<T extends DiscoverableMedia> {
  /** Media we do not yet hold. These — and only these — get measured. */
  newMedia: T[];
  /** New to us, yet timestamped before our previous visit. */
  lateDiscovered: T[];
  /** Exactly the ids measured this tick; the re-poll pass must skip these only. */
  skipForRepoll: Set<string>;
}

export function partitionFetchedMedia<T extends DiscoverableMedia>(
  fetched: T[],
  knownIds: ReadonlySet<string>,
  lastPolledAt: string | null
): MediaPartition<T> {
  const newMedia = fetched.filter((m) => !knownIds.has(m.id));

  const cutoff = lastPolledAt ? new Date(lastPolledAt).getTime() : null;
  const lateDiscovered =
    cutoff === null || Number.isNaN(cutoff)
      ? []
      : newMedia.filter((m) => new Date(m.timestamp).getTime() < cutoff);

  return {
    newMedia,
    lateDiscovered,
    skipForRepoll: new Set(newMedia.map((m) => m.id)),
  };
}
