// lib/services/meetings/native-slot-engine.ts
//
// PURE slot-computation engine — Phase N1 of the native scheduling platform
// (replaces Cal.com's slot logic). No DB, no clock, no network: every input is
// a parameter, which is what makes the engine adversarially unit-testable
// (__tests__/meetings/native-slot-engine.test.ts).
//
// Model (mirrors the migration 20260611190000 schema):
//   * Weekly windows: { weekday 0=Sun…6=Sat, startMinute, endMinute } —
//     minutes-since-midnight INTERPRETED IN THE SCHEDULE'S IANA TIMEZONE.
//   * Overrides: if ANY override rows exist for a calendar date, they REPLACE
//     that date's weekly windows. A null/null row closes the day.
//   * Bookings: confirmed [start,end) instants; a candidate slot padded by the
//     meeting type's buffers must not overlap any of them.
//
// Timezone correctness WITHOUT a tz library: the standard two-pass offset
// resolution over Intl.DateTimeFormat (same algorithm as date-fns-tz
// zonedTimeToUtc). India is fixed +05:30 (no DST), but the engine stays
// correct for DST zones — multi-tenant deployments may host anywhere.

// ============================================================================
// TYPES
// ============================================================================

export interface EngineWindow {
  /** 0 = Sunday … 6 = Saturday (matches Date.getUTCDay + the DB CHECK). */
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface EngineOverride {
  /** Calendar date "YYYY-MM-DD" in the schedule's timezone. */
  date: string;
  /** null/null = closed all day. */
  startMinute: number | null;
  endMinute: number | null;
}

export interface EngineBooking {
  /** ISO instant or Date — confirmed bookings of the HOST (any meeting type). */
  start: string | Date;
  end: string | Date;
}

export interface ComputeSlotsInput {
  /** IANA zone the windows/overrides are expressed in, e.g. "Asia/Kolkata". */
  timezone: string;
  durationMin: number;
  windows: EngineWindow[];
  overrides?: EngineOverride[];
  bookings?: EngineBooking[];
  /** Candidate is padded by these when checking conflicts. Default 0/0. */
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  /** Earliest bookable instant = now + minNoticeMin. Default 0. */
  minNoticeMin?: number;
  /** Step between candidate starts. Default = durationMin. */
  slotIntervalMin?: number;
  /** Inclusive range of calendar dates (schedule TZ), "YYYY-MM-DD". */
  fromDate: string;
  toDate: string;
  /** The clock — injected for determinism. */
  now: Date;
}

export interface Slot {
  /** ISO 8601 UTC instant of the slot start. */
  start: string;
}

// ============================================================================
// VARIANT TYPES (Wave-3: group / collective / round_robin)
// ============================================================================

export type MeetingKind = 'solo' | 'group' | 'collective' | 'round_robin';

/** A confirmed booking already counted against a GROUP slot. */
export interface GroupSlotUsage {
  /** ISO instant of the slot start the booking occupies. */
  start: string;
  /** confirmed bookings currently holding that start (>= 1). */
  count: number;
}

/** A group slot with its remaining free seats (capacity − confirmed). */
export interface GroupSlot extends Slot {
  /** seats still bookable; always >= 1 (full slots are dropped). */
  seatsLeft: number;
}

/** One candidate host for round-robin selection. */
export interface RoundRobinCandidate {
  hostProfileId: string;
  /**
   * ISO instant this host was last booked, or null if never booked.
   * Least-recently-booked (null sorts as "longest ago") is preferred.
   */
  lastBookedAt: string | null;
}

// ============================================================================
// TIMEZONE PRIMITIVES
// ============================================================================

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getDtf(timeZone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    dtfCache.set(timeZone, dtf);
  }
  return dtf;
}

