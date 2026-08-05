// lib/services/director-desk/handover-chase-service.ts
// ============================================================================
// Director's Desk — the chase engine (decisions 9, 10, 11, 12).
//
// Keeps handovers green: a daily nudge to whoever holds one, a status sweep
// that is the ONLY writer of `expired` and `orphaned`, and — when a due date
// passes with the work still open — the explain-in-24h-or-meet valve.
//
// ---------------------------------------------------------------------------
// THIS IS NOT A SECOND ENGINE
// ---------------------------------------------------------------------------
// The explain-or-meet valve already exists on this platform, for project tasks:
// `meeting_trigger_rules` / `meeting_trigger_events`, a 24h window, escalation
// to `meeting_pending`, and `bookPendingMeetings()` which finds the soonest slot
// both people are actually free and books it. That machinery is already
// SUBJECT-SCOPED (subject_type / subject_id).
//
// So decision 11 is implemented by teaching it one new subject type,
// 'handover', and letting the existing booking pass do the booking. Concretely:
// this file writes a `meeting_trigger_events` row with subject_type='handover',
// subject_id = the handover, judge_profile_id = the Director who handed it over,
// notified_profile_ids = [the grantee]. `bookPendingMeetings()` then reads it,
// makes the judge the host and the grantee the attendee, and books — which is
// exactly "auto-book a meeting between Director and grantee", written once.
//
// Only ONE thing genuinely differs from the project path and therefore lives
// here rather than there: what counts as an explanation. A project breach is
// answered in the notification (`action_responses`); a handover is answered by
// posting a progress note through `fn_director_handover_progress`, which lands
// in `director_handover_audit`. Detecting that is `reconcileHandoverExplanations`
// below, and it is why `reconcileProjectExplanations` now skips handover rows —
// left alone it would find no `action_responses` row and escalate every handover
// to a meeting no matter how diligently the person had answered.
//
// ---------------------------------------------------------------------------
// THE RELABEL COMES AFTER THE WINDOW, NOT BEFORE IT (defect E1)
// ---------------------------------------------------------------------------
// The first version of this file set the handover to 'expired' and THEN opened
// the 24h valve on it. That made decision 11 unsatisfiable, not merely awkward:
// `fn_director_handover_progress` — the ONLY writer of the audit row this
// reconciler looks for — raises 22023 "This handover is closed" on any status
// outside ('pending','accepted'). So the grantee was told "post a short note
// within 24 hours", the button threw, no `action='progress'` row could exist,
// and 24 hours later everybody was escalated to a meeting regardless of how
// diligently they answered.
//
// So the order is inverted. A handover past its due date keeps its
// pending/accepted LABEL for exactly as long as its explanation window is open,
// and the relabel to 'expired' happens when that window resolves — answered,
// escalated, or closed out. This costs nothing in access terms and is not a
// softening of decision 4: the door is shut by `fn_handover_grants_key`, which
// tests `due_date >= today` directly and never reads the label. What the label
// controls is the grantee's ability to ANSWER, and taking that away before
// asking the question is the defect.
//
// When no window will open at all (the rule is switched off, or its threshold
// puts the valve out of reach) there is nothing to protect, and the relabel
// happens immediately — the original behaviour, kept.
//
// ---------------------------------------------------------------------------
// THE VOLUME FUSE
// ---------------------------------------------------------------------------
// Decision 9 is a recorded Director override: live from night one, daily, over
// a recommendation to run silent for a week. Built as instructed. The fuse is
// not a quiet softening of that — it is the one piece of engineering that makes
// "live on night one" survivable.
//
// Before ANY send, the run resolves its whole recipient list. Over `limit`
// (HANDOVER_CHASE_MAX_RECIPIENTS, default 50) and the run sends nothing at all,
// tells the Director alone what it computed and why, and stops. The reasoning:
// this engine writes to one person per live handover, and a real desk does not
// have 50 live handovers on it. So >50 is not "a busy night", it is a
// recipient-resolution bug — and the difference between catching that and not
// is one alert versus a mass mail to the institution.
//
// A blown fuse halts the status sweep too, not just the sending. That is
// deliberate: it makes a run atomic (it happened or it did not), and it costs
// nothing, because access is already governed live by `fn_handover_grants_key`
// (which re-checks the due date and the grantee's is_active on every permission
// check). `expired` and `orphaned` are the LABEL and the TELLING; the door is
// already shut without them.
//
// The people who receive the ALERT are deliberately NOT counted toward the fuse
// (defect E2). They are written to only on the night the fuse blows, and on that
// night nothing else is sent — so counting them made the ceiling mean something
// other than what it says. With a Director population of zero (the live state
// today) the old arithmetic silently turned a stated ceiling of 50 grantees into
// an actual one of 40.
//
// Every run is written to `director_handover_chase_runs`, fuse blown or not.
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  createBellNotification,
  getSuperAdminIds,
  todayIST
} from '@/lib/services/meetings/meeting-trigger-service';
import type { SupabaseClient } from '@supabase/supabase-js';

const MODULE = 'director-desk/chase';

/** metric_key of the rule seeded by 20260811140000. */
export const HANDOVER_METRIC = 'handover_overdue';
/** The subject type this engine adds to the shared breach ledger. */
export const HANDOVER_SUBJECT = 'handover';
/** Decision 11: the grantee gets a day to say what happened. */
export const EXPLANATION_WINDOW_HOURS = 24;
/**
 * The permission key `fn_can_hand_over()` reads when deciding whether somebody
 * is a Director. Duplicated here because that function answers only for
 * `auth.uid()` and cannot enumerate.
 */
export const HANDOVER_CREATE_KEY = 'director.handover.create';
/** The role key `fn_can_hand_over()` matches, on both the legacy and the canonical path. */
export const DIRECTOR_ROLE_KEY = 'director';
/**
 * Every audit action that counts as ANSWERING the explain-in-24h question.
 *
 * Not just 'progress'. Once the relabel was moved to after the window (defect
 * E1) the grantee can also reach `fn_director_handover_complete` and
 * `fn_director_handover_respond` inside the window — finishing the work, or
 * handing it back with a reason, are both answers, and escalating either of them
 * to a meeting would be the same bug wearing a different hat.
 */
export const ANSWER_ACTIONS = ['progress', 'done', 'declined'] as const;
/** Default blast-radius ceiling; override with HANDOVER_CHASE_MAX_RECIPIENTS. */
export const DEFAULT_MAX_RECIPIENTS = 50;
/**
 * Hard ceiling on how many handovers one run will even load. Far above any
 * plausible real number — it exists so a runaway query cannot turn into a
 * runaway run before the fuse has had a chance to look at it.
 */
