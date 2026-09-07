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
// found to have none). Idempotency key: metadata.photo_retention's own
// `last_evaluated_closed_at`, compared against THIS closure's closedAt (not
// a bare "ever purged" boolean) — see the Ruling 1 section below for why a
// bare boolean is wrong once a task can be reopened and closed again.
//
// ── RULING 1 (Director, 2026-08-2x): keep one photo per occurrence on a
//    recurring problem ───────────────────────────────────────────────────
// Plain deletion at 90 days is right for a one-off ticket, but wrong for a
// problem that keeps coming back: lib/campus-walk/repeats.ts's "same as
// before" (D7) reopens the SAME task and appends to metadata.occurrences,
// so a corridor that floods nine times shows "9th time" with no photographic
// evidence behind the number by the time anyone wants to fund a permanent
// fix.
//
// What "per occurrence" means in THIS schema, stated plainly: D7's reopen
// (repeats.ts, read-only to this file) never attaches a new photo — it only
// flips status/due-date/routing and logs a dated entry with no photo
// reference. The only problem photo this data model can ever address is the
// ORIGINAL filing's primary photo (metadata.photo_storage_path, written once
// by campus-walk-service.ts at intake and never touched by a reopen). So
// today "keep the primary problem photo for each occurrence" reduces to
// "keep that one photo, forever, once the task is known to be recurring" —
// there is no second, third, ... ninth problem photo to separately keep
// because none is ever captured. If a future change gives "same as before"
// its own photo capture step, extend `primaryProblemPhotoPath` below (and
// the keep-set it feeds) to also retain that occurrence's own path; nothing
// here should be read as claiming evidence exists for occurrences 2-9 today.
//
// Recurring is decided by lib/campus-walk/repeats.ts's own
// `getOccurrenceCount()` (occurrence_count > 1) rather than a second,
// driftable copy of that arithmetic. Fix photos are NEVER kept by this rule
// — the ruling is explicit that only the primary PROBLEM photo survives,
// not "the whole set" (a task's 2nd/3rd original angle) and not the fix
// chain; those still purge at 90 days exactly as before.
//
// The decision is recorded on the task itself (metadata.photo_retention),
// keyed to the closedAt it was made for, so a rerun (Vercel retry, or the
// task closing again after a LATER recurrence) never re-evaluates from
// scratch for the same closure, but does correctly re-evaluate a fresh
// closure after a reopen — a bare "photos_purged: true" boolean would
// silently skip that fresh closure forever, since repeats.ts's reopen does
// not (and should not, per this file's scope) clear that flag.
//
// A task already marked purged is skipped, so re-running this cron never
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
import { getOccurrenceCount } from '@/lib/campus-walk/repeats';

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
  /** Ruling 1: photo(s) deliberately NOT removed because this task is a
   *  recurring problem. Empty for a task that has never recurred. */
  kept_storage_paths: string[];
  /** Plain-English reason for kept_storage_paths, or null when nothing was kept. */
  kept_reason: string | null;
}

interface PurgeError {
  task_id: string;
  error: string;
}

interface AttachmentRow {
  storage_path: string | null;
  version: number | null;
  is_final_report: boolean | null;
  created_at: string;
}

/**
 * Ruling 1 — the one photo this task's occurrence history keeps past 90
 * days. Always metadata.photo_storage_path: the original observation's
 * primary photo, written once at intake by campus-walk-service.ts and never
 * touched by a D7 reopen (lib/campus-walk/repeats.ts). Falls back to the
 * earliest non-fix attachment row (lowest version, then earliest created_at)
 * for the rare case that field's own insert failed at intake — the same
 * fallback app/api/campus-walk/fix/route.ts already uses for its own
 * "primaryObservation" lookup, reused here rather than re-guessed.
 */
