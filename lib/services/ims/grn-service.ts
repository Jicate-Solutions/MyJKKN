// lib/services/ims/grn-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { calculateGstLine } from '@/lib/utils/ims-gst-calculator';
import type {
  ImsGoodsReceivedNote,
  ImsGRNWithItems,
  ImsGRNFilters,
  CreateImsGRNDto,
} from '@/types/ims';

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
        .order('created_at', { ascending: true });

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

  /**
   * Create a GRN (header + line items).
   *
   * Inserts the GRN in 'pending_verification' status. Stock is NOT updated
   * until the GRN is approved via `approveGRN`.
   */
  static async createGRN(data: CreateImsGRNDto, userId: string): Promise<ImsGoodsReceivedNote> {
    try {
      // Generate GRN number - use store_id if available, fallback to institution_id
      const grnNumber = await this.generateGRNNumber(data.institution_id, data.store_id);

      // Insert GRN header
      const { data: grn, error: grnError } = await this.supabase
        .from('ims_goods_received_notes')
        .insert({
          grn_number: grnNumber,
          supplier_id: data.supplier_id,
          invoice_number: data.invoice_number || null,
          invoice_date: data.invoice_date || null,
          invoice_amount: data.invoice_amount || null,
          status: 'pending_verification',
          received_by: userId,
          notes: data.notes || null,
          institution_id: data.institution_id,
          ...(data.store_id ? { store_id: data.store_id } : {}),
        })
        .select()
        .single();

      if (grnError) throw grnError;

      // Fetch store GSTIN and item GST rates for GST calculation
      const [storeResult, itemsResult] = await Promise.all([
        this.supabase
          .from('ims_stores')
          .select('gstin')
          .eq('id', grn.store_id ?? '')
          .maybeSingle(),
        this.supabase
          .from('ims_items')
          .select('id, gst_rate')
          .in('id', data.items.map((i) => i.item_id)),
      ]);

      const storeGstin: string | null = storeResult.data?.gstin ?? null;

      // Supplier GSTIN comes from ims_suppliers
      const { data: supplierData } = await this.supabase
        .from('ims_suppliers')
        .select('gstin')
        .eq('id', data.supplier_id)
        .maybeSingle();
      const supplierGstin: string | null = supplierData?.gstin ?? null;

      const itemGstRateMap = new Map<string, number>(
        (itemsResult.data ?? []).map((r) => [r.id, r.gst_rate ?? 0])
      );

      // Build GRN items with computed GST breakdown
      const grnItems = data.items.map((item) => {
        const gstRate = item.gst_rate ?? itemGstRateMap.get(item.item_id) ?? 0;
        const gst = calculateGstLine(
          item.cost_price,
          item.quantity,
          gstRate,
          supplierGstin,
          storeGstin
        );

        return {
          grn_id: grn.id,
          item_id: item.item_id,
          quantity: item.quantity,
          unit_id: item.unit_id,
          cost_price: item.cost_price,
          taxable_amount: gst.taxableAmount,
          cgst_percent: gst.cgstPercent,
          cgst_amount: gst.cgstAmount,
          sgst_percent: gst.sgstPercent,
          sgst_amount: gst.sgstAmount,
          igst_percent: gst.igstPercent,
          igst_amount: gst.igstAmount,
          total_gst_amount: gst.totalGstAmount,
          total: gst.totalAmount,            // taxable + GST = actual supplier payment
          batch_number: item.batch_number || null,
          expiry_date: item.expiry_date || null,
        };
      });

      const { error: itemsError } = await this.supabase
        .from('ims_grn_items')
        .insert(grnItems);

      if (itemsError) throw itemsError;

      return grn as ImsGoodsReceivedNote;
    } catch (error) {
      console.error('[ImsGRNService] Error in createGRN:', error);
      throw error;
    }
  }

  /**
   * Verify a GRN - set status to 'verified'.
   */
  static async verifyGRN(
    id: string,
    userId: string
  ): Promise<ImsGoodsReceivedNote> {
    try {
      const { data, error } = await this.supabase
        .from('ims_goods_received_notes')
        .update({
          status: 'verified',
          verified_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as ImsGoodsReceivedNote;
    } catch (error) {
      console.error('[ImsGRNService] Error in verifyGRN:', error);
      throw error;
    }
  }

  /**
   * Approve a GRN - set status to 'approved', update stock summary,
   * and create stock batches for each item.
   */
  static async approveGRN(
    id: string,
    userId: string
  ): Promise<ImsGoodsReceivedNote> {
    try {
      // Update GRN status
      const { data: grn, error: grnError } = await this.supabase
        .from('ims_goods_received_notes')
        .update({
          status: 'approved',
          approved_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, institution_id, store_id')
        .single();

      if (grnError) throw grnError;

      // Fetch GRN items to update stock
      const { data: grnItems, error: itemsError } = await this.supabase
        .from('ims_grn_items')
        .select('*')
        .eq('grn_id', id);

      if (itemsError) throw itemsError;

      // Process each item: create batches and update stock summary
      for (const grnItem of grnItems || []) {
        // Create stock batch
        await this.supabase.from('ims_stock_batches').insert({
          item_id: grnItem.item_id,
          batch_number: grnItem.batch_number || null,
          expiry_date: grnItem.expiry_date || null,
          quantity: grnItem.quantity,
          cost_price: grnItem.cost_price,
          total_value: grnItem.total,
          grn_id: id,
          location_type: 'central_store',
          department_id: null,
          institution_id: grn.institution_id,
          ...(grn.store_id ? { store_id: grn.store_id } : {}),
        });

        // Upsert stock summary - Primary: store_id; Fallback: institution_id
        let stockQuery = this.supabase
          .from('ims_stock_summary')
          .select('id, current_quantity, available_quantity, total_value')
          .eq('item_id', grnItem.item_id);

        if (grn.store_id) {
          stockQuery = stockQuery.eq('store_id', grn.store_id);
        } else {
          stockQuery = stockQuery.eq('institution_id', grn.institution_id);
        }

        const { data: existing } = await stockQuery.maybeSingle();

        if (existing) {
          await this.supabase
            .from('ims_stock_summary')
            .update({
              current_quantity: existing.current_quantity + grnItem.quantity,
              available_quantity: existing.available_quantity + grnItem.quantity,
              total_value: existing.total_value + grnItem.total,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          await this.supabase.from('ims_stock_summary').insert({
            item_id: grnItem.item_id,
            current_quantity: grnItem.quantity,
            reserved_quantity: 0,
            available_quantity: grnItem.quantity,
            total_value: grnItem.total,
            institution_id: grn.institution_id,
            ...(grn.store_id ? { store_id: grn.store_id } : {}),
          });
        }

        // Record financial transaction for purchase
        await this.supabase.from('ims_financial_transactions').insert({
          transaction_type: 'purchase',
          reference_id: id,
          reference_type: 'grn',
          amount: grnItem.total,
          description: `GRN ${grn.grn_number} - Item received`,
          item_id: grnItem.item_id,
          quantity: grnItem.quantity,
          created_by: userId,
          institution_id: grn.institution_id,
          ...(grn.store_id ? { store_id: grn.store_id } : {}),
        });
      }

      return grn as ImsGoodsReceivedNote;
    } catch (error) {
      console.error('[ImsGRNService] Error in approveGRN:', error);
      throw error;
    }
  }

  /**
   * Cancel a GRN.
   */
  static async cancelGRN(id: string): Promise<ImsGoodsReceivedNote> {
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

  /**
   * Generate the next sequential GRN number.
   * Format: GRN-YYMMDD-XXXXX (e.g., GRN-260226-00001)
   *
   * Uses atomic counter (ims_next_grn_number RPC) when storeId is available,
   * preventing duplicate numbers under concurrent usage.
   * Falls back to timestamp-based number for legacy paths without storeId.
   */
  private static async generateGRNNumber(institution_id: string, storeId?: string): Promise<string> {
    try {
      if (!storeId) {
        // Fallback for no storeId: use timestamp-based number
        const today = new Date();
        const yymmdd = today.toISOString().slice(2, 10).replace(/-/g, '');
        return `GRN-${yymmdd}-${String(Date.now()).slice(-5)}`;
      }
      const today = new Date().toISOString().split('T')[0];
      const { data: nextNum, error } = await this.supabase.rpc('ims_next_grn_number', {
        p_store_id: storeId,
        p_date: today,
      });
      if (error || nextNum == null) throw error || new Error('No counter returned');
      const yymmdd = today.replace(/-/g, '').slice(2); // YYMMDD
      return `GRN-${yymmdd}-${String(nextNum).padStart(5, '0')}`;
    } catch (error) {
      console.error('[ImsGRNService] Error generating GRN number:', error);
      const yymmdd = new Date().toISOString().slice(2, 10).replace(/-/g, '');
      return `GRN-${yymmdd}-${String(Date.now()).slice(-5)}`;
    }
  }
}