const LOAD_LIMIT = 500;
/**
 * Ids per `.in(...)` lookup.
 *
 * PostgREST puts the whole list in the QUERY STRING, and a uuid costs 37 bytes
 * there. LOAD_LIMIT ids in one request is ~18.5 KB of URL, past the usual 8–16 KB
 * request-line ceiling, and the reply is a 414 the sweep would (correctly) treat
 * as "I could not look" — so the labels would simply stop being written, quietly,
 * on exactly the busy night somebody is watching.
 */
const IN_CHUNK = 100;

/** Split a list into `IN_CHUNK`-sized batches for a PostgREST `.in()` lookup. */
function chunk<T>(xs: T[], size: number = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/**
 * Where the two sides of this feature live. Both routes are owned by sibling
 * lanes (PR3 builds /my-desk, PR4 the Director's desk) and neither exists on
 * main yet — these constants are the single place to correct if those lanes
 * land on different paths.
 */
const GRANTEE_DESK_URL = '/my-desk';
const DIRECTOR_DESK_URL = '/director-desk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HandoverRow {
  id: string;
  route: string;
  title: string;
  grantee_user_id: string;
  granted_by: string;
  institution_id: string | null;
  status: string;
  due_date: string;
  last_activity_at: string | null;
  responded_at: string | null;
}

export interface GranteeProfile {
  id: string;
  is_active: boolean | null;
}

export interface Classification {
  /** status pending|accepted, grantee active, due date not yet passed. */
  live: HandoverRow[];
  /** due date passed while still open — open the 24h valve, relabel after it. */
  expired: HandoverRow[];
  /** grantee's profile is gone or inactive — relabel + tell the Director. */
  orphaned: HandoverRow[];
}

/**
 * Who "the Director" is, and — just as important — how that was worked out.
 * `source` exists so a run that could not find one says so in the ledger instead
 * of quietly fanning a cross-college alert out to super admins (defect E2).
 */
export interface DirectorResolution {
  ids: string[];
  source: 'director' | 'super_admin_fallback' | 'none';
  /** How many ids each of `fn_can_hand_over`'s three paths produced. */
  by_path: {
    legacy_profile_role: number;
    user_roles_assignment: number;
    profile_role_permission: number;
  };
}

export interface HandoverChaseResult {
  run_date: string;
  loaded: number;
  live_handovers: number;
  recipients_resolved: number;
  fuse_limit: number;
  fuse_blown: boolean;
  nudged: number;
  already_nudged: number;
  expired: number;
  orphaned: number;
  overdue_opened: number;
  /** Past due with an explanation window still open — deliberately NOT relabelled yet. */
  awaiting_explanation: number;
  explained: number;
  escalated: number;
  /** Windows closed without a meeting because the handover was finished/handed back. */
  dismissed: number;
  director_notices: number;
  director_resolution: DirectorResolution['source'];
  errors: string[];
}

export interface HandoverReconcileResult {
  explained: number;
  escalated: number;
  /** Resolved without a meeting: the handover was closed before the window ended. */
  dismissed: number;
  /** Handovers actually relabelled to 'expired' as their window closed. */
  relabelled: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Pure helpers — everything decidable without the database lives here, so the
// fuse and the classifier can be tested against invented data rather than by
// re-implementing their SQL (feedback_test_that_models_sql_proves_nothing).
// ---------------------------------------------------------------------------

/**
 * Read the fuse ceiling from the environment, defensively. A typo'd or negative
 * env value must not silently DISABLE the fuse — that is the exact failure the
 * fuse exists to prevent — so anything unusable falls back to the default.
 */
export function readFuseLimit(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env.HANDOVER_CHASE_MAX_RECIPIENTS;
  if (raw == null || raw.trim() === '') return DEFAULT_MAX_RECIPIENTS;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    return DEFAULT_MAX_RECIPIENTS;
  }
  return n;
}

/** Whole days from the due date to today. Negative = still in the future. */
export function daysPastDue(dueDate: string, todayISO: string): number {
  const [dy, dm, dd] = dueDate.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = todayISO.slice(0, 10).split('-').map(Number);
  if ([dy, dm, dd, ty, tm, td].some((n) => !Number.isFinite(n))) return 0;
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(dy, dm - 1, dd)) / 86400000
  );
}

/**
 * Split the open handovers three ways.
 *
 * Order matters: orphaned is checked FIRST. A handover whose grantee has left
 * AND whose due date has passed is orphaned, not expired — decision 7 is about
 * the item coming back to the Director, and telling him "it expired" would hide
 * the fact that the person is gone.
 *
 * A grantee with no profile row at all is treated as orphaned too. It should be
 * impossible (grantee_user_id is a FK with ON DELETE CASCADE), but "the row
 * vanished" and "the person left" have the same correct response, and the
 * alternative is a handover nobody is ever nudged about.
 */
export function classifyHandovers(
  rows: HandoverRow[],
  profilesById: Map<string, GranteeProfile>,
  todayISO: string
): Classification {
  const out: Classification = { live: [], expired: [], orphaned: [] };
  for (const h of rows) {
    const p = profilesById.get(h.grantee_user_id);
    if (!p || p.is_active === false) {
      out.orphaned.push(h);
      continue;
    }
    // Decision 4: the due date is inclusive — a handover due today is live all
    // day. It expires the morning after.
    if (daysPastDue(h.due_date, todayISO) >= 1) {
      out.expired.push(h);
      continue;
    }
    out.live.push(h);
  }
  return out;
}

/**
 * Everyone this run intends to write to IF IT PROCEEDS, deduped. This is what
 * the fuse measures, and it is computed BEFORE anything is sent — measuring
 * after the first batch went out would defeat the entire point.
 *
 * The run-level alert audience is deliberately absent (defect E2). Those people
 * are written to only when the fuse BLOWS, and on that night this list is not
 * sent to at all — so including them measured a population the run would never
 * write to, and shrank the real ceiling on grantees by however many of them
 * there happened to be. With zero Directors live today the fallback is up to ten
 * super admins, which turned a stated ceiling of 50 into an actual 40.
 *
 * Directors DO appear here when they are genuine per-handover recipients: every
 * `granted_by` on an expired or orphaned item is written to by name.
 */
export function resolveRunRecipients(c: Classification): string[] {
  const set = new Set<string>();
  for (const h of c.live) set.add(h.grantee_user_id);
  for (const h of c.expired) set.add(h.grantee_user_id);
  // Orphaned grantees are deliberately NOT nudged — they have left. The person
  // who handed the item over is, which the two lines below cover.
  for (const h of c.orphaned) set.add(h.granted_by);
  for (const h of c.expired) set.add(h.granted_by);
  return [...set].filter(Boolean).sort();
}

/**
 * What the expiry sweep does with one past-due handover.
 *
 * Pure, and separated out, because this is the exact decision defect E1 got
 * backwards: relabelling BEFORE the explanation window makes the explanation
 * impossible to give (`fn_director_handover_progress` refuses any status outside
 * pending/accepted), so everyone gets a meeting no matter how they answer.
 *
 *   open_window     no window yet and the rule will open one — leave the label
 *                   alone so the grantee can actually answer;
 *   wait_for_window a window is open — the reconciler owns this row now;
 *   close_out       a window opened and has already resolved — relabel;
 *   expire_now      no window will ever open (rule off, or its threshold puts
 *                   the valve out of reach), so there is nothing to protect.
 */
