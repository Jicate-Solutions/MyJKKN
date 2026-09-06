/**
 * Gate-scan decision logic — pure functions, no database, no React.
 *
 * The guard's screen exists to answer ONE question per scan: does this
 * learner walk out, walk in, or get stopped? Everything the screen renders
 * (colour, headline, the single button) is derived here so it can be tested
 * without a browser or a Supabase session.
 *
 * Three verdicts, matching the three colours the guard sees:
 *
 *   approved   GREEN  — an approved pass is open and the window has not
 *                       closed. One tap records the exit.
 *   returning  AMBER  — the learner is already outside on this pass. One tap
 *                       records the return. Late is a flag ON this verdict,
 *                       not a fourth verdict: a late learner still comes in.
 *   blocked    RED    — nothing approved applies. HARD BLOCK by Director
 *                       decision: there is no override path, so this module
 *                       deliberately exposes no "let them out anyway" action.
 *                       `action` is null and stays null.
 *
 * Status vocabulary is the live `gate_pass_status_enum`:
 * 'issued' | 'active' | 'returned' | 'overdue' | 'cancelled'.
 * 'issued' means approved-but-not-yet-out; 'active' means out.
 *
 * A card also keeps working after its holder leaves, so this file additionally
 * holds the scan-time leaver rule (`describeDeparture` / `decideScan` at the
 * bottom) — shared with the mess door so both scanners refuse the same people.
 * `decideScan` is the entry point a scan screen calls; `decideGateAction`
 * answers only the pass half and does not judge who is presenting the card.
 */

import type { GatePassStatus } from '@/types/campus-living';

/** The colour band the guard sees. */
export type GateVerdict = 'approved' | 'returning' | 'blocked';

/**
 * Why a RED scan is red. Prose lives in `headline`/`detail`; this is the
 * machine-readable half, so the screen can render a different panel for
 * "no pass tonight" than for "this person has left" without matching strings.
 */
export type BlockedReason = 'no_approved_pass' | 'approved_window_closed' | 'has_left';

/** The single write the one tap performs. `null` when blocked. */
export type GateAction = 'out' | 'in' | null;

/**
 * The subset of `hostel_gate_passes` the decision actually reads. Narrower
 * than `HostelGatePass` on purpose — a test should not have to invent an
 * institution_id to assert that a late learner is late.
 */
export interface ScannedPass {
  id: string;
  status: GatePassStatus;
  destination: string;
  /** ISO timestamp. NOT NULL in the table. */
  expected_return: string;
  out_time: string | null;
  pass_number: string;
}

export interface GateDecision {
  verdict: GateVerdict;
  /** The pass the one tap acts on. `null` only when blocked. */
  pass: ScannedPass | null;
  action: GateAction;
  /** Set on every 'blocked' verdict, `null` on the other two. */
  blockedReason: BlockedReason | null;
  /** The one line, in caps, that the guard reads first. */
  headline: string;
  /** The second line: where to, till when, or why they are stopped. */
  detail: string;
  /** True only on a 'returning' verdict whose expected_return has passed. */
  isLate: boolean;
  /** 0 unless `isLate`. Whole minutes past expected_return. */
  lateByMinutes: number;
}

/** A pass in one of these states means the learner is currently OUTSIDE. */
const OUTSIDE_STATUSES: readonly GatePassStatus[] = ['active', 'overdue'];

/**
 * Whole minutes `now` is past `expectedReturn`. Negative or zero (not yet
 * due, or exactly due) clamps to 0 — "0 minutes late" is not late.
 */
export function minutesLate(expectedReturn: string, now: Date): number {
  const due = new Date(expectedReturn).getTime();
  if (Number.isNaN(due)) return 0;
  const diffMs = now.getTime() - due;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / 60_000);
}

/**
 * "40 minutes late" / "1 hour 20 minutes late" / "2 hours late".
 * Read aloud at a gate at night, so no abbreviations and no decimals.
 */
