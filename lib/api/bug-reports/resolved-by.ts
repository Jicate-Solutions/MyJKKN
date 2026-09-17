// ============================================
// WHO RESOLVED A BUG — shared server helpers
// ============================================
// Created: 2026-09-16
//
// `bug_reports.resolved_by` arrives with migration
// 20261223093000_bug_reports_resolved_by.sql. Until that migration is applied
// to an environment, PostgREST answers any write naming the column with
// 42703 ("column does not exist") — which would make resolving a bug fail
// outright. Every write here therefore retries once WITHOUT the column, so the
// app keeps working on a database that has not been migrated yet.
// ============================================

/** Postgres "undefined column" — the pre-migration shape of this database. */
export function isMissingResolvedByColumn(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  if (!err) return false;
  // 42703 = Postgres undefined_column; PGRST204 = PostgREST's "column not
  // found in the schema cache", which is what a write to a missing column hits.
  if (err.code === '42703' || err.code === 'PGRST204') return true;
  const message = err.message ?? '';
  return /resolved_by/i.test(message) && /(column|schema cache|does not exist)/i.test(message);
}

/** Strip resolved_by from an update payload (the pre-migration retry). */
export function withoutResolvedBy<T extends Record<string, unknown>>(payload: T): T {
  const { resolved_by: _dropped, ...rest } = payload as Record<string, unknown>;
  return rest as T;
}

/**
 * Run an update that names resolved_by, falling back to the same update without
 * it when the column is not there yet.
 *
 * `run` is called with the payload to write, so the caller keeps full control of
 * the query (filters, .select(), .single()).
 */
export async function updateWithResolvedBy<TPayload extends Record<string, unknown>, TResult>(
  payload: TPayload,
  run: (payload: TPayload) => Promise<{ data: TResult | null; error: unknown }>
): Promise<{ data: TResult | null; error: unknown }> {
  const first = await run(payload);
  if (!first.error || !isMissingResolvedByColumn(first.error)) return first;
  return run(withoutResolvedBy(payload));
}

/**
 * The resolver a status change implies: the acting user when the bug is being
 * resolved, and nobody otherwise — a reopened bug must not keep a stale name.
 */
export function resolvedByForStatus(status: string, actorUserId: string): string | null {
  return status === 'resolved' ? actorUserId : null;
}
