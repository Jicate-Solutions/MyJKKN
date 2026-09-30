/**
 * Campus Walk — joining an open report instead of filing a second one.
 *
 * Director's ruling, 2026-09-30 interview (2): when several people report the
 * same problem, a new broken-thing report that matches an OPEN job at the same
 * place JOINS that job. Every joined reporter is told when it is fixed
 * (lib/campus-walk/closure.ts) and sees it on My reports
 * (app/(routes)/instasolver/my-reports).
 *
 * The decision "is this the same problem" is the pure matcher in
 * lib/campus-walk/duplicates.ts `findOpenReportToJoin` (thresholds there).
 * This file is only the database side: read the candidates, write the join.
 *
 * ── ONE ARRAY FOR BOTH DOORS ────────────────────────────────────────────────
 * A join is an entry in metadata.additional_reports — the exact shape the
 * QR-sticker door (#4146, app/api/instasolver/resource-report) writes, with
 * the same 50-entry cap — so whichever door someone joined through, one list
 * tells them it is fixed.
 *
 * ── NEVER LOSE A REPORT ─────────────────────────────────────────────────────
 * Any failure here returns "not joined" and the caller files a new job as it
 * always did. Two jobs for one fault is a nuisance; a report that vanished is
 * the failure this lane exists to prevent.
 *
 * ── D10 ─────────────────────────────────────────────────────────────────────
 * The owner is told the job was reported again, never by whom.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import {
  JOIN_CLOSED_STATUSES,
  JOIN_WINDOW_DAYS,
  findOpenReportToJoin,
  type OpenReportCandidate,
} from '@/lib/campus-walk/duplicates';
import { MAX_JOINED_REPORTS, mergeJoinedReports } from '@/lib/campus-walk/my-reports';

/** How many extra reports one task keeps — same cap as the QR-sticker door. */
export { MAX_JOINED_REPORTS };

/** A campus-ops backlog for one college over 14 days is tens of rows. */
const CANDIDATE_LIMIT = 200;

export interface JoinableTask {
  id: string;
  title: string | null;
  status_key: string;
  owner_staff_id: string | null;
  due_date: string | null;
  /** The compare-and-set version (bumped by the updated_at trigger on every write). */
  updated_at?: string | null;
  metadata: Record<string, any> | null;
}

export interface JoinEntry {
  reporter_id: string;
  raised_by_profile_id: string;
  reporter_role: string | null;
  note: string;
  photo_storage_path: string | null;
  at: string;
}

/**
 * The open job this report should join, or null. Never throws: an unreadable
 * candidate list means "file a new one".
 */
export async function findJoinableReport(
  admin: SupabaseClient,
  report: { institutionId: string | null; location: string; description: string; now?: number }
): Promise<JoinableTask | null> {
  if (!report.institutionId) return null;
  const now = report.now ?? Date.now();
  const since = new Date(now - JOIN_WINDOW_DAYS * 86_400_000).toISOString();
  try {
    const { data, error } = await admin
      .from('project_tasks')
      .select('id, title, description, status_key, owner_staff_id, due_date, created_at, updated_at, metadata')
      .eq('metadata->>source', 'campus-walk')
      .eq('metadata->>institution_id', report.institutionId)
      .gte('created_at', since)
      .not('status_key', 'in', `(${JOIN_CLOSED_STATUSES.join(',')})`)
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_LIMIT);
    if (error) {
      console.error('[campus-walk/join-report] candidate read failed — filing a new job:', error.message);
      return null;
    }
    const rows = (data ?? []) as Array<Record<string, any>>;
    const candidates: OpenReportCandidate[] = rows.map((r) => {
      const m = (r.metadata ?? {}) as Record<string, any>;
      return {
        taskId: r.id as string,
        institutionId: typeof m.institution_id === 'string' ? m.institution_id : null,
        location: typeof m.location === 'string' ? m.location : null,
        description: (r.description as string | null) ?? null,
        statusKey: r.status_key as string,
        createdAt: r.created_at as string,
      };
    });
    const match = findOpenReportToJoin({
      institutionId: report.institutionId,
      location: report.location,
      description: report.description,
      candidates,
      now,
    });
    if (!match) return null;
    const row = rows.find((r) => r.id === match.taskId);
    return row
      ? {
          id: row.id,
          title: row.title ?? null,
          status_key: row.status_key,
          owner_staff_id: row.owner_staff_id ?? null,
          due_date: row.due_date ?? null,
          updated_at: row.updated_at ?? null,
          metadata: row.metadata ?? null,
        }
      : null;
  } catch (e: any) {
    console.error('[campus-walk/join-report] candidate lookup threw — filing a new job:', e?.message ?? e);
    return null;
  }
}

