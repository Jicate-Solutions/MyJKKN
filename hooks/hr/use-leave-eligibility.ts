'use client';

/**
 * Eligibility for gated leave types — React Query hooks.
 * Created: 2026-09-19.
 *
 * Every mutation invalidates the LEAVE BALANCES too, not just the eligibility
 * list. Approving or revoking one of these changes which leave types the
 * balance view returns for that person, so a screen holding a cached balance
 * list would keep offering a type they just lost, or keep hiding one they just
 * gained, until something else happened to refetch it.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  LeaveEligibilityService,
  type GrantEligibilityInput,
  type RequestEligibilityInput,
} from '@/lib/services/hr/leave-eligibility-service';
import type { LeaveEligibility, LeaveEligibilityStatus } from '@/types/hr-leave-types';

const KEY = 'hr-leave-eligibility';
/** The key useLeaveBalance uses (hooks/hr/use-leave.ts) — where the Apply
 *  Leave type list actually comes from. */
const BALANCES_KEY = 'hr-leave-balance';

/** What this staff member holds, across every gated type. */
export function useMyLeaveEligibilities(employeeId: string | undefined) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'staff', employeeId],
    queryFn: () => LeaveEligibilityService.listForStaff(supabase, employeeId!),
    enabled: Boolean(employeeId),
  });
}

/** The admin list for one institution. */
export function useLeaveEligibilities(
  hrOrgId: string | undefined,
  status?: LeaveEligibilityStatus
) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'org', hrOrgId, status ?? 'any'],
    queryFn: () => LeaveEligibilityService.listForOrg(supabase, hrOrgId!, status),
    enabled: Boolean(hrOrgId),
  });
}

/**
 * Requests waiting on a decision.
 *
 * @param enabled false until the caller is known to be an approver, so a
 *   staff member with no queue does not fire a request that returns nothing.
 */
export function usePendingLeaveEligibilities(enabled: boolean) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'pending'],
    queryFn: () => LeaveEligibilityService.listPendingForApprover(supabase),
    enabled,
  });
}

export interface RequestableGatedType {
  leave_type_id: string;
  leave_type_name: string;
  color_code: string;
  /** null = never asked. Otherwise the live or last request/grant. */
  status: LeaveEligibilityStatus | null;
  /** The approver's note on a rejection, so the person can act on it. */
  decision_note: string | null;
}

/**
 * Gated leave types this person could ask for, with where they stand on each.
 *
 * READ FROM hr_leave_types, NOT FROM THE BALANCE VIEW — that is the whole
 * point. The view hides a gated type until eligibility is approved, so a
 * balance-derived list can never show the one the user needs to request. The
 * hlt_select policy admits staff to their own organisation's types, so this
 * reads fine as an ordinary member of staff.
 *
 * An APPROVED type is dropped by default: in the Apply Leave drawer it is
 * already in the normal list with a balance, and showing it twice would be
 * confusing. The Eligibility page passes includeApproved so a person can see
 * "you hold this" beside "you could ask for that".
 */
export function useRequestableGatedTypes(
  hrOrgId: string | undefined,
  employeeId: string | undefined,
  includeApproved = false
) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'requestable', hrOrgId, employeeId, includeApproved],
    queryFn: async (): Promise<RequestableGatedType[]> => {
      const [{ data: types, error: tErr }, mine] = await Promise.all([
        supabase
          .from('hr_leave_types')
          .select('id, leave_type_name, color_code')
          .eq('hr_organization_id', hrOrgId!)
          .eq('requires_eligibility', true)
          .eq('is_active', true)
          .eq('request_category', 'leave'),
        LeaveEligibilityService.listForStaff(supabase, employeeId!),
      ]);
      if (tErr) throw tErr;

      // listForStaff is newest-first, so the first hit per type is the current
      // state — a re-request after a rejection shadows the rejection.
      const byType = new Map<string, (typeof mine)[number]>();
      for (const e of mine) if (!byType.has(e.leave_type_id)) byType.set(e.leave_type_id, e);

      return ((types ?? []) as Array<{ id: string; leave_type_name: string; color_code: string }>)
        .map((t) => {
          const e = byType.get(t.id);
          return {
            leave_type_id: t.id,
            leave_type_name: t.leave_type_name,
            color_code: t.color_code,
            status: e?.status ?? null,
            decision_note: e?.decision_note ?? null,
          };
        })
        .filter((t) => includeApproved || t.status !== 'approved');
    },
    enabled: Boolean(hrOrgId) && Boolean(employeeId),
  });
}

/** Everything that changes which leave types a person can see. */
function useInvalidateEligibility() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: [KEY] });
    void qc.invalidateQueries({ queryKey: [BALANCES_KEY] });
  };
}

/**
 * Should this caller see HR → Leave → Eligibility?
 *
 * Its own RPC rather than useCanApproveLeave: since 2026-09-21 an eligibility
 * flow can name people who approve no leave at all (an HR officer reading PH.D
 * certificates), and they would otherwise never find the queue.
 */
export function useCanDecideEligibility() {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'can-decide'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('hr_can_decide_eligibility');
      if (error) throw error;
      return Boolean(data);
    },
    // Capability is flow-derived and does not change mid-session.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The two mutations that must tell somebody go through a server route: the
 * recipients are resolved with the service-role client (role holders are not
 * readable by the person filing), and a route is the only place that client
 * may exist. grant() and revoke() stay direct — HR-initiated, nobody to notify.
 */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json.data as T;
}

export function useRequestLeaveEligibility() {
  const invalidate = useInvalidateEligibility();
  return useMutation({
    // createdBy is set server-side from the session; the body never carries it.
    mutationFn: (input: Omit<RequestEligibilityInput, 'createdBy'>) =>
      postJson<LeaveEligibility>('/api/hr/leave/eligibility', input),
    onSuccess: invalidate,
  });
}

export function useDecideLeaveEligibility() {
  const invalidate = useInvalidateEligibility();
  return useMutation({
    mutationFn: (input: { eligibilityId: string; approve: boolean; note: string | null }) =>
      postJson<LeaveEligibility>(`/api/hr/leave/eligibility/${input.eligibilityId}/decide`, {
        approve: input.approve,
        note: input.note,
      }),
    onSuccess: invalidate,
  });
}

export function useGrantLeaveEligibility() {
  const supabase = createClientSupabaseClient();
  const invalidate = useInvalidateEligibility();
  return useMutation({
    mutationFn: (input: GrantEligibilityInput) =>
      LeaveEligibilityService.grant(supabase, input),
    onSuccess: invalidate,
  });
}

export function useRevokeLeaveEligibility() {
  const supabase = createClientSupabaseClient();
  const invalidate = useInvalidateEligibility();
  return useMutation({
    mutationFn: (input: { eligibilityId: string; reason: string; revokerProfileId: string }) =>
      LeaveEligibilityService.revoke(
        supabase,
        input.eligibilityId,
        input.reason,
        input.revokerProfileId
      ),
    onSuccess: invalidate,
  });
}
