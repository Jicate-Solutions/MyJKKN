// lib/services/accreditation/owner-digest.ts
// ============================================================================
// What each named accreditation owner would be told they still owe.
//
// THIS MODULE SENDS NOTHING. It is arithmetic over rows — pure, no I/O, no
// client, no transport. The cron route composes it and returns the result as
// JSON so a human can read what a future armed version WOULD send. Arming is a
// separate, explicitly-authorised change; see the route's header.
//
// SHAPES ARE THE LIVE ONES (probed against production 2026-08-02, not read off
// a migration file). Two of them differ from what supabase/migrations says:
//
//   · accreditation_metric_owners.metric_code is NULLABLE in production. The
//     original migration 20260725071500 declares it NOT NULL; production has
//     since been altered. NULL is load-bearing here — it is what "owns the
//     whole body" means.
//   · accreditation_metric_owners also carries programme_id, assignment_status,
//     acknowledged_at, previous_owner_user_id and owner_changed_at live, none
//     of which appear in any merged migration.
//
// OWNERSHIP MODEL (one table, two scopes, distinguished by metric_code)
//   metric_code IS NULL   → owns every metric of that body at that institution.
//   metric_code = '3.1.1' → owns that one metric, and OVERRIDES the body owner.
//   programme_id NOT NULL → a single degree programme's slice (NBA). A different
//                           axis entirely; it never satisfies, and never
//                           overrides, institution-level ownership.
//
// WHY ONLY 'confirmed' OWNERS GET A DIGEST
//   Director decision 8: IQAC assigns, the named person CONFIRMS — accountability
//   is accepted, not imposed. Mailing somebody a list of duties they have not
//   accepted is the imposition that decision exists to prevent. So 'pending' and
//   'declined' assignments are counted and reported in the preview, never
//   addressed. They are surfaced, not silently dropped.
// ============================================================================

export type BodyCode =
  | 'NAAC' | 'NIRF' | 'NBA' | 'QS' | 'DCI'
  | 'PCI' | 'INC' | 'AICTE' | 'NCTE' | 'UGC';

/** Mirrors the live CHECK on accreditation_metric_owners.assignment_status. */
export type AssignmentStatus = 'pending' | 'confirmed' | 'declined';

/** Mirrors the live CHECK on accreditation_digest_config.frequency. */
export type DigestFrequency = 'daily' | 'weekly' | 'fortnightly' | 'monthly';

/** One row of accreditation_metric_owners. */
export interface OwnerRow {
  id: string;
  institution_id: string;
  body_code: string;
  /** NULL = owns the whole body for this institution. */
  metric_code: string | null;
  /** NULL = institution-level. Non-NULL = one degree programme (NBA). */
  programme_id: string | null;
  owner_user_id: string;
  assignment_status: AssignmentStatus;
  created_at?: string | null;
}

/** One row of accreditation_digest_config. */
export interface DigestConfigRow {
  id: string;
  user_id: string;
  institution_id: string;
  body_code: string;
  is_enabled: boolean;
  email: string;
  frequency: string;
  last_sent_at: string | null;
}

/** One row of sh_accreditation_metrics. `metric_type` IS the awarding body. */
export interface FrameworkMetric {
  metric_code: string;
  metric_type: string;
  metric_name: string;
  category: string | null;
  is_active: boolean | null;
}

/** One row of quality_evidence_mappings, narrowed to what attribution needs. */
export interface EvidenceRow {
  institution_id: string;
  body_code: string;
  metric_code: string | null;
}

/** One row of accreditation_submissions, narrowed to the deadline question. */
export interface SubmissionRow {
  institution_id: string;
  body_code: string;
  due_date: string | null;
  status: string;
  period_label: string | null;
}

/** Days between sends, per frequency. `monthly` is 30 days, not a calendar month. */
export const FREQUENCY_DAYS: Record<DigestFrequency, number> = {
  daily: 1,
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
};

const MS_PER_DAY = 86_400_000;

/** Submission states that no longer carry an obligation. Mirrors idx_submissions_due. */
const CLOSED_SUBMISSION_STATUSES = new Set(['accepted', 'withdrawn']);