export type ExpirySweepAction =
  | 'open_window'
  | 'wait_for_window'
  | 'close_out'
  | 'expire_now';

export function decideExpiryAction(opts: {
  /** Status of an existing 'handover' breach row for this handover, or null. */
  existingEventStatus: string | null;
  ruleActive: boolean;
  overdueBy: number;
  threshold: number;
}): ExpirySweepAction {
  if (opts.existingEventStatus != null) {
    return opts.existingEventStatus === 'notified' ? 'wait_for_window' : 'close_out';
  }
  if (!opts.ruleActive) return 'expire_now';
  if (opts.overdueBy < opts.threshold) return 'expire_now';
  return 'open_window';
}

/**
 * The text that goes to the Director as "what they said". Pure so the wording
 * for each kind of answer is pinned by a test rather than by reading the code.
 */
export function explanationFromAudit(row: {
  action?: string | null;
  detail?: Record<string, any> | null;
}): string {
  const note = String(row.detail?.note ?? row.detail?.reason ?? '').trim();
  if (row.action === 'done') return note || 'Marked it done.';
  if (row.action === 'declined') {
    return note ? `Handed it back: ${note}` : 'Handed it back.';
  }
  return note;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a notification targeting payload before it is written.
 *
 * `notifications.targeting` contents are unvalidated by this repo's schema —
 * anything shaped like jsonb is accepted, including `{user_ids: [null]}` or an
 * empty array, which produce a notification that reaches nobody and looks
 * delivered. Since the whole chase engine is judged on "did the person get
 * nudged", a silent no-op recipient list is the failure mode that matters most,
 * so it is rejected here rather than discovered later.
 */
export interface TargetingCheck {
  ok: boolean;
  /** Deduped, validated ids. Empty when ok is false. */
  userIds: string[];
  reason?: string;
}

export function validateTargeting(userIds: unknown): TargetingCheck {
  // NOT a discriminated union on purpose: this repo compiles with
  // strictNullChecks off, under which `if (!check.ok)` does not narrow a
  // `{ok:true}|{ok:false}` union and every read of `.reason` is a type error.
  if (!Array.isArray(userIds)) return { ok: false, userIds: [], reason: 'not an array' };
  if (userIds.length === 0) {
    return { ok: false, userIds: [], reason: 'empty recipient list' };
  }
  const clean: string[] = [];
  for (const id of userIds) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      return { ok: false, userIds: [], reason: `not a uuid: ${JSON.stringify(id)}` };
    }
    if (!clean.includes(id)) clean.push(id);
  }
  return { ok: true, userIds: clean };
}

/**
 * The daily nudge's identity. The DB's partial unique index on
 * `notifications.idempotency_key` is what actually enforces once-per-day — a
 * read-then-write check would let two overlapping runs both decide "not sent
 * yet" and both send.
 */
export function nudgeIdempotencyKey(handoverId: string, runDate: string): string {
  return `handover-chase:nudge:${handoverId}:${runDate}`;
}

/** How the daily nudge reads. Pure so the wording is testable. */
export function nudgeCopy(
  h: HandoverRow,
  todayISO: string
): { title: string; body: string } {
  const left = -daysPastDue(h.due_date, todayISO);
  const when =
    left <= 0
      ? 'due today'
      : left === 1
        ? 'due tomorrow'
        : `due in ${left} days`;

  if (h.status === 'pending') {
    return {
      title: `Please accept or decline — ${h.title}`,
      body:
        `The Director handed "${h.title}" to you and it is ${when}. You can ` +
        `already open the page to see what is involved. Let him know whether ` +
        `you are taking it on, or decline and say why — either answer is fine, ` +
        `no answer is what holds things up.`
    };
  }
  return {
    title: `Still with you — ${h.title}`,
    body:
      `"${h.title}" is ${when}. If it is moving, post a one-line update so the ` +
      `Director can see it without asking. If it is finished, mark it done and ` +
      `this stops.`
  };
}

// ---------------------------------------------------------------------------
// Director resolution
// ---------------------------------------------------------------------------

/**
 * Mirrors `(cr.permissions->>'director.handover.create')::boolean = true`.
 *
 * `->>` yields TEXT, so `::boolean` accepts JSON `true` AND the string `"true"`.
 * Both spellings occur in `custom_roles.permissions` on this platform, and a
 * strict `=== true` in TypeScript would silently disagree with the SQL for the
 * second one — the "works for some people" shape this repo has hit before.
 */
function isTrueish(v: unknown): boolean {
  return v === true || v === 'true';
}

function grantsHandoverCreate(permissions: unknown): boolean {
  return isTrueish(
    (permissions as Record<string, unknown> | null | undefined)?.[HANDOVER_CREATE_KEY]
  );
}

/**
 * Ask PostgREST to project ONE key out of `permissions` instead of shipping the
 * whole blob.
 *
 * Measured against production 2026-08-05: `select=id,role_key,permissions` over
 * the 85 custom roles is **2,877,263 bytes**; this projection is **8,547**. The
 * blob grows with every permission key the platform adds (1,300+ today), and
 * this runs every night, so pulling all of it to answer one boolean was a real
 * cost I introduced and not a hypothetical one.
 *
 * The key MUST be quoted. Probed with a positive control: `permissions->>ims.view`
 * (unquoted) returns 0 rows even though four roles hold `ims.view` — PostgREST
 * reads the dots as a nested path `permissions->ims->>view`. The quoted form
 * returns exactly those four, and a bogus quoted key returns none. That unquoted
 * spelling would have been a silent zero, which is defect E2 all over again.
 */
const HANDOVER_CREATE_PROJECTION = `id, role_key, handover_create:permissions->>"${HANDOVER_CREATE_KEY}"`;
/**
 * The alias PostgREST emits for that projection. It is present on EVERY row even
 * when the value is null (verified: 85 of 85), so its ABSENCE is a reliable
 * tripwire that the projection did not take effect — at which point this falls
 * back to reading the whole blob rather than reporting zero Directors, which is
 * the failure this whole function exists to end.
 */
const PROJECTION_ALIAS = 'handover_create';

