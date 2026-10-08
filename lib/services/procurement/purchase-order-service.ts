// lib/services/procurement/purchase-order-service.ts
//
// Purchase Order service. POs are created ALREADY APPROVED by the Super Admin's
// award approval (RPC procurement_approve_award — see ProcurementRfqService.
// approveAward). The draft -> pending_approval -> approved transitions below remain
// only so POs raised under the old flow can finish.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toStoredRequestNumber } from '@/lib/procurement/display-number';
import type {
  ProcurementPurchaseOrder,
  ProcurementPurchaseOrderItem,
  PoWithItems,
  PurchaseOrderFilters,
  PurchaseRequestRef,
  ProcurementPoRevision,
  ProposePoRevisionDto,
} from '@/types/procurement';

/**
 * Embeds the request a PO came from (PO -> RFQ -> request). Users track a purchase
 * by its request number ("Purchase no."), so the PO and GRN screens show it first.
 * Also used inside the GRN service's purchase_order embed.
 */
export const PO_PURCHASE_REQUEST_EMBED =
  'rfq:procurement_rfqs(source_request:procurement_purchase_requests!source_request_id(id,request_number,title))';

/** Moves the embedded rfq.source_request onto `purchase_request` and drops the rfq wrapper. */
export function withPurchaseRequest<T extends Record<string, any>>(
  row: T
): Omit<T, 'rfq'> & { purchase_request: PurchaseRequestRef | null } {
  const { rfq, ...rest } = row;
  return { ...rest, purchase_request: rfq?.source_request ?? null };
}

/**
 * PostgREST can't OR a top-level column with a column two embeds away, so a search
 * by purchase number first resolves the matching requests to their RFQ ids
 * (same approach as the RFQ list). Capped so a short search like "PR" can't build
 * an oversized URL; very broad searches may then miss older orders.
 */
export async function rfqIdsForRequestSearch(search: string): Promise<string[]> {
  const supabase = createClientSupabaseClient() as any;
  const { data: prs, error: prErr } = await supabase
    .from('procurement_purchase_requests')
    .select('id')
    .ilike('request_number', `%${toStoredRequestNumber(search)}%`)
    .limit(200);
  if (prErr) throw prErr;
  const prIds = (prs || []).map((r: { id: string }) => r.id);
  if (!prIds.length) return [];

  const { data: rfqs, error: rfqErr } = await supabase
    .from('procurement_rfqs')
    .select('id')
    .in('source_request_id', prIds)
    .limit(200);
  if (rfqErr) throw rfqErr;
  return (rfqs || []).map((r: { id: string }) => r.id);
}

