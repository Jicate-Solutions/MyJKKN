'use client';

/**
 * Resource & Capacity — React Query Hooks (F5)
 *
 * Wraps ResourceService. Single query per project — the service handles all
 * joins and cross-module workload enrichment internally.
 *
 * Pattern: hooks/projects/use-risks.ts
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F5.
 */

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ResourceService } from '@/lib/services/projects/resource-service';

function getSupabase() {
  return createClientSupabaseClient();
}

// ─── Query Keys ───────────────────────────────────────────────────────────────────

export const resourceKeys = {
  all: ['project-resources'] as const,
  capacity: (projectId: string) => [...resourceKeys.all, 'capacity', projectId] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────────

/**
 * Returns per-member capacity aggregates for a project.
 * Disabled when projectId is falsy.
 */
export function useMemberCapacity(projectId: string | null | undefined) {
  return useQuery({
    queryKey: resourceKeys.capacity(projectId ?? ''),
    queryFn: () => ResourceService.listMemberCapacity(getSupabase(), projectId as string),
    enabled: !!projectId,
  });
}
