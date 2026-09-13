// lib/services/meetings/monthly-slate-engine.ts
//
// PIECE 3 of the Monthly Slate spec (artifacts/monthly-slate-spec-2026-08-25.html):
// the proposal engine. Two weeks before each month it lays every configured
// series against the real availability of everyone required — not just the host —
// and writes a DRAFT. It books nothing.
//
// ── WHY THIS IS PURE ─────────────────────────────────────────────────────────
//
// No Supabase, no clock, no IO. Everything it needs is passed in, and the same
// input always produces the same slate. That matters for one specific reason
// beyond testability: the spec says "a proposed month is disposable — it can be
// regenerated as often as needed until it is approved". A generator that mutated
// state as it ran could not honour that. So this function mutates NOTHING, not
// even the rotation cursor — it RETURNS the cursor the caller should persist
// when the month is approved (see `nextRotationCursor` below).
//
// The impure half — reading series, rules and availability, and calling
// computeSlots() per person — belongs in the service that wraps this. The split
// is the same one native-slot-engine.ts already uses.
//
// ── WHAT IT REUSES RATHER THAN REINVENTS ─────────────────────────────────────
//
// The spec listed "checking several people's calendars at once" as the single
// biggest new piece. It is not new: intersectCollectiveSlots() has shipped since
// Wave-3 for collective meeting types, and this engine takes the same shape of
// input (per-person slot lists, already computed). Coverage, required attendees
// and the rotation rule are likewise already pure functions in
// recurring-series-config.ts. This file is mostly composition.
//
// ── THE ONE RULE THAT OUTRANKS THE OTHERS ────────────────────────────────────
//
// "A silently missing meeting is the worst failure this system can have."
// Every covered (series x institution x occurrence) that is not placed comes
// back in `unplaceable` with a reason a human can act on. Nothing is dropped,
// and nothing is quietly pushed into next month.

import {
  resolveCoveredInstitutions,
  resolveRequiredAttendees,
  rotateOrder,
  type CoverageMode,
  type CoverageUnitRow,
  type SeriesAttendeeRow,
  type SeriesCadence,
} from './recurring-series-config';

// ============================================================================
// INPUT
// ============================================================================

export interface SlateSeries {
  id: string;
  name: string;
  hostProfileId: string;
  cadence: SeriesCadence;
  /** 0 = Sunday .. 6 = Saturday. null = no preference. */
  preferredWeekday: number | null;
  /** Minutes past local midnight. null = no preference. */
  preferredStartMinute: number | null;
  durationMin: number;
  /** A travel week turns this meeting online instead of losing it. */
  mayBeOnline: boolean;
  coverageMode: CoverageMode;
  /** Lower runs first when two series want the same slot. */
  priority: number;
  /** How far into the rotation order the PREVIOUS cycle started. */
  rotationCursor: number;
  units: readonly CoverageUnitRow[];
  attendees: readonly SeriesAttendeeRow[];
}

/** Public holidays and festivals. `institutionId: null` blocks every unit. */
export interface SlateBlockedPeriod {
  institutionId: string | null;
  name: string;
  /** Inclusive calendar dates, "YYYY-MM-DD", campus timezone. */
  startsOn: string;
  endsOn: string;
}

/**
 * A period where someone is away from campus but still reachable.
 *
 * Travel deliberately does NOT block — by the Director's decision a meeting in
 * a travel week goes ahead online rather than slipping. So an away period never
 * removes a slot; it flips the meeting's mode and raises a flag for the
 * approval screen.
 *
 * NOTE: nothing in MyJKKN records travel today. This input exists so the rule is
 * implemented rather than forgotten, and defaults to empty — with no away data
 * the engine simply proposes everything in person, which is what happens today.
 */
export interface SlateAwayPeriod {
  profileId: string;
  startsOn: string;
  endsOn: string;
  label?: string;
}

/**
 * One person's free slot starts for the month, ALREADY computed by
 * computeSlots() against their windows, overrides and existing bookings.
 *
 * ISO 8601 UTC instants, exactly as Slot.start.
 */
