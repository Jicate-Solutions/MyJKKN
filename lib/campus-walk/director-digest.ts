/**
 * Campus Walk — the Director's 8 am summary of jobs 7 days past due.
 *
 * Director ruling, 30 Sep 2026: a job nobody has touched climbs by itself —
 * the fixer's boss at 1 day late, the principal at 3, the Director at 7 — and
 * the Director gets ONE summary each morning listing every job that reached
 * him, grouped by college. Never one message per job.
 *
 * HOW A JOB GETS HERE: lib/campus-walk/chase-up.ts (the 08:00 IST ladder
 * cron) marks `metadata.campus_walk_chase.rungs_sent.reached_director` with
 * its run time when a job is 7 days late. It sends nothing itself. This file
 * (08:03 IST) lists every still-open job whose marker landed after the
 * previous summary's cutoff.
 *
 * STATE LIVES ON THE NOTIFICATION, NEVER ON THE TASK. This runs three minutes
 * after the ladder, which rewrites each task's whole `metadata` object; if the
 * summary wrote task metadata too, the two could overwrite each other. So the
 * summary writes nothing to project_tasks. Its own record is the notification
 * row: `idempotency_key = campus-walk-director-digest:<IST date>` (the
 * database's unique index makes it at most one per day) and
 * `metadata.cutoff`, which the next morning's run reads to know where to
 * start. A missed morning loses nothing — the next summary starts from the
 * last one that was actually sent.
 *
 * Jobs that were fixed or paused ("I can't fix this yet") before 08:03 are
 * left out: they are no longer late and untouched.
 *
 * CATCH-UP LINE: when the ladder folded a college's late jobs into ONE list to
 * its principal (deploy day, or after a missed morning — see
 * isCatchUpPrincipalStep in chase-up.ts), the summary says so in one line,
 * counted from those list notifications since the previous cutoff. A morning
 * with only that line still sends.
 *
 * Jobs the OLD ladder already paged to the Director (its day-5
 * `escalate_director` step) never get the day-7 marker, so they are neither
 * listed nor counted among "earlier summaries" — he has already heard.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import {
  resolveDirectors,
  daysPastDue,
  validateTargeting,
  type DirectorResolution
} from '@/lib/services/director-desk/handover-chase-service';
import { friendlyDate, jobLabel, placeOf, PRINCIPAL_LIST_CATEGORY } from '@/lib/campus-walk/chase-up';
import { logger } from '@/lib/utils/enhanced-logger';
import { listRepeatRooms, repeatRoomLine } from '@/lib/campus-walk/cctv';

const MODULE = 'campus-walk/director-digest';
const CAMPUS_OPS_PROJECT_CODE = 'CAMPUS-OPS';
const CAMPUS_WALK_SOURCE = 'campus-walk';
/** Same set the ladder never chases. */
const NOT_OPEN_STATUS_KEYS = ['review', 'done', 'cancelled', 'archived'];
export const DIRECTOR_DIGEST_CATEGORY = 'campus-walk:director-digest';
const IST_OFFSET_MS = 330 * 60 * 1000;
/** Past this many jobs the summary names the rest by count only, so it stays readable. */
const MAX_LISTED_JOBS = 60;
const NO_COLLEGE = 'College not recorded';
/** How far before the previous cutoff a marker may be stamped yet written after it (the ladder's maxDuration is 60 s). */
const LATE_WRITE_GRACE_MS = 10 * 60 * 1000;

