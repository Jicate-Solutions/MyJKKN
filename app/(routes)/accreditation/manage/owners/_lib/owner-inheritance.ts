/**
 * Who owns each accreditation metric, once inheritance is applied.
 *
 * `accreditation_metric_owners` stores ownership at two institution-level
 * scopes in ONE table, distinguished by `metric_code`:
 *
 *   metric_code IS NULL  → this row owns the whole body for this institution.
 *                          Every metric beneath it inherits, unless it carries
 *                          an explicit row of its own.
 *   metric_code = '3.1.1'→ this row owns that single metric and overrides the
 *                          inherited body owner.
 *
 * `UNIQUE NULLS NOT DISTINCT (institution_id, body_code, metric_code,
 * programme_id)` is what makes the NULL row a singleton rather than a set of
 * competing claims, so "the body owner" is always exactly one row or none.
 *
 * Inheritance is the whole point: 107 metrics across 10 bodies, and 0 owner
 * rows in production. Naming one accountable person per body sets 69 NAAC
 * metrics at once; only the genuine exceptions then need a row.
 *
 * Pure, and in its own module, because importing the page pulls the Supabase
 * client in at module scope and that cannot load under vitest.
 */

/** Mirrors the live CHECK: assignment_status IN ('pending','confirmed','declined'). */
export type AssignmentStatus = 'pending' | 'confirmed' | 'declined';

export interface OwnerRow {
  id: string;
  institution_id: string;
  body_code: string;
  /** NULL = owns the whole body for this institution. */
  metric_code: string | null;
  /** NULL = institution-level ownership. Non-NULL = one degree programme (NBA). */
  programme_id: string | null;
  owner_user_id: string;
  assignment_status: AssignmentStatus;
  acknowledged_at: string | null;
  previous_owner_user_id: string | null;
  owner_changed_at: string | null;
}

/** A row of `sh_accreditation_metrics`. `metric_type` IS the awarding body. */
export interface FrameworkMetric {
  metric_code: string;
  metric_type: string;
  category: string | null;
  metric_name: string;
}

/**
 * Where a metric's owner came from.
 *   explicit  — a row naming this exact metric
 *   inherited — no row of its own; the body owner covers it
 *   none      — nobody is accountable for it
 */
export type OwnerSource = 'explicit' | 'inherited' | 'none';

export interface ResolvedOwner {
  metricCode: string;
  bodyCode: string;
  source: OwnerSource;
  ownerUserId: string | null;
  status: AssignmentStatus | null;
  /** The row that decided this, so the page can confirm/decline/reassign it. */
  row: OwnerRow | null;
  /**
   * True when somebody is currently accountable. A DECLINED assignment is not
   * ownership — it is a refusal on the record — so it reads as unowned here and
   * is counted separately. Treating it as owned would let the page report an
   * accountable person for a metric nobody has agreed to hold.
   */
  isOwned: boolean;
}

/**
 * Institution-level rows only. A row carrying a `programme_id` owns one degree
 * programme's slice for NBA — a different axis entirely — and must never
 * satisfy or override institution-level ownership.
 */
function isInstitutionScoped(row: OwnerRow, institutionId: string, bodyCode: string) {
  return (
    row.institution_id === institutionId &&
    row.body_code === bodyCode &&
    row.programme_id === null
  );
}

/** The single body-level owner row for one (institution × body), or null. */
export function findBodyOwnerRow(
  ownerRows: readonly OwnerRow[],
  institutionId: string,
  bodyCode: string,
): OwnerRow | null {
  return (
    ownerRows.find(
      (r) => isInstitutionScoped(r, institutionId, bodyCode) && r.metric_code === null,
    ) ?? null
  );
}

/** The explicit row for one metric, or null when it has none. */
export function findExplicitOwnerRow(
  ownerRows: readonly OwnerRow[],
  institutionId: string,
  bodyCode: string,
  metricCode: string,
): OwnerRow | null {
  return (
    ownerRows.find(
      (r) =>
        isInstitutionScoped(r, institutionId, bodyCode) && r.metric_code === metricCode,
    ) ?? null
  );
}

