// =====================================================================
// RCLTP — chasing work that has been left unreviewed
// =====================================================================
// Director decisions 4 and 5 (interview 2026-07-28,
// specs/rcltp-access-decisions-2026-07-28.md):
//
//   #4  Remind, then escalate. An item nobody has touched for ~7 days
//       reminds whoever may approve it; still untouched at ~14 days, the
//       head of that school is told.
//   #5  When the reminder and the escalation would land in the SAME
//       inbox, escalate to system administrators instead. Today the head
//       IS the reviewer at the one live school, so a naive escalation
//       would message one person twice and provide no safety net at all.
//
// ONE CHASING SYSTEM, TWO STREAMS. Director edge ruling 3 of 2026-07-25 is
// load-bearing here: unapproved remedial reading plans and unreviewed
// AI-drafted comprehension questions are chased by the same code on the
// same clock. Two half-systems drift apart and is exactly the failure the
// ruling exists to prevent, so both streams share dueStage(), share the
// recipient rules below, and share the key shape.
//
// STATELESS BY DESIGN. There is no chase log, no new column and no
// migration. An item's age is derived from created_at, and "have we said
// this already?" is answered by fanoutNotification's idempotencyKey — the
// notifications table has a UNIQUE partial index on it. The key carries
// the item id AND the stage, so one item yields at most ONE reminder and
// at most ONE escalation across its entire life, no matter how many times
// the cron runs.
//
// EXACTLY ONE STAGE IS DUE PER ITEM, EVER (dueStage). An item first seen
// when it is already past 14 days gets the escalation ONLY — never a
// backdated reminder chased by an escalation in the same run. That is
// what makes a first run against an existing backlog safe.
//
// WHO MAY APPROVE — resolved by PERMISSION, never by role name, because
// Role Management is the single source of truth for access and hardcoded
// role names in logic are prohibited repo-wide. The two permission sets
// below mirror the RLS policies that actually admit the write:
//   • questions      → rcltp_pbq_update_review
//                      (20260723150000_rcltp_question_review_fixes.sql)
//   • remedial plans → rcltp_remedial_plans_select
//                      (20260723060000_rcltp_remedial_plan_draft_loop.sql)
//
// WHO IS THE HEAD — not decided here. resolveRcltpNotifyTargets() in
// lib/services/rcltp/notify-targets.ts is the ONE definition of "who to
// tell at a school", and its administrator tier is reused verbatim as
// decision 5's fallback. This module never re-derives either rule.
// =====================================================================

import {
  resolveRcltpNotifyTargets,
  permissionGranted,
} from '@/lib/services/rcltp/notify-targets';

/** Loose read shape so a plain fake can drive this in unit tests. */
type Admin = { from: (table: string) => any };

// ── thresholds ───────────────────────────────────────────────────────
/** Decision 4: remind whoever may approve after roughly a week. */
export const CHASE_REMIND_AFTER_DAYS = 7;
/** Decision 4: escalate after roughly a fortnight. */
export const CHASE_ESCALATE_AFTER_DAYS = 14;
/**
 * Most items either stream may chase in one run. A bound, not a policy:
 * a run against an unexpectedly large backlog spreads over several nights
 * instead of emptying it into everyone's bell at once. Nothing is dropped
 * — the leftovers are still due tomorrow, because nothing is marked.
 */
export const CHASE_BATCH_CAP = 25;

// ── who may approve (mirrors the RLS policies named in the header) ────
export const QUESTION_APPROVE_PERMISSIONS = [
  'rcltp.question.approve',
  'rcltp.config.manage',
];
export const REMEDIAL_PLAN_APPROVE_PERMISSIONS = [
  'rcltp.review',
  'rcltp.report.view_all',
  'rcltp.config.manage',
];

// ── shapes ───────────────────────────────────────────────────────────
export type ChaseStage = 'remind' | 'escalate';
export type ChaseStream = 'questions' | 'remedial_plan';

