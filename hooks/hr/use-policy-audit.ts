'use client';

/**
 * React Query hooks for the Wave 3 HR policy audit log + publish/unpublish.
 *
 * Fetches from:
 *   GET  /api/hr/policies/audit-log   — paginated audit entries
 *   POST /api/hr/policies/publish     — publish a draft
 *   POST /api/hr/policies/unpublish   — revert to draft
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  HRPolicyAuditLogEntry,
  PolicyAuditFilters,
} from '@/types/hr-policy-audit';

const BASE = '/api/hr/policies';

// ---------------------------------------------------------------------------
// Audit log query
// ---------------------------------------------------------------------------

export function usePolicyAuditLog(
  policyKey?: string,
  institutionId?: string,
  filters?: Partial<PolicyAuditFilters>
) {
  return useQuery<{ entries: HRPolicyAuditLogEntry[]; total: number }>({
    queryKey: ['hr-policy-audit', policyKey, institutionId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (policyKey) params.set('policy_key', policyKey);
      if (institutionId) params.set('institution_id', institutionId);
      if (filters?.change_type) params.set('change_type', filters.change_type);
      if (filters?.edited_by) params.set('edited_by', filters.edited_by);
      if (filters?.from_date) params.set('from_date', filters.from_date);
      if (filters?.to_date) params.set('to_date', filters.to_date);
      if (filters?.page) params.set('page', String(filters.page));
      if (filters?.page_size) params.set('page_size', String(filters.page_size));

      const res = await fetch(`${BASE}/audit-log?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Audit log failed: ${res.status}`);
      }
      return res.json();
    },
  });
}

// ---------------------------------------------------------------------------
// Publish mutation
// ---------------------------------------------------------------------------

export function usePublishPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      policy_key: string;
      scope_type: string;
      scope_id: string | null;
      reason: string;
    }) => {
      const res = await fetch(`${BASE}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Publish failed');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-policy-audit'] });
      qc.invalidateQueries({ queryKey: ['hr-policy'] });
      qc.invalidateQueries({ queryKey: ['hr-policy-publication'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Unpublish mutation
// ---------------------------------------------------------------------------

export function useUnpublishPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      policy_key: string;
      scope_type: string;
      scope_id: string | null;
      reason: string;
    }) => {
      const res = await fetch(`${BASE}/unpublish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Unpublish failed');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-policy-audit'] });
      qc.invalidateQueries({ queryKey: ['hr-policy'] });
      qc.invalidateQueries({ queryKey: ['hr-policy-publication'] });
    },
  });
}