/** How many times a write re-reads and tries again when the row moved under it. */
export const JOIN_WRITE_ATTEMPTS = 3;

/**
 * Add this report to the open job.
 *
 * Compare-and-set on BOTH status_key and updated_at (repair round, 1 Oct).
 * status_key alone let two people who reported the same leak seconds apart
 * both land — and the second write, carrying the metadata it read before the
 * first, erased the first joiner. project_tasks.updated_at is bumped by the
 * trg_project_tasks_updated_at BEFORE UPDATE trigger
 * (20260528000000_pm_projects_foundation.sql), so any write in between makes
 * this one miss; it then re-reads the row and appends to what is there now.
 * A job that closed in the meantime is not joined — the caller files a new one.
 * `ok: true` only when the join landed; the owner is then belled.
 */
export async function joinOpenReport(
  admin: SupabaseClient,
  task: JoinableTask,
  entry: JoinEntry,
  ownerProfileId: string | null
): Promise<{ ok: boolean }> {
  let current: { status_key: string; updated_at: string | null; metadata: Record<string, any> | null } = {
    status_key: task.status_key,
    updated_at: task.updated_at ?? null,
    metadata: task.metadata,
  };

  let landed = false;
  try {
    for (let attempt = 1; attempt <= JOIN_WRITE_ATTEMPTS && !landed; attempt++) {
      if ((JOIN_CLOSED_STATUSES as readonly string[]).includes(current.status_key)) {
        console.error(`[campus-walk/join-report] job closed before the join landed (task ${task.id}) — filing a new job`);
        return { ok: false };
      }
      const meta = { ...((current.metadata ?? {}) as Record<string, any>) };
      const previous = Array.isArray(meta.additional_reports) ? (meta.additional_reports as unknown[]) : [];
      meta.additional_reports = [...previous, entry].slice(-MAX_JOINED_REPORTS);

      let q = admin
        .from('project_tasks')
        .update({ metadata: meta })
        .eq('id', task.id)
        .eq('status_key', current.status_key);
      // A row read without updated_at (never, from findJoinableReport) falls
      // back to the status-only guard rather than refusing to join.
      if (current.updated_at) q = q.eq('updated_at', current.updated_at);
      const { data, error } = await q.select('id');
      if (error) {
        console.error(`[campus-walk/join-report] join write failed (task ${task.id}) — filing a new job:`, error.message);
        return { ok: false };
      }
      if ((data ?? []).length > 0) {
        landed = true;
        break;
      }
      if (!current.updated_at) break;

      // The row moved. Re-read it and append to what is there NOW.
      const { data: fresh, error: readErr } = await admin
        .from('project_tasks')
        .select('status_key, updated_at, metadata')
        .eq('id', task.id)
        .maybeSingle();
      if (readErr || !fresh) {
        console.error(`[campus-walk/join-report] re-read failed (task ${task.id}) — filing a new job:`, readErr?.message ?? 'gone');
        return { ok: false };
      }
      if ((fresh.updated_at as string | null) === current.updated_at) {
        // The row did NOT move, yet the guard missed: the updated_at round trip
        // is not matching. Safe side — file a new job, and say so loudly.
        console.error(
          `[campus-walk/join-report] updated_at guard did not match an unchanged row (task ${task.id}) — filing a new job`
        );
        return { ok: false };
      }
      current = {
        status_key: fresh.status_key as string,
        updated_at: (fresh.updated_at as string | null) ?? null,
        metadata: (fresh.metadata as Record<string, any> | null) ?? null,
      };
    }
  } catch (e: any) {
    console.error('[campus-walk/join-report] join threw — filing a new job:', e?.message ?? e);
    return { ok: false };
  }
  if (!landed) {
    console.error(`[campus-walk/join-report] join did not land (task ${task.id}) — filing a new job`);
    return { ok: false };
  }

  // The owner hears it was reported again (fail soft, never by whom).
  if (ownerProfileId && ownerProfileId !== entry.reporter_id) {
    try {
      const shortTitle = String(task.title ?? 'Campus job').slice(0, 100);
      await createBellNotification(admin, {
        recipientIds: [ownerProfileId],
        createdBy: ownerProfileId,
        title: `Reported again — ${shortTitle}`,
        body: `Someone else has reported “${shortTitle}”: ${entry.note.slice(0, 200)}`,
        url: `/campus-walk/fix?task=${task.id}`,
        category: 'instasolver:report-joined',
        metadata: { task_id: task.id, source: 'campus-walk' },
      });
    } catch (e: any) {
      console.error('[campus-walk/join-report] owner bell failed:', e?.message ?? e);
    }
  }
  return { ok: true };
}

