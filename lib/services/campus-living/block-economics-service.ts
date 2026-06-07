import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// ─────────────────────────────────────────────────────────────────────────
// Block Economics cost/capex config CRUD service.
//
// Precedent: lib/services/campus-living/hostel-category-service.ts
//   (static class · createClientSupabaseClient singleton · enhanced-logger).
//
// Backs the typed config table `hostel_block_economics_entries` created in
// Bed Economics PR A (supabase/migrations/20260607120000_bed_economics_substrate.sql).
// The dashboard's Cost & Return surfaces (C1–C6) read these rows via the
// fn_bed_econ_cost_grid / fn_bed_econ_block_grid / fn_bed_econ_consolidation RPCs;
// THIS service is the super-admin write surface (/campus-living/settings/block-economics).
//
// History-preserving: rows are SOFT-DISABLED (is_active=false), never hard-deleted —
// the audit trigger (hostel_block_economics_entries_audit) keeps a before/after
// snapshot of every UPDATE, so change history must remain intact. change_reason is
// required on every edit (the trigger records it).
//
// Row-row types are colocated here (not in types/bed-economics.ts) because that
// file is PR A's RPC-result contract; this is the table-row entity for the CRUD UI.
// ─────────────────────────────────────────────────────────────────────────

export type CostKind = 'opex' | 'capex';

export type CostCategory =
  | 'staff'
  | 'utilities'
  | 'housekeeping'
  | 'maintenance'
  | 'mess_subsidy'
  | 'other'
  | 'capex_building'
  | 'capex_renovation';

/** A single hostel_block_economics_entries row, with resolved relations. */
export interface BlockEconomicsEntry {
  // Config-table-pattern mixin
  id: string;
  config_key: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  change_reason: string | null;
  // Typed columns
  block_id: string;
  hostel_year_id: string | null;
  cost_kind: CostKind;
  cost_category: CostCategory;
  annual_amount: number;
  notes: string | null;
  // Resolved relations (PostgREST embeds)
  block?: { id: string; name: string; code: string } | null;
  year?: { id: string; name: string } | null;
  updater?: { id: string; full_name: string | null } | null;
}

export interface BlockEconomicsFilters {
  block_id?: string;
  /** Use the sentinel ONE_TIME_YEAR to match capex rows with no year (NULL). */
  hostel_year_id?: string | null;
  cost_kind?: CostKind;
  /** Defaults to true (active rows only) when omitted. */
  include_inactive?: boolean;
}

export interface CreateBlockEconomicsDto {
  config_key: string;
  display_name: string;
  description?: string | null;
  block_id: string;
  hostel_year_id: string | null;
  cost_kind: CostKind;
  cost_category: CostCategory;
  annual_amount: number;
  notes?: string | null;
}

export interface UpdateBlockEconomicsDto {
  display_name?: string;
  description?: string | null;
  block_id?: string;
  hostel_year_id?: string | null;
  cost_kind?: CostKind;
  cost_category?: CostCategory;
  annual_amount?: number;
  notes?: string | null;
  is_active?: boolean;
  /** REQUIRED on edit — the audit trigger persists this on the audit row. */
  change_reason: string;
}

const SELECT =
  '*, block:hostel_blocks!block_id(id, name, code), ' +
  'year:hostel_years!hostel_year_id(id, name), ' +
  'updater:profiles!updated_by(id, full_name)';

export class BlockEconomicsService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  // hostel_block_economics_entries was added in Bed Economics PR A and is not yet
  // in the generated Supabase types, so the typed query builder cannot resolve
  // the table (TS2769) and blows up on the multi-embed select (TS2589). Route
  // table queries through a loosely-typed handle — same escape PR A uses for the
  // new fn_bed_econ_* RPCs (`'fn_…' as never`) and hostel-block-service.ts uses
  // for inserts (`payload as any`). Regenerate types post-merge to drop this.
  private static table() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.supabase as any).from('hostel_block_economics_entries');
  }

  static async getEntries(
    filters: BlockEconomicsFilters = {}
  ): Promise<BlockEconomicsEntry[]> {
    let query = this.table()
      .select(SELECT)
      .order('cost_kind', { ascending: true })
      .order('cost_category', { ascending: true })
      .order('created_at', { ascending: false });

    if (!filters.include_inactive) {
      query = query.eq('is_active', true);
    }
    if (filters.block_id) {
      query = query.eq('block_id', filters.block_id);
    }
    if (filters.cost_kind) {
      query = query.eq('cost_kind', filters.cost_kind);
    }
    if (filters.hostel_year_id === null) {
      query = query.is('hostel_year_id', null);
    } else if (filters.hostel_year_id) {
      query = query.eq('hostel_year_id', filters.hostel_year_id);
    }

    const { data, error } = await query;
    if (error) {
      logger.error(
        'campus-living/block-economics',
        'Database error listing entries',
        error
      );
      throw new Error(error.message || 'Failed to fetch block economics entries');
    }
    return (data ?? []) as unknown as BlockEconomicsEntry[];
  }

  static async createEntry(
    dto: CreateBlockEconomicsDto
  ): Promise<BlockEconomicsEntry> {
    const { data: auth } = await this.supabase.auth.getUser();
    const payload = {
      ...dto,
      description: dto.description?.trim() || null,
      notes: dto.notes?.trim() || null,
      is_active: true,
      updated_by: auth.user?.id ?? null,
    };

    const { data, error } = await this.table()
      .insert([payload])
      .select(SELECT)
      .single();
    if (error) {
      logger.error(
        'campus-living/block-economics',
        'Database error creating entry',
        error
      );
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.message || 'Failed to create block economics entry'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }
    return data as unknown as BlockEconomicsEntry;
  }

  static async updateEntry(
    id: string,
    dto: UpdateBlockEconomicsDto
  ): Promise<BlockEconomicsEntry> {
    const { data: auth } = await this.supabase.auth.getUser();
    const { change_reason, description, notes, ...rest } = dto;

    const payload: Record<string, unknown> = {
      ...rest,
      change_reason,
      updated_by: auth.user?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    if (description !== undefined) payload.description = description?.trim() || null;
    if (notes !== undefined) payload.notes = notes?.trim() || null;

    const { data, error } = await this.table()
      .update(payload)
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) {
      logger.error(
        'campus-living/block-economics',
        'Database error updating entry',
        error
      );
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.message || 'Failed to update block economics entry'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }
    return data as unknown as BlockEconomicsEntry;
  }

  /**
   * Soft-disable — the table keeps history (audit trail), so we NEVER hard-delete.
   * change_reason is required so the disable is recorded by the audit trigger.
   */
  static async disableEntry(id: string, changeReason: string): Promise<void> {
    await this.updateEntry(id, { is_active: false, change_reason: changeReason });
  }

  static async enableEntry(id: string, changeReason: string): Promise<void> {
    await this.updateEntry(id, { is_active: true, change_reason: changeReason });
  }
}
