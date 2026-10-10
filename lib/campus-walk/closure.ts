/**
 * Campus Walk — closing a job. The ONE place that writes status_key = 'done'.
 *
 * ── DIRECTOR'S RULING, 2026-09-30 (supersedes spec D4) ──────────────────────
 * "Make it easy for users to InstaSolver and for the action takers to resolve
 * it instantly." The fixer's after-photo closes the job at once — no approval
 * queue — for EVERY Campus Walk task, InstaSolver reports and walk jobs alike.
 * The person who reported it is told "fixed" and can tap "Not fixed" within
 * 7 days to reopen the same job (app/api/campus-walk/not-fixed/route.ts).
 *
 * Two callers, one closing path:
 *   · app/api/campus-walk/fix/route.ts     — the fixer's photo (auto: true)
 *   · app/api/campus-walk/review/route.ts  — a manager approving a job that was
 *                                            already waiting in the old queue
 *                                            before this ruling (auto: false)
 * Both write the SAME approval record, so the scoreboard's verified-closure rule
 * (lib/campus-walk/scoreboard.ts `isVerifiedClosure`: done + approved) keeps
 * counting correctly whichever door closed the job.
 *
 * ── COMPARE-AND-SET ─────────────────────────────────────────────────────────
 * The update only lands if status_key is still what the caller read. A second
 * tap on a corridor connection finds zero rows, re-reads, and reports the
 * closure that already stands instead of stamping it twice and ringing every
 * bell again. When the caller passes updated_at, the write also checks that,
 * and a report that JOINED since the caller read the job is put back before
 * the write lands (join-report.ts updateTaskKeepingJoins) — so the joiner is
 * still told it was fixed.
 *
 * ── 2026-09-30 INTERVIEW RULINGS 2 AND 3 ───────────────────────────────────
 *   · (2) people who JOINED an open report (metadata.additional_reports, see
 *     lib/campus-walk/join-report.ts) are told when it is fixed, too.
 *   · (3) 1 in 10 jobs closed by the fixer's photo is picked, at random, for a
 *     spot check (lib/campus-walk/spot-check.ts); the checker — never the
 *     fixer — is decided first, written in the same update as the closure, and
 *     belled after it.
 *
 * ── D10 ─────────────────────────────────────────────────────────────────────
 * No bell names who closed the job or who reported it. createdBy is always the
 * recipient themselves, so no other name can surface as "From:".
 *
 * ── FAIL SOFT ───────────────────────────────────────────────────────────────
 * The closure is the valuable part; the bells are the courtesy. A bell that
 * fails is reported back, never turned into an error that makes somebody tap
 * again.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import { NOT_FIXED_WINDOW_DAYS, joinedReporterIdsOf } from '@/lib/campus-walk/my-reports';
import { updateTaskKeepingJoins } from '@/lib/campus-walk/join-report';
import {
  SPOT_CHECKS_URL,
  checkerForClose,
  isSpotCheckPick,
  pendingSpotCheck,
  type SpotCheck,
  type SpotChecker,
} from '@/lib/campus-walk/spot-check';

/** The bell a reporter reads, and the page it opens. */
export const MY_REPORTS_URL = '/instasolver/my-reports';

/** How long after closure the reporter may still say "Not fixed". */
export { NOT_FIXED_WINDOW_DAYS };

export interface ClosableTask {
  id: string;
  title: string | null;
  /** The status_key as the caller last saw it — the compare-and-set version. */
  status_key: string;
  /**
   * updated_at as the caller last saw it. When given, the close also
   * compare-and-sets on it and puts back any report that JOINED in between
   * (lib/campus-walk/join-report.ts updateTaskKeepingJoins).
   */
  updated_at?: string | null;
  owner_staff_id: string | null;
  completed_at?: string | null;
  metadata: Record<string, any> | null;
}

export interface CloseOptions {
  /** Who closed it. The fixer on the photo path, the manager on the queue path. */
  decidedByProfileId: string;
  /** true = closed by the fixer's photo; false = a manager approved it. */
  auto: boolean;
  /** A manager's note on approval. Never set on the photo path. */
  note?: string | null;
  now?: Date;
  /** The 1-in-10 die (tests pass a fixed one). Defaults to crypto.randomInt. */
  spotCheckRoll?: () => boolean;
}

