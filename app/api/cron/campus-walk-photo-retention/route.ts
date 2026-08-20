// app/api/cron/campus-walk-photo-retention/route.ts
// ============================================================================
// Campus Walk — delete walk photos 90 days after their ticket closed.
//
// ── WHY THIS IS NON-NEGOTIABLE, NOT HOUSEKEEPING ────────────────────────────
// These are photographs of corridors, hostels and washrooms in an institution
// full of students. A photo taken to document a broken fitting can still show
// an identifiable person in the background. Retention here is a privacy
// commitment (guardrail G4, specs/campus-walk-2026-08-17.md), so this sweep
// runs on a fixed schedule regardless of storage cost, and RETENTION_DAYS is
// a locked constant rather than an admin-tunable policy row.
//
// ── WHAT "CLOSED" MEANS HERE ─────────────────────────────────────────────
//   - status_key = 'done'      -> closed at `completed_at` (set only by the
//     separate review-approval step; D4 — a fix photo alone never sets this,
//     see app/api/campus-walk/fix/route.ts)
//   - status_key = 'cancelled' -> closed at metadata.cancelled_at
//     (cancelWalkTask writes this; there is no dedicated column for it)
// A ticket in 'review' is awaiting the Director's decision and is NOT
// closed — its photos are the evidence that decision is based on, so this
// sweep never touches it. A ticket back in 'todo' after a D7 "same as
// before" reopen is also not closed (lib/campus-walk/repeats.ts clears
// metadata.cancelled_at on every reopen for exactly this reason).
//
// ── WHAT SURVIVES ────────────────────────────────────────────────────────
// Only the storage OBJECTS are removed from the private `campus-walk`
// bucket. The project_tasks row, its full metadata (including the D7
// occurrence history), and the project_task_attachments rows themselves are
// all kept, so the institutional record and the repeat-count survive the
// photos being purged. The task's metadata is marked with whether/when the
// purge ran, so a future UI can say "photos deleted after 90 days" instead
// of rendering a broken image.
//
// ── FAIL-SOFT AND IDEMPOTENT ─────────────────────────────────────────────
// One task's storage failure must not abort the sweep — every candidate task
// is handled independently, errors are collected rather than thrown, and a
// task is only marked purged after its objects were actually removed (or
// found to have none). A task already marked purged is skipped, so
// re-running this cron (a Vercel retry, or a manual trigger) never
// re-attempts already-cleared work and never double-reports on it.
//
// Auth: CRON_SECRET, same pattern as every other cron in this repo — Bearer
// header (Vercel auto-sends) OR ?secret= query param (manual/local testing).
// A cron with no secret check is a public endpoint that deletes photos —
// this one is gated before it reads anything.
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const BUCKET = 'campus-walk';

/**
 * Locked, not tunable from an admin screen: this is a privacy commitment
 * (guardrail G4), not an operational threshold like duty-log retention. If a
 * future change genuinely needs this to be admin-adjustable, that should be
 * a deliberate, reviewed follow-up — not this cron's default.
 */
const RETENTION_DAYS = 90;

/**
 * Bounded blast radius per run, same doctrine as cron/pde-image-orphans: the
 * rest simply wait for tomorrow's run rather than one giant sweep risking
 * the function timeout.
 */
const MAX_TASKS_PER_RUN = 200;

interface TaskRow {
  id: string;
  status_key: string;
  completed_at: string | null;
  metadata: Record<string, any>;
}

interface PurgeOutcome {
  task_id: string;
  closed_at: string | null;
  objects_removed: number;
}

interface PurgeError {
  task_id: string;
  error: string;
}

