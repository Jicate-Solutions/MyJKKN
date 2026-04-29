/**
 * Admin Nav Overrides Service
 *
 * Director's Approach 4 (2026-04-29): the filesystem (Agent M's
 * `lib/admin/nav-tree.ts`) auto-discovers /admin/* pages by default.
 * THIS service backs `/admin/nav-config` — the super_admin UI for
 * adding override rows that rename, reorder, hide, or recategorize any
 * auto-discovered page from the UI without code changes.
 *
 * Substrate: extends `platform_policies` with key prefix
 * `nav.admin.override.<href-with-slashes-replaced-by-dots>`. One row per
 * override, value is a JSONB object with optional fields.
 *
 * Server-side merge: Agent M's nav-tree.ts reads the same rows via
 * `fn_get_admin_nav_overrides()` (SECURITY DEFINER) — that's a follow-up
 * coordinator commit AFTER this PR + Agent M's PR both merge. Until then
 * the UI is wired but overrides don't take effect on the rendered nav.
 *
 * Migration: supabase/migrations/20260429_admin_nav_overrides_seeds.sql
 *   - Adds fn_get_admin_nav_overrides() helper
 *   - NO seed rows (overrides start empty; filesystem is the default)
 *
 * RLS: any authenticated user can read; only super_admin / admin can
 * write. Same rules as all platform_policies rows.
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
 * The user-facing shape of a nav override. Translates between the storage
 * form (policy_key + JSONB value) and the UI form (href + typed fields).
 *
 * All "override" fields are optional — leave a field unset to inherit the
 * filesystem-auto-discovered default. Set `hidden: true` to hide a page
 * entirely from the rendered nav.
 */
export interface AdminNavOverride {
  /** Storage row id (uuid). Undefined for unsaved drafts. */
  id?: string;
  /** Target href, e.g. `/admin/notifications/recipients`. */
  href: string;
  /** Override category (e.g. `'System'`). Unset = use filesystem default. */
  category?: string | null;
  /** Override label/display name. Unset = use filesystem default. */
  label?: string | null;
  /**
   * Override sort order within category. Lower = earlier. Unset = use
   * filesystem default (typically alphabetical).
   */
  display_order?: number | null;
  /** When true, hide the page from the rendered nav entirely. */
  hidden?: boolean | null;
  /** Override icon name (lucide-react). Unset = use filesystem default. */
  icon?: string | null;
  /** Optional human-readable description (shown in the admin table). */
  description?: string | null;
  /** Last update timestamp from the storage row. */
  updated_at?: string | null;
}

const QUERY_KEY = ['admin', 'nav-overrides'] as const;

/**
 * Convert an href like `/admin/notifications/recipients` into the
 * platform_policies key form `nav.admin.override.admin.notifications.recipients`.
 *
 * Round-trip with `keyToHref()` below.
 */
export function hrefToPolicyKey(href: string): string {
  const trimmed = href.trim();
  if (!trimmed.startsWith('/')) {
    throw new Error(
      `Override href must be an absolute path starting with "/" (got "${href}")`,
    );
  }
  // Drop the leading slash, swap '/' → '.'
  const dotted = trimmed.slice(1).replace(/\//g, '.');
  return `nav.admin.override.${dotted}`;
}

/**
 * Convert a platform_policies key like
 * `nav.admin.override.admin.notifications.recipients` back into the href
 * `/admin/notifications/recipients`. Used for rendering existing rows.
 */
export function keyToHref(policyKey: string): string {
  const prefix = 'nav.admin.override.';
  if (!policyKey.startsWith(prefix)) {
    return ''; // shouldn't happen given our list filter
  }
  const remainder = policyKey.slice(prefix.length);
  return '/' + remainder.replace(/\./g, '/');
}

/**
 * Translate an override into the JSONB shape we persist. Fields with
 * `null` / `undefined` are STRIPPED rather than written as `null`, so a
 * fresh row only carries the user's actual intent and the merge layer
 * can cleanly fall back to filesystem defaults.
 */
function overrideToValue(override: AdminNavOverride): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  if (override.category != null && override.category !== '') {
    value.category = override.category;
  }
  if (override.label != null && override.label !== '') {
    value.label = override.label;
  }
  if (override.display_order != null) {
    value.displayOrder = override.display_order;
  }
  if (override.hidden === true) {
    // Only persist when truthy; absence means "do not hide".
    value.hidden = true;
  }
  if (override.icon != null && override.icon !== '') {
    value.icon = override.icon;
  }
  return value;
}

/**
 * Translate a stored row (DB shape) into the UI shape.
 */
interface StoredOverrideRow {
  id: string;
  policy_key: string;
  value: unknown;
  description: string | null;
  updated_at: string | null;
}

