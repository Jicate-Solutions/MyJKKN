/**
 * Cohort Core — generic lifecycle engine (PURE functions, no DB, no I/O)
 * Purpose: The domain-agnostic lifecycle rules from docs/cohort-core/PLAN.md
 *          "Locked program rules" 5–14 (rules 1–4 are SF100-specific and live
 *          in that extension layer). Everything here is side-effect-free and
 *          unit-testable; the service layer (cohort-service.ts) calls these to
 *          decide, then performs the actual DB writes + audit events.
 * Connected to: lib/services/cohort-core/cohort-service.ts
 *               lib/types/cohort-core.ts
 * Created: 2026-07-05 (PLAN.md Phase 1.5)
 */

import type {
  CohortCloseStatus,
  CohortKind,
  CohortRuleConfig,
  CohortRuleKey,
  CohortStatus,
  MembershipStatus,
} from '@/lib/types/cohort-core';

// ── Tunable defaults (callers may override) ───────────────────────────────────

/** Default idle days before a member is nudged (PLAN rule 11). */
export const DEFAULT_NUDGE_AFTER_DAYS = 7;
/** Default idle days before a nudged member is paused (PLAN rule 11). */
export const DEFAULT_PAUSE_AFTER_DAYS = 14;
/** Business days a mentor may stay silent before escalation (PLAN rule 9). */
export const DEFAULT_ESCALATION_BUSINESS_DAYS = 3;
/** Grace window length after dropping below target (PLAN rule 5). */
export const DEFAULT_GRACE_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── Small date helpers (pure) ─────────────────────────────────────────────────

/** Whole calendar days elapsed from `from` to `to` (floored, never negative). */
export function daysBetween(from: Date, to: Date): number {
  const diff = Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
  return diff < 0 ? 0 : diff;
}

/**
 * Count business days (Mon–Fri) strictly AFTER `from`, up to and including `to`.
 * Weekends are skipped. Used for the mentor-response escalation clock.
 *
 * Example: mentor notified Fri 17:00 → checked the following Wed 09:00.
 *   Calendar days = 5, but business days = Mon, Tue, Wed = 3.
 */
export function businessDaysBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;

  // Walk day-by-day from the day after `from` through `to`, counting weekdays.
  let count = 0;
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const endDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());

  while (cursor.getTime() < endDay.getTime()) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay(); // 0=Sun … 6=Sat
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

// ── Rule 11: goes quiet → nudge, then pause (never delete) ────────────────────

export type InactivityAction = 'none' | 'nudge' | 'pause';

export interface InactivityDecision {
  action: InactivityAction;
  /** The status the membership should move to, or null if unchanged. */
  nextStatus: MembershipStatus | null;
  daysInactive: number;
}

/**
 * PLAN rule 11 — decide what to do about an inactive member.
 * A nudge is a reminder event (no status change); a pause moves an active member
 * to 'paused'. Deletion is never returned. Only 'active'/'enrolled' members are
 * eligible; terminal/paused/removed members are left untouched.
 *
 * @param status          current membership status
 * @param lastActivityAt  timestamp of the member's last activity
 * @param now             evaluation time (injected for testability)
 */
export function nextMembershipStatusOnInactivity(
  status: MembershipStatus,
  lastActivityAt: Date,
  now: Date = new Date(),
  opts: { nudgeAfterDays?: number; pauseAfterDays?: number } = {}
): InactivityDecision {
  const nudgeAfterDays = opts.nudgeAfterDays ?? DEFAULT_NUDGE_AFTER_DAYS;
  const pauseAfterDays = opts.pauseAfterDays ?? DEFAULT_PAUSE_AFTER_DAYS;
  const daysInactive = daysBetween(lastActivityAt, now);

  // Only active/enrolled members participate in the nudge→pause ladder.
  const eligible = status === 'active' || status === 'enrolled';
  if (!eligible) {
    return { action: 'none', nextStatus: null, daysInactive };
  }

  if (daysInactive >= pauseAfterDays) {
    return { action: 'pause', nextStatus: 'paused', daysInactive };
  }
  if (daysInactive >= nudgeAfterDays) {
    // Nudge is an event, not a status change.
    return { action: 'nudge', nextStatus: null, daysInactive };
  }
  return { action: 'none', nextStatus: null, daysInactive };
}

