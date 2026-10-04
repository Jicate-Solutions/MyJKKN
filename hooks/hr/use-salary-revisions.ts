'use client';

/**
 * Salary revisions in the browser — every read and write goes to
 * /api/hr/salary-revisions/*, which calls the database functions of
 * 20270519090000 with the signed-in person's own session. Nothing here reads a
 * table or a pay band directly; the band and the rule never come to the
 * browser (only the worked-out suggested figure, and the Director's warning).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SalaryRevisionRow } from '@/lib/hr/salary-revision';

/** Declared here so this file imports nothing server-side. */
export interface SuggestionNote {
  verdict: 'suggested' | 'rule_not_set' | 'no_suggestion';
  figure: number | null;
  note: string | null;
}

export interface SalaryRevisionListRow extends SalaryRevisionRow {
  suggestion: SuggestionNote;
  band_warning: string | null;
}

export interface RevisionPerson {
  staff_uuid: string;
  person_name: string;
  staff_code: string | null;
  designation: string | null;
  institution_id: string;
  institution_name: string | null;
  department_id: string | null;
  department_name: string | null;
  monthly_gross: number | string;
  is_self: boolean;
  open_request_id: string | null;
  open_request_status: string | null;
}

export interface RevisionDetail {
  request: SalaryRevisionListRow;
  decisionNote: { kind: 'stopped' | 'refused'; reason: string; created_at: string } | null;
  comments: Array<{ id: string; body: string; created_at: string; author_name: string }>;
}

export interface PayOutcome {
  id: string;
  previous_monthly_gross: number | string;
  new_monthly_gross: number | string;
  is_cut: boolean;
  starts_on: string;
  created_at: string;
}

export const SALARY_REVISION_KEYS = {
  all: ['hr', 'salary-revisions'] as const,
  list: (view: string) => ['hr', 'salary-revisions', 'list', view] as const,
  people: ['hr', 'salary-revisions', 'people'] as const,
  person: (staffId: string) => ['hr', 'salary-revisions', 'person', staffId] as const,
  detail: (id: string) => ['hr', 'salary-revisions', 'detail', id] as const,
  outcomes: ['hr', 'salary-revisions', 'my-outcomes'] as const,
};

/** A refusal from the server, with the waiting request's id when there is one. */
export class RevisionRequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly openRequestId: string | null) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new RevisionRequestError(
      body?.error ?? `Request failed (${res.status})`,
      res.status,
      typeof body?.openRequestId === 'string' ? body.openRequestId : null,
    );
  }
  return body as T;
}

function post<T>(url: string, payload: unknown) {
  return call<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function useSalaryRevisionList(view: 'mine' | 'college' | 'director' | 'all', enabled = true) {
  return useQuery({
    queryKey: SALARY_REVISION_KEYS.list(view),
    enabled,
    staleTime: 0,
    queryFn: () =>
      call<{ requests: SalaryRevisionListRow[] }>(`/api/hr/salary-revisions?view=${view}`).then((b) => b.requests),
  });
}

export function useRevisionPeople(enabled = true) {
  return useQuery({
    queryKey: SALARY_REVISION_KEYS.people,
    enabled,
    queryFn: () => call<{ people: RevisionPerson[] }>('/api/hr/salary-revisions/people').then((b) => b.people),
  });
}

export function useRevisionPerson(staffId: string | null) {
  return useQuery({
    queryKey: SALARY_REVISION_KEYS.person(staffId ?? 'none'),
    enabled: Boolean(staffId),
    staleTime: 0,
    queryFn: () =>
      call<{ person: RevisionPerson; suggestion: SuggestionNote }>(
        `/api/hr/salary-revisions/people?staffId=${encodeURIComponent(staffId as string)}`,
      ),
  });
}

export function useRevisionDetail(id: string | null) {
  return useQuery({
    queryKey: SALARY_REVISION_KEYS.detail(id ?? 'none'),
    enabled: Boolean(id),
    staleTime: 0,
    queryFn: () => call<RevisionDetail>(`/api/hr/salary-revisions/${encodeURIComponent(id as string)}`),
  });
}

export function useMyPayOutcomes() {
  return useQuery({
    queryKey: SALARY_REVISION_KEYS.outcomes,
    queryFn: () => call<{ outcomes: PayOutcome[] }>('/api/hr/salary-revisions/my-outcomes').then((b) => b.outcomes),
  });
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: SALARY_REVISION_KEYS.all });
}

export function useAskForRevision() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { staffId: string; monthlyGross: number; reason: string }) =>
      post<{ id: string }>('/api/hr/salary-revisions', input),
    onSuccess: invalidate,
  });
}

export type RevisionAction =
  | { action: 'comment'; body: string }
  | { action: 'college_agree'; note?: string }
  | { action: 'college_stop'; reason: string }
  | { action: 'approve'; finalMonthlyGross?: number | null; note?: string }
  | { action: 'refuse'; reason: string };

export function useRevisionAction(id: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (payload: RevisionAction) =>
      post<{ status?: string; ok?: boolean }>(`/api/hr/salary-revisions/${encodeURIComponent(id)}`, payload),
    onSuccess: invalidate,
  });
}

export function useApproveMany() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (ids: string[]) => post<{ approved: number }>('/api/hr/salary-revisions/approve-many', { ids }),
    onSuccess: invalidate,
  });
}
