/**
 * CDC drive clash detection — a PURE predicate. No I/O, no Supabase, no React.
 *
 * Why this exists: on 17 Sep 2026 the Foxconn India and INDO-MIM drives were
 * both scheduled 10:00–16:00 on the same day in the SAME venue (Senthuraja
 * Hall). Nothing warned anybody. 11 learners had said yes to both and could not
 * physically attend both.
 *
 * Two kinds of clash:
 *   (a) VENUE  — another drive holds the same venue on the same date with
 *                overlapping times.
 *   (b) LEARNER-IMPACT — learners have already said yes to another drive on the
 *                same date, so a new or moved drive lands on top of them.
 *
 * A clash is a WARNING, never a block: the coordinator can still save
 * (Director ruling, 2026-09-18).
 *
 * MISSING DATA CANNOT CLASH. A drive with no date, or without BOTH a start and
 * an end time, is not scheduled enough to occupy a room — so it produces no
 * venue clash. Learner-impact needs only the date on both sides, because a
 * learner's day is taken whatever the clock says.
 */

/** A drive whose status means it no longer holds its slot. */
export const CLASH_IGNORED_STATUSES: readonly string[] = ['cancelled'];

/** The drive being created or edited. `id` is null while it is being created. */
export interface ClashCandidateDrive {
  id: string | null;
  /** 'YYYY-MM-DD' or null. */
  drive_date: string | null;
  /** 'HH:MM' or 'HH:MM:SS' or null. */
  drive_start_time: string | null;
  drive_end_time: string | null;
  venue_label: string | null;
}

/** Every other drive the check is measured against. */
export interface ClashOtherDrive {
  id: string;
  title: string;
  status: string;
  drive_date: string | null;
  drive_start_time: string | null;
  drive_end_time: string | null;
  venue_label: string | null;
  /**
   * Learner ids that have already said yes to this drive (willing/confirmed).
   * Ids rather than a count so learners counted twice across two clashing
   * drives are only counted once.
   */
  willing_learner_ids: string[];
}

export interface VenueClash {
  drive_id: string;
  title: string;
  /** The other drive's venue, as the other coordinator typed it. */
  venue_label: string;
  drive_date: string;
  /** 'HH:MM'. */
  start_time: string;
  end_time: string;
}

export interface LearnerImpactClash {
  drive_id: string;
  title: string;
  willing_count: number;
}

export interface DriveClashReport {
  venue: VenueClash[];
  learner_impact: LearnerImpactClash[];
  /** Distinct learners across every learner_impact drive. */
  learners_affected: number;
  /** True when either kind of clash was found. */
  has_clash: boolean;
}

export const EMPTY_CLASH_REPORT: DriveClashReport = {
  venue: [],
  learner_impact: [],
  learners_affected: 0,
  has_clash: false,
};

/**
 * 'HH:MM' / 'HH:MM:SS' → minutes since midnight. Anything else → null.
 * A missing time is not "midnight"; it is "unknown", and unknown cannot clash.
 */
export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 'HH:MM:SS' → 'HH:MM' for display; anything unparseable is returned as-is. */
export function formatClashTime(value: string): string {
  const mins = timeToMinutes(value);
  if (mins === null) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

/**
 * Two rooms are the same room when the typed labels match ignoring case,
 * surrounding space and repeated inner spaces. `venue_label` is free text —
 * "Senthuraja Hall" and "senthuraja  hall" are one hall.
 */
export function normalizeVenue(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Half-open overlap: [aStart, aEnd) vs [bStart, bEnd).
 * 10:00–12:00 and 12:00–14:00 touch but do NOT overlap — one room, back to back,
 * is how a campus day is normally run.
 */
export function timesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  // An empty or reversed interval occupies nothing.
  if (aEnd <= aStart || bEnd <= bStart) return false;
  return aStart < bEnd && bStart < aEnd;
}

/**
 * The predicate. Given the drive being saved and the other drives in the
 * system, return every clash. Order is stable: other drives are reported in the
 * order they were given.
 */
export function findDriveClashes(
  candidate: ClashCandidateDrive,
  others: ClashOtherDrive[]
): DriveClashReport {
  const date = candidate.drive_date;
  if (!date) return EMPTY_CLASH_REPORT;

  const candidateVenue = normalizeVenue(candidate.venue_label);
  const candidateStart = timeToMinutes(candidate.drive_start_time);
  const candidateEnd = timeToMinutes(candidate.drive_end_time);
  const candidateIsScheduled =
    candidateVenue !== null && candidateStart !== null && candidateEnd !== null;

  const venue: VenueClash[] = [];
  const learner_impact: LearnerImpactClash[] = [];
  const affected = new Set<string>();

  for (const other of others) {
    // Never clash with yourself.
    if (candidate.id !== null && other.id === candidate.id) continue;
    if (CLASH_IGNORED_STATUSES.includes(other.status)) continue;
    if (other.drive_date !== date) continue;

    if (candidateIsScheduled) {
      const otherVenue = normalizeVenue(other.venue_label);
      const otherStart = timeToMinutes(other.drive_start_time);
      const otherEnd = timeToMinutes(other.drive_end_time);
      if (
        otherVenue !== null &&
        otherVenue === candidateVenue &&
        otherStart !== null &&
        otherEnd !== null &&
        timesOverlap(candidateStart!, candidateEnd!, otherStart, otherEnd)
      ) {
        venue.push({
          drive_id: other.id,
          title: other.title,
          venue_label: other.venue_label ?? '',
          drive_date: date,
          start_time: formatClashTime(other.drive_start_time!),
          end_time: formatClashTime(other.drive_end_time!),
        });
      }
    }

    const willing = other.willing_learner_ids ?? [];
    if (willing.length > 0) {
      learner_impact.push({
        drive_id: other.id,
        title: other.title,
        willing_count: willing.length,
      });
      for (const learnerId of willing) affected.add(learnerId);
    }
  }

  return {
    venue,
    learner_impact,
    learners_affected: affected.size,
    has_clash: venue.length > 0 || learner_impact.length > 0,
  };
}
