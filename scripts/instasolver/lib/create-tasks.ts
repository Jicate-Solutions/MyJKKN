/**
 * Create (or re-link) the Campus Walk task for each OPEN old record — never twice.
 *
 * Three guards, in order:
 *   1. the history row already carries imported_task_id  -> skip;
 *   2. a task with metadata.imported_from = 'old-instasolver' and this
 *      legacy_instasolver_id already exists (an earlier run crashed between
 *      creating it and writing it back) -> write that id back, create nothing;
 *   3. otherwise create it through createWalkTask and write the id back, only
 *      onto a row whose imported_task_id is still NULL.
 *
 * `createTask` is injectable so the tests can prove guard 1 and 2 without a
 * database; the importer passes the real createWalkTask.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createWalkTask,
  type CreateWalkTaskInput,
  type CreateWalkTaskResult,
} from '@/lib/services/campus-walk/campus-walk-service';
import { IMPORTED_FROM, buildWalkTaskInput, type IssueRow } from './old-site-mapping';

const BATCH = 200;

export interface CreateTasksResult {
  created: number;
  alreadyLinked: number;
  relinked: number;
  failed: number;
}

type CreateTask = (db: SupabaseClient, input: CreateWalkTaskInput) => Promise<CreateWalkTaskResult | null>;

const err = (line: string) => process.stderr.write(`${line}\n`);

export async function createTasks(
  db: SupabaseClient,
  openRows: IssueRow[],
  createTask: CreateTask = createWalkTask
): Promise<CreateTasksResult> {
  const result: CreateTasksResult = { created: 0, alreadyLinked: 0, relinked: 0, failed: 0 };
  const ids = openRows.map((r) => r.legacy_id);
  const linked = new Map<number, string | null>();
  for (let i = 0; i < ids.length; i += BATCH) {
    const { data, error } = await db
      .from('legacy_instasolver_issues')
      .select('legacy_id, imported_task_id')
      .in('legacy_id', ids.slice(i, i + BATCH));
    if (error) throw new Error(`reading task links failed: ${error.message}`);
    for (const r of (data ?? []) as Array<{ legacy_id: number; imported_task_id: string | null }>) {
      linked.set(r.legacy_id, r.imported_task_id);
    }
  }

  for (const row of openRows) {
    if (linked.get(row.legacy_id)) {
      result.alreadyLinked++;
      continue;
    }

    // A task created by an earlier run that crashed before writing back.
    const { data: existing, error: existingError } = await db
      .from('project_tasks')
      .select('id')
      .eq('metadata->>imported_from', IMPORTED_FROM)
      .eq('metadata->>legacy_instasolver_id', String(row.legacy_id))
      .limit(1);
    if (existingError) {
      err(`[instasolver-import] could not check for an existing task (old #${row.legacy_id}); skipped`);
      result.failed++;
      continue;
    }

    let taskId: string | null = (existing?.[0]?.id as string | undefined) ?? null;
    if (taskId) {
      result.relinked++;
    } else {
      const created = await createTask(db, buildWalkTaskInput(row));
      taskId = created?.taskId ?? null;
      if (!taskId) {
        err(`[instasolver-import] task not created (old #${row.legacy_id})`);
        result.failed++;
        continue;
      }
      result.created++;
    }

    const { error: linkError } = await db
      .from('legacy_instasolver_issues')
      .update({ imported_task_id: taskId, task_imported_at: new Date().toISOString() })
      .eq('legacy_id', row.legacy_id)
      .is('imported_task_id', null);
    if (linkError) {
      // The task exists and carries legacy_instasolver_id, so the next run
      // re-links it instead of creating another.
      err(`[instasolver-import] task link not saved (old #${row.legacy_id}): ${linkError.message}`);
    }
  }
  return result;
}