export type GuardedWriteResult =
  | { ok: true; updatedAt: string | null; metadata: Record<string, any> }
  | { ok: false; code: 'error' | 'raced'; error: string };

/**
 * A whole-metadata write on an OPEN job that must not erase a join that landed
 * after the caller read the row (repair round, 1 Oct — the fixer's photo step
 * read the job before its upload, and a join during the upload was wiped).
 *
 * Compare-and-set on status_key (as before) AND updated_at. On a miss with the
 * status unchanged, it re-reads, puts back any joined reports that arrived
 * (mergeJoinedReports), and tries again. Other fields stay the caller's —
 * exactly what the unguarded write did. With no updatedAt (an old caller) it is
 * the plain status_key compare-and-set.
 */
export async function updateTaskKeepingJoins(
  admin: SupabaseClient,
  opts: {
    taskId: string;
    expectStatus: string | null;
    updatedAt: string | null | undefined;
    patch: Record<string, unknown>;
    metadata: Record<string, any>;
  }
): Promise<GuardedWriteResult> {
  let metadata = opts.metadata;
  let updatedAt = opts.updatedAt ?? null;
  for (let attempt = 1; attempt <= JOIN_WRITE_ATTEMPTS; attempt++) {
    let q = admin
      .from('project_tasks')
      .update({ ...opts.patch, metadata })
      .eq('id', opts.taskId);
    if (opts.expectStatus !== null) q = q.eq('status_key', opts.expectStatus);
    if (updatedAt) q = q.eq('updated_at', updatedAt);
    const { data, error } = await q.select('id, updated_at');
    if (error) return { ok: false, code: 'error', error: error.message };
    const rows = (data ?? []) as Array<{ id: string; updated_at?: string | null }>;
    if (rows.length > 0) return { ok: true, updatedAt: rows[0]?.updated_at ?? null, metadata };
    if (!updatedAt) return { ok: false, code: 'raced', error: 'status changed' };

    const { data: fresh, error: readErr } = await admin
      .from('project_tasks')
      .select('status_key, updated_at, metadata')
      .eq('id', opts.taskId)
      .maybeSingle();
    if (readErr) return { ok: false, code: 'error', error: readErr.message };
    if (!fresh || (opts.expectStatus !== null && fresh.status_key !== opts.expectStatus)) {
      return { ok: false, code: 'raced', error: 'status changed' };
    }
    metadata = mergeJoinedReports(metadata, (fresh.metadata as Record<string, any> | null) ?? null);
    if ((fresh.updated_at as string | null) === updatedAt) {
      // The row did NOT move, yet the guard missed: the updated_at round trip
      // is not matching. Never let that stop a fix photo closing a job — fall
      // back to the status-only write this step had before, and say so loudly.
      console.error(
        `[campus-walk/join-report] updated_at guard did not match an unchanged row (task ${opts.taskId}) — writing without it`
      );
      updatedAt = null;
      continue;
    }
    updatedAt = (fresh.updated_at as string | null) ?? null;
  }
  return { ok: false, code: 'raced', error: 'the job kept changing' };
}