/**
 * Resolve every metric in the framework against the owner rows for one
 * institution.
 *
 * An explicit row always wins — including an explicit DECLINE. A metric whose
 * named owner refused it does NOT quietly fall back to the body owner: the
 * decline is a statement about that metric, and re-imposing the body owner
 * would erase the refusal the page exists to surface.
 */
export function resolveMetricOwners(
  metrics: readonly FrameworkMetric[],
  ownerRows: readonly OwnerRow[],
  institutionId: string,
): ResolvedOwner[] {
  return metrics.map((metric) => {
    const bodyCode = metric.metric_type;

    const explicit = findExplicitOwnerRow(
      ownerRows,
      institutionId,
      bodyCode,
      metric.metric_code,
    );
    if (explicit) {
      return {
        metricCode: metric.metric_code,
        bodyCode,
        source: 'explicit',
        ownerUserId: explicit.owner_user_id,
        status: explicit.assignment_status,
        row: explicit,
        isOwned: explicit.assignment_status !== 'declined',
      };
    }

    const body = findBodyOwnerRow(ownerRows, institutionId, bodyCode);
    if (body) {
      return {
        metricCode: metric.metric_code,
        bodyCode,
        source: 'inherited',
        ownerUserId: body.owner_user_id,
        status: body.assignment_status,
        row: body,
        isOwned: body.assignment_status !== 'declined',
      };
    }

    return {
      metricCode: metric.metric_code,
      bodyCode,
      source: 'none',
      ownerUserId: null,
      status: null,
      row: null,
      isOwned: false,
    };
  });
}

export interface OwnershipTally {
  total: number;
  /** Has a non-declined owner — the numerator in "Owners set: X of Y". */
  assigned: number;
  /** Assigned AND accepted by the named person. */
  confirmed: number;
  /** Assigned but not yet acknowledged. */
  pending: number;
  /** Refused. Needs reassignment, and is NOT counted as assigned. */
  declined: number;
  /** No owner row reaches it at all. */
  unassigned: number;
  explicit: number;
  inherited: number;
}

export function tallyOwnership(resolved: readonly ResolvedOwner[]): OwnershipTally {
  const tally: OwnershipTally = {
    total: resolved.length,
    assigned: 0,
    confirmed: 0,
    pending: 0,
    declined: 0,
    unassigned: 0,
    explicit: 0,
    inherited: 0,
  };

  for (const r of resolved) {
    if (r.source === 'explicit') tally.explicit += 1;
    if (r.source === 'inherited') tally.inherited += 1;

    if (r.source === 'none') {
      tally.unassigned += 1;
    } else if (r.status === 'declined') {
      tally.declined += 1;
    } else {
      tally.assigned += 1;
      if (r.status === 'confirmed') tally.confirmed += 1;
      else tally.pending += 1;
    }
  }

  return tally;
}

export interface BodyTally {
  bodyCode: string;
  tally: OwnershipTally;
}

/**
 * Per-body breakdown, largest framework first so NAAC's 69 lead and the
 * single-metric bodies do not sit above them.
 */
export function tallyByBody(resolved: readonly ResolvedOwner[]): BodyTally[] {
  const byBody = new Map<string, ResolvedOwner[]>();
  for (const r of resolved) {
    const bucket = byBody.get(r.bodyCode) ?? [];
    bucket.push(r);
    byBody.set(r.bodyCode, bucket);
  }

  return [...byBody.entries()]
    .map(([bodyCode, rows]) => ({ bodyCode, tally: tallyOwnership(rows) }))
    .sort(
      (a, b) =>
        b.tally.total - a.tally.total || a.bodyCode.localeCompare(b.bodyCode),
    );
}

