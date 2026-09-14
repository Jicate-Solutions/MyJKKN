'use client';

// "Is this person already booked that day?" for the three apply forms.
//
// WHY AN RPC AND NOT A CLIENT-SIDE SCAN. The leave drawer used to answer this
// from the caller's own application list, which was wrong twice over: it
// filtered to request_category='leave' — the exact bug that let a permission,
// a half-day leave and a comp-off claim all land on one date — and it read a
// list the applications route caps at 50 rows, so a busy person's older
// requests fell out of the window entirely.
//
// fn_hr_day_occupancy_check wraps fn_hr_day_occupancy_clash, which is the SAME
// body trg_hla_leave_overlap and trg_hcoc_day_occupancy raise on. The warning
// and the refusal therefore cannot disagree — the discipline
// fn_hr_leave_biometric_gap already enforces between the approvals queue and
// the attendance gate.
//
// It is a courtesy, not a guarantee: the triggers are the enforcement point, so
// a stale answer here costs a round trip and never a double booking.

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

const KEY = 'hr-day-occupancy';

/**
 * Returns a human sentence naming the request already occupying any day in
 * [from, to] — "Permission (Hourly) on 25/09/2026, 09:05-09:35 (approved)" — or
 * null when the range is free.
 *
 * Null is also what a caller with no business asking gets back; the RPC answers
 * for yourself, a super admin, or a leave approver and stays silent otherwise.
 * Silence reads as "no clash", which is the safe direction: the trigger still
 * refuses the write.
 */
export function useDayOccupancy(
  employeeId: string | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined
) {
  const supabase = createClientSupabaseClient();

  return useQuery({
    queryKey: [KEY, employeeId ?? null, from ?? null, to ?? null],
    // `from <= to` guards the half-typed range a date input produces while the
    // second field is still empty or behind the first.
    enabled: Boolean(employeeId && from && to && from <= to),
    queryFn: async () => {
      // `as any` on the client: types/supabase.ts is the GENERATED Database
      // type and does not know a function added by a migration until it is
      // regenerated. Same pattern as the hr_resolve_leave_ladder call in
      // LeaveService.buildApprovalChain.
      const { data, error } = await (supabase as any).rpc('fn_hr_day_occupancy_check', {
        p_employee_id: employeeId,
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    // Long enough that dragging a date picker does not fire a request per
    // keystroke, short enough that cancelling a clashing request and coming
    // straight back re-asks.
    staleTime: 30_000,
  });
}
