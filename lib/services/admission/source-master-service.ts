// lib/services/admission/source-master-service.ts
//
// CRUD service for admission_lead_sources_master — the canonical catalog
// of lead sources surfaced in the admission settings UI.
//
// System rows (is_system=true) are seed-managed: their key + enum_value
// are immutable; only label, description, display_order, is_active are editable.
// Custom rows (is_system=false) are fully editable.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
export type LeadSourceEnum =
  | 'website'
  | 'walk_in'
  | 'referral'
  | 'social_media'
  | 'newspaper'
  | 'education_fair'
  | 'agent'
  | 'publisher'
  | 'google_ads'
  | 'facebook_ads'
  | 'other'
  | 'inbound_call'
  | 'gate_entry'
  | 'whatsapp';

export interface SourceMaster {
  id: string;
  key: string;
  enum_value: LeadSourceEnum;
  label: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  is_system: boolean;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  // Aggregations (joined client-side)
  counselor_count?: number;
  lead_count?: number;
}

export interface SourceMasterListFilters {
  search?: string;
  institution_id?: string | null;
  is_active?: boolean;
  is_system?: boolean;
  enum_value?: LeadSourceEnum;
  sortBy?: keyof SourceMaster;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateSourceMasterInput {
  key: string;
  enum_value: LeadSourceEnum;
  label: string;
  description?: string | null;
  display_order?: number;
  is_active?: boolean;
  institution_id?: string | null;
}

export interface UpdateSourceMasterInput {
  label?: string;
  description?: string | null;
  display_order?: number;
  is_active?: boolean;
  // For non-system rows we also allow these:
  key?: string;
  enum_value?: LeadSourceEnum;
}

// ----------------------------------------------------------------------------
// Service
// ----------------------------------------------------------------------------
export class SourceMasterService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * List sources with optional filters and aggregated counselor/lead counts.
   * Aggregations are computed client-side from two parallel queries to keep
   * the UI service simple and avoid SQL view churn for early iterations.
   */
  static async list(filters: SourceMasterListFilters = {}): Promise<SourceMaster[]> {
    const supabase = this.supabase;

    let q = (supabase as any)
      .from('admission_lead_sources_master')
      .select('*');

    if (filters.search) {
      q = q.or(`label.ilike.%${filters.search}%,key.ilike.%${filters.search}%`);
    }
    if (filters.institution_id !== undefined) {
      if (filters.institution_id === null) q = q.is('institution_id', null);
      else q = q.eq('institution_id', filters.institution_id);
    }
    if (filters.is_active !== undefined) q = q.eq('is_active', filters.is_active);
    if (filters.is_system !== undefined) q = q.eq('is_system', filters.is_system);
    if (filters.enum_value) q = q.eq('enum_value', filters.enum_value);

    const sortKey = filters.sortBy ?? 'display_order';
    q = q.order(sortKey as string, { ascending: filters.sortOrder !== 'desc' });

    const { data: rows, error } = await q;
    if (error) {
      logger.error('admissions', 'Error listing source masters', error);
      throw error;
    }

    const sources = (rows ?? []) as SourceMaster[];
    if (sources.length === 0) return [];

    // Parallel aggregations: counselor counts + lead counts per enum_value
    const [counselorCounts, leadCounts] = await Promise.all([
      this.getCounselorCountsBySource(sources.map((s) => s.id)),
      this.getLeadCountsByEnumValue(sources.map((s) => s.enum_value)),
    ]);

    return sources.map((s) => ({
      ...s,
      counselor_count: counselorCounts.get(s.id) ?? 0,
      lead_count: leadCounts.get(s.enum_value) ?? 0,
    }));
  }

