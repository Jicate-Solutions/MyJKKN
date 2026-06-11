// Shared date/time helpers for the resident housekeeping slot-booking page.
// Spec: specs/housekeeping-slot-booking-spec-2026-06-10.md §"UI surfaces → Agent C"
//
// All slot times arrive as 'HH:MM' (from fn_housekeeping_available_slots) or
// 'HH:MM:SS' (postgres time on hostel_cleaning_bookings rows); all dates are
// local ISO 'YYYY-MM-DD'. Helpers stay timezone-naive on purpose — the hostel
// and its residents share one timezone.

/** Local date → 'YYYY-MM-DD' (no UTC shift — toISOString would be wrong near midnight IST). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/** ISO date + N days → ISO date. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Inclusive list of ISO dates from `startISO` for `count` days. */
export function dateRange(startISO: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDaysISO(startISO, i));
}

/** 'HH:MM' | 'HH:MM:SS' → 12-hour display, e.g. '09:10' → '9:10 AM'. */
export function formatSlotTime(t: string): string {
  const [hStr, mStr] = t.split(':');
  const h = Number(hStr);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${suffix}`;
}

/** ISO date + 'HH:MM[:SS]' → local Date. */
export function slotDateTime(dateISO: string, time: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/**
 * True once the slot's START has passed — conservative boundary matching the
 * server's 'past_slot' rejection in fn_housekeeping_book_slot, so the grid
 * never offers a slot the RPC would refuse.
 */
export function isPastSlot(dateISO: string, slotStart: string, now: Date): boolean {
  return slotDateTime(dateISO, slotStart).getTime() <= now.getTime();
}

/** Chip labels for the date strip, e.g. { weekday: 'Mon', day: '15', month: 'Jun' }. */
export function dateChipParts(iso: string): {
  weekday: string;
  day: string;
  month: string;
} {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    weekday: date.toLocaleDateString('en-IN', { weekday: 'short' }),
    day: String(d),
    month: date.toLocaleDateString('en-IN', { month: 'short' }),
  };
}

/** Friendly long date, e.g. 'Mon, 15 Jun'. */
export function formatBookingDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
