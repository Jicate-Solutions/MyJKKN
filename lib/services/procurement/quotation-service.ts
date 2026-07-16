// lib/services/procurement/quotation-service.ts
//
// Vendor Quotation service (PRD steps 5-6). Captures a vendor's quotation (header
// + per-RFQ-item unit prices + optional uploaded document), builds the item-wise
// comparison matrix, and awards each RFQ line to a vendor. Award is unique per
// RFQ line (DB partial unique index uq_pqi_one_award_per_rfq_item).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ProcurementQuotation,
  QuotationWithItems,
  CreateQuotationDto,
  ComparisonRow,
} from '@/types/procurement';

/**
 * Pure builder for the item-wise comparison — one row per RFQ item with every
 * vendor's quote + the lowest price. Extracted so the client can compute it from
 * already-loaded RFQ items + quotations WITHOUT a second server round-trip (the
 * quotations page already holds both), and so the service can reuse it on the server.
 */
export function buildComparisonRows(
  rfqItems: Array<{
    id: string;
    item_name: string;
    item_spec: string | null;
    quantity: number;
    unit_label: string | null;
    is_chemical?: boolean;
  }>,
  quotations: QuotationWithItems[]
): ComparisonRow[] {
  return rfqItems.map((ri): ComparisonRow => {
    const quotes = quotations
      .flatMap((q) =>
        q.items
          .filter((qi) => qi.rfq_item_id === ri.id)
          .map((qi) => ({
            quotation_id: q.id,
            quotation_item_id: qi.id,
            supplier_id: q.supplier_id,
            supplier_name: q.supplier?.name ?? q.supplier_id,
            unit_price: qi.unit_price,
            quantity: qi.quantity,
            delivery_time_days: qi.delivery_time_days,
            manufacturer: qi.manufacturer,
            quality_grade: qi.quality_grade,
            concentration: qi.concentration,
            other_specs: qi.other_specs,
            awarded: qi.awarded,
          }))
      )
      // Not-quoted (unit_price null) sorts last — plain `a - b` would coerce null to 0
      // and put "didn't quote this" ahead of every real price.
      .sort((a, b) => {
        if (a.unit_price === null) return b.unit_price === null ? 0 : 1;
        if (b.unit_price === null) return -1;
        return a.unit_price - b.unit_price;
      });
    const lowestQuote = quotes.find((q) => q.unit_price !== null);
    return {
      rfq_item_id: ri.id,
      item_name: ri.item_name,
      item_spec: ri.item_spec,
      quantity: ri.quantity,
      unit_label: ri.unit_label,
      is_chemical: ri.is_chemical ?? false,
      quotes,
      lowest_price: lowestQuote ? lowestQuote.unit_price : null,
    };
  });
}

