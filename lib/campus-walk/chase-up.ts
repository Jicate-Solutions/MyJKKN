/**
 * Campus Walk — the chase-up ladder.
 *
 * The problem this file exists to solve: a photographed campus condition
 * becomes a project_tasks row (lib/services/campus-walk/campus-walk-service.ts)
 * with a due date, and then nothing in this codebase ever looks at it again
 * once it goes overdue. app/api/cron/grievance-sla-breach-check/route.ts is
 * the named precedent for "a cron that watches a due date" — but read closely,
 * it only FLAGS (sla_breached_at). It never notifies anyone and never
 * escalates. This file does both, for campus-walk tasks specifically.
 *
 * The ladder (Director ruling, 30 Sep 2026 — replaces the D5 reminders):
 * counted in whole days past `due_date`, using the same `daysPastDue`
 * arithmetic imported below, a job nobody has touched climbs BY ITSELF —
 *   day 1  -> escalate_boss       the fixer's boss: their department head,
 *                                 else their reporting manager
 *                                 (hr_staff_details.reports_to_staff_id), else
 *                                 the estate office (the CAMPUS-OPS project
 *                                 owner). The fixer is on the same message.
 *   day 3  -> escalate_principal  the college's principal(s), found from
 *                                 metadata.institution_id. The fixer and the
 *                                 boss are on the same message.
 *   day 7  -> reached_director    NO per-job message. The job is marked, and
 *                                 lib/campus-walk/director-digest.ts lists it
 *                                 in the Director's ONE 8 am summary, grouped
 *                                 by college.
 * Every climb message ends with one line naming everyone it went to, so each
 * person knows who else was told. The wording is plain and courteous: it
 * names the job and the place, never blames anyone.
 *
 * A job already marked with the old D5 day-3 rung (`escalate_accountable`,
 * which went to the same department head / CAMPUS-OPS owner) counts as
 * having had its day-1 climb, so the boss is not told twice. A job already
 * marked with the old D5 day-5 rung (`escalate_director`, a per-job page to
 * the Director) counts as having reached him, so it is never marked again
 * and never appears in his morning summary — he has already heard about it.
 *
 * CATCH-UP (deploy day, a missed morning): on a healthy daily run the
 * principal step fires at exactly 3 days late. A job whose principal step
 * comes due LATER than that was missed — above all, every job already 3+ days
 * late on the first morning after this ladder goes live. When a college has
 * any such job in a run, ALL of that college's principal steps in the run go
 * out as ONE list to its principal(s), never one message per job (see
 * sendPrincipalList). The Director's morning summary carries one line about
 * it. A college with no catch-up job that morning gets the ordinary per-job
 * message, fixer and boss copied.
 *
 * WHO IS "THE ACCOUNTABLE": project_task_assignees.role='accountable',
 * falling back to project_tasks.owner_staff_id — the identical fallback order
 * app/api/campus-walk/fix/route.ts uses to decide who may close the ticket
 * (campus-walk-service.ts sets both to the same person by construction, but
 * the assignees insert is best-effort there, so the fallback matters).
 *
 * WHAT THIS FILE NEVER TOUCHES: a task with `is_blocked = true` (D8 — money,
 * materials, access, a contractor, or an approved-leave auto-pause) is
 * excluded at the query. A paused clock does not advance the ladder and does
 * not get chased — see the query comment below for exactly how that pairs
 * with `due_date`.
 *
 * IDEMPOTENCY, TWO LAYERS (deliberate, not redundant):
 *   1. `notifications.idempotency_key` (`campus-walk-chase:<rung>:<task_id>`,
 *      no date component — each rung fires AT MOST ONCE per round, not once
 *      per day; a reporter's "Not fixed" starts a new round with a `:r<n>`
 *      suffix, see chaseRungIdempotencyKey) is the actual enforcement, exactly per the rule documented at
 *      meeting-trigger-service.ts:44-51: a read-then-write check lets two
 *      overlapping runs both decide "not sent yet" and both send; the DB's
 *      partial unique index cannot race.
 *   2. `project_tasks.metadata.campus_walk_chase.rungs_sent` is the fast-path
 *      skip + audit trail the brief asks for, so a normal rerun does not even
 *      attempt the insert for a rung already sent. It is a cache of what the
 *      DB already knows, not the source of truth.
 * createBellNotification's `null` return is ambiguous between "duplicate
 * (23505)" and "genuinely failed to insert" (meeting-trigger-service.ts:296-
 * 300 returns null on both). sendRung() below resolves that ambiguity with a
 * read-back on the idempotency key rather than silently under-recording a
 * rung that, in fact, already went out.
 *
 * ATTRIBUTION (D10): no message here ever names who REPORTED the job — the
 * observer stays out of it. Escalation is a fact about a due date, not a
 * complaint about a person.
 *
 * FAIL SOFT, PROCESS EVERY TASK: one task's exception is caught, recorded in
 * `errors`, and the sweep continues. A metadata-write failure after a
 * successful notification is also recorded but does not roll back the send —
 * the notification already reached the recipient; losing the audit trail is
 * the lesser failure, and the DB idempotency key still protects against a
 * duplicate next run regardless.
 *
 * RULING 1 (Director) — THE DIRECTOR'S OWN CLOCK:
 * The ladder rungs above deliberately skip a task in `review` — awaiting the
 * Director's approve/send-back decision is not the fixer's fault, and none of
 * `due_date`, `is_blocked`, or `rungs_sent` should ever read as the fixer
 * being late for it. But that same skip meant nothing ever chased the ONE
 * person who can now stall a job indefinitely: the Director himself. A fifth,
 * INDEPENDENT clock — `chaseReviewWaitDirector` below — watches
 * `metadata.fix.approval.state === 'awaiting_approval'` and dates the wait
 * from `metadata.fix.submitted_at`, the exact field
 * app/api/campus-walk/fix/route.ts stamps (alongside that same `approval`
 * object) the moment it moves a task into `review` — reused rather than a new
 * column, because that route is the only writer of this state and the only
 * place the wait genuinely starts. Two full days waiting
 * (`REVIEW_WAIT_THRESHOLD_DAYS = 2`) pages the Director, and — unlike the ladder
 * due-date rungs, which fire each AT MOST ONCE ever — this one may
 * legitimately need to recur if he keeps not looking. It repeats on a BOUNDED
 * cadence (`REVIEW_WAIT_REPEAT_DAYS = 3`, capped at `REVIEW_WAIT_MAX_WAVES`
 * total sends — a bounded repeat, not a one-shot and not an unbounded nag; see
 * chaseReviewWaitDirector's own comment for why that shape was chosen over
 * once-only) and stops the instant he decides, because a decided task no
 * longer matches `awaiting_approval` and drops out of the candidate query on
 * the very next sweep. The fixer is never touched by any of this: no
 * due_date, is_blocked, or rungs_sent write happens anywhere in this path.
 *
 * RULING 2 (Director) — WHEN THE ACCOUNTABLE PERSON LEAVES:
 * Before this ruling, `accountableStaff.isActive === false` resolved silently
 * to "nobody to remind" (see the comment on `StaffLite` below) — correct for
 * not chasing someone who no longer works here, wrong for the job itself,
 * which then dropped out of view for good. `reassignDepartedAccountable`
 * below hands the task to the department head
 * (`staff.department_id -> departments.head_of_department_id`), or — since
 * that link is populated on roughly 7 of 89 departments in production
 * (measured 2026-07-30, app/api/cron/learner-risk-notifications/route.ts) —
 * to the EAO / CAMPUS-OPS project owner, THE COMMON PATH here, not the
 * fallback of last resort. This is the exact resolution order
 * lib/services/campus-walk/campus-walk-service.ts's `routeAccountable` /
 * `resolveDepartmentHeadProfileId` / `resolveEao` already use for its
 * on-approved-leave case; those helpers are module-private in a file this
 * lane must not edit, so the same order and the same two columns are
 * reimplemented here against the maps `bulkResolve` already batches for the
 * whole sweep — not a second, driftable design, the same one. The handover
 * reassigns `project_tasks.owner_staff_id` and the `project_task_assignees`
 * Accountable row for real (the new owner can act on
 * app/api/campus-walk/fix/route.ts immediately, not just receive a notice —
 * and the DB's own `ix_pta_one_accountable` partial unique index means the old
 * Accountable row MUST be cleared, not merely superseded, before the new one
 * can be inserted), tells the Director it happened and tells the new owner
 * they inherited it, and records the outcome on
 * `metadata.campus_walk_chase.reassignment` / `...reassignment_history` so a
 * rerun sees the NEW accountable is active and never repeats the handover for
 * the same departure.
 */