/**
 * Who "the Director" is for a run-level notice (the blown fuse).
 *
 * MIRRORS `fn_can_hand_over()` EXACTLY — all three of its paths, not just the
 * first (defect E2). It cannot simply CALL that function: `fn_can_hand_over` is
 * a yes/no about `auth.uid()`, and a cron holding the service-role key has no
 * `auth.uid()` and needs an enumeration, not an answer. So the predicate is
 * restated here, once, with each path named:
 *
 *   1. `profiles.role = 'director'`                      — the legacy string;
 *   2. `user_roles -> custom_roles` where the role key is 'director' OR the role
 *      carries `director.handover.create`                — the canonical path;
 *   3. `custom_roles.role_key = profiles.role` where that role carries
 *      `director.handover.create`                        — the legacy role's
 *      permissions, which `user_has_permission()` has always honoured.
 *
 * Verified live 2026-08-05: ALL THREE populations are currently ZERO — there is
 * no `director` role in production yet. Path 1 alone (what this used to be) was
 * therefore not a narrower version of the right query, it was a query that
 * ALWAYS returned nothing, so every run-level notice fell through to super
 * admins and the Director was never told. Paths 2 and 3 exist so the day the
 * role is created this starts working without another deploy.
 *
 * Falls back to super admins only when all three come up empty, because a blown
 * fuse nobody is told about is worse than telling a few extra admins — but the
 * fallback is recorded in `source` and shouted into the run log rather than
 * being indistinguishable from success.
 *
 * For a PER-HANDOVER notice this is NOT used: those go to `granted_by`, the
 * individual who actually handed that item over and onto whose desk decision 7
 * puts it back.
 */
export async function resolveDirectors(
  db: SupabaseClient
): Promise<DirectorResolution> {
  const by_path = {
    legacy_profile_role: 0,
    user_roles_assignment: 0,
    profile_role_permission: 0
  };
  const found = new Map<string, { id: string; created_at: string | null }>();

  const add = (rows: any[] | null | undefined, bucket: keyof typeof by_path) => {
    let n = 0;
    for (const r of rows ?? []) {
      if (!r?.id) continue;
      n++;
      if (!found.has(r.id)) found.set(r.id, { id: r.id, created_at: r.created_at ?? null });
    }
    by_path[bucket] = n;
  };

  // --- path 1: the legacy profiles.role string ------------------------------
  const { data: legacy } = await db
    .from('profiles')
    .select('id, created_at')
    .eq('role', DIRECTOR_ROLE_KEY)
    .eq('is_active', true);
  add(legacy as any[], 'legacy_profile_role');

  // Both remaining paths start from custom_roles. Projected, not the whole
  // permissions blob — see HANDOVER_CREATE_PROJECTION for the measured reason.
  let roleRows: any[] = [];
  let carriesKey: (r: any) => boolean = (r) => isTrueish(r[PROJECTION_ALIAS]);

  const { data: projected, error: projErr } = await db
    .from('custom_roles')
    .select(HANDOVER_CREATE_PROJECTION);

  const projectionTookEffect =
    !projErr &&
    Array.isArray(projected) &&
    (projected.length === 0 || PROJECTION_ALIAS in (projected[0] as object));

  if (projectionTookEffect) {
    roleRows = projected as any[];
  } else {
    // The tripwire fired. Read the blob and use the same predicate — expensive,
    // but "I could not project" must never be reported as "no Director exists".
    if (projErr) {
      logger.warn(MODULE, 'permission projection failed, falling back to full read', {
        message: projErr.message
      });
    }
    const { data: full } = await db.from('custom_roles').select('id, role_key, permissions');
    roleRows = (full ?? []) as any[];
    carriesKey = (r) => grantsHandoverCreate(r.permissions);
  }

  const assignableRoleIds = roleRows
    .filter((r) => r.role_key === DIRECTOR_ROLE_KEY || carriesKey(r))
    .map((r) => r.id)
    .filter(Boolean);
  const permissionRoleKeys = roleRows
    .filter((r) => carriesKey(r))
    .map((r) => r.role_key)
    .filter(Boolean);

  // --- path 2: a user_roles assignment to such a role -----------------------
  if (assignableRoleIds.length > 0) {
    const { data: assignments } = await db
      .from('user_roles')
      .select('user_id')
      .in('role_id', assignableRoleIds);
    const userIds = [
      ...new Set(((assignments ?? []) as any[]).map((a) => a.user_id).filter(Boolean))
    ];
    const assigned: any[] = [];
    for (const batch of chunk(userIds)) {
      const { data } = await db
        .from('profiles')
        .select('id, created_at')
        .in('id', batch)
        .eq('is_active', true);
      assigned.push(...((data ?? []) as any[]));
    }
    add(assigned, 'user_roles_assignment');
  }

  // --- path 3: profiles.role names a role that carries the permission -------
  if (permissionRoleKeys.length > 0) {
    const { data: viaRoleKey } = await db
      .from('profiles')
      .select('id, created_at')
      .in('role', permissionRoleKeys)
      .eq('is_active', true);
    add(viaRoleKey as any[], 'profile_role_permission');
  }

  if (found.size > 0) {
    // Same deterministic ordering as getSuperAdminIds: oldest account first,
    // id as the tie-break, so `[0]` (the notification's created_by) is stable
    // run to run.
    const ids = [...found.values()]
      .sort((a, b) => {
        const x = a.created_at ?? '';
        const y = b.created_at ?? '';
        if (x !== y) return x < y ? -1 : 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      })
      .map((r) => r.id);
    return { ids, source: 'director', by_path };
  }

  const admins = await getSuperAdminIds(db);
  return {
    ids: admins,
    source: admins.length > 0 ? 'super_admin_fallback' : 'none',
    by_path
  };
}

/** Send a bell, but only after the targeting payload has been checked. */
async function sendChecked(
  db: SupabaseClient,
  opts: Parameters<typeof createBellNotification>[1],
  errors: string[]
): Promise<string | null> {
  const check = validateTargeting(opts.recipientIds);
  if (!check.ok) {
    errors.push(`targeting rejected (${check.reason}) for "${opts.title}"`);
    logger.warn(MODULE, 'targeting rejected, nothing sent', {
      reason: check.reason,
      title: opts.title
    });
    return null;
  }
  return createBellNotification(db, {
    ...opts,
    recipientIds: check.userIds,
    createdBy: opts.createdBy || check.userIds[0]
  });
}

// ---------------------------------------------------------------------------
// The nightly run
// ---------------------------------------------------------------------------

