// hooks/admission/use-wa-consent.ts
// React Query hooks for WhatsApp consent management
// Gap 2 — Opt-in Consent Tracking

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ConsentStatus,
  ConsentLogEntry,
  ConsentStats,
} from '@/lib/services/whatsapp/whatsapp-consent-service';

// =============================================================================
// Query Keys
// =============================================================================

export const waConsentKeys = {
  all: ['wa-consent'] as const,
  status: (leadId: string) => [...waConsentKeys.all, 'status', leadId] as const,
  stats: (institutionId: string) => [...waConsentKeys.all, 'stats', institutionId] as const,
};

// =============================================================================
// Fetchers
// =============================================================================

interface ConsentResponse extends ConsentStatus {
  log: ConsentLogEntry[];
}

async function fetchConsentStatus(leadId: string): Promise<ConsentResponse> {
  const res = await fetch(`/api/admission/chat/consent?lead_id=${leadId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch consent status');
  }
  const json = await res.json();
  return json.data;
}

async function fetchConsentStats(institutionId: string): Promise<ConsentStats> {
  const res = await fetch(`/api/admission/chat/consent/stats?institution_id=${institutionId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch consent stats');
  }
  const json = await res.json();
  return json.data;
}

async function mutateConsent(params: {
  lead_id: string;
  institution_id: string;
  action: 'opt_in' | 'opt_out';
  source?: string;
  performed_by?: string;
}): Promise<void> {
  const res = await fetch('/api/admission/chat/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update consent');
  }
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Check consent status + audit log for a lead
 */
export function useWAConsent(leadId: string | null | undefined) {
  const query = useQuery({
    queryKey: waConsentKeys.status(leadId || ''),
    queryFn: () => fetchConsentStatus(leadId!),
    enabled: !!leadId,
    staleTime: 30000,
  });

  return {
    hasConsent: query.data?.hasConsent ?? false,
    optInAt: query.data?.optInAt ?? null,
    source: query.data?.source ?? null,
    consentLog: query.data?.log ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Mutations for granting/revoking consent
 */
export function useWAConsentMutation() {
  const queryClient = useQueryClient();

  const grantMutation = useMutation({
    mutationFn: (params: {
      lead_id: string;
      institution_id: string;
      source?: string;
    }) => mutateConsent({ ...params, action: 'opt_in' }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: waConsentKeys.status(variables.lead_id) });
      queryClient.invalidateQueries({ queryKey: waConsentKeys.all });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (params: {
      lead_id: string;
      institution_id: string;
      source?: string;
    }) => mutateConsent({ ...params, action: 'opt_out' }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: waConsentKeys.status(variables.lead_id) });
      queryClient.invalidateQueries({ queryKey: waConsentKeys.all });
    },
  });

  return {
    grantConsent: grantMutation.mutate,
    revokeConsent: revokeMutation.mutate,
    isPending: grantMutation.isPending || revokeMutation.isPending,
    isGranting: grantMutation.isPending,
    isRevoking: revokeMutation.isPending,
  };
}

/**
 * Consent statistics for an institution
 */
export function useWAConsentStats(institutionId: string | null | undefined) {
  const query = useQuery({
    queryKey: waConsentKeys.stats(institutionId || ''),
    queryFn: () => fetchConsentStats(institutionId!),
    enabled: !!institutionId,
    staleTime: 60000,
  });

  return {
    stats: query.data || {
      total_leads: 0,
      opted_in: 0,
      opted_out: 0,
      never_set: 0,
      opt_in_rate: 0,
    },
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
