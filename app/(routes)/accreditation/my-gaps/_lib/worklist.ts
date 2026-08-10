// app/(routes)/accreditation/my-gaps/_lib/worklist.ts
// ============================================================================
// Pure worklist logic for /accreditation/my-gaps.
//
// Deliberately free of every Supabase / React import: the page is a client
// component and importing it pulls the browser Supabase client in at module
// scope, which cannot load under vitest. Everything decidable without the
// network lives here so it can be tested as plain functions.
//
// The question this module answers is NOT "how is this institution scoring".
// It is "which pieces of accreditation work name ME, and by when". There is no
// grade, no score and no ranking of people anywhere in this file, on purpose:
// counting what somebody owes is not a measure of how good they are, and a
// leaderboard of who carries the most gaps would make the page one people
// avoid opening.
// ============================================================================

/** A row of accreditation_metric_owners, already scoped to one viewer. */
export interface OwnerAssignmentRow {
  id: string;
  institution_id: string;
  body_code: string;
  /**
   * NULL means the assignment covers the WHOLE body: every metric underneath
   * it is inherited. A row naming a metric_code covers only that metric.
   */
  metric_code: string | null;
  programme_id: string | null;
  assignment_status: string | null;
  acknowledged_at: string | null;
  previous_owner_user_id: string | null;
  owner_changed_at: string | null;
}

/** A row of sh_accreditation_metrics. `metric_type` IS the body code. */
export interface MetricCatalogRow {
  metric_type: string;
  metric_code: string;
  metric_name: string | null;
  category: string | null;
}

/** A row of accreditation_submissions — the only source of "by when". */
export interface SubmissionRow {
  institution_id: string;
  body_code: string;
  period_label: string | null;
  due_date: string | null;
  submitted_at: string | null;
}

/** A row of quality_evidence_mappings — what has actually been captured. */
export interface EvidenceRow {
  institution_id: string;
  body_code: string;
  metric_code: string | null;
  source_table: string | null;
}

/**
 * A row of quality_evidence_source_registry. `fix_route` / `fix_hint` are
 * OPTIONAL on purpose — they are added by a separate, currently unmerged
 * change. Read them through {@link readFixRoute} / {@link readFixHint} so this
 * page behaves identically before and after that column lands.
 */
export interface SourceRegistryRow {
  source_table: string;
  display_name: string | null;
  description?: string | null;
  fix_route?: string | null;
  fix_hint?: string | null;
}

/** Which bucket an assignment belongs in. */
export type AssignmentBucket = 'owed' | 'awaiting' | 'declined';

/** One thing the viewer owes: a body, or one metric inside it. */
export interface WorklistItem {
  /** Stable identity for React keys and de-duplication. */
  key: string;
  assignmentId: string;
  institutionId: string;
  bodyCode: string;
  programmeId: string | null;
  /** NULL only when the body carries no metrics in the catalog at all. */
  metricCode: string | null;
  metricName: string | null;
  category: string | null;
  /** 'direct' — a row names this metric. 'inherited' — a body-wide row does. */
  via: 'direct' | 'inherited' | 'body';
  dueDate: string | null;
  periodLabel: string | null;
  /** How many evidence records already exist for this metric. */
  evidenceCount: number;
  /**
   * True when the evidence scan hit its cap. Every count on the page is then a
   * minimum — including a zero, which means "none in the records scanned"
   * rather than "none exist". The UI must say which of the two it is.
   */
  evidenceCountIsFloor: boolean;
  /** Where the existing evidence comes from, resolved through the registry. */
  sources: ResolvedSource[];
}

/** A place evidence for this metric comes from — the "where do I do it". */
export interface ResolvedSource {
  sourceTable: string;
  label: string;
  fixRoute: string | null;
  fixHint: string | null;
}

/** A pending assignment the viewer has not answered yet. */
export interface AwaitingItem {
  assignmentId: string;
  institutionId: string;
  bodyCode: string;
  programmeId: string | null;
  /** NULL means the whole body is being handed over. */
  metricCode: string | null;
  metricName: string | null;
  /** Present when this is a hand-over rather than a first assignment. */
  previousOwnerUserId: string | null;
  ownerChangedAt: string | null;
}