export async function runHandoverChase(
  opts: { now?: Date; client?: SupabaseClient } = {}
): Promise<HandoverChaseResult> {
  const db = opts.client ?? createServiceRoleClient();
  const now = opts.now ?? new Date();
  const runDate = todayIST(now);
  const fuseLimit = readFuseLimit();

  const result: HandoverChaseResult = {
    run_date: runDate,
    loaded: 0,
    live_handovers: 0,
    recipients_resolved: 0,
    fuse_limit: fuseLimit,
    fuse_blown: false,
    nudged: 0,
    already_nudged: 0,
    expired: 0,
    orphaned: 0,
    overdue_opened: 0,
    awaiting_explanation: 0,
    explained: 0,
    escalated: 0,
    dismissed: 0,
    director_notices: 0,
    director_resolution: 'none',
    errors: []
  };

  // --- 1. load the open handovers ------------------------------------------
  const { data: rows, error: loadErr } = await db
    .from('director_handovers')
    .select(
      'id, route, title, grantee_user_id, granted_by, institution_id, status, due_date, last_activity_at, responded_at'
    )
    .in('status', ['pending', 'accepted'])
    .is('revoked_at', null)
    .order('due_date', { ascending: true })
    .order('id', { ascending: true })
    .limit(LOAD_LIMIT);

  if (loadErr) {
    // 42P01 = undefined_table: the spine migration has not been applied to this
    // database yet. MyJKKN deploys ship CODE, not migrations, so this is an
    // ordinary state on the night a deploy lands ahead of its migration. It is
    // still recorded as `failed` rather than as a quiet empty run: "I could not
    // look" and "there was nothing to do" produce the same silence, and only one
    // of them is fine (feedback_empty_response_from_failclosed_producer_means_unknown).
    const missing = (loadErr as any).code === '42P01';
    result.errors.push(
      missing
        ? 'director_handovers not present yet (spine migration unapplied) — nothing chased'
        : `load handovers: ${loadErr.message}`
    );
    await recordRun(db, result, 'failed', {});
    return result;
  }

  const handovers = (rows ?? []) as unknown as HandoverRow[];
  result.loaded = handovers.length;

  // --- 2. classify (no writes yet) -----------------------------------------
  const granteeIds = [...new Set(handovers.map((h) => h.grantee_user_id))];
  const profilesById = new Map<string, GranteeProfile>();
  // Chunked: LOAD_LIMIT grantee ids in one `.in()` is ~18.5 KB of query string,
  // and the 414 that comes back would abort a run that had nothing wrong with it.
  for (const batch of chunk(granteeIds)) {
    const { data: profs, error: profErr } = await db
      .from('profiles')
      .select('id, is_active')
      .in('id', batch);
    if (profErr) {
      // RLS denial is silent (0 rows, error null), but a genuine error here
      // would make EVERY grantee look inactive and orphan the whole desk. Stop
      // rather than sweep on a guess.
      result.errors.push(`load grantees: ${profErr.message}`);
      await recordRun(db, result, 'failed', {});
      return result;
    }
    for (const p of (profs ?? []) as any[]) {
      profilesById.set(p.id, { id: p.id, is_active: p.is_active });
    }
  }

  const classified = classifyHandovers(handovers, profilesById, runDate);
  result.live_handovers = classified.live.length;

  const director = await resolveDirectors(db);
  const directorIds = director.ids;
  result.director_resolution = director.source;
  if (director.source !== 'director') {
    // Loud, not silent (defect E2). "Nobody holds the Director role" and
    // "the query was wrong" produce the same empty array, and the old code
    // treated both as an ordinary fan-out to super admins — across every
    // college, with no Director in the audience at all.
    const msg =
      director.source === 'none'
        ? 'no Director and no super admin could be resolved — a run-level notice has nowhere to go'
        : `no Director found on any of the three paths (profiles.role, user_roles -> custom_roles.role_key, ${HANDOVER_CREATE_KEY}) — run-level notices fall back to ${directorIds.length} super admin(s)`;
    result.errors.push(msg);
    logger.error(MODULE, msg, director.by_path);
  }

  const recipients = resolveRunRecipients(classified);
  result.recipients_resolved = recipients.length;

  // --- 3. THE FUSE ---------------------------------------------------------
  if (recipients.length > fuseLimit) {
    result.fuse_blown = true;
    logger.error(MODULE, 'volume fuse blown — nothing sent', {
      resolved: recipients.length,
      limit: fuseLimit,
      run_date: runDate
    });

    // The forensic record. `recipient_ids` belongs HERE and only here:
    // director_handover_chase_runs is service-role write, admin-only read, and
    // is the row somebody reconstructs the night from.
    const detail = {
      resolved: recipients.length,
      limit: fuseLimit,
      recipient_ids: recipients,
      live: classified.live.length,
      expired: classified.expired.length,
      orphaned: classified.orphaned.length,
      loaded: handovers.length,
      director_resolution: director
    };

    if (directorIds.length > 0) {
      const sent = await sendChecked(
        db,
        {
          recipientIds: directorIds,
          createdBy: directorIds[0],
          title: 'Handover chase halted — too many people',
          body:
            `Tonight's handover chase worked out that it would write to ` +
            `${recipients.length} people, and the safety limit is ${fuseLimit}. ` +
            `It sent nothing and stopped.\n\n` +
            `It was looking at ${handovers.length} open handovers ` +
            `(${classified.live.length} running, ${classified.expired.length} ` +
            `past their date, ${classified.orphaned.length} whose owner has ` +
            `left). Those numbers should be small; if they are, the fault is in ` +
            `how the engine worked out who to write to, not in your desk. ` +
            `Nobody was messaged and no handover changed.`,
          url: DIRECTOR_DESK_URL,
          category: 'director:handover-chase-halted',
          // COUNTS ONLY — never the list (defect E2). This alert falls back to
          // super admins when no Director can be resolved, which is the live
          // state today, so the list would be a cross-college roster of who
          // holds what handed to ten people who were not party to any of it.
          // The list is in director_handover_chase_runs.detail for whoever is
          // actually debugging.
          metadata: {
            resolved: recipients.length,
            limit: fuseLimit,
            live: classified.live.length,
            expired: classified.expired.length,
            orphaned: classified.orphaned.length,
            loaded: handovers.length,
            run_date: runDate,
            recipient_ids_recorded_in: 'director_handover_chase_runs.detail',
            source: 'cron:director-handover-chase'
          }
        },
        result.errors
      );
      if (sent) result.director_notices++;
    }

    await recordRun(db, result, 'halted_volume_fuse', detail);
    return result;
  }

  // --- 4. orphan sweep (decision 7) ----------------------------------------
  for (const h of classified.orphaned) {
    try {
      // .select() is not decoration here. Without it the update reports
      // {data:null,error:null} whether it matched a row or none, and the sweep
      // would go on to write an audit entry and a notice for a handover somebody
      // finished, declined or revoked since this run loaded it.
      const { data: swept, error } = await db
        .from('director_handovers')
        .update({ status: 'orphaned' })
        .eq('id', h.id)
        .in('status', ['pending', 'accepted'])
        .select('id');
      if (error) {
        result.errors.push(`orphan ${h.id}: ${error.message}`);
        continue;
      }
      if ((swept ?? []).length === 0) continue; // closed while this run was thinking
      result.orphaned++;

      await db.from('director_handover_audit').insert({
        handover_id: h.id,
        action: 'orphaned',
        actor_user_id: null,
        detail: {
          previous_status: h.status,
          reason: 'grantee profile is inactive or missing',
          note:
            'Access was already cut live by the is_active check in ' +
            'fn_handover_grants_key. This is the relabel and the telling.',
          source: 'cron:director-handover-chase',
          run_date: runDate
        }
      });

      const sent = await sendChecked(
        db,
        {
          recipientIds: [h.granted_by],
          createdBy: h.granted_by,
          title: `Back on your desk — ${h.title}`,
          body:
            `"${h.title}" was with someone who has left, so it is yours again. ` +
            `Their access was already cut the moment their account went ` +
            `inactive — nothing was open in the meantime. Hand it to somebody ` +
            `else when you are ready.`,
          url: DIRECTOR_DESK_URL,
          category: 'director:handover-orphaned',
          metadata: {
            handover_id: h.id,
            route: h.route,
            source: 'cron:director-handover-chase'
          }
        },
        result.errors
      );
      if (sent) result.director_notices++;
    } catch (e: any) {
      result.errors.push(`orphan ${h.id}: ${e?.message ?? String(e)}`);
    }
  }

  // --- 5. open the 24h valve, THEN relabel (decisions 4 + 11) ---------------
  //
  // Order is the fix for defect E1. See the header: relabelling to 'expired'
  // first made `fn_director_handover_progress` raise 22023, so the explanation
  // the grantee was being asked for could not physically be written, and the
  // reconciler escalated every single one to a meeting 24 hours later.
  const rule = await loadHandoverRule(db);

  // Has a window already been opened for any of these? The unique index on
  // meeting_trigger_events is (rule_id, breach_date, subject_id) — breach_date
  // moves every night, so it does NOT stop a second window opening on night two
  // for a handover that is deliberately still labelled 'accepted'. This lookup
  // does, and it is also what tells the sweep when a window has RESOLVED and the
  // label is finally safe to write.
  const expiredIds = classified.expired.map((h) => h.id);
  const windowBySubject = new Map<string, { status: string }>();
  let windowsReadable = true;
  for (const batch of chunk(expiredIds)) {
    const { data: evs, error: evLoadErr } = await db
      .from('meeting_trigger_events')
      .select('id, subject_id, status')
      .eq('subject_type', HANDOVER_SUBJECT)
      .in('subject_id', batch);
    if (evLoadErr) {
      // Fail CLOSED, and for the WHOLE sweep, not just this batch. "No window
      // exists" and "I could not look" produce the same empty map, and acting on
      // the first when it was really the second opens a duplicate window every
      // night (feedback_empty_response_from_failclosed_producer_means_unknown).
      windowsReadable = false;
      result.errors.push(`load handover windows: ${evLoadErr.message}`);
      break;
    }
    for (const e of (evs ?? []) as any[]) {
      const prev = windowBySubject.get(e.subject_id);
      // An open window wins over a resolved one: if any row is still 'notified'
      // the grantee still has time on the clock.
      if (!prev || e.status === 'notified') {
        windowBySubject.set(e.subject_id, { status: e.status });
      }
    }
  }

  for (const h of windowsReadable ? classified.expired : []) {
    try {
      const overdueBy = daysPastDue(h.due_date, runDate);
      const action = decideExpiryAction({
        existingEventStatus: windowBySubject.get(h.id)?.status ?? null,
        // The rule's on/off switch in /meetings/triggers has to mean something.
        ruleActive: !!rule,
        overdueBy,
        // The threshold on that same screen too. Seeded at 1 = "the day after
        // the due date". Raising it switches the valve off rather than buying a
        // grace period — the rule's own `notes` says so — and then there is no
        // window to protect, so the label goes on immediately.
        threshold: Number(rule?.threshold ?? 1)
      });

      if (action === 'wait_for_window') {
        // THE LOAD-BEARING BRANCH. The handover keeps its pending/accepted
        // label while the clock runs, which is the only state in which
        // fn_director_handover_progress will accept the note we asked for.
        result.awaiting_explanation++;
        continue;
      }

      if (action === 'close_out' || action === 'expire_now') {
        const did = await markHandoverExpired(
          db,
          h.id,
          {
            previous_status: h.status,
            due_date: h.due_date,
            days_past_due: overdueBy,
            reason:
              action === 'close_out'
                ? 'the explanation window has closed'
                : 'no explanation window is open (the handover_overdue rule is off or out of reach)',
            source: 'cron:director-handover-chase',
            run_date: runDate
          },
          result.errors
        );
        if (did) result.expired++;
        continue;
      }

      // --- open_window ------------------------------------------------------
      // The run loaded its candidates, resolved people, then swept. Re-read
      // before writing anything: without this, a handover marked done in the
      // seconds since the load would still get a "past its date" notice and, 24
      // hours later, a meeting with the Director about finished work. The old
      // code got this guard for free from its conditional UPDATE; there is no
      // UPDATE here any more, so it is explicit.
      const { data: fresh, error: freshErr } = await db
        .from('director_handovers')
        .select('id')
        .eq('id', h.id)
        .in('status', ['pending', 'accepted'])
        .is('revoked_at', null)
        .limit(1);
      if (freshErr) {
        result.errors.push(`recheck ${h.id}: ${freshErr.message}`);
        continue;
      }
      if ((fresh ?? []).length === 0) continue; // closed while this run was thinking

      const deadline = new Date(
        now.getTime() + EXPLANATION_WINDOW_HOURS * 60 * 60 * 1000
      ).toISOString();

      const { data: ev, error: evErr } = await db
        .from('meeting_trigger_events')
        .insert({
          rule_id: rule!.id,
          institution_id: h.institution_id,
          metric_key: HANDOVER_METRIC,
          observed_value: overdueBy,
          threshold: rule!.threshold,
          breach_date: runDate,
          status: 'notified',
          subject_type: HANDOVER_SUBJECT,
          subject_id: h.id,
          subject_label: h.title,
          // Decision 11's meeting is between the Director and the grantee. The
          // judge becomes the host and notified_profile_ids[0] the attendee in
          // bookPendingMeetings — so setting these two correctly IS the booking.
          judge_profile_id: h.granted_by,
          notified_profile_ids: [h.grantee_user_id],
          explanation_deadline: deadline
        })
        .select('id')
        .single();

      if (evErr) {
        // 23505 = the valve already opened for this handover today.
        if ((evErr as any).code !== '23505') {
          result.errors.push(`valve ${h.id}: ${evErr.message}`);
        }
        continue;
      }
      result.overdue_opened++;
      result.awaiting_explanation++;

      // The audit action is 'overdue', not 'expired'. The handover is NOT
      // expired yet — that word is now written once, when the window resolves,
      // and having two rows claiming it would make the trail lie about which
      // moment shut the door.
      await db.from('director_handover_audit').insert({
        handover_id: h.id,
        action: 'overdue',
        actor_user_id: null,
        detail: {
          previous_status: h.status,
          due_date: h.due_date,
          days_past_due: overdueBy,
          event_id: (ev as any).id,
          explanation_deadline: deadline,
          note:
            'Access ended on the due date (fn_handover_grants_key tests the date, ' +
            'not the label). The row stays open only so the grantee can post the ' +
            'explanation decision 11 asks them for.',
          source: 'cron:director-handover-chase',
          run_date: runDate
        }
      });

      const notificationId = await sendChecked(
        db,
        {
          recipientIds: [h.grantee_user_id],
          createdBy: h.granted_by,
          title: `Past its date — ${h.title}`,
          body:
            `"${h.title}" was due ${h.due_date} and is still open, so your ` +
            `access to that page has ended. You can still post an update from ` +
            `your desk: say what happened and where it stands within ` +
            `${EXPLANATION_WINDOW_HOURS} hours and it goes straight to the ` +
            `Director. Marking it done or handing it back counts too. If ` +
            `nothing comes, a short meeting with him gets put in both your ` +
            `calendars.`,
          url: GRANTEE_DESK_URL,
          category: 'director:handover-overdue',
          metadata: {
            handover_id: h.id,
            event_id: (ev as any).id,
            days_past_due: overdueBy,
            source: 'cron:director-handover-chase'
          }
        },
        result.errors
      );
      if (notificationId) {
        await db
          .from('meeting_trigger_events')
          .update({ notification_id: notificationId })
          .eq('id', (ev as any).id);
      }
    } catch (e: any) {
      result.errors.push(`expire ${h.id}: ${e?.message ?? String(e)}`);
    }
  }

  // --- 6. the daily nudge (decision 10) ------------------------------------
  for (const h of classified.live) {
    try {
      const copy = nudgeCopy(h, runDate);
      const sent = await sendChecked(
        db,
        {
          recipientIds: [h.grantee_user_id],
          createdBy: h.granted_by,
          title: copy.title,
          body: copy.body,
          url: GRANTEE_DESK_URL,
          category: 'director:handover-nudge',
          metadata: {
            handover_id: h.id,
            route: h.route,
            due_date: h.due_date,
            status: h.status,
            source: 'cron:director-handover-chase'
          },
          // Once per handover per day, enforced by the DB.
          idempotencyKey: nudgeIdempotencyKey(h.id, runDate)
        },
        result.errors
      );
      if (sent) result.nudged++;
      else result.already_nudged++;
    } catch (e: any) {
      result.errors.push(`nudge ${h.id}: ${e?.message ?? String(e)}`);
    }
  }

  // --- 7. close the loop on anything already in the valve ------------------
  const rec = await reconcileHandoverExplanations({ now, client: db });
  result.explained = rec.explained;
  result.escalated = rec.escalated;
  result.dismissed = rec.dismissed;
  result.errors.push(...rec.errors);
  // Closing a window is what finally writes the 'expired' label this sweep held
  // back, so the reconciler's relabels belong in this run's count. Counted from
  // rows actually updated, not from resolutions — a handover the grantee marked
  // done inside the window is already closed and is not relabelled.
  result.expired += rec.relabelled;
  result.awaiting_explanation = Math.max(
    0,
    result.awaiting_explanation - (rec.explained + rec.escalated + rec.dismissed)
  );

  await recordRun(db, result, 'sent', {
    live: classified.live.length,
    past_due: classified.expired.length,
    orphaned: classified.orphaned.length,
    director_resolution: director
  });

  return result;
}

