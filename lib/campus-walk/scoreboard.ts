// lib/campus-walk/scoreboard.ts
// ============================================================================
// Campus Walk — the three scoreboards (D9, D12, D13), as pure functions.
//
// Spec: specs/campus-walk-2026-08-17.md. Every read this module shapes comes
// from `project_tasks` under the standing CAMPUS-OPS project, which is where
// lib/services/campus-walk/campus-walk-service.ts already writes.
//
// ── WHY THE LOGIC IS IN HERE AND NOT IN THE PAGES ───────────────────────────
// Three separate routes render these boards, and the rules they enforce are
// the kind that must be provable rather than eyeballed: "no individual is ever
// counted", "a day with no reading is not a zero", "a department is not blamed
// for time it did not control". Pure in / pure out means __tests__ can assert
// each of those directly, with no database and no rendering.
//
// ── GUARDRAIL G1 ────────────────────────────────────────────────────────────
// Nothing here reads, writes or names `grievance_tickets`. Campus conditions
// never touch that table — it holds confidential ICC/ragging complaints and it
// backs an HOD performance score (20260722200000) plus the NAAC/UGC grievance
// export. That is the whole reason this lane rides project_tasks.
//
// ── GUARDRAIL G2 ────────────────────────────────────────────────────────────
// The fixing board and the coverage board are built by two different functions
// with two different return types, consumed by two different routes. There is
// deliberately no function here that returns both, so no caller can assemble a
// combined dashboard by accident. Hunters and hunted are never on one screen.
// ============================================================================

// ── Constants that carry a ruling ────────────────────────────────────────────

/**
 * D12. The Director's standing objective, quoted in §5 of the spec. Personal
 * health data stays out of this repository — this number is the objective
 * itself and nothing more. No body measurement, lab value or calorie target
 * belongs anywhere near this file.
 */
export const STEP_GOAL_PER_DAY = 20_000;

/**
 * The last date on which the wearable source of record produced a step
 * reading, established 2026-09-03 by reading that source's own sync log.
 *
 * ── THIS IS NOT A MEASUREMENT MyJKKN MADE, AND THE UI MUST SAY SO ──────────
 * MyJKKN is a deployed web application. It cannot read the Director's local
 * machine, the vault the sync job writes into, or the wearable's API. The date
 * is carried here so the empty state can be specific instead of vague, and it
 * is rendered with an explicit "recorded outside MyJKKN" label everywhere it
 * appears.
 *
 * ── AND IT MEANS "NO READING WAS TAKEN", NOT "SOMETHING BROKE" ─────────────
 * Verified 2026-09-03: the sync job is alive and ran successfully that
 * morning, the API token is valid, and fresh responses were cached for
 * 2026-09-01/02/03. Its own log line for that run is "0 written, 3 days with
 * no ring data"; an August backfill logged "163 written, 99 days with no ring
 * data". The device stopped producing readings. The software did not fail.
 *
 * Every string this module produces about the gap must preserve that
 * distinction. "The feed is broken" would point at an engineer; "no readings
 * have been taken" points at the ring. Only the second one is true, and
 * getting it backwards would misreport the Director's own activity — which is
 * the precise failure D12 exists to prevent.
 */
export const LAST_READING_DATE_OUTSIDE_MYJKKN = '2026-04-18';

/**
 * D13. How many reports of one problem make it a system-gap candidate.
 *
 * The spec leaves this open ("Threshold not yet set — see open items"), so
 * three is a choice made here, not a ruling handed down. Three is the smallest
 * number that cannot be a coincidence: twice is bad luck, three times is a
 * pattern. It is exported and named so changing it is a one-line edit and so
 * the UI can state the rule in words rather than implying a hidden algorithm.
 *
 * Nothing in this module promotes anything. It surfaces candidates for a human
 * to confirm — the spec is explicit that unattended promotion would spawn
 * dozens of projects.
 */
export const SYSTEM_GAP_CANDIDATE_THRESHOLD = 3;

/**
 * D9 / guardrail G2. A department row is only shown separately when at least
 * this many DISTINCT people in it have been the accountable owner of a campus
 * walk task.
 *
 * The ruling is "departments, never named people". A department with exactly
 * one fixer defeats that by arithmetic: the row is that person's personal
 * record with a department's name on it, and everyone on campus knows who it
 * is. Those departments are folded into one aggregate row instead — their
 * work is still counted in the totals, it is simply not attributable.
 */
export const MIN_DISTINCT_FIXERS_TO_SHOW_A_DEPARTMENT = 2;

/**
 * D12 area coverage. Decimal places a latitude/longitude is rounded to before
 * two observations are called "the same place".
 *
 * Three places is roughly a 110 m square at this campus's latitude (~11.4°N),
 * which is about one building. Coarser would merge separate blocks; finer
 * would make two photos of the same corridor look like two different areas
 * because a phone's GPS fix moved.
 */
export const AREA_CELL_DECIMALS = 3;

