// lib/services/social/ig-post-lookup.ts
//
// Two small read helpers for ig_posts / ig_post_metrics that every caller
// must use the same way:
//
//   1. igPermalinkLikePattern(shortcode) — an EXACT, case-sensitive LIKE
//      pattern for ig_posts.permalink. Instagram shortcodes contain `_`, which
//      is a LIKE wildcard, and are case-sensitive; `.ilike('%/C_ab/%')` also
//      matches a different post `cXab`. ig_posts has no shortcode column, so
//      the permalink is escaped and matched with `.like`.
//
//   2. fetchLatestPostMetrics(client, postIds, columns) — the newest
//      ig_post_metrics snapshot per post. A post averages ~627 snapshots
//      (measured 2026-10-07), so one `.in('post_id', ids)` read hits
//      PostgREST's 1,000-row cap after two posts and silently drops the rest.
//      Each post is read on its own with order(snapshot_at desc).limit(1),
//      a few posts at a time.

/** Escape LIKE metacharacters so the value matches literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** LIKE pattern matching a permalink that contains `/<shortcode>/` exactly. */
export function igPermalinkLikePattern(shortcode: string): string {
  return `%/${escapeLike(shortcode)}/%`;
}

/** How many per-post reads run at once. */
export const LATEST_METRICS_CONCURRENCY = 10;

/**
 * Latest ig_post_metrics row per post id. `columns` must include `post_id`.
 * Returns the rows found plus the first read error (callers decide whether
 * an error is fatal, as they did before).
 */
export async function fetchLatestPostMetrics<T extends { post_id: string }>(
  client: any,
  postIds: string[],
  columns: string,
  concurrency: number = LATEST_METRICS_CONCURRENCY
): Promise<{ latest: Map<string, T>; error: { message: string } | null }> {
  const latest = new Map<string, T>();
  let error: { message: string } | null = null;
  const ids = [...new Set(postIds)];
  for (let i = 0; i < ids.length; i += concurrency) {
    const chunk = ids.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map((id) =>
        client
          .from('ig_post_metrics')
          .select(columns)
          .eq('post_id', id)
          // nullsFirst:false — descending order otherwise puts a NULL
          // snapshot_at first and it would read as the latest.
          .order('snapshot_at', { ascending: false, nullsFirst: false })
          .limit(1)
      )
    );
    for (const { data, error: readErr } of results as Array<{
      data: T[] | null;
      error: { message: string } | null;
    }>) {
      if (readErr && !error) error = readErr;
      const row = (data ?? [])[0];
      if (row) latest.set(row.post_id, row);
    }
  }
  return { latest, error };
}