/** Characters that would break a PostgREST or() filter string. */
export function sanitizeOrSearch(search: string): string {
  return search.replace(/[,()]/g, ' ').trim();
}

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
           items:procurement_purchase_order_items(count),
           ${PO_PURCHASE_REQUEST_EMBED}`,
          { count: 'exact' }
        );

      if (filters.search) {
        // Match the PO number or the purchase (request) number.
        const term = sanitizeOrSearch(filters.search);
        const rfqIds = await rfqIdsForRequestSearch(term);
        query = query.or(
          rfqIds.length
            ? `po_number.ilike.%${term}%,rfq_id.in.(${rfqIds.join(',')})`
            : `po_number.ilike.%${term}%`
        );
      }
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
        ...withPurchaseRequest(r),
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
           po_format:procurement_po_formats(*),
           ${PO_PURCHASE_REQUEST_EMBED}`
        )
        .eq('id', id)
        .single();
      if (headerErr) throw headerErr;

      const { data: items, error: itemsErr } = await this.supabase
        .from('procurement_purchase_order_items')
        .select(
          `*,
           source_quote:procurement_quotation_items(
             gst_percent, hsn,
             quotation:procurement_quotations(vendor_quote_number, quote_date, delivery_time_days, payment_terms, warranty)
           )`
        )
        .eq('po_id', id)
        .order('created_at', { ascending: true });
      if (itemsErr) throw itemsErr;

      // Every line of a PO comes from the same vendor quotation; take the first one found.
      const source_quotation =
        (items || []).map((it: any) => it.source_quote?.quotation).find(Boolean) ?? null;

      // HSN / GST % from the item master, so nobody types them per order.
      const itemIds = [...new Set((items || []).map((it: any) => it.domain_item_id).filter(Boolean))];
      const catalogById = new Map<string, { hsn: string | null; gst_percent: number | null }>();
      if (itemIds.length) {
        const { data: master } = await this.supabase
          .from('ims_items')
          .select('id, hsn_code, gst_rate')
          .in('id', itemIds);
        for (const m of master || []) {
          catalogById.set(m.id, {
            hsn: m.hsn_code ? String(m.hsn_code) : null,
            gst_percent: m.gst_rate != null ? Number(m.gst_rate) : null,
          });
        }
      }
      // What the vendor's quotation printed comes first, the item master second.
      const plainItems = (items || []).map(({ source_quote: sq, ...it }: any) => {
        const master = it.domain_item_id ? catalogById.get(it.domain_item_id) ?? null : null;
        const quotedGst = sq?.gst_percent != null ? Number(sq.gst_percent) : null;
        const hsn = sq?.hsn || master?.hsn || null;
        const gst_percent = quotedGst ?? master?.gst_percent ?? null;
        return { ...it, catalog: hsn || gst_percent != null ? { hsn, gst_percent } : null };
      });

      // The last order to this vendor: what it printed carries over (minus per-order keys).
      let vendor_defaults: Record<string, string> | null = null;
      let vendor_default_terms: string | null = null;
      if (header?.supplier_id) {
        const { data: last } = await this.supabase
          .from('procurement_purchase_orders')
          .select('header_field_values, terms_and_conditions')
          .eq('supplier_id', header.supplier_id)
          .neq('id', id)
          .order('created_at', { ascending: false })
          .limit(5);
        const prev = (last || []).find(
          (p: any) => Object.keys(p.header_field_values || {}).length > 0 || p.terms_and_conditions
        );
        if (prev) {
          const PER_ORDER = ['quotation_no', 'quotation_date', 'call_dated', 'payment_mode', 'paid_on', 'bank', 'amount_paid'];
          vendor_defaults = Object.fromEntries(
            Object.entries((prev.header_field_values || {}) as Record<string, string>).filter(
              ([k, v]) => !PER_ORDER.includes(k) && String(v ?? '').trim()
            )
          );
          vendor_default_terms = prev.terms_and_conditions ?? null;
        }
      }

      return {
        ...withPurchaseRequest(header),
        items: plainItems,
        source_quotation,
        vendor_defaults,
        vendor_default_terms,
      } as PoWithItems;
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
  /**
   * The order document was downloaded to send to the vendor: approved -> sent. Only
   * from approved (a later download changes nothing), and quietly a no-op if the order
   * already moved on. "Record delivery" appears once an order is sent.
   */
  static async markSent(id: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('procurement_purchase_orders')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'approved')
      .select('id');
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  // ── Renegotiation: the vendor's revised prices on an order ──────────────────
  // Proposed by the store (procurement_propose_po_revision), signed by the Super Admin
  // (procurement_decide_po_revision); the order keeps its number and becomes "Rev N".

  /** Every renegotiation of one order, newest first. */
  static async getRevisions(poId: string): Promise<ProcurementPoRevision[]> {
    const { data, error } = await this.supabase
      .from('procurement_po_revisions')
      .select('*, requester:profiles!requested_by(full_name), decider:profiles!decided_by(full_name)')
      .eq('po_id', poId)
      .order('revision_no', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ProcurementPoRevision[];
  }

  static async proposeRevision(dto: ProposePoRevisionDto): Promise<string> {
    const { data, error } = await this.supabase.rpc('procurement_propose_po_revision', {
      p_po_id: dto.poId,
      p_lines: dto.lines,
      p_reason: dto.reason,
      p_quote: dto.quote,
    });
    if (error) throw error;
    return data as string;
  }

  static async decideRevision(revisionId: string, approve: boolean, note?: string): Promise<void> {
    const { error } = await this.supabase.rpc('procurement_decide_po_revision', {
      p_revision_id: revisionId,
      p_approve: approve,
      p_note: note ?? null,
    });
    if (error) throw error;
  }

  static async withdrawRevision(revisionId: string): Promise<void> {
    const { error } = await this.supabase.rpc('procurement_withdraw_po_revision', { p_revision_id: revisionId });
    if (error) throw error;
  }

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