/** Text keys arrive from Postgres text columns; compare them trimmed. */
function norm(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** Parse a timestamptz / date string, returning null rather than an Invalid Date. */
function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Parse a 'YYYY-MM-DD' date column at UTC midnight so day maths is stable. */
function parseDueDate(value: string | null | undefined): number | null {
  const raw = norm(value);
  if (!raw) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw;
  return parseTime(iso);
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export type DueReason =
  | 'due'
  | 'disabled'
  | 'never_sent'
  | 'interval_not_elapsed'
  | 'unknown_frequency'
  | 'last_sent_unparseable'
  | 'last_sent_in_future';

export interface DueVerdict {
  due: boolean;
  reason: DueReason;
  /** Whole days since last_sent_at, or null when it has never been sent. */
  daysSinceLastSent: number | null;
  intervalDays: number | null;
}

function isKnownFrequency(value: string): value is DigestFrequency {
  return Object.prototype.hasOwnProperty.call(FREQUENCY_DAYS, value);
}

/**
 * Would this config be picked up on this run?
 *
 * Every uncertain branch resolves to NOT due. A digest that skips a cycle is a
 * nuisance; one that fires twice, or fires off an unparseable timestamp, mails
 * real people twice. When in doubt, stay quiet.
 */
export function isDigestDue(config: DigestConfigRow, now: Date): DueVerdict {
  if (!config.is_enabled) {
    return { due: false, reason: 'disabled', daysSinceLastSent: null, intervalDays: null };
  }

  const frequency = norm(config.frequency);
  if (!isKnownFrequency(frequency)) {
    return { due: false, reason: 'unknown_frequency', daysSinceLastSent: null, intervalDays: null };
  }
  const intervalDays = FREQUENCY_DAYS[frequency];

  if (config.last_sent_at === null || norm(config.last_sent_at) === '') {
    return { due: true, reason: 'never_sent', daysSinceLastSent: null, intervalDays };
  }

  const lastSent = parseTime(config.last_sent_at);
  if (lastSent === null) {
    return { due: false, reason: 'last_sent_unparseable', daysSinceLastSent: null, intervalDays };
  }

  const elapsedMs = now.getTime() - lastSent;
  if (elapsedMs < 0) {
    // Clock skew, or a bad backfill. Never treat the future as "long ago".
    return { due: false, reason: 'last_sent_in_future', daysSinceLastSent: null, intervalDays };
  }

  const daysSinceLastSent = Math.floor(elapsedMs / MS_PER_DAY);
  return elapsedMs >= intervalDays * MS_PER_DAY
    ? { due: true, reason: 'due', daysSinceLastSent, intervalDays }
    : { due: false, reason: 'interval_not_elapsed', daysSinceLastSent, intervalDays };
}

// ---------------------------------------------------------------------------
// Ownership resolution
// ---------------------------------------------------------------------------

export type OwnerSource = 'explicit' | 'inherited';

export interface ResolvedMetricOwner {
  metricCode: string;
  source: OwnerSource;
  ownerUserId: string;
  status: AssignmentStatus;
}

/** Institution-level rows for one (institution, body). Programme rows excluded. */
function institutionScopedRows(owners: OwnerRow[], institutionId: string, bodyCode: string): OwnerRow[] {
  return owners.filter(
    (row) =>
      row.programme_id === null &&
      norm(row.institution_id) === norm(institutionId) &&
      norm(row.body_code) === norm(bodyCode),
  );
}

/**
 * Deterministic pick when more than one body-owner row exists.
 *
 * `UNIQUE NULLS NOT DISTINCT (institution_id, body_code, metric_code,
 * programme_id)` should make this a singleton, but a digest must not depend on
 * a constraint holding to decide who gets mailed. Oldest row wins, id breaking
 * ties, so the same run always resolves the same person.
 */
function pickBodyOwner(rows: OwnerRow[]): OwnerRow | null {
  const candidates = rows.filter((row) => row.metric_code === null);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const at = parseTime(a.created_at) ?? 0;
    const bt = parseTime(b.created_at) ?? 0;
    if (at !== bt) return at - bt;
    return a.id.localeCompare(b.id);
  })[0];
}

/**
 * Who is accountable for each metric of one body at one institution.
 *
 * An explicit row WINS over the body owner whatever its status — including
 * 'declined'. A refusal is a record that this metric is spoken for and needs
 * reassigning; quietly rerouting it back to the body owner would hide the
 * refusal and hand somebody work they were never assigned. So a declined
 * explicit row leaves the metric unowned, visibly, rather than reassigning it.
 */
export function resolveMetricOwners(
  owners: OwnerRow[],
  metrics: FrameworkMetric[],
  institutionId: string,
  bodyCode: string,
): Map<string, ResolvedMetricOwner> {
  const scoped = institutionScopedRows(owners, institutionId, bodyCode);
  const bodyOwner = pickBodyOwner(scoped);

  const explicit = new Map<string, OwnerRow>();
  for (const row of scoped) {
    const code = norm(row.metric_code);
    if (row.metric_code === null || code === '') continue;
    const existing = explicit.get(code);
    if (!existing) {
      explicit.set(code, row);
      continue;
    }
    // Same deterministic tie-break as the body owner, for the same reason.
    const et = parseTime(existing.created_at) ?? 0;
    const rt = parseTime(row.created_at) ?? 0;
    if (rt < et || (rt === et && row.id.localeCompare(existing.id) < 0)) explicit.set(code, row);
  }

  const resolved = new Map<string, ResolvedMetricOwner>();
  for (const metric of activeMetricsForBody(metrics, bodyCode)) {
    const code = norm(metric.metric_code);
    const explicitRow = explicit.get(code);
    const chosen = explicitRow ?? bodyOwner;
    if (!chosen) continue;
    resolved.set(code, {
      metricCode: code,
      source: explicitRow ? 'explicit' : 'inherited',
      ownerUserId: chosen.owner_user_id,
      status: chosen.assignment_status,
    });
  }
  return resolved;
}

