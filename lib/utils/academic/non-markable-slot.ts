/**
 * Whether a timetable slot must be left out of a faculty's markable periods.
 *
 * Added: 2026-09-28 (BUG-005817) - Two flags mark a break and they can disagree:
 * the master `periods.is_break` and the slot's own `is_break_slot`. The cycle
 * path only read the former, but the "Break" / "Lunch Break" master rows at JKKN
 * Arts & Science are is_break=false, so a slot flagged is_break_slot=true that
 * still carried a course + staff surfaced in "My Classes" as a real hour.
 */
export function isNonMarkableSlot(
  slot: { is_break_slot?: boolean | null; [key: string]: unknown } | null | undefined,
  periodDef: { is_break?: boolean | null; [key: string]: unknown } | null | undefined
): boolean {
  return !!slot?.is_break_slot || !!periodDef?.is_break;
}
