// lib/services/admission/tier-policy-service.ts
// ============================================================================
// Counselor Tier Policy Service — config-row substrate (2026-05-06)
//
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every policy decision = config-table row + super_admin UI to write + reader fn.
//
// This service backs the admin CRUD UI at /admin/counselors/tier-policy. The
// table sits unused initially; the SQL function rewrite that READS from
// fn_get_counselor_tier_policy is a SEPARATE follow-up PR. See companion
// migration: supabase/migrations/20260510200001_create_counselor_tier_policy.sql
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TierScopeType = 'global' | 'institution';

export type TierStrategy =
  | 'institution_and_source'
  | 'institution_only'
  | 'institution_legacy_fk'
  | 'cross_institution_fallback';

export interface CounselorTierPolicy {
  id: string;
  scope_type: TierScopeType;
  institution_id: string | null;
  tier_order: number;
  tier_strategy: TierStrategy;
  on_duty_required: boolean;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateTierPolicyInput {
  scope_type: TierScopeType;
  institution_id?: string | null;
  tier_order: number;
  tier_strategy: TierStrategy;
  on_duty_required?: boolean;
  is_active?: boolean;
  description?: string | null;
}

export interface UpdateTierPolicyInput {
  scope_type?: TierScopeType;
  institution_id?: string | null;
  tier_order?: number;
  tier_strategy?: TierStrategy;
  on_duty_required?: boolean;
  is_active?: boolean;
  description?: string | null;
}

// Reader-fn return shape (resolved tier list for an institution)
export interface ResolvedTierEntry {
  tier_order: number;
  tier_strategy: TierStrategy;
  on_duty_required: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TierPolicyService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  /**
   * Fetch tier policies. When `institutionId` is provided, returns rows scoped
   * to either `global` OR that specific institution (the same set the reader fn
   * considers). When omitted, returns all rows visible under RLS.
   *
   * Mirrors AssignmentRulesService's institution-optional pattern — passing
   * `undefined` to .eq() previously caused supabase-js to send `eq.undefined`
   * and 22P02 UUID parse errors.
   */
  static async getTierPolicies(
    institutionId?: string,
  ): Promise<CounselorTierPolicy[]> {
    let query = this.supabase
      .from('counselor_tier_policy')
      .select('*')
      .order('scope_type', { ascending: false }) // global first, then institution
      .order('tier_order', { ascending: true });

    if (institutionId) {
      // Show global rows + this institution's overrides (matches reader-fn shape)
      query = query.or(
        `scope_type.eq.global,institution_id.eq.${institutionId}`,
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admission/tier-policy] Failed to fetch policies:', error);
      throw new Error('Failed to fetch counselor tier policies');
    }

    return (data ?? []) as CounselorTierPolicy[];
  }

  /**
   * Fetch only active tier policies (matches what the reader fn considers).
   */
  static async getActiveTierPolicies(
    institutionId?: string,
  ): Promise<CounselorTierPolicy[]> {
    let query = this.supabase
      .from('counselor_tier_policy')
      .select('*')
      .eq('is_active', true)
      .order('scope_type', { ascending: false })
      .order('tier_order', { ascending: true });

    if (institutionId) {
      query = query.or(
        `scope_type.eq.global,institution_id.eq.${institutionId}`,
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error(
        '[admission/tier-policy] Failed to fetch active policies:',
        error,
      );
      throw new Error('Failed to fetch active counselor tier policies');
    }

    return (data ?? []) as CounselorTierPolicy[];
  }

  /**
   * Fetch a single tier policy by id.
   */
  static async getTierPolicy(
    id: string,
  ): Promise<CounselorTierPolicy | null> {
    const { data, error } = await this.supabase
      .from('counselor_tier_policy')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[admission/tier-policy] Failed to fetch policy:', error);
      throw new Error('Failed to fetch counselor tier policy');
    }

    return (data ?? null) as CounselorTierPolicy | null;
  }

  /**
   * Resolve the active tier list for an institution via the SECURITY DEFINER
   * reader fn (institution overrides win over global). This is what the
   * follow-up SQL function rewrite will call from inside `fn_auto_assign_counselor_v2`.
   */
  static async resolveTiersFor(
    institutionId?: string | null,
  ): Promise<ResolvedTierEntry[]> {
    const { data, error } = await this.supabase.rpc(
      'fn_get_counselor_tier_policy',
      { p_institution_id: institutionId ?? null },
    );

    if (error) {
      console.error('[admission/tier-policy] resolveTiersFor failed:', error);
      throw new Error('Failed to resolve tier policy');
    }

    return (data ?? []) as ResolvedTierEntry[];
  }

  /**
   * Create a new tier policy row.
   *
   * Important: the table CHECK constraint enforces:
   *   (scope_type='global' AND institution_id IS NULL) OR
   *   (scope_type='institution' AND institution_id IS NOT NULL)
   * The unique index also rejects duplicate (scope, institution_id, tier_order)
   * combinations. Surface those PG errors to the caller with the original message.
   */
  static async createTierPolicy(
    input: CreateTierPolicyInput,
  ): Promise<CounselorTierPolicy> {
    const payload: Record<string, unknown> = {
      scope_type: input.scope_type,
      institution_id:
        input.scope_type === 'global'
          ? null
          : input.institution_id ?? null,
      tier_order: input.tier_order,
      tier_strategy: input.tier_strategy,
      on_duty_required: input.on_duty_required ?? true,
      is_active: input.is_active ?? true,
      description: input.description ?? null,
    };

    const { data, error } = await this.supabase
      .from('counselor_tier_policy')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[admission/tier-policy] Failed to create policy:', error);
      throw new Error(error.message || 'Failed to create counselor tier policy');
    }

