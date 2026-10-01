// lib/services/procurement/purchase-order-service.ts
//
// Purchase Order service. POs are created ALREADY APPROVED by the Super Admin's
// award approval (RPC procurement_approve_award — see ProcurementRfqService.
// approveAward). The draft -> pending_approval -> approved transitions below remain
// only so POs raised under the old flow can finish.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ProcurementPurchaseOrder,
  ProcurementPurchaseOrderItem,
  PoWithItems,
  PurchaseOrderFilters,
} from '@/types/procurement';

export class ProcurementPurchaseOrderService {
  private static get supabase() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  static async getPurchaseOrders(filters: PurchaseOrderFilters = {}): Promise<{
    data: ProcurementPurchaseOrder[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('procurement_purchase_orders')
        .select(
          `*,
           supplier:ims_suppliers(id,name,code,email,gstin),
           created_by_profile:profiles!created_by(full_name),
           approved_by_profile:profiles!approved_by(full_name),
           items:procurement_purchase_order_items(count)`,
          { count: 'exact' }
        );

      if (filters.search) query = query.ilike('po_number', `%${filters.search}%`);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.supplier_id) query = query.eq('supplier_id', filters.supplier_id);
      if (filters.rfq_id) query = query.eq('rfq_id', filters.rfq_id);
      if (filters.store_id) query = query.eq('store_id', filters.store_id);
      else if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);

      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const from = (page - 1) * limit;
      query = query.range(from, from + limit - 1).order('created_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;

      const rows = (data || []).map((r: any) => ({
        ...r,
        item_count: Array.isArray(r.items) ? r.items[0]?.count ?? 0 : 0,
      }));

      return {
        data: rows as ProcurementPurchaseOrder[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[ProcurementPurchaseOrderService] getPurchaseOrders:', error);
      throw error;
    }
  }

  static async getPurchaseOrder(id: string): Promise<PoWithItems> {
    try {
      const { data: header, error: headerErr } = await this.supabase
        .from('procurement_purchase_orders')
        .select(
          `*,
           supplier:ims_suppliers(id,name,code,email,gstin,address,phone),
           created_by_profile:profiles!created_by(full_name),
           approved_by_profile:profiles!approved_by(full_name),
           po_format:procurement_po_formats(*)`
        )
        .eq('id', id)
        .single();
      if (headerErr) throw headerErr;

      const { data: items, error: itemsErr } = await this.supabase
        .from('procurement_purchase_order_items')
        .select(
          `*,
           source_quote:procurement_quotation_items(
             quotation:procurement_quotations(vendor_quote_number, quote_date, delivery_time_days, payment_terms)
           )`
        )
        .eq('po_id', id)
        .order('created_at', { ascending: true });
      if (itemsErr) throw itemsErr;

      // Every line of a PO comes from the same vendor quotation; take the first one found.
      const source_quotation =
        (items || []).map((it: any) => it.source_quote?.quotation).find(Boolean) ?? null;
      const plainItems = (items || []).map(({ source_quote: _sq, ...it }: any) => it);

      return { ...header, items: plainItems, source_quotation } as PoWithItems;
    } catch (error) {
      console.error('[ProcurementPurchaseOrderService] getPurchaseOrder:', error);
      throw error;
    }
  }

  static async submitForApproval(id: string): Promise<ProcurementPurchaseOrder> {
    return this.transition(id, 'draft', { status: 'pending_approval' });
  }

  static async approve(id: string, userId: string): Promise<ProcurementPurchaseOrder> {
    return this.transition(id, 'pending_approval', {
      status: 'approved',
      approved_by: userId,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    });
  }

  static async reject(id: string, userId: string, reason: string): Promise<ProcurementPurchaseOrder> {
    if (!reason?.trim()) throw new Error('A rejection reason is required.');
    return this.transition(id, 'pending_approval', {
      status: 'rejected',
      approved_by: userId,
      approved_at: new Date().toISOString(),
      rejection_reason: reason,
    });
  }

  static async cancel(id: string): Promise<ProcurementPurchaseOrder> {
    // Only a PO nobody has approved yet can be cancelled. Unguarded, a page still
    // showing "pending approval" could cancel a PO someone approved meanwhile.
    return this.transition(id, ['draft', 'pending_approval'], { status: 'cancelled' });
  }

  /** Updates the document-format selection, free-entry field values and classification tags for a PO. */
  static async updateDocumentFields(
    id: string,
    patch: {
      po_format_id?: string | null;
      header_field_values?: Record<string, string>;
      footer_field_values?: Record<string, string>;
      terms_and_conditions?: string | null;
      /** Library-resource tag — tagged POs auto-emit NAAC 3.1.1 evidence once approved (DB trigger, Wave 2D). */
      is_library_resource?: boolean;
    }
  ): Promise<ProcurementPurchaseOrder> {
    try {
      const { data, error } = await this.supabase
        .from('procurement_purchase_orders')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as ProcurementPurchaseOrder;
    } catch (error) {
      console.error('[ProcurementPurchaseOrderService] updateDocumentFields:', error);
      throw error;
    }
  }

  /** Merges the given keys into a PO item's extra_fields (HSN, GST%, MRP, ISBN, ...). */
  static async updateItemExtraFields(
    itemId: string,
    extraFields: Record<string, string | number>
  ): Promise<ProcurementPurchaseOrderItem> {
    try {
      const { data: existing, error: fetchErr } = await this.supabase
        .from('procurement_purchase_order_items')
        .select('extra_fields')
        .eq('id', itemId)
        .single();
      if (fetchErr) throw fetchErr;

      const merged = { ...(existing?.extra_fields ?? {}), ...extraFields };
      const { data, error } = await this.supabase
        .from('procurement_purchase_order_items')
        .update({ extra_fields: merged })
        .eq('id', itemId)
        .select()
        .single();
      if (error) throw error;
      return data as ProcurementPurchaseOrderItem;
    } catch (error) {
      console.error('[ProcurementPurchaseOrderService] updateItemExtraFields:', error);
      throw error;
    }
  }

  /** Corrects a line item's unit_price on a Draft PO; recomputes line_total and PO totals. */
  static async updateItemPrice(
    poId: string,
    itemId: string,
    unitPrice: number
  ): Promise<ProcurementPurchaseOrderItem> {
    try {
      const { data: po, error: poErr } = await this.supabase
        .from('procurement_purchase_orders')
        .select('status, tax_amount')
        .eq('id', poId)
        .single();
      if (poErr) throw poErr;
      if (po.status !== 'draft') throw new Error('Only draft orders can be edited.');

      const { data: item, error: itemErr } = await this.supabase
        .from('procurement_purchase_order_items')
        .select('ordered_quantity')
        .eq('id', itemId)
        .single();
      if (itemErr) throw itemErr;

      const lineTotal = Number(item.ordered_quantity) * unitPrice;
      const { data: updated, error: updErr } = await this.supabase
        .from('procurement_purchase_order_items')
        .update({ unit_price: unitPrice, line_total: lineTotal })
        .eq('id', itemId)
        .select()
        .single();
      if (updErr) throw updErr;

      const { data: allItems, error: allErr } = await this.supabase
        .from('procurement_purchase_order_items')
        .select('line_total')
        .eq('po_id', poId);
      if (allErr) throw allErr;

      const subtotal = (allItems || []).reduce((s: number, l: any) => s + Number(l.line_total), 0);
      await this.supabase
        .from('procurement_purchase_orders')
        .update({
          subtotal,
          total_amount: subtotal + Number(po.tax_amount || 0),
          updated_at: new Date().toISOString(),
        })
        .eq('id', poId);

      return updated as ProcurementPurchaseOrderItem;
    } catch (error) {
      console.error('[ProcurementPurchaseOrderService] updateItemPrice:', error);
      throw error;
    }
  }

  /**
   * Move a PO between states, only from the expected state(s). Zero rows means
   * the PO moved on (another tab, a double click, someone else's approval) —
   * say where it is now instead of surfacing PostgREST's "0 rows" error.
   */
  private static async transition(
    id: string,
    fromStatus: string | string[],
    patch: Record<string, unknown>
  ): Promise<ProcurementPurchaseOrder> {
    const from = Array.isArray(fromStatus) ? fromStatus : [fromStatus];
    const { data, error } = await this.supabase
      .from('procurement_purchase_orders')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('status', from)
      .select()
      .maybeSingle();
    if (error) {
      console.error('[ProcurementPurchaseOrderService] transition:', error);
      throw error;
    }
    if (data) return data as ProcurementPurchaseOrder;

    const { data: current } = await this.supabase
      .from('procurement_purchase_orders')
      .select('status')
      .eq('id', id)
      .maybeSingle();
    throw new Error(
      current?.status
        ? `This order is already ${String(current.status).replace(/_/g, ' ')} — the page has been refreshed.`
        : 'This order could not be found — it may have been removed.'
    );
  }
}