export interface ChaseItem {
  stream: ChaseStream;
  /**
   * What is being chased. For remedial plans this is the plan id. For
   * questions it is the PASSAGE id, not a single question row — see
   * findPendingQuestionSets for why.
   */
  itemId: string;
  institutionId: string;
  /** Human-readable handle for the notice body. Never a person's name. */
  label: string;
  /** How many unreviewed rows this item covers (1 for a plan). */
  pendingCount: number;
  oldestCreatedAt: string;
  ageDays: number;
  stage: ChaseStage;
}

export interface ChaseNotice {
  title: string;
  body: string;
  url: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
}

export interface ChaseRecipients {
  userIds: string[];
  /**
   * Flat string rather than a union of object shapes — this repo runs
   * strictNullChecks:false, where a discriminated union does not narrow.
   *   approvers         → decision 4's reminder tier
   *   head              → decision 4's escalation tier
   *   admin_same_person → decision 5 fired: the head had already been told
   *   admin_fallback    → no active head at that school (decision 3)
   */
  via: string;
}

// ── age + stage ──────────────────────────────────────────────────────
const MS_PER_DAY = 86_400_000;

/** Whole days between `iso` and `nowMs`. Negative clamps to 0. */
export function ageInDays(iso: string, nowMs: number): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((nowMs - then) / MS_PER_DAY));
}

/**
 * The single stage an item is due for right now, or '' for nothing due.
 *
 * Escalation is checked FIRST and wins outright. An item that is already
 * three weeks old the first time this route ever runs must not receive a
 * reminder it is far too late for and an escalation in the same breath —
 * it gets the escalation, once. Returns '' rather than null because a
 * strictNullChecks:false repo cannot narrow null away.
 */
export function dueStage(ageDays: number): ChaseStage | '' {
  if (ageDays >= CHASE_ESCALATE_AFTER_DAYS) return 'escalate';
  if (ageDays >= CHASE_REMIND_AFTER_DAYS) return 'remind';
  return '';
}

// ── finders ──────────────────────────────────────────────────────────

/**
 * Unreviewed comprehension questions, GROUPED BY PASSAGE.
 *
 * The grouping is the point. Production's seven pending drafts are one
 * generated set for one passage, written in a single batch and approved
 * in a single sitting in the review console. Chasing each row would put
 * seven bell items in front of a person facing one piece of work — noise
 * of exactly the kind that gets notifications muted, which would recreate
 * the silence decision 4 exists to end.
 *
 * The passage is also a safe key for once-per-life: the generator refuses
 * to draft a second set for a passage that already has questions
 * (alreadyHasAiDraft / findCandidatePassages in the generation cron), so
 * one passage carries at most one AI-drafted set, ever.
 *
 * LIMITATION, stated plainly: if a passage's set is chased and someone
 * later hand-adds another draft question to that same passage, the second
 * batch inherits the first one's key and is not chased again. Preferable
 * to the alternative — keying on the oldest pending row would re-fire the
 * whole notice every time one question of a set was approved, turning
 * partial progress into a fresh nag.
 */
