// File: lib/services/onemark/sources-analytics.ts
//
// OneMark — judging a question source after the real board paper is out.
//
// Director ruling (a) of 2026-09-06: "this source worked" means BOTH halves —
// its questions APPEARED in the real board paper, AND learners who practised it
// did better. One half alone proves nothing, so this file never lets a screen
// show one without the other.
//
// The arithmetic all happens in the database. `fn_onemark_source_analytics`
// (Lane S3, migration 20260919120000, NOT YET APPLIED) returns one row per
// source with items, servings, board hits and a median-split lift. This file is
// the CONTRACT side of that call: it parses the payload defensively, decides
// what may honestly be shown, and turns each number into a sentence.
//
// Why parse defensively rather than trust the RPC: the function does not exist
// in the database yet, and when it lands, a payload written by a newer migration
// must not crash an older page. Everything unknown becomes a null with a reason,
// never an exception and never a zero pretending to be a measurement.
//
// Pure functions only. Unit-tested in __tests__/onemark/sources-analytics.test.ts.

/** One source's row of `fn_onemark_source_analytics`.
 *  Lane S3 also publishes this shape as `OneMarkSourceAnalyticsRow` in
 *  `types/onemark.ts`; that file belongs to S3's PR, so this lane carries its
 *  own copy of the contract and the two are asserted equal by the tests. */
export interface SourceAnalyticsRow {
  /** null = the questions whose origin was never recorded. Kept, never dropped. */
  source_key: string | null;
  label: string;
  is_recorded: boolean;
  /** false = the source is retired. Shown greyed, never removed. */
  source_active: boolean;
  items_total: number;
  items_active: number;
  times_served: number;
  times_correct: number;
  /** times_correct / times_served, 0..1. null when nothing was ever served. */
  accuracy: number | null;
  hits_exact: number;
  hits_near: number;
  /** (exact + near) / active questions, for the chosen board year. */
  hit_rate: number | null;
  /** Median split on practice share. A CORRELATION, never a cause. */
  lift: number | null;
  lift_learners: number;
  lift_reason: string | null;
}

/** The whole payload of `fn_onemark_source_analytics(exam, year)`. */
export interface SourceAnalyticsPayload {
  exam_definition_id: string | null;
  /** null = every board year at once. */
  exam_year: number | null;
  /** `onemark.results.min_learners_for_item_stats` — 3 by ruling #9. */
  min_learners_for_item_stats: number;
  sources: SourceAnalyticsRow[];
  notes: { hit_rate: string; lift: string };
}

/** Ruling #9 of 2026-09-06. It OVERRIDES the 5 first written in Lane S3 item 6:
 *  below three learners, a difference between two groups is noise wearing a
 *  number's clothes. Used only when the payload omits the field. */
export const MIN_LEARNERS_FALLBACK = 3;

/** What each number can and cannot claim. Printed under the table verbatim —
 *  the honesty is the feature, so it is not left to whoever writes the page. */
export const ANALYTICS_FOOTNOTES = {
  hit_rate:
    'Board hits divided by the live questions from that source, for the board year chosen. It says how often this source turned up in the real paper — and nothing at all about whether anyone did better.',
  lift:
    'The gap in board-paper result between the learners who practised this source most and those who practised it least. It is a correlation, not a cause: someone who practises more may simply be someone who works harder.',
  unrecorded:
    'Questions whose origin was never recorded are their own row. They are counted, never hidden — until someone fills the origin in, they are the honest picture of the bank.',
  retired:
    'A retired source stays here with its history intact. Retiring hides it from the pickers; it never erases what it did.',
} as const;

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toNullableStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function parseRow(raw: unknown, fallbackUnrecordedLabel: string): SourceAnalyticsRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const sourceKey = typeof r.source_key === 'string' && r.source_key !== '' ? r.source_key : null;
  return {
    source_key: sourceKey,
    label: toNullableStr(r.label) ?? (sourceKey ?? fallbackUnrecordedLabel),
    // Derived, never trusted: `is_recorded` is only ever a restatement of
    // "source_key is not null", so reading it from the payload buys nothing and
    // risks a row that claims an origin it does not have.
    is_recorded: sourceKey !== null,
    source_active: r.source_active === undefined ? true : r.source_active !== false,
    items_total: toNum(r.items_total),
    items_active: toNum(r.items_active),
    times_served: toNum(r.times_served),
    times_correct: toNum(r.times_correct),
    accuracy: toNullableNum(r.accuracy),
    hits_exact: toNum(r.hits_exact),
    hits_near: toNum(r.hits_near),
    hit_rate: toNullableNum(r.hit_rate),
    lift: toNullableNum(r.lift),
    lift_learners: toNum(r.lift_learners),
    lift_reason: toNullableStr(r.lift_reason),
  };
}

/** Read whatever the RPC returned. Never throws: a malformed payload becomes an
 *  empty, honest one rather than a broken screen. */
export function parseSourceAnalytics(
  raw: unknown,
  opts: { unrecordedLabel?: string } = {},
): SourceAnalyticsPayload {
  const unrecordedLabel = opts.unrecordedLabel ?? 'source not recorded';
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawSources = Array.isArray(obj.sources) ? obj.sources : [];
  const sources = rawSources
    .map((r) => parseRow(r, unrecordedLabel))
    .filter((r): r is SourceAnalyticsRow => r !== null);
  const notes = obj.notes && typeof obj.notes === 'object' ? (obj.notes as Record<string, unknown>) : {};
  const min = toNullableNum(obj.min_learners_for_item_stats);
  return {
    exam_definition_id: toNullableStr(obj.exam_definition_id),
    exam_year: toNullableNum(obj.exam_year),
    min_learners_for_item_stats: min !== null && min >= 1 ? min : MIN_LEARNERS_FALLBACK,
    sources: sortAnalyticsRows(sources),
    notes: {
      hit_rate: toNullableStr(notes.hit_rate) ?? ANALYTICS_FOOTNOTES.hit_rate,
      lift: toNullableStr(notes.lift) ?? ANALYTICS_FOOTNOTES.lift,
    },
  };
}

