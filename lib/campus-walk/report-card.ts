// lib/campus-walk/report-card.ts
// ============================================================================
// Campus Walk — the Monday report card, one per college (Director ruling,
// 30 Sep 2026): "every Monday each college head gets a report card for their
// college: jobs fixed, jobs late, repeat problems, and star ratings, compared
// with the other colleges. The Director sees all colleges."
//
// Pure in / pure out, like lib/campus-walk/scoreboard.ts next door, so every
// rule below is asserted in __tests__/campus-walk/report-card.test.ts with no
// database. The reads live in lib/campus-walk/report-card-run.ts.
//
// ── WHICH COLLEGE A JOB BELONGS TO (repair round, 1 Oct 2026) ─────────────
// CAMPUS-OPS itself carries institution_id NULL (it is cross-institution), and
// a Director walk job is filed with NO college at all (the walk screen never
// sends one). So a job's college is derived, most reliable source first —
// see placeTask below:
//   1. the item or room it is about: metadata.resource_id -> resources.institution_id
//   2. the person accountable for fixing it: owner_staff_id -> staff.institution_id
//      (skipped when the job only went to the estate office because nobody
//      else was found — the estate office's college says nothing about where
//      the problem is)
//   3. the department: the item's department, else the accountable person's
//      department -> departments.institution_id
//   4. the person who reported it: metadata.institution_id /
//      metadata.reporter_institution_id (InstaSolver stamps the reporter's
//      college there), else the reporter's profile.
// The first source that names an institution wins. A job placed in a school
// or an office goes to `unassigned` ("outside the colleges"); a job no source
// can place goes to `collegeNotKnown`. Both are counted, never dropped, and
// only the Director sees them.

// ── THE RULES THIS FILE REUSES, NOT RESTATES ────────────────────────────────
// "Fixed" is scoreboard.ts's isVerifiedClosure (status 'done' AND an approved
// fix photo — PR #4133's instant close writes the same approved record, so it
// still counts). Days-to-fix is daysToVerifiedClosure, which already subtracts
// paused days (D8). Due dates are compared as UTC calendar days, exactly like
// scoreboard.ts's isOverdue, so this card and the fixes board never disagree
// about whether the same job is late. IST is used for one thing only: deciding
// which Monday-to-Sunday week an event falls in.
//
// ── COMPLAINTS (grievance_tickets) — COUNTS ONLY ────────────────────────────
// scoreboard.ts's guardrail G1 keeps campus jobs OUT of grievance_tickets. This
// card does not change that: it never writes there and never mixes the two
// lists. It reads three COUNTS per college (received / resolved / overdue).
// ICC-only complaints are left out of every count, and no subject, description
// or name is ever read — see loadComplaintRows in report-card-run.ts.
// ============================================================================

import { istWeekInfo } from '@/lib/services/academic/intake-readiness-alarm';
import {
  areaCellKey,
  daysToVerifiedClosure,
  isVerifiedClosure,
  median,
  walkKindOf,
  type WalkTaskRow
} from '@/lib/campus-walk/scoreboard';

// ── Constants that carry a decision ──────────────────────────────────────────

/** A new report is a repeat when the same problem was closed this recently. */
export const REPEAT_WINDOW_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TERMINAL_STATUSES = new Set(['done', 'cancelled', 'archived']);
const CLOSED_COMPLAINT_STATUSES = new Set(['resolved', 'closed', 'withdrawn']);

// ── Week ─────────────────────────────────────────────────────────────────────

