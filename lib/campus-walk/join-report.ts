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

/** How many extra reports one task keeps — same cap as the QR-sticker door. */
export const MAX_JOINED_REPORTS = 50;

/** A campus-ops backlog for one college over 14 days is tens of rows. */
const CANDIDATE_LIMIT = 200;

export interface JoinableTask {
  id: string;
  title: string | null;
  status_key: string;
  owner_staff_id: string | null;
  due_date: string | null;
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
      .select('id, title, description, status_key, owner_staff_id, due_date, created_at, metadata')
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
          metadata: row.metadata ?? null,
        }
      : null;
  } catch (e: any) {
    console.error('[campus-walk/join-report] candidate lookup threw — filing a new job:', e?.message ?? e);
    return null;
  }
}

/**
 * Add this report to the open job. Compare-and-set on status_key, so a job
 * that was closed a moment ago is not joined — the caller files a new one.
 * `ok: true` only when the join landed; the owner is then belled.
 */
export async function joinOpenReport(
  admin: SupabaseClient,
  task: JoinableTask,
  entry: JoinEntry,
  ownerProfileId: string | null
): Promise<{ ok: boolean }> {
  const meta = { ...((task.metadata ?? {}) as Record<string, any>) };
  const previous = Array.isArray(meta.additional_reports) ? (meta.additional_reports as unknown[]) : [];
  meta.additional_reports = [...previous, entry].slice(-MAX_JOINED_REPORTS);

  try {
    const { data, error } = await admin
      .from('project_tasks')
      .update({ metadata: meta })
      .eq('id', task.id)
      .eq('status_key', task.status_key)
      .select('id');
    if (error || (data ?? []).length === 0) {
      console.error(
        `[campus-walk/join-report] join did not land (task ${task.id}) — filing a new job:`,
        error?.message ?? 'status changed'
      );
      return { ok: false };
    }
  } catch (e: any) {
    console.error('[campus-walk/join-report] join threw — filing a new job:', e?.message ?? e);
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