export function formatLateness(minutes: number): string {
  if (minutes <= 0) return 'on time';
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} late`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = `${hours} hour${hours === 1 ? '' : 's'}`;
  if (rest === 0) return `${hourPart} late`;
  return `${hourPart} ${rest} minute${rest === 1 ? '' : 's'} late`;
}

/** 8:00 PM — the form the guard compares against a wall clock. */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Earliest `expected_return` first; a malformed date sorts last. */
function byEarliestDue(a: ScannedPass, b: ScannedPass): number {
  const ta = new Date(a.expected_return).getTime();
  const tb = new Date(b.expected_return).getTime();
  if (Number.isNaN(ta)) return 1;
  if (Number.isNaN(tb)) return -1;
  return ta - tb;
}

/**
 * The whole screen, decided.
 *
 * Order matters and is not arbitrary:
 *
 *  1. OUTSIDE wins over approved. A learner holding both an open 'active'
 *     pass and a fresh 'issued' one is standing at the gate to come IN — the
 *     guard must never be offered "record exit" for someone already out.
 *  2. An 'issued' pass whose window has already closed is NOT a green light.
 *     The approval was for a window that has passed; walking out on it is
 *     exactly the thing the pass was supposed to bound. It reads RED with the
 *     closing time named, so the guard can say why.
 *  3. Anything else is RED.
 *
 * `passes` should already be scoped to one learner. Returned and cancelled
 * passes may be included — they are filtered here so the caller can hand over
 * a plain history query.
 */
export function decideGateAction(passes: ScannedPass[], now: Date): GateDecision {
  const live = (passes ?? []).filter(
    (p) => p.status !== 'returned' && p.status !== 'cancelled'
  );

  // ── 1. Already outside → AMBER, one tap records the return ──────────
  const outside = live
    .filter((p) => OUTSIDE_STATUSES.includes(p.status))
    .sort(byEarliestDue);

  if (outside.length > 0) {
    const pass = outside[0];
    const late = minutesLate(pass.expected_return, now);
    const due = formatClock(pass.expected_return);
    return {
      verdict: 'returning',
      pass,
      action: 'in',
      blockedReason: null,
      headline: 'RETURNING',
      detail:
        late > 0
          ? `Was due ${due}, ${formatLateness(late)}`
          : `Due back ${due} · ${pass.destination}`,
      isLate: late > 0,
      lateByMinutes: late,
    };
  }

  // ── 2. Approved and still inside its window → GREEN, one tap = OUT ──
  const nowMs = now.getTime();
  const issued = live.filter((p) => p.status === 'issued').sort(byEarliestDue);
  const open = issued.filter((p) => {
    const due = new Date(p.expected_return).getTime();
    return !Number.isNaN(due) && due > nowMs;
  });

  if (open.length > 0) {
    const pass = open[0];
    return {
      verdict: 'approved',
      pass,
      action: 'out',
      blockedReason: null,
      headline: 'APPROVED',
      detail: `Out till ${formatClock(pass.expected_return)} · ${pass.destination}`,
      isLate: false,
      lateByMinutes: 0,
    };
  }

  // ── 3. Blocked. No override exists, by decision. ────────────────────
  if (issued.length > 0) {
    // Approved, but for a window that has already closed.
    const expired = issued[issued.length - 1];
    return {
      verdict: 'blocked',
      pass: null,
      action: null,
      blockedReason: 'approved_window_closed',
      headline: 'NO APPROVED PASS',
      detail: `The approved window closed at ${formatClock(expired.expected_return)}. A warden must issue a new pass.`,
      isLate: false,
      lateByMinutes: 0,
    };
  }

  return {
    verdict: 'blocked',
    pass: null,
    action: null,
    blockedReason: 'no_approved_pass',
    headline: 'NO APPROVED PASS',
    detail: 'No gate pass is open for this learner. Do not let them out.',
    isLate: false,
    lateByMinutes: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Has this person left? — the scan-time leaver rule
// ─────────────────────────────────────────────────────────────────────

/**
 * Director decision, 2026-08-13: "Dead cards refused at SCAN time, not just at
 * reprint. Blocking reprints does nothing about the plastic a leaver already
 * holds." A card is a piece of plastic that keeps working after the person
 * behind it stops belonging here — the only place that can be caught is the
 * moment it is presented.
 *
 * ONE DEFINITION, TWO DOORS. This rule is read by the gate scanner below and
 * imported by mess-scan-resolver for the mess door, so a person cannot be a
 * leaver at one scanner and a current learner at the other. It is the same
 * list the print guard uses (lib/services/id-cards/reprint-eligibility.ts,
 * `LEAVER_STATUSES`, PR #3059) — restated rather than imported because that
 * file is on an unmerged branch and this lane must build on its own. The two
 * de-duplicate once both have landed; until then the lists must be edited
 * together, or the printer and the scanners will disagree about who has left.
 */
export const LEAVER_LIFECYCLE_STATUSES: readonly string[] = [
  'graduated',
  'exited',
  'inactive',
  'withdrawal_pending',
  'alumni',
];

/**
 * Who the scanned card belongs to, as far as we could establish it.
 *
 * `unclassified` is DELIBERATELY ALLOWED THROUGH. This rule refuses people who
 * can be SHOWN to have left; someone we could not classify cannot be shown to
 * have left, and inventing a block for them would stop live workflows nobody
 * asked to change. Administrative and service accounts land here, as does any
 * learner whose record the scanning guard's own RLS scope cannot read.
 *
 * Typed as `string`, not `LifecycleStatus`: production holds
 * `withdrawal_pending`, which the TypeScript union in types/learner-profile.ts
 * does not list. Narrowing the type here would silently drop a real leaver
 * status. (`lifecycle_status` and `is_active` are database identifiers.)
 */
export type ScanSubject =
  | { kind: 'learner'; lifecycleStatus: string | null }
  | { kind: 'team_member'; isActive: boolean | null }
  | { kind: 'unclassified' };

/**
 * The sentence that names why this card is dead, or `null` when the person is
 * still here. Always names the actual status, so the reason a guard reads is
 * the reason in the record — never a generic "not allowed".
 */
export function describeDeparture(subject: ScanSubject): string | null {
  switch (subject.kind) {
    case 'learner': {
      const status = (subject.lifecycleStatus ?? '').trim();
      // No status recorded is not evidence of leaving — see `unclassified`.
      if (status === '') return null;
      if (!LEAVER_LIFECYCLE_STATUSES.includes(status)) return null;
      return `This learner is no longer on the rolls — their record reads "${status}".`;
    }
    case 'team_member':
      // Only an explicit false counts. `null` means we could not read it.
      return subject.isActive === false
        ? 'This team member is no longer active on the team register.'
        : null;
    case 'unclassified':
      return null;
  }
}

/**
 * THE ENTRY POINT THE SCAN SCREEN CALLS. `decideGateAction` above answers only
 * "does this learner hold a live pass"; a leaver holds a card, and often a
 * perfectly valid-looking one, so the subject must be judged first.
 *
 * A leaver is a BLOCKED scan with its own reason — not a fourth verdict, and
 * not a new override path. RED remains the hard block the Director chose:
 * `action` is null here exactly as it is for every other RED.
 *
 * The leaver check runs BEFORE the pass check, including before 'returning'.
 * That is deliberate and has one consequence worth naming: a learner who left
 * while still out on an open pass cannot have their return recorded at the
 * gate, so that pass stays open until a warden closes it from the gate-pass
 * screen. The detail line below tells the guard exactly that, so the stuck
 * pass surfaces as an instruction rather than as a puzzle.
 */
export function decideScan(
  subject: ScanSubject,
  passes: ScannedPass[],
  now: Date
): GateDecision {
  const departure = describeDeparture(subject);
  if (departure) {
    return {
      verdict: 'blocked',
      pass: null,
      action: null,
      blockedReason: 'has_left',
      headline: 'CARD NO LONGER VALID',
      detail: `${departure} Do not accept this card — send them to the office. If a gate pass is still open for them, a warden must close it from the gate-pass screen.`,
      isLate: false,
      lateByMinutes: 0,
    };
  }
  return decideGateAction(passes, now);
}

// ─────────────────────────────────────────────────────────────────────
// Card code shape
// ─────────────────────────────────────────────────────────────────────

/**
 * What a scanned card code looks like, so the caller knows which table to
 * ask. The card QR encodes a raw `learners_profiles.id` UUID today; a
 * sibling lane is switching it to the permanent JKKN ID (`348295-7`). This
 * screen accepts BOTH shapes for the whole overlap period.
 *
 * Deliberately local to this lane rather than imported from the identity
 * lane — the two must stay independently mergeable. A follow-up de-dupes.
 */
export type CardCodeKind = 'uuid' | 'jkkn_id' | 'unknown';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JKKN_ID_RE = /^[0-9]{6}-[0-9]$/;

export function classifyCardCode(raw: string): CardCodeKind {
  const v = (raw ?? '').trim();
  if (UUID_RE.test(v)) return 'uuid';
  if (JKKN_ID_RE.test(v)) return 'jkkn_id';
  return 'unknown';
}