/** The date this task counts as "closed" from, per the two lanes above. Null means not closed (should not happen — the queries below only select closed tasks — but stays defensive). */
function closedAtFor(task: TaskRow): string | null {
  if (task.status_key === 'done') return task.completed_at;
  if (task.status_key === 'cancelled') {
    const v = task.metadata?.cancelled_at;
    return typeof v === 'string' ? v : null;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  // Dry-run support: prove what WOULD be purged before trusting the sweep,
  // same pattern as cron/pde-image-orphans. Nothing is deleted or marked.
  const dryRun = request.nextUrl.searchParams.get('dry_run') === '1';

  const admin = createServiceRoleClient();
  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();

  const purged: PurgeOutcome[] = [];
  const errors: PurgeError[] = [];
  let skippedAlreadyPurged = 0;

  try {
    // 'done' — closed by the review-approval step, dated by completed_at.
    const { data: doneRows, error: doneErr } = await admin
      .from('project_tasks')
      .select('id, status_key, completed_at, metadata')
      .eq('metadata->>source', 'campus-walk')
      .eq('status_key', 'done')
      .not('completed_at', 'is', null)
      .lt('completed_at', cutoffIso)
      .limit(MAX_TASKS_PER_RUN);
    if (doneErr) throw doneErr;

    // 'cancelled' — closed by cancelWalkTask, dated by metadata.cancelled_at
    // (there is no dedicated column). Pushed down as a JSON-path filter
    // rather than fetched-then-filtered in JS: every writer of this field
    // uses `new Date().toISOString()`, so full-precision ISO-8601 UTC
    // strings compare correctly as plain text under `lt`.
    const { data: cancelledRows, error: cancelErr } = await admin
      .from('project_tasks')
      .select('id, status_key, completed_at, metadata')
      .eq('metadata->>source', 'campus-walk')
      .eq('status_key', 'cancelled')
      .filter('metadata->>cancelled_at', 'lt', cutoffIso)
      .limit(MAX_TASKS_PER_RUN);
    if (cancelErr) throw cancelErr;

    const candidates = [...((doneRows ?? []) as TaskRow[]), ...((cancelledRows ?? []) as TaskRow[])].slice(
      0,
      MAX_TASKS_PER_RUN
    );

    for (const task of candidates) {
      const metadata = (task.metadata ?? {}) as Record<string, any>;

      // Idempotent: a task already marked purged is left alone, so a re-run
      // (Vercel retry, or a manual trigger) never re-deletes or double-counts.
      if (metadata.photos_purged === true) {
        skippedAlreadyPurged++;
        continue;
      }

      const closedAt = closedAtFor(task);

      try {
        const { data: attachments, error: attErr } = await admin
          .from('project_task_attachments')
          .select('storage_path')
          .eq('task_id', task.id);
        if (attErr) throw attErr;

        const paths = new Set<string>(
          (attachments ?? [])
            .map((r: any) => (typeof r.storage_path === 'string' ? r.storage_path : null))
            .filter((p: string | null): p is string => Boolean(p))
        );
        // Belt-and-braces: the primary observation photo path is also
        // carried directly on the task (campus-walk-service records it
        // there at creation), independent of whether its own attachment row
        // insert succeeded. Covers the rare case that insert failed.
        if (typeof metadata.photo_storage_path === 'string') {
          paths.add(metadata.photo_storage_path);
        }

        if (dryRun) {
          purged.push({ task_id: task.id, closed_at: closedAt, objects_removed: paths.size });
          continue;
        }

        if (paths.size > 0) {
          const { error: removeErr } = await admin.storage.from(BUCKET).remove([...paths]);
          if (removeErr) throw removeErr;
        }

        const { error: markErr } = await admin
          .from('project_tasks')
          .update({
            metadata: {
              ...metadata,
              photos_purged: true,
              photos_purged_at: new Date().toISOString(),
              photos_purged_object_count: paths.size
            }
          })
          .eq('id', task.id);
        if (markErr) throw markErr;

        purged.push({ task_id: task.id, closed_at: closedAt, objects_removed: paths.size });
      } catch (e: any) {
        // One task's failure must not abort the sweep — collected, not
        // thrown, and NOT marked purged so it is retried on the next run.
        const message = e?.message ?? String(e);
        console.error(`[cron/campus-walk-photo-retention] task ${task.id} failed:`, message);
        errors.push({ task_id: task.id, error: message });
      }
    }

    return NextResponse.json({
      success: true,
      dry_run: dryRun,
      retention_days: RETENTION_DAYS,
      cutoff: cutoffIso,
      candidates: candidates.length,
      purged: purged.length,
      purged_detail: purged,
      skipped_already_purged: skippedAlreadyPurged,
      errors: errors.length,
      error_detail: errors,
      capped: candidates.length >= MAX_TASKS_PER_RUN
    });
  } catch (e: any) {
    const message = e?.message ?? String(e);
    console.error('[cron/campus-walk-photo-retention] sweep failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
