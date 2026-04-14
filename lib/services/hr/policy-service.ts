/**
 * Generic Policy Service — list / get / create / update / supersede / history / diff / restore
 * for all 19 hr_* policy tables. Caller supplies the table name.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { POLICY_TABLES } from '@/features/hr/policies/registry';

const ALLOWED_TABLES = new Set(POLICY_TABLES.map((t) => t.table));

function assertTable(table: string) {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Policy table not allowed: ${table}`);
  }
}

export interface PolicyListFilters {
  hr_organization_id?: string;
  showSuperseded?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export class PolicyService {
  /** List CURRENT rows by default; pass showSuperseded=true to include history. */
  static async list(
    supabase: SupabaseClient,
    table: string,
    filters: PolicyListFilters = {}
  ) {
    assertTable(table);
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = supabase.from(table).select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
    if (filters.hr_organization_id) q = q.eq('hr_organization_id', filters.hr_organization_id);
    if (!filters.showSuperseded) q = q.is('valid_until', null);

    const { data, count, error } = await q;
    if (error) throw error;
    return {
      data: data ?? [],
      metadata: {
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
      },
    };
  }

  static async getById(supabase: SupabaseClient, table: string, id: string) {
    assertTable(table);
    const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Create a new policy row (becomes current; doesn't supersede anything). */
  static async create(supabase: SupabaseClient, table: string, payload: Record<string, unknown>) {
    assertTable(table);
    const { data, error } = await supabase.from(table).insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  /**
   * Supersede: marks the existing row valid_until=NOW(), inserts a new row with the merged payload.
   * Used when HR officer "edits" a policy — produces an audit trail instead of mutating in place.
   */
  static async supersede(
    supabase: SupabaseClient,
    table: string,
    existingId: string,
    nextPayload: Record<string, unknown>,
    userId: string
  ) {
    assertTable(table);
    const existing = await this.getById(supabase, table, existingId);
    if (!existing) throw new Error('Policy row not found');

    const now = new Date().toISOString();
    // Mark old as superseded
    const { error: supError } = await supabase
      .from(table)
      .update({ valid_until: now, updated_by: userId, updated_at: now })
      .eq('id', existingId);
    if (supError) throw supError;

    // Build new payload from existing + caller's overrides
    const newRow: Record<string, unknown> = {
      ...(existing as Record<string, unknown>),
      ...nextPayload,
      valid_from: now,
      valid_until: null,
      superseded_by: null,
      created_by: userId,
      updated_by: userId,
    };
    delete newRow.id;
    delete newRow.created_at;
    delete newRow.updated_at;

    const { data: inserted, error } = await supabase.from(table).insert(newRow).select().single();
    if (error) throw error;

    // Link old → new via superseded_by
    await supabase.from(table).update({ superseded_by: (inserted as Record<string, unknown>).id }).eq('id', existingId);

    return inserted;
  }

  /** Mark a row inactive (no new version, just is_active=false on current row). */
  static async deactivate(supabase: SupabaseClient, table: string, id: string, userId: string) {
    assertTable(table);
    const { data, error } = await supabase
      .from(table)
      .update({ is_active: false, updated_by: userId, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Version history via SECURITY DEFINER RPC. */
  static async history(supabase: SupabaseClient, table: string, hrOrganizationId: string) {
    assertTable(table);
    const { data, error } = await supabase.rpc('hr_policy_history', {
      p_table_name: table,
      p_hr_organization_id: hrOrganizationId,
      p_filter_field: null,
      p_filter_value: null,
    });
    if (error) throw error;
    return data ?? [];
  }

  /** Field-level diff between two versions. */
  static async diff(supabase: SupabaseClient, table: string, oldId: string, newId: string) {
    assertTable(table);
    const { data, error } = await supabase.rpc('hr_policy_diff', {
      p_table_name: table,
      p_old_id: oldId,
      p_new_id: newId,
    });
    if (error) throw error;
    return data ?? [];
  }

  /** Restore: clones a previous version as the new current row. */
  static async restore(supabase: SupabaseClient, table: string, versionId: string, userId: string) {
    assertTable(table);
    // App-layer restore so we have control over the cloned payload
    const versionRow = await this.getById(supabase, table, versionId);
    if (!versionRow) throw new Error('Version not found');
    const v = versionRow as Record<string, unknown>;
    const cleanPayload: Record<string, unknown> = { ...v };
    for (const k of ['id', 'valid_from', 'valid_until', 'superseded_by', 'created_at', 'updated_at']) {
      delete cleanPayload[k];
    }
    cleanPayload.created_by = userId;
    cleanPayload.updated_by = userId;

    // Find current row(s) for this org and supersede
    const orgId = v.hr_organization_id as string;
    const { data: currentRows } = await supabase.from(table).select('id').eq('hr_organization_id', orgId).is('valid_until', null);

    const now = new Date().toISOString();
    if (currentRows && currentRows.length > 0) {
      await supabase.from(table)
        .update({ valid_until: now, updated_by: userId, updated_at: now })
        .in('id', currentRows.map((r) => (r as { id: string }).id));
    }

    cleanPayload.valid_from = now;
    cleanPayload.valid_until = null;

    const { data: restored, error } = await supabase.from(table).insert(cleanPayload).select().single();
    if (error) throw error;
    return restored;
  }
}
