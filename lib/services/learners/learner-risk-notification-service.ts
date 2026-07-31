/**
 * lib/services/learners/learner-risk-notification-service.ts
 *
 * Pure decision + message-building logic for learner-risk staff notifications.
 * Every function here is deterministic and dependency-free so the parts that
 * are easy to get quietly wrong — "should this learner be announced again?"
 * and "does the message carry enough evidence to act on?" — are unit-testable
 * without a database.
 *
 * The I/O half (reading assessments, resolving recipients, fanning out, writing
 * the ledger) lives in app/api/cron/learner-risk-notifications/route.ts.
 *
 * Context: the risk engine's first successful run was 2026-07-30 — 4,342
 * assessments for that date, 59 critical and 403 high. It writes rows and
 * notifies nobody. Director approved notifying STAFF on 2026-07-30. Learners
 * and families are deliberately NOT recipients of anything built here.
 */

export type RiskTier = 'critical' | 'high';
export type TrendDirection = 'improving' | 'stable' | 'worsening';

/** Why a learner is being announced. Mirrors learner_risk_notification_log.reason. */
export type NotifyReason = 'new' | 'escalated' | 'worsening';

/** Every outcome of the dedupe decision, including the skips. */
export type Decision =
  | { notify: true; reason: NotifyReason }
  | { notify: false; reason: 'unchanged' | 'already_notified_today' | 'not_at_risk' };

/** The latest ledger row for a learner, or null when we have never told anyone. */
export interface LastNotification {
  notified_on: string; // YYYY-MM-DD
  risk_tier: RiskTier;
  composite_risk_score: number;
}

/** One at-risk learner, assembled from the assessment + attendance + billing. */
export interface RiskCandidate {
  learner_id: string;
  institution_id: string;
  department_id: string | null;
  full_name: string;
  roll_number: string | null;
  risk_tier: RiskTier;
  composite_risk_score: number;
  previous_risk_score: number | null;
  trend_direction: TrendDirection | null;
  risk_factors: string[];
  recommended_actions: string[];
  /** Attendance over the last 14 days, percent. Null when no sessions recorded. */
  attendance_14d_pct: number | null;
  /** Change vs the preceding 14 days, in percentage points. */
  attendance_delta_pct: number | null;
  last_absent_date: string | null;
  /** Count of bills past their due date and not settled. */
  overdue_bill_count: number;
}

export interface DecisionOptions {
  /** Minimum rise in composite score, within the same tier, to re-announce. */
  minScoreDelta: number;
  /** Today, as YYYY-MM-DD. Passed in so the function stays pure. */
  today: string;
}

const TIER_SEVERITY: Record<RiskTier, number> = { high: 1, critical: 2 };

/**
 * Decide whether a learner should be announced to staff today.
 *
 * The engine recomputes the same standing every day, so "is this learner at
 * risk" is the wrong question — it is true for 462 learners every morning and
 * answering it with a message is the bell-flood. The right question is "has
 * anything changed since a human was last told", which is what the ledger
 * answers.
 *
 * Deliberately NOT driven by previous_risk_score / trend_direction alone: on
 * prod those are NULL on all 4,342 rows (only one day of assessments exists),
 * so a dedupe trusting them would either announce everyone forever or nobody.
 * They are honoured as an ADDITIONAL worsening signal where present.
 *
 * Improvement is never announced — a "this learner got better" message
 * competes for the same bell as one that needs action today.
 */
export function decideNotification(
  candidate: Pick<RiskCandidate, 'risk_tier' | 'composite_risk_score' | 'previous_risk_score' | 'trend_direction'>,
  last: LastNotification | null,
  opts: DecisionOptions
): Decision {
  if (candidate.risk_tier !== 'high' && candidate.risk_tier !== 'critical') {
    return { notify: false, reason: 'not_at_risk' };
  }

  // A same-day re-run must be a no-op. The ledger's UNIQUE(learner_id,
  // notified_on) enforces this at the database too; checking here means a
  // manual re-fire reports honestly instead of relying on an insert conflict.
  if (last && last.notified_on === opts.today) {
    return { notify: false, reason: 'already_notified_today' };
  }

  // Never announced before → this is a genuine new entry into high/critical.
  if (!last) return { notify: true, reason: 'new' };

  const wasSeverity = TIER_SEVERITY[last.risk_tier] ?? 0;
  const nowSeverity = TIER_SEVERITY[candidate.risk_tier];

  // high → critical. The single most important transition to surface.
  if (nowSeverity > wasSeverity) return { notify: true, reason: 'escalated' };

  // critical → high is an improvement in tier; stay silent.
  if (nowSeverity < wasSeverity) return { notify: false, reason: 'unchanged' };

  // Same tier: only a materially worse score is worth another message.
  const rise = candidate.composite_risk_score - last.composite_risk_score;
  if (rise >= opts.minScoreDelta) return { notify: true, reason: 'worsening' };

  // The engine's own trend signal, when it has one, counts as worsening — but
  // only alongside an actual rise, so a stale 'worsening' label cannot re-fire
  // a flat score every single day.
  if (
    candidate.trend_direction === 'worsening' &&
    rise > 0 &&
    candidate.previous_risk_score !== null &&
    candidate.composite_risk_score > candidate.previous_risk_score
  ) {
    return { notify: true, reason: 'worsening' };
  }

  return { notify: false, reason: 'unchanged' };
}

