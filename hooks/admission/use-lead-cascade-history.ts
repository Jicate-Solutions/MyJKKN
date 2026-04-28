// hooks/admission/use-lead-cascade-history.ts
// Fetches admission_lead_cascade_history rows for a given lead_id,
// joined with from/to counselor profile names + emails.
//
// Per spec decision #13: cascade history is append-only, system-only.
// Per spec decision #14: off-duty counselors see cascaded leads as read-only.

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CascadeEntry {
  id: string;
  lead_id: string;
  from_counselor_id: string | null;
  to_counselor_id: string | null;
  reason: string; // 'off_duty_60min' | 'manual_reassign' | 'queue_flush'
  cascaded_at: string;
  triggered_by: string | null;
  metadata: Record<string, unknown>;
  // Joined fields
  from_counselor_name: string | null;
  from_counselor_email: string | null;
  to_counselor_name: string | null;
  to_counselor_email: string | null;
}

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const cascadeHistoryKeys = {
  all: ['lead-cascade-history'] as const,
  byLead: (leadId: string) => [...cascadeHistoryKeys.all, leadId] as const,
};

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchCascadeHistory(leadId: string): Promise<CascadeEntry[]> {
  const supabase = createClientSupabaseClient();

  // Fetch raw history rows with counselor profile joins.
  // admission_counselors joins profiles via user_id for names + emails.
  const { data, error } = await (supabase as any)
    .from('admission_lead_cascade_history')
    .select(`
      id,
      lead_id,
      from_counselor_id,
      to_counselor_id,
      reason,
      cascaded_at,
      triggered_by,
      metadata,
      from_counselor:from_counselor_id (
        id,
        profiles:user_id ( full_name, email )
      ),
      to_counselor:to_counselor_id (
        id,
        profiles:user_id ( full_name, email )
      )
    `)
    .eq('lead_id', leadId)
    .order('cascaded_at', { ascending: false });

  if (error) {
    console.warn('[admission/leads] Failed to fetch cascade history:', error.message);
    return [];
  }

  if (!data) return [];

  return (data as any[]).map((row) => ({
    id: row.id,
    lead_id: row.lead_id,
    from_counselor_id: row.from_counselor_id,
    to_counselor_id: row.to_counselor_id,
    reason: row.reason,
    cascaded_at: row.cascaded_at,
    triggered_by: row.triggered_by,
    metadata: row.metadata ?? {},
    from_counselor_name: row.from_counselor?.profiles?.full_name ?? null,
    from_counselor_email: row.from_counselor?.profiles?.email ?? null,
    to_counselor_name: row.to_counselor?.profiles?.full_name ?? null,
    to_counselor_email: row.to_counselor?.profiles?.email ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useLeadCascadeHistory
 *
 * Returns the append-only reassignment trail for a lead.
 * Rows are ordered most-recent-first (cascaded_at DESC).
 *
 * @param leadId - UUID of the admission lead. Disabled for invalid/missing UUIDs.
 */
export function useLeadCascadeHistory(leadId?: string) {
  const isValidId = !!leadId && UUID_REGEX.test(leadId);

  const query = useQuery({
    queryKey: cascadeHistoryKeys.byLead(leadId ?? ''),
    queryFn: () => fetchCascadeHistory(leadId!),
    enabled: isValidId,
    staleTime: 30_000, // 30 s — cascade rows are infrequent writes
  });

  return {
    history: query.data ?? [],
    loading: query.isLoading,
    latest: query.data?.[0] ?? null,
  };
}