export type CloseResult =
  | {
      ok: true;
      /** true when an earlier request had already closed it — no bells rang. */
      already: boolean;
      statusKey: string;
      completedAt: string | null;
      metadata: Record<string, any>;
      /** true sent · false could not send · null not needed (fixer closed it). */
      fixerNotified: boolean | null;
      /** true sent (or already sent) · false failed · null nobody to tell. */
      reporterNotified: boolean | null;
      /** People who joined the report (ruling 2). Same meaning as reporterNotified. */
      joinedNotified?: boolean | null;
      /** Set when this closure was picked for a spot check (ruling 3). */
      spotCheck?: { checker: SpotChecker; notified: boolean | null } | null;
    }
  | {
      ok: false;
      code: 'nothing_submitted' | 'decision_not_saved' | 'raced';
      error: string;
      retryable?: boolean;
    };

/** The person who reported it: InstaSolver's reporter, else whoever raised it. */
export function reporterProfileIdOf(metadata: Record<string, any> | null | undefined): string | null {
  const m = metadata ?? {};
  if (typeof m.reporter_id === 'string' && m.reporter_id) return m.reporter_id;
  if (typeof m.raised_by_profile_id === 'string' && m.raised_by_profile_id) {
    return m.raised_by_profile_id;
  }
  return null;
}

/**
 * The Accountable's login, via project_task_assignees (role 'accountable'),
 * falling back to project_tasks.owner_staff_id — the same order the fix route
 * uses to decide who may close the job.
 */
export async function resolveAccountableProfileId(
  admin: SupabaseClient,
  task: Pick<ClosableTask, 'id' | 'owner_staff_id'>
): Promise<string | null> {
  const { data: accountable } = await admin
    .from('project_task_assignees')
    .select('staff_id')
    .eq('task_id', task.id)
    .eq('role', 'accountable')
    .maybeSingle();

  const staffId = (accountable?.staff_id as string | null) ?? task.owner_staff_id;
  if (!staffId) return null;

  const { data: staff } = await admin
    .from('staff')
    .select('profile_id')
    .eq('id', staffId)
    .maybeSingle();

  return (staff?.profile_id as string | null) ?? null;
}

/**
 * The person who sent the fix photo, falling back to the Accountable for a task
 * whose metadata was trimmed.
 */
export async function resolveFixerProfileId(
  admin: SupabaseClient,
  task: Pick<ClosableTask, 'id' | 'owner_staff_id'>,
  metadata: Record<string, any>
): Promise<string | null> {
  const submitted = metadata.fix?.submitted_by_profile_id;
  if (typeof submitted === 'string' && submitted) return submitted;
  return resolveAccountableProfileId(admin, task);
}

/**
 * One key per fix photo: a job reopened with "Not fixed" and fixed again tells
 * the reporter again, but a retried request for the SAME photo never does.
 * Old rows written before attachment_id existed fall back to the next most
 * specific thing on the record.
 */
export function reporterFixedIdempotencyKey(taskId: string, metadata: Record<string, any>): string {
  const fix = metadata.fix ?? {};
  const photoKey =
    (typeof fix.attachment_id === 'string' && fix.attachment_id) ||
    (typeof fix.storage_path === 'string' && fix.storage_path) ||
    (typeof fix.submitted_at === 'string' && fix.submitted_at) ||
    'legacy';
  return `instasolver-fixed:${taskId}:${photoKey}`;
}

