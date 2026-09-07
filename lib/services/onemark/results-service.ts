// lib/services/onemark/results-service.ts
//
// OneMark — Wave 3 Lane A. The results contract and every derived number.
//
// PURE MODULE, ON PURPOSE. Nothing here imports Supabase, React or Next.
// It is the single place that knows the shape of Lane S3's two jsonb RPCs —
// `fn_onemark_cohort_results(p_assessment_id)` and
// `fn_onemark_learner_report(p_student_id, p_exam_definition_id)` — so the
// routes stay thin and the shape can be unit-tested against fixtures. The
// RPCs are authored in a sibling lane and do not exist in the database while
// this file is written: every parser below is DEFENSIVE (missing key, null,
// wrong scalar type => a safe empty value, never a throw), so a payload that
// gains a field breaks nothing and a payload that loses one degrades to an
// honest empty state rather than a 500.
//
// Rulings this file carries:
//   #8  A question withdrawn after a sitting is shown with a withdrawn note
//       and scores are NEVER recomputed — `withdrawn` is a display flag only;
//       no aggregate in this file excludes a withdrawn item from a learner's
//       score, and nothing here recomputes a score from responses.
//   #9  Per-item statistics are hidden below the min-learners threshold; the
//       score list always shows. `itemStatsVisible()` is the only gate, and
//       it gates ONLY the item table.
//   #14 The CSV export carries learner names and scores and NEVER an answer
//       key or an explanation. `buildScoreListCsv` reads only the score list;
//       neither the cohort payload's item rows nor any answer text can reach
//       it — see the test that asserts the column set is closed.
//   #17 A sitting taken on a device is flagged (`taken_digitally`).

/* ------------------------------------------------------------------ *
 * Defensive scalar readers
 * ------------------------------------------------------------------ */

type Json = Record<string, unknown>;

