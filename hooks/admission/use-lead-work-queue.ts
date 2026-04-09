// hooks/admission/use-lead-work-queue.ts
// React Query hook for the counselor lead work queue.
// Returns assigned leads in a smart priority order with navigation controls.

import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useCallback } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { AdmissionLead } from '@/types/admission';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** Priority bucket assigned during client-side sorting */
export type QueueBucket = 'overdue' | 'hot' | 'new' | 'other';

/** A lead decorated with its computed queue bucket */
export interface QueuedLead extends AdmissionLead {
  _queueBucket: QueueBucket;
}

export interface LeadWorkQueueResult {
  /** All leads sorted by smart priority */
  leads: QueuedLead[];
  /** The lead at `currentIndex`, or null when queue is empty */
  currentLead: QueuedLead | null;
  /** Zero-based index of the current lead */
  currentIndex: number;
  /** Total number of leads in the queue */
  totalLeads: number;
  /** Advance to the next lead (wraps to 0 at the end) */
  next: () => void;
  /** Go back to the previous lead (wraps to last at the start) */
  prev: () => void;
  /** Skip the current lead and move to the next (alias for next) */
  skip: () => void;
  /** Jump to a specific index; clamped to valid range */
  goTo: (index: number) => void;
  /** True while the initial fetch is in progress */
  isLoading: boolean;
  /** Count of leads with overdue follow-ups */
  overdueCount: number;
  /** Count of hot leads without recent contact (>4 hours) */
  hotCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Funnel stages considered "closed" — leads in these stages are excluded */
const CLOSED_STAGES = [
  'enrolled',
  'confirmed',
  'declined',
  'withdrew',
  'expired',
  'lost',
] as const;

/** Leads with no contact in this many milliseconds are considered "stale" for hot leads */
const HOT_LEAD_STALE_MS = 4 * 60 * 60 * 1000; // 4 hours

// ═══════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════

export const leadWorkQueueKeys = {
  all: ['lead-work-queue'] as const,
  queue: (counselorId: string, institutionId: string) =>
    [...leadWorkQueueKeys.all, 'queue', counselorId, institutionId] as const,
};

// ═══════════════════════════════════════════════════════════════════════════
// SORTING LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Assigns a priority bucket to each lead and sorts the full list.
 *
 * Priority order (descending):
 *   1. Overdue follow-ups  — past `next_followup_at`, most overdue first
 *   2. Hot leads            — `is_hot_lead` with no contact in the last 4 hours
 *   3. New leads            — `funnel_stage = 'new'`, most recent first
 *   4. Everything else      — by `score` descending
 */
function sortQueue(leads: AdmissionLead[]): QueuedLead[] {
  const now = Date.now();
  const staleThreshold = now - HOT_LEAD_STALE_MS;

  // Tag each lead with its bucket
  const tagged: QueuedLead[] = leads.map((lead) => {
    let bucket: QueueBucket = 'other';

    const followupTime = lead.next_followup_at
      ? new Date(lead.next_followup_at).getTime()
      : null;

    const lastContactTime = lead.last_contact_at
      ? new Date(lead.last_contact_at).getTime()
      : null;

    // Bucket 1: overdue follow-up
    if (followupTime !== null && followupTime < now) {
      bucket = 'overdue';
    }
    // Bucket 2: hot lead without recent contact
    else if (
      lead.is_hot_lead &&
      (lastContactTime === null || lastContactTime < staleThreshold)
    ) {
      bucket = 'hot';
    }
    // Bucket 3: new leads
    else if (lead.funnel_stage === 'new') {
      bucket = 'new';
    }

    return { ...lead, _queueBucket: bucket };
  });

  // Numeric bucket priority (lower = higher priority)
  const bucketPriority: Record<QueueBucket, number> = {
    overdue: 0,
    hot: 1,
    new: 2,
    other: 3,
  };

  tagged.sort((a, b) => {
    const aPri = bucketPriority[a._queueBucket];
    const bPri = bucketPriority[b._queueBucket];

    // Different buckets — sort by bucket priority
    if (aPri !== bPri) return aPri - bPri;

    // Same bucket — use bucket-specific secondary sort
    switch (a._queueBucket) {
      case 'overdue': {
        // Most overdue first (earliest followup date = smallest timestamp)
        const aTime = a.next_followup_at
          ? new Date(a.next_followup_at).getTime()
          : Infinity;
        const bTime = b.next_followup_at
          ? new Date(b.next_followup_at).getTime()
          : Infinity;
        return aTime - bTime;
      }

      case 'hot': {
        // Longest without contact first (earliest last_contact = smallest timestamp)
        const aContact = a.last_contact_at
          ? new Date(a.last_contact_at).getTime()
          : 0;
        const bContact = b.last_contact_at
          ? new Date(b.last_contact_at).getTime()
          : 0;
        return aContact - bContact;
      }

      case 'new': {
        // Most recently created first
        const aCreated = new Date(a.created_at).getTime();
        const bCreated = new Date(b.created_at).getTime();
        return bCreated - aCreated;
      }

      case 'other':
      default: {
        // Highest score first
        return (b.score ?? 0) - (a.score ?? 0);
      }
    }
  });

  return tagged;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetches and prioritises a counselor's active lead queue.
 *
 * Sorting happens client-side after a single flat fetch to keep the DB query
 * simple and RLS-compatible. The queue refreshes every 2 minutes.
 *
 * @param counselorId  The counselor's user ID (matches `counselor_id` on leads)
 * @param institutionId  Scoping institution. Omit for super-admin (all institutions).
 */
export function useLeadWorkQueue(
  counselorId: string | undefined,
  institutionId: string | undefined,
): LeadWorkQueueResult {
  // ── Navigation state ───────────────────────────────────────────────────
  const [currentIndex, setCurrentIndex] = useState(0);

  // ── Data fetch ─────────────────────────────────────────────────────────
  const query = useQuery<AdmissionLead[]>({
    queryKey: leadWorkQueueKeys.queue(counselorId ?? '', institutionId ?? ''),
    queryFn: async (): Promise<AdmissionLead[]> => {
      const supabase = createClientSupabaseClient();

      // Build query — select only the columns the mobile work screen needs.
      // Using `*` to keep it simple; the table has ~78 columns but this is a
      // counselor-scoped query that returns at most a few hundred rows.
      let q = (supabase as any)
        .from('admission_leads')
        .select('*')
        .eq('counselor_id', counselorId!)
        .eq('is_active', true)
        .not(
          'funnel_stage',
          'in',
          `(${CLOSED_STAGES.join(',')})`,
        )
        .order('created_at', { ascending: false })
        .limit(500);

      // Scope to institution if provided (super-admin sees all when undefined)
      if (institutionId) {
        q = q.eq('institution_id', institutionId);
      }

      const { data, error } = await q;

      if (error) {
        console.error('[lead-work-queue] Failed to fetch leads:', error);
        throw error;
      }

      return (data ?? []) as AdmissionLead[];
    },
    enabled: !!counselorId,
    refetchInterval: 120_000, // 2 minutes
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: false,
  });

  // ── Client-side sort ───────────────────────────────────────────────────
  const sortedLeads = useMemo(
    () => sortQueue(query.data ?? []),
    [query.data],
  );

  // ── Derived counts ─────────────────────────────────────────────────────
  const overdueCount = useMemo(
    () => sortedLeads.filter((l) => l._queueBucket === 'overdue').length,
    [sortedLeads],
  );

  const hotCount = useMemo(
    () => sortedLeads.filter((l) => l._queueBucket === 'hot').length,
    [sortedLeads],
  );

  // ── Navigation callbacks ───────────────────────────────────────────────
  const totalLeads = sortedLeads.length;

  const next = useCallback(() => {
    setCurrentIndex((prev) =>
      totalLeads === 0 ? 0 : (prev + 1) % totalLeads,
    );
  }, [totalLeads]);

  const prev = useCallback(() => {
    setCurrentIndex((prev) =>
      totalLeads === 0 ? 0 : (prev - 1 + totalLeads) % totalLeads,
    );
  }, [totalLeads]);

  const skip = useCallback(() => {
    // skip is semantically the same as next — move forward in the queue
    next();
  }, [next]);

  const goTo = useCallback(
    (index: number) => {
      if (totalLeads === 0) {
        setCurrentIndex(0);
        return;
      }
      // Clamp to valid range
      const clamped = Math.max(0, Math.min(index, totalLeads - 1));
      setCurrentIndex(clamped);
    },
    [totalLeads],
  );

  // Reset index when data changes and current index is out of bounds
  const safeIndex =
    totalLeads === 0 ? 0 : Math.min(currentIndex, totalLeads - 1);

  const currentLead = totalLeads > 0 ? sortedLeads[safeIndex] : null;

  return {
    leads: sortedLeads,
    currentLead,
    currentIndex: safeIndex,
    totalLeads,
    next,
    prev,
    skip,
    goTo,
    isLoading: query.isLoading,
    overdueCount,
    hotCount,
  };
}
