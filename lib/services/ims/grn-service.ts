// lib/services/ims/grn-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsGoodsReceivedNote,
  ImsGRNWithItems,
  ImsGRNFilters,
  CreateImsGRNDto,
} from '@/types/ims';

/** Shown wherever an IMS goods receipt would have been created, verified or approved. */
export const IMS_GRN_RETIRED_MESSAGE =
  'IMS goods receipts are retired. Record the delivery in Procurement → Deliveries (/procurement/grn). Older IMS receipts can still be viewed.';

export class ImsGRNService {
  private static get supabase() {
    // IMS tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * List GRNs with supplier join, search, filtering, and pagination.
   */
  static async getGRNs(filters: ImsGRNFilters = {}): Promise<{
    data: ImsGoodsReceivedNote[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('ims_goods_received_notes')
        .select(
          `*,
           supplier:ims_suppliers(id,name,code),
           received_by_profile:profiles!received_by(full_name),
           verified_by_profile:profiles!verified_by(full_name),
           approved_by_profile:profiles!approved_by(full_name)`,
          { count: 'exact' }
        );

      // Search on grn_number or invoice_number
      if (filters.search) {
        query = query.or(
          `grn_number.ilike.%${filters.search}%,invoice_number.ilike.%${filters.search}%`
        );
      }

      // Status filter
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      // Supplier filter
      if (filters.supplier_id) {
        query = query.eq('supplier_id', filters.supplier_id);
      }

      // Primary: store_id; Fallback: institution_id
      if (filters.store_id) {
        query = query.eq('store_id', filters.store_id);
      } else if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      // Date range
      if (filters.date_from) {
        query = query.gte('created_at', filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte('created_at', filters.date_to);
      }

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: (data || []) as ImsGoodsReceivedNote[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[ImsGRNService] Error in getGRNs:', error);
      throw error;
    }
  }

  /**
   * Get a single GRN with all items.
   */
  static async getGRN(id: string, institutionId?: string): Promise<ImsGRNWithItems> {
    try {
      let query = this.supabase
        .from('ims_goods_received_notes')
        .select(
          `*,
           supplier:ims_suppliers(id,name,code),
           received_by_profile:profiles!received_by(full_name),
           verified_by_profile:profiles!verified_by(full_name),
           approved_by_profile:profiles!approved_by(full_name)`
        )
        .eq('id', id);

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data: grn, error: grnError } = await query.single();

      if (grnError) throw grnError;

      // Fetch GRN items
      const { data: items, error: itemsError } = await this.supabase
        .from('ims_grn_items')
        .select(
          `*,
           item:ims_items(id,name,code,hsn_code,gst_rate),
           unit:ims_units(id,name,abbreviation)`
        )
        .eq('grn_id', id)
        // ims_grn_items has no created_at; ordering by it failed the whole
        // read and the page said "GRN not found" (BUG-005862).
        .order('id', { ascending: true });

      if (itemsError) throw itemsError;

      return {
        ...grn,
        items: items || [],
      } as ImsGRNWithItems;
    } catch (error) {
      console.error('[ImsGRNService] Error in getGRN:', error);
      throw error;
    }
  }

  // ── Retired (Director decision D1, 2026-10-10) ────────────────────────────────
  // Every goods receipt is now recorded as a procurement GRN (/procurement/grn), which
  // carries the invoice checks. IMS receipts can no longer be created, verified or
  // approved; the old ones stay readable (getGRNs / getGRN) and can still be cancelled.
  // The database refuses the same writes (trg_ims_grn_00_retired, migration
  // 20271010170000). The stock-posting code that approveGRN held lives on in the
  // procurement IMS adapter (domain-adapters/ims-adapter.ts postReceipt).

  /** Retired — record the delivery in Procurement → Deliveries instead. */
  static async createGRN(_data: CreateImsGRNDto, _userId: string): Promise<ImsGoodsReceivedNote> {
    throw new Error(IMS_GRN_RETIRED_MESSAGE);
  }

  /** Retired — IMS receipts can no longer be verified. */
  static async verifyGRN(_id: string, _userId: string, _notes?: string): Promise<ImsGoodsReceivedNote> {
    throw new Error(IMS_GRN_RETIRED_MESSAGE);
  }

  /** Retired — IMS receipts can no longer be approved (approval is what added stock). */
  static async approveGRN(_id: string, _userId: string, _notes?: string): Promise<ImsGoodsReceivedNote> {
    throw new Error(IMS_GRN_RETIRED_MESSAGE);
  }

  /**
   * Cancel a GRN.
   */
  static async cancelGRN(id: string, userId?: string): Promise<ImsGoodsReceivedNote> {
    try {
      const { data, error } = await this.supabase
        .from('ims_goods_received_notes')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as ImsGoodsReceivedNote;
    } catch (error) {
      console.error('[ImsGRNService] Error in cancelGRN:', error);
      throw error;
    }
  }
}