// ── Rule 9: mentor unresponsive → escalate after 3 BUSINESS days ──────────────

/**
 * PLAN rule 9 — should an unanswered mentor request escalate to the coordinator?
 * Returns true once at least `businessDays` weekdays have elapsed since the
 * mentor was notified and the mentor has still not responded.
 *
 * @param mentorNotifiedAt  when the mentor was asked
 * @param now               evaluation time
 * @param mentorRespondedAt if set (and on/after notification), no escalation
 * @param businessDays      threshold (default 3)
 */
export function shouldEscalateToCoordinator(
  mentorNotifiedAt: Date,
  now: Date = new Date(),
  mentorRespondedAt: Date | null = null,
  businessDays: number = DEFAULT_ESCALATION_BUSINESS_DAYS
): boolean {
  if (mentorRespondedAt && mentorRespondedAt.getTime() >= mentorNotifiedAt.getTime()) {
    return false; // mentor already responded
  }
  return businessDaysBetween(mentorNotifiedAt, now) >= businessDays;
}

// ── Rule 5: drop below target → 30-day grace period ───────────────────────────

/** PLAN rule 5 — the instant the grace window closes (droppedAt + graceDays). */
export function graceWindowEndsAt(
  droppedAt: Date,
  graceDays: number = DEFAULT_GRACE_DAYS
): Date {
  return new Date(droppedAt.getTime() + graceDays * MS_PER_DAY);
}

/** PLAN rule 5 — is `now` still inside the grace window? (inclusive of the end) */
export function isWithinGrace(
  droppedAt: Date,
  now: Date = new Date(),
  graceDays: number = DEFAULT_GRACE_DAYS
): boolean {
  return now.getTime() <= graceWindowEndsAt(droppedAt, graceDays).getTime();
}

// ── Valid status-transition maps (guards rule 11 pause/resume, rules 5–14) ─────

/**
 * Allowed membership status transitions.
 * invited → enrolled | removed
 * enrolled → active | paused | removed
 * active → graduated | paused | removed
 * paused → active | removed        (resume after a rule-11 pause)
 * graduated → (terminal)
 * removed → (terminal)
 */
export const MEMBERSHIP_TRANSITIONS: Record<MembershipStatus, MembershipStatus[]> = {
  invited: ['enrolled', 'removed'],
  enrolled: ['active', 'paused', 'removed'],
  active: ['graduated', 'paused', 'removed'],
  paused: ['active', 'removed'],
  graduated: [],
  removed: [],
};

/**
 * Allowed cohort status transitions.
 * draft → enrolling | archived
 * enrolling → active | archived
 * active → completed | archived
 * completed → archived
 * archived → (terminal)
 */
