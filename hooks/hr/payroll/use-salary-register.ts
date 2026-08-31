'use client';

/**
 * React Query hooks for the salary register.
 *
 * UNLIKE the attendance-period hooks next door, these go through /api/hr/payroll/register/*
 * rather than calling the service from the browser client. Generating a register
 * reads four separately-gated tables and writes frozen money; the authoritative
 * permission check belongs in a reviewed route handler, with RLS as the
 * backstop rather than the only wall. The export also has to be a route
 * handler regardless — it streams a file.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  HRSalaryRegisterLine,
  HRSalaryRegisterRun,
  SalaryRegisterPreflight,
  SalaryRegisterRunDetail,
} from '@/types/hr-payroll';

export const SALARY_REGISTER_KEYS = {
  all: ['hr', 'salary-register'] as const,
  preflight: (org: string, year: number, month: number) =>
    ['hr', 'salary-register', 'preflight', org, year, month] as const,
  runs: (org: string | undefined, year: number | undefined) =>
    ['hr', 'salary-register', 'runs', org ?? 'all', year ?? 'all'] as const,
  detail: (runId: string) => ['hr', 'salary-register', 'detail', runId] as const,
};

/**
 * Route handlers answer errors as `{ error }` with a 4xx/5xx. Surfacing that
 * message verbatim matters here: the blockers name the institution and the
 * count, and a generic "request failed" would send HR to the wrong module.
 */
async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

/** Can a register be generated for this organisation-month, and if not, why. */
export function useSalaryRegisterPreflight(
  hrOrganizationId: string | null,
  year: number,
  month: number,
) {
  return useQuery<SalaryRegisterPreflight>({
    queryKey: SALARY_REGISTER_KEYS.preflight(hrOrganizationId ?? '', year, month),
    queryFn: async () => {
      const qs = new URLSearchParams({
        organisation: hrOrganizationId as string,
        year: String(year),
        month: String(month),
      });
      return readJson<SalaryRegisterPreflight>(
        await fetch(`/api/hr/payroll/register/preflight?${qs}`),
      );
    },
    enabled: Boolean(hrOrganizationId),
    // Short: the answer flips the moment somebody closes the month in the other
    // tab, and a stale "not ready" is the most confusing thing this page can show.
    staleTime: 15 * 1000,
    retry: false,
  });
}

/** Registers already generated. */
export function useSalaryRegisterRuns(
  hrOrganizationId?: string,
  year?: number,
  includeSuperseded = false,
) {
  return useQuery<HRSalaryRegisterRun[]>({
    queryKey: SALARY_REGISTER_KEYS.runs(hrOrganizationId, year),
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (hrOrganizationId) qs.set('organisation', hrOrganizationId);
      if (year !== undefined) qs.set('year', String(year));
      if (includeSuperseded) qs.set('include_superseded', 'true');
      const body = await readJson<{ runs: HRSalaryRegisterRun[] }>(
        await fetch(`/api/hr/payroll/register/generate?${qs}`),
      );
      return body.runs;
    },
    staleTime: 60 * 1000,
  });
}

/** One frozen register with all of its rows. */
export function useSalaryRegisterDetail(runId: string | null) {
  return useQuery<SalaryRegisterRunDetail>({
    queryKey: SALARY_REGISTER_KEYS.detail(runId ?? ''),
    queryFn: async () =>
      readJson<SalaryRegisterRunDetail>(await fetch(`/api/hr/payroll/register/${runId}`)),
    enabled: Boolean(runId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useGenerateSalaryRegister() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { hrOrganizationId: string; year: number; month: number }) =>
      readJson<{ success: true; run_id: string; included: number; excluded: number }>(
        await fetch('/api/hr/payroll/register/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organisation: vars.hrOrganizationId,
            year: vars.year,
            month: vars.month,
          }),
        }),
      ),
    onSuccess: () => {
      // Nothing in this app self-refreshes (staleTime 5 min, no refetch on
      // focus), so every view the generate changed has to be dropped by hand.
      qc.invalidateQueries({ queryKey: SALARY_REGISTER_KEYS.all });
    },
  });
}

export function useUpdateSalaryRegisterLine(runId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: {
      lineId: string;
      adjustmentAmount?: number;
      remarks?: string | null;
    }) =>
      readJson<{ success: true; line: HRSalaryRegisterLine }>(
        await fetch(`/api/hr/payroll/register/lines/${vars.lineId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adjustment_amount: vars.adjustmentAmount,
            remarks: vars.remarks,
          }),
        }),
      ),
    onSuccess: () => {
      // The run header totals move with the line, so the detail AND the run
      // list are both stale — not just the row that was edited.
      qc.invalidateQueries({ queryKey: SALARY_REGISTER_KEYS.detail(runId) });
      qc.invalidateQueries({ queryKey: SALARY_REGISTER_KEYS.all });
    },
  });
}

/** The export URL. A plain link — the route streams the file with its own name. */
export function salaryRegisterExportUrl(runId: string): string {
  return `/api/hr/payroll/register/${runId}/export`;
}
