/**
 * Landing Page Policies Service
 *
 * Director's standing rule (2026-04-29): every policy decision = config-table
 * row + super_admin UI to write. Result: zero deploys, zero PRs, zero
 * developer round-trips for tweaks.
 *
 * This service backs `/admin/landing-pages` — super_admins can edit which
 * sub-page each module's root URL redirects to, by writing the
 * `nav.<module>.default_landing` rows in `platform_policies`.
 *
 * Server-side consumers (e.g. /admin/page.tsx, /admin/lti/page.tsx) read the
 * same rows via the SECURITY DEFINER helper `fn_get_policy_text(key, default)`,
 * not via this service. The service is for the admin UI only.
 *
 * Substrate (PR #595, Phase 1.5a):
 *   Table:   platform_policies
 *     id           uuid PK
 *     policy_key   text   (e.g. 'nav.admin.default_landing')
 *     scope_type   text   ('global' | 'institution' | 'role' | 'user')
 *     scope_id     uuid   (NULL for global)
 *     value        jsonb  (string-typed for these keys, e.g. '"/admin/bug-reports"')
 *     description  text
 *     data_type    text   ('string' for these rows)
 *     updated_at   timestamptz
 *     updated_by   uuid
 *
 * RLS: any authenticated user can read; only is_super_admin() / is_admin()
 * can update. Sister-PR migration (Agent J) seeds the 3 nav.* rows.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Single landing-page policy row, with `value` unwrapped to a plain string
 * for friendly UI editing. The DB column is JSONB but for these keys it is
 * always a JSON-encoded string (e.g. `"/admin/bug-reports"`).
 */
export interface LandingPagePolicy {
  id: string;
  policy_key: string;
  scope_type: string;
  scope_id: string | null;
  value: string;
  description: string | null;
  updated_at: string | null;
}

const QUERY_KEY = ['admin', 'landing-page-policies'] as const;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * `value` round-tripping through PostgREST:
 *
 * - For string-typed JSONB rows (e.g. `'"/admin/bug-reports"'`), PostgREST
 *   auto-decodes the JSON and the supabase-js client returns a plain JS
 *   string. So `data[i].value` is already `"/admin/bug-reports"`.
 *
 * - On write, supabase-js JSON-encodes the JS value automatically when the
 *   target column is JSONB. So we pass a plain string and PostgREST stores
 *   it as `'"/admin/bug-reports"'`.
 *
 * If the DB ever returns the value in another shape (defensive), we fall
 * back to JSON.parse.
 */
function unwrapValue(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw === null || raw === undefined) return '';
  try {
    const parsed = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    return parsed;
  } catch {
    return '';
  }
}

export class LandingPagePoliciesService {
  /**
   * List all `nav.%.default_landing` rows at global scope, sorted by
   * policy_key for stable rendering.
   */
  static async list(): Promise<LandingPagePolicy[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('platform_policies')
        .select(
          'id, policy_key, scope_type, scope_id, value, description, updated_at',
        )
        .like('policy_key', 'nav.%.default_landing')
        .eq('scope_type', 'global')
        .order('policy_key', { ascending: true });

      if (error) {
        logger.error(
          'admin/landing-page-policies',
          'Failed to fetch landing-page policies',
          error,
        );
        throw error;
      }

      return (data ?? []).map((row) => ({
        id: row.id,
        policy_key: row.policy_key,
        scope_type: row.scope_type,
        scope_id: row.scope_id,
        value: unwrapValue(row.value),
        description: row.description ?? null,
        updated_at: row.updated_at ?? null,
      }));
    } catch (error) {
      logger.error(
        'admin/landing-page-policies',
        'Unexpected error in list()',
        error,
      );
      throw error;
    }
  }

  /**
   * Update a single landing-page policy row.
   *
   * Stamps `updated_by = auth.uid()` for the audit trail. RLS enforces that
   * only super_admin / admin can land an UPDATE.
   */
  static async update(id: string, newValue: string): Promise<LandingPagePolicy> {
    try {
      const supabase = createClientSupabaseClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const trimmed = newValue.trim();
      if (!trimmed.startsWith('/')) {
        throw new Error(
          `Landing-page value must be an absolute path starting with "/" (got "${newValue}")`,
        );
      }

      const { data, error } = await supabase
        .from('platform_policies')
        .update({
          value: trimmed, // supabase-js JSON-encodes for JSONB column
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select(
          'id, policy_key, scope_type, scope_id, value, description, updated_at',
        )
        .single();

      if (error) {
        logger.error(
          'admin/landing-page-policies',
          `Failed to update landing-page policy ${id}`,
          error,
        );
        throw error;
      }

      return {
        id: data.id,
        policy_key: data.policy_key,
        scope_type: data.scope_type,
        scope_id: data.scope_id,
        value: unwrapValue(data.value),
        description: data.description ?? null,
        updated_at: data.updated_at ?? null,
      };
    } catch (error) {
      logger.error(
        'admin/landing-page-policies',
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
 * useLandingPagePolicies — fetch all `nav.%.default_landing` global rows.
 */
export function useLandingPagePolicies(): UseQueryResult<
  LandingPagePolicy[],
  Error
> {
  return useQuery<LandingPagePolicy[], Error>({
    queryKey: QUERY_KEY,
    queryFn: () => LandingPagePoliciesService.list(),
    staleTime: 30 * 1000, // 30s — config rarely changes
  });
}

/**
 * useUpdateLandingPagePolicy — patch a single row's value (the path string).
 */
export function useUpdateLandingPagePolicy(): UseMutationResult<
  LandingPagePolicy,
  Error,
  { id: string; value: string }
> {
  const queryClient = useQueryClient();
  return useMutation<
    LandingPagePolicy,
    Error,
    { id: string; value: string }
  >({
    mutationFn: ({ id, value }) =>
      LandingPagePoliciesService.update(id, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