function rowToOverride(row: StoredOverrideRow): AdminNavOverride {
  const v = (row.value ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    href: keyToHref(row.policy_key),
    category: typeof v.category === 'string' ? v.category : null,
    label: typeof v.label === 'string' ? v.label : null,
    display_order:
      typeof v.displayOrder === 'number'
        ? v.displayOrder
        : typeof v.displayOrder === 'string'
          ? Number.parseInt(v.displayOrder, 10) || null
          : null,
    hidden: v.hidden === true,
    icon: typeof v.icon === 'string' ? v.icon : null,
    description: row.description ?? null,
    updated_at: row.updated_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AdminNavOverridesService {
  /**
   * List all admin nav override rows from platform_policies, sorted by
   * policy_key (which is href-equivalent).
   */
  static async list(): Promise<AdminNavOverride[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('platform_policies')
        .select('id, policy_key, value, description, updated_at')
        .like('policy_key', 'nav.admin.override.%')
        .eq('scope_type', 'global')
        .order('policy_key', { ascending: true });

      if (error) {
        logger.error(
          'admin/nav-overrides',
          'Failed to fetch admin nav overrides',
          error,
        );
        throw error;
      }

      return (data ?? []).map((row) => rowToOverride(row as StoredOverrideRow));
    } catch (error) {
      logger.error(
        'admin/nav-overrides',
        'Unexpected error in list()',
        error,
      );
      throw error;
    }
  }

  /**
   * Upsert an override row, keyed by href. Creates a new row if the
   * policy_key doesn't exist; updates value / description / updated_by
   * if it does.
   *
   * Stamps `updated_by = auth.uid()` for the audit trail. RLS enforces
   * super_admin / admin only.
   */
  static async upsert(
    override: AdminNavOverride,
  ): Promise<AdminNavOverride> {
    try {
      const supabase = createClientSupabaseClient();
      const policyKey = hrefToPolicyKey(override.href);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const value = overrideToValue(override);

      // Upsert by (policy_key, scope_type, scope_id) — the natural unique
      // tuple for global policies. We treat scope_id IS NULL as a single
      // logical key by selecting first then INSERT/UPDATE.
      const { data: existing, error: selectError } = await supabase
        .from('platform_policies')
        .select('id')
        .eq('policy_key', policyKey)
        .eq('scope_type', 'global')
        .is('scope_id', null)
        .maybeSingle();

      if (selectError) {
        logger.error(
          'admin/nav-overrides',
          `Failed to look up existing row for ${policyKey}`,
          selectError,
        );
        throw selectError;
      }

      if (existing) {
        const { data, error } = await supabase
          .from('platform_policies')
          .update({
            value,
            description: override.description ?? null,
            updated_by: user?.id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select('id, policy_key, value, description, updated_at')
          .single();

        if (error) {
          logger.error(
            'admin/nav-overrides',
            `Failed to update override ${policyKey}`,
            error,
          );
          throw error;
        }
        return rowToOverride(data as StoredOverrideRow);
      }

      const { data, error } = await supabase
        .from('platform_policies')
        .insert({
          policy_key: policyKey,
          scope_type: 'global',
          scope_id: null,
          value,
          description: override.description ?? null,
          data_type: 'object',
          is_system: false,
          is_active: true,
          updated_by: user?.id ?? null,
        })
        .select('id, policy_key, value, description, updated_at')
        .single();

      if (error) {
        logger.error(
          'admin/nav-overrides',
          `Failed to insert override ${policyKey}`,
          error,
        );
        throw error;
      }
      return rowToOverride(data as StoredOverrideRow);
    } catch (error) {
      logger.error(
        'admin/nav-overrides',
        'Unexpected error in upsert()',
        error,
      );
      throw error;
    }
  }

  /**
   * Delete an override row by id. The auto-discovery default re-applies
   * to that href on the next nav build.
   */
  static async remove(id: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('platform_policies')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error(
          'admin/nav-overrides',
          `Failed to delete override ${id}`,
          error,
        );
        throw error;
      }
    } catch (error) {
      logger.error(
        'admin/nav-overrides',
        'Unexpected error in remove()',
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
 * useAdminNavOverrides — fetch all admin nav override rows.
 */
export function useAdminNavOverrides(): UseQueryResult<
  AdminNavOverride[],
  Error
> {
  return useQuery<AdminNavOverride[], Error>({
    queryKey: QUERY_KEY,
    queryFn: () => AdminNavOverridesService.list(),
    staleTime: 30 * 1000, // 30s — overrides change rarely
  });
}

/**
 * useUpsertAdminNavOverride — create-or-update an override by href.
 */
export function useUpsertAdminNavOverride(): UseMutationResult<
  AdminNavOverride,
  Error,
  AdminNavOverride
> {
  const queryClient = useQueryClient();
  return useMutation<AdminNavOverride, Error, AdminNavOverride>({
    mutationFn: (override) => AdminNavOverridesService.upsert(override),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/**
 * useDeleteAdminNavOverride — delete an override by id; the
 * filesystem default re-applies on the next nav build.
 */
export function useDeleteAdminNavOverride(): UseMutationResult<
  void,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => AdminNavOverridesService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
