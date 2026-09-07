// lib/services/meetings/recurring-series-config.ts
//
// The RULES of a recurring meeting series, as pure functions.
//
// Pieces 1 and 2 of the Monthly Slate spec (artifacts/monthly-slate-spec-
// 2026-08-25.html): configuring a series and the scheduling rules it will be
// read against. The proposal engine (piece 3) is deliberately NOT here — this
// module never picks a date, never writes a booking and never touches a month.
// It answers only three questions the configuration screen and, later, the
// engine both need answered the SAME way:
//
//   1. Which cadences may the EAO pick? (the Director chose four)
//   2. Given a series' coverage mode and its recorded exceptions, which units
//      does it actually cover?
//   3. Whose calendars must be free before a slot is legal?
//
// Kept out of the server actions on purpose: these are the parts worth pinning
// with tests, and a test that has to stand up a Supabase client to check "does
// an exception remove a college" is testing the wrong thing.

/** The four repeat frequencies the EAO picks from. Director, 2026-08-25. */
export type SeriesCadence = 'weekly' | 'fortnightly' | 'monthly' | 'twice_monthly';

export interface CadenceOption {
  value: SeriesCadence;
  label: string;
  /**
   * Roughly how many times a year this cadence fires, for the "≈N a year"
   * hint on the form. An estimate for sizing, not a scheduling rule — the
   * engine places real dates against real availability, not against this.
   */
  approxPerYear: number;
}

/**
 * Ordered most-frequent first, which is the order the form shows them in.
 * The sample sheet was all monthly, but the real set includes weekly series —
 * so weekly is a first-class option, not an afterthought.
 */
export const CADENCE_OPTIONS: readonly CadenceOption[] = [
  { value: 'weekly', label: 'Weekly', approxPerYear: 52 },
  { value: 'fortnightly', label: 'Fortnightly (every 2 weeks)', approxPerYear: 26 },
  { value: 'twice_monthly', label: 'Twice a month', approxPerYear: 24 },
  { value: 'monthly', label: 'Monthly', approxPerYear: 12 },
] as const;

/** Guards a value read back from the database or a form post. */
export function isSeriesCadence(value: unknown): value is SeriesCadence {
  return CADENCE_OPTIONS.some((o) => o.value === value);
}

export function cadenceLabel(value: SeriesCadence): string {
  return CADENCE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** How a series decides which units it covers. */
export type CoverageMode = 'all_institutions' | 'listed_only';

export interface CoverageUnitRow {
  institutionId: string;
  isExcluded: boolean;
  exclusionReason?: string | null;
}

export interface CoverageInput {
  coverageMode: CoverageMode;
  /** Every unit the series COULD cover — active institutions, in display order. */
  allInstitutionIds: readonly string[];
  /** The rows recorded against this series. */
  units: readonly CoverageUnitRow[];
}

export interface CoverageResult {
  covered: string[];
  excluded: string[];
}

/**
 * "Mostly every college, with a few known exceptions recorded once per series."
 *
 * Under `all_institutions` (the normal case) the recorded rows SUBTRACT: every
 * active unit is covered except the ones marked excluded. Under `listed_only`
 * the non-excluded rows ARE the list — which is how a series that genuinely
 * runs for two colleges is expressed without inventing twelve exclusions.
 *
 * A unit named in the rows that is no longer an active institution is dropped
 * rather than returned: a closed college must not silently keep a slot.
 */
export function resolveCoveredInstitutions(input: CoverageInput): CoverageResult {
  const all = input.allInstitutionIds;
  const active = new Set(all);
  const excludedSet = new Set(
    input.units.filter((u) => u.isExcluded).map((u) => u.institutionId),
  );
  const listedSet = new Set(
    input.units.filter((u) => !u.isExcluded).map((u) => u.institutionId),
  );

  const covered =
    input.coverageMode === 'all_institutions'
      ? all.filter((id) => !excludedSet.has(id))
      : all.filter((id) => listedSet.has(id));

  // Order the exclusions by the display order too, so the UI never shows the
  // same series' exceptions in two different orders on two different loads.
  const excluded = all.filter((id) =>
    input.coverageMode === 'all_institutions'
      ? excludedSet.has(id)
      : !listedSet.has(id) && active.has(id),
  );

  return { covered, excluded };
}

export interface SeriesAttendeeRow {
  profileId: string;
  isRequired: boolean;
}

/**
 * Whose calendar must be free before a slot is legal for this series.
 *
 * The host is ALWAYS required and needs no row — a series placed on a calendar
 * whose owner is busy is not a meeting. Optional attendees are invited but do
 * not veto a slot, so they are returned separately rather than merged in: the
 * whole point of the per-series list is that it is short.
 *
 * De-duplicates, and never returns the host twice even if a row names them.
 */
export function resolveRequiredAttendees(input: {
  hostProfileId: string;
  attendees: readonly SeriesAttendeeRow[];
}): { required: string[]; optional: string[] } {
  const required: string[] = [input.hostProfileId];
  const optional: string[] = [];
  const seen = new Set<string>([input.hostProfileId]);

  for (const a of input.attendees) {
    if (!a.profileId || seen.has(a.profileId)) continue;
    seen.add(a.profileId);
    (a.isRequired ? required : optional).push(a.profileId);
  }

  return { required, optional };
}

/**
 * The rotation rule: "whoever went first last cycle goes later this cycle."
 *
 * The stored order is fixed; the series' cursor says how far into it the
 * previous cycle started. Rotating by the cursor is the whole rule — nothing
 * here decides WHEN the cursor advances, which belongs to the engine.
 *
 * An empty order returns empty rather than throwing: a rules screen that has
 * not been filled in yet is a normal state, not an error.
 */
export function rotateOrder<T>(order: readonly T[], cursor: number): T[] {
  if (order.length === 0) return [];
  const safe = ((Math.trunc(cursor) % order.length) + order.length) % order.length;
  return [...order.slice(safe), ...order.slice(0, safe)];
}

/** 0 = Sunday, matching Postgres' `extract(dow)` and JS `getDay()`. */
export const WEEKDAY_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
] as const;

export function weekdayLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Any day';
  return WEEKDAY_OPTIONS.find((d) => d.value === value)?.label ?? 'Any day';
}

/** Minutes past local midnight → "HH:mm". */
export function minutesToHHmm(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '';
  const m = Math.max(0, Math.min(1439, Math.trunc(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "HH:mm" → minutes past local midnight. Returns null for anything unusable. */
export function hhmmToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** The two things that block a period. Travel is deliberately not one of them. */
export type BlockKind = 'public_holiday' | 'festival';

export const BLOCK_KIND_OPTIONS: readonly { value: BlockKind; label: string }[] = [
  { value: 'public_holiday', label: 'Public holiday' },
  { value: 'festival', label: 'Festival' },
] as const;

export function isBlockKind(value: unknown): value is BlockKind {
  return BLOCK_KIND_OPTIONS.some((o) => o.value === value);
}