// ---------------------------------------------------------------------------
// Copy normalisation
// ---------------------------------------------------------------------------

/**
 * The engine's recommended_actions and risk_factors are stored strings written
 * before the house vocabulary was settled — prod rows literally read
 * "Discuss attendance with ..." using the pre-standard noun. They reach a
 * human's bell verbatim unless normalised, so they are rewritten at render
 * time rather than being back-filled in the database (which would rewrite
 * history for a table other consumers already read).
 *
 * Patterns are anchored with \b so only whole words are touched.
 */
const TERM_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bstudents\b/g, 'learners'],
  [/\bStudents\b/g, 'Learners'],
  [/\bstudent\b/g, 'learner'],
  [/\bStudent\b/g, 'Learner'],
  [/\bpupils\b/g, 'learners'],
  [/\bpupil\b/g, 'learner'],
  [/\bteachers\b/g, 'Senior Learners'],
  [/\bteacher\b/g, 'Senior Learner'],
];

/** Rewrite stored engine copy into house vocabulary. */
export function toLearnerTerms(text: string): string {
  let out = text;
  for (const [rx, repl] of TERM_MAP) out = out.replace(rx, repl);
  return out;
}

/**
 * Turn an engine factor token ('fee_overdue_5_bills', 'attendance_below_threshold')
 * into something readable. Trailing digit-bearing segments are kept because the
 * number is the evidence.
 */
export function humanizeFactor(token: string): string {
  const words = token.replace(/_/g, ' ').trim();
  return toLearnerTerms(words.charAt(0).toUpperCase() + words.slice(1));
}

// ---------------------------------------------------------------------------
// Message building
// ---------------------------------------------------------------------------

export interface MessageOptions {
  /** Assessment date the message describes, YYYY-MM-DD. */
  assessmentDate: string;
  /** Max learners itemised in a digest body before collapsing to a count. */
  maxLearners: number;
}

function pct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return 'not recorded';
  return `${Math.round(n)}%`;
}

/**
 * The evidence block for one learner. This is the whole point of the feature:
 * a bare tier and score tell a department head nothing they can act on, so the
 * attendance trend, the arrears count and the engine's own suggested actions
 * travel with it.
 */
export function formatCandidateLines(c: RiskCandidate, reason: NotifyReason): string[] {
  const who = c.roll_number ? `${c.full_name} (${c.roll_number})` : c.full_name;

  const trend =
    c.previous_risk_score !== null
      ? `, up from ${c.previous_risk_score}`
      : reason === 'new'
        ? ', newly flagged'
        : '';
  const lines = [`${who} — risk ${c.composite_risk_score}/100${trend} [${reason}]`];

  const attendanceBits: string[] = [`Attendance ${pct(c.attendance_14d_pct)} over 14 days`];
  if (c.attendance_delta_pct !== null && Math.abs(c.attendance_delta_pct) >= 1) {
    const dir = c.attendance_delta_pct < 0 ? 'down' : 'up';
    attendanceBits.push(`${dir} ${Math.abs(Math.round(c.attendance_delta_pct))} pts vs the prior 14`);
  }
  if (c.last_absent_date) attendanceBits.push(`last absent ${c.last_absent_date}`);
  lines.push(`  ${attendanceBits.join(', ')}.`);

  if (c.overdue_bill_count > 0) {
    lines.push(`  ${c.overdue_bill_count} overdue bill${c.overdue_bill_count === 1 ? '' : 's'}.`);
  }

  if (c.risk_factors.length) {
    lines.push(`  Signals: ${c.risk_factors.map(humanizeFactor).join(' · ')}.`);
  }

  if (c.recommended_actions.length) {
    lines.push(`  Suggested: ${c.recommended_actions.map(toLearnerTerms).join(' · ')}.`);
  }

  return lines;
}

