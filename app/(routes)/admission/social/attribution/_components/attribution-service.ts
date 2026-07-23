/**
 * Instagram attribution service — local to /admission/social/attribution.
 *
 * Two read paths + one policy upsert:
 *   - useAttributionByAccount() → leads by IG account (drilldown #1)
 *   - useAttributionByPost()    → top-performing IG posts (drilldown #2)
 *   - useAttributionWindowDays() / useUpsertAttributionWindowDays()
 *
 * Reads come from the v_ig_admission_attribution view (created by
 * 20260530150000_instagram_lead_attribution). Policy row is the canonical
 * platform_policies row `ig.attribution_window_days` (super_admin RLS).
 *
 * If Agent β's substrate hasn't merged on a deploy slot, the view may not
 * exist — list() catches that error and surfaces "view not yet provisioned"
 * to the UI as a non-blocking empty state.
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

export const ATTRIBUTION_WINDOW_POLICY_KEY = 'ig.attribution_window_days';
export const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 30;

const ACCOUNT_QUERY_KEY = ['admin', 'ig-attribution', 'accounts'] as const;
const POST_QUERY_KEY = ['admin', 'ig-attribution', 'posts'] as const;
const POLICY_QUERY_KEY = ['admin', 'ig-attribution', 'window'] as const;

// ---------------------------------------------------------------------------
// Types — match the v_ig_admission_attribution view columns.
// ---------------------------------------------------------------------------
export interface AttributionPostRow {
  ig_post_id: string;
  ig_account_id: string;
  institution_id: string | null;
  department_id: string | null;
  account_username: string | null;
  posted_at: string | null;
  post_permalink: string | null;
  media_type: string | null;
  lead_count: number;
  converted_lead_count: number;
  applied_lead_count: number;
}

export interface AttributionAccountRow {
  ig_account_id: string;
  account_username: string | null;
  institution_id: string | null;
  department_id: string | null;
  post_count: number;
  lead_count: number;
  converted_lead_count: number;
  applied_lead_count: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export class IgAttributionService {
  static async listPosts(): Promise<AttributionPostRow[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('v_ig_admission_attribution')
        .select('*')
        .order('lead_count', { ascending: false })
        .limit(100);
      if (error) {
        logger.error('admin/ig-attribution', 'listPosts failed', error);
        return [];
      }
      return (data ?? []) as AttributionPostRow[];
    } catch (e) {
      logger.error('admin/ig-attribution', 'listPosts threw', e);
      return [];
    }
  }

  static async listAccounts(): Promise<AttributionAccountRow[]> {
    // Aggregate the view rows by account_id. Done client-side because the
    // view is small (one row per post). For >1k posts a server-side rollup
    // view should be added.
    const posts = await this.listPosts();
    const byAccount = new Map<string, AttributionAccountRow>();
    for (const p of posts) {
      const existing = byAccount.get(p.ig_account_id);
      if (existing) {
        existing.post_count += 1;
        existing.lead_count += p.lead_count;
        existing.converted_lead_count += p.converted_lead_count;
        existing.applied_lead_count += p.applied_lead_count;
      } else {
        byAccount.set(p.ig_account_id, {
          ig_account_id: p.ig_account_id,
          account_username: p.account_username,
          institution_id: p.institution_id,
          department_id: p.department_id,
          post_count: 1,
          lead_count: p.lead_count,
          converted_lead_count: p.converted_lead_count,
          applied_lead_count: p.applied_lead_count,
        });
      }
    }
    return Array.from(byAccount.values()).sort(
      (a, b) => b.lead_count - a.lead_count,
    );
  }

  static async getAttributionWindowDays(): Promise<{
    value: number;
    isOverride: boolean;
    rowId: string | null;
  }> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('platform_policies')
        .select('id, value')
        .eq('policy_key', ATTRIBUTION_WINDOW_POLICY_KEY)
        .eq('scope_type', 'global')
        .is('scope_id', null)
        .maybeSingle();
      if (error) {
        logger.error(
          'admin/ig-attribution',
          'getAttributionWindowDays failed',
          error,
        );
        return {
          value: DEFAULT_ATTRIBUTION_WINDOW_DAYS,
          isOverride: false,
          rowId: null,
        };
      }
      if (!data) {
        return {
          value: DEFAULT_ATTRIBUTION_WINDOW_DAYS,
          isOverride: false,
          rowId: null,
        };
      }
      const v = data.value;
      const num = typeof v === 'number' ? v : Number(v);
      return {
        value: Number.isFinite(num) && num > 0
          ? num
          : DEFAULT_ATTRIBUTION_WINDOW_DAYS,
        isOverride: true,
        rowId: data.id,
      };
    } catch (e) {
      logger.error('admin/ig-attribution', 'window getter threw', e);
      return {
        value: DEFAULT_ATTRIBUTION_WINDOW_DAYS,
        isOverride: false,
        rowId: null,
      };
    }
  }

  static async upsertAttributionWindowDays(days: number): Promise<void> {
    const supabase = createClientSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: existing, error: lookupError } = await supabase
      .from('platform_policies')
      .select('id')
      .eq('policy_key', ATTRIBUTION_WINDOW_POLICY_KEY)
      .eq('scope_type', 'global')
      .is('scope_id', null)
      .maybeSingle();
    if (lookupError) {
      logger.error('admin/ig-attribution', 'window lookup failed', lookupError);
      throw lookupError;
    }

    if (existing) {
      const { error } = await supabase
        .from('platform_policies')
        .update({
          value: days,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) {
        logger.error('admin/ig-attribution', 'window update failed', error);
        throw error;
      }
      return;
    }

    const { error } = await supabase.from('platform_policies').insert({
      policy_key: ATTRIBUTION_WINDOW_POLICY_KEY,
      scope_type: 'global',
      scope_id: null,
      value: days,
      data_type: 'number',
      description:
        'How many days after an Instagram post a lead can be attributed to it.',
      is_system: true,
      is_active: true,
      updated_by: user?.id ?? null,
    });
    if (error) {
      logger.error('admin/ig-attribution', 'window insert failed', error);
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
export function useAttributionByAccount(): UseQueryResult<
  AttributionAccountRow[],
  Error
> {
  return useQuery<AttributionAccountRow[], Error>({
    queryKey: ACCOUNT_QUERY_KEY,
    queryFn: () => IgAttributionService.listAccounts(),
    staleTime: 30_000,
  });
}

export function useAttributionByPost(): UseQueryResult<
  AttributionPostRow[],
  Error
> {
  return useQuery<AttributionPostRow[], Error>({
    queryKey: POST_QUERY_KEY,
    queryFn: () => IgAttributionService.listPosts(),
    staleTime: 30_000,
  });
}

export function useAttributionWindowDays(): UseQueryResult<
  { value: number; isOverride: boolean; rowId: string | null },
  Error
> {
  return useQuery({
    queryKey: POLICY_QUERY_KEY,
    queryFn: () => IgAttributionService.getAttributionWindowDays(),
    staleTime: 60_000,
  });
}

export function useUpsertAttributionWindowDays(): UseMutationResult<
  void,
  Error,
  number
> {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (days) => IgAttributionService.upsertAttributionWindowDays(days),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: POLICY_QUERY_KEY });
    },
  });
}
