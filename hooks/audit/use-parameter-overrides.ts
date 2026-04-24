// hooks/audit/use-parameter-overrides.ts
//
// Per-institution parameter override hooks (Sprint 01 — Thrash T2 follow-up).
//
// Why a dedicated hook file:
//   - `useParametersForInstitution()` merges system+override into the CALLER's
//     single-institution view. This hook is for ADMINS who need to see every
//     existing override for one parameter code across institutions, plus the
//     system row, to drive the override-CRUD UI.
//   - Keeps the existing audit-parameters hook file untouched (Agent B edits it).
//
// Data source: direct Supabase client (RLS still enforced — same as settings
// page pattern). Write paths route through the shared API route so RLS failures
// bubble up with PG error codes mapped to HTTP 403/409.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { auditParameterKeys } from './use-audit-parameters';
import type {
  AuditParameterCatalogRow,
  EvidenceRequirementItem,
  FrameworkMapping,
} from '@/lib/types/audit';

export const parameterOverrideKeys = {
  all: ['audit', 'parameter-overrides'] as const,
  forCode: (code: string) => [...parameterOverrideKeys.all, code] as const,
};

export interface OverridePayload {
  institution_id: string;
  name?: string;
  description?: string | null;
  framework_mapping?: FrameworkMapping;
  default_owner_role: string;
  escalation_role?: string | null;
  p1_sla_days: number;
  p2_sla_days: number;
  evidence_required: EvidenceRequirementItem[];
  is_active?: boolean;
}

/**
 * List all rows (system + every institution override) for a given parameter code.
 * RLS will filter to what the caller can see — super_admin gets everything,
 * an admin of one institution sees the system row + their institution's override.
 */
export function useParameterOverrides(code: string | undefined) {
  return useQuery({
    queryKey: code ? parameterOverrideKeys.forCode(code) : parameterOverrideKeys.all,
    queryFn: async (): Promise<AuditParameterCatalogRow[]> => {
      if (!code) return [];
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('audit_parameter_catalog')
        .select('*')
        .eq('code', code)
        .order('institution_id', { ascending: true, nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as AuditParameterCatalogRow[];
    },
    enabled: !!code,
    staleTime: 30 * 1000,
  });
}

/**
 * All active institutions (for the picker in the override-create dialog).
 * Shape matches what other modules use — we fetch minimal fields only.
 */
export function useInstitutionsForOverridePicker() {
  return useQuery({
    queryKey: ['audit', 'parameter-overrides', 'institutions'] as const,
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('institutions')
        .select('id, name')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

interface MutationContext {
  code: string;
}

/**
 * Create or upsert an institution override. Goes through the API route so RLS
 * errors are mapped to HTTP status codes and the client gets a consistent
 * error shape.
 */
export function useCreateOverride({ code }: MutationContext) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: OverridePayload): Promise<AuditParameterCatalogRow> => {
      const res = await fetch(
        `/api/audit/parameters/${encodeURIComponent(code)}/overrides`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      return body.data as AuditParameterCatalogRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: parameterOverrideKeys.forCode(code) });
      queryClient.invalidateQueries({ queryKey: auditParameterKeys.all });
    },
  });
}

export function useUpdateOverride({ code }: MutationContext) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: OverridePayload): Promise<AuditParameterCatalogRow> => {
      const res = await fetch(
        `/api/audit/parameters/${encodeURIComponent(code)}/overrides`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      return body.data as AuditParameterCatalogRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: parameterOverrideKeys.forCode(code) });
      queryClient.invalidateQueries({ queryKey: auditParameterKeys.all });
    },
  });
}

export function useDeleteOverride({ code }: MutationContext) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (institutionId: string): Promise<void> => {
      const res = await fetch(
        `/api/audit/parameters/${encodeURIComponent(code)}/overrides?institution_id=${encodeURIComponent(institutionId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: parameterOverrideKeys.forCode(code) });
      queryClient.invalidateQueries({ queryKey: auditParameterKeys.all });
    },
  });
}