function primaryProblemPhotoPath(metadata: Record<string, any>, attachments: AttachmentRow[]): string | null {
  if (typeof metadata.photo_storage_path === 'string' && metadata.photo_storage_path.length > 0) {
    return metadata.photo_storage_path;
  }
  const originals = attachments
    .filter((a): a is AttachmentRow & { storage_path: string } => typeof a.storage_path === 'string' && a.is_final_report !== true)
    .sort(
      (a, b) => (a.version ?? 0) - (b.version ?? 0) || Date.parse(a.created_at) - Date.parse(b.created_at)
    );
  return originals[0]?.storage_path ?? null;
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
      const closedAt = closedAtFor(task);

      // Idempotent per CLOSURE, not per task: keyed to this closure's own
      // closedAt rather than a bare "ever purged" boolean. A bare boolean
      // would skip this task forever the first time it is purged, including
      // after a LATER D7 reopen closes it again with a fresh fix photo to
      // evaluate — repeats.ts does not (and should not, per this file's
      // scope) clear that flag on reopen, so the dedupe key has to be the
      // thing that changes across a reopen instead.
      const priorRetention = (metadata.photo_retention ?? null) as
        | { last_evaluated_closed_at?: string }
        | null;
      if (closedAt && priorRetention?.last_evaluated_closed_at === closedAt) {
        skippedAlreadyPurged++;
        continue;
      }

      try {
        const { data: attachments, error: attErr } = await admin
          .from('project_task_attachments')
          .select('storage_path, version, is_final_report, created_at')
          .eq('task_id', task.id)
          .order('version', { ascending: true })
          .order('created_at', { ascending: true });
        if (attErr) throw attErr;

        const attachmentRows = (attachments ?? []) as AttachmentRow[];

        const paths = new Set<string>(
          attachmentRows
            .map((r) => (typeof r.storage_path === 'string' ? r.storage_path : null))
            .filter((p: string | null): p is string => Boolean(p))
        );
        // Belt-and-braces: the primary observation photo path is also
        // carried directly on the task (campus-walk-service records it
        // there at creation), independent of whether its own attachment row
        // insert succeeded. Covers the rare case that insert failed.
        if (typeof metadata.photo_storage_path === 'string') {
          paths.add(metadata.photo_storage_path);
        }

        // ── Ruling 1: recurring problem keeps its one problem photo ──────
        // "Recurring" is repeats.ts's own occurrence_count > 1, not a second
        // copy of that arithmetic. Fix photos are never kept here, and
        // neither is anything beyond the single primary — only that one
        // path is ever excluded from removal.
        const occurrenceCount = getOccurrenceCount(metadata);
        const isRecurring = occurrenceCount > 1;
        const primaryPath = isRecurring ? primaryProblemPhotoPath(metadata, attachmentRows) : null;
        const keepPaths = new Set<string>(primaryPath ? [primaryPath] : []);
        const keptReason = primaryPath
          ? `Recurring problem (occurrence #${occurrenceCount}) — primary problem photo kept as evidence; everything else purges on schedule.`
          : null;
        const pathsToRemove = [...paths].filter((p) => !keepPaths.has(p));

        if (dryRun) {
          purged.push({
            task_id: task.id,
            closed_at: closedAt,
            objects_removed: pathsToRemove.length,
            kept_storage_paths: [...keepPaths],
            kept_reason: keptReason
          });
          continue;
        }

        if (pathsToRemove.length > 0) {
          const { error: removeErr } = await admin.storage.from(BUCKET).remove(pathsToRemove);
          if (removeErr) throw removeErr;
        }

        const evaluatedAt = new Date().toISOString();
        const { error: markErr } = await admin
          .from('project_tasks')
          .update({
            metadata: {
              ...metadata,
              // Kept for any reader of the old shape ("marked with
              // whether/when the purge ran" per this file's own header) —
              // photos_purged_object_count now reflects what was actually
              // removed (excludes anything kept under Ruling 1).
              photos_purged: true,
              photos_purged_at: evaluatedAt,
              photos_purged_object_count: pathsToRemove.length,
              // The auditable, rerun-safe record: what this run decided and
              // why, keyed to the closure it was decided for.
              photo_retention: {
                last_evaluated_at: evaluatedAt,
                last_evaluated_closed_at: closedAt,
                occurrence_count_at_evaluation: occurrenceCount,
                kept_storage_paths: [...keepPaths],
                kept_reason: keptReason
              }
            }
          })
          .eq('id', task.id);
        if (markErr) throw markErr;

        purged.push({
          task_id: task.id,
          closed_at: closedAt,
          objects_removed: pathsToRemove.length,
          kept_storage_paths: [...keepPaths],
          kept_reason: keptReason
        });
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