/** Biggest live source first; the unrecorded bucket always last, whatever its
 *  size, because it is a gap in the record rather than a source. */
export function sortAnalyticsRows(rows: readonly SourceAnalyticsRow[]): SourceAnalyticsRow[] {
  return [...rows].sort((a, b) => {
    if (a.source_key === null && b.source_key !== null) return 1;
    if (b.source_key === null && a.source_key !== null) return -1;
    return b.items_active - a.items_active || (a.label ?? '').localeCompare(b.label ?? '');
  });
}

/** True when there is nothing to judge yet — no source has a live question.
 *  The screen renders a plain "nothing to judge yet" block, not an empty chart
 *  that looks like a measurement of zero. */
export function analyticsIsEmpty(payload: SourceAnalyticsPayload): boolean {
  return payload.sources.every((r) => r.items_active === 0 && r.items_total === 0);
}

/** True when the bank has questions but not one of them records an origin —
 *  production on 2026-09-07: 126 questions, no origin on any of them. */
export function everythingUnrecorded(payload: SourceAnalyticsPayload): boolean {
  const withOrigin = payload.sources.filter((r) => r.source_key !== null);
  const unrecorded = payload.sources.find((r) => r.source_key === null);
  return (
    (unrecorded?.items_total ?? 0) > 0 && withOrigin.every((r) => r.items_total === 0)
  );
}

function pct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

/** "3 of 12 (25%)", or the reason there is no rate. */
export function formatHitRate(row: SourceAnalyticsRow): string {
  const hits = row.hits_exact + row.hits_near;
  if (row.items_active === 0) {
    return row.items_total > 0
      ? 'no live questions — every question from this source is still a draft'
      : 'no questions from this source yet';
  }
  if (row.hit_rate === null) return 'not measurable';
  return `${hits} of ${row.items_active} (${pct(row.hit_rate)})`;
}

/** The lift, or the sentence explaining why there isn't one. Ruling #9's floor
 *  is applied HERE too, not only in the database, so a payload from a database
 *  where the policy row is missing still refuses to show a two-learner "trend". */
export function formatLift(row: SourceAnalyticsRow, minLearners: number): string {
  if (row.lift === null || row.lift_learners < minLearners) {
    return (
      row.lift_reason ??
      `not shown — ${row.lift_learners} of the ${minLearners} learners needed have both practised this source and sat a board-format paper`
    );
  }
  const sign = row.lift > 0 ? '+' : '';
  return `${sign}${pct(row.lift, 1)} on the paper`;
}

/** "78% (1,204 of 1,544)", or why there is no accuracy. */
export function formatAccuracy(row: SourceAnalyticsRow): string {
  if (row.times_served === 0) return 'never served yet';
  if (row.accuracy === null) return 'not measurable';
  return `${pct(row.accuracy)} (${row.times_correct.toLocaleString()} of ${row.times_served.toLocaleString()})`;
}

/** Whether a lift number may be printed at all. The single place that decides. */
export function liftIsVisible(row: SourceAnalyticsRow, minLearners: number): boolean {
  return row.lift !== null && row.lift_learners >= minLearners;
}

/** One bar per source for the chart: hit rate against practice accuracy, the
 *  two halves of ruling (a) side by side. Sources with no live questions are
 *  left out of the CHART (a bar of nothing is a lie) but stay in the table. */
export interface SourceChartDatum {
  key: string;
  label: string;
  is_recorded: boolean;
  source_active: boolean;
  items_active: number;
  /** 0..100, or null when there is no rate. */
  hit_rate_pct: number | null;
  accuracy_pct: number | null;
}

export function chartData(payload: SourceAnalyticsPayload): SourceChartDatum[] {
  return payload.sources
    .filter((r) => r.items_active > 0)
    .map((r) => ({
      key: r.source_key ?? '__unrecorded__',
      label: r.label,
      is_recorded: r.is_recorded,
      source_active: r.source_active,
      items_active: r.items_active,
      hit_rate_pct: r.hit_rate === null ? null : Math.round(r.hit_rate * 1000) / 10,
      accuracy_pct: r.accuracy === null ? null : Math.round(r.accuracy * 1000) / 10,
    }));
}

/** The one-line verdict, and it refuses to give one on half the evidence —
 *  ruling (a) says a source worked only if BOTH halves say so. */
export function sourceVerdict(
  row: SourceAnalyticsRow,
  minLearners: number,
): { tone: 'worked' | 'mixed' | 'weak' | 'unproven'; text: string } {
  const hasHits = row.hits_exact + row.hits_near > 0;
  const hasLift = liftIsVisible(row, minLearners);
  if (!hasLift) {
    return {
      tone: 'unproven',
      text: hasHits
        ? 'Its questions turned up in the real paper. Whether practising it helped is not measurable yet.'
        : 'Not enough evidence either way yet.',
    };
  }
  const liftUp = (row.lift ?? 0) > 0;
  if (hasHits && liftUp) {
    return { tone: 'worked', text: 'Turned up in the real paper, and the learners who practised it did better.' };
  }
  if (hasHits && !liftUp) {
    return { tone: 'mixed', text: 'Turned up in the real paper, but practising it tracked no better result.' };
  }
  if (!hasHits && liftUp) {
    return { tone: 'mixed', text: 'The learners who practised it did better, but none of its questions turned up in the real paper.' };
  }
  return { tone: 'weak', text: 'Neither half holds: no board hits, and no better result for practising it.' };
}
