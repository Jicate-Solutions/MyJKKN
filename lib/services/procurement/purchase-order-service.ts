// lib/services/procurement/purchase-order-service.ts
//
// Purchase Order service (PRD step 7). Generates ONE PO per awarded vendor from
// an RFQ's awarded quotation lines, then runs the approval lifecycle
// (draft -> pending_approval -> approved/rejected -> sent). Numbering uses
// procurement_next_number (doc_type 'PO').

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ProcurementQuotationService } from './quotation-service';
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
           supplier:ims_suppliers(id,name,code,email,gstin),
           created_by_profile:profiles!created_by(full_name),
           approved_by_profile:profiles!approved_by(full_name),
           po_format:procurement_po_formats(*)`
        )
        .eq('id', id)
        .single();
      if (headerErr) throw headerErr;

      const { data: items, error: itemsErr } = await this.supabase
        .from('procurement_purchase_order_items')
        .select('*')
        .eq('po_id', id)
        .order('created_at', { ascending: true });
      if (itemsErr) throw itemsErr;

      return { ...header, items: items || [] } as PoWithItems;
    } catch (error) {
      console.error('[ProcurementPurchaseOrderService] getPurchaseOrder:', error);
      throw error;
    }
  }

  /**
   * Generate one PO per awarded vendor from an RFQ, then mark the RFQ 'awarded'.
   * Returns the POs this call produced.
   *
   * Convergent, not all-or-nothing: the POs are written in a loop with no enclosing
   * transaction, so a failed run can leave some created. Re-running completes the
   * missing ones (and fills in any PO whose line items never landed) instead of
   * refusing. Re-running once everything already exists still throws, so a repeat
   * click gets a clear "already generated" rather than a false success.
   */
  static async generateFromRfq(rfqId: string, userId: string): Promise<ProcurementPurchaseOrder[]> {
    try {
      const { data: rfq, error: rfqErr } = await this.supabase
        .from('procurement_rfqs')
        .select('*')
        .eq('id', rfqId)
        .single();
      if (rfqErr) throw rfqErr;

      // Resume-safe. POs are created one per vendor in a loop with no surrounding
      // transaction, so an earlier run can fail after creating only some of them.
      // A blanket "refuse if any PO exists" guard used to strand exactly that case:
      // the RFQ kept a partial set of POs, never reached 'awarded', and every retry
      // was rejected. Instead, load what already exists and finish the job — the same
      // converge-on-retry idiom verifyGrn uses with its per-line domain_posted_at
      // markers. A vendor whose PO row exists but whose lines never landed is treated
      // as incomplete and repaired rather than skipped or duplicated.
      const { data: existingPos, error: exErr } = await this.supabase
        .from('procurement_purchase_orders')
        .select('*')
        .eq('rfq_id', rfqId);
      if (exErr) throw exErr;

      const existingPoIds = (existingPos || []).map((p: any) => p.id);
      const linedPoIds = new Set<string>();
      if (existingPoIds.length > 0) {
        const { data: existingLines, error: elErr } = await this.supabase
          .from('procurement_purchase_order_items')
          .select('po_id')
          .in('po_id', existingPoIds);
        if (elErr) throw elErr;
        for (const l of (existingLines || []) as any[]) linedPoIds.add(l.po_id);
      }
      const priorBySupplier = new Map<string, any>(
        (existingPos || []).map((p: any) => [p.supplier_id, p])
      );

      // RFQ item snapshots (name/spec/qty/unit) keyed by id.
      const { data: rfqItems, error: riErr } = await this.supabase
        .from('procurement_rfq_items')
        .select('*')
        .eq('rfq_id', rfqId);
      if (riErr) throw riErr;
      const riMap = new Map<string, any>((rfqItems || []).map((r: any) => [r.id, r]));

      const quotations = await ProcurementQuotationService.getQuotationsForRfq(rfqId);
      const created: ProcurementPurchaseOrder[] = [];
      let awardedVendorCount = 0;

      for (const q of quotations) {
        const awarded = q.items.filter((i) => i.awarded);
        if (awarded.length === 0) continue;
        awardedVendorCount++;

        const lines = awarded.map((qi) => {
          const ri = riMap.get(qi.rfq_item_id);
          const qty = Number(qi.quantity ?? ri?.quantity ?? 0);
          const price = Number(qi.unit_price ?? 0);
          return {
            rfq_item_id: qi.rfq_item_id,
            source_quotation_item_id: qi.id,
            domain_item_id: ri?.domain_item_id ?? null,
            item_name: ri?.item_name ?? 'Item',
            item_spec: ri?.item_spec ?? null,
            ordered_quantity: qty,
            unit_id: ri?.unit_id ?? null,
            unit_label: ri?.unit_label ?? null,
            unit_price: price,
            line_total: qty * price,
          };
        });
        const subtotal = lines.reduce((s, l) => s + l.line_total, 0);

        // This vendor's PO was already created and populated by an earlier run.
        const prior = priorBySupplier.get(q.supplier_id);
        if (prior && linedPoIds.has(prior.id)) continue;

        // The PO row exists but its lines never landed — an earlier run died between
        // the two inserts. Complete it in place rather than issuing the vendor a
        // second PO number for the same order. Totals are rewritten from the awards
        // as they stand now, in case they moved since that failed run.
        if (prior) {
          const { error: repairErr } = await this.supabase
            .from('procurement_purchase_order_items')
            .insert(lines.map((l) => ({ ...l, po_id: prior.id })));
          if (repairErr) throw repairErr;

          const { data: repaired, error: repairTotalErr } = await this.supabase
            .from('procurement_purchase_orders')
            .update({
              subtotal,
              total_amount: subtotal,
              updated_at: new Date().toISOString(),
            })
            .eq('id', prior.id)
            .select()
            .single();
          if (repairTotalErr) throw repairTotalErr;

          created.push((repaired ?? prior) as ProcurementPurchaseOrder);
          continue;
        }

        const poNumber = await this.generatePoNumber(rfq.institution_id);

        // Pre-select the vendor's default PO document format, if one is set.
        const { data: supplier } = await this.supabase
          .from('ims_suppliers')
          .select('default_po_format_id')
          .eq('id', q.supplier_id)
          .single();

        const { data: po, error: poErr } = await this.supabase
          .from('procurement_purchase_orders')
          .insert({
            institution_id: rfq.institution_id,
            store_id: rfq.store_id ?? null,
            po_number: poNumber,
            supplier_id: q.supplier_id,
            rfq_id: rfqId,
            domain: rfq.domain,
            status: 'draft',
            subtotal,
            tax_amount: 0,
            total_amount: subtotal,
            payment_terms: q.payment_terms ?? null,
            po_format_id: supplier?.default_po_format_id ?? null,
            created_by: userId,
          })
          .select()
          .single();
        if (poErr) throw poErr;

        const { error: lineErr } = await this.supabase
          .from('procurement_purchase_order_items')
          .insert(lines.map((l) => ({ ...l, po_id: po.id })));
        if (lineErr) throw lineErr;

        created.push(po as ProcurementPurchaseOrder);
      }

      if (awardedVendorCount === 0) {
        throw new Error('No awarded lines found. Award vendors in the comparison first.');
      }
      if (created.length === 0) {
        // Every awarded vendor already had a complete PO. Keep the explicit "nothing to
        // do" signal a repeat click has always received, rather than silently reporting
        // success for work that did not happen.
        throw new Error('Purchase Orders have already been generated for this RFQ.');
      }

      // Also runs on a resumed run, so an RFQ left un-awarded by a failed attempt
      // reaches 'awarded' once its remaining POs exist.
      await this.supabase
        .from('procurement_rfqs')
        .update({ status: 'awarded', updated_at: new Date().toISOString() })
        .eq('id', rfqId);

      return created;
    } catch (error) {
      console.error('[ProcurementPurchaseOrderService] generateFromRfq:', error);
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

  static async markSent(id: string): Promise<ProcurementPurchaseOrder> {
    return this.transition(id, 'approved', { status: 'sent' });
  }

  static async cancel(id: string): Promise<ProcurementPurchaseOrder> {
    const { data, error } = await this.supabase
      .from('procurement_purchase_orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as ProcurementPurchaseOrder;
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
      if (po.status !== 'draft') throw new Error('Only Draft purchase orders can be edited.');

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

  private static async transition(
    id: string,
    fromStatus: string,
    patch: Record<string, unknown>
  ): Promise<ProcurementPurchaseOrder> {
    try {
      const { data, error } = await this.supabase
        .from('procurement_purchase_orders')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', fromStatus)
        .select()
        .single();
      if (error) throw error;
      if (!data) throw new Error(`PO is not in "${fromStatus}" state; refresh and retry.`);
      return data as ProcurementPurchaseOrder;
    } catch (error) {
      console.error('[ProcurementPurchaseOrderService] transition:', error);
      throw error;
    }
  }

  private static async generatePoNumber(institutionId: string): Promise<string> {
    const today = new Date().toISOString().split('T')[0];
    const { data: nextNum, error } = await this.supabase.rpc('procurement_next_number', {
      p_institution_id: institutionId,
      p_doc_type: 'PO',
      p_date: today,
    });
    const yymmdd = today.replace(/-/g, '').slice(2);
    if (error || nextNum == null) {
      console.error('[ProcurementPurchaseOrderService] generatePoNumber:', error);
      return `PO-${yymmdd}-${String(Date.now()).slice(-5)}`;
    }
    return `PO-${yymmdd}-${String(nextNum).padStart(5, '0')}`;
  }
}