// ---------------------------------------------------------------------------
// The 24h valve for handovers (decision 11 steps 2 and 3)
// ---------------------------------------------------------------------------

/**
 * For every open handover breach:
 *   - an ANSWER posted since the breach → route it to the Director and STOP
 *     escalating (decision 11 step 2). An answer is a progress note, marking it
 *     done, or handing it back — see ANSWER_ACTIONS;
 *   - the handover already closed some other way (revoked, or closed before
 *     this reconcile got to it) → dismiss the event, no meeting;
 *   - the 24h window closed with nothing → hand the event to the existing
 *     booking pass, which puts a short Director/grantee meeting on the soonest
 *     slot they are both free (step 3).
 *
 * Whichever way a window resolves, THIS is where the handover is finally
 * relabelled 'expired' (defect E1). The sweep deliberately leaves the label
 * alone while the clock runs, because `fn_director_handover_progress` refuses
 * any status outside pending/accepted and would otherwise make the answer
 * physically unwritable.
 *
 * Runs on the nightly chase AND on the existing hourly meeting-trigger-reconcile
 * cron. Hourly matters: "within 24h" enforced once a night would in practice be
 * anything from 24 to 48 hours, which is not the decision that was made.
 * Re-running is safe — every branch is a status transition guarded by the status
 * it transitions from.
 */
