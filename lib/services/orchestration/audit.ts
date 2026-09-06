import 'server-only';

// lib/services/orchestration/audit.ts
//
// Writes an audit-trail row for every merge/deploy action taken through the
// Orchestration Console. Insert-only, best-effort: this must never be the
// reason a merge/deploy service call fails, so any Supabase error here is
// caught and swallowed (logged) rather than thrown.
//
// The `orchestration_actions` table itself ships in another agent's
// migration in this same phase. Until that migration lands, every insert
// here will error at runtime (relation does not exist) — the try/catch
// below handles that gracefully; callers of `recordAction` never need to
// know whether the table exists yet.
//
// Deliberately does NOT import a shared types file — this agent owns only
// lib/services/orchestration/** and app/api/admin/orchestration/actions/**,
// and takes plain arguments so it shares no type definitions with the other
// agents building the console's read routes / page / migration.

import { createServiceRoleClient } from '@/lib/supabase/server';

export type OrchestrationActionKind = 'merge' | 'deploy';

/**
 * Records one orchestration action to the `orchestration_actions` audit
 * table. Fire-and-forget in spirit: failures are caught and logged, never
 * thrown, so a broken/missing audit table can't block the actual
 * merge/deploy action it's trying to record.
 *
 * @param kind    'merge' | 'deploy'
 * @param target  what the action was taken against, e.g. `PR #123` or
 *                `production` — a plain string, not a foreign key.
 * @param actorId the acting user's id (auth.users.id / profiles.id).
 * @param status  a short outcome label, e.g. 'merged', 'refused', 'error'.
 * @param result  the full structured result object from the service call,
 *                stored as-is in the jsonb `result` column.
 */
export async function recordAction(
  kind: OrchestrationActionKind,
  target: string,
  actorId: string,
  status: string,
  result: unknown
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('orchestration_actions').insert({
      kind,
      target,
      actor_id: actorId,
      status,
      result: result as never,
    });

    if (error) {
      console.error('[orchestration/audit] recordAction insert failed:', error.message);
    }
  } catch (err) {
    console.error(
      '[orchestration/audit] recordAction threw (table likely not migrated yet):',
      err instanceof Error ? err.message : err
    );
  }
}