export class ProcurementQuotationService {
  private static get supabase() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /** All quotations (with items + supplier) for an RFQ. */
  static async getQuotationsForRfq(rfqId: string): Promise<QuotationWithItems[]> {
    try {
      const { data: quotations, error } = await this.supabase
        .from('procurement_quotations')
        .select('*, supplier:ims_suppliers(id,name,code,email)')
        .eq('rfq_id', rfqId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const ids = (quotations || []).map((q: any) => q.id);
      if (ids.length === 0) return [];

      const { data: items, error: itemsErr } = await this.supabase
        .from('procurement_quotation_items')
        .select('*')
        .in('quotation_id', ids);
      if (itemsErr) throw itemsErr;

      const byQuotation = new Map<string, any[]>();
      for (const it of items || []) {
        const list = byQuotation.get(it.quotation_id) || [];
        list.push(it);
        byQuotation.set(it.quotation_id, list);
      }
      return (quotations || []).map((q: any) => ({
        ...q,
        items: byQuotation.get(q.id) || [],
      })) as QuotationWithItems[];
    } catch (error) {
      console.error('[ProcurementQuotationService] getQuotationsForRfq:', error);
      throw error;
    }
  }

  /**
   * Create a vendor (ims_suppliers row) inline from the quotation dialog, so a
   * quotation can be captured even when the institution has no registered vendors
   * yet. code is NOT NULL — auto-generate one when the user doesn't supply it.
   */
  static async createVendor(input: {
    institution_id: string;
    name: string;
    code?: string | null;
    email?: string | null;
  }): Promise<{ id: string; name: string; code: string; email: string | null }> {
    const name = input.name?.trim();
    if (!name) throw new Error('Vendor name is required.');
    const code = input.code?.trim() || `V-${String(Date.now()).slice(-6)}`;
    const { data, error } = await this.supabase
      .from('ims_suppliers')
      .insert({
        name,
        code,
        email: input.email?.trim() || null,
        institution_id: input.institution_id,
        is_active: true,
      })
      .select('id, name, code, email')
      .single();
    if (error) throw error;
    return data as { id: string; name: string; code: string; email: string | null };
  }

  /**
   * Create a quotation for one vendor on an RFQ. UNIQUE(rfq_id, supplier_id)
   * prevents a second quotation from the same vendor. Advances the RFQ from
   * 'sent' to 'quotations_received' on the first quote.
   */
  static async createQuotation(
    dto: CreateQuotationDto,
    userId: string
  ): Promise<ProcurementQuotation> {
    try {
      if (!dto.items?.length) throw new Error('A quotation must price at least one item.');
      if (!dto.items.some((i) => i.unit_price !== null)) {
        throw new Error('At least one item must have a quoted price — mark the rest "Not quoted".');
      }

      const total = dto.items.reduce(
        (sum, i) => sum + Number(i.unit_price || 0) * Number(i.quantity ?? 0),
        0
      );

      const { data: header, error: headerErr } = await this.supabase
        .from('procurement_quotations')
        .insert({
          institution_id: dto.institution_id,
          rfq_id: dto.rfq_id,
          supplier_id: dto.supplier_id,
          vendor_quote_number: dto.vendor_quote_number ?? null,
          quote_date: dto.quote_date ?? null,
          validity_date: dto.validity_date ?? null,
          payment_terms: dto.payment_terms ?? null,
          delivery_time_days: dto.delivery_time_days ?? null,
          total_amount: total,
          document_url: dto.document_url ?? null,
          document_file_id: dto.document_file_id ?? null,
          status: 'received',
          notes: dto.notes ?? null,
          created_by: userId,
        })
        .select()
        .single();
      if (headerErr) throw headerErr;

      const itemRows = dto.items.map((i) => ({
        quotation_id: header.id,
        rfq_item_id: i.rfq_item_id,
        unit_price: i.unit_price,
        quantity: i.quantity ?? null,
        delivery_time_days: i.delivery_time_days ?? null,
        remarks: i.remarks ?? null,
        manufacturer: i.manufacturer ?? null,
        quality_grade: i.quality_grade ?? null,
        concentration: i.concentration ?? null,
        other_specs: i.other_specs ?? null,
      }));
      const { error: itemsErr } = await this.supabase
        .from('procurement_quotation_items')
        .insert(itemRows);
      if (itemsErr) throw itemsErr;

      // Advance RFQ status (best-effort; guarded so it only moves from 'sent').
      await this.supabase
        .from('procurement_rfqs')
        .update({ status: 'quotations_received', updated_at: new Date().toISOString() })
        .eq('id', dto.rfq_id)
        .eq('status', 'sent');

      return header as ProcurementQuotation;
    } catch (error) {
      console.error('[ProcurementQuotationService] createQuotation:', error);
      throw error;
    }
  }

  static async deleteQuotation(id: string): Promise<void> {
    const { error } = await this.supabase.from('procurement_quotations').delete().eq('id', id);
    if (error) throw error;
  }

  /**
   * Item-wise comparison for an RFQ: one row per RFQ item, each with every
   * vendor's quote for that item + the lowest price (for highlighting).
   */
  static async getComparison(rfqId: string): Promise<ComparisonRow[]> {
    try {
      const [{ data: rfqItems, error: riErr }, quotations] = await Promise.all([
        this.supabase
          .from('procurement_rfq_items')
          .select('*')
          .eq('rfq_id', rfqId)
          .order('created_at', { ascending: true }),
        this.getQuotationsForRfq(rfqId),
      ]);
      if (riErr) throw riErr;

      return buildComparisonRows(rfqItems || [], quotations);
    } catch (error) {
      console.error('[ProcurementQuotationService] getComparison:', error);
      throw error;
    }
  }

  /**
   * Award one RFQ line to a vendor's quotation item. Clears any prior winner for
   * the same line FIRST (the partial unique index allows only one awarded row per
   * rfq_item, so the old flag must drop before the new one is set).
   */
  static async awardLine(rfqItemId: string, quotationItemId: string): Promise<void> {
    try {
      const { data: target, error: fetchErr } = await this.supabase
        .from('procurement_quotation_items')
        .select('unit_price')
        .eq('id', quotationItemId)
        .single();
      if (fetchErr) throw fetchErr;
      if (target?.unit_price === null) {
        throw new Error('This vendor did not quote a price for this item — it cannot be awarded.');
      }

      await this.supabase
        .from('procurement_quotation_items')
        .update({ awarded: false })
        .eq('rfq_item_id', rfqItemId)
        .eq('awarded', true);

      const { error } = await this.supabase
        .from('procurement_quotation_items')
        .update({ awarded: true })
        .eq('id', quotationItemId);
      if (error) throw error;
    } catch (error) {
      console.error('[ProcurementQuotationService] awardLine:', error);
      throw error;
    }
  }

  static async unawardLine(rfqItemId: string): Promise<void> {
    const { error } = await this.supabase
      .from('procurement_quotation_items')
      .update({ awarded: false })
      .eq('rfq_item_id', rfqItemId)
      .eq('awarded', true);
    if (error) throw error;
  }
}