/**
 * The body's live rubric.
 *
 * `is_active` is nullable, and `.eq('is_active', true)` — what
 * AccreditationService already uses everywhere — excludes NULL. Mirrored here
 * rather than guessed at, so the digest counts the same metric population the
 * coverage dashboards do.
 */
export function activeMetricsForBody(metrics: FrameworkMetric[], bodyCode: string): FrameworkMetric[] {
  const body = norm(bodyCode);
  return metrics.filter(
    (metric) => norm(metric.metric_type) === body && metric.is_active === true && norm(metric.metric_code) !== '',
  );
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * Metric codes with at least one evidence row at this institution for this body.
 *
 * An evidence row whose metric_code is NULL is deliberately ignored: it proves
 * nothing about any particular metric, and counting it would close a gap that
 * is still open.
 */
export function metricsWithEvidence(
  evidence: EvidenceRow[],
  institutionId: string,
  bodyCode: string,
): Set<string> {
  const institution = norm(institutionId);
  const body = norm(bodyCode);
  const seen = new Set<string>();
  for (const row of evidence) {
    if (norm(row.institution_id) !== institution) continue;
    if (norm(row.body_code) !== body) continue;
    const code = norm(row.metric_code);
    if (code === '') continue;
    seen.add(code);
  }
  return seen;
}

// ---------------------------------------------------------------------------
// Deadline
// ---------------------------------------------------------------------------

export interface NextDeadline {
  dueDate: string;
  periodLabel: string | null;
  daysUntilDue: number;
}

/**
 * The soonest open submission deadline for this (institution, body), or null.
 *
 * Only submissions that still carry an obligation count — 'accepted' and
 * 'withdrawn' are done with. An already-passed due date still counts, and
 * reports a negative daysUntilDue: an overdue filing is the most important
 * thing a digest could say, so it must not be filtered out for being late.
 */
export function nextSubmissionDeadline(
  submissions: SubmissionRow[],
  institutionId: string,
  bodyCode: string,
  now: Date,
): NextDeadline | null {
  const institution = norm(institutionId);
  const body = norm(bodyCode);

  let best: { ms: number; row: SubmissionRow } | null = null;
  for (const row of submissions) {
    if (norm(row.institution_id) !== institution) continue;
    if (norm(row.body_code) !== body) continue;
    if (CLOSED_SUBMISSION_STATUSES.has(norm(row.status).toLowerCase())) continue;
    const ms = parseDueDate(row.due_date);
    if (ms === null) continue;
    if (best === null || ms < best.ms) best = { ms, row };
  }
  if (best === null) return null;

  return {
    dueDate: norm(best.row.due_date),
    periodLabel: best.row.period_label ?? null,
    daysUntilDue: Math.ceil((best.ms - now.getTime()) / MS_PER_DAY),
  };
}

// ---------------------------------------------------------------------------
// The digest
// ---------------------------------------------------------------------------

export interface DigestGap {
  metricCode: string;
  metricName: string;
  category: string | null;
  source: OwnerSource;
}

export interface OwnerDigest {
  userId: string;
  email: string;
  institutionId: string;
  bodyCode: string;
  frequency: string;
  /** Metrics this person has CONFIRMED and which still have no evidence. */
  gaps: DigestGap[];
  ownedMetricCount: number;
  metricsWithEvidenceCount: number;
  /** Assigned to this person but not yet acknowledged — reported, never mailed. */
  awaitingAcknowledgementCount: number;
  /** Assigned to this person and refused — reported, never mailed. */
  declinedCount: number;
  nextDeadline: NextDeadline | null;
}

export interface ComputeOwnerDigestInput {
  config: DigestConfigRow;
  owners: OwnerRow[];
  metrics: FrameworkMetric[];
  evidence: EvidenceRow[];
  submissions: SubmissionRow[];
  now: Date;
}

/**
 * What this one owner owes right now.
 *
 * Returns a digest even when `gaps` is empty — "nothing outstanding" is a real
 * answer, and the caller decides whether an empty digest is worth sending. It
 * decides not to; see shouldSendDigest.
 */
export function computeOwnerDigest(input: ComputeOwnerDigestInput): OwnerDigest {
  const { config, owners, metrics, evidence, submissions, now } = input;
  const institutionId = config.institution_id;
  const bodyCode = config.body_code;

  const resolved = resolveMetricOwners(owners, metrics, institutionId, bodyCode);
  const evidenced = metricsWithEvidence(evidence, institutionId, bodyCode);

  const metricByCode = new Map<string, FrameworkMetric>();
  for (const metric of activeMetricsForBody(metrics, bodyCode)) {
    metricByCode.set(norm(metric.metric_code), metric);
  }

  const gaps: DigestGap[] = [];
  let ownedMetricCount = 0;
  let metricsWithEvidenceCount = 0;
  let awaitingAcknowledgementCount = 0;
  let declinedCount = 0;

  for (const [code, owner] of resolved) {
    if (owner.ownerUserId !== config.user_id) continue;

    if (owner.status === 'pending') {
      awaitingAcknowledgementCount++;
      continue;
    }
    if (owner.status === 'declined') {
      declinedCount++;
      continue;
    }

    ownedMetricCount++;
    if (evidenced.has(code)) {
      metricsWithEvidenceCount++;
      continue;
    }
    const metric = metricByCode.get(code);
    gaps.push({
      metricCode: code,
      metricName: metric?.metric_name ?? code,
      category: metric?.category ?? null,
      source: owner.source,
    });
  }

  gaps.sort((a, b) => a.metricCode.localeCompare(b.metricCode, undefined, { numeric: true }));

  return {
    userId: config.user_id,
    email: config.email,
    institutionId,
    bodyCode,
    frequency: norm(config.frequency),
    gaps,
    ownedMetricCount,
    metricsWithEvidenceCount,
    awaitingAcknowledgementCount,
    declinedCount,
    nextDeadline: nextSubmissionDeadline(submissions, institutionId, bodyCode, now),
  };
}

/**
 * Is this digest worth sending at all?
 *
 * An owner with nothing outstanding gets nothing. A digest that arrives every
 * week to say "all clear" trains its reader to ignore it, and the one week it
 * matters it is ignored too.
 */
export function shouldSendDigest(digest: OwnerDigest): boolean {
  return digest.gaps.length > 0;
}

// ---------------------------------------------------------------------------
// The preview — what an armed version WOULD send
// ---------------------------------------------------------------------------

export interface DigestPreview {
  to: string;
  userId: string;
  institutionId: string;
  bodyCode: string;
  subject: string;
  body: string;
  gapCount: number;
}

const MAX_LISTED_GAPS = 20;

/** Wording for the deadline line, or null when no open submission exists. */
function deadlineLine(deadline: NextDeadline | null): string | null {
  if (!deadline) return null;
  const period = deadline.periodLabel ? ` (${deadline.periodLabel})` : '';
  if (deadline.daysUntilDue < 0) {
    return `The ${deadline.dueDate}${period} filing is ${Math.abs(deadline.daysUntilDue)} day(s) overdue.`;
  }
  if (deadline.daysUntilDue === 0) {
    return `The ${deadline.dueDate}${period} filing is due today.`;
  }
  return `The ${deadline.dueDate}${period} filing is due in ${deadline.daysUntilDue} day(s).`;
}

/**
 * The exact message an armed version would send. Built here, in the open, so a
 * human can read every word before anybody switches the transport on.
 */
export function buildDigestPreview(digest: OwnerDigest): DigestPreview {
  const subject = `${digest.bodyCode}: ${digest.gaps.length} metric(s) awaiting evidence from you`;

  const lines: string[] = [
    `You are the accepted owner of ${digest.ownedMetricCount} ${digest.bodyCode} metric(s) at this institution.`,
    `${digest.metricsWithEvidenceCount} already have evidence on file. ${digest.gaps.length} do not.`,
  ];

  const deadline = deadlineLine(digest.nextDeadline);
  if (deadline) lines.push(deadline);

  lines.push('', 'Still needing evidence:');
  for (const gap of digest.gaps.slice(0, MAX_LISTED_GAPS)) {
    const via = gap.source === 'inherited' ? ' (via your body-wide ownership)' : '';
    lines.push(`  - ${gap.metricCode} ${gap.metricName}${via}`);
  }
  if (digest.gaps.length > MAX_LISTED_GAPS) {
    lines.push(`  ...and ${digest.gaps.length - MAX_LISTED_GAPS} more.`);
  }

  if (digest.awaitingAcknowledgementCount > 0) {
    lines.push(
      '',
      `${digest.awaitingAcknowledgementCount} further metric(s) are assigned to you but not yet accepted. ` +
        'They are not counted above until you accept them.',
    );
  }

  return {
    to: digest.email,
    userId: digest.userId,
    institutionId: digest.institutionId,
    bodyCode: digest.bodyCode,
    subject,
    body: lines.join('\n'),
    gapCount: digest.gaps.length,
  };
}