  static async getById(id: string): Promise<SourceMaster | null> {
    const { data, error } = await (this.supabase as any)
      .from('admission_lead_sources_master')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      logger.error('admissions', 'Error fetching source master', error);
      throw error;
    }
    return data as SourceMaster | null;
  }

  static async create(input: CreateSourceMasterInput): Promise<SourceMaster> {
    const payload = {
      key: input.key.trim().toLowerCase(),
      enum_value: input.enum_value,
      label: input.label.trim(),
      description: input.description ?? null,
      display_order: input.display_order ?? 100,
      is_active: input.is_active ?? true,
      is_system: false,
      institution_id: input.institution_id ?? null,
    };

    const { data, error } = await (this.supabase as any)
      .from('admission_lead_sources_master')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      logger.error('admissions', 'Error creating source master', error);
      if (error.code === '23505') {
        throw new Error('A source with this key already exists for this scope.');
      }
      throw error;
    }
    return data as SourceMaster;
  }

  static async update(
    id: string,
    input: UpdateSourceMasterInput
  ): Promise<SourceMaster> {
    // Guard: system rows cannot have key or enum_value mutated
    const existing = await this.getById(id);
    if (!existing) throw new Error('Source not found.');

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.label !== undefined) patch.label = input.label.trim();
    if (input.description !== undefined) patch.description = input.description;
    if (input.display_order !== undefined) patch.display_order = input.display_order;
    if (input.is_active !== undefined) patch.is_active = input.is_active;

    if (!existing.is_system) {
      if (input.key !== undefined) patch.key = input.key.trim().toLowerCase();
      if (input.enum_value !== undefined) patch.enum_value = input.enum_value;
    } else if (input.key !== undefined || input.enum_value !== undefined) {
      throw new Error('System sources cannot have their key or enum_value changed.');
    }

    const { data, error } = await (this.supabase as any)
      .from('admission_lead_sources_master')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      logger.error('admissions', 'Error updating source master', error);
      if (error.code === '23505') {
        throw new Error('A source with this key already exists for this scope.');
      }
      throw error;
    }
    return data as SourceMaster;
  }

  /** Soft-delete by toggling is_active=false. Always preferred over hard-delete. */
  static async softDelete(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('admission_lead_sources_master')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      logger.error('admissions', 'Error deactivating source master', error);
      throw error;
    }
  }

  /**
   * Hard-delete only allowed on non-system rows. Will fail if leads or
   * captures point at this row. Use softDelete in the default UI path.
   */
  static async hardDelete(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) return;
    if (existing.is_system) {
      throw new Error('System sources cannot be hard-deleted. Deactivate instead.');
    }
    const { error } = await this.supabase
      .from('admission_lead_sources_master')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error('admissions', 'Error hard-deleting source master', error);
      throw error;
    }
  }

  static async setActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('admission_lead_sources_master')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      logger.error('admissions', 'Error toggling source active flag', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Aggregations
  // --------------------------------------------------------------------------
  private static async getCounselorCountsBySource(
    sourceIds: string[]
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (sourceIds.length === 0) return out;
    const { data, error } = await (this.supabase as any)
      .from('admission_counselor_sources')
      .select('source_id')
      .in('source_id', sourceIds);
    if (error) {
      logger.error('admissions', 'Error counting counselors per source', error);
      return out;
    }
    for (const row of (data ?? []) as { source_id: string }[]) {
      out.set(row.source_id, (out.get(row.source_id) ?? 0) + 1);
    }
    return out;
  }

  /**
   * Server-side aggregate via SQL function (avoids the PostgREST 1000-row cap
   * that the previous client-side fetch+count was hitting silently).
   * Returns counts ONLY for the requested enum values to keep the surface tidy.
   */
  private static async getLeadCountsByEnumValue(
    enumValues: LeadSourceEnum[]
  ): Promise<Map<LeadSourceEnum, number>> {
    const out = new Map<LeadSourceEnum, number>();
    if (enumValues.length === 0) return out;
    const wanted = new Set(enumValues);
    const { data, error } = await (this.supabase as any)
      .rpc('get_lead_counts_by_source', { p_institution_id: null });
    if (error) {
      logger.error('admissions', 'Error counting leads per source', error);
      return out;
    }
    for (const row of (data ?? []) as Array<{
      source: LeadSourceEnum;
      lead_count: number | string;
    }>) {
      if (!wanted.has(row.source)) continue;
      out.set(row.source, Number(row.lead_count) || 0);
    }
    return out;
  }
}