/** The calendar date in India for a moment in time. */
export function istDateOf(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** At most one summary per IST day — the database's unique index enforces it. */
export function directorDigestIdempotencyKey(istDate: string): string {
  return `campus-walk-director-digest:${istDate}`;
}

export interface DigestJob {
  taskId: string;
  title: string;
  place: string | null;
  dueDate: string;
  daysOverdue: number;
  collegeName: string | null;
}

/**
 * The summary's words. Colleges in name order ("College not recorded" last),
 * the latest jobs first within a college. Plain and courteous: each line
 * names the job, the place and how late it is — nobody is named or blamed.
 */
export interface CatchUpCount {
  /** Colleges whose principal(s) got one catch-up list. */
  colleges: number;
  /** Jobs across those lists. */
  jobs: number;
}

/** The one line about catch-up lists, or null when there were none. */
export function catchUpLine(c: CatchUpCount | null | undefined): string | null {
  if (!c || c.colleges <= 0 || c.jobs <= 0) return null;
  return (
    `Catch-up: the principals of ${c.colleges} ${c.colleges === 1 ? 'college' : 'colleges'} got ` +
    `${c.jobs} late campus ${c.jobs === 1 ? 'job' : 'jobs'} as one list per college, not one message per job.`
  );
}

export function buildDirectorDigest(
  jobs: DigestJob[],
  opts: {
    earlierStillOpen: number;
    maxListed?: number;
    catchUp?: CatchUpCount | null;
    /**
     * CCTV repeat rooms with a NEW report since the previous summary
     * (Director, 9 Oct 2026: on the daily summary as well as the Monday
     * list). Lines from repeatRoomLine — rooms and counts, never names.
     */
    cctvRepeatRooms?: string[];
  }
): { title: string; body: string } {
  const maxListed = opts.maxListed ?? MAX_LISTED_JOBS;
  const byCollege = new Map<string, DigestJob[]>();
  for (const j of jobs) {
    const key = j.collegeName?.trim() || NO_COLLEGE;
    const list = byCollege.get(key) ?? [];
    list.push(j);
    byCollege.set(key, list);
  }
  const colleges = [...byCollege.keys()].sort((a, b) => {
    if (a === NO_COLLEGE) return 1;
    if (b === NO_COLLEGE) return -1;
    return a.localeCompare(b);
  });

  const n = jobs.length;
  const catchUp = catchUpLine(opts.catchUp);
  const lines: string[] =
    n > 0
      ? [
          `Good morning. ${n === 1 ? 'This job has' : `These ${n} jobs have`} now reached 7 days past ` +
            `${n === 1 ? 'its' : 'their'} due date and ${n === 1 ? 'is' : 'are'} still open. ` +
            `Each has already gone to the fixer's boss and, where one is on record, the college principal.`
        ]
      : ['Good morning. No campus job reached 7 days past its due date since the last summary.'];

  let listed = 0;
  for (const college of colleges) {
    const list = byCollege
      .get(college)!
      .slice()
      .sort((a, b) => b.daysOverdue - a.daysOverdue || a.title.localeCompare(b.title));
    if (listed >= maxListed) break;
    lines.push('', `${college} (${list.length})`);
    for (const j of list) {
      if (listed >= maxListed) break;
      lines.push(
        `• ${jobLabel(j.title, j.place)} — ${j.daysOverdue} days past due (was due ${friendlyDate(j.dueDate)})`
      );
      listed++;
    }
  }
  if (listed < n) {
    lines.push('', `…and ${n - listed} more on the Campus Operations board.`);
  }
  if (catchUp) {
    lines.push('', catchUp);
  }
  const cctvRooms = opts.cctvRepeatRooms ?? [];
  if (cctvRooms.length > 0) {
    lines.push('', `CCTV repeat rooms with a new report since the last summary (${cctvRooms.length}):`);
    for (const r of cctvRooms.slice(0, 20)) lines.push(`• ${r}`);
    if (cctvRooms.length > 20) lines.push(`…and ${cctvRooms.length - 20} more on Monday's list.`);
  }
  if (opts.earlierStillOpen > 0) {
    lines.push(
      '',
      `${opts.earlierStillOpen} ${opts.earlierStillOpen === 1 ? 'job' : 'jobs'} from earlier summaries ` +
        `${opts.earlierStillOpen === 1 ? 'is' : 'are'} also still open.`
    );
  }

  const collegeCount = colleges.length;
  if (n === 0 && !catchUp && cctvRooms.length > 0) {
    return {
      title: `Morning summary: ${cctvRooms.length} CCTV repeat ${cctvRooms.length === 1 ? 'room' : 'rooms'} with a new report`,
      body: lines.join('\n')
    };
  }
  if (n === 0 && opts.catchUp && catchUp) {
    const j = opts.catchUp.jobs;
    return {
      title: `Morning summary: ${j} late campus ${j === 1 ? 'job' : 'jobs'} sent to principals as one list per college`,
      body: lines.join('\n')
    };
  }
  return {
    title: `Morning summary: ${n} campus ${n === 1 ? 'job' : 'jobs'} 7 days past due${
      collegeCount > 1 ? ` across ${collegeCount} colleges` : ''
    }`,
    body: lines.join('\n')
  };
}

export interface DirectorDigestResult {
  ist_date: string;
  /** 'sent' | 'already_sent' (today's summary exists) | 'nothing_new' | 'failed' */
  outcome: 'sent' | 'already_sent' | 'nothing_new' | 'failed';
  jobs_listed: number;
  earlier_still_open: number;
  /** Catch-up lists (one per college) the ladder sent since the previous cutoff, and the jobs on them. */
  catch_up: CatchUpCount;
  previous_cutoff: string | null;
  director_resolution: DirectorResolution['source'] | 'none';
  errors: string[];
  elapsed_ms: number;
}

function toMs(v: unknown): number | null {
  if (typeof v !== 'string' || !v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Send (at most) one summary for today. Safe to call repeatedly: a second call
 * the same IST day finds today's row and stops before doing anything.
 */
export async function runCampusWalkDirectorDigest(
  opts: { client?: SupabaseClient; now?: Date } = {}
): Promise<DirectorDigestResult> {
  const startTime = Date.now();
  const db = opts.client ?? createServiceRoleClient();
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const istDate = istDateOf(now);
  const idempotencyKey = directorDigestIdempotencyKey(istDate);

  const result: DirectorDigestResult = {
    ist_date: istDate,
    outcome: 'nothing_new',
    jobs_listed: 0,
    earlier_still_open: 0,
    catch_up: { colleges: 0, jobs: 0 },
    previous_cutoff: null,
    director_resolution: 'none',
    errors: [],
    elapsed_ms: 0
  };
  const done = (outcome: DirectorDigestResult['outcome']) => {
    result.outcome = outcome;
    result.elapsed_ms = Date.now() - startTime;
    if (result.errors.length > 0) {
      logger.warn(MODULE, `run completed with ${result.errors.length} error(s)`, {
        sample: result.errors.slice(0, 5)
      });
    }
    return result;
  };

  const { data: today } = await db
    .from('notifications')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (today?.id) return done('already_sent');

  const { data: project, error: projectError } = await db
    .from('projects')
    .select('id')
    .eq('code', CAMPUS_OPS_PROJECT_CODE)
    .maybeSingle();
  if (projectError || !project?.id) {
    result.errors.push(`${CAMPUS_OPS_PROJECT_CODE} project not found — nothing to summarise`);
    return done('failed');
  }

  // Where the last summary that was actually sent stopped.
  const { data: previous } = await db
    .from('notifications')
    .select('created_at, metadata')
    .eq('category', DIRECTOR_DIGEST_CATEGORY)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const previousCutoff =
    (typeof previous?.metadata?.cutoff === 'string' && previous.metadata.cutoff) ||
    (previous?.created_at as string | undefined) ||
    null;
  result.previous_cutoff = previousCutoff;
  const previousCutoffMs = toMs(previousCutoff);
  const previousTaskIds = new Set<string>(
    Array.isArray(previous?.metadata?.task_ids) ? (previous.metadata.task_ids as string[]) : []
  );
  const nowMs = now.getTime();

  // Still-open, not paused, campus-walk jobs — the same candidate shape the
  // ladder uses, minus the due-date filter (the marker already says it was 7
  // days late when it was set; a job whose due date was pushed out by a pause
  // keeps its marker for the round).
  const { data: rows, error: selectError } = await db
    .from('project_tasks')
    .select('id, title, due_date, metadata')
    .eq('project_id', project.id)
    .eq('metadata->>source', CAMPUS_WALK_SOURCE)
    .eq('is_blocked', false)
    .not('due_date', 'is', null)
    .not('status_key', 'in', `(${NOT_OPEN_STATUS_KEYS.join(',')})`);
  if (selectError) {
    result.errors.push(`select failed: ${selectError.message}`);
    return done('failed');
  }

  const fresh: Array<{ row: any; institutionId: string | null }> = [];
  for (const row of (rows ?? []) as any[]) {
    const markerMs = toMs(row?.metadata?.campus_walk_chase?.rungs_sent?.reached_director);
    if (markerMs === null || markerMs > nowMs) continue;
    if (previousCutoffMs !== null && markerMs <= previousCutoffMs) {
      // The ladder stamps its marker with its START time but writes it up to
      // a minute later. On a morning the ladder ran late, a marker can carry a
      // time just before the previous summary's cutoff yet have landed after
      // that summary read the tasks. Such a job was never listed — list it
      // now, unless the previous summary's own task_ids show it was.
      const landedLate =
        markerMs > previousCutoffMs - LATE_WRITE_GRACE_MS && !previousTaskIds.has(String(row?.id));
      if (!landedLate) {
        result.earlier_still_open++;
        continue;
      }
    }
    const inst = row?.metadata?.institution_id;
    fresh.push({ row, institutionId: typeof inst === 'string' && inst ? inst : null });
  }

  // The ladder's catch-up lists since the previous summary (or, before the
  // first summary ever, the last day) — one row per college.
  const catchUpSince = previousCutoff ?? new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  const { data: lists, error: listsError } = await db
    .from('notifications')
    .select('metadata')
    .eq('category', PRINCIPAL_LIST_CATEGORY)
    .gt('created_at', catchUpSince);
  if (listsError) {
    // Not fatal: the jobs still go out; only the catch-up line is missing.
    result.errors.push(`catch-up lists could not be read: ${listsError.message}`);
  }
  for (const l of (lists ?? []) as any[]) {
    const ids = Array.isArray(l?.metadata?.task_ids) ? (l.metadata.task_ids as unknown[]).length : 0;
    if (ids > 0) {
      result.catch_up.colleges++;
      result.catch_up.jobs += ids;
    }
  }

  // CCTV repeat rooms whose latest report landed since the previous summary.
  // Not fatal: a failed read only drops this section.
  let cctvRepeatRooms: string[] = [];
  try {
    const sinceMs = previousCutoffMs ?? nowMs - 24 * 60 * 60 * 1000;
    cctvRepeatRooms = (await listRepeatRooms(db, new Date(nowMs)))
      .filter((r) => Date.parse(r.lastAt) > sinceMs)
      .map(repeatRoomLine);
  } catch (e: any) {
    result.errors.push(`CCTV repeat rooms could not be read: ${e?.message ?? e}`);
  }

  if (fresh.length === 0 && result.catch_up.colleges === 0 && cctvRepeatRooms.length === 0) return done('nothing_new');

  const collegeName = new Map<string, string>();
  const institutionIds = [...new Set(fresh.map((f) => f.institutionId).filter((v): v is string => Boolean(v)))];
  if (institutionIds.length > 0) {
    const { data: insts } = await db.from('institutions').select('id, name').in('id', institutionIds);
    for (const i of (insts ?? []) as any[]) {
      if (i?.id && typeof i.name === 'string' && i.name.trim()) collegeName.set(i.id, i.name.trim());
    }
  }

  const jobs: DigestJob[] = fresh.map(({ row, institutionId }) => ({
    taskId: row.id,
    title: String(row.title ?? ''),
    place: placeOf(row.metadata),
    dueDate: String(row.due_date),
    daysOverdue: daysPastDue(String(row.due_date), istDate),
    collegeName: institutionId ? collegeName.get(institutionId) ?? null : null
  }));

  const director = await resolveDirectors(db);
  result.director_resolution = director.source;
  const check = validateTargeting(director.ids);
  if (!check.ok) {
    result.errors.push(`no resolvable Director — ${check.reason}`);
    return done('failed');
  }

  const copy = buildDirectorDigest(jobs, {
    earlierStillOpen: result.earlier_still_open,
    catchUp: result.catch_up,
    cctvRepeatRooms
  });
  const notificationId = await createBellNotification(db, {
    recipientIds: check.userIds,
    createdBy: check.userIds[0],
    title: copy.title,
    body: copy.body,
    // No single-job page opens for the Director (the fix screen admits only
    // the fixer and their department head), so the summary opens the
    // Campus Operations board, where every listed job lives.
    url: `/projects/${project.id}`,
    category: DIRECTOR_DIGEST_CATEGORY,
    metadata: {
      source: CAMPUS_WALK_SOURCE,
      ist_date: istDate,
      cutoff: nowIso,
      previous_cutoff: previousCutoff,
      task_ids: jobs.map((j) => j.taskId),
      jobs_listed: jobs.length,
      catch_up_colleges: result.catch_up.colleges,
      catch_up_jobs: result.catch_up.jobs
    },
    idempotencyKey
  });

  if (!notificationId) {
    // null is either "today's already exists" (a race with another run) or a
    // real failure — tell them apart the same way chase-up.ts's sendRung does.
    const { data: existing } = await db
      .from('notifications')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing?.id) return done('already_sent');
    result.errors.push('summary notification could not be sent');
    return done('failed');
  }

  result.jobs_listed = jobs.length;
  return done('sent');
}
