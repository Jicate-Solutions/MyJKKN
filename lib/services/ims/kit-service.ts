// lib/services/ims/kit-service.ts
// Store Kit Entitlements — client service over the PR-K1 engine
// (supabase/migrations/20260712190000_store_kit_entitlements.sql).
// Spec: specs/store-kit-entitlements-spec-2026-07-12.md (24 decisions).
// Writes to entitlements/collections go ONLY through the SECURITY DEFINER
// RPCs; rules/rule-items/members/windows are direct table CRUD gated by
// RLS (ims.kits.manage — central store team, decision 22).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MOD = 'ims/kits';

// PostgREST `.or()` filter-injection guard (#2000 review HIGH, same class as
// #1977): a raw term with , . ( ) re-parses as extra filter nodes. We double-
// quote each ilike pattern so those chars stay literal, and strip the only two
// chars that could break out of the quotes. Verified against prod PostgREST.
function orIlike(cols: string[], term: string): string {
  const safe = term.replace(/["\\]/g, '');
  return cols.map((c) => `${c}.ilike."%${safe}%"`).join(',');
}

export interface KitRule {
  id: string;
  rule_name: string;
  audience: 'learner' | 'staff';
  rule_kind: 'criteria' | 'handpicked';
  institution_id: string | null;
  program_id: string | null;
  year_level: number | null;
  department_id: string | null;
  hostel_status: 'any' | 'hosteler' | 'day_scholar';
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface KitRuleItem {
  id: string;
  rule_id: string;
  item_id: string;
  quantity: number;
  cadence: 'yearly' | 'once';
  item?: { name: string; code: string | null } | null;
}

export interface KitRuleMember {
  id: string;
  rule_id: string;
  learner_id: string | null;
  staff_id: string | null;
}

export interface KitWindow {
  id: string;
  label: string;
  rule_id: string | null;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

export interface KitEntitlement {
  id: string;
  learner_id: string | null;
  staff_id: string | null;
  institution_id: string;
  item_id: string;
  anchor_year_level: number | null;
  qty_entitled: number;
  qty_collected: number;
  status: 'open' | 'expired' | 'reopened' | 'closed';
  unit_cost_snapshot: number;
  item?: { name: string; code: string | null } | null;
}

export interface KitCollection {
  id: string;
  entitlement_id: string;
  qty: number;
  kind: 'normal' | 'free_replacement' | 'defect_swap';
  proof_type: 'qr' | 'staff_verified';
  collector_name: string;
  collector_register_no: string | null;
  collected_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

export interface KitPerson {
  kind: 'learner' | 'staff';
  id: string;
  name: string;
  register_number: string | null;
  institution_id: string | null;
}

export class ImsKitService {
  private static supabase = createClientSupabaseClient();

  // ── Rules CRUD (RLS: ims.kits.manage) ────────────────────────────────
  static async getRules(): Promise<KitRule[]> {
    const { data, error } = await this.supabase
      .from('ims_kit_rules')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as KitRule[];
  }

  static async createRule(dto: Partial<KitRule> & { rule_name: string; audience: string }) {
    const { data, error } = await this.supabase
      .from('ims_kit_rules')
      .insert(dto)
      .select()
      .single();
    if (error) throw error;
    return data as KitRule;
  }

  static async updateRule(id: string, dto: Partial<KitRule>) {
    const { data, error } = await this.supabase
      .from('ims_kit_rules')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as KitRule;
  }

  // ── Rule items ───────────────────────────────────────────────────────
  static async getRuleItems(ruleId: string): Promise<KitRuleItem[]> {
    const { data, error } = await this.supabase
      .from('ims_kit_rule_items')
      .select('*, item:ims_items(name, code)')
      .eq('rule_id', ruleId)
      .order('created_at');
    if (error) throw error;
    return (data ?? []) as KitRuleItem[];
  }

  static async addRuleItem(dto: { rule_id: string; item_id: string; quantity: number; cadence: string }) {
    const { error } = await this.supabase.from('ims_kit_rule_items').insert(dto);
    if (error) throw error;
  }

  static async removeRuleItem(id: string) {
    const { error } = await this.supabase.from('ims_kit_rule_items').delete().eq('id', id);
    if (error) throw error;
  }

  // ── Hand-picked members ──────────────────────────────────────────────
  static async getRuleMembers(ruleId: string): Promise<KitRuleMember[]> {
    const { data, error } = await this.supabase
      .from('ims_kit_rule_members')
      .select('*')
      .eq('rule_id', ruleId);
    if (error) throw error;
    return (data ?? []) as KitRuleMember[];
  }

  static async addRuleMember(dto: { rule_id: string; learner_id?: string; staff_id?: string }) {
    const { error } = await this.supabase.from('ims_kit_rule_members').insert(dto);
    if (error) throw error;
  }

  static async removeRuleMember(id: string) {
    const { error } = await this.supabase.from('ims_kit_rule_members').delete().eq('id', id);
    if (error) throw error;
  }

  // ── Collection windows (D20) ─────────────────────────────────────────
  static async getWindows(): Promise<KitWindow[]> {
    const { data, error } = await this.supabase
      .from('ims_kit_collection_windows')
      .select('*')
      .order('starts_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as KitWindow[];
  }

  static async createWindow(dto: { label: string; rule_id?: string | null; starts_at: string; ends_at: string }) {
    const { error } = await this.supabase.from('ims_kit_collection_windows').insert(dto);
    if (error) throw error;
  }

  static async toggleWindow(id: string, is_active: boolean) {
    const { error } = await this.supabase
      .from('ims_kit_collection_windows')
      .update({ is_active })
      .eq('id', id);
    if (error) throw error;
  }

  // ── Engine RPCs ──────────────────────────────────────────────────────
  static async resolveRule(ruleId: string, applyToExisting: boolean) {
    const { data, error } = await this.supabase.rpc('fn_kit_resolve_entitlements', {
      p_rule_id: ruleId,
      p_apply_to_existing: applyToExisting,
    });
    if (error) {
      logger.error(MOD, 'resolve failed', error);
      throw error;
    }
    return data as { inserted: number; existing_touched: number; reopened: number };
  }

  static async recordCollection(dto: {
    entitlement_id: string;
    qty: number;
    collector_name: string;
    proof_type: 'qr' | 'staff_verified';
    store_id: string;
    collector_register_no?: string;
    // free_replacement removed (D41 — lost/damaged is always a paid sale);
    // the RPC rejects it. 'normal' or 'defect_swap' (store-fault, D18) only.
    kind?: 'normal' | 'defect_swap';
    late_approved?: boolean;
    returned_defective?: boolean;
    notes?: string;
  }) {
    const { data, error } = await this.supabase.rpc('fn_kit_record_collection', {
      p_entitlement_id: dto.entitlement_id,
      p_qty: dto.qty,
      p_collector_name: dto.collector_name,
      p_proof_type: dto.proof_type,
      p_store_id: dto.store_id,
      p_collector_register_no: dto.collector_register_no ?? null,
      p_kind: dto.kind ?? 'normal',
      p_late_approved: dto.late_approved ?? false,
      p_returned_defective: dto.returned_defective ?? false,
      p_notes: dto.notes ?? null,
    });
    if (error) {
      logger.error(MOD, 'collection failed', error);
      throw error;
    }
    return data as { collection_id: string; remaining: number };
  }

  // D30: the void UI must state whether the physical item came back. When it
  // did not, stock is NOT restored — the void is booked as a loss.
  static async voidCollection(collectionId: string, reason: string, itemReturned: boolean) {
    const { data, error } = await this.supabase.rpc('fn_kit_void_collection', {
      p_collection_id: collectionId,
      p_reason: reason,
      p_item_returned: itemReturned,
    });
    if (error) {
      logger.error(MOD, 'void failed', error);
      throw error;
    }
    return data;
  }

  // D33: fat-finger undo — pull back a rule's not-yet-collected entitlements.
  static async revokeRuleEntitlements(ruleId: string) {
    const { data, error } = await this.supabase.rpc('fn_kit_revoke_rule_entitlements', {
      p_rule_id: ruleId,
    });
    if (error) {
      logger.error(MOD, 'revoke failed', error);
      throw error;
    }
    return data as { rule_id: string; revoked: number };
  }

  static async myKit() {
    const { data, error } = await this.supabase.rpc('fn_kit_my_kit');
    if (error) throw error;
    return (data ?? []) as Array<{
      entitlement_id: string;
      item_name: string;
      item_code: string | null;
      qty_entitled: number;
      qty_collected: number;
      owed: number;
      status: string;
      anchor_year_level: number | null;
      collections: Array<{
        qty: number; kind: string; collected_at: string;
        collector_name: string; proof_type: string; voided: boolean;
      }>;
    }>;
  }

  static async billingFlags(institutionId?: string, learnerId?: string) {
    const { data, error } = await this.supabase.rpc('fn_kit_billing_flags', {
      p_institution_id: institutionId ?? null,
      p_learner_id: learnerId ?? null,
    });
    if (error) throw error;
    return (data ?? []) as Array<{
      entitlement_id: string; learner_id: string | null; staff_id: string | null;
      institution_id: string; item_name: string; status: string;
      uncollected_value: number; collected_value: number; flagged_at: string | null;
    }>;
  }

  // ── Counter lookups ──────────────────────────────────────────────────
  static async searchPeople(term: string, audience: 'learner' | 'staff'): Promise<KitPerson[]> {
    const q = term.trim();
    if (q.length < 2) return [];
    if (audience === 'learner') {
      const { data, error } = await this.supabase
        .from('learners_profiles')
        .select('id, first_name, last_name, register_number, institution_id')
        .or(orIlike(['register_number', 'first_name', 'last_name'], q))
        .limit(15);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        kind: 'learner' as const,
        id: r.id,
        name: [r.first_name, r.last_name].filter(Boolean).join(' '),
        register_number: r.register_number,
        institution_id: r.institution_id,
      }));
    }
    const { data, error } = await this.supabase
      .from('staff')
      .select('id, first_name, last_name, institution_id')
      .or(orIlike(['first_name', 'last_name'], q))
      .eq('is_active', true)
      .limit(15);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      kind: 'staff' as const,
      id: r.id,
      name: [r.first_name, r.last_name].filter(Boolean).join(' '),
      register_number: null,
      institution_id: r.institution_id,
    }));
  }

  static async entitlementsForPerson(person: KitPerson): Promise<KitEntitlement[]> {
    const col = person.kind === 'learner' ? 'learner_id' : 'staff_id';
    const { data, error } = await this.supabase
      .from('ims_kit_entitlements')
      .select('*, item:ims_items(name, code)')
      .eq(col, person.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as KitEntitlement[];
  }

  static async collectionsForEntitlement(entitlementId: string): Promise<KitCollection[]> {
    const { data, error } = await this.supabase
      .from('ims_kit_collections')
      .select('*')
      .eq('entitlement_id', entitlementId)
      .order('collected_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as KitCollection[];
  }

  // ── Small selects for forms ──────────────────────────────────────────
  static async searchItems(term: string) {
    const q = term.trim();
    if (q.length < 2) return [];
    const { data, error } = await this.supabase
      .from('ims_items')
      .select('id, name, code')
      .eq('is_active', true)
      .or(orIlike(['name', 'code'], q))
      .limit(15);
    if (error) throw error;
    return data ?? [];
  }

  static async getStores() {
    const { data, error } = await this.supabase
      .from('ims_stores')
      .select('id, name, is_central_supply_store')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data ?? [];
  }

  static async getInstitutions() {
    const { data, error } = await this.supabase
      .from('institutions')
      .select('id, name')
      .order('name');
    if (error) throw error;
    return data ?? [];
  }

  // limit raised well past any real per-institution program/department count so
  // the targeting selects don't silently drop options (#2000 review LOW-7).
  static async getPrograms(institutionId?: string) {
    let q = this.supabase.from('programs').select('id, program_name, institution_id').order('program_name');
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data, error } = await q.limit(2000);
    if (error) throw error;
    return data ?? [];
  }

  static async getDepartments(institutionId?: string) {
    let q = this.supabase.from('departments').select('id, department_name, institution_id').order('department_name');
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data, error } = await q.limit(2000);
    if (error) throw error;
    return data ?? [];
  }
}