export async function findPendingQuestionSets(
  admin: Admin,
  nowMs: number,
): Promise<ChaseItem[]> {
  const { data, error } = await admin
    .from('rcltp_part_b_questions')
    .select('id, passage_id, institution_id, created_at')
    .eq('status', 'draft')
    .eq('is_active', true)
    .is('reviewed_at', null)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[rcltp/review-chaser] question scan failed:', error.message);
    return [];
  }

  type Row = {
    id: string;
    passage_id: string;
    institution_id: string;
    created_at: string;
  };
  const rows = (data ?? []) as Row[];

  const byPassage = new Map<string, { institutionId: string; oldest: string; count: number }>();
  for (const row of rows) {
    if (!row.passage_id || !row.institution_id) continue;
    const seen = byPassage.get(row.passage_id);
    if (!seen) {
      byPassage.set(row.passage_id, {
        institutionId: row.institution_id,
        oldest: row.created_at,
        count: 1,
      });
      continue;
    }
    seen.count += 1;
    if (new Date(row.created_at).getTime() < new Date(seen.oldest).getTime()) {
      seen.oldest = row.created_at;
    }
  }

  const due: ChaseItem[] = [];
  for (const [passageId, agg] of byPassage) {
    const ageDays = ageInDays(agg.oldest, nowMs);
    const stage = dueStage(ageDays);
    if (!stage) continue;
    due.push({
      stream: 'questions',
      itemId: passageId,
      institutionId: agg.institutionId,
      label: '',
      pendingCount: agg.count,
      oldestCreatedAt: agg.oldest,
      ageDays,
      stage,
    });
  }
  // Cap BEFORE reading titles, so the title lookup is bounded by the batch cap
  // rather than by however large the backlog happens to be.
  const chasing = sortAndCap(due);
  if (chasing.length === 0) return [];

  // Passage titles, for a notice that names the reading material.
  const { data: passages, error: pErr } = await admin
    .from('rcltp_passages')
    .select('id, title')
    .in(
      'id',
      chasing.map((d) => d.itemId),
    );
  if (pErr) {
    console.error('[rcltp/review-chaser] passage title read failed:', pErr.message);
  } else {
    const titles = new Map<string, string>();
    for (const p of (passages ?? []) as Array<{ id: string; title: string }>) {
      if (p.id) titles.set(p.id, p.title);
    }
    for (const item of chasing) item.label = titles.get(item.itemId) ?? '';
  }

  return chasing;
}

/**
 * Remedial reading plans an AI drafted that nobody has approved.
 *
 * status='draft' with no approver is the whole condition: the ONLY path
 * to 'approved' is fn_rcltp_remedial_plan_approve, a permissioned human
 * action, so a plan still sitting in 'draft' is by definition untouched
 * by a reviewer. 'queued' is deliberately excluded — the AI has not
 * written it yet, so there is nothing for a person to approve.
 */
export async function findPendingRemedialPlans(
  admin: Admin,
  nowMs: number,
): Promise<ChaseItem[]> {
  const { data, error } = await admin
    .from('rcltp_remedial_plans')
    .select('id, institution_id, created_at, cycle_no')
    .eq('status', 'draft')
    .is('approved_at', null)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[rcltp/review-chaser] remedial plan scan failed:', error.message);
    return [];
  }

  type Row = {
    id: string;
    institution_id: string;
    created_at: string;
    cycle_no: number;
  };
  const due: ChaseItem[] = [];
  for (const row of (data ?? []) as Row[]) {
    if (!row.id || !row.institution_id) continue;
    const ageDays = ageInDays(row.created_at, nowMs);
    const stage = dueStage(ageDays);
    if (!stage) continue;
    due.push({
      stream: 'remedial_plan',
      itemId: row.id,
      institutionId: row.institution_id,
      // No learner name: the notice is a nudge, not a record, and the
      // plan is one click away on the page the notice links to.
      label: row.cycle_no ? `cycle ${row.cycle_no}` : '',
      pendingCount: 1,
      oldestCreatedAt: row.created_at,
      ageDays,
      stage,
    });
  }
  return sortAndCap(due);
}

/** Oldest first — the most overdue work is chased before the rest. */
function sortAndCap(items: ChaseItem[]): ChaseItem[] {
  return items.sort((a, b) => b.ageDays - a.ageDays).slice(0, CHASE_BATCH_CAP);
}

/**
 * PostgREST puts `.in()` values in the QUERY STRING, so a large list becomes a
 * URL long enough for the request to be rejected outright — `fetch failed`,
 * not a Postgres error, so it does not even arrive as a row-level problem.
 *
 * This is not hypothetical. `rcltp.review` is granted to the facilitator role,
 * which carries 483 users; the remedial-plan permission set resolves 515
 * candidate ids in production today, and a single `.in()` over them fails every
 * time. Chunking keeps each URL small. 150 ids ≈ 6 KB of query string, well
 * inside every limit in the path.
 */
const IN_FILTER_CHUNK = 150;

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

// ── recipients ───────────────────────────────────────────────────────

