// lib/services/procurement/po-format-service.ts
//
// CRUD for configurable PO document formats (procurement_po_formats).
// Same static-class-over-Supabase-client pattern as ProcurementPurchaseOrderService.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { ProcurementPoFormat, CreatePoFormatDto, UpdatePoFormatDto } from '@/types/procurement';

export class ProcurementPoFormatService {
  private static get supabase() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  static async getFormats(
    institutionId: string,
    opts: { activeOnly?: boolean } = {}
  ): Promise<ProcurementPoFormat[]> {
    try {
      let query = this.supabase
        .from('procurement_po_formats')
        .select('*')
        .eq('institution_id', institutionId)
        .order('name', { ascending: true });

      if (opts.activeOnly) query = query.eq('is_active', true);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ProcurementPoFormat[];
    } catch (error) {
      console.error('[ProcurementPoFormatService] getFormats:', error);
      throw error;
    }
  }

  static async getFormat(id: string): Promise<ProcurementPoFormat> {
    try {
      const { data, error } = await this.supabase
        .from('procurement_po_formats')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as ProcurementPoFormat;
    } catch (error) {
      console.error('[ProcurementPoFormatService] getFormat:', error);
      throw error;
    }
  }

  static async createFormat(data: CreatePoFormatDto): Promise<ProcurementPoFormat> {
    try {
      const { data: created, error } = await this.supabase
        .from('procurement_po_formats')
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return created as ProcurementPoFormat;
    } catch (error) {
      console.error('[ProcurementPoFormatService] createFormat:', error);
      throw error;
    }
  }

  static async updateFormat(id: string, data: UpdatePoFormatDto): Promise<ProcurementPoFormat> {
    try {
      const { data: updated, error } = await this.supabase
        .from('procurement_po_formats')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return updated as ProcurementPoFormat;
    } catch (error) {
      console.error('[ProcurementPoFormatService] updateFormat:', error);
      throw error;
    }
  }

  /** Soft delete — existing POs may still reference this format for rendering. */
  static async deleteFormat(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('procurement_po_formats')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('[ProcurementPoFormatService] deleteFormat:', error);
      throw error;
    }
  }

  /** Unsets the institution's current default, then sets the target format as default. */
  static async setDefault(institutionId: string, formatId: string): Promise<void> {
    try {
      const { error: unsetErr } = await this.supabase
        .from('procurement_po_formats')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('institution_id', institutionId)
        .eq('is_default', true);
      if (unsetErr) throw unsetErr;

      const { error: setErr } = await this.supabase
        .from('procurement_po_formats')
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq('id', formatId);
      if (setErr) throw setErr;
    } catch (error) {
      console.error('[ProcurementPoFormatService] setDefault:', error);
      throw error;
    }
  }
}