function obj(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // Postgres numerics arrive over PostgREST as strings often enough to matter.
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function int(value: unknown, fallback = 0): number {
  const n = num(value);
  return n === null ? fallback : Math.trunc(n);
}

function bool(value: unknown): boolean {
  return value === true || value === 'true';
}

/** First present key wins — the RPC may name a field either way. */
function pick(source: Json, ...keys: string[]): unknown {
  for (const k of keys) {
    if (source[k] !== undefined && source[k] !== null) return source[k];
  }
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Cohort results — fn_onemark_cohort_results(p_assessment_id uuid)
 * ------------------------------------------------------------------ */

/** How a sitting stands. Anything the RPC sends that is not one of these is
 *  carried through as `unknown` rather than guessed at. */
export type SittingStatus = 'submitted' | 'in_progress' | 'not_started' | 'unknown';

/** A correct/total pair for one unit or one tag, as the RPC reports it. */
export interface ResultBucket {
  key: string;
  label: string;
  correct: number;
  total: number;
}

/** One line of the score list. */
export interface CohortLearnerResult {
  student_id: string;
  name: string;
  roll_no: string | null;
  /** Score as awarded at the sitting. Never recomputed here (ruling #8). */
  score: number | null;
  /** Questions on the paper. */
  max_score: number | null;
  submitted_at: string | null;
  status: SittingStatus;
  /** Decision 17 — sat on a device rather than on paper. */
  taken_digitally: boolean;
  per_unit: ResultBucket[];
  per_tag: ResultBucket[];
}

/** One row of the item table: how the cohort answered one question. */
export interface CohortItemResult {
  item_id: string;
  /** 1-based position on the paper when the RPC reports one. */
  position: number | null;
  unit_label: string | null;
  /** Fraction correct, 0..1. Null when nobody answered it. */
  p_value: number | null;
  answered: number;
  /** The wrong option the most learners chose. Option KEY only — never text. */
  top_distractor: { option_key: string; count: number } | null;
  /** Ruling #8 — withdrawn after the sitting; shown, never rescored. */
  withdrawn: boolean;
}

export interface CohortResults {
  assessment: {
    id: string;
    title: string;
    /** Needed to link a learner row to their report, which is per subject. */
    exam_definition_id: string | null;
    exam_key: string | null;
    exam_name: string | null;
    cohort_label: string | null;
    state: string | null;
  };
  learners_total: number;
  learners_sat: number;
  /** onemark.results.min_learners_for_item_stats as the server read it. */
  min_learners_for_item_stats: number;
  learners: CohortLearnerResult[];
  items: CohortItemResult[];
}

/** Ruling #9's code default. The live number is the platform policy row
 *  `onemark.results.min_learners_for_item_stats`, read server-side; this is
 *  the fallback for a payload that predates the row. */
export const MIN_LEARNERS_FOR_ITEM_STATS_DEFAULT = 3;

function parseStatus(value: unknown): SittingStatus {
  const s = (str(value) ?? '').toLowerCase();
  if (s === 'submitted' || s === 'finalized' || s === 'completed') return 'submitted';
  if (s === 'in_progress' || s === 'started') return 'in_progress';
  if (s === 'not_started' || s === '' || s === 'absent') return 'not_started';
  return 'unknown';
}

function parseBuckets(value: unknown): ResultBucket[] {
  return arr(value)
    .map((raw) => {
      const b = obj(raw);
      const key = str(pick(b, 'key', 'unit_id', 'topic_id', 'tag_key', 'id')) ?? '';
      if (!key) return null;
      return {
        key,
        label: str(pick(b, 'label', 'name', 'title')) ?? key,
        correct: int(pick(b, 'correct')),
        total: int(pick(b, 'total', 'attempted', 'count')),
      } satisfies ResultBucket;
    })
    .filter((b): b is ResultBucket => b !== null);
}

export function parseCohortResults(raw: unknown): CohortResults {
  const root = obj(raw);
  const a = obj(pick(root, 'assessment', 'paper'));
  const learners = arr(pick(root, 'learners', 'students', 'score_list'))
    .map((entry) => {
      const l = obj(entry);
      const student_id = str(pick(l, 'student_id', 'id')) ?? '';
      if (!student_id) return null;
      return {
        student_id,
        name: str(pick(l, 'name', 'full_name', 'learner_name')) ?? 'Name not recorded',
        roll_no: str(pick(l, 'roll_no', 'roll_number', 'admission_no')),
        score: num(pick(l, 'score', 'correct')),
        max_score: num(pick(l, 'max_score', 'out_of', 'total')),
        submitted_at: str(pick(l, 'submitted_at', 'finished_at')),
        status: parseStatus(pick(l, 'status')),
        taken_digitally: bool(pick(l, 'taken_digitally', 'is_digital', 'digital')),
        per_unit: parseBuckets(pick(l, 'per_unit', 'units')),
        per_tag: parseBuckets(pick(l, 'per_tag', 'tags')),
      } satisfies CohortLearnerResult;
    })
    .filter((l): l is CohortLearnerResult => l !== null);

  const items = arr(pick(root, 'items', 'questions'))
    .map((entry, index) => {
      const it = obj(entry);
      const item_id = str(pick(it, 'item_id', 'id')) ?? '';
      if (!item_id) return null;
      const distractor = obj(pick(it, 'top_distractor', 'top_wrong_option'));
      const optionKey = str(pick(distractor, 'option_key', 'key', 'option'));
      return {
        item_id,
        position: num(pick(it, 'position', 'qno', 'sort_order')) ?? index + 1,
        unit_label: str(pick(it, 'unit_label', 'topic_label', 'chapter')),
        p_value: num(pick(it, 'p_value', 'fraction_correct')),
        answered: int(pick(it, 'answered', 'responses')),
        top_distractor:
          optionKey === null ? null : { option_key: optionKey, count: int(pick(distractor, 'count', 'n')) },
        withdrawn: bool(pick(it, 'withdrawn', 'is_withdrawn')) || pick(it, 'is_active') === false,
      } satisfies CohortItemResult;
    })
    .filter((i): i is CohortItemResult => i !== null);

  const sat = num(pick(root, 'learners_sat', 'sat'));
  return {
    assessment: {
      id: str(pick(a, 'id', 'assessment_id')) ?? str(pick(root, 'assessment_id')) ?? '',
      title: str(pick(a, 'title')) ?? 'Untitled paper',
      exam_definition_id: str(pick(a, 'exam_definition_id', 'exam_id')),
      exam_key: str(pick(a, 'exam_key', 'config_key')),
      exam_name: str(pick(a, 'exam_name', 'subject')),
      cohort_label: str(pick(a, 'cohort_label', 'cohort', 'school_name')),
      state: str(pick(a, 'state', 'status')),
    },
    learners_total: int(pick(root, 'learners_total', 'total'), learners.length),
    learners_sat: sat === null ? learners.filter((l) => l.status === 'submitted').length : Math.trunc(sat),
    min_learners_for_item_stats: int(
      pick(root, 'min_learners_for_item_stats', 'item_stats_threshold'),
      MIN_LEARNERS_FOR_ITEM_STATS_DEFAULT,
    ),
    learners,
    items,
  };
}

/* ------------------------------------------------------------------ *
 * Derived numbers for the cohort sheet
 * ------------------------------------------------------------------ */

/** Ruling #9. The SCORE LIST is never gated by this — only the item table. */
export function itemStatsVisible(results: CohortResults): boolean {
  return results.learners_sat >= results.min_learners_for_item_stats;
}

/** Learners whose sitting is finished — the population every statistic uses. */
export function submittedLearners(results: CohortResults): CohortLearnerResult[] {
  return results.learners.filter((l) => l.status === 'submitted' && l.score !== null);
}

export interface CohortSummary {
  sat: number;
  total: number;
  /** Mean score of submitted sittings, rounded to one decimal. Null with none. */
  average: number | null;
  /** Mean score as a percentage of the paper, 0..100. Null when unknown. */
  average_pct: number | null;
  highest: number | null;
  lowest: number | null;
  max_score: number | null;
  digital: number;
}

export function summarize(results: CohortResults): CohortSummary {
  const sat = submittedLearners(results);
  const scores = sat.map((l) => l.score as number);
  const maxScore = sat.reduce<number | null>((acc, l) => (l.max_score !== null ? l.max_score : acc), null);
  const average = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  return {
    sat: results.learners_sat,
    total: results.learners_total,
    average,
    average_pct: average !== null && maxScore ? Math.round((average / maxScore) * 1000) / 10 : null,
    highest: scores.length ? Math.max(...scores) : null,
    lowest: scores.length ? Math.min(...scores) : null,
    max_score: maxScore,
    digital: sat.filter((l) => l.taken_digitally).length,
  };
}

export interface ScoreBand {
  label: string;
  from: number;
  to: number;
  count: number;
}

/** Score distribution over the paper's mark range, in `bandCount` equal bands.
 *  Returns [] when nothing has been sat or the paper length is unknown — the
 *  caller renders an empty state rather than an axis with no data. */
export function scoreDistribution(results: CohortResults, bandCount = 5): ScoreBand[] {
  const sat = submittedLearners(results);
  const maxScore = sat.reduce<number | null>((acc, l) => (l.max_score !== null ? l.max_score : acc), null);
  if (sat.length === 0 || !maxScore || maxScore <= 0 || bandCount <= 0) return [];
  const width = maxScore / bandCount;
  const bands: ScoreBand[] = Array.from({ length: bandCount }, (_, i) => {
    const from = Math.round(i * width * 10) / 10;
    const to = Math.round((i + 1) * width * 10) / 10;
    return { label: `${from}–${to}`, from, to, count: 0 };
  });
  for (const l of sat) {
    const score = l.score as number;
    // Top band is closed on both ends so a full score lands inside it.
    const idx = Math.min(bandCount - 1, Math.max(0, Math.floor(score / width)));
    bands[idx].count += 1;
  }
  return bands;
}

export interface StripRow {
  key: string;
  label: string;
  correct: number;
  total: number;
  /** 0..100, one decimal. Null when nothing was attempted in the bucket. */
  accuracy: number | null;
}

function rollUp(buckets: ResultBucket[][]): StripRow[] {
  const acc = new Map<string, StripRow>();
  for (const list of buckets) {
    for (const b of list) {
      const row = acc.get(b.key) ?? { key: b.key, label: b.label, correct: 0, total: 0, accuracy: null };
      row.correct += b.correct;
      row.total += b.total;
      // A later label wins only when the earlier one was the bare key.
      if (row.label === row.key && b.label !== b.key) row.label = b.label;
      acc.set(b.key, row);
    }
  }
  return Array.from(acc.values())
    .map((r) => ({ ...r, accuracy: r.total > 0 ? Math.round((r.correct / r.total) * 1000) / 10 : null }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Per-unit accuracy across every submitted sitting. */
export function unitStrip(results: CohortResults): StripRow[] {
  return rollUp(submittedLearners(results).map((l) => l.per_unit));
}

/** Per-tag accuracy across every submitted sitting. */
export function tagStrip(results: CohortResults): StripRow[] {
  return rollUp(submittedLearners(results).map((l) => l.per_tag));
}

/* ------------------------------------------------------------------ *
 * CSV export (ruling #14)
 * ------------------------------------------------------------------ */

/** The closed column set of the score-list export. Nothing about an answer,
 *  an option or an explanation is nameable here — see results-service.test. */
export const SCORE_LIST_CSV_COLUMNS = [
  'Learner name',
  'Roll number',
  'Score',
  'Out of',
  'Percentage',
  'Status',
  'Submitted at',
  'Taken digitally',
] as const;

/** RFC-4180 quoting plus the spreadsheet-formula guard: a cell that opens
 *  with = + - @ or a control character is prefixed with an apostrophe so a
 *  learner's name can never execute in Excel or Sheets. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const raw = String(value);
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

const STATUS_LABEL: Record<SittingStatus, string> = {
  submitted: 'Submitted',
  in_progress: 'In progress',
  not_started: 'Not started',
  unknown: 'Unknown',
};

/** The score list, and only the score list. No item row, no option key, no
 *  answer, no explanation is read by this function (ruling #14). */
export function buildScoreListCsv(results: CohortResults): string {
  const lines: string[] = [SCORE_LIST_CSV_COLUMNS.map((c) => csvCell(c)).join(',')];
  for (const l of results.learners) {
    const pct =
      l.score !== null && l.max_score !== null && l.max_score > 0
        ? String(Math.round((l.score / l.max_score) * 1000) / 10)
        : '';
    lines.push(
      [
        csvCell(l.name),
        csvCell(l.roll_no ?? ''),
        csvCell(l.score ?? ''),
        csvCell(l.max_score ?? ''),
        csvCell(pct),
        csvCell(STATUS_LABEL[l.status]),
        csvCell(l.submitted_at ?? ''),
        csvCell(l.taken_digitally ? 'Yes' : 'No'),
      ].join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** A filename a spreadsheet will accept on any of the three desktop OSes. */
export function scoreListFilename(results: CohortResults): string {
  const slug = (results.assessment.title || 'paper')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `onemark-scores-${slug || 'paper'}.csv`;
}

/* ------------------------------------------------------------------ *
 * Paper list — /foundation/onemark/results
 * ------------------------------------------------------------------ */

export interface ResultsPaperSummary {
  id: string;
  title: string;
  exam_key: string | null;
  cohort_label: string | null;
  state: string;
  question_count: number;
  sat: number;
  total: number;
  /** Mean score of submitted sittings, or null when nobody has sat it. */
  average: number | null;
  updated_at: string | null;
  /** True when this caller sees the paper through a school owner row alone. */
  via_school_owner: boolean;
}

/* ------------------------------------------------------------------ *
 * Learner report — fn_onemark_learner_report(p_student_id, p_exam_definition_id)
 * ------------------------------------------------------------------ */

export interface LearnerSitting {
  attempt_id: string;
  mode: string | null;
  score: number | null;
  max_score: number | null;
  taken_at: string | null;
  status: SittingStatus;
}

export interface LearnerReport {
  student: { id: string; name: string; roll_no: string | null; cohort_label: string | null };
  exam: { id: string; key: string | null; name: string | null };
  progress: {
    attempted: number;
    correct: number;
    /** 0..100, one decimal. Null when nothing has been attempted. */
    accuracy: number | null;
  };
  topics: StripRow[];
  vault: { active: number; mastered: number; next_due_at: string | null };
  /** Most recent first, capped by the RPC at ten. */
  sittings: LearnerSitting[];
}

export function parseLearnerReport(raw: unknown): LearnerReport {
  const root = obj(raw);
  const s = obj(pick(root, 'student', 'learner'));
  const e = obj(pick(root, 'exam', 'exam_definition'));
  const p = obj(pick(root, 'progress', 'summary'));
  const v = obj(pick(root, 'vault', 'mistake_vault'));

  const attempted = int(pick(p, 'attempted', 'total_attempted', 'answered'));
  const correct = int(pick(p, 'correct', 'total_correct'));
  const accuracyRaw = num(pick(p, 'accuracy', 'accuracy_pct'));
  const accuracy =
    accuracyRaw !== null
      ? Math.round((accuracyRaw <= 1 ? accuracyRaw * 100 : accuracyRaw) * 10) / 10
      : attempted > 0
        ? Math.round((correct / attempted) * 1000) / 10
        : null;

  const topics = arr(pick(root, 'topics', 'per_topic', 'units'))
    .map((entry) => {
      const t = obj(entry);
      const key = str(pick(t, 'topic_id', 'key', 'id')) ?? '';
      if (!key) return null;
      const total = int(pick(t, 'total', 'attempted'));
      const ok = int(pick(t, 'correct'));
      return {
        key,
        label: str(pick(t, 'label', 'name', 'title')) ?? key,
        correct: ok,
        total,
        accuracy: total > 0 ? Math.round((ok / total) * 1000) / 10 : null,
      } satisfies StripRow;
    })
    .filter((t): t is StripRow => t !== null);

  const sittings = arr(pick(root, 'sittings', 'attempts'))
    .map((entry) => {
      const a = obj(entry);
      const attempt_id = str(pick(a, 'attempt_id', 'id')) ?? '';
      if (!attempt_id) return null;
      return {
        attempt_id,
        mode: str(pick(a, 'mode')),
        score: num(pick(a, 'score', 'correct')),
        max_score: num(pick(a, 'max_score', 'out_of', 'total')),
        taken_at: str(pick(a, 'taken_at', 'submitted_at', 'started_at', 'created_at')),
        status: parseStatus(pick(a, 'status')),
      } satisfies LearnerSitting;
    })
    .filter((x): x is LearnerSitting => x !== null);

  return {
    student: {
      id: str(pick(s, 'id', 'student_id')) ?? '',
      name: str(pick(s, 'name', 'full_name')) ?? 'Name not recorded',
      roll_no: str(pick(s, 'roll_no', 'roll_number')),
      cohort_label: str(pick(s, 'cohort_label', 'cohort')),
    },
    exam: {
      id: str(pick(e, 'id', 'exam_definition_id')) ?? '',
      key: str(pick(e, 'key', 'config_key')),
      name: str(pick(e, 'name', 'title')),
    },
    progress: { attempted, correct, accuracy },
    topics,
    vault: {
      active: int(pick(v, 'active', 'active_count')),
      mastered: int(pick(v, 'mastered', 'mastered_count')),
      next_due_at: str(pick(v, 'next_due', 'next_due_at', 'next_eligible_at')),
    },
    sittings,
  };
}
