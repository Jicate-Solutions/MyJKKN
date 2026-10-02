// lib/services/procurement/journey-service.ts
//
// One request's whole path through procurement — request → quotation → orders →
// deliveries — resolved from whichever document the user is looking at. Feeds the
// step tracker (components/procurement/request-journey.tsx) so every screen answers
// "where is this, and who has to act next?" without the user knowing that a
// request, a quotation, an order and a delivery record are four different tables.

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface JourneyAnchor {
  requestId?: string | null;
  rfqId?: string | null;
  poId?: string | null;
}

export interface RequestJourney {
  request: {
    id: string;
    request_number: string;
    status: string;
    rejection_reason: string | null;
  } | null;
  rfq: {
    id: string;
    rfq_number: string;
    status: string;
    award_rejection_reason: string | null;
    quotation_count: number;
    chosen_count: number;
  } | null;
  orders: Array<{ id: string; po_number: string; status: string }>;
  receipts: Array<{ id: string; grn_number: string; status: string; purchase_order_id: string }>;
}

export class ProcurementJourneyService {
  private static get supabase() {
    return createClientSupabaseClient() as any;
  }

  static async getJourney(anchor: JourneyAnchor): Promise<RequestJourney> {
    const db = this.supabase;
    let { requestId, rfqId } = anchor;

    // Walk up to the request from an order or a quotation.
    if (anchor.poId && !rfqId) {
      const { data, error } = await db
        .from('procurement_purchase_orders')
        .select('rfq_id')
        .eq('id', anchor.poId)
        .maybeSingle();
      if (error) throw error;
      rfqId = data?.rfq_id ?? null;
    }
    if (rfqId && !requestId) {
      const { data, error } = await db
        .from('procurement_rfqs')
        .select('source_request_id')
        .eq('id', rfqId)
        .maybeSingle();
      if (error) throw error;
      requestId = data?.source_request_id ?? null;
    }

    let request: RequestJourney['request'] = null;
    if (requestId) {
      const { data, error } = await db
        .from('procurement_purchase_requests')
        .select('id, request_number, status, rejection_reason')
        .eq('id', requestId)
        .maybeSingle();
      if (error) throw error;
      request = data ?? null;
    }

    // The quotation for this request: the one the user came from, else the newest
    // live one raised from the request.
    let rfqRow: {
      id: string;
      rfq_number: string;
      status: string;
      award_rejection_reason: string | null;
    } | null = null;
    if (rfqId) {
      const { data, error } = await db
        .from('procurement_rfqs')
        .select('id, rfq_number, status, award_rejection_reason')
        .eq('id', rfqId)
        .maybeSingle();
      if (error) throw error;
      rfqRow = data;
    } else if (requestId) {
      const { data, error } = await db
        .from('procurement_rfqs')
        .select('id, rfq_number, status, award_rejection_reason')
        .eq('source_request_id', requestId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      rfqRow = data?.[0] ?? null;
    }

    let rfq: RequestJourney['rfq'] = null;
    let orders: RequestJourney['orders'] = [];
    let receipts: RequestJourney['receipts'] = [];

    if (rfqRow) {
      const [{ data: quotes, error: qErr }, { data: pos, error: poErr }] = await Promise.all([
        db
          .from('procurement_quotations')
          .select('id, items:procurement_quotation_items(rfq_item_id, awarded)')
          .eq('rfq_id', rfqRow.id),
        db
          .from('procurement_purchase_orders')
          .select('id, po_number, status')
          .eq('rfq_id', rfqRow.id)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: true }),
      ]);
      if (qErr) throw qErr;
      if (poErr) throw poErr;

      const chosen = new Set<string>();
      for (const q of (quotes || []) as Array<{ items?: Array<{ rfq_item_id: string; awarded: boolean }> }>) {
        for (const it of q.items || []) if (it.awarded) chosen.add(it.rfq_item_id);
      }
      rfq = {
        ...rfqRow,
        quotation_count: (quotes || []).length,
        chosen_count: chosen.size,
      };
      orders = pos || [];

      if (orders.length) {
        const { data: grns, error: gErr } = await db
          .from('procurement_grn')
          .select('id, grn_number, status, purchase_order_id')
          .in('purchase_order_id', orders.map((o: { id: string }) => o.id))
          .neq('status', 'cancelled')
          .order('created_at', { ascending: true });
        if (gErr) throw gErr;
        receipts = grns || [];
      }
    }

    return { request, rfq, orders, receipts };
  }
}