/**
 * Active, non-super-admin profiles at `institutionId` holding ANY of
 * `permissions` — decision 4's reminder tier.
 *
 * WHY THIS QUERY LIVES HERE. notify-targets.ts owns "who is the head of a
 * school" and this module imports it whole; it does not own "who may
 * approve THIS kind of item", which is a different question with a
 * different answer per stream and no prior definition in TypeScript —
 * until now it existed only inside the two RLS policies named in the
 * header. Its head query is private, single-permission, and correctly
 * shaped for that rule alone. Exporting a generic version would mean
 * editing the file currently under review in #2613; if a third caller
 * appears, extract it there rather than copying this.
 *
 * Both assignment routes are read for the same reason notify-targets
 * reads both: the platform supports the many-to-many `user_roles` table
 * AND the legacy `profiles.role` column, and reading one would miss
 * whoever happens to be wired the other way.
 *
 * SUPER ADMINS ARE EXCLUDED even though the RLS policies admit them via
 * is_super_admin(). They are the escalation safety net; if they were also
 * in the reminder tier, decision 5's overlap test would find them already
 * told and the escalation would have nowhere left to go. Being able to
 * approve is not the same as being the person to nag.
 */
export async function resolveApprovers(
  admin: Admin,
  institutionId: string,
  permissions: string[],
): Promise<string[]> {
  if (!institutionId || permissions.length === 0) return [];

  const { data: roleRows, error: roleErr } = await admin
    .from('custom_roles')
    .select('id, role_key, permissions')
    .eq('is_active', true);
  if (roleErr) {
    console.error('[rcltp/review-chaser] role scan failed:', roleErr.message);
    return [];
  }

  const granting = ((roleRows ?? []) as Array<{
    id: string;
    role_key: string;
    permissions: unknown;
  }>).filter((r) => permissions.some((p) => permissionGranted(r.permissions, p)));
  if (granting.length === 0) return [];

  const roleIds = granting.map((r) => r.id).filter(Boolean);
  const roleKeys = granting.map((r) => r.role_key).filter(Boolean);

  const candidateIds = new Set<string>();
  if (roleIds.length > 0) {
    const { data, error } = await admin
      .from('user_roles')
      .select('user_id')
      .in('role_id', roleIds);
    if (error) {
      console.error('[rcltp/review-chaser] user_roles scan failed:', error.message);
    } else {
      for (const row of (data ?? []) as Array<{ user_id: string }>) {
        if (row.user_id) candidateIds.add(row.user_id);
      }
    }
  }

  const approvers = new Set<string>();

  for (const ids of chunk(Array.from(candidateIds), IN_FILTER_CHUNK)) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, is_super_admin')
      .in('id', ids)
      .eq('institution_id', institutionId)
      .eq('is_active', true);
    if (error) {
      console.error('[rcltp/review-chaser] approver profile scan failed:', error.message);
    } else {
      for (const row of (data ?? []) as Array<{ id: string; is_super_admin?: boolean }>) {
        if (row.id && row.is_super_admin !== true) approvers.add(row.id);
      }
    }
  }

  if (roleKeys.length > 0) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, is_super_admin')
      .in('role', roleKeys)
      .eq('institution_id', institutionId)
      .eq('is_active', true);
    if (error) {
      console.error('[rcltp/review-chaser] legacy-role approver scan failed:', error.message);
    } else {
      for (const row of (data ?? []) as Array<{ id: string; is_super_admin?: boolean }>) {
        if (row.id && row.is_super_admin !== true) approvers.add(row.id);
      }
    }
  }

  return Array.from(approvers);
}

/**
 * Decision 5, by comparing resolved recipient ID SETS — never by
 * assuming which role names sit where.
 *
 * The escalation only earns its name if it puts the item in front of an
 * inbox the reminder did not reach. If every person the head tier
 * resolves to has already been reminded, the escalation adds no eyes, so
 * it goes to system administrators instead — reusing notify-targets'
 * own administrator tier, which is what a call with no institution
 * returns.
 *
 * The reminder set is recomputed now rather than recorded a week ago;
 * that is the price of staying stateless, and it is the right
 * approximation because the question being asked is "who has this
 * already been put in front of", which is a property of today's role
 * assignments, not of last week's.
 */