/** Statuses in which a task is finished or abandoned, not waiting on anyone. */
const TERMINAL_STATUSES = new Set(['done', 'cancelled', 'archived']);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── Row shapes ───────────────────────────────────────────────────────────────

/**
 * The subset of `project_tasks` these boards read. Deliberately narrow: the
 * fixing board must not be able to reach a person's name even by accident, so
 * the type it consumes does not have one.
 */
export interface WalkTaskRow {
  id: string;
  title: string;
  status_key: string;
  is_blocked: boolean;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  owner_staff_id: string | null;
  metadata: Record<string, any> | null;
}

/**
 * staff.id -> the department that staff member belongs to.
 *
 * Only the department. The caller builds this from `staff` selecting
 * `id, department_id` and nothing else — no first_name, no last_name, no
 * email — so there is no name in scope on the fixing board's page at all.
 */
export interface StaffDepartment {
  departmentId: string | null;
  departmentName: string | null;
}

export type StaffDepartmentIndex = Map<string, StaffDepartment>;

// ── Predicates over one task ─────────────────────────────────────────────────

/** A row this lane owns. Anything else is somebody else's project task. */
export function isCampusWalkTask(row: WalkTaskRow): boolean {
  return (row.metadata ?? {}).source === 'campus-walk';
}

/** D13. `metadata.kind`, defaulting to the overwhelmingly common case. */
export function walkKindOf(row: WalkTaskRow): 'symptom' | 'system_gap' {
  return (row.metadata ?? {}).kind === 'system_gap' ? 'system_gap' : 'symptom';
}

/**
 * D4 + G5. A closure only counts when a fix photo was approved — not when the
 * status column happens to read 'done'.
 *
 * Both halves are required on purpose. `status_key === 'done'` alone would
 * count a task somebody closed straight from the project board without any
 * photograph, and the whole product claim is that closure is verified.
 */
export function isVerifiedClosure(row: WalkTaskRow): boolean {
  const approval = (row.metadata ?? {}).fix?.approval;
  return row.status_key === 'done' && approval?.state === 'approved';
}

/**
 * Waiting on the Director's decision, not on the department. Counted and shown
 * separately so time spent in the approval queue is never scored against the
 * people who already did the work.
 */
export function isAwaitingApproval(row: WalkTaskRow): boolean {
  return (row.metadata ?? {}).fix?.approval?.state === 'awaiting_approval';
}

/** Still live work: neither closed nor cancelled nor archived. */
export function isOpen(row: WalkTaskRow): boolean {
  return !TERMINAL_STATUSES.has(row.status_key);
}

/**
 * D8. Days the SLA clock was stopped because the fix needed money, or the
 * assignee was on approved leave. Subtracted from every duration this module
 * reports — a department must not look slow for a wait it could not end.
 */