export interface ReportWeek {
  /** Monday, YYYY-MM-DD (IST). */
  weekStart: string;
  /** Sunday, YYYY-MM-DD (IST). */
  weekEnd: string;
  /** Monday 00:00 IST as epoch ms (inclusive). */
  startMs: number;
  /** The following Monday 00:00 IST as epoch ms (exclusive). */
  endMs: number;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The Monday of the last FULL week — what a Monday-morning card reports on.
 * Reuses the intake-readiness alarm's IST week maths rather than a second copy.
 */
export function lastCompletedWeekStart(now: Date): string {
  return istWeekInfo(now).prevWeekStart;
}

export function weekFromMonday(monday: string): ReportWeek {
  const startMs = Date.parse(`${monday}T00:00:00+05:30`);
  return {
    weekStart: monday,
    weekEnd: addDays(monday, 6),
    startMs,
    endMs: startMs + 7 * MS_PER_DAY
  };
}

export interface ParsedWeekParam {
  /** Null when the value could not be read as a date at all. */
  week: ReportWeek | null;
  /** True when a real date that was not a Monday was moved back to its Monday. */
  snapped: boolean;
  /** True when the date is in the future or in the current, unfinished week. */
  notFinished: boolean;
}

/**
 * `?week=YYYY-MM-DD`. Empty means the last full week. A date that is not a
 * Monday is moved back to its Monday (and the page says so). Anything that is
 * not a real date returns `week: null` so the page can refuse in words.
 */
export function parseWeekParam(raw: string | null | undefined, now: Date): ParsedWeekParam {
  const value = (raw ?? '').trim();
  if (!value) {
    return { week: weekFromMonday(lastCompletedWeekStart(now)), snapped: false, notFinished: false };
  }
  if (!DAY_RE.test(value)) return { week: null, snapped: false, notFinished: false };
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { week: null, snapped: false, notFinished: false };
  }
  const daysSinceMonday = (parsed.getUTCDay() + 6) % 7;
  const monday = addDays(value, -daysSinceMonday);
  const week = weekFromMonday(monday);
  return { week, snapped: monday !== value, notFinished: week.endMs > now.getTime() };
}

function inWeek(iso: string | null | undefined, week: ReportWeek): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= week.startMs && t < week.endMs;
}

// ── One job ──────────────────────────────────────────────────────────────────

/**
 * The college STAMPED on a job when it was filed, or null. For InstaSolver
 * this is the reporter's own college (app/api/instasolver/broken/route.ts), so
 * it is the reporter tier of placeTask, not an authoritative place.
 */
export function institutionOfTask(row: WalkTaskRow): string | null {
  const meta = row.metadata ?? {};
  const id = meta.institution_id ?? meta.reporter_institution_id ?? null;
  return typeof id === 'string' && id ? id : null;
}

export type PlacementSource = 'resource' | 'owner' | 'department' | 'reporter';

export interface TaskPlacement {
  /** Null when no source could name an institution ("college not known"). */
  institutionId: string | null;
  source: PlacementSource | null;
}

/** The rows placeTask reads, each keyed by id. Built by report-card-run.ts. */
export interface PlacementLookups {
  resources: Map<string, { institution_id: string | null; department_id: string | null }>;
  staff: Map<string, { institution_id: string | null; department_id: string | null }>;
  departments: Map<string, string | null>;
  profiles: Map<string, string | null>;
}

