'use client';

/**
 * Clinical duty — React Query hooks.
 * Created: 2026-10-05.
 *
 * A punch changes a day, so it invalidates everything My Attendance reads
 * (invalidateAttendanceViews) as well as the clinical state. Eligibility
 * mutations invalidate the clinical keys only — they change who sees the
 * punch card, not a day.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ClinicalDutyService } from '@/lib/services/hr/clinical-duty-service';
import { invalidateAttendanceViews } from '@/hooks/hr/use-attendance-records';
import { getErrorMessage } from '@/lib/utils';
import {
  type ClinicalEligibilityStatus,
  type ClinicalPunchResult,
  type ClinicalSiteInput,
  type GrantClinicalEligibilityInput,
  type RequestClinicalEligibilityInput,
} from '@/types/hr-clinical-duty';

const KEY = 'hr-clinical-duty';

/** Today's date in IST (yyyy-MM-dd) — the date fn_hr_clinical_punch works on. */
export function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function invalidateClinical(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [KEY] });
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export function useClinicalEligibilities(
  filters: { status?: ClinicalEligibilityStatus; institutionId?: string } = {},
  enabled = true
) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'list', filters.status ?? 'any', filters.institutionId ?? 'all'],
    queryFn: () => ClinicalDutyService.listEligibilities(supabase, filters),
    enabled,
  });
}

export function useMyClinicalEligibilities(employeeId: string | undefined) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'mine', employeeId],
    queryFn: () => ClinicalDutyService.listForStaff(supabase, employeeId!),
    enabled: Boolean(employeeId),
  });
}

export function useClinicalSites(institutionId?: string, enabled = true) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'sites', institutionId ?? 'all'],
    queryFn: () => ClinicalDutyService.listSites(supabase, institutionId),
    enabled,
  });
}

/**
 * Everything the My Attendance punch card needs, in one query: am I eligible
 * today, which sites may I punch at, what have I punched today.
 */
export function useMyClinicalToday(employeeId: string | undefined) {
  const supabase = createClientSupabaseClient();
  const date = istToday();
  return useQuery({
    queryKey: [KEY, 'today', employeeId, date],
    queryFn: async () => {
      const eligible = await ClinicalDutyService.isEligible(supabase, employeeId!, date);
      if (!eligible) return { eligible: false as const, date, sites: [], punches: [] };
      const [sites, punches] = await Promise.all([
        ClinicalDutyService.allowedSites(supabase, employeeId!, date),
        ClinicalDutyService.punchesOn(supabase, employeeId!, date),
      ]);
      return { eligible: true as const, date, sites, punches };
    },
    enabled: Boolean(employeeId),
  });
}

// ── Browser location ──────────────────────────────────────────────────────────

export interface BrowserPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

/** One high-accuracy fix, with messages written for the person holding the phone. */
export function getBrowserPosition(): Promise<BrowserPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('This device or browser cannot share its location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? 'Location access is blocked. Allow location for this site in your browser settings and try again.'
              : e.code === e.TIMEOUT
                ? 'Could not get your location in time. Move to an open area and try again.'
                : 'Your location could not be read. Turn on location services and try again.'
          )
        ),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

// ── Punch ─────────────────────────────────────────────────────────────────────

export function useClinicalPunch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ data: ClinicalPunchResult; warning?: string }> => {
      const pos = await getBrowserPosition();
      const res = await fetch('/api/hr/attendance/clinical/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pos),
      });
      // proxy.ts answers an expired session with a redirect before the handler runs.
      if (res.redirected) throw new Error('Your session expired. Sign in again.');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'The punch could not be recorded.');
      return json;
    },
    onSuccess: ({ data, warning }) => {
      toast.success(
        `Punched ${data.punch_type === 'in' ? 'in' : 'out'} at ${data.site_name} (${data.distance_m} m away)`
      );
      if (warning) toast.warning(warning);
      invalidateClinical(qc);
      invalidateAttendanceViews(qc);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

// ── Eligibility mutations ─────────────────────────────────────────────────────

export function useRequestClinicalEligibility() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (input: RequestClinicalEligibilityInput) =>
      ClinicalDutyService.request(supabase, input),
    onSuccess: () => {
      toast.success('Request sent to HR');
      invalidateClinical(qc);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useGrantClinicalEligibility() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (input: GrantClinicalEligibilityInput) =>
      ClinicalDutyService.grant(supabase, input),
    onSuccess: () => {
      toast.success('Clinical duty eligibility granted');
      invalidateClinical(qc);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useDecideClinicalEligibility() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (v: { id: string; approve: boolean; note?: string | null }) =>
      ClinicalDutyService.decide(supabase, v.id, v.approve, v.note),
    onSuccess: (_d, v) => {
      toast.success(v.approve ? 'Request approved' : 'Request rejected');
      invalidateClinical(qc);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useRevokeClinicalEligibility() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      ClinicalDutyService.revoke(supabase, v.id, v.reason),
    onSuccess: () => {
      toast.success('Eligibility revoked');
      invalidateClinical(qc);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

// ── Duty sites ────────────────────────────────────────────────────────────────

export function useClinicalStats(institutionId?: string, enabled = true) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'stats', institutionId ?? 'all'],
    queryFn: () => ClinicalDutyService.stats(supabase, institutionId),
    enabled,
  });
}

export function useDeleteClinicalSite() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (id: string) => ClinicalDutyService.deleteSite(supabase, id),
    onSuccess: () => {
      toast.success('Duty site deleted');
      invalidateClinical(qc);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useSaveClinicalSite() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: async (v: { id?: string } & ClinicalSiteInput & { isActive?: boolean }) => {
      if (v.id) {
        await ClinicalDutyService.updateSite(supabase, v.id, {
          name: v.name,
          lat: v.lat,
          lng: v.lng,
          radiusM: v.radiusM,
          isActive: v.isActive,
        });
      } else {
        await ClinicalDutyService.createSite(supabase, v);
      }
    },
    onSuccess: () => {
      toast.success('Duty site saved');
      invalidateClinical(qc);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}
