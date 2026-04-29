/**
 * Retention Policies Service
 *
 * Director's standing rule (2026-04-29): every policy decision = config-table
 * row + super_admin UI to write. Result: zero deploys, zero PRs, zero
 * developer round-trips for tweaks.
 *
 * This service backs `/admin/retention-policies` — the super_admin can
 * tweak `retention_days` and `enabled` for any cron-managed table from
 * the UI in 5 seconds, no PR needed.
 *
 * Server-side cron jobs read the same data via the SECURITY DEFINER helper
 * `get_retention_days(table_name)` (NOT this service — service is for UI
 * reads/writes only).
 *
 * Table: `retention_policies` (PK = table_name).
 *   table_name      text PK
 *   retention_days  int CHECK (> 0)
 *   enabled         boolean DEFAULT true
 *   description     text NOT NULL
 *   updated_at      timestamptz
 *   updated_by      uuid REFERENCES auth.users
 *
 * RLS: super_admin OR is_admin reads; super_admin only writes.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetentionPolicy {
  table_name: string;
  retention_days: number;
  enabled: boolean;
  description: string;
  updated_at: string;
  updated_by: string | null;
}

/** Patch shape for the inline-edit UI. */
export type RetentionPolicyUpdate = Partial<
  Pick<RetentionPolicy, 'retention_days' | 'enabled'>
>;

const QUERY_KEY = ['admin', 'retention-policies'] as const;

// ---------------------------------------------------------------------------
// Service class — direct DB calls (used by hooks below).
// ---------------------------------------------------------------------------

export class RetentionPoliciesService {
  /**
   * List all retention policy rows. Sorted by table_name ASC for stable
   * UI rendering.
   */
  static async list(): Promise<RetentionPolicy[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('retention_policies')
        .select('*')
        .order('table_name', { ascending: true });

      if (error) {
        logger.error(
          'admin/retention-policies',
          'Failed to fetch retention policies',
          error,
        );
        throw error;
      }
      return (data ?? []) as RetentionPolicy[];
    } catch (error) {
      logger.error(
        'admin/retention-policies',
        'Unexpected error in list()',
        error,
      );
      throw error;
    }
  }

  /**
   * Update a single retention policy row.
   *
   * Stamps `updated_by = auth.uid()` on the server side via a fresh
   * client-call (we read the current session client-side and pass the id
   * explicitly, since RLS already enforces super_admin-only writes).
   */
  static async update(
    tableName: string,
    patch: RetentionPolicyUpdate,
  ): Promise<RetentionPolicy> {
    try {
      const supabase = createClientSupabaseClient();

      // Pull the current session so we can stamp updated_by. RLS already
      // ensures only super_admin can land an UPDATE — this stamp is purely
      // for the audit trail visible in the UI.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const body = {
        ...patch,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('retention_policies')
        .update(body)
        .eq('table_name', tableName)
        .select()
        .single();

      if (error) {
        logger.error(
          'admin/retention-policies',
          `Failed to update retention policy for ${tableName}`,
          error,
        );
        throw error;
      }
      return data as RetentionPolicy;
    } catch (error) {
      logger.error(
        'admin/retention-policies',
        'Unexpected error in update()',
        error,
      );
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// React Query hooks
// ---------------------------------------------------------------------------

/**
 * useRetentionPolicies — fetch all policy rows for the admin UI.
 *
 * Caller pattern:
 *   const { data, isLoading, error } = useRetentionPolicies();
 */
export function useRetentionPolicies(): UseQueryResult<RetentionPolicy[], Error> {
  return useQuery<RetentionPolicy[], Error>({
    queryKey: QUERY_KEY,
    queryFn: () => RetentionPoliciesService.list(),
    staleTime: 30 * 1000, // 30s — config rarely changes
  });
}

/**
 * useUpdateRetentionPolicy — patch a single row (retention_days or enabled).
 *
 * Caller pattern:
 *   const update = useUpdateRetentionPolicy();
 *   update.mutate({ tableName: 'admission_counselor_duty_log', patch: { retention_days: 60 } });
 */
export function useUpdateRetentionPolicy(): UseMutationResult<
  RetentionPolicy,
  Error,
  { tableName: string; patch: RetentionPolicyUpdate }
> {
  const queryClient = useQueryClient();
  return useMutation<
    RetentionPolicy,
    Error,
    { tableName: string; patch: RetentionPolicyUpdate }
  >({
    mutationFn: ({ tableName, patch }) =>
      RetentionPoliciesService.update(tableName, patch),
    onSuccess: () => {
      // Invalidate so the table re-fetches with fresh updated_at + updated_by.
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