export interface Worklist {
  owed: WorklistItem[];
  awaiting: AwaitingItem[];
  declinedCount: number;
  /** True when there is genuinely nothing in any bucket. */
  isEmpty: boolean;
}

/**
 * Upper bound on evidence rows pulled in one scan. Past it the counts shown are
 * floors rather than exact — the UI says so rather than quietly under-reporting.
 */
export const EVIDENCE_SCAN_LIMIT = 5000;

// ---------------------------------------------------------------------------

/**
 * Which bucket a stored assignment_status maps to.
 *
 * Only 'confirmed' and 'declined' are treated as answered. Anything else —
 * 'pending', a value added later, an empty string — is treated as still needing
 * the person's answer, because showing an unrecognised state as work already
 * accepted would put someone on the hook for something they never agreed to.
 */
export function classifyAssignment(status: string | null): AssignmentBucket {
  const normalised = (status ?? '').trim().toLowerCase();
  if (normalised === 'confirmed') return 'owed';
  if (normalised === 'declined') return 'declined';
  return 'awaiting';
}

/**
 * Order metric codes the way a person reads them: 1.2 before 1.10, and 2.x
 * before 10.x. A plain string sort gets both backwards. Non-numeric segments
 * (NIRF uses codes like TLR_SS) fall back to a case-insensitive string compare.
 */