import { workingDaysPastDue } from '@/lib/campus-walk/cctv-categories';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import {
  resolveDirectors,
  daysPastDue,
  validateTargeting,
  type DirectorResolution
} from '@/lib/services/director-desk/handover-chase-service';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'campus-walk/chase-up';
const CAMPUS_OPS_PROJECT_CODE = 'CAMPUS-OPS';
const CAMPUS_WALK_SOURCE = 'campus-walk';

/**
 * Ruling 1: the Director asked to be nudged "after 2 days" waiting on his
 * decision. daysWaiting is a whole-day count from metadata.fix.submitted_at,
 * so 2 means two full days have passed — that is the fire point. He is the
 * only person who can stall a job indefinitely and the only one nothing else
 * chases, so this errs early rather than late.
 */
const REVIEW_WAIT_THRESHOLD_DAYS = 2;
/** Ruling 1: once past the threshold, how often the Director is re-paged. */
const REVIEW_WAIT_REPEAT_DAYS = 3;
/**
 * Ruling 1: hard ceiling on how many times one task re-pages the Director
 * (waves 0..MAX-1, i.e. day 2, 5, 8, ... up to ~30 days). Chosen as a BOUNDED
 * repeat over once-only because a Director who has not looked in 2 days may
 * well not look in 5 either, and the whole point of this ruling is that
 * nothing else in this codebase will ever chase him — but bounded, not
 * unbounded, because past a month of unanswered pages the right response is a
 * manual escalation outside this notification channel, not a louder bell. The
 * cap is logged once (`review_wait_director.cap_reached`), not resent.
 */
const REVIEW_WAIT_MAX_WAVES = 10;

/** Never chase a task already past the fixer's hands. `archived` added as the
 *  same kind of done-adjacent terminal state as the three the brief names
 *  explicitly (review/done/cancelled) — project_statuses seeds it in category
 *  'archived', distinct from 'active'. */
const TERMINAL_STATUS_KEYS = ['review', 'done', 'cancelled', 'archived'];

/** The three steps of the ladder, in climbing order. */
export type LadderRungKey = 'escalate_boss' | 'escalate_principal' | 'reached_director';

type RungKey = LadderRungKey | 'review_wait_director';

/**
 * Director ruling, 30 Sep 2026. `atDay` is whole days past `due_date`.
 * `reached_director` never sends a message of its own — see the file header
 * and lib/campus-walk/director-digest.ts.
 */
export const LADDER: ReadonlyArray<{ key: LadderRungKey; atDay: number }> = [
  { key: 'escalate_boss', atDay: 1 },
  { key: 'escalate_principal', atDay: 3 },
  { key: 'reached_director', atDay: 7 }
];

/**
 * A CCTV report (Director, 9 Oct 2026): the room's HOD has one day to reply;
 * no reply goes STRAIGHT to the principal — no boss step — and on to the
 * Director at day 7 like every other job.
 */
export const CCTV_LADDER: ReadonlyArray<{ key: LadderRungKey; atDay: number }> = [
  { key: 'escalate_principal', atDay: 1 },
  { key: 'reached_director', atDay: 7 }
];

/** The ladder a job climbs: CCTV reports have their own, everything else the standard one. */
export function ladderFor(
  metadata: Record<string, unknown> | null | undefined
): ReadonlyArray<{ key: LadderRungKey; atDay: number }> {
  return (metadata ?? {}).front_door === 'cctv' ? CCTV_LADDER : LADDER;
}

/**
 * A rung from the old D5 ladder that already told the same people, so the
 * new rung counts as done. The old day-3 `escalate_accountable` went to the
 * department head (or the CAMPUS-OPS owner) and the fixer — the day-1 boss
 * climb. The old day-5 `escalate_director` went to the Director — the day-7
 * step, whose only effect is a line in his summary.
 */
const LEGACY_EQUIVALENT: Partial<Record<LadderRungKey, string>> = {
  escalate_boss: 'escalate_accountable',
  // The old day-5 rung paged the Director about this very job. He has heard;
  // listing it again in his summary would tell him twice.
  reached_director: 'escalate_director'
};

/**
 * Which rungs this job has newly reached: at or past their day, and not yet
 * recorded in `rungs_sent` for the current round. A job found several days
 * late (a missed run, or the first run after deploy) gets every step it has
 * reached, in order, in one pass — nothing is skipped for good.
 */
export function rungsDue(
  daysOverdue: number,
  rungsSent: Record<string, unknown> | null | undefined,
  metadata?: Record<string, unknown> | null
): LadderRungKey[] {
  const sent = rungsSent ?? {};
  return ladderFor(metadata).filter((r) => {
    if (daysOverdue < r.atDay) return false;
    if (sent[r.key]) return false;
    const legacy = LEGACY_EQUIVALENT[r.key];
    return !(legacy && sent[legacy]);
  }).map((r) => r.key);
}

interface ChaseableTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  status_key: string;
  owner_staff_id: string | null;
  metadata: Record<string, any>;
}

function truncate(s: string, n: number): string {
  return (s ?? '').slice(0, n);
}

function pluralDays(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-09-21' -> '21 Sep 2026'. Anything unparseable is shown as given. */
export function friendlyDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return String(iso ?? '');
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : String(iso);
}

/**
 * Where the job is, from what each front door records: InstaSolver's
 * `location`, a routine check's `resource_place`. A Campus Walk capture has
 * neither — its title already says where — so this returns null rather than
 * printing an empty "at".
 */