export const COHORT_TRANSITIONS: Record<CohortStatus, CohortStatus[]> = {
  draft: ['enrolling', 'archived'],
  enrolling: ['active', 'archived'],
  active: ['completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

/**
 * True if `to` is a legal next status for `from`. A no-op (from === to) is
 * treated as NOT a transition (returns false) so callers can distinguish an
 * actual move from a redundant write.
 */
export function canTransition(
  entity: 'cohort' | 'membership',
  from: CohortStatus | MembershipStatus,
  to: CohortStatus | MembershipStatus
): boolean {
  if (from === to) return false;
  const map =
    entity === 'cohort'
      ? (COHORT_TRANSITIONS as Record<string, string[]>)
      : (MEMBERSHIP_TRANSITIONS as Record<string, string[]>);
  const allowed = map[from as string];
  return Array.isArray(allowed) && allowed.includes(to as string);
}

/** True if a membership status is terminal (no outgoing transitions). */
export function isTerminalMembershipStatus(status: MembershipStatus): boolean {
  return (MEMBERSHIP_TRANSITIONS[status] ?? []).length === 0;
}

/** True if a cohort status is terminal (no outgoing transitions). */
export function isTerminalCohortStatus(status: CohortStatus): boolean {
  return (COHORT_TRANSITIONS[status] ?? []).length === 0;
}

// ── D2: per-program rule configuration (which shared rules a cohort runs) ──────

/** All shared rules ON at the locked default thresholds (rules 5/9/11). */
function fullRuleConfig(): CohortRuleConfig {
  return {
    inactivity: {
      enabled: true,
      nudgeAfterDays: DEFAULT_NUDGE_AFTER_DAYS,
      pauseAfterDays: DEFAULT_PAUSE_AFTER_DAYS,
    },
    escalation: { enabled: true, businessDays: DEFAULT_ESCALATION_BUSINESS_DAYS },
    grace: { enabled: true, graceDays: DEFAULT_GRACE_DAYS },
  };
}

/**
 * D2 — the default rule-config for a cohort of the given `kind`.
 *
 * SF100 (mentor-verified startup teams) and the mentor-driven Foundations track
 * run the FULL lifecycle: nudge→pause, escalate-after-3-business-days, and the
 * 30-day drop-below-target grace window. The lighter CDC and Trainer tracks keep
 * only the nudge→pause inactivity ladder — they have no mentor-escalation clock
 * and no "dropped below target" grace semantics — so those two rules default OFF
 * (their thresholds are still carried so a cohort can switch them on later).
 *
 * A cohort persists this under `config.rules`; the shared engine reads it via
 * isRuleEnabled() and passes the thresholds into the pure rule functions above.
 */
export function defaultRuleConfigForKind(kind: CohortKind): CohortRuleConfig {
  const cfg = fullRuleConfig();
  switch (kind) {
    case 'sf100':
    case 'foundations':
      return cfg;
    case 'cdc':
    case 'trainer':
    default:
      cfg.escalation.enabled = false;
      cfg.grace.enabled = false;
      return cfg;
  }
}

/**
 * True if `rule` is switched on for the given rule-config. A missing or partial
 * config (e.g. a cohort created before D2) reads as DISABLED for that rule, so
 * callers fall back to their own explicit defaults rather than silently applying
 * a rule the cohort never opted into.
 */
export function isRuleEnabled(
  config: Partial<CohortRuleConfig> | null | undefined,
  rule: CohortRuleKey
): boolean {
  return Boolean(config?.[rule]?.enabled);
}

// ── D7: round-close cascade (pure decision) ───────────────────────────────────

/**
 * D7 — when a cohort closes, decide the terminal status each membership should
 * wrap up to. A successfully COMPLETED round graduates its still-active members;
 * every other non-terminal member (and everyone when the cohort is ARCHIVED) is
 * wrapped up as 'removed'. The membership vocabulary has no 'archived', so
 * 'removed' is the archived-equivalent terminal — the row is KEPT as history and
 * is never deleted (rule 11 / D7). Members already terminal (graduated/removed)
 * return null (no move).
 *
 * Every non-null value returned here is a legal MEMBERSHIP_TRANSITIONS edge from
 * `current`, so callers can safely feed it back through canTransition/
 * transitionStatus:
 *   active   --completed--> graduated   (active → graduated ✓)
 *   active   --archived --> removed     (active → removed   ✓)
 *   enrolled --any------->  removed     (enrolled → removed ✓)
 *   invited  --any------->  removed     (invited → removed  ✓)
 *   paused   --any------->  removed     (paused → removed   ✓)
 */
export function membershipCloseStatus(
  current: MembershipStatus,
  cohortTo: CohortCloseStatus
): MembershipStatus | null {
  if (current === 'graduated' || current === 'removed') return null;
  if (cohortTo === 'completed' && current === 'active') return 'graduated';
  return 'removed';
}