export async function resolveEscalationRecipients(
  admin: Admin,
  institutionId: string,
  remindedUserIds: string[],
): Promise<ChaseRecipients> {
  const head = await resolveRcltpNotifyTargets(admin, { institutionId });

  if (head.via === 'head' && head.userIds.length > 0) {
    const alreadyTold = new Set(remindedUserIds);
    const addsSomeone = head.userIds.some((id) => !alreadyTold.has(id));
    if (addsSomeone) return { userIds: head.userIds, via: 'head' };

    const admins = await resolveRcltpNotifyTargets(admin, { institutionId: null });
    return { userIds: admins.userIds, via: 'admin_same_person' };
  }

  // No active head at that school — notify-targets has already fallen
  // back to administrators (decision 3). Nothing more to decide.
  return { userIds: head.userIds, via: head.via };
}

// ── notice copy ──────────────────────────────────────────────────────

const QUESTION_REVIEW_URL = '/rcltp/teacher/questions';
const REMEDIAL_PLAN_REVIEW_URL = '/rcltp/teacher/remedial-plans';

function named(label: string, fallback: string): string {
  return label ? `"${label}"` : fallback;
}

/**
 * What the bell item says, and the key that stops it ever being said
 * twice. The key carries the stream, the stage and the item id — so a
 * reminder and an escalation for the same item are distinct rows, and a
 * second run of either is a no-op at the UNIQUE index.
 */
export function buildChaseNotice(item: ChaseItem): ChaseNotice {
  const days = item.ageDays;
  const isQuestions = item.stream === 'questions';
  const url = isQuestions ? QUESTION_REVIEW_URL : REMEDIAL_PLAN_REVIEW_URL;

  let title: string;
  let body: string;

  if (isQuestions && item.stage === 'remind') {
    const set = named(item.label, 'a reading passage');
    title = 'Reading questions are waiting for your approval';
    body =
      `${item.pendingCount} draft comprehension question(s) for ${set} have been waiting ` +
      `${days} days and nobody has approved or edited them yet. Learners cannot be given ` +
      'them until they are approved. Open Reading (RCLTP) → Question review to approve, ' +
      'edit or retire the set.';
  } else if (isQuestions) {
    const set = named(item.label, 'a reading passage');
    title = 'Reading questions have gone two weeks without a decision';
    body =
      `${item.pendingCount} draft comprehension question(s) for ${set} have now been waiting ` +
      `${days} days. The people who can approve them were reminded a week ago and nothing ` +
      'has changed since. Open Reading (RCLTP) → Question review, or find someone who can.';
  } else if (item.stage === 'remind') {
    const which = item.label ? ` (${item.label})` : '';
    title = 'A remedial reading plan is waiting for your approval';
    body =
      `An AI-drafted remedial reading plan${which} has been waiting ${days} days for review. ` +
      'The learner it was written for will not receive it until somebody approves it. Open ' +
      'Reading (RCLTP) → Remedial plans to read, edit and approve it.';
  } else {
    const which = item.label ? ` (${item.label})` : '';
    title = 'A remedial reading plan has gone two weeks without a decision';
    body =
      `An AI-drafted remedial reading plan${which} has now been waiting ${days} days. The ` +
      'people who can approve it were reminded a week ago and nothing has changed since. ' +
      'The learner is still waiting. Open Reading (RCLTP) → Remedial plans, or find someone ' +
      'who can approve it.';
  }

  return {
    title,
    body,
    url,
    idempotencyKey: `rcltp-chase-${item.stream}-${item.stage}-${item.itemId}`,
    metadata: {
      stream: item.stream,
      stage: item.stage,
      item_id: item.itemId,
      pending_count: item.pendingCount,
      age_days: days,
      institution_id: item.institutionId,
      route: 'rcltp-review-chase',
    },
  };
}