export async function closeCampusWalkTask(
  admin: SupabaseClient,
  task: ClosableTask,
  opts: CloseOptions
): Promise<CloseResult> {
  const metadata: Record<string, any> = { ...((task.metadata ?? {}) as Record<string, any>) };
  if (!metadata.fix) {
    return {
      ok: false,
      code: 'nothing_submitted',
      error:
        'Nobody has sent a photo of the finished work for this job yet, so there is nothing to close.',
    };
  }

  const nowIso = (opts.now ?? new Date()).toISOString();
  const prior = (metadata.fix.approval ?? null) as Record<string, any> | null;

  metadata.fix = {
    ...(metadata.fix as Record<string, any>),
    approval: {
      state: 'approved',
      auto: opts.auto,
      decided_at: nowIso,
      decided_by_profile_id: opts.decidedByProfileId,
      note: opts.note ? String(opts.note) : null,
      previous_state: prior?.state ?? null,
      previous_note: prior?.note ?? null,
    },
  };

  // ── Ruling 3: the fake-fix guard (lib/campus-walk/spot-check.ts) ──────────
  // Only a job closed by the fixer's own photo. The checker is decided BEFORE
  // the write — never the fixer (a college head who sent the photo passes it up
  // to the Director) — and written in the SAME update as the closure, so a job
  // can never be closed-and-picked by halves.
  let fixerProfileId: string | null = null;
  let fixerLookupFailed = false;
  try {
    fixerProfileId = await resolveFixerProfileId(admin, task, metadata);
  } catch (e: any) {
    fixerLookupFailed = true;
    console.error('[campus-walk/closure] fixer lookup failed:', e?.message ?? e);
  }

  let spotCheck: SpotCheck | null = null;
  let spotCheckRecipients: string[] = [];
  if (opts.auto && isSpotCheckPick(metadata, opts.spotCheckRoll)) {
    const who = await checkerForClose(admin, metadata, fixerProfileId);
    spotCheck = pendingSpotCheck(metadata, nowIso, who, fixerProfileId);
    spotCheckRecipients = who.recipients;
    metadata.spot_check = spotCheck;
  }

  const written = await updateTaskKeepingJoins(admin, {
    taskId: task.id,
    expectStatus: task.status_key,
    updatedAt: task.updated_at ?? null,
    patch: { status_key: 'done', completed_at: nowIso },
    metadata,
  });

  if (written.ok === false && written.code === 'error') {
    console.error('[campus-walk/closure] close write failed:', written.error);
    return {
      ok: false,
      code: 'decision_not_saved',
      error: 'We could not close the job just now. Nothing was lost — please try again.',
      retryable: true,
    };
  }

  if (written.ok === false) {
    // Somebody — most likely this same request, a moment ago — got there
    // first. Report the closure that stands rather than an error for work that
    // already succeeded.
    const { data: fresh } = await admin
      .from('project_tasks')
      .select('status_key, completed_at, metadata')
      .eq('id', task.id)
      .maybeSingle();

    const freshMeta = (fresh?.metadata ?? {}) as Record<string, any>;
    if (fresh?.status_key === 'done' && freshMeta.fix?.approval?.state === 'approved') {
      return {
        ok: true,
        already: true,
        statusKey: 'done',
        completedAt: (fresh.completed_at as string | null) ?? null,
        metadata: freshMeta,
        fixerNotified: null,
        reporterNotified: null,
      };
    }
    return {
      ok: false,
      code: 'raced',
      error: 'This job changed while you were looking at it. Refresh to see where it stands.',
    };
  }

  // Joins that landed while we were writing are in here — they hear it too.
  Object.assign(metadata, written.metadata);

  const shortTitle = String(task.title ?? 'Campus job').slice(0, 100);

  // ── The fixer (skipped when the fixer is the one who closed it) ───────────
  let fixerNotified: boolean | null = null;
  try {
    if (fixerLookupFailed) {
      fixerNotified = false;
    } else if (!fixerProfileId) {
      fixerNotified = false;
      console.error(`[campus-walk/closure] job closed but no fixer to tell (task ${task.id})`);
    } else if (fixerProfileId !== opts.decidedByProfileId) {
      const id = await createBellNotification(admin, {
        recipientIds: [fixerProfileId],
        createdBy: fixerProfileId,
        title: `Campus job closed — ${shortTitle}`,
        body: `Your photo was accepted and “${shortTitle}” is now closed.${
          opts.note ? ` Note: ${opts.note}` : ''
        }`,
        url: `/campus-walk/fix?task=${task.id}`,
        category: 'campus-walk:approved',
        metadata: { task_id: task.id, source: 'campus-walk', decision: 'approve', auto: opts.auto },
      });
      fixerNotified = Boolean(id);
      if (!id) console.error(`[campus-walk/closure] job closed but fixer bell failed (task ${task.id})`);
    }
  } catch (e: any) {
    console.error('[campus-walk/closure] fixer notification failed:', e?.message ?? e);
    fixerNotified = false;
  }

  // ── The reporter ──────────────────────────────────────────────────────────
  // Not told when they are the one who fixed it or closed it — a bell about
  // your own action is noise.
  let reporterNotified: boolean | null = null;
  const reporterId = reporterProfileIdOf(metadata);
  if (reporterId && reporterId !== fixerProfileId && reporterId !== opts.decidedByProfileId) {
    try {
      await createBellNotification(admin, {
        recipientIds: [reporterId],
        createdBy: reporterId,
        title: metadata.fix?.reply ? 'Your report has a reply' : 'Your report was fixed',
        // A CCTV report is answered in words, not with a photo (fix route `reply`).
        body: metadata.fix?.reply
          ? `“${shortTitle}” was answered: “${String(metadata.fix.reply).slice(0, 300)}”. ` +
            `Not dealt with? Open My reports within ${NOT_FIXED_WINDOW_DAYS} days and tap “Not fixed”.`
          : `“${shortTitle}” has been marked fixed, with a photo of the finished work. ` +
            `Not fixed? Open My reports within ${NOT_FIXED_WINDOW_DAYS} days and tap “Not fixed”.`,
        url: MY_REPORTS_URL,
        category: 'instasolver:reported-fixed',
        metadata: {
          task_id: task.id,
          source: 'campus-walk',
          front_door: metadata.front_door ?? null,
          attachment_id: metadata.fix?.attachment_id ?? null,
        },
        idempotencyKey: reporterFixedIdempotencyKey(task.id, metadata),
      });
      // A NULL return is not a failure: createBellNotification returns null
      // when the idempotency index already holds this key — the reporter HAS
      // been told about this photo. Only a throw means nobody was told.
      reporterNotified = true;
    } catch (e: any) {
      console.error('[campus-walk/closure] reporter notification failed:', e?.message ?? e);
      reporterNotified = false;
    }
  }

  // ── Everyone who joined the report (ruling 2) ─────────────────────────────
  // One bell to all of them, keyed per fix photo like the reporter's.
  let joinedNotified: boolean | null = null;
  const joined = joinedReporterIdsOf(metadata).filter(
    (id) => id !== reporterId && id !== fixerProfileId && id !== opts.decidedByProfileId
  );
  if (joined.length > 0) {
    try {
      await createBellNotification(admin, {
        recipientIds: joined,
        createdBy: joined[0],
        title: 'A problem you reported was fixed',
        body: `“${shortTitle}” — which you also reported — has been marked fixed, with a photo of the finished work. See it on My reports.`,
        url: MY_REPORTS_URL,
        category: 'instasolver:reported-fixed',
        metadata: { task_id: task.id, source: 'campus-walk', joined: true },
        idempotencyKey: `${reporterFixedIdempotencyKey(task.id, metadata)}:joined`,
      });
      joinedNotified = true;
    } catch (e: any) {
      console.error('[campus-walk/closure] joined-reporter notification failed:', e?.message ?? e);
      joinedNotified = false;
    }
  }

  // ── The spot checker (ruling 3) ───────────────────────────────────────────
  let spotCheckNotified: boolean | null = null;
  if (spotCheck) {
    spotCheckNotified = false;
    try {
      const checkers = spotCheckRecipients.filter((id) => id !== fixerProfileId);
      if (checkers.length === 0) {
        console.error(`[campus-walk/closure] picked for a spot check but nobody to tell (task ${task.id})`);
      } else {
        await createBellNotification(admin, {
          recipientIds: checkers,
          createdBy: checkers[0],
          title: `Spot check — ${shortTitle}`,
          body: `“${shortTitle}” was closed with a photo and picked for a spot check. Look at the before and after photos and say whether it looks fixed.`,
          url: SPOT_CHECKS_URL,
          category: 'campus-walk:spot-check',
          metadata: { task_id: task.id, source: 'campus-walk', checker: spotCheck.checker },
          idempotencyKey: `campus-walk-spot-check:${reporterFixedIdempotencyKey(task.id, metadata)}`,
        });
        spotCheckNotified = true;
      }
    } catch (e: any) {
      console.error('[campus-walk/closure] spot-check notification failed:', e?.message ?? e);
    }
  }

  return {
    ok: true,
    already: false,
    statusKey: 'done',
    completedAt: nowIso,
    metadata,
    fixerNotified,
    reporterNotified,
    joinedNotified,
    spotCheck: spotCheck ? { checker: spotCheck.checker, notified: spotCheckNotified } : null,
  };
}