function idOrNull(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

/** The ids placeTask may look up for one job — what the loader has to read. */
export function placementIdsOf(row: WalkTaskRow): {
  resourceId: string | null;
  ownerStaffId: string | null;
  departmentId: string | null;
  reporterProfileId: string | null;
} {
  const meta = row.metadata ?? {};
  return {
    resourceId: idOrNull(meta.resource_id),
    // An estate-office fallback owner is not a statement about the place.
    ownerStaffId: meta.accountable_routed_to_eao_no_owner === true ? null : idOrNull(row.owner_staff_id),
    departmentId: idOrNull(meta.department_id),
    reporterProfileId: idOrNull(meta.reporter_id) ?? idOrNull(meta.raised_by_profile_id)
  };
}

/**
 * Which institution a job belongs to — resource, then accountable person, then
 * department, then reporter. The first source that names one wins. Pure.
 */
export function placeTask(row: WalkTaskRow, lookups: PlacementLookups): TaskPlacement {
  const ids = placementIdsOf(row);
  const resource = ids.resourceId ? lookups.resources.get(ids.resourceId) ?? null : null;
  const owner = ids.ownerStaffId ? lookups.staff.get(ids.ownerStaffId) ?? null : null;

  const fromResource = idOrNull(resource?.institution_id);
  if (fromResource) return { institutionId: fromResource, source: 'resource' };

  const fromOwner = idOrNull(owner?.institution_id);
  if (fromOwner) return { institutionId: fromOwner, source: 'owner' };

  for (const deptId of [ids.departmentId, idOrNull(resource?.department_id), idOrNull(owner?.department_id)]) {
    const fromDept = deptId ? idOrNull(lookups.departments.get(deptId)) : null;
    if (fromDept) return { institutionId: fromDept, source: 'department' };
  }

  const stamped = institutionOfTask(row);
  if (stamped) return { institutionId: stamped, source: 'reporter' };
  const fromReporter = ids.reporterProfileId
    ? idOrNull(lookups.profiles.get(ids.reporterProfileId))
    : null;
  if (fromReporter) return { institutionId: fromReporter, source: 'reporter' };

  return { institutionId: null, source: null };
}

/**
 * Where the problem is. InstaSolver reports carry a typed place
 * (`metadata.location`), compared case- and space-insensitively; walk
 * observations carry a GPS fix, compared by scoreboard.ts's ~110 m square.
 */
export function placeKeyOf(row: WalkTaskRow): string | null {
  const meta = row.metadata ?? {};
  if (typeof meta.location === 'string' && meta.location.trim()) {
    return `place:${meta.location.trim().toLowerCase().replace(/\s+/g, ' ')}`;
  }
  const cell = areaCellKey(meta.geo);
  return cell ? `geo:${cell}` : null;
}

/** What kind of problem: the confirmed category, else the walk kind. */
export function problemKindOf(row: WalkTaskRow): string {
  const meta = row.metadata ?? {};
  if (typeof meta.category === 'string' && meta.category.trim()) {
    return `category:${meta.category.trim().toLowerCase()}`;
  }
  return `kind:${walkKindOf(row)}`;
}

/** `metadata.occurrences` — the "same as before" reopens only (D7). */
function reopenTimes(row: WalkTaskRow): string[] {
  const occ = (row.metadata ?? {}).occurrences;
  if (!Array.isArray(occ)) return [];
  return occ.map((o: any) => (o && typeof o.at === 'string' ? o.at : null)).filter(Boolean);
}

/**
 * Reports that arrived in the week: the first filing, plus every "same as
 * before" reopen (which reuses the original row rather than filing a new one).
 */
export function reportsInWeek(row: WalkTaskRow, week: ReportWeek): number {
  let n = inWeek(row.created_at, week) ? 1 : 0;
  for (const at of reopenTimes(row)) if (inWeek(at, week)) n += 1;
  return n;
}

/**
 * A repeat problem in this week. Either:
 *   (a) someone tapped "same as before" on it this week (D7 — a human already
 *       said it came back), or
 *   (b) it was first filed this week at the same place, for the same kind of
 *       problem, as another job in the same college whose fix was approved in
 *       the REPEAT_WINDOW_DAYS before it.
 * A "Not fixed" reopen from PR #4133 (`metadata.reopens`) is deliberately NOT
 * a repeat: the fix did not hold, which is a different question.
 */
export function isRepeatInWeek(
  row: WalkTaskRow,
  sameCollegeRows: WalkTaskRow[],
  week: ReportWeek
): boolean {
  if (reopenTimes(row).some((at) => inWeek(at, week))) return true;
  if (!inWeek(row.created_at, week)) return false;
  const place = placeKeyOf(row);
  if (!place) return false;
  const kind = problemKindOf(row);
  const filedAt = Date.parse(row.created_at);
  return sameCollegeRows.some((other) => {
    if (other.id === row.id || !isVerifiedClosure(other) || !other.completed_at) return false;
    if (placeKeyOf(other) !== place || problemKindOf(other) !== kind) return false;
    const closedAt = Date.parse(other.completed_at);
    return (
      Number.isFinite(closedAt) &&
      closedAt <= filedAt &&
      filedAt - closedAt <= REPEAT_WINDOW_DAYS * MS_PER_DAY
    );
  });
}

/** Fixed this week: a verified closure whose approval landed inside the week. */
export function isFixedInWeek(row: WalkTaskRow, week: ReportWeek): boolean {
  return isVerifiedClosure(row) && inWeek(row.completed_at, week);
}

/**
 * Fixed by its due day. Same UTC-day comparison as scoreboard.ts's isOverdue.
 *
 * A job with NO due date is not judged at all (repair round, 1 Oct): it is
 * left out of both sides of the on-time percentage. Counting it as on time
 * would let a college whose jobs carry no due dates score 100% and top a
 * ranking every principal sees. Campus Walk always sets a due date; jobs from
 * other doors (e.g. an import) may not.
 */
export function hasDueDate(row: WalkTaskRow): boolean {
  return typeof row.due_date === 'string' && row.due_date.length >= 10;
}

export function isFixedOnTime(row: WalkTaskRow): boolean {
  if (!row.completed_at || !hasDueDate(row)) return false;
  return row.completed_at.slice(0, 10) <= (row.due_date as string).slice(0, 10);
}

/**
 * Still open at `asOf`. For the week just gone this is the end of that week;
 * for an older week it is reconstructed from completed_at and
 * metadata.cancelled_at, which is the best the table records.
 */
export function isOpenAt(row: WalkTaskRow, asOf: Date): boolean {
  const t = asOf.getTime();
  const created = Date.parse(row.created_at);
  if (!Number.isFinite(created) || created >= t) return false;
  if (!TERMINAL_STATUSES.has(row.status_key)) return true;
  const cancelledAt = (row.metadata ?? {}).cancelled_at;
  const endedIso =
    row.status_key === 'cancelled' && typeof cancelledAt === 'string' ? cancelledAt : row.completed_at;
  if (!endedIso) return false; // closed at an unknown time — never guessed as open
  const ended = Date.parse(endedIso);
  return Number.isFinite(ended) && ended >= t;
}

/**
 * Open at `asOf` and its due DAY is already behind that moment (UTC days).
 *
 * A BLOCKED job (D8 — waiting on a budget decision, or its fixer is on
 * approved leave) is never late: its clock is stopped, and this number is
 * ranked across colleges, so counting it would blame a college for a wait it
 * cannot end. `is_blocked` is the job's state today, the only record kept.
 */
export function isLateAt(row: WalkTaskRow, asOf: Date): boolean {
  if (row.is_blocked || !isOpenAt(row, asOf) || !row.due_date) return false;
  return row.due_date < asOf.toISOString().slice(0, 10);
}

// ── Complaints ───────────────────────────────────────────────────────────────

/** The only grievance_tickets columns this card reads. No text, no names. */
export interface ComplaintRow {
  institution_id: string;
  status: string | null;
  created_at: string | null;
  resolved_at: string | null;
  sla_deadline: string | null;
  withdrawn_at: string | null;
  is_icc_only: boolean | null;
}

function complaintOpenAt(c: ComplaintRow, asOf: Date): boolean {
  const t = asOf.getTime();
  const created = c.created_at ? Date.parse(c.created_at) : NaN;
  if (!Number.isFinite(created) || created >= t) return false;
  if (c.withdrawn_at && Date.parse(c.withdrawn_at) < t) return false;
  if (c.resolved_at) return Date.parse(c.resolved_at) >= t;
  return !CLOSED_COMPLAINT_STATUSES.has((c.status ?? '').toLowerCase());
}

// ── The card ─────────────────────────────────────────────────────────────────

export interface College {
  id: string;
  name: string;
}

export interface RatingSummary {
  average: number;
  count: number;
}

export interface CollegeCard {
  institutionId: string;
  name: string;
  reportsReceived: number;
  fixed: number;
  fixedOnTime: number;
  /** Fixes that had a due date — the on-time percentage's denominator. */
  fixedJudged: number;
  /** Whole-number percent of fixedJudged; null when none could be judged (not a zero). */
  fixedOnTimePct: number | null;
  lateNow: number;
  /** Days the oldest still-open job has waited; null when nothing is open. */
  oldestOpenDays: number | null;
  repeats: number;
  complaintsReceived: number;
  complaintsResolved: number;
  complaintsOverdue: number;
  /** Median days to a verified fix, paused days removed; null when none. */
  typicalDaysToFix: number | null;
  /** Null until a star-rating source exists — the row is then left out. */
  ratings: RatingSummary | null;
  /** 1 = best. Null when no fix this week had a due date to judge (not ranked). */
  rankOnTime: number | null;
  /** 1 = fewest late jobs. */
  rankLate: number;
}

export interface ReportCardBoard {
  week: ReportWeek;
  /** The moment "late now" and "oldest open" are measured at. */
  asOf: string;
  /** One card per college, in name order. */
  cards: CollegeCard[];
  /** Jobs placed in an institution that is not a college (a school, an office). Director view only. */
  unassigned: { reportsReceived: number; lateNow: number };
  /**
   * Jobs no source could place in any institution. `jobs` counts those that
   * touched the week (reported in it, fixed in it, or open at its end).
   * Director view only — shown, never guessed.
   */
  collegeNotKnown: { jobs: number; reportsReceived: number; lateNow: number };
  /** Colleges that ranked on fixed-on-time (fixed at least one job with a due date). */
  rankedOnTimeCount: number;
  /** True when the complaint read hit its row limit, so complaint counts may be short. */
  complaintsTruncated: boolean;
}

export interface BuildReportCardsInput {
  colleges: College[];
  tasks: WalkTaskRow[];
  complaints: ComplaintRow[];
  week: ReportWeek;
  now: Date;
  /** Optional, per college. Omitted today: no star-rating source exists yet. */
  ratingsByInstitution?: Map<string, RatingSummary>;
  /**
   * Per task id, from placeTask. A task missing from the map (or no map) falls
   * back to the college stamped on it at filing (the reporter tier).
   */
  placements?: Map<string, TaskPlacement>;
  complaintsTruncated?: boolean;
}

/** Standard competition ranking (1, 1, 3). The LOWEST `value` ranks first. */
function rank<T>(items: T[], value: (t: T) => number): Map<T, number> {
  const sorted = [...items].sort((a, b) => value(a) - value(b));
  const out = new Map<T, number>();
  sorted.forEach((item, i) => {
    const prev = sorted[i - 1];
    out.set(item, prev !== undefined && value(prev) === value(item) ? out.get(prev)! : i + 1);
  });
  return out;
}

export function buildReportCards(input: BuildReportCardsInput): ReportCardBoard {
  const { colleges, tasks, complaints, week, now } = input;
  const asOf = new Date(Math.min(now.getTime(), week.endMs - 1));

  const byCollege = new Map<string, WalkTaskRow[]>();
  const unassigned = { reportsReceived: 0, lateNow: 0 };
  const collegeNotKnown = { jobs: 0, reportsReceived: 0, lateNow: 0 };
  const known = new Set(colleges.map((c) => c.id));

  for (const row of tasks) {
    const inst = input.placements?.get(row.id)?.institutionId ?? institutionOfTask(row);
    if (inst && known.has(inst)) {
      const list = byCollege.get(inst) ?? [];
      list.push(row);
      byCollege.set(inst, list);
    } else if (inst) {
      unassigned.reportsReceived += reportsInWeek(row, week);
      if (isLateAt(row, asOf)) unassigned.lateNow += 1;
    } else {
      const reported = reportsInWeek(row, week);
      const late = isLateAt(row, asOf);
      if (reported > 0 || isFixedInWeek(row, week) || isOpenAt(row, asOf)) collegeNotKnown.jobs += 1;
      collegeNotKnown.reportsReceived += reported;
      if (late) collegeNotKnown.lateNow += 1;
    }
  }

  const complaintsByCollege = new Map<string, ComplaintRow[]>();
  for (const c of complaints) {
    if (c.is_icc_only) continue;
    const list = complaintsByCollege.get(c.institution_id) ?? [];
    list.push(c);
    complaintsByCollege.set(c.institution_id, list);
  }

  const cards: CollegeCard[] = colleges.map((college) => {
    const rows = byCollege.get(college.id) ?? [];
    const fixedRows = rows.filter((r) => isFixedInWeek(r, week));
    const judgedRows = fixedRows.filter(hasDueDate);
    const fixedOnTime = judgedRows.filter(isFixedOnTime).length;
    const openAges = rows
      .filter((r) => !r.is_blocked && isOpenAt(r, asOf))
      .map((r) => Math.floor((asOf.getTime() - Date.parse(r.created_at)) / MS_PER_DAY));
    const durations = fixedRows
      .map(daysToVerifiedClosure)
      .filter((d): d is number => d !== null);
    const cs = complaintsByCollege.get(college.id) ?? [];

    return {
      institutionId: college.id,
      name: college.name,
      reportsReceived: rows.reduce((n, r) => n + reportsInWeek(r, week), 0),
      fixed: fixedRows.length,
      fixedOnTime,
      fixedJudged: judgedRows.length,
      fixedOnTimePct: judgedRows.length > 0 ? Math.round((fixedOnTime / judgedRows.length) * 100) : null,
      lateNow: rows.filter((r) => isLateAt(r, asOf)).length,
      oldestOpenDays: openAges.length > 0 ? Math.max(...openAges) : null,
      repeats: rows.filter((r) => isRepeatInWeek(r, rows, week)).length,
      complaintsReceived: cs.filter((c) => inWeek(c.created_at, week)).length,
      complaintsResolved: cs.filter((c) => inWeek(c.resolved_at, week)).length,
      complaintsOverdue: cs.filter(
        (c) =>
          complaintOpenAt(c, asOf) && !!c.sla_deadline && Date.parse(c.sla_deadline) < asOf.getTime()
      ).length,
      typicalDaysToFix: median(durations),
      ratings: input.ratingsByInstitution?.get(college.id) ?? null,
      rankOnTime: null,
      rankLate: 0
    };
  });

  const ranked = cards.filter((c) => c.fixedOnTimePct !== null);
  const onTimeRanks = rank(ranked, (c) => -(c.fixedOnTimePct as number));
  const lateRanks = rank(cards, (c) => c.lateNow);
  for (const c of cards) {
    c.rankOnTime = onTimeRanks.get(c) ?? null;
    c.rankLate = lateRanks.get(c) ?? cards.length;
  }

  cards.sort((a, b) => a.name.localeCompare(b.name));

  return {
    week,
    asOf: asOf.toISOString(),
    cards,
    unassigned,
    collegeNotKnown,
    rankedOnTimeCount: ranked.length,
    complaintsTruncated: Boolean(input.complaintsTruncated)
  };
}

// ── Words ────────────────────────────────────────────────────────────────────

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** Bell title for a college head. */
export function headBellTitle(card: CollegeCard): string {
  return `Your college's week: ${card.fixed} fixed, ${card.lateNow} late`;
}

/**
 * Bell body for a college head: the three biggest numbers, in words, plus
 * where the college stands on fixing on time — out of the colleges that fixed
 * anything, because a college that fixed nothing has no on-time place. Biggest = largest count among the headline
 * figures; ties keep the order below so the text is stable run to run.
 */
export function headBellBody(card: CollegeCard, rankedOnTimeCount: number): string {
  const candidates: Array<{ n: number; text: string }> = [
    { n: card.reportsReceived, text: `${plural(card.reportsReceived, 'problem', 'problems')} reported` },
    { n: card.fixed, text: `${plural(card.fixed, 'job', 'jobs')} fixed` },
    { n: card.lateNow, text: `${plural(card.lateNow, 'job', 'jobs')} past the date` },
    { n: card.repeats, text: `${plural(card.repeats, 'problem', 'problems')} came back` },
    { n: card.complaintsReceived, text: `${plural(card.complaintsReceived, 'complaint', 'complaints')} received` },
    { n: card.complaintsOverdue, text: `${plural(card.complaintsOverdue, 'complaint', 'complaints')} overdue` }
  ];
  const top = candidates
    .map((c, i) => ({ ...c, i }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, 3)
    .map((c) => c.text);

  const standing =
    card.rankOnTime !== null
      ? `On time: ${ordinal(card.rankOnTime)} of ${plural(rankedOnTimeCount, 'college', 'colleges')} that fixed something.`
      : card.fixed > 0
        ? 'No fix this week had a due date, so no on-time place.'
        : 'Nothing was fixed this week, so no on-time place.';
  return `${top.join(', ')}. ${standing} Open the card to see every college.`;
}

/** Bell body for the Director: one line per college, then who has no head. */
export function directorBellBody(
  board: ReportCardBoard,
  collegesWithoutHead: College[]
): string {
  const lines = board.cards.map(
    (c) => `${c.name}: ${c.fixed} fixed, ${c.lateNow} late, ${c.repeats} came back`
  );
  if (board.unassigned.reportsReceived > 0 || board.unassigned.lateNow > 0) {
    lines.push(
      `Schools and offices (not a college): ${board.unassigned.reportsReceived} reported, ${board.unassigned.lateNow} late`
    );
  }
  if (board.collegeNotKnown.jobs > 0) {
    lines.push(
      `College not known: ${plural(board.collegeNotKnown.jobs, 'job', 'jobs')} (${board.collegeNotKnown.reportsReceived} reported, ${board.collegeNotKnown.lateNow} late)`
    );
  }
  if (collegesWithoutHead.length > 0) {
    lines.push(`No head on record: ${collegesWithoutHead.map((c) => c.name).join(', ')}`);
  }
  return lines.join(' · ');
}