export function compareMetricCodes(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  const left = a.split('.');
  const right = b.split('.');
  const depth = Math.max(left.length, right.length);

  for (let i = 0; i < depth; i += 1) {
    const l = left[i];
    const r = right[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;

    const ln = Number(l);
    const rn = Number(r);
    const bothNumeric = l !== '' && r !== '' && Number.isFinite(ln) && Number.isFinite(rn);
    if (bothNumeric) {
      if (ln !== rn) return ln < rn ? -1 : 1;
      continue;
    }
    const cmp = l.toLowerCase().localeCompare(r.toLowerCase());
    if (cmp !== 0) return cmp;
  }
  return 0;
}

/** Identity of one owed thing. Programme-scoped rows never collide with global ones. */
function itemKey(
  institutionId: string,
  bodyCode: string,
  programmeId: string | null,
  metricCode: string | null,
): string {
  return `${institutionId}|${bodyCode}|${programmeId ?? '-'}|${metricCode ?? '*'}`;
}

/** Key for looking evidence up per metric. */
function evidenceKey(institutionId: string, bodyCode: string, metricCode: string | null): string {
  return `${institutionId}|${bodyCode}|${metricCode ?? '*'}`;
}

/**
 * The earliest date this (institution × body) is actually due.
 *
 * Only submissions that carry a due_date AND have not been submitted count —
 * `submitted_at` is used rather than `status` because the status vocabulary is
 * open-ended, while "has it gone out yet" is unambiguous. Returns null when
 * nothing is scheduled, which the UI must render as "no date set" rather than
 * as a date that has passed.
 */
export function pickDueDate(
  submissions: SubmissionRow[],
  institutionId: string,
  bodyCode: string,
): { dueDate: string; periodLabel: string | null } | null {
  let best: { dueDate: string; periodLabel: string | null } | null = null;
  for (const s of submissions) {
    if (s.institution_id !== institutionId) continue;
    if (s.body_code !== bodyCode) continue;
    if (!s.due_date) continue;
    if (s.submitted_at) continue;
    if (best === null || s.due_date < best.dueDate) {
      best = { dueDate: s.due_date, periodLabel: s.period_label ?? null };
    }
  }
  return best;
}

/**
 * Read `fix_route` off a registry row without assuming the column exists. The
 * column ships in a separate change; until it merges every row simply has no
 * route and the page renders the source name on its own.
 */
export function readFixRoute(row: SourceRegistryRow | undefined | null): string | null {
  const value = (row as { fix_route?: unknown } | null | undefined)?.fix_route;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Same defensive read for the one-line hint. */
export function readFixHint(row: SourceRegistryRow | undefined | null): string | null {
  const value = (row as { fix_hint?: unknown } | null | undefined)?.fix_hint;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Collapse raw evidence rows into per-metric counts + the distinct tables the
 * evidence came from.
 */
export function indexEvidence(
  rows: EvidenceRow[],
): Map<string, { count: number; sourceTables: string[] }> {
  const index = new Map<string, { count: number; sourceTables: Set<string> }>();
  for (const row of rows) {
    const key = evidenceKey(row.institution_id, row.body_code, row.metric_code);
    const entry = index.get(key) ?? { count: 0, sourceTables: new Set<string>() };
    entry.count += 1;
    if (row.source_table) entry.sourceTables.add(row.source_table);
    index.set(key, entry);
  }
  const out = new Map<string, { count: number; sourceTables: string[] }>();
  for (const [key, entry] of index) {
    out.set(key, { count: entry.count, sourceTables: [...entry.sourceTables].sort() });
  }
  return out;
}

/** Turn source table names into something a person can act on. */
export function resolveSources(
  sourceTables: string[],
  registry: SourceRegistryRow[],
): ResolvedSource[] {
  const byTable = new Map<string, SourceRegistryRow>();
  for (const r of registry) {
    if (r.source_table && !byTable.has(r.source_table)) byTable.set(r.source_table, r);
  }
  return sourceTables.map((sourceTable) => {
    const row = byTable.get(sourceTable);
    return {
      sourceTable,
      label: row?.display_name?.trim() || sourceTable,
      fixRoute: readFixRoute(row),
      fixHint: readFixHint(row),
    };
  });
}

export interface BuildWorklistInput {
  assignments: OwnerAssignmentRow[];
  metrics: MetricCatalogRow[];
  submissions: SubmissionRow[];
  evidence: EvidenceRow[];
  registry: SourceRegistryRow[];
  /** True when the evidence read came back at EVIDENCE_SCAN_LIMIT. */
  evidenceTruncated?: boolean;
}

/**
 * The whole page in one pure function.
 *
 * Inheritance: a confirmed row with a NULL metric_code expands to every active
 * metric the catalog lists for that body. A confirmed row naming a metric
 * OVERRIDES the inherited entry for it, so nothing is ever listed twice and the
 * more specific assignment is the one shown.
 *
 * Nothing is ever dropped for being unrecognised: a confirmed assignment whose
 * metric_code is not in the catalog still appears (with its bare code), and a
 * body-wide assignment for a body the catalog knows no metrics for appears as a
 * single body-level row. An assignment that silently vanished would be worse
 * than one rendered thinly — the person would never know they were on the hook.
 */
export function buildWorklist(input: BuildWorklistInput): Worklist {
  const { assignments, metrics, submissions, evidence, registry } = input;
  const evidenceTruncated = input.evidenceTruncated === true;

  const metricsByBody = new Map<string, MetricCatalogRow[]>();
  for (const m of metrics) {
    const list = metricsByBody.get(m.metric_type) ?? [];
    list.push(m);
    metricsByBody.set(m.metric_type, list);
  }
  const metricByBodyCode = new Map<string, MetricCatalogRow>();
  for (const m of metrics) {
    const key = `${m.metric_type}|${m.metric_code}`;
    if (!metricByBodyCode.has(key)) metricByBodyCode.set(key, m);
  }

  const evidenceIndex = indexEvidence(evidence);

  const awaiting: AwaitingItem[] = [];
  let declinedCount = 0;

  // Deterministic order in, deterministic order out — two rows racing for the
  // same key must always resolve the same way.
  const sorted = [...assignments].sort((a, b) => a.id.localeCompare(b.id));

  const confirmed: OwnerAssignmentRow[] = [];
  for (const row of sorted) {
    const bucket = classifyAssignment(row.assignment_status);
    if (bucket === 'declined') {
      declinedCount += 1;
      continue;
    }
    if (bucket === 'awaiting') {
      awaiting.push({
        assignmentId: row.id,
        institutionId: row.institution_id,
        bodyCode: row.body_code,
        programmeId: row.programme_id,
        metricCode: row.metric_code,
        metricName:
          row.metric_code === null
            ? null
            : metricByBodyCode.get(`${row.body_code}|${row.metric_code}`)?.metric_name ?? null,
        previousOwnerUserId: row.previous_owner_user_id,
        ownerChangedAt: row.owner_changed_at,
      });
      continue;
    }
    confirmed.push(row);
  }

  const byKey = new Map<string, WorklistItem>();

  const put = (item: WorklistItem, isDirect: boolean) => {
    const existing = byKey.get(item.key);
    // A direct assignment always beats an inherited one for the same metric.
    if (existing && !(isDirect && existing.via === 'inherited')) return;
    byKey.set(item.key, item);
  };

  const makeItem = (
    row: OwnerAssignmentRow,
    metricCode: string | null,
    metric: MetricCatalogRow | undefined,
    via: WorklistItem['via'],
  ): WorklistItem => {
    const due = pickDueDate(submissions, row.institution_id, row.body_code);
    const ev = evidenceIndex.get(evidenceKey(row.institution_id, row.body_code, metricCode));
    return {
      key: itemKey(row.institution_id, row.body_code, row.programme_id, metricCode),
      assignmentId: row.id,
      institutionId: row.institution_id,
      bodyCode: row.body_code,
      programmeId: row.programme_id,
      metricCode,
      metricName: metric?.metric_name ?? null,
      category: metric?.category ?? null,
      via,
      dueDate: due?.dueDate ?? null,
      periodLabel: due?.periodLabel ?? null,
      evidenceCount: ev?.count ?? 0,
      evidenceCountIsFloor: evidenceTruncated,
      sources: resolveSources(ev?.sourceTables ?? [], registry),
    };
  };

  // Pass 1 — inherited (body-wide) assignments.
  for (const row of confirmed) {
    if (row.metric_code !== null) continue;
    const bodyMetrics = metricsByBody.get(row.body_code) ?? [];
    if (bodyMetrics.length === 0) {
      put(makeItem(row, null, undefined, 'body'), false);
      continue;
    }
    for (const metric of bodyMetrics) {
      put(makeItem(row, metric.metric_code, metric, 'inherited'), false);
    }
  }

  // Pass 2 — direct assignments, which override anything inherited above.
  for (const row of confirmed) {
    if (row.metric_code === null) continue;
    const metric = metricByBodyCode.get(`${row.body_code}|${row.metric_code}`);
    put(makeItem(row, row.metric_code, metric, 'direct'), true);
  }

  const owed = [...byKey.values()].sort((a, b) => {
    // Dated work first, soonest first; undated work after it.
    if (a.dueDate !== b.dueDate) {
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    if (a.bodyCode !== b.bodyCode) return a.bodyCode.localeCompare(b.bodyCode);
    return compareMetricCodes(a.metricCode, b.metricCode);
  });

  return {
    owed,
    awaiting,
    declinedCount,
    isEmpty: owed.length === 0 && awaiting.length === 0 && declinedCount === 0,
  };
}

/** Distinct metric codes to scan evidence for — keeps that read bounded. */
export function metricCodesToScan(items: WorklistItem[]): string[] {
  return [...new Set(items.map((i) => i.metricCode).filter((c): c is string => c !== null))].sort(
    compareMetricCodes,
  );
}

/**
 * How many days until a due date, relative to `today`. Negative means overdue.
 * Both sides are read as plain calendar dates so a timezone can never shift the
 * answer by a day.
 */
export function daysUntil(dueDate: string, today: string): number {
  const toUtc = (d: string) => {
    const [y, m, day] = d.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, (m ?? 1) - 1, day ?? 1);
  };
  return Math.round((toUtc(dueDate) - toUtc(today)) / 86_400_000);
}