export function pausedDays(row: WalkTaskRow): number {
  const n = Number((row.metadata ?? {}).sla?.paused_days_total ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * When the clock started for the CURRENT round of work.
 *
 * D7 reopens the original task rather than filing a new one, so `created_at`
 * on a thing reported nine times is the date of the first report, months ago.
 * Measuring from there would report a fictitious nine-month fix. The latest
 * entry in `metadata.occurrences` is the real start of the round that just
 * closed.
 */
export function roundStartedAt(row: WalkTaskRow): string {
  const occurrences = (row.metadata ?? {}).occurrences;
  if (Array.isArray(occurrences) && occurrences.length > 0) {
    const last = occurrences[occurrences.length - 1];
    if (last && typeof last.at === 'string') return last.at;
  }
  return row.created_at;
}

/**
 * Working days between the round starting and the closure being approved,
 * minus paused days. Null when the task is not a verified closure or either
 * timestamp is unusable — never a zero standing in for "unknown".
 */
export function daysToVerifiedClosure(row: WalkTaskRow): number | null {
  if (!isVerifiedClosure(row) || !row.completed_at) return null;
  const start = Date.parse(roundStartedAt(row));
  const end = Date.parse(row.completed_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const raw = (end - start) / MS_PER_DAY;
  return Math.max(0, Math.round((raw - pausedDays(row)) * 10) / 10);
}

/** The UTC calendar day as YYYY-MM-DD, for comparing against a stored date. */
function calendarDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Open, and its due DAY is already behind us.
 *
 * ── WHY THIS COMPARES DAYS AND NOT INSTANTS ─────────────────────────────────
 * `due_date` is written as a plain calendar day (campus-walk-service does
 * `.toISOString().slice(0, 10)`), and a job due today is not late until today
 * is over. Parsing that day as an instant makes it midnight UTC, so a
 * same-day comparison marks the job overdue from the moment it is filed.
 *
 * That is not a rounding nit on this board. D6 gives an UNSAFE condition a
 * 0-day due date — due today, on purpose — so instant comparison would show
 * every urgent job as already late the second it was reported, and the
 * "past its date" column exists to be fair about exactly this.
 */
export function isOverdue(row: WalkTaskRow, now: Date): boolean {
  if (!isOpen(row) || !row.due_date) return false;
  // String comparison is correct for both shapes this column takes: a plain
  // 'YYYY-MM-DD' and an ISO timestamp both order correctly against a day, and
  // a timestamp on the due day sorts after the bare day so it is not counted.
  return row.due_date < calendarDay(now);
}

/** Median, not mean: one pathological ticket must not define a department. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  return Math.round(m * 10) / 10;
}

// ── D9 — the fixing board ────────────────────────────────────────────────────

export interface FixBoardRow {
  /** Stable key for React. A department id, or one of the two bucket sentinels. */
  key: string;
  departmentName: string;
  /** True for the two aggregate buckets, which are not real departments. */
  isBucket: boolean;
  /** Plain-language reason a bucket exists, shown on the row itself. */
  bucketReason: string | null;
  verifiedClosures: number;
  openJobs: number;
  overdueJobs: number;
  /** Waiting on the Director — explicitly not the department's delay. */
  awaitingApproval: number;
  /** Waiting on money or a returning colleague — D8, also not their delay. */
  blockedJobs: number;
  /** Median days from report to approved closure, paused time removed. */
  medianDaysToClose: number | null;
}

export interface FixBoard {
  rows: FixBoardRow[];
  totals: {
    verifiedClosures: number;
    openJobs: number;
    overdueJobs: number;
    awaitingApproval: number;
    blockedJobs: number;
    medianDaysToClose: number | null;
  };
  /** How many departments were folded into the too-few-fixers bucket. */
  suppressedDepartmentCount: number;
}

const UNASSIGNED_KEY = '__unassigned__';
const TOO_FEW_KEY = '__too_few_fixers__';

/**
 * D9 — who is fixing campus conditions, and how fast, BY DEPARTMENT.
 *
 * ── THE RULING THIS FUNCTION ENFORCES ───────────────────────────────────────
 * Departments, never named people. Not in a column, not in a sort key, not in
 * a tooltip, not in anything a caller could serialise. `WalkTaskRow` carries
 * `owner_staff_id` because that is the only way to find a department at all;
 * that id is consumed here and never appears in the return type. A caller that
 * renders `FixBoard` cannot show an individual because it has not been given
 * one.
 *
 * ── AND THE ARITHMETIC LOOPHOLE IT CLOSES ───────────────────────────────────
 * A department with one fixer is an individual wearing a department's name.
 * Those rows are folded into a single "too few people to report separately"
 * bucket. The work still counts in the totals; it is just not attributable.
 * See MIN_DISTINCT_FIXERS_TO_SHOW_A_DEPARTMENT.
 *
 * ── WHY THE FAIRNESS COLUMNS ARE NOT OPTIONAL (guardrail G1) ────────────────
 * Guardrail G1 names the harm: housekeeping and maintenance staff are the
 * lowest-power people on campus and the easiest to make look bad with a chart.
 * A board showing only "closures" and "overdue" would blame a department for
 * every day a ticket sat in the Director's approval queue or waited on a
 * budget decision. Those two counts are therefore first-class columns, and the
 * duration already has paused days subtracted.
 */
export function buildFixBoard(
  rows: WalkTaskRow[],
  staffDepartments: StaffDepartmentIndex,
  now: Date = new Date()
): FixBoard {
  interface Acc {
    departmentName: string;
    fixerIds: Set<string>;
    verifiedClosures: number;
    openJobs: number;
    overdueJobs: number;
    awaitingApproval: number;
    blockedJobs: number;
    durations: number[];
  }

  const byDept = new Map<string, Acc>();
  const walkRows = rows.filter(isCampusWalkTask);

  const acc = (key: string, name: string): Acc => {
    let a = byDept.get(key);
    if (!a) {
      a = {
        departmentName: name,
        fixerIds: new Set(),
        verifiedClosures: 0,
        openJobs: 0,
        overdueJobs: 0,
        awaitingApproval: 0,
        blockedJobs: 0,
        durations: []
      };
      byDept.set(key, a);
    }
    return a;
  };

  for (const row of walkRows) {
    const staffId = row.owner_staff_id;
    const dept = staffId ? staffDepartments.get(staffId) : undefined;
    const key = dept?.departmentId ?? UNASSIGNED_KEY;
    const name =
      dept?.departmentName ??
      (key === UNASSIGNED_KEY ? 'Not yet assigned to a department' : 'Unnamed department');

    const a = acc(key, name);
    if (staffId) a.fixerIds.add(staffId);

    if (isVerifiedClosure(row)) {
      a.verifiedClosures += 1;
      const d = daysToVerifiedClosure(row);
      if (d !== null) a.durations.push(d);
    }
    if (isOpen(row)) {
      a.openJobs += 1;
      if (isOverdue(row, now)) a.overdueJobs += 1;
      if (row.is_blocked) a.blockedJobs += 1;
      if (isAwaitingApproval(row)) a.awaitingApproval += 1;
    }
  }

  // Fold every department too small to name into one bucket, so nothing is
  // dropped and nobody is identifiable.
  const named: Array<[string, Acc]> = [];
  const foldable: Acc[] = [];
  for (const [key, a] of byDept) {
    if (key === UNASSIGNED_KEY) {
      named.push([key, a]);
    } else if (a.fixerIds.size < MIN_DISTINCT_FIXERS_TO_SHOW_A_DEPARTMENT) {
      foldable.push(a);
    } else {
      named.push([key, a]);
    }
  }

  const toRow = (key: string, a: Acc): FixBoardRow => ({
    key,
    departmentName: a.departmentName,
    isBucket: key === UNASSIGNED_KEY || key === TOO_FEW_KEY,
    bucketReason:
      key === UNASSIGNED_KEY
        ? 'These jobs have no owner yet, or their owner is not recorded against a department.'
        : key === TOO_FEW_KEY
          ? 'Too few different people have worked on campus jobs in these departments to report them separately without identifying someone.'
          : null,
    verifiedClosures: a.verifiedClosures,
    openJobs: a.openJobs,
    overdueJobs: a.overdueJobs,
    awaitingApproval: a.awaitingApproval,
    blockedJobs: a.blockedJobs,
    medianDaysToClose: median(a.durations)
  });

  const boardRows: FixBoardRow[] = named.map(([key, a]) => toRow(key, a));

  if (foldable.length > 0) {
    const merged: Acc = {
      departmentName: 'Departments with too few people to report separately',
      fixerIds: new Set(),
      verifiedClosures: 0,
      openJobs: 0,
      overdueJobs: 0,
      awaitingApproval: 0,
      blockedJobs: 0,
      durations: []
    };
    for (const a of foldable) {
      merged.verifiedClosures += a.verifiedClosures;
      merged.openJobs += a.openJobs;
      merged.overdueJobs += a.overdueJobs;
      merged.awaitingApproval += a.awaitingApproval;
      merged.blockedJobs += a.blockedJobs;
      merged.durations.push(...a.durations);
    }
    boardRows.push(toRow(TOO_FEW_KEY, merged));
  }

  // Real departments first, most verified closures first. The two buckets sink
  // to the bottom — they are context, not competitors.
  boardRows.sort((a, b) => {
    if (a.isBucket !== b.isBucket) return a.isBucket ? 1 : -1;
    if (b.verifiedClosures !== a.verifiedClosures) return b.verifiedClosures - a.verifiedClosures;
    return a.departmentName.localeCompare(b.departmentName);
  });

  const allDurations: number[] = [];
  for (const a of byDept.values()) allDurations.push(...a.durations);

  return {
    rows: boardRows,
    totals: {
      verifiedClosures: boardRows.reduce((n, r) => n + r.verifiedClosures, 0),
      openJobs: boardRows.reduce((n, r) => n + r.openJobs, 0),
      overdueJobs: boardRows.reduce((n, r) => n + r.overdueJobs, 0),
      awaitingApproval: boardRows.reduce((n, r) => n + r.awaitingApproval, 0),
      blockedJobs: boardRows.reduce((n, r) => n + r.blockedJobs, 0),
      medianDaysToClose: median(allDurations)
    },
    suppressedDepartmentCount: foldable.length
  };
}

// ── D12 — steps and area coverage ────────────────────────────────────────────

/** One day's reading, as MyJKKN holds it. Absent day = absent row, never a 0. */
export interface StepDay {
  step_date: string; // YYYY-MM-DD
  steps: number;
  source: string;
  recorded_at: string;
}

export type StepFeedState =
  /** MyJKKN has never received a single reading. Nothing feeds it yet. */
  | 'never_reported'
  /** Readings exist, but the most recent one is older than today. */
  | 'stale'
  /** A reading exists for today. */
  | 'current';

export interface StepFeedHealth {
  state: StepFeedState;
  /** Latest reading MyJKKN actually holds. Null when there are none. */
  latestReadingDate: string | null;
  daysSinceLatestReading: number | null;
  /**
   * Last date the wearable source of record produced a reading, as established
   * outside MyJKKN. Rendered with that provenance stated, never as a
   * measurement.
   */
  lastReadingDateOutsideMyJKKN: string;
  /**
   * One sentence for the screen. Says "no readings have been taken", never
   * "the feed is broken" — see LAST_READING_DATE_OUTSIDE_MYJKKN for why that
   * distinction is load-bearing.
   */
  headline: string;
  detail: string;
}

function daysBetweenDates(fromISODate: string, to: Date): number | null {
  const from = Date.parse(`${fromISODate}T00:00:00Z`);
  if (!Number.isFinite(from)) return null;
  const toUtcMidnight = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(0, Math.round((toUtcMidnight - from) / MS_PER_DAY));
}

/**
 * What MyJKKN can honestly say about the step feed right now.
 *
 * ── THE ONE THING THIS FUNCTION EXISTS TO PREVENT ───────────────────────────
 * Rendering a zero, or a flat empty chart, for a day nobody took a reading. A
 * zero is a claim that the Director did not walk. An absent reading is a claim
 * that nobody measured. Those are different facts and only the second one is
 * true, so this returns an explicit state the UI must branch on rather than a
 * number the UI can accidentally plot.
 *
 * ── AND THE SECOND THING ────────────────────────────────────────────────────
 * "No readings since 2026-04-18" must not be phrased as a broken pipeline. The
 * sync job that has historically written these readings was verified alive on
 * 2026-09-03 — it ran that morning, its token is valid, and it logged "0
 * written, 3 days with no ring data". The wearable stopped producing readings.
 * Saying "the feed is down" would send somebody to debug working software and
 * would quietly excuse a gap that is not a software gap.
 */
export function describeStepFeed(stepDays: StepDay[], now: Date = new Date()): StepFeedHealth {
  const sorted = [...stepDays].sort((a, b) => a.step_date.localeCompare(b.step_date));
  const latest = sorted[sorted.length - 1] ?? null;

  if (!latest) {
    return {
      state: 'never_reported',
      latestReadingDate: null,
      daysSinceLatestReading: null,
      lastReadingDateOutsideMyJKKN: LAST_READING_DATE_OUTSIDE_MYJKKN,
      headline: 'No step readings have reached MyJKKN yet.',
      detail:
        'Nothing sends step readings to MyJKKN at the moment, so there is no daily count to show. ' +
        `Separately, and recorded outside MyJKKN: the wearable that has produced these readings in the past last recorded one on ${LAST_READING_DATE_OUTSIDE_MYJKKN}. ` +
        'It has produced none since, which means no reading was taken. The program that collects them was checked on 3 September 2026 and is running normally.'
    };
  }

  const gap = daysBetweenDates(latest.step_date, now);
  const todayISO = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

  if (latest.step_date >= todayISO) {
    return {
      state: 'current',
      latestReadingDate: latest.step_date,
      daysSinceLatestReading: 0,
      lastReadingDateOutsideMyJKKN: LAST_READING_DATE_OUTSIDE_MYJKKN,
      headline: `Today's reading is in: ${latest.steps.toLocaleString('en-IN')} steps.`,
      detail: 'Days without a reading are shown as "no reading", never as zero.'
    };
  }

  return {
    state: 'stale',
    latestReadingDate: latest.step_date,
    daysSinceLatestReading: gap,
    lastReadingDateOutsideMyJKKN: LAST_READING_DATE_OUTSIDE_MYJKKN,
    headline: `No step reading has been recorded since ${latest.step_date}.`,
    detail:
      gap === null
        ? 'A reading has not arrived for today.'
        : `That is ${gap} day${gap === 1 ? '' : 's'} with no reading taken. Days without a reading are left blank rather than counted as zero, because a blank means nobody measured — not that nobody walked.`
  };
}

/**
 * Which ~110 m square an observation was taken in, or null when the capture
 * screen could not get a location fix.
 *
 * Null is a real and common answer — the capture screen saves the observation
 * anyway when GPS fails — and it is counted and shown, never quietly dropped
 * into a "0 areas" figure.
 */
export function areaCellKey(geo: unknown): string | null {
  if (!geo || typeof geo !== 'object') return null;
  const g = geo as { lat?: unknown; lng?: unknown };
  const lat = Number(g.lat);
  const lng = Number(g.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `${lat.toFixed(AREA_CELL_DECIMALS)},${lng.toFixed(AREA_CELL_DECIMALS)}`;
}

export interface CoverageBoard {
  feed: StepFeedHealth;
  goalPerDay: number;
  /** Only days MyJKKN actually holds a reading for. Never padded. */
  days: Array<{ date: string; steps: number; metGoal: boolean }>;
  daysWithAReading: number;
  daysMeetingGoal: number;
  /** Median steps across days that have a reading. Null when there are none. */
  medianStepsOnDaysWithAReading: number | null;
  coverage: {
    observations: number;
    /** Distinct ~110 m squares an observation was recorded in. */
    distinctAreas: number;
    /** Observations saved without a location fix — counted, not hidden. */
    observationsWithoutLocation: number;
    /** Distinct colleges touched, from metadata.institution_id. */
    distinctInstitutions: number;
    /** Distinct condition categories seen. */
    distinctCategories: number;
  };
}

/**
 * D12 — the walking board. Steps against the 20,000 objective, plus how much
 * of the campus the walk actually reached.
 *
 * Steps and area coverage are the only two things recorded (spec §5). Body
 * measurements, lab values, calorie targets and diet plans live in the
 * Director's private vault and must never be written into MyJKKN.
 *
 * The step half and the coverage half come from completely different places —
 * steps from readings sent in to `campus_walk_step_days`, coverage from the
 * observations the module already records — so the step half being empty must
 * never blank the coverage half. They are computed independently here for
 * exactly that reason.
 */
export function buildCoverageBoard(
  rows: WalkTaskRow[],
  stepDays: StepDay[],
  now: Date = new Date()
): CoverageBoard {
  const walkRows = rows.filter(isCampusWalkTask);

  const areas = new Set<string>();
  const institutions = new Set<string>();
  const categories = new Set<string>();
  let withoutLocation = 0;

  for (const row of walkRows) {
    const meta = row.metadata ?? {};
    const cell = areaCellKey(meta.geo);
    if (cell) areas.add(cell);
    else withoutLocation += 1;
    if (typeof meta.institution_id === 'string' && meta.institution_id) {
      institutions.add(meta.institution_id);
    }
    if (typeof meta.category === 'string' && meta.category.trim()) {
      categories.add(meta.category.trim().toLowerCase());
    }
  }

  const days = [...stepDays]
    .sort((a, b) => a.step_date.localeCompare(b.step_date))
    .map((d) => ({
      date: d.step_date,
      steps: d.steps,
      metGoal: d.steps >= STEP_GOAL_PER_DAY
    }));

  return {
    feed: describeStepFeed(stepDays, now),
    goalPerDay: STEP_GOAL_PER_DAY,
    days,
    daysWithAReading: days.length,
    daysMeetingGoal: days.filter((d) => d.metGoal).length,
    medianStepsOnDaysWithAReading: median(days.map((d) => d.steps)),
    coverage: {
      observations: walkRows.length,
      distinctAreas: areas.size,
      observationsWithoutLocation: withoutLocation,
      distinctInstitutions: institutions.size,
      distinctCategories: categories.size
    }
  };
}

// ── D13 — the symptom / system split ─────────────────────────────────────────

export interface RepeatingSymptom {
  taskId: string;
  title: string;
  category: string | null;
  occurrenceCount: number;
  statusKey: string;
}

export interface CategoryCluster {
  category: string;
  symptomCount: number;
  /** True when somebody has already raised a system gap in this category. */
  hasSystemGap: boolean;
}

export interface SplitBoard {
  symptomCount: number;
  systemGapCount: number;
  /** One task reported this many times or more — the D7 recurrence signal. */
  repeatingSymptoms: RepeatingSymptom[];
  /**
   * Categories where enough separate symptoms have piled up to suggest one
   * shared cause, and where nobody has raised a system gap yet.
   */
  candidateClusters: CategoryCluster[];
  threshold: number;
}

/**
 * D13 — how many of these are one action, and how many are a missing system.
 *
 * ── WHAT WAS ALREADY THERE, AND WHAT IS NEW ─────────────────────────────────
 * The distinction is already stored: `metadata.kind` is written at intake by
 * campus-walk-service and is one of 'symptom' | 'system_gap'. Nothing new is
 * recorded here and no column is added. This function only counts what the
 * capture screen has been writing since the module shipped.
 *
 * ── THE PART THAT EARNS THE SCREEN ──────────────────────────────────────────
 * "A run of symptoms sharing a cause becomes visible as a system gap." Two
 * different runs exist in the data and both are surfaced:
 *
 *   1. ONE PROBLEM, REPEATEDLY. D7 reopens the original task and increments
 *      `metadata.occurrence_count`, so "Block C — 9th time" is a single row
 *      with a number on it.
 *   2. MANY PROBLEMS, ONE CAUSE. Several separate symptoms in one category
 *      with no system gap raised against that category is the cheaper and
 *      more common signal, and it is invisible on any per-task view because
 *      no single row looks wrong.
 *
 * ── AND WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────
 * It promotes nothing. The spec is explicit that a system which silently
 * spawns projects will spawn dozens; this surfaces candidates with their
 * evidence and a human decides. It also does no fuzzy matching — the clusters
 * are exact category matches, because lib/campus-walk/repeats.ts already
 * refused to guess which tickets are "the same" and this must not reintroduce
 * that guess through a side door.
 */
export function buildSplitBoard(
  rows: WalkTaskRow[],
  threshold: number = SYSTEM_GAP_CANDIDATE_THRESHOLD
): SplitBoard {
  const walkRows = rows.filter(isCampusWalkTask);

  let symptomCount = 0;
  let systemGapCount = 0;
  const repeatingSymptoms: RepeatingSymptom[] = [];
  const symptomsByCategory = new Map<string, number>();
  const categoriesWithSystemGap = new Set<string>();

  for (const row of walkRows) {
    const meta = row.metadata ?? {};
    const kind = walkKindOf(row);
    const rawCategory = typeof meta.category === 'string' ? meta.category.trim() : '';
    const categoryKey = rawCategory ? rawCategory.toLowerCase() : null;

    if (kind === 'system_gap') {
      systemGapCount += 1;
      if (categoryKey) categoriesWithSystemGap.add(categoryKey);
      continue;
    }

    symptomCount += 1;
    if (categoryKey) {
      symptomsByCategory.set(categoryKey, (symptomsByCategory.get(categoryKey) ?? 0) + 1);
    }

    const occurrenceCount = Number(meta.occurrence_count ?? 1);
    if (Number.isFinite(occurrenceCount) && occurrenceCount >= threshold) {
      repeatingSymptoms.push({
        taskId: row.id,
        title: row.title,
        category: rawCategory || null,
        occurrenceCount,
        statusKey: row.status_key
      });
    }
  }

  repeatingSymptoms.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  const candidateClusters: CategoryCluster[] = [...symptomsByCategory.entries()]
    .filter(([category, count]) => count >= threshold && !categoriesWithSystemGap.has(category))
    .map(([category, count]) => ({
      category,
      symptomCount: count,
      hasSystemGap: false
    }))
    .sort((a, b) => b.symptomCount - a.symptomCount || a.category.localeCompare(b.category));

  return {
    symptomCount,
    systemGapCount,
    repeatingSymptoms,
    candidateClusters,
    threshold
  };
}

// ── Ownership hygiene: where nobody is attached ──────────────────────────────
//
// The signal this section exists to surface was already being RECORDED and
// told to nobody.
//
// campus-walk-service writes `metadata.accountable_routed_to_eao_no_owner`
// at intake, and lib/campus-walk/repeats.ts writes it again on every D7
// reopen. It is set whenever routeAccountable() could not settle on an owner
// and fell through to the Executive Admin Officer. Until this function it sat
// in a JSONB column that a person would have had to go looking for: no alert,
// no report, no screen. Production task 15780b1a (2026-09-03, "Think tank room
// cleanliness") — the first campus walk observation ever filed — carries it.
//
// ── WHY IT LIVES ON THE SPLIT BOARD, AND WHY IT IS QUIET ────────────────────
// "Nobody is attached to this kind of work" is not an incident. It is a
// MISSING SYSTEM, which is the exact question D13 asks, and the fix for it is
// a routing decision somebody makes at a desk — not a phone call. It therefore
// gets a section on a board a person opens, and NOT a message: the Director
// already chose (2026-09-04) to be copied on every unsafe alert, and a second
// per-event notification on top of that choice would defeat it.
//
// ── IT IS NOT, AND MUST NOT BECOME, `NOBODY WAS PAGED` ─────────────────────
// That alarm (lib/campus-walk/urgent-alert.ts) means one factual thing —
// nothing was delivered to anyone — and nothing here changes when it fires or
// what it means. This is the quieter, adjacent fact: the person who must ACT
// has no owner attached, or could not be reached.
//
// Since PR #3267 made the Director a standing copy on every unsafe alert, a
// delivered Director copy counts as `delivered >= 1`, so an Accountable whose
// own send failed no longer trips that alarm. urgent-alert.ts records the case
// faithfully on `metadata.urgent_alert.attempts[]` and its test pins the
// silence deliberately ("raising a new alarm is a recipient decision"). This
// function READS those attempts. It raises nothing.
//
// ── D9: DEPARTMENTS AND KINDS OF WORK, NEVER NAMED PEOPLE ──────────────────
// The row types below have no profile id, no staff id and no name field, on
// purpose and by the same logic as loadStaffDepartments' select list: the
// surest way to guarantee a person's name never reaches a table cell, a sort
// key or a serialised prop is for the shape to have nowhere to put one.
// `metadata.urgent_alert.attempts[]` DOES carry `profile_id`; it is read for
// its `role`/`ok` and the id is deliberately dropped on the floor. Naming the
// person who failed to be reachable is precisely the "hunters and hunted"
// outcome D9 rejects.
// ────────────────────────────────────────────────────────────────────────────

/** One kind of work that keeps arriving with nobody attached to it. */
export interface UnownedCategoryRow {
  /**
   * The kind of problem, as recorded at capture. Null when the observation was
   * saved without one. Never a person, never a department's performance.
   */
  category: string | null;
  /** Observations of this kind that arrived with no owner. */
  unownedCount: number;
  /** How many of those were marked unsafe. */
  unsafeCount: number;
  /** Distinct ~110 m spots they came from — where, not who. */
  distinctSpots: number;
  /** created_at of the most recent one, ISO. */
  lastSeenAt: string;
}

/** Why the person who must act was not reached on the phone. */
export type UnreachableOwnerReason = 'no_usable_number' | 'send_failed';

/**
 * One unsafe observation whose Accountable was not reached.
 *
 * No profile id and no name — see the D9 note above.
 */
export interface UnreachableOwnerRow {
  taskId: string;
  title: string;
  category: string | null;
  reason: UnreachableOwnerReason;
  /**
   * True when the message did reach somebody else (the standing Director copy,
   * or the Director standing in). The condition is therefore NOT unattended —
   * which is exactly why this is a hygiene note and not an alarm.
   */
  someoneElseWasReached: boolean;
  /** When the alert was attempted, ISO. Null when the record did not carry one. */
  at: string | null;
}

export interface OwnershipBoard {
  /** Campus walk observations considered. */
  observations: number;
  /** Of those, how many arrived with nobody attached. */
  unowned: number;
  /** Biggest first. Kinds of work, never people. */
  unownedByCategory: UnownedCategoryRow[];
  /** Unsafe alerts whose Accountable was not reached. Most recent first. */
  unreachableOwners: UnreachableOwnerRow[];
  /**
   * True when EVERY observation is unowned.
   *
   * This is not a rounding of "most". It is the load-bearing distinction
   * between two completely different readings of the same list:
   *
   *   false -> the routing has HOLES. Some conditions found an owner and these
   *            ones did not, so each row is a gap worth filling.
   *   true  -> there is no routing AT ALL. Nothing supplies an owner, so the
   *            list is simply every observation and filling it in one row at a
   *            time would be pointless.
   *
   * As of 2026-09-04 the second is what is true: the capture screen has no
   * owner field, and the only client of the intake route
   * (lib/campus-walk/offline-queue.ts, uploadItem) never sends the
   * `accountableProfileId` the route accepts — so routeAccountable() always
   * receives null and always falls through to the EAO. The page renders a
   * plain-words explanation while this is true and stops the moment it is not,
   * so the wording can never go stale and claim a hole that has been filled.
   */
  everyObservationIsUnowned: boolean;
}

/**
 * Reads `metadata.urgent_alert` for the one case PR #3267 made invisible: the
 * Accountable was not reached, but somebody was, so nothing looks wrong.
 *
 * Returns null when this lane did not run (the observation was not unsafe) or
 * when the Accountable was reached normally.
 */
function unreachableOwnerOf(row: WalkTaskRow): UnreachableOwnerRow | null {
  const alert = (row.metadata ?? {}).urgent_alert;
  if (!alert || typeof alert !== 'object') return null;
  if (alert.attempted !== true) return null;

  const attempts: Array<{ role?: unknown; ok?: unknown }> = Array.isArray(alert.attempts)
    ? alert.attempts
    : [];
  const delivered = Number(alert.delivered);
  const someoneElseWasReached = Number.isFinite(delivered) && delivered > 0;
  const rawCategory =
    typeof (row.metadata ?? {}).category === 'string'
      ? ((row.metadata ?? {}).category as string).trim()
      : '';

  // `usedFallback` keeps its original meaning (urgent-alert.ts is explicit that
  // the always-copy ruling did NOT redefine it): the owner could not be paged
  // and a Director stood in. There is no 'accountable' attempt to inspect in
  // that case, because no number was ever dialled for them.
  const reason: UnreachableOwnerReason | null =
    alert.usedFallback === true
      ? 'no_usable_number'
      : attempts.some((a) => a.role === 'accountable' && a.ok === false)
        ? 'send_failed'
        : null;
  if (!reason) return null;

  return {
    taskId: row.id,
    title: row.title,
    category: rawCategory || null,
    reason,
    someoneElseWasReached,
    at: typeof alert.at === 'string' ? alert.at : null
  };
}

/**
 * Which kinds of work have nobody attached to them, and which unsafe alerts
 * never reached the person who must act.
 *
 * Counts what is already stored. Writes nothing, notifies nobody, promotes
 * nothing — the same refusal buildSplitBoard makes.
 */
export function buildOwnershipBoard(rows: WalkTaskRow[]): OwnershipBoard {
  const walkRows = rows.filter(isCampusWalkTask);

  // Keyed case-insensitively so "Electrical" and "electrical" are one kind of
  // work, while the label shown is the first spelling actually recorded.
  const byCategory = new Map<
    string,
    { label: string | null; count: number; unsafe: number; spots: Set<string>; lastSeenAt: string }
  >();
  let unowned = 0;
  const unreachableOwners: UnreachableOwnerRow[] = [];

  for (const row of walkRows) {
    const meta = row.metadata ?? {};

    const unreachable = unreachableOwnerOf(row);
    if (unreachable) unreachableOwners.push(unreachable);

    if (meta.accountable_routed_to_eao_no_owner !== true) continue;
    unowned += 1;

    const rawCategory = typeof meta.category === 'string' ? meta.category.trim() : '';
    const key = rawCategory ? rawCategory.toLowerCase() : '__uncategorised__';
    const bucket = byCategory.get(key) ?? {
      label: rawCategory || null,
      count: 0,
      unsafe: 0,
      spots: new Set<string>(),
      lastSeenAt: row.created_at
    };
    bucket.count += 1;
    if (meta.unsafe === true) bucket.unsafe += 1;
    const spot = areaCellKey(meta.geo);
    if (spot) bucket.spots.add(spot);
    if (row.created_at > bucket.lastSeenAt) bucket.lastSeenAt = row.created_at;
    byCategory.set(key, bucket);
  }

  const unownedByCategory: UnownedCategoryRow[] = [...byCategory.values()]
    .map((b) => ({
      category: b.label,
      unownedCount: b.count,
      unsafeCount: b.unsafe,
      distinctSpots: b.spots.size,
      lastSeenAt: b.lastSeenAt
    }))
    .sort((a, b) => {
      if (a.unownedCount !== b.unownedCount) return b.unownedCount - a.unownedCount;
      // An uncategorised bucket has no name to sort by, so it goes last.
      if (a.category === null) return b.category === null ? 0 : 1;
      if (b.category === null) return -1;
      return a.category.localeCompare(b.category);
    });

  unreachableOwners.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));

  return {
    observations: walkRows.length,
    unowned,
    unownedByCategory,
    unreachableOwners,
    everyObservationIsUnowned: walkRows.length > 0 && unowned === walkRows.length
  };
}