export interface SlateAvailability {
  profileId: string;
  /**
   * The meeting length these starts were computed for.
   *
   * Availability is duration-dependent and there is no way around it: a 10:00
   * start is free for a 60-minute meeting and not free for a 120-minute one if
   * something sits at 11:30. So the caller computes one set per distinct series
   * duration, and the engine matches on (profileId, durationMin).
   *
   * Optional for the simple case where every series runs the same length —
   * an entry with no durationMin answers for any duration.
   */
  durationMin?: number;
  freeStarts: readonly string[];
}

export interface ProposeSlateInput {
  /** The month being proposed, "YYYY-MM". Used only for labelling and range checks. */
  month: string;
  series: readonly SlateSeries[];
  /** Every active institution id, in display order. */
  allInstitutionIds: readonly string[];
  /** The global rotation order (institution ids by position). */
  rotationOrder: readonly string[];
  blockedPeriods?: readonly SlateBlockedPeriod[];
  awayPeriods?: readonly SlateAwayPeriod[];
  availability: readonly SlateAvailability[];
  /** IANA zone the blocked/away calendar dates are expressed in. */
  timezone?: string;
}

// ============================================================================
// OUTPUT
// ============================================================================

export type SlateMode = 'in_person' | 'online';

export interface ProposedMeeting {
  seriesId: string;
  seriesName: string;
  institutionId: string;
  /** 1-based: the 2nd of 4 weekly occurrences for that college this month. */
  occurrence: number;
  /** ISO 8601 UTC instant. */
  start: string;
  /** ISO 8601 UTC instant. */
  end: string;
  durationMin: number;
  mode: SlateMode;
  requiredProfileIds: string[];
  optionalProfileIds: string[];
  /**
   * Why this is online when the series would normally be in person — the
   * approval screen surfaces these at the top for confirmation.
   */
  onlineBecause?: string;
}

export type UnplaceableReason =
  | 'no_shared_availability'
  | 'all_candidates_blocked'
  | 'all_candidates_taken'
  | 'cannot_be_online'
  | 'no_rotation_position';

export interface UnplaceableMeeting {
  seriesId: string;
  seriesName: string;
  institutionId: string;
  occurrence: number;
  reason: UnplaceableReason;
  /** A sentence the EAO can act on, not an error code. */
  detail: string;
}

export interface ProposedSlate {
  month: string;
  placed: ProposedMeeting[];
  unplaceable: UnplaceableMeeting[];
  /**
   * The rotation cursor each series should carry AFTER this month — persist it
   * on APPROVAL, never on generation. Regenerating a month must not advance the
   * rotation, or the order would drift every time the EAO pressed the button.
   */
  nextRotationCursor: Record<string, number>;
}

// ============================================================================
// INTERNALS
// ============================================================================

/** How many times a cadence runs inside one month. */
export function occurrencesPerMonth(cadence: SeriesCadence): number {
  switch (cadence) {
    case 'weekly':
      return 4;
    case 'fortnightly':
      return 2;
    case 'twice_monthly':
      return 2;
    case 'monthly':
    default:
      return 1;
  }
}