/** Offset of `timeZone` from UTC at the given instant, in milliseconds. */
function tzOffsetMs(utcInstant: Date, timeZone: string): number {
  const parts: Record<string, string> = {};
  for (const p of getDtf(timeZone).formatToParts(utcInstant)) {
    parts[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === '24' ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - utcInstant.getTime();
}

/**
 * Convert (calendar date, minutes-since-midnight) in `timeZone` to a UTC
 * instant. Two-pass refinement handles DST transition days; for skipped local
 * times (spring-forward gap) this resolves to the post-transition mapping,
 * matching date-fns-tz behaviour.
 */
export function zonedToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  minuteOfDay: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  let offset = tzOffsetMs(new Date(naive), timeZone);
  offset = tzOffsetMs(new Date(naive - offset), timeZone);
  return new Date(naive - offset);
}

// ============================================================================
// DATE ITERATION (calendar dates are tz-independent labels)
// ============================================================================

function parseDateLabel(label: string): { y: number; m: number; d: number } {
  const [y, m, d] = label.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date label: ${label}`);
  return { y, m, d };
}

function dateLabel(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Weekday (0=Sun…6=Sat) of a calendar date label — pure calendar math. */
function weekdayOf(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function nextDay(y: number, m: number, d: number): { y: number; m: number; d: number } {
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + 1);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

// ============================================================================
// ENGINE
// ============================================================================

/**
 * Compute bookable slots. Deterministic; throws only on malformed input.
 * Returned slots are sorted ascending and unique.
 */
export function computeSlots(input: ComputeSlotsInput): Slot[] {
  const {
    timezone,
    durationMin,
    windows,
    overrides = [],
    bookings = [],
    bufferBeforeMin = 0,
    bufferAfterMin = 0,
    minNoticeMin = 0,
    fromDate,
    toDate,
    now,
  } = input;
  const slotIntervalMin = input.slotIntervalMin ?? durationMin;

  if (!Number.isFinite(durationMin) || durationMin <= 0) {
    throw new Error('durationMin must be a positive number');
  }
  if (!Number.isFinite(slotIntervalMin) || slotIntervalMin <= 0) {
    throw new Error('slotIntervalMin must be a positive number');
  }

  // index overrides by date
  const overridesByDate = new Map<string, EngineOverride[]>();
  for (const o of overrides) {
    const list = overridesByDate.get(o.date) ?? [];
    list.push(o);
    overridesByDate.set(o.date, list);
  }

  // normalise bookings to ms ranges
  const busy = bookings.map((b) => ({
    start: new Date(b.start).getTime(),
    end: new Date(b.end).getTime(),
  }));

  const earliestStartMs = now.getTime() + minNoticeMin * 60_000;
  const durMs = durationMin * 60_000;
  const bufBeforeMs = bufferBeforeMin * 60_000;
  const bufAfterMs = bufferAfterMin * 60_000;

  const out: Slot[] = [];
  const seen = new Set<number>();

  let { y, m, d } = parseDateLabel(fromDate);
  const end = parseDateLabel(toDate);
  const endLabel = dateLabel(end.y, end.m, end.d);

  // hard cap: 366 days per call (engine guard, callers clamp earlier)
  for (let i = 0; i < 366; i++) {
    const label = dateLabel(y, m, d);

    // effective windows for this date
    const dayOverrides = overridesByDate.get(label);
    let dayWindows: Array<{ startMinute: number; endMinute: number }>;
    if (dayOverrides) {
      dayWindows = dayOverrides
        .filter((o) => o.startMinute != null && o.endMinute != null)
        .map((o) => ({ startMinute: o.startMinute!, endMinute: o.endMinute! }));
    } else {
      const wd = weekdayOf(y, m, d);
      dayWindows = windows.filter((w) => w.weekday === wd);
    }

    for (const w of dayWindows) {
      for (
        let startMin = w.startMinute;
        startMin + durationMin <= w.endMinute;
        startMin += slotIntervalMin
      ) {
        const startUtc = zonedToUtc(y, m, d, startMin, timezone);
        const startMs = startUtc.getTime();
        if (startMs < earliestStartMs) continue;
        if (seen.has(startMs)) continue;

        // conflict check with buffers padding the CANDIDATE
        const candStart = startMs - bufBeforeMs;
        const candEnd = startMs + durMs + bufAfterMs;
        const clash = busy.some((b) => candStart < b.end && candEnd > b.start);
        if (clash) continue;

        seen.add(startMs);
        out.push({ start: startUtc.toISOString() });
      }
    }

    if (label === endLabel) break;
    ({ y, m, d } = nextDay(y, m, d));
  }

  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

/**
 * Group slots by the calendar date they fall on IN A DISPLAY TIMEZONE —
 * the shape the public booking widget consumes ({ "YYYY-MM-DD": [{start}] }).
 */
export function groupSlotsByDate(
  slots: Slot[],
  displayTimeZone: string,
): Record<string, Slot[]> {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: displayTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const grouped: Record<string, Slot[]> = {};
  for (const s of slots) {
    const key = fmt.format(new Date(s.start));
    (grouped[key] ??= []).push(s);
  }
  return grouped;
}

// ============================================================================
// VARIANT ENGINES (pure — no DB, no clock, no network)
// ============================================================================

/**
 * GROUP capacity filter. The solo engine drops a slot the moment a single
 * booking overlaps it; a GROUP slot instead has `capacity` seats and stays
 * bookable until that many CONFIRMED bookings hold the exact slot start.
 *
 * The caller therefore computes the host's "structural" slots WITHOUT passing
 * the group's own confirmed bookings as conflicts (so the slot is still
 * generated), then passes the per-start confirmed counts here. A slot with
 * confirmed >= capacity is removed; otherwise it carries its remaining seats.
 *
 * capacity <= 1 (or NULL upstream → 1) collapses to solo semantics: the first
 * booking fills the only seat and the slot disappears.
 */
export function applyGroupCapacity(
  slots: Slot[],
  capacity: number,
  usage: GroupSlotUsage[],
): GroupSlot[] {
  const cap = Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : 1;
  const taken = new Map<string, number>();
  for (const u of usage) {
    // normalise the key to the canonical ISO the slots use
    const key = new Date(u.start).toISOString();
    taken.set(key, (taken.get(key) ?? 0) + Math.max(0, Math.floor(u.count)));
  }
  const out: GroupSlot[] = [];
  for (const s of slots) {
    const used = taken.get(s.start) ?? 0;
    const seatsLeft = cap - used;
    if (seatsLeft > 0) out.push({ start: s.start, seatsLeft });
  }
  return out;
}

/**
 * COLLECTIVE intersection. A collective slot is offered only when EVERY
 * required host can make it. Each host independently yields a set of slots
 * (same windows, each host's own busy set); the collective offering is the
 * INTERSECTION of those start instants.
 *
 * `perHostSlots` is one Slot[] per required host (any order). An empty input
 * (no hosts) yields nothing — a collective with no hosts can't meet. The result
 * is sorted ascending and unique.
 */
export function intersectCollectiveSlots(perHostSlots: Slot[][]): Slot[] {
  if (perHostSlots.length === 0) return [];
  // Start from the first host's instants, keep only those every other host has.
  let common = new Set(perHostSlots[0].map((s) => s.start));
  for (let i = 1; i < perHostSlots.length && common.size > 0; i++) {
    const next = new Set(perHostSlots[i].map((s) => s.start));
    common = new Set([...common].filter((iso) => next.has(iso)));
  }
  return [...common].sort((a, b) => a.localeCompare(b)).map((start) => ({ start }));
}

/**
 * ROUND-ROBIN host selection. Among the candidate pool, pick the
 * least-recently-booked host (a never-booked host — lastBookedAt null — is the
 * "longest ago" and wins first). Ties broken deterministically by hostProfileId
 * so the choice is stable and testable. Returns null for an empty pool.
 *
 * This only PICKS the host; the caller then computes/validates that host's slot
 * the normal (solo) way. Load-balancing is therefore a function of historical
 * bookings, recomputed on every request — no stored cursor to drift.
 */
export function pickRoundRobinHost(
  candidates: RoundRobinCandidate[],
): string | null {
  if (candidates.length === 0) return null;
  const ranked = [...candidates].sort((a, b) => {
    // null lastBookedAt = never booked = highest priority (sorts first).
    if (a.lastBookedAt === null && b.lastBookedAt === null) {
      return a.hostProfileId.localeCompare(b.hostProfileId);
    }
    if (a.lastBookedAt === null) return -1;
    if (b.lastBookedAt === null) return 1;
    const cmp = a.lastBookedAt.localeCompare(b.lastBookedAt);
    if (cmp !== 0) return cmp; // earlier (older) last-booking first
    return a.hostProfileId.localeCompare(b.hostProfileId);
  });
  return ranked[0].hostProfileId;
}
