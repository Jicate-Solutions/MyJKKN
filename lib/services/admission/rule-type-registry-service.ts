// lib/services/admission/rule-type-registry-service.ts
// Created: 2026-05-06
// Purpose: CRUD over assignment_rule_type_registry rows. Reads visible to all
//          authenticated roles (the rule-form-dialog dropdown needs to render
//          for super_admin / admin / admission_counselor). Writes super_admin
//          only (RLS-enforced).
//
// Director's standing rule (2026-04-29): policy decisions = config-table rows
// + super_admin UI to write. Memory: feedback_policy_decisions_must_be_config_rows.md
// Pattern reference: lib/services/admin/counselor-routing-config-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface RuleTypeRegistryRow {
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
  display_label?: string;
  description?: string | null;
  icon_name?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

const TABLE = 'assignment_rule_type_registry';

export class RuleTypeRegistryService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * List active rule types ordered by sort_order. Used by the rule-form-dialog
   * dropdown — keep this lean; admins use listAll() for the management UI.
   */
  static async getRuleTypes(): Promise<RuleTypeRegistryRow[]> {
    const { data, error } = await (this.supabase as any)
      .from(TABLE)
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('rule_type_key', { ascending: true });

    if (error) {
      console.error('[admission/rule-type-registry] getRuleTypes failed:', error);
      throw new Error('Failed to fetch rule types');
    }
    return (data || []) as RuleTypeRegistryRow[];
  }

  /**
   * List ALL rows (active + inactive) for the admin management UI. Ordered by
   * sort_order so admins see the same shape as the dropdown plus deactivated rows.
   */
  static async listAll(): Promise<RuleTypeRegistryRow[]> {
    const { data, error } = await (this.supabase as any)
      .from(TABLE)
      .select('*')
      .order('sort_order', { ascending: true })
      .order('rule_type_key', { ascending: true });

    if (error) {
      console.error('[admission/rule-type-registry] listAll failed:', error);
      throw new Error('Failed to fetch rule type registry');
    }
    return (data || []) as RuleTypeRegistryRow[];
  }

  /** Get one row by id. Returns null if missing. */
  static async getById(id: string): Promise<RuleTypeRegistryRow | null> {
    const { data, error } = await (this.supabase as any)
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[admission/rule-type-registry] getById failed:', error);
      return null;
    }
    return (data as RuleTypeRegistryRow) || null;
  }

  /**
   * Create a new rule type. Super_admin only (enforced by RLS).
   * `is_system` is intentionally not exposed — only the seed migration
   * creates system rows.
   */
  static async createRuleType(
    input: CreateRuleTypeInput
  ): Promise<RuleTypeRegistryRow> {
    const key = input.rule_type_key.trim().toLowerCase();
    if (!/^[a-z0-9_]{2,64}$/.test(key)) {
      throw new Error(
        'rule_type_key must be 2-64 chars: lowercase letters, digits, or underscore'
      );
    }

    const { data, error } = await (this.supabase as any)
      .from(TABLE)
      .insert({
        rule_type_key: key,
        display_label: input.display_label.trim(),
        description: input.description?.trim() || null,
        icon_name: input.icon_name?.trim() || null,
        sort_order: input.sort_order ?? 100,
        is_active: input.is_active ?? true,
        is_system: false,
      })
      .select()
      .single();

    if (error) {
      console.error('[admission/rule-type-registry] createRuleType failed:', error);
      throw new Error(error.message || 'Failed to create rule type');
    }
    return data as RuleTypeRegistryRow;
  }

  /**
   * Update mutable fields on an existing row.
   * Note: rule_type_key is intentionally immutable post-create (existing
   * assignment_rules reference these keys via enrichRule()). Use deactivate
   * + create-new if you need to retire a key.
   */
  static async updateRuleType(
    id: string,
    input: UpdateRuleTypeInput
  ): Promise<RuleTypeRegistryRow> {
    const patch: Record<string, unknown> = {};
    if (input.display_label !== undefined) patch.display_label = input.display_label.trim();
    if (input.description !== undefined) patch.description = input.description?.trim() || null;
    if (input.icon_name !== undefined) patch.icon_name = input.icon_name?.trim() || null;
    if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
    if (input.is_active !== undefined) patch.is_active = input.is_active;

    const { data, error } = await (this.supabase as any)
      .from(TABLE)
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/rule-type-registry] updateRuleType failed:', error);
      throw new Error(error.message || 'Failed to update rule type');
    }
    return data as RuleTypeRegistryRow;
  }

  /**
   * Soft-delete via is_active=false. We never hard-delete — existing
   * assignment_rules may still reference the key.
   */
  static async deactivateRuleType(id: string): Promise<RuleTypeRegistryRow> {
    return this.updateRuleType(id, { is_active: false });
  }

  /** Re-activate a previously-deactivated row. */
  static async activateRuleType(id: string): Promise<RuleTypeRegistryRow> {
    return this.updateRuleType(id, { is_active: true });
  }
}