/**
 * The metric codes a bulk assignment would touch.
 *
 * Categories are compared as the EXACT strings the framework stores. Production
 * carries near-duplicates ("Attribute 9: Research" alongside "Attribute 9:
 * Research & Innovation Outcomes"), and folding them together here would assign
 * metrics the coordinator never selected. Two entries in the picker is the
 * honest rendering of two values in the table.
 */
export function metricCodesInCategory(
  metrics: readonly FrameworkMetric[],
  bodyCode: string,
  category: string,
): string[] {
  return metrics
    .filter((m) => m.metric_type === bodyCode && m.category === category)
    .map((m) => m.metric_code);
}

/** Distinct categories for one body, alphabetical. */
export function categoriesForBody(
  metrics: readonly FrameworkMetric[],
  bodyCode: string,
): string[] {
  const seen = new Set<string>();
  for (const m of metrics) {
    if (m.metric_type === bodyCode && m.category) seen.add(m.category);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** Bodies present in the framework, largest first. */
export function bodyCodes(metrics: readonly FrameworkMetric[]): string[] {
  const counts = new Map<string, number>();
  for (const m of metrics) {
    counts.set(m.metric_type, (counts.get(m.metric_type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code]) => code);
}

/**
 * What the ownership cell says. Inherited ownership is stated as inherited
 * ("via NAAC owner") so a coordinator can tell at a glance which metrics
 * someone actually chose and which are riding on the body-level default.
 */
export function ownerSourceLabel(resolved: ResolvedOwner): string {
  if (resolved.source === 'inherited') return `via ${resolved.bodyCode} owner`;
  if (resolved.source === 'explicit') return 'Set for this metric';
  return 'No owner';
}

/**
 * Whether THIS metric row should offer Accept / Decline to the signed-in person.
 *
 * The page shipped with the pair rendered only in the body-owner table, so a
 * metric-level assignment — and every row the "assign a whole category" control
 * writes — landed as pending with no button anywhere to answer it. That is the
 * same unreachable-button dead end the acknowledgement function exists to close,
 * reinstated one level down.
 *
 * EXPLICIT only, deliberately. An inherited row's `row` IS the body-level row,
 * whose pair already sits in the Body owners table; offering it again per metric
 * would put dozens of duplicate buttons on one screen, every one of them driving
 * the same single write.
 *
 * Identity is checked here rather than in RLS because RLS cannot express "the
 * row's own owner" for rendering. It is NOT the security boundary — the write
 * still goes through fn_accreditation_acknowledge_ownership, which takes the
 * caller from auth.uid() and refuses anyone who is not the named owner. This
 * decides what to draw, not what is permitted.
 */
export function canAnswerAssignment(
  resolved: ResolvedOwner,
  currentUserId: string | null | undefined,
): boolean {
  return (
    resolved.source === 'explicit' &&
    resolved.row !== null &&
    !!currentUserId &&
    resolved.row.owner_user_id === currentUserId &&
    resolved.status === 'pending'
  );
}

/** Whether a metric is addressed to this person at all — the "Assigned to me" view. */
export function isAssignedTo(
  resolved: ResolvedOwner,
  currentUserId: string | null | undefined,
): boolean {
  return !!currentUserId && resolved.ownerUserId === currentUserId;
}

/**
 * Whether picking an owner should do nothing at all.
 *
 * Re-selecting the person who already holds a LIVE assignment is a genuine
 * no-op. Re-selecting the person who DECLINED it is not: it is "I am asking you
 * again", and the only way to reset that row to pending. Treating the two the
 * same left a refusal permanently stuck — the sole route back was to hand the
 * metric to somebody else first and then hand it back.
 */
export function shouldSkipAssign(
  existing: OwnerRow | null | undefined,
  nextOwnerId: string,
): boolean {
  if (!existing) return false;
  if (existing.owner_user_id !== nextOwnerId) return false;
  return existing.assignment_status !== 'declined';
}