    return data as CounselorTierPolicy;
  }

  /**
   * Update an existing tier policy. Only forwards fields the caller actually
   * provided (avoids accidentally clearing description / institution_id on
   * partial-form PATCH updates).
   */
  static async updateTierPolicy(
    id: string,
    input: UpdateTierPolicyInput,
  ): Promise<CounselorTierPolicy> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.scope_type !== undefined) updateData.scope_type = input.scope_type;
    if (input.institution_id !== undefined)
      updateData.institution_id = input.institution_id;
    if (input.tier_order !== undefined) updateData.tier_order = input.tier_order;
    if (input.tier_strategy !== undefined)
      updateData.tier_strategy = input.tier_strategy;
    if (input.on_duty_required !== undefined)
      updateData.on_duty_required = input.on_duty_required;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;
    if (input.description !== undefined)
      updateData.description = input.description;

    const { data, error } = await this.supabase
      .from('counselor_tier_policy')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/tier-policy] Failed to update policy:', error);
      throw new Error(error.message || 'Failed to update counselor tier policy');
    }

    return data as CounselorTierPolicy;
  }

  /**
   * Convenience helper for the active-toggle switch in the data table.
   */
  static async toggleActive(
    id: string,
    isActive: boolean,
  ): Promise<CounselorTierPolicy> {
    return this.updateTierPolicy(id, { is_active: isActive });
  }

  /**
   * Delete a tier policy row. Hard delete; the unique index frees up the
   * (scope, institution, tier_order) slot for re-use immediately.
   */
  static async deleteTierPolicy(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('counselor_tier_policy')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admission/tier-policy] Failed to delete policy:', error);
      throw new Error('Failed to delete counselor tier policy');
    }
  }

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------

  /**
   * Plain-English label for a tier_strategy value. Director-facing — engineering
   * terms (junction, FK, source) live in the .hint, never in the label.
   */
  static formatTierStrategy(strategy: TierStrategy): string {
    switch (strategy) {
      case 'institution_and_source':
        return 'Match by college AND lead source';
      case 'institution_only':
        return 'Match by college only';
      case 'institution_legacy_fk':
        return 'Old college mapping (legacy)';
      case 'cross_institution_fallback':
        return 'Anyone available, any college';
    }
  }

  /**
   * Plain-English explanation of WHAT this strategy does — shown next to the label
   * in the form dialog's hint text and inside each cascade card on the table.
   */
  static explainTierStrategy(strategy: TierStrategy): string {
    switch (strategy) {
      case 'institution_and_source':
        return 'Find counselors who handle this college AND know about this lead source (Instagram, Meta, walk-in, etc.).';
      case 'institution_only':
        return 'Find any counselor handling this college, regardless of lead source.';
      case 'institution_legacy_fk':
        return 'Falls back to the original college link from earlier data. Used when the new mapping is missing.';
      case 'cross_institution_fallback':
        return 'Last resort. If no college-matched counselor is free, give the lead to any available counselor across all colleges.';
    }
  }

  /**
   * Plain-English scope label. "Applies to all colleges" vs "Just for X College".
   */
  static formatScope(
    scope: TierScopeType,
    institutionName?: string | null,
  ): string {
    if (scope === 'global') return 'Applies to all colleges';
    return institutionName
      ? `Just for ${institutionName}`
      : 'Just for one college';
  }

  /**
   * Plain-English on-duty label. "Only counselors clocked in today" vs
   * "Any counselor (clocked in or not)".
   */
  static formatOnDuty(required: boolean): string {
    return required
      ? 'Only counselors clocked in today'
      : 'Any counselor (clocked in or not)';
  }

  /**
   * Static lookup of the four allowed strategies — used to populate the form
   * dialog's Select component without re-deriving from the union type.
   */
  static readonly TIER_STRATEGY_OPTIONS: ReadonlyArray<{
    value: TierStrategy;
    label: string;
    hint: string;
  }> = [
    {
      value: 'institution_and_source',
      label: 'Match by college AND lead source',
      hint: 'Find counselors who handle this college AND know about this lead source (Instagram, Meta, walk-in, etc.). Most specific match.',
    },
    {
      value: 'institution_only',
      label: 'Match by college only',
      hint: 'Find any counselor handling this college, regardless of lead source.',
    },
    {
      value: 'institution_legacy_fk',
      label: 'Old college mapping (legacy)',
      hint: 'Falls back to the original college link from earlier data. Used when the new mapping is missing.',
    },
    {
      value: 'cross_institution_fallback',
      label: 'Anyone available, any college',
      hint: 'Last resort. If no college-matched counselor is free, give the lead to any available counselor across all colleges.',
    },
  ];
}
