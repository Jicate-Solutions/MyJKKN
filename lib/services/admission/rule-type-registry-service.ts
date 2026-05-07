// lib/services/admission/rule-type-registry-service.ts
// ============================================================================
// Assignment Rule Type Registry Service — config-row substrate (2026-05-07)
//
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every policy decision = config-table row + super_admin UI to write.
//
// Backs:
//   - The rule-form-dialog dropdown that previously hardcoded RULE_TYPES.
//   - The /admin/counselors/rule-types CRUD UI for super-admins.
//
// Companion migration: supabase/migrations/20260510210001_create_assignment_rule_type_registry.sql
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssignmentRuleTypeRow {
  id: string;
  rule_type_key: string;
  display_label: string;
  description: string | null;
  icon_name: string | null;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateRuleTypeInput {
  rule_type_key: string;
  display_label: string;
  description?: string | null;
  icon_name?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface UpdateRuleTypeInput {
  rule_type_key?: string;
  display_label?: string;
  description?: string | null;
  icon_name?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RuleTypeRegistryService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  /**
   * Fetch all rule types (active + inactive). Used by the admin CRUD table.
   */
  static async getAllRuleTypes(): Promise<AssignmentRuleTypeRow[]> {
    const { data, error } = await this.supabase
      .from('assignment_rule_type_registry')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('display_label', { ascending: true });

    if (error) {
      console.error('[admission/rule-type-registry] Failed to fetch rule types:', error);
      throw new Error('Failed to fetch rule types');
    }

    return (data ?? []) as AssignmentRuleTypeRow[];
  }

  /**
   * Fetch only active rule types — used by the rule-form-dialog dropdown.
   * Public read RLS means this works for every authenticated role.
   */
  static async getActiveRuleTypes(): Promise<AssignmentRuleTypeRow[]> {
    const { data, error } = await this.supabase
      .from('assignment_rule_type_registry')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('display_label', { ascending: true });

    if (error) {
      console.error('[admission/rule-type-registry] Failed to fetch active rule types:', error);
      throw new Error('Failed to fetch active rule types');
    }

    return (data ?? []) as AssignmentRuleTypeRow[];
  }

  /**
   * Fetch a single rule type by id.
   */
  static async getRuleType(id: string): Promise<AssignmentRuleTypeRow | null> {
    const { data, error } = await this.supabase
      .from('assignment_rule_type_registry')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[admission/rule-type-registry] Failed to fetch rule type:', error);
      throw new Error('Failed to fetch rule type');
    }

    return (data ?? null) as AssignmentRuleTypeRow | null;
  }

  /**
   * Create a new rule type. New rows default to is_system=false (admin-created).
   * The UNIQUE(rule_type_key) constraint surfaces a friendly error on duplicate keys.
   */
  static async createRuleType(input: CreateRuleTypeInput): Promise<AssignmentRuleTypeRow> {
    const payload: Record<string, unknown> = {
      rule_type_key: input.rule_type_key,
      display_label: input.display_label,
      description: input.description ?? null,
      icon_name: input.icon_name ?? null,
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true,
      // is_system intentionally omitted — admin-created types are NEVER system rows.
    };

    const { data, error } = await this.supabase
      .from('assignment_rule_type_registry')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[admission/rule-type-registry] Failed to create rule type:', error);
      throw new Error(error.message || 'Failed to create rule type');
    }

    return data as AssignmentRuleTypeRow;
  }

  /**
   * Update an existing rule type. Only forwards fields the caller actually
   * provided. is_system is NEVER updatable from this service (admin UI hides it).
   */
  static async updateRuleType(
    id: string,
    input: UpdateRuleTypeInput,
  ): Promise<AssignmentRuleTypeRow> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.rule_type_key !== undefined) updateData.rule_type_key = input.rule_type_key;
    if (input.display_label !== undefined) updateData.display_label = input.display_label;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.icon_name !== undefined) updateData.icon_name = input.icon_name;
    if (input.sort_order !== undefined) updateData.sort_order = input.sort_order;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;

    const { data, error } = await this.supabase
      .from('assignment_rule_type_registry')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/rule-type-registry] Failed to update rule type:', error);
      throw new Error(error.message || 'Failed to update rule type');
    }

    return data as AssignmentRuleTypeRow;
  }

  /**
   * Convenience helper for the active-toggle switch in the data table.
   */
  static async toggleActive(id: string, isActive: boolean): Promise<AssignmentRuleTypeRow> {
    return this.updateRuleType(id, { is_active: isActive });
  }

  /**
   * Soft-deactivate a rule type (preferred for is_system=true rows).
   */
  static async deactivateRuleType(id: string): Promise<AssignmentRuleTypeRow> {
    return this.updateRuleType(id, { is_active: false });
  }

  /**
   * Hard-delete a rule type. The admin UI guards is_system=true rows from
   * reaching this method (deactivate is the documented path for those).
   */
  static async deleteRuleType(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('assignment_rule_type_registry')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admission/rule-type-registry] Failed to delete rule type:', error);
      throw new Error(error.message || 'Failed to delete rule type');
    }
  }
}
