'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import type {
  BosCourseOutcomeMapping,
  BosProgrammeOutcome,
  BosProgrammeSpecificOutcome,
} from '@/types/bos';

// ─────────────────────────────────────────────────────────────────────────────
// /bos/po-pso — institution-wise PO / PSO maintained by the HOD.
//
// Backed by /api/bos/po-pso/{context,outcomes,course-mappings}. The outcome
// rows are bos_programme_outcomes / bos_programme_specific_outcomes — the
// SAME rows the compositions Outcomes tab and the syllabus CO-PO editor read,
// so the taxonomy query keys are invalidated on every write here.
// ─────────────────────────────────────────────────────────────────────────────

export type OutcomeKind = 'po' | 'pso';

export interface PoPsoScopeKey {
  institutionsId: string | null;
  regulationId: string | null;
  programmeCode: string | null;
}

export interface PoPsoContext {
  institution_ids: string[];
  departments: Array<{ id: string; institution_id: string; department_code: string; department_name: string }>;
  programmes: Array<{
    id: string; institution_id: string; department_id: string | null;
    program_code: string; program_name: string;
  }>;
  hod: { locked: boolean; department_ids: string[] };
}

export interface PoPsoOutcomes {
  pos: BosProgrammeOutcome[];
  psos: BosProgrammeSpecificOutcome[];
  can_edit: boolean;
  programme: {
    id: string; institution_id: string; department_id: string | null;
    program_id: string; program_name: string;
  } | null;
}

export type CorrelationLevel = 0 | 1 | 2 | 3;

export interface CourseMappingRow {
  course_code: string;
  course_name: string;
  course_id: string | null;
  semester: number | null;
  syllabus_id: string | null;
  mapping_id: string | null;
  source: 'explicit' | 'syllabus' | 'none';
  po_levels: Record<string, CorrelationLevel>;
  pso_levels: Record<string, CorrelationLevel>;
}

export interface PoPsoCourseMappings {
  courses: CourseMappingRow[];
  can_edit: boolean;
}

export const bosPoPsoKeys = {
  all: ['bos', 'po-pso'] as const,
  context: (institutionsId: string | null) =>
    ['bos', 'po-pso', 'context', institutionsId ?? 'none'] as const,
  outcomes: (k: PoPsoScopeKey) =>
    ['bos', 'po-pso', 'outcomes', k.institutionsId ?? 'none', k.regulationId ?? 'none', k.programmeCode ?? 'none'] as const,
  courseMappings: (k: PoPsoScopeKey) =>
    ['bos', 'po-pso', 'course-mappings', k.institutionsId ?? 'none', k.regulationId ?? 'none', k.programmeCode ?? 'none'] as const,
};

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? fallback);
  }
  const json = await res.json();
  return json.data as T;
}

function qs(k: PoPsoScopeKey, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({
    institutionsId: k.institutionsId ?? '',
    regulationId: k.regulationId ?? '',
    programmeCode: k.programmeCode ?? '',
    ...extra,
  });
  return p.toString();
}

const ready = (k: PoPsoScopeKey) => !!k.institutionsId && !!k.regulationId && !!k.programmeCode;

// ── Reads ────────────────────────────────────────────────────────────────────

export function useBosPoPsoContext(institutionsId: string | null) {
  return useQuery<PoPsoContext>({
    queryKey: bosPoPsoKeys.context(institutionsId),
    enabled: !!institutionsId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () =>
      readJson<PoPsoContext>(
        await fetch(`/api/bos/po-pso/context?institutionsId=${institutionsId}`),
        'Failed to load departments and programmes'
      ),
  });
}

export function useBosPoPsoOutcomes(k: PoPsoScopeKey) {
  return useQuery<PoPsoOutcomes>({
    queryKey: bosPoPsoKeys.outcomes(k),
    enabled: ready(k),
    staleTime: 5 * 60 * 1000,
    queryFn: async () =>
      readJson<PoPsoOutcomes>(
        await fetch(`/api/bos/po-pso/outcomes?${qs(k, { includeInactive: '1' })}`),
        'Failed to load PO/PSO'
      ),
  });
}

export function useBosPoPsoCourseMappings(k: PoPsoScopeKey) {
  return useQuery<PoPsoCourseMappings>({
    queryKey: bosPoPsoKeys.courseMappings(k),
    enabled: ready(k),
    staleTime: 5 * 60 * 1000,
    queryFn: async () =>
      readJson<PoPsoCourseMappings>(
        await fetch(`/api/bos/po-pso/course-mappings?${qs(k)}`),
        'Failed to load course mapping'
      ),
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────

function useInvalidateOutcomes(k: PoPsoScopeKey) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: bosPoPsoKeys.outcomes(k) });
    queryClient.invalidateQueries({ queryKey: bosPoPsoKeys.courseMappings(k) });
    // Same rows are read by the compositions Outcomes tab + syllabus editor.
    queryClient.invalidateQueries({ queryKey: ['bos', 'programme-pos'] });
    queryClient.invalidateQueries({ queryKey: ['bos', 'programme-psos'] });
    queryClient.invalidateQueries({ queryKey: ['bos', 'regulation-programmes'] });
  };
}

function scopeBody(k: PoPsoScopeKey) {
  return {
    institutions_id: k.institutionsId,
    regulation_id: k.regulationId,
    programme_code: k.programmeCode,
  };
}

/** Add ONE PO / PSO — the server assigns the next free code. */
export function useCreateOutcome(k: PoPsoScopeKey) {
  const invalidate = useInvalidateOutcomes(k);
  return useMutation({
    mutationFn: async (input: { kind: OutcomeKind; description: string }) => {
      const res = await fetch('/api/bos/po-pso/outcomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...scopeBody(k), ...input }),
      });
      return readJson<BosProgrammeOutcome | BosProgrammeSpecificOutcome>(res, 'Failed to add');
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to add'),
  });
}

/** Edit description and/or activate / deactivate ONE PO / PSO. */
export function useUpdateOutcome(k: PoPsoScopeKey) {
  const invalidate = useInvalidateOutcomes(k);
  return useMutation({
    mutationFn: async (input: { kind: OutcomeKind; id: string; description?: string; is_active?: boolean }) => {
      const res = await fetch('/api/bos/po-pso/outcomes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...scopeBody(k), ...input }),
      });
      return readJson<BosProgrammeOutcome | BosProgrammeSpecificOutcome>(res, 'Failed to update');
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update'),
  });
}

/** Upsert the course × PO/PSO matrix rows (never deletes). */
export function useSaveCourseMappings(k: PoPsoScopeKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Array<{
      course_code: string; course_name?: string | null; course_id?: string | null;
      po_levels: Record<string, number>; pso_levels: Record<string, number>;
    }>) => {
      const res = await fetch('/api/bos/po-pso/course-mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...scopeBody(k), rows }),
      });
      return readJson<BosCourseOutcomeMapping[]>(res, 'Failed to save mapping');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bosPoPsoKeys.courseMappings(k) });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to save mapping'),
  });
}