/** "YYYY-MM-DD" for an instant, in the given zone. */
function localDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** Local weekday 0..6 (Sunday = 0) for an instant, in the given zone. */
function localWeekday(iso: string, timezone: string): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(new Date(iso));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/** Minutes past local midnight for an instant, in the given zone. */
function localMinuteOfDay(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

/** Inclusive date-range test on "YYYY-MM-DD" strings (lexicographic is correct). */
function withinRange(date: string, startsOn: string, endsOn: string): boolean {
  return date >= startsOn && date <= endsOn;
}

interface Claim {
  startMs: number;
  endMs: number;
}

/** Does [aStart,aEnd) overlap any interval already claimed for this person? */
function clashes(claims: readonly Claim[], startMs: number, endMs: number): boolean {
  return claims.some((c) => startMs < c.endMs && c.startMs < endMs);
}

/**
 * Rank candidate slots against the series' stated preference.
 *
 * Preferred weekday first, then nearest to the preferred start minute, then
 * earliest. Sorting is total and deterministic — ties break on the instant
 * itself so two runs can never disagree.
 */
function rankCandidates(
  starts: readonly string[],
  series: SlateSeries,
  timezone: string,
): string[] {
  return [...starts].sort((a, b) => {
    if (series.preferredWeekday !== null) {
      const aw = localWeekday(a, timezone) === series.preferredWeekday ? 0 : 1;
      const bw = localWeekday(b, timezone) === series.preferredWeekday ? 0 : 1;
      if (aw !== bw) return aw - bw;
    }
    if (series.preferredStartMinute !== null) {
      const ad = Math.abs(localMinuteOfDay(a, timezone) - series.preferredStartMinute);
      const bd = Math.abs(localMinuteOfDay(b, timezone) - series.preferredStartMinute);
      if (ad !== bd) return ad - bd;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/**
 * Slots where EVERY required person is free.
 *
 * Same contract as intersectCollectiveSlots(), expressed over plain instants so
 * this file stays free of the Slot wrapper. A person with no availability entry
 * is treated as free for NOTHING — the honest reading: we do not know their
 * calendar, so we must not place a meeting they are required at.
 */
function sharedFreeStarts(
  requiredProfileIds: readonly string[],
  availability: readonly SlateAvailability[],
  durationMin: number,
): string[] {
  if (requiredProfileIds.length === 0) return [];

  // Exact duration match wins; an entry with no durationMin answers for any
  // length. Anything computed for a DIFFERENT duration is not evidence about
  // this one and is ignored rather than borrowed — borrowing a 60-minute
  // answer for a 120-minute meeting is how a meeting gets booked over the
  // thing that follows it.
  const pick = (pid: string): Set<string> | null => {
    const exact = availability.find(
      (a) => a.profileId === pid && a.durationMin === durationMin,
    );
    if (exact) return new Set(exact.freeStarts);
    const any = availability.find(
      (a) => a.profileId === pid && a.durationMin === undefined,
    );
    return any ? new Set(any.freeStarts) : null;
  };

  const first = pick(requiredProfileIds[0]);
  if (!first) return [];

  let shared = [...first];
  for (const pid of requiredProfileIds.slice(1)) {
    const theirs = pick(pid);
    if (!theirs) return [];
    shared = shared.filter((s) => theirs.has(s));
    if (shared.length === 0) return [];
  }
  return shared.sort();
}

// ============================================================================
// THE ENGINE
// ============================================================================

/**
 * Propose one month of recurring meetings.
 *
 * Order of play:
 *   1. Series run in priority order (lower first) — that is how two series
 *      wanting the same slot are resolved, per the spec.
 *   2. Within a series, colleges pick in the ROTATION order rotated by that
 *      series' cursor. Whoever went first last cycle goes later this cycle.
 *   3. A slot is claimed against every required person, so the same person is
 *      never double-booked. There is deliberately NO cap on meetings per day —
 *      only the overlap rule.
 *
 * Nothing is booked and nothing is mutated.
 */
export function proposeMonthlySlate(input: ProposeSlateInput): ProposedSlate {
  const timezone = input.timezone ?? 'Asia/Kolkata';
  const blocked = input.blockedPeriods ?? [];
  const away = input.awayPeriods ?? [];

  const placed: ProposedMeeting[] = [];
  const unplaceable: UnplaceableMeeting[] = [];
  const nextRotationCursor: Record<string, number> = {};

  // Claimed intervals per person, accumulated across ALL series.
  const claimsByProfile = new Map<string, Claim[]>();

  const activeSeries = [...input.series]
    .filter((s) => s.units !== undefined)
    .sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.name.localeCompare(b.name)));

  for (const series of activeSeries) {
    const { covered } = resolveCoveredInstitutions({
      coverageMode: series.coverageMode,
      allInstitutionIds: input.allInstitutionIds,
      units: series.units,
    });

    const { required, optional } = resolveRequiredAttendees({
      hostProfileId: series.hostProfileId,
      attendees: series.attendees,
    });

    // Rotation decides the PICK ORDER, not the membership. A covered college
    // absent from the rotation order still gets a turn — it goes last rather
    // than being silently skipped, and the omission is reported.
    const rotated = rotateOrder(input.rotationOrder, series.rotationCursor);
    const inRotation = rotated.filter((id) => covered.includes(id));
    const missingFromRotation = covered.filter((id) => !input.rotationOrder.includes(id));
    const pickOrder = [...inRotation, ...missingFromRotation];

    nextRotationCursor[series.id] =
      input.rotationOrder.length === 0
        ? series.rotationCursor
        : (series.rotationCursor + 1) % input.rotationOrder.length;

    const shared = sharedFreeStarts(required, input.availability, series.durationMin);
    const ranked = rankCandidates(shared, series, timezone);
    const occurrences = occurrencesPerMonth(series.cadence);
    const durationMs = series.durationMin * 60_000;

    for (const institutionId of pickOrder) {
      for (let occurrence = 1; occurrence <= occurrences; occurrence += 1) {
        const note = (reason: UnplaceableReason, detail: string) =>
          unplaceable.push({
            seriesId: series.id,
            seriesName: series.name,
            institutionId,
            occurrence,
            reason,
            detail,
          });

        if (ranked.length === 0) {
          note(
            'no_shared_availability',
            required.length === 1
              ? 'The host has no free slot at all in this month.'
              : `No time in this month is free for all ${required.length} required people at once.`,
          );
          continue;
        }

        // Walk the ranked candidates and take the first LEGAL one.
        let chosen: string | null = null;
        let chosenMode: SlateMode = 'in_person';
        let chosenOnlineBecause: string | undefined;
        let sawBlocked = false;
        let sawTaken = false;
        let sawOnlineOnly = false;

        for (const start of ranked) {
          const startMs = Date.parse(start);
          const endMs = startMs + durationMs;
          const date = localDate(start, timezone);

          // Holidays and festivals stop a slot outright — global rows, or rows
          // recorded against THIS college.
          const block = blocked.find(
            (b) =>
              (b.institutionId === null || b.institutionId === institutionId) &&
              withinRange(date, b.startsOn, b.endsOn),
          );
          if (block) {
            sawBlocked = true;
            continue;
          }

          // Nobody required may already be busy at this instant.
          const taken = required.some((pid) =>
            clashes(claimsByProfile.get(pid) ?? [], startMs, endMs),
          );
          if (taken) {
            sawTaken = true;
            continue;
          }

          // Travel does not block: it turns the meeting online. A series that
          // cannot be held online loses this slot instead.
          const travelling = away.find(
            (a) => required.includes(a.profileId) && withinRange(date, a.startsOn, a.endsOn),
          );
          if (travelling && !series.mayBeOnline) {
            sawOnlineOnly = true;
            continue;
          }

          chosen = start;
          if (travelling) {
            chosenMode = 'online';
            chosenOnlineBecause =
              travelling.label ?? 'A required attendee is away on this date.';
          }
          break;
        }

        if (!chosen) {
          if (sawTaken) {
            note(
              'all_candidates_taken',
              'Every time that suits this meeting is already held by a higher-priority meeting this month.',
            );
          } else if (sawBlocked) {
            note(
              'all_candidates_blocked',
              'Every available time this month falls inside a public holiday or festival.',
            );
          } else if (sawOnlineOnly) {
            note(
              'cannot_be_online',
              'The only free times fall in a week someone is away, and this series is not marked as one that may be held online.',
            );
          } else {
            note(
              'no_shared_availability',
              'No remaining time in this month works for everyone required.',
            );
          }
          continue;
        }

        const startMs = Date.parse(chosen);
        const endMs = startMs + durationMs;
        for (const pid of required) {
          const list = claimsByProfile.get(pid) ?? [];
          list.push({ startMs, endMs });
          claimsByProfile.set(pid, list);
        }

        placed.push({
          seriesId: series.id,
          seriesName: series.name,
          institutionId,
          occurrence,
          start: chosen,
          end: new Date(endMs).toISOString(),
          durationMin: series.durationMin,
          mode: chosenMode,
          requiredProfileIds: [...required],
          optionalProfileIds: [...optional],
          ...(chosenOnlineBecause ? { onlineBecause: chosenOnlineBecause } : {}),
        });
      }
    }

    if (missingFromRotation.length > 0 && input.rotationOrder.length > 0) {
      for (const institutionId of missingFromRotation) {
        unplaceable.push({
          seriesId: series.id,
          seriesName: series.name,
          institutionId,
          occurrence: 0,
          reason: 'no_rotation_position',
          detail:
            'This college is covered by the series but has no position in the rotation order, so it always picks last. Add it on the Scheduling rules screen.',
        });
      }
    }
  }

  return { month: input.month, placed, unplaceable, nextRotationCursor };
}