export async function reconcileHandoverExplanations(
  opts: { now?: Date; client?: SupabaseClient } = {}
): Promise<HandoverReconcileResult> {
  const db = opts.client ?? createServiceRoleClient();
  const now = opts.now ?? new Date();
  const nowISO = now.toISOString();
  const result: HandoverReconcileResult = {
    explained: 0,
    escalated: 0,
    dismissed: 0,
    relabelled: 0,
    errors: []
  };

  const { data: events, error } = await db
    .from('meeting_trigger_events')
    .select(
      'id, subject_id, subject_label, explanation_deadline, judge_profile_id, notified_profile_ids, created_at'
    )
    .eq('status', 'notified')
    .eq('subject_type', HANDOVER_SUBJECT)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    result.errors.push(`load handover events: ${error.message}`);
    return result;
  }

  const eventRows = (events ?? []) as any[];

  // The handovers behind those events, in one read. Needed for two things: to
  // know whether the label still has to be written, and to catch the grantee who
  // ANSWERED BY FINISHING — a handover the run cannot see as closed would be
  // escalated to a meeting about work that is done.
  const statusById = new Map<string, string>();
  const subjectIds = [...new Set(eventRows.map((e) => e.subject_id).filter(Boolean))];
  for (const batch of chunk(subjectIds)) {
    const { data: hs, error: hErr } = await db
      .from('director_handovers')
      .select('id, status')
      .in('id', batch);
    if (hErr) {
      // Fail closed for the whole pass rather than escalate on a guess: an
      // unreadable handover table and an empty one look identical from here.
      result.errors.push(`load handovers for events: ${hErr.message}`);
      return result;
    }
    for (const h of (hs ?? []) as any[]) statusById.set(h.id, h.status);
  }

  for (const ev of eventRows) {
    try {
      const judge: string[] = ev.judge_profile_id ? [ev.judge_profile_id] : [];

      // 1. Did they answer? The answer lives in the audit trail, written by the
      //    handover RPCs — NOT in action_responses, which is where the project
      //    path looks. Anchored at the event's own created_at so a note from
      //    before the due date cannot be mistaken for an answer to a question
      //    that had not been asked yet.
      const { data: notes, error: noteErr } = await db
        .from('director_handover_audit')
        .select('action, detail, actor_user_id, created_at')
        .eq('handover_id', ev.subject_id)
        .in('action', ANSWER_ACTIONS as unknown as string[])
        .gte('created_at', ev.created_at)
        .order('created_at', { ascending: true })
        .limit(1);

      if (noteErr) {
        result.errors.push(`audit read ${ev.id}: ${noteErr.message}`);
        continue;
      }

      const note = (notes ?? [])[0] as any;
      if (note) {
        const text = explanationFromAudit(note);
        await db
          .from('meeting_trigger_events')
          .update({
            status: 'explained',
            explanation_text: text,
            explained_at: note.created_at,
            explained_by: note.actor_user_id
          })
          .eq('id', ev.id)
          .eq('status', 'notified');

        // The window is closed, so the label the sweep held back goes on now.
        if (
          await markHandoverExpired(
            db,
            ev.subject_id,
            {
              reason: 'the grantee answered inside the 24h window',
              answer_action: note.action,
              event_id: ev.id,
              source: 'cron:director-handover-chase'
            },
            result.errors
          )
        ) {
          result.relabelled++;
        }

        if (judge.length > 0) {
          await sendChecked(
            db,
            {
              recipientIds: judge,
              createdBy: judge[0],
              title: `They answered — ${ev.subject_label}`,
              body:
                `On "${ev.subject_label}", which went past its date:\n\n` +
                `"${text}"\n\n` +
                `Nothing further is scheduled. Hand it on again, extend it, or ` +
                `let it rest.`,
              url: DIRECTOR_DESK_URL,
              category: 'director:handover-explained',
              metadata: {
                event_id: ev.id,
                handover_id: ev.subject_id,
                source: 'cron:director-handover-chase'
              }
            },
            result.errors
          );
        }
        result.explained++;
        continue;
      }

      // 2. The handover is closed but nothing in the audit trail says the
      //    grantee did it (revoked by the Director, or closed before this
      //    reconcile ran). There is no work left to meet about, so the event is
      //    dismissed rather than escalated. No notification: whoever closed it
      //    already knows.
      const handoverStatus = statusById.get(ev.subject_id);
      if (handoverStatus == null || !['pending', 'accepted'].includes(handoverStatus)) {
        const { error: dErr } = await db
          .from('meeting_trigger_events')
          .update({
            status: 'dismissed',
            explanation_text: `The handover was closed (${handoverStatus ?? 'row gone'}) before the window ended — no meeting needed.`,
            explained_at: nowISO
          })
          .eq('id', ev.id)
          .eq('status', 'notified');
        if (dErr) {
          result.errors.push(`dismiss ${ev.id}: ${dErr.message}`);
          continue;
        }
        result.dismissed++;
        continue;
      }

      // 3. Window closed with nothing said → hand it to the booking pass.
      if (ev.explanation_deadline && nowISO > ev.explanation_deadline) {
        const { error: upErr } = await db
          .from('meeting_trigger_events')
          .update({ status: 'meeting_pending' })
          .eq('id', ev.id)
          .eq('status', 'notified');
        if (upErr) {
          result.errors.push(`escalate ${ev.id}: ${upErr.message}`);
          continue;
        }

        // Window closed — write the label the sweep held back.
        if (
          await markHandoverExpired(
            db,
            ev.subject_id,
            {
              reason: 'the 24h explanation window closed with no answer',
              event_id: ev.id,
              source: 'cron:director-handover-chase'
            },
            result.errors
          )
        ) {
          result.relabelled++;
        }

        if (judge.length > 0) {
          await sendChecked(
            db,
            {
              recipientIds: judge,
              createdBy: judge[0],
              title: `No answer — ${ev.subject_label}`,
              body:
                `"${ev.subject_label}" went past its date and nobody said why ` +
                `within ${EXPLANATION_WINDOW_HOURS} hours. A short meeting is ` +
                `being booked for the two of you at the next time you are both ` +
                `free.`,
              url: DIRECTOR_DESK_URL,
              category: 'director:handover-escalated',
              metadata: {
                event_id: ev.id,
                handover_id: ev.subject_id,
                source: 'cron:director-handover-chase'
              }
            },
            result.errors
          );
        }
        result.escalated++;
      }
    } catch (e: any) {
      result.errors.push(`event ${ev.id}: ${e?.message ?? String(e)}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Small IO helpers
// ---------------------------------------------------------------------------

interface HandoverRule {
  id: string;
  threshold: number;
}

/**
 * Write the 'expired' label, once, and only onto a handover that is still open.
 *
 * The `.in(status)` predicate plus reading the UPDATE back is not decoration:
 * without it PostgREST returns {data:null,error:null} whether it matched a row
 * or none, and the caller would go on to write an audit row claiming a
 * transition that never happened — for a handover somebody had finished,
 * declined or revoked in the meantime.
 *
 * Returns true only when a row really changed.
 */
async function markHandoverExpired(
  db: SupabaseClient,
  handoverId: string,
  detail: Record<string, unknown>,
  errors: string[]
): Promise<boolean> {
  try {
    const { data: swept, error } = await db
      .from('director_handovers')
      .update({ status: 'expired' })
      .eq('id', handoverId)
      .in('status', ['pending', 'accepted'])
      .select('id');
    if (error) {
      errors.push(`expire ${handoverId}: ${error.message}`);
      return false;
    }
    if ((swept ?? []).length === 0) return false;

    await db.from('director_handover_audit').insert({
      handover_id: handoverId,
      action: 'expired',
      actor_user_id: null,
      detail
    });
    return true;
  } catch (e: any) {
    errors.push(`expire ${handoverId}: ${e?.message ?? String(e)}`);
    return false;
  }
}

/** The single active global handover rule, or null when it has been switched off. */
async function loadHandoverRule(db: SupabaseClient): Promise<HandoverRule | null> {
  const { data } = await db
    .from('meeting_trigger_rules')
    .select('id, threshold')
    .eq('metric_key', HANDOVER_METRIC)
    .eq('active', true)
    .is('institution_id', null)
    .maybeSingle();
  return (data as any) ?? null;
}

/** Write the run to the ledger. Never throws — a log failure must not fail the run. */
async function recordRun(
  db: SupabaseClient,
  r: HandoverChaseResult,
  outcome: 'sent' | 'halted_volume_fuse' | 'failed',
  detail: Record<string, unknown>
): Promise<void> {
  try {
    await db.from('director_handover_chase_runs').insert({
      run_date: r.run_date,
      finished_at: new Date().toISOString(),
      live_handovers: r.live_handovers,
      recipients_resolved: r.recipients_resolved,
      fuse_limit: r.fuse_limit,
      fuse_blown: r.fuse_blown,
      outcome,
      nudged: r.nudged,
      expired: r.expired,
      orphaned: r.orphaned,
      overdue_opened: r.overdue_opened,
      explained: r.explained,
      escalated: r.escalated,
      detail: {
        ...detail,
        loaded: r.loaded,
        already_nudged: r.already_nudged,
        awaiting_explanation: r.awaiting_explanation,
        dismissed: r.dismissed
      },
      errors: r.errors.slice(0, 50)
    });
  } catch (e: any) {
    logger.error(MODULE, 'failed to record chase run', e);
  }
}
