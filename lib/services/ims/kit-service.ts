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

// supabase-js returns `error` as a plain object (PostgrestError is only
// constructed on the throwOnError path), so `e instanceof Error` was false in
// the page's catch and the user only ever saw "Add failed" (BUG-005858).
// Rethrow as a real Error carrying the server's message.
function toError(error: { message?: string } | null | undefined, fallback: string): Error {
  return new Error(error?.message || fallback);
}

export type KitSource = 'central' | 'college';

const KIT_SOURCE_LABEL: Record<KitSource, string> = {
  central: 'Central store',
  college: 'College store',
};

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

  // D32 (20260712220000_store_kit_hardening.sql): an item may only enter a
  // kit rule once it is classified central/college — an attribute of the ITEM
  // ("set at item setup"). Nothing in the app ever set it, so every add failed.
  // When the store manager picks the source for an unclassified item here, we
  // classify the item first (ims_items RLS: store admin / ims.inventory.edit),
  // then add it to the rule. A 0-row update means RLS refused — say so plainly
  // instead of letting the D32 trigger fire with a confusing message.
  static async addRuleItem(dto: {
    rule_id: string;
    item_id: string;
    quantity: number;
    cadence: string;
    kit_source?: KitSource;
  }) {
    const { kit_source, ...row } = dto;
    if (kit_source) {
      // Classification is an item-wide write and the ims_items UPDATE policy
      // lets a store_admin touch ANY college's item, so we scope it to the
      // rule's own institution here (#4336 re-panel). A rule spanning all
      // colleges has no institution to scope to: it may only take items that
      // are already Central store (exactly what fn_kit_guard_rule_item / D40
      // accepts for such a rule), so it never classifies.
      const { data: rule, error: ruleError } = await this.supabase
        .from('ims_kit_rules')
        .select('institution_id')
        .eq('id', row.rule_id)
        .maybeSingle();
      if (ruleError) throw toError(ruleError, 'Could not read the kit rule');
      if (!rule) throw new Error('Kit rule not found');
      const ruleInstitution = (rule as { institution_id: string | null }).institution_id;
      if (!ruleInstitution) {
        throw new Error(
          'This rule spans all colleges, so it can only take items already set to Central store. ' +
            "Set the item's kit source from a rule for its own college first.",
        );
      }
      // Guard on NULL: a stale search result must never overwrite another
      // admin's classification item-wide (#4336 review M1).
      // No revert if the rule-item insert below fails (#4336 round 3): the
      // hardening migration (20260712220000) defines kit_source as a property
      // of the ITEM, "Set at item setup". The admin chose it explicitly, so an
      // item left classified after a failed add is valid item setup, not a
      // leak — and a client-side revert could never be race-free (a peer's
      // rule item can commit between requests, or be hidden by RLS).
      const { data, error } = await this.supabase
        .from('ims_items')
        .update({ kit_source })
        .eq('id', row.item_id)
        .eq('institution_id', ruleInstitution)
        .is('kit_source', null)
        .select('id');
      if (error) throw toError(error, 'Could not set the item\'s kit source');
      if (!data || data.length === 0) {
        // 0 rows: either someone classified it meanwhile, or RLS refused.
        const { data: current, error: readError } = await this.supabase
          .from('ims_items')
          .select('kit_source, institution_id')
          .eq('id', row.item_id)
          .maybeSingle();
        if (readError) throw toError(readError, 'Could not read the item\'s kit source');
        const cur = current as { kit_source: KitSource | null; institution_id: string | null } | null;
        const now = cur?.kit_source ?? null;
        if (now && now !== kit_source) {
          throw new Error(`This item is already classified as ${KIT_SOURCE_LABEL[now] ?? now}`);
        }
        if (!now && cur && cur.institution_id !== ruleInstitution) {
          throw new Error(
            "This item belongs to another college's store — only that college's rules can set its kit source.",
          );
        }
        if (!now) {
          throw new Error(
            "You can't classify items — ask a store admin to set the item's kit source.",
          );
        }
        // now === kit_source: someone set the same value meanwhile — carry on.
      }
    }
    const { error } = await this.supabase.from('ims_kit_rule_items').insert(row);
    if (error) throw toError(error, 'Add failed');
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
    if (error) throw toError(error, 'Add failed');
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
  // Kit rule panel: list only items that may legally join the rule (mirrors
  // fn_kit_guard_rule_item). A college rule sees its own college's items
  // (classified or not) plus Central store items from anywhere; a rule
  // spanning all colleges sees Central store items only (D40 rejects college
  // items there, D32 rejects unclassified ones).
  static async searchItems(term: string, scope?: { institutionId: string | null }) {
    const q = term.trim();
    if (q.length < 2) return [];
    let query = this.supabase
      .from('ims_items')
      .select('id, name, code, kit_source')
      .eq('is_active', true)
      .or(orIlike(['name', 'code'], q));
    if (scope) {
      query = scope.institutionId
        ? query.or(`institution_id.eq.${scope.institutionId},kit_source.eq.central`)
        : query.eq('kit_source', 'central');
    }
    const { data, error } = await query.limit(15);
    if (error) throw toError(error, 'Search failed');
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