export function placeOf(metadata: Record<string, any> | null | undefined): string | null {
  const m = metadata ?? {};
  for (const key of ['location', 'resource_place']) {
    const v = m[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** Only a campus-walk job screen for one task is trusted from `open_path`. */
const OPEN_PATH_RE = /^\/campus-walk\/(check|fix)\?task=[0-9a-f-]{36}$/i;

/**
 * The screen a job's link opens. A routine check still waiting for its answer
 * opens on the check screen (All OK / Found a problem); everything else —
 * including a check that became a repair after "Found a problem" — opens on
 * the fix screen. A job that records its own `open_path` is trusted first.
 * Mirrors campusWalkJobPath in lib/campus-walk/routine-checks.ts (draft
 * #4145), which is not in this stack, so it cannot be imported here.
 */
export function jobPath(taskId: string, metadata: Record<string, any> | null | undefined): string {
  const m = metadata ?? {};
  if (typeof m.open_path === 'string' && OPEN_PATH_RE.test(m.open_path)) return m.open_path;
  if (m.routine_check === true && !m.routine_check_outcome) return `/campus-walk/check?task=${taskId}`;
  return `/campus-walk/fix?task=${taskId}`;
}

/** `"Tap leaking" at Block A` — the place is left out when the title already says it. */
export function jobLabel(title: string, place: string | null): string {
  const t = truncate(title, 150);
  if (!place || t.toLowerCase().includes(place.toLowerCase())) return `"${t}"`;
  return `"${t}" at ${truncate(place, 80)}`;
}

/** One person a climb message went to, as the "who else was told" line names them. */
export interface ToldPerson {
  name: string | null;
  role: string;
}

/** "This message went to: Priya (responsible for the job) and R. Kumar (department head)." */
export function toldLine(people: ToldPerson[]): string {
  const parts = people.map((p) => (p.name ? `${p.name} (${p.role})` : `the ${p.role}`));
  if (parts.length === 0) return '';
  const joined =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `This message went to: ${joined}.`;
}

const PAUSE_HINT =
  `If something outside anyone's hands is holding it up, tap "I can't fix this yet" on the job and these messages will pause.`;

/**
 * The words of a climb message. One message goes to everyone on a rung, so it
 * is written about the job, never at a person: it names the job and the
 * place, says plainly how late it is and who now knows, and blames nobody.
 */
export function climbMessage(
  rung: 'escalate_boss' | 'escalate_principal',
  ctx: {
    title: string;
    place: string | null;
    dueDate: string;
    daysOverdue: number;
    /** e.g. 'the department head'; null when no boss could be found. */
    bossLabel: string | null;
    told: ToldPerson[];
  }
): { title: string; body: string } {
  const job = jobLabel(ctx.title, ctx.place);
  const late = pluralDays(ctx.daysOverdue);
  const shared =
    rung === 'escalate_boss'
      ? ctx.bossLabel
        ? `We have shared it with ${ctx.bossLabel} in case a hand is needed to get it done.`
        : ''
      : 'We have now shared it with the college principal, so the college can help with whatever is in the way.';
  const body = [
    `${job} was due on ${friendlyDate(ctx.dueDate)} and is still open, ${late} later.`,
    shared,
    PAUSE_HINT,
    toldLine(ctx.told)
  ]
    .filter(Boolean)
    .join(' ');
  return {
    title: `Still open, ${late} past due: ${truncate(ctx.title, 80)}`,
    body
  };
}

/**
 * The idempotency key for one rung of one ROUND of a task.
 *
 * Round 0 — every task until somebody reopens it — keeps the original
 * `campus-walk-chase:<rung>:<task_id>` key with no suffix, so notifications
 * already in production keep deduplicating exactly as before.
 *
 * A reporter's "Not fixed" (app/api/campus-walk/not-fixed/route.ts, Director
 * 2026-09-30) reopens the SAME job with a fresh due date, clears
 * `metadata.campus_walk_chase.rungs_sent` and bumps
 * `metadata.campus_walk_chase.round`. Clearing rungs_sent alone would not be
 * enough: the database's unique index on the round-0 key would still swallow
 * every reminder. The `:r<round>` suffix is what lets the ladder fire again
 * for the new round — each rung still at most once PER ROUND.
 */
export function chaseRungIdempotencyKey(rungKey: string, taskId: string, round: unknown): string {
  const n = Number(round);
  const base = `campus-walk-chase:${rungKey}:${taskId}`;
  return Number.isInteger(n) && n > 0 ? `${base}:r${n}` : base;
}

/** The day the principal step comes due on a healthy daily run. */
const PRINCIPAL_DAY = LADDER.find((r) => r.key === 'escalate_principal')!.atDay;

/** Bell category of a college's catch-up list; the Director's summary counts these. */
export const PRINCIPAL_LIST_CATEGORY = 'campus-walk:chase-principal-list';

/** Past this many jobs a catch-up list names the rest by count only. */
const MAX_LISTED_IN_PRINCIPAL_LIST = 40;

/**
 * A principal step is catch-up when it comes due LATER than day 3: a healthy
 * daily run always fires it on day 3 itself, so a later one was missed —
 * above all, every job already 3+ days late on the ladder's first morning.
 */
export function isCatchUpPrincipalStep(
  daysOverdue: number,
  metadata?: Record<string, unknown> | null
): boolean {
  const day = ladderFor(metadata).find((r) => r.key === 'escalate_principal')?.atDay ?? PRINCIPAL_DAY;
  return daysOverdue > day;
}

/** At most one catch-up list per college per run date — the database's unique index enforces it. */
export function principalListIdempotencyKey(institutionId: string, runDate: string): string {
  return `campus-walk-chase:principal-list:${institutionId}:${runDate}`;
}

export interface PrincipalListJob {
  title: string;
  place: string | null;
  dueDate: string;
  daysOverdue: number;
}

/**
 * The words of a college's catch-up list: every job that reached the
 * principal this morning, latest first, in one message. Plain and courteous,
 * nobody named or blamed; one line says who it went to.
 */
export function principalListMessage(
  jobs: PrincipalListJob[],
  principals: ToldPerson[],
  opts: { maxListed?: number } = {}
): { title: string; body: string } {
  const maxListed = opts.maxListed ?? MAX_LISTED_IN_PRINCIPAL_LIST;
  const n = jobs.length;
  const sorted = jobs
    .slice()
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.title.localeCompare(b.title));
  const lines: string[] = [
    `${n === 1 ? 'This campus job is' : `These ${n} campus jobs are`} past ${n === 1 ? 'its' : 'their'} due date ` +
      `and still open. They were already late when the daily follow-up reached them, so they come to you ` +
      `together in one list rather than one message each.`,
    ''
  ];
  for (const j of sorted.slice(0, maxListed)) {
    lines.push(
      `• ${jobLabel(j.title, j.place)} — ${pluralDays(j.daysOverdue)} past due (was due ${friendlyDate(j.dueDate)})`
    );
  }
  if (n > maxListed) {
    lines.push(`…and ${n - maxListed} more on the Campus Operations board.`);
  }
  const told = toldLine(principals);
  if (told) lines.push('', told);
  return {
    title: `${n} campus ${n === 1 ? 'job' : 'jobs'} past due at your college`,
    body: lines.join('\n')
  };
}

/** One task's state across the run's three passes (per task, per college, write-back). */
interface TaskPass {
  task: ChaseableTask;
  metadata: Record<string, any>;
  rungsSent: Record<string, string>;
  metadataChanged: boolean;
  newOwnerStaffId: string | null;
  daysOverdue: number;
  /** Set when the principal step went out as part of a college's catch-up list. */
  principalListKey: string | null;
}

/** A principal step waiting for the per-college pass. */
interface PendingPrincipal {
  pass: TaskPass;
  institutionId: string;
  principals: Array<{ id: string; name: string | null }>;
  /** Principal(s), the fixer and the boss — the per-job message's recipients. */
  recipients: string[];
  told: ToldPerson[];
  place: string | null;
  bossLabel: string | null;
  bossRole: Boss['role'] | null;
  idempotencyKey: string;
}

export interface CampusWalkChaseUpResult {
  run_date: string;
  /** Candidate tasks the query returned (overdue, unblocked, not terminal, CAMPUS-OPS, source=campus-walk). */
  scanned: number;
  /** Tasks whose per-task pass completed without throwing (a task with zero eligible rungs this run still counts). */
  processed: number;
  notifications_sent: number;
  rungs: Record<RungKey, number>;
  /** Ruling 1 — the review-wait candidate set (status_key='review'), disjoint from `scanned` above. */
  review_wait_scanned: number;
  review_wait_processed: number;
  /** Ruling 2 — tasks whose departed Accountable was successfully handed to a new owner this run. */
  reassignments_sent: number;
  /** Catch-up lists sent this run — one per college, each counting its jobs in `rungs.escalate_principal`. */
  principal_lists: number;
  director_resolution: DirectorResolution['source'];
  errors: string[];
  elapsed_ms: number;
}

/** staff.id -> the bits chase-up needs, active staff only (an inactive
 *  Accountable is treated the same as "nobody to remind" — see resolveAccountable). */
interface StaffLite {
  profileId: string | null;
  isActive: boolean;
  departmentId: string | null;
}

/** Ruling 2's audit record — appended to `metadata.campus_walk_chase.reassignment_history`. */
interface ReassignmentRecord {
  reason: 'accountable_inactive';
  from_staff_id: string;
  to_staff_id: string | null;
  to_profile_id: string | null;
  to_role: 'department_head' | 'campus_ops_owner' | null;
  resolved_at: string;
  outcome: 'reassigned' | 'no_target_found' | 'assignee_write_failed';
  director_notified?: boolean;
  new_owner_notified?: boolean;
  error?: string;
}

interface ReassignmentOutcome {
  handled: boolean;
  record: ReassignmentRecord;
  newStaffId: string | null;
  newProfileId: string | null;
  newDepartmentId: string | null;
}

async function fetchProjectId(db: SupabaseClient): Promise<{ id: string; ownerStaffId: string | null } | null> {
  const { data, error } = await db
    .from('projects')
    .select('id, owner_staff_id')
    .eq('code', CAMPUS_OPS_PROJECT_CODE)
    .maybeSingle();
  if (error || !data?.id) return null;
  return { id: data.id as string, ownerStaffId: (data.owner_staff_id as string | null) ?? null };
}

/** The EAO / project-owner fallback, resolved once per run — the same
 *  "second door" app/api/campus-walk/fix/route.ts's resolveContact() falls
 *  back to when a department has no head on record. */
async function resolveProjectOwnerProfile(
  db: SupabaseClient,
  ownerStaffId: string | null
): Promise<string | null> {
  if (!ownerStaffId) return null;
  const { data } = await db
    .from('staff')
    .select('profile_id, is_active')
    .eq('id', ownerStaffId)
    .maybeSingle();
  if (!data || data.is_active === false || !data.profile_id) return null;
  return data.profile_id as string;
}

/** Who the day-1 climb goes to, and how the messages name them. */
export interface Boss {
  id: string;
  /** For the "this message went to" line. */
  role: 'department head' | 'reporting manager' | 'estate office';
  /** For the sentence "We have shared it with …". */
  label: string;
}

/**
 * The fixer's boss, in the ruling's order: their department head, else their
 * reporting manager, else the estate office — the CAMPUS-OPS project owner,
 * the same "second door" app/api/campus-walk/fix/route.ts's resolveContact()
 * falls back to. Never the fixer themselves (a department head who is also the
 * fixer climbs to the next person), never an inactive profile.
 */
export function resolveBoss(opts: {
  accountableProfileId: string | null;
  accountableStaffId: string | null;
  departmentId: string | null;
  deptHeadByDept: Map<string, string>;
  managerProfileByStaff: Map<string, string>;
  profileActive: Map<string, boolean>;
  projectOwnerProfileId: string | null;
}): Boss | null {
  const usable = (id: string | null | undefined): id is string =>
    Boolean(id) && id !== opts.accountableProfileId && opts.profileActive.get(id as string) !== false;

  const head = opts.departmentId ? opts.deptHeadByDept.get(opts.departmentId) : null;
  if (usable(head)) return { id: head, role: 'department head', label: 'the department head' };

  const manager = opts.accountableStaffId ? opts.managerProfileByStaff.get(opts.accountableStaffId) : null;
  if (usable(manager)) return { id: manager, role: 'reporting manager', label: 'the reporting manager' };

  if (usable(opts.projectOwnerProfileId)) {
    return { id: opts.projectOwnerProfileId, role: 'estate office', label: 'the estate office' };
  }
  return null;
}

/**
 * Resolve, in bulk, everything every task's rungs need: the Accountable's
 * staff row, their department's head, and active-status for every profile
 * that might end up a recipient. A handful of `.in()` queries rather than
 * 4-5 queries per task — the campus-walk task volume this cron sees is small
 * (a facility register, not a firehose), but there is no reason to pay an
 * N+1 tax when campus-walk-service.ts already demonstrates the batched
 * pattern (mapProfilesToStaff / mapStaffToProfilesLocal) for the exact same
 * kind of lookup.
 */
async function bulkResolve(
  db: SupabaseClient,
  tasks: ChaseableTask[],
  /** Profiles that may be named in a message but are not otherwise looked up (the CAMPUS-OPS owner). */
  extraProfileIds: string[] = []
): Promise<{
  accountableStaffIdByTask: Map<string, string>;
  staffById: Map<string, StaffLite>;
  deptHeadByDept: Map<string, string>;
  /** Ruling 2 — department head's own active-staff id, needed to write
   *  owner_staff_id / project_task_assignees.staff_id on reassignment. */
  headStaffIdByProfile: Map<string, string>;
  profileActive: Map<string, boolean>;
  /** staff.id -> their active reporting manager's profiles.id. */
  managerProfileByStaff: Map<string, string>;
  /** institution_id -> active principal(s), oldest record first. */
  principalsByInstitution: Map<string, Array<{ id: string; name: string | null }>>;
  /** profiles.id -> full name, for the "this message went to" line. */
  nameByProfile: Map<string, string>;
}> {
  const taskIds = tasks.map((t) => t.id);
  const accountableStaffIdByTask = new Map<string, string>();

  if (taskIds.length > 0) {
    const { data: assignees } = await db
      .from('project_task_assignees')
      .select('task_id, staff_id')
      .in('task_id', taskIds)
      .eq('role', 'accountable');
    for (const row of (assignees ?? []) as any[]) {
      if (row.task_id && row.staff_id && !accountableStaffIdByTask.has(row.task_id)) {
        accountableStaffIdByTask.set(row.task_id, row.staff_id);
      }
    }
  }

  const candidateStaffIds = new Set<string>();
  for (const t of tasks) {
    const sid = accountableStaffIdByTask.get(t.id) ?? t.owner_staff_id ?? null;
    if (sid) candidateStaffIds.add(sid);
  }

  const staffById = new Map<string, StaffLite>();
  if (candidateStaffIds.size > 0) {
    const { data: staffRows } = await db
      .from('staff')
      .select('id, profile_id, is_active, department_id')
      .in('id', [...candidateStaffIds]);
    for (const s of (staffRows ?? []) as any[]) {
      staffById.set(s.id, {
        profileId: s.profile_id ?? null,
        isActive: s.is_active !== false,
        departmentId: s.department_id ?? null
      });
    }
  }

  const departmentIds = new Set<string>();
  for (const s of staffById.values()) {
    // Ruling 2: looked up for EVERY candidate staff row, active or not — an
    // inactive Accountable's department head is exactly who
    // reassignDepartedAccountable() below needs to find.
    if (s.departmentId) departmentIds.add(s.departmentId);
  }

  const deptHeadByDept = new Map<string, string>();
  if (departmentIds.size > 0) {
    const { data: depts } = await db
      .from('departments')
      .select('id, head_of_department_id')
      .in('id', [...departmentIds]);
    for (const d of (depts ?? []) as any[]) {
      if (d.head_of_department_id) deptHeadByDept.set(d.id, d.head_of_department_id);
    }
  }

  // Ruling 2: the department head's own STAFF id (active only) — needed to
  // write project_tasks.owner_staff_id / project_task_assignees.staff_id,
  // matching the same active-staff requirement
  // campus-walk-service.ts's routeAccountable applies to its own
  // department-head fallback.
  const headProfileIds = [...deptHeadByDept.values()];
  const headStaffIdByProfile = new Map<string, string>();
  if (headProfileIds.length > 0) {
    const { data: headStaffRows } = await db
      .from('staff')
      .select('id, profile_id, is_active')
      .in('profile_id', headProfileIds);
    for (const r of (headStaffRows ?? []) as any[]) {
      if (r.profile_id && r.is_active && !headStaffIdByProfile.has(r.profile_id)) {
        headStaffIdByProfile.set(r.profile_id, r.id);
      }
    }
  }

  // The day-1 boss when the department has no head on record: the fixer's
  // reporting manager, hr_staff_details.reports_to_staff_id — the same column
  // lib/services/hr/memo-service.ts reads for its supervisor copy. Active
  // managers only.
  const managerProfileByStaff = new Map<string, string>();
  const activeStaffIds = [...staffById.entries()].filter(([, s]) => s.isActive).map(([id]) => id);
  if (activeStaffIds.length > 0) {
    const { data: details } = await db
      .from('hr_staff_details')
      .select('staff_id, reports_to_staff_id')
      .in('staff_id', activeStaffIds);
    const managerIdByStaff = new Map<string, string>();
    for (const d of (details ?? []) as any[]) {
      if (d.staff_id && d.reports_to_staff_id && d.reports_to_staff_id !== d.staff_id) {
        managerIdByStaff.set(d.staff_id, d.reports_to_staff_id);
      }
    }
    if (managerIdByStaff.size > 0) {
      const { data: managers } = await db
        .from('staff')
        .select('id, profile_id, is_active')
        .in('id', [...new Set(managerIdByStaff.values())]);
      const managerProfile = new Map<string, string>();
      for (const m of (managers ?? []) as any[]) {
        if (m.profile_id && m.is_active !== false) managerProfile.set(m.id, m.profile_id);
      }
      for (const [staffId, managerId] of managerIdByStaff) {
        const p = managerProfile.get(managerId);
        if (p) managerProfileByStaff.set(staffId, p);
      }
    }
  }

  // The day-3 step: each college's principal(s), from metadata.institution_id
  // (CAMPUS-OPS itself carries no institution — campus-walk-service.ts stores
  // the college on the task). Same query and order as the meetings engine's
  // resolveRecipients (lib/services/meetings/meeting-trigger-service.ts), but
  // deliberately WITHOUT its super-admin fallback: that would page the
  // Director once per job, which the 30 Sep ruling forbids.
  const principalsByInstitution = new Map<string, Array<{ id: string; name: string | null }>>();
  const institutionIds = [
    ...new Set(
      tasks
        .map((t) => (t.metadata ?? {}).institution_id)
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    )
  ];
  if (institutionIds.length > 0) {
    const { data: principals } = await db
      .from('profiles')
      .select('id, full_name, institution_id')
      .in('institution_id', institutionIds)
      .eq('role', 'principal')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    for (const p of (principals ?? []) as any[]) {
      if (!p.id || !p.institution_id) continue;
      const list = principalsByInstitution.get(p.institution_id) ?? [];
      list.push({ id: p.id, name: p.full_name ?? null });
      principalsByInstitution.set(p.institution_id, list);
    }
  }

  const profileIdsToCheck = new Set<string>(extraProfileIds.filter(Boolean));
  for (const s of staffById.values()) {
    if (s.profileId) profileIdsToCheck.add(s.profileId);
  }
  for (const headId of deptHeadByDept.values()) {
    profileIdsToCheck.add(headId);
  }
  for (const managerId of managerProfileByStaff.values()) {
    profileIdsToCheck.add(managerId);
  }

  const profileActive = new Map<string, boolean>();
  const nameByProfile = new Map<string, string>();
  if (profileIdsToCheck.size > 0) {
    const { data: profileRows } = await db
      .from('profiles')
      .select('id, is_active, full_name')
      .in('id', [...profileIdsToCheck]);
    for (const p of (profileRows ?? []) as any[]) {
      profileActive.set(p.id, p.is_active !== false);
      if (typeof p.full_name === 'string' && p.full_name.trim()) nameByProfile.set(p.id, p.full_name.trim());
    }
  }

  return {
    accountableStaffIdByTask,
    staffById,
    deptHeadByDept,
    headStaffIdByProfile,
    profileActive,
    managerProfileByStaff,
    principalsByInstitution,
    nameByProfile
  };
}

/**
 * Send one rung's notification, resolving createBellNotification's
 * unavoidable null-return ambiguity (see the file header) with a read-back on
 * the idempotency key so a genuine duplicate is recorded as "sent" (self-
 * healing an earlier run's crash between insert and metadata write) while a
 * genuine failure is correctly left unrecorded and retried next run.
 */
async function sendRung(
  db: SupabaseClient,
  opts: {
    recipientIds: string[];
    title: string;
    body: string;
    url: string;
    category: string;
    metadata: Record<string, unknown>;
    idempotencyKey: string;
  }
): Promise<{ sent: boolean; notifiedAt: string | null }> {
  const notificationId = await createBellNotification(db, {
    recipientIds: opts.recipientIds,
    createdBy: opts.recipientIds[0],
    title: opts.title,
    body: opts.body,
    url: opts.url,
    category: opts.category,
    metadata: opts.metadata,
    idempotencyKey: opts.idempotencyKey
  });

  if (notificationId) {
    return { sent: true, notifiedAt: new Date().toISOString() };
  }

  const { data: existing } = await db
    .from('notifications')
    .select('created_at')
    .eq('idempotency_key', opts.idempotencyKey)
    .maybeSingle();

  if (existing?.created_at) {
    return { sent: true, notifiedAt: existing.created_at as string };
  }

  return { sent: false, notifiedAt: null };
}

/**
 * Ruling 2 — see the file header. Hands a task whose Accountable has left the
 * institution (`staff.is_active = false`) to someone who can still act on it,
 * tells both the Director and the new owner, and returns what happened so the
 * caller can fold it into the task's audit trail.
 *
 * Resolution order matches lib/services/campus-walk/campus-walk-service.ts's
 * routeAccountable exactly (department head, then EAO / CAMPUS-OPS project
 * owner) — reimplemented against this file's own bulk-fetched maps because
 * that module's resolveDepartmentHeadProfileId/resolveEao are module-private
 * and this lane must not edit that file (parallel-PR boundary). Same order,
 * same two columns, not a second design.
 *
 * Never throws: the caller's per-task try/catch is the backstop, but every
 * notification here is independently guarded so a bell failure can never
 * undo the handover write that already landed, and one departed staff member
 * can never abort the sweep.
 */
async function reassignDepartedAccountable(
  db: SupabaseClient,
  opts: {
    taskId: string;
    taskTitle: string;
    place: string | null;
    dueDate: string;
    /** The screen the new owner's message opens — see jobPath. */
    openPath: string;
    departedStaffId: string;
    departedDepartmentId: string | null;
    deptHeadByDept: Map<string, string>;
    headStaffIdByProfile: Map<string, string>;
    profileActive: Map<string, boolean>;
    projectOwnerStaffId: string | null;
    projectOwnerProfileId: string | null;
    director: DirectorResolution;
    nowIso: string;
  }
): Promise<ReassignmentOutcome> {
  const {
    taskId,
    taskTitle,
    place,
    dueDate,
    openPath,
    departedStaffId,
    departedDepartmentId,
    deptHeadByDept,
    headStaffIdByProfile,
    profileActive,
    projectOwnerStaffId,
    projectOwnerProfileId,
    director,
    nowIso
  } = opts;

  const headProfileId = departedDepartmentId ? deptHeadByDept.get(departedDepartmentId) ?? null : null;
  const headStaffId = headProfileId ? headStaffIdByProfile.get(headProfileId) ?? null : null;
  const headActive = headProfileId ? profileActive.get(headProfileId) !== false : false;

  let newProfileId: string | null = null;
  let newStaffId: string | null = null;
  let toRole: ReassignmentRecord['to_role'] = null;
  let newDepartmentId: string | null = null;

  if (headProfileId && headStaffId && headActive && headStaffId !== departedStaffId) {
    newProfileId = headProfileId;
    newStaffId = headStaffId;
    toRole = 'department_head';
    newDepartmentId = departedDepartmentId;
  } else if (projectOwnerStaffId && projectOwnerProfileId && projectOwnerStaffId !== departedStaffId) {
    newProfileId = projectOwnerProfileId;
    newStaffId = projectOwnerStaffId;
    toRole = 'campus_ops_owner';
  }

  const idemBase = `campus-walk-chase:reassign:${taskId}:${departedStaffId}`;

  if (!newStaffId || !newProfileId) {
    // Nobody to hand it to. The whole point of this ruling is that this state
    // must never again be invisible — tell the Director even though there is
    // no automatic fix.
    let directorNotified = false;
    try {
      const check = validateTargeting(director.ids);
      if (check.ok) {
        const sendResult = await sendRung(db, {
          recipientIds: check.userIds,
          title: `Needs a new owner: ${truncate(taskTitle, 80)}`,
          body:
            `${jobLabel(taskTitle, place)}, due on ${friendlyDate(dueDate)}, needs someone new to look after it. ` +
            `The person it was given to has left, and we could not find a department head or a Campus ` +
            `Operations owner to pass it to. Please choose who should take it on.`,
          url: '/projects',
          category: 'campus-walk:reassign-failed',
          metadata: { task_id: taskId, source: CAMPUS_WALK_SOURCE, reason: 'accountable_inactive_no_target' },
          idempotencyKey: `${idemBase}:director-failed`
        });
        directorNotified = sendResult.sent;
      }
    } catch {
      // fail soft — the record below still marks this attempt as auditable.
    }
    return {
      handled: false,
      record: {
        reason: 'accountable_inactive',
        from_staff_id: departedStaffId,
        to_staff_id: null,
        to_profile_id: null,
        to_role: null,
        resolved_at: nowIso,
        outcome: 'no_target_found',
        director_notified: directorNotified
      },
      newStaffId: null,
      newProfileId: null,
      newDepartmentId: null
    };
  }

  // The actual handover. Delete/delete/insert rather than a conditional
  // update: the DB's own ix_pta_one_accountable partial unique index allows
  // at most one 'accountable' row per task, and uq_project_task_assignees
  // allows at most one role per (task_id, staff_id) — so the old Accountable
  // row must be cleared, and any pre-existing row for the NEW owner (e.g. they
  // were already Consulted) must be cleared too, before the new Accountable
  // row can be inserted without a 23505. Runs at most once per departure by
  // construction: the next sweep's bulk query reads project_task_assignees
  // fresh and no longer sees the departed staff id as Accountable, so this
  // branch is not re-entered for the same event.
  try {
    await db.from('project_task_assignees').delete().eq('task_id', taskId).eq('staff_id', newStaffId);
    await db.from('project_task_assignees').delete().eq('task_id', taskId).eq('role', 'accountable');
    const { error: insErr } = await db
      .from('project_task_assignees')
      .insert({ task_id: taskId, staff_id: newStaffId, role: 'accountable' });
    if (insErr) throw new Error(insErr.message);
  } catch (e: any) {
    return {
      handled: false,
      record: {
        reason: 'accountable_inactive',
        from_staff_id: departedStaffId,
        to_staff_id: newStaffId,
        to_profile_id: newProfileId,
        to_role: toRole,
        resolved_at: nowIso,
        outcome: 'assignee_write_failed',
        error: e?.message ?? String(e)
      },
      newStaffId: null,
      newProfileId: null,
      newDepartmentId: null
    };
  }

  // Tell the Director it happened, and tell the new owner they inherited it.
  // Fail soft from here on — the handover itself already landed above, and a
  // notification failure must not undo it or abort the sweep.
  let directorNotified = false;
  try {
    const directorCheck = validateTargeting(director.ids);
    if (directorCheck.ok) {
      const sendResult = await sendRung(db, {
        recipientIds: directorCheck.userIds,
        title: `Passed to a new owner: ${truncate(taskTitle, 70)}`,
        body:
          `${jobLabel(taskTitle, place)} was with someone who has since left, so it has been passed to ${
            toRole === 'department_head' ? 'the department head' : 'the Campus Operations owner'
          } to keep it moving.`,
        url: '/projects',
        category: 'campus-walk:reassigned',
        metadata: { task_id: taskId, source: CAMPUS_WALK_SOURCE, to_role: toRole },
        idempotencyKey: `${idemBase}:director`
      });
      directorNotified = sendResult.sent;
    }
  } catch {
    // fail soft
  }

  let newOwnerNotified = false;
  try {
    const sendResult = await sendRung(db, {
      recipientIds: [newProfileId],
      title: `A job has been passed to you: ${truncate(taskTitle, 70)}`,
      body:
        `${jobLabel(taskTitle, place)}, due on ${friendlyDate(dueDate)}, has been passed to you because the ` +
        `person who had it has left. Thank you for taking it on. ${PAUSE_HINT}`,
      url: openPath,
      category: 'campus-walk:reassigned',
      metadata: { task_id: taskId, source: CAMPUS_WALK_SOURCE, to_role: toRole },
      idempotencyKey: `${idemBase}:new-owner`
    });
    newOwnerNotified = sendResult.sent;
  } catch {
    // fail soft
  }

  return {
    handled: true,
    record: {
      reason: 'accountable_inactive',
      from_staff_id: departedStaffId,
      to_staff_id: newStaffId,
      to_profile_id: newProfileId,
      to_role: toRole,
      resolved_at: nowIso,
      outcome: 'reassigned',
      director_notified: directorNotified,
      new_owner_notified: newOwnerNotified
    },
    newStaffId,
    newProfileId,
    newDepartmentId
  };
}

/**
 * Ruling 1 — see the file header. Runs on its OWN candidate set (status_key =
 * 'review'), disjoint from the overdue set the main sweep below reads
 * (TERMINAL_STATUS_KEYS excludes 'review' from that query on purpose), so
 * this is called unconditionally by runCampusWalkChaseUp — even on a run with
 * zero overdue tasks.
 *
 * Only `metadata.fix.approval.state === 'awaiting_approval'` is chased.
 * Already-approved and already-sent-back tasks are not waiting on anyone and
 * are skipped, same as a task that never had a fix submitted at all.
 *
 * BOUNDED REPEAT, not once-only (Director's explicit call to make): the wait
 * is dated from `metadata.fix.submitted_at` and re-pages every
 * REVIEW_WAIT_REPEAT_DAYS days in "waves" (wave 0 = day 2, wave 1 = day 5,
 * ...), each wave keyed by its own idempotency key
 * (`campus-walk-chase:review_wait_director:<task_id>:<wave>`) so a rerun
 * before the next wave is due is a no-op, and a wave once sent is never sent
 * twice. Capped at REVIEW_WAIT_MAX_WAVES total — past that, one warning is
 * logged (`review_wait_director.cap_reached`, checked so it fires only once)
 * and no further bells go out; a task stuck that long needs a human, not a
 * louder notification.
 */
async function chaseReviewWaitDirector(
  db: SupabaseClient,
  opts: {
    projectId: string;
    director: DirectorResolution;
    todayISO: string;
    nowIso: string;
  }
): Promise<{ scanned: number; processed: number; sent: number; errors: string[] }> {
  const errors: string[] = [];

  const { data: rows, error } = await db
    .from('project_tasks')
    .select('id, title, metadata')
    .eq('project_id', opts.projectId)
    .eq('metadata->>source', CAMPUS_WALK_SOURCE)
    .eq('status_key', 'review');

  if (error) {
    errors.push(`review-wait select failed: ${error.message}`);
    return { scanned: 0, processed: 0, sent: 0, errors };
  }

  const tasks = (rows ?? []) as Array<{ id: string; title: string; metadata: Record<string, any> }>;
  let sent = 0;
  let processed = 0;

  for (const task of tasks) {
    try {
      const metadata = (task.metadata ?? {}) as Record<string, any>;
      const approval = metadata.fix?.approval ?? null;
      if (!approval || approval.state !== 'awaiting_approval') {
        // Decided already (approved / changes_requested), or nothing
        // submitted yet — not waiting on the Director either way.
        processed++;
        continue;
      }

      const submittedAt = metadata.fix?.submitted_at;
      if (typeof submittedAt !== 'string' || !submittedAt) {
        errors.push(`task ${task.id}: awaiting_approval with no fix.submitted_at — cannot date the wait`);
        processed++;
        continue;
      }

      const daysWaiting = daysPastDue(submittedAt, opts.todayISO);
      if (daysWaiting < REVIEW_WAIT_THRESHOLD_DAYS) {
        processed++;
        continue;
      }

      const priorState = (metadata.campus_walk_chase?.review_wait_director ?? {}) as {
        sent_waves?: number[];
        cap_reached?: boolean;
      };
      const sentWaves = Array.isArray(priorState.sent_waves) ? [...priorState.sent_waves] : [];
      const wave = Math.floor((daysWaiting - REVIEW_WAIT_THRESHOLD_DAYS) / REVIEW_WAIT_REPEAT_DAYS);

      if (sentWaves.includes(wave)) {
        // Already sent for this wave — the common case on every run between
        // repeat intervals.
        processed++;
        continue;
      }

      if (wave >= REVIEW_WAIT_MAX_WAVES) {
        if (!priorState.cap_reached) {
          errors.push(
            `task ${task.id}: review wait exceeded ${REVIEW_WAIT_MAX_WAVES} escalation(s) — needs manual follow-up, no further auto-reminders will be sent`
          );
          const { error: capErr } = await db
            .from('project_tasks')
            .update({
              metadata: {
                ...metadata,
                campus_walk_chase: {
                  ...(metadata.campus_walk_chase ?? {}),
                  review_wait_director: { ...priorState, cap_reached: true }
                }
              }
            })
            .eq('id', task.id);
          if (capErr) errors.push(`task ${task.id}: cap-reached metadata write failed — ${capErr.message}`);
        }
        processed++;
        continue;
      }

      const check = validateTargeting(opts.director.ids);
      if (!check.ok) {
        errors.push(`task ${task.id} (review_wait_director): no resolvable recipient — ${check.reason}`);
        processed++;
        continue;
      }

      const idempotencyKey = `campus-walk-chase:review_wait_director:${task.id}:${wave}`;
      const sendResult = await sendRung(db, {
        recipientIds: check.userIds,
        title: `Waiting for your look (${pluralDays(daysWaiting)}): ${truncate(task.title, 80)}`,
        body:
          `${jobLabel(task.title, placeOf(task.metadata))} has a fix photo and has been waiting ` +
          `${pluralDays(daysWaiting)} for you to approve it or send it back.`,
        url: '/campus-walk/review',
        category: 'campus-walk:review-wait-director',
        metadata: { task_id: task.id, source: CAMPUS_WALK_SOURCE, days_waiting: daysWaiting, wave },
        idempotencyKey
      });

      if (sendResult.sent) {
        sentWaves.push(wave);
        sent++;
        const { error: updErr } = await db
          .from('project_tasks')
          .update({
            metadata: {
              ...metadata,
              campus_walk_chase: {
                ...(metadata.campus_walk_chase ?? {}),
                review_wait_director: {
                  sent_waves: sentWaves,
                  cap_reached: priorState.cap_reached ?? false,
                  last_sent_at: sendResult.notifiedAt ?? opts.nowIso
                }
              }
            }
          })
          .eq('id', task.id);
        if (updErr) {
          errors.push(`task ${task.id}: review_wait_director metadata write failed — ${updErr.message}`);
        }
      } else {
        errors.push(`task ${task.id} (review_wait_director): notification send failed`);
      }

      processed++;
    } catch (e: any) {
      errors.push(`task ${task.id} (review_wait_director): ${e?.message ?? String(e)}`);
      // fail soft — one task's exception must not abort this pass.
    }
  }

  return { scanned: tasks.length, processed, sent, errors };
}

/**
 * Run one pass of the chase-up ladder. Safe to call repeatedly (idempotent
 * per rung, see file header) and safe to call after any gap (a task found
 * already several days overdue fires every rung it has newly reached, in
 * order, in the same pass — nothing is permanently skipped by a missed run).
 */
export async function runCampusWalkChaseUp(
  opts: { client?: SupabaseClient; now?: Date } = {}
): Promise<CampusWalkChaseUpResult> {
  const startTime = Date.now();
  const db = opts.client ?? createServiceRoleClient();
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const todayISO = nowIso.slice(0, 10);

  const result: CampusWalkChaseUpResult = {
    run_date: todayISO,
    scanned: 0,
    processed: 0,
    notifications_sent: 0,
    rungs: {
      escalate_boss: 0,
      escalate_principal: 0,
      reached_director: 0,
      review_wait_director: 0
    },
    review_wait_scanned: 0,
    review_wait_processed: 0,
    reassignments_sent: 0,
    principal_lists: 0,
    director_resolution: 'none',
    errors: [],
    elapsed_ms: 0
  };

  const project = await fetchProjectId(db);
  if (!project) {
    result.errors.push(`${CAMPUS_OPS_PROJECT_CODE} project not found — nothing to chase`);
    result.elapsed_ms = Date.now() - startTime;
    return result;
  }

  // The candidate set. Every clause here is load-bearing:
  //   project_id           -> only CAMPUS-OPS, never a stray project_tasks row
  //   metadata->>source    -> only campus-walk tasks, never a generic project task
  //   is_blocked = false   -> D8's paused clock. A blocked task (money,
  //                           materials, access, contractor, or the leave
  //                           auto-pause campus-walk-service.ts writes at
  //                           creation) is excluded here, full stop — it
  //                           re-enters this query the moment it is unblocked
  //                           and app/api/campus-walk/fix/route.ts's
  //                           closePause() has already pushed due_date out by
  //                           the paused days, so "days overdue" below is
  //                           always computed against the fair, extended date.
  //   due_date < today     -> not due yet is not overdue
  //   status_key not in    -> review/done/cancelled/archived are never chased
  //                           by THIS query — 'review' has its own clock, see
  //                           chaseReviewWaitDirector below (Ruling 1).
  const { data: rows, error: selectError } = await db
    .from('project_tasks')
    .select('id, title, description, due_date, status_key, owner_staff_id, metadata')
    .eq('project_id', project.id)
    .eq('metadata->>source', CAMPUS_WALK_SOURCE)
    .eq('is_blocked', false)
    .not('due_date', 'is', null)
    .lt('due_date', todayISO)
    .not('status_key', 'in', `(${TERMINAL_STATUS_KEYS.join(',')})`);

  if (selectError) {
    result.errors.push(`select failed: ${selectError.message}`);
    result.elapsed_ms = Date.now() - startTime;
    return result;
  }

  const tasks = (rows ?? []) as ChaseableTask[];
  result.scanned = tasks.length;

  // Resolved once for the whole run — cheap, and needed by BOTH Ruling 2's
  // "passed to a new owner" message to the Director and Ruling 1's
  // independent review-wait clock below, whether or not there happen to be
  // any overdue tasks this run. (The ladder itself never pages the Director:
  // its day-7 step is a line in his morning summary.) resolveDirectors() already covers the three paths fn_can_hand_over()
  // does and falls back to super admins with the fallback recorded in
  // `source` rather than silently indistinguishable from success.
  const director = await resolveDirectors(db);
  result.director_resolution = director.source;

  // Ruling 1: must run every pass, independent of whether the overdue query
  // above found anything — its candidate set is disjoint (status_key =
  // 'review', which the query above explicitly excludes).
  const reviewWait = await chaseReviewWaitDirector(db, {
    projectId: project.id,
    director,
    todayISO,
    nowIso
  });
  result.review_wait_scanned = reviewWait.scanned;
  result.review_wait_processed = reviewWait.processed;
  result.rungs.review_wait_director = reviewWait.sent;
  result.notifications_sent += reviewWait.sent;
  result.errors.push(...reviewWait.errors);

  if (tasks.length === 0) {
    result.elapsed_ms = Date.now() - startTime;
    return result;
  }

  const projectOwnerProfileId = await resolveProjectOwnerProfile(db, project.ownerStaffId);

  const {
    accountableStaffIdByTask,
    staffById,
    deptHeadByDept,
    headStaffIdByProfile,
    profileActive,
    managerProfileByStaff,
    principalsByInstitution,
    nameByProfile
  } = await bulkResolve(db, tasks, projectOwnerProfileId ? [projectOwnerProfileId] : []);

  const passes: TaskPass[] = [];
  const pendingPrincipal: PendingPrincipal[] = [];

  for (const task of tasks) {
    try {
      // CCTV reports count WORKING days late (Sundays skipped, Director 9 Oct 2026).
      const daysOverdue =
        (task.metadata ?? {}).front_door === 'cctv'
          ? workingDaysPastDue(task.due_date, todayISO)
          : daysPastDue(task.due_date, todayISO);
      if (daysOverdue < 1) {
        // Defensive only — the query's `.lt('due_date', todayISO)` already
        // guarantees this, kept in case a caller passes a `now` override.
        result.processed++;
        continue;
      }

      const metadata = (task.metadata ?? {}) as Record<string, any>;
      const priorChase = (metadata.campus_walk_chase ?? {}) as {
        rungs_sent?: Record<string, string>;
        reassignment_history?: ReassignmentRecord[];
        /** Bumped by a reporter's "Not fixed" — see chaseRungIdempotencyKey. */
        round?: number;
      };
      const rungsSent: Record<string, string> = { ...(priorChase.rungs_sent ?? {}) };
      const place = placeOf(metadata);

      let accountableStaffId = accountableStaffIdByTask.get(task.id) ?? task.owner_staff_id ?? null;
      let accountableStaff = accountableStaffId ? staffById.get(accountableStaffId) ?? null : null;
      let newOwnerStaffIdThisRun: string | null = null;
      // True whenever the reassignment block below actually ran, whether or
      // not it found somewhere to send the task — either way there is a new
      // audit record on `metadata.campus_walk_chase.reassignment` that must
      // be persisted, so this is NOT the same condition as "reassignment
      // succeeded".
      let reassignmentAttempted = false;

      // Ruling 2: the Accountable is no longer active staff. Reassign rather
      // than silently letting this resolve to "nobody to remind" (which is
      // what accountableProfileId's own isActive check below would otherwise
      // do) — see the file header ("RULING 2") and
      // reassignDepartedAccountable's own comment.
      if (accountableStaffId && accountableStaff && accountableStaff.isActive === false) {
        reassignmentAttempted = true;
        const outcome = await reassignDepartedAccountable(db, {
          taskId: task.id,
          taskTitle: task.title,
          place,
          dueDate: task.due_date,
          openPath: jobPath(task.id, metadata),
          departedStaffId: accountableStaffId,
          departedDepartmentId: accountableStaff.departmentId,
          deptHeadByDept,
          headStaffIdByProfile,
          profileActive,
          projectOwnerStaffId: project.ownerStaffId,
          projectOwnerProfileId,
          director,
          nowIso
        });

        const priorHistory = Array.isArray(priorChase.reassignment_history)
          ? priorChase.reassignment_history
          : [];
        metadata.campus_walk_chase = {
          ...(metadata.campus_walk_chase ?? {}),
          reassignment: outcome.record,
          reassignment_history: [...priorHistory, outcome.record].slice(-20)
        };

        if (outcome.handled && outcome.newStaffId && outcome.newProfileId) {
          result.reassignments_sent++;
          newOwnerStaffIdThisRun = outcome.newStaffId;
          accountableStaffId = outcome.newStaffId;
          accountableStaff = {
            profileId: outcome.newProfileId,
            isActive: true,
            departmentId: outcome.newDepartmentId
          };
        } else {
          result.errors.push(
            `task ${task.id}: accountable team member ${outcome.record.from_staff_id} is inactive and could not be reassigned (${outcome.record.outcome})`
          );
        }
      }

      const accountableProfileId =
        accountableStaff && accountableStaff.isActive && accountableStaff.profileId
          ? profileActive.get(accountableStaff.profileId) !== false
            ? accountableStaff.profileId
            : null
          : null;

      const boss = resolveBoss({
        accountableProfileId,
        accountableStaffId,
        departmentId: accountableStaff?.departmentId ?? null,
        deptHeadByDept,
        managerProfileByStaff,
        profileActive,
        projectOwnerProfileId
      });

      const fixerTold: ToldPerson[] = accountableProfileId
        ? [{ name: nameByProfile.get(accountableProfileId) ?? null, role: 'responsible for the job' }]
        : [];
      const bossTold: ToldPerson[] = boss ? [{ name: nameByProfile.get(boss.id) ?? null, role: boss.role }] : [];

      const pass: TaskPass = {
        task,
        metadata,
        rungsSent,
        metadataChanged: reassignmentAttempted,
        newOwnerStaffId: newOwnerStaffIdThisRun,
        daysOverdue,
        principalListKey: null
      };

      for (const rungKey of rungsDue(daysOverdue, rungsSent, metadata)) {
        if (rungKey === 'reached_director') {
          // No message of its own: the Director hears about it ONCE, in the
          // 8 am summary (lib/campus-walk/director-digest.ts), which lists
          // every job whose marker landed since the previous summary.
          rungsSent.reached_director = nowIso;
          pass.metadataChanged = true;
          result.rungs.reached_director++;
          continue;
        }

        if (rungKey === 'escalate_principal') {
          const institutionId =
            typeof metadata.institution_id === 'string' && metadata.institution_id ? metadata.institution_id : null;
          const principals = institutionId ? principalsByInstitution.get(institutionId) ?? [] : [];
          if (!institutionId || principals.length === 0) {
            // Retried every run (a principal may be recorded later). The job
            // still reaches the Director at day 7 regardless.
            result.errors.push(
              `task ${task.id} (escalate_principal): no active principal on record for ${
                institutionId ? `college ${institutionId}` : 'this job — its college is not recorded'
              }`
            );
            continue;
          }
          // Sent after every task has been looked at, so that a college with
          // several catch-up jobs this morning gets them as ONE list.
          pendingPrincipal.push({
            pass,
            institutionId,
            principals,
            recipients: [...principals.map((p) => p.id), accountableProfileId, boss?.id ?? null].filter(
              (id): id is string => Boolean(id)
            ),
            told: [...principals.map((p) => ({ name: p.name, role: 'principal' })), ...fixerTold, ...bossTold],
            place,
            bossLabel: boss?.label ?? null,
            bossRole: boss?.role ?? null,
            idempotencyKey: chaseRungIdempotencyKey(rungKey, task.id, priorChase.round)
          });
          continue;
        }

        // escalate_boss
        const recipients = [accountableProfileId, boss?.id ?? null].filter((id): id is string => Boolean(id));
        const check = validateTargeting(recipients);
        if (!check.ok) {
          result.errors.push(`task ${task.id} (${rungKey}): no resolvable recipient — ${check.reason}`);
          continue;
        }

        const copy = climbMessage(rungKey, {
          title: task.title,
          place,
          dueDate: task.due_date,
          daysOverdue,
          bossLabel: boss?.label ?? null,
          told: [...fixerTold, ...bossTold]
        });

        const sendResult = await sendRung(db, {
          recipientIds: check.userIds,
          title: copy.title,
          body: copy.body,
          // The fix screen — or, for a routine check still waiting for its
          // answer, the check screen. Both admit the fixer and their
          // department head.
          url: jobPath(task.id, metadata),
          category: 'campus-walk:chase-boss',
          metadata: {
            task_id: task.id,
            source: CAMPUS_WALK_SOURCE,
            rung: rungKey,
            days_overdue: daysOverdue,
            boss_role: boss?.role ?? null
          },
          idempotencyKey: chaseRungIdempotencyKey(rungKey, task.id, priorChase.round)
        });

        if (sendResult.sent) {
          rungsSent[rungKey] = sendResult.notifiedAt ?? nowIso;
          pass.metadataChanged = true;
          result.rungs[rungKey]++;
          result.notifications_sent++;
        } else {
          result.errors.push(`task ${task.id} (${rungKey}): notification send failed`);
        }
      }

      passes.push(pass);
    } catch (e: any) {
      result.errors.push(`task ${task.id}: ${e?.message ?? String(e)}`);
      // fail soft — one task's exception must not abort the sweep.
    }
  }

  // The principal step, one college at a time. A college with a catch-up job
  // this morning (its principal step due later than day 3 — deploy day, or a
  // missed morning) and more than one job due gets them all as ONE list; any
  // other college gets the ordinary per-job message.
  const byCollege = new Map<string, PendingPrincipal[]>();
  for (const p of pendingPrincipal) {
    const list = byCollege.get(p.institutionId) ?? [];
    list.push(p);
    byCollege.set(p.institutionId, list);
  }

  for (const [institutionId, group] of byCollege) {
    try {
      const fold = group.length > 1 && group.some((p) => isCatchUpPrincipalStep(p.pass.daysOverdue, p.pass.metadata));
      if (fold) {
        const recipients = group[0].principals.map((p) => p.id);
        const check = validateTargeting(recipients);
        if (!check.ok) {
          result.errors.push(`college ${institutionId} (principal list): no resolvable recipient — ${check.reason}`);
          continue;
        }
        const copy = principalListMessage(
          group.map((p) => ({
            title: p.pass.task.title,
            place: p.place,
            dueDate: p.pass.task.due_date,
            daysOverdue: p.pass.daysOverdue
          })),
          group[0].principals.map((p) => ({ name: p.name, role: 'principal' }))
        );
        const idempotencyKey = principalListIdempotencyKey(institutionId, todayISO);
        const sendResult = await sendRung(db, {
          recipientIds: check.userIds,
          title: copy.title,
          body: copy.body,
          url: `/projects/${project.id}`,
          category: PRINCIPAL_LIST_CATEGORY,
          metadata: {
            source: CAMPUS_WALK_SOURCE,
            institution_id: institutionId,
            run_date: todayISO,
            task_ids: group.map((p) => p.pass.task.id),
            jobs: group.length
          },
          idempotencyKey
        });
        if (sendResult.sent) {
          for (const p of group) {
            p.pass.rungsSent.escalate_principal = sendResult.notifiedAt ?? nowIso;
            p.pass.principalListKey = idempotencyKey;
            p.pass.metadataChanged = true;
            result.rungs.escalate_principal++;
          }
          result.principal_lists++;
          result.notifications_sent++;
        } else {
          result.errors.push(`college ${institutionId} (principal list): notification send failed`);
        }
        continue;
      }

      for (const p of group) {
        const taskId = p.pass.task.id;
        const check = validateTargeting(p.recipients);
        if (!check.ok) {
          result.errors.push(`task ${taskId} (escalate_principal): no resolvable recipient — ${check.reason}`);
          continue;
        }
        const copy = climbMessage('escalate_principal', {
          title: p.pass.task.title,
          place: p.place,
          dueDate: p.pass.task.due_date,
          daysOverdue: p.pass.daysOverdue,
          bossLabel: p.bossLabel,
          told: p.told
        });
        const sendResult = await sendRung(db, {
          recipientIds: check.userIds,
          title: copy.title,
          body: copy.body,
          // The fix and check screens open only for the fixer and their
          // department head; a principal lands on the Campus Operations board.
          url: `/projects/${project.id}`,
          category: 'campus-walk:chase-principal',
          metadata: {
            task_id: taskId,
            source: CAMPUS_WALK_SOURCE,
            rung: 'escalate_principal',
            days_overdue: p.pass.daysOverdue,
            boss_role: p.bossRole
          },
          idempotencyKey: p.idempotencyKey
        });
        if (sendResult.sent) {
          p.pass.rungsSent.escalate_principal = sendResult.notifiedAt ?? nowIso;
          p.pass.metadataChanged = true;
          result.rungs.escalate_principal++;
          result.notifications_sent++;
        } else {
          result.errors.push(`task ${taskId} (escalate_principal): notification send failed`);
        }
      }
    } catch (e: any) {
      result.errors.push(`college ${institutionId} (principal step): ${e?.message ?? String(e)}`);
    }
  }

  // Record what each job has now reached — after the principal step, so a
  // job's single metadata write carries every step it took this run.
  for (const pass of passes) {
    try {
      if (pass.metadataChanged) {
        const { task, metadata } = pass;
        const updatePayload: Record<string, unknown> = {
          metadata: {
            ...metadata,
            campus_walk_chase: {
              ...(metadata.campus_walk_chase ?? {}),
              rungs_sent: pass.rungsSent,
              ...(pass.principalListKey ? { principal_list_key: pass.principalListKey } : {}),
              last_run_at: nowIso,
              last_days_overdue: pass.daysOverdue
            }
          }
        };
        if (pass.newOwnerStaffId) {
          updatePayload.owner_staff_id = pass.newOwnerStaffId;
        }

        const { error: updateError } = await db
          .from('project_tasks')
          .update(updatePayload)
          .eq('id', task.id);
        if (updateError) {
          // The notification(s) already went out; losing the audit trail here
          // is real but strictly less bad than not sending, and the DB
          // idempotency key still stops a duplicate next run regardless.
          result.errors.push(`task ${task.id}: metadata write failed — ${updateError.message}`);
        }
      }
      result.processed++;
    } catch (e: any) {
      result.errors.push(`task ${pass.task.id}: ${e?.message ?? String(e)}`);
    }
  }

  if (result.errors.length > 0) {
    logger.warn(MODULE, `run completed with ${result.errors.length} error(s)`, {
      sample: result.errors.slice(0, 5)
    });
  }

  result.elapsed_ms = Date.now() - startTime;
  return result;
}