/** Sort critical first, then by descending score — worst at the top. */
export function orderBySeverity(items: Array<{ candidate: RiskCandidate }>): Array<{ candidate: RiskCandidate }> {
  return [...items].sort((a, b) => {
    const t = TIER_SEVERITY[b.candidate.risk_tier] - TIER_SEVERITY[a.candidate.risk_tier];
    if (t !== 0) return t;
    return b.candidate.composite_risk_score - a.candidate.composite_risk_score;
  });
}

export interface BuiltMessage {
  title: string;
  body: string;
}

/**
 * ONE grouped message per department. This is the DEFAULT mode: on the first
 * live day the alternative was 462 individual messages, which is the flood the
 * bell has no duplicate-folding to survive.
 */
export function buildDigestMessage(
  departmentName: string,
  items: Array<{ candidate: RiskCandidate; reason: NotifyReason }>,
  opts: MessageOptions
): BuiltMessage {
  const ordered = orderBySeverity(items) as Array<{ candidate: RiskCandidate; reason: NotifyReason }>;
  const criticalCount = ordered.filter((i) => i.candidate.risk_tier === 'critical').length;
  const highCount = ordered.length - criticalCount;

  const countBits: string[] = [];
  if (criticalCount) countBits.push(`${criticalCount} critical`);
  if (highCount) countBits.push(`${highCount} high`);

  const title = `${countBits.join(' · ')} risk — ${departmentName}`;

  const shown = ordered.slice(0, Math.max(1, opts.maxLearners));
  const hidden = ordered.length - shown.length;

  const body: string[] = [
    `Risk engine run ${opts.assessmentDate}. These learners in ${departmentName} newly entered — or worsened within — high or critical risk since you were last told.`,
    '',
  ];

  let n = 0;
  let lastTier: RiskTier | null = null;
  for (const item of shown) {
    if (item.candidate.risk_tier !== lastTier) {
      if (lastTier !== null) body.push('');
      body.push(item.candidate.risk_tier === 'critical' ? 'CRITICAL' : 'HIGH');
      lastTier = item.candidate.risk_tier;
    }
    n += 1;
    const [head, ...rest] = formatCandidateLines(item.candidate, item.reason);
    body.push(`${n}. ${head}`);
    body.push(...rest);
  }

  if (hidden > 0) {
    body.push('');
    body.push(`Not itemised: ${hidden} more. Open the learner risk board for the full list.`);
  }

  body.push('');
  body.push('Scores are a prompt to look, not a verdict. Open each record before acting.');

  return { title, body: join(body) };
}

/**
 * One message about one learner. Available via the mode knob for departments
 * that prefer per-case items; never the default.
 */
export function buildIndividualMessage(
  candidate: RiskCandidate,
  reason: NotifyReason,
  opts: MessageOptions
): BuiltMessage {
  const who = candidate.roll_number ? `${candidate.full_name} (${candidate.roll_number})` : candidate.full_name;
  const title = `${candidate.risk_tier === 'critical' ? 'Critical' : 'High'} risk — ${who}`;
  const body = join([
    `Risk engine run ${opts.assessmentDate}.`,
    '',
    ...formatCandidateLines(candidate, reason),
    '',
    'Scores are a prompt to look, not a verdict. Open the record before acting.',
  ]);
  return { title, body };
}

function join(lines: string[]): string {
  return lines.join('\n');
}

/**
 * Explicit expiry for every row this routine creates. The bell's read path
 * honours expires_at, so a day whose cron never fires cannot leave a stale
 * "act now" item pinned in someone's bell indefinitely — the known failure
 * mode where broadcasts never expired and the bell grew to five figures.
 */
export function expiresAtIso(hours: number, now: Date = new Date()): string {
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 72;
  return new Date(now.getTime() + safeHours * 3600_000).toISOString();
}

/**
 * Stable idempotency key. Keyed by department + date in digest mode so two
 * dispatcher ticks in the same slot cannot produce two digests, and by learner
 * + date in individual mode.
 */
export function idempotencyKey(
  mode: 'digest' | 'individual',
  scopeId: string,
  assessmentDate: string
): string {
  return `learner_risk_notify:${mode}:${scopeId}:${assessmentDate}`;
}
