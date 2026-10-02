// lib/services/procurement/rfq-service.ts
//
// Request for Quotation service. Converts a submitted purchase request into an RFQ
// (snapshotting its items), attaches vendors, and carries the chosen vendors to the
// Super Admin's award approval (docs/procurement/simplified-flow-spec.md). Numbering uses procurement_next_number (doc_type 'RFQ').

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toStoredRequestNumber } from '@/lib/procurement/display-number';
import type {
  ProcurementPurchaseOrder,
  ProcurementRfq,
  RfqWithDetails,
  RfqFilters,
} from '@/types/procurement';

/** A request must be approved (sign-off #1) before quotations can start. */
const CONVERTIBLE_PR_STATUSES = ['approved'];

export class ProcurementRfqService {
  private static get supabase() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  static async getRfqs(filters: RfqFilters = {}): Promise<{
    data: ProcurementRfq[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('procurement_rfqs')
        .select(
          `*,
           created_by_profile:profiles!created_by(full_name),
           source_request:procurement_purchase_requests!source_request_id(request_number),
           items:procurement_rfq_items(count),
           item_preview:procurement_rfq_items(item_name, quantity),
           vendors:procurement_rfq_vendors(count),
           quotes:procurement_quotations(count)`,
          { count: 'exact' }
        );

      if (filters.search) {
        // Match either the RFQ's own number or the source purchase request's
        // number, since users often search by the PR they're looking to convert.
        const { data: matchingPRs } = await this.supabase
          .from('procurement_purchase_requests')
          .select('id')
          .ilike('request_number', `%${toStoredRequestNumber(filters.search)}%`);
        const prIds = (matchingPRs || []).map((r: { id: string }) => r.id);

        const orClause = prIds.length
          ? `rfq_number.ilike.%${filters.search}%,source_request_id.in.(${prIds.join(',')})`
          : `rfq_number.ilike.%${filters.search}%`;
        query = query.or(orClause);
      }
      // "draft" in the stage filter means every still-open quotation, including the
      // retired review statuses and ones that already have quotes.
      if (filters.status === 'draft') {
        query = query.in('status', ['draft', 'pending_review', 'approved', 'rejected', 'sent', 'quotations_received', 'compared']);
      } else if (filters.status) {
        query = query.eq('status', filters.status);
      }
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
        vendor_count: Array.isArray(r.vendors) ? r.vendors[0]?.count ?? 0 : 0,
        quote_count: Array.isArray(r.quotes) ? r.quotes[0]?.count ?? 0 : 0,
      }));

      return {
        data: rows as ProcurementRfq[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[ProcurementRfqService] getRfqs:', error);
      throw error;
    }
  }

  /**
   * Resolve each item's effective is_chemical flag (item override, else category) so the
   * Quotations page can gate the Concentration spec field to chemical items only. Live UI
   * hint, not persisted — mirrors the COALESCE(item, category, false) logic domain adapters
   * apply at GRN time (lib/services/procurement/domain-adapters/ims-adapter.ts mapItem()).
   * IMS-specific for now since it's the only registered procurement domain.
   */
  private static async attachChemicalFlags<T extends { domain_item_id: string | null }>(
    items: T[]
  ): Promise<(T & { is_chemical: boolean })[]> {
    const domainItemIds = [...new Set(items.map((i) => i.domain_item_id).filter(Boolean))] as string[];
    if (!domainItemIds.length) {
      return items.map((i) => ({ ...i, is_chemical: false }));
    }
    const { data, error } = await this.supabase
      .from('ims_items')
      .select('id, is_chemical, category:ims_item_categories(is_chemical)')
      .in('id', domainItemIds);
    if (error) throw error;
    const chemicalById = new Map<string, boolean>();
    for (const row of (data || []) as any[]) {
      chemicalById.set(row.id, row.is_chemical ?? row.category?.is_chemical ?? false);
    }
    return items.map((i) => ({
      ...i,
      is_chemical: i.domain_item_id ? chemicalById.get(i.domain_item_id) ?? false : false,
    }));
  }

  static async getRfq(id: string): Promise<RfqWithDetails> {
    try {
      const { data: header, error: headerError } = await this.supabase
        .from('procurement_rfqs')
        .select(
          `*,
           created_by_profile:profiles!created_by(full_name),
           source_request:procurement_purchase_requests!source_request_id(request_number)`
        )
        .eq('id', id)
        .single();
      if (headerError) throw headerError;

      const [{ data: items, error: itemsErr }, { data: vendors, error: vendorsErr }] =
        await Promise.all([
          this.supabase
            .from('procurement_rfq_items')
            .select('*')
            .eq('rfq_id', id)
            .order('created_at', { ascending: true }),
          this.supabase
            .from('procurement_rfq_vendors')
            .select('*, supplier:ims_suppliers(id,name,code,email)')
            .eq('rfq_id', id)
            .order('created_at', { ascending: true }),
        ]);
      if (itemsErr) throw itemsErr;
      if (vendorsErr) throw vendorsErr;

      const itemsWithChemicalFlag = await this.attachChemicalFlags(items || []);

      return { ...header, items: itemsWithChemicalFlag, vendors: vendors || [] } as RfqWithDetails;
    } catch (error) {
      console.error('[ProcurementRfqService] getRfq:', error);
      throw error;
    }
  }

  /**
   * Convert a submitted (or legacy approved) purchase request into an RFQ: snapshot
   * its items into procurement_rfq_items and mark the PR 'converted'. Guarded on PR
   * status so a request can't be converted twice. There is no separate PR approval
   * any more — the Super Admin's award approval is the sign-off that commits money.
   */
  static async createFromApprovedPR(requestId: string, userId: string): Promise<ProcurementRfq> {
    try {
      const { data: pr, error: prError } = await this.supabase
        .from('procurement_purchase_requests')
        .select('*, items:procurement_purchase_request_items(*)')
        .eq('id', requestId)
        .single();
      if (prError) throw prError;
      // Already turned into quotations (approval does it automatically; a second
      // tab or click may ask again): hand back the existing one instead of failing.
      if (pr.status === 'converted') {
        const existing = await this.findForRequest(requestId);
        if (existing) return existing;
      }
      if (!CONVERTIBLE_PR_STATUSES.includes(pr.status)) {
        throw new Error(`This request is ${pr.status} and cannot get quotations.`);
      }
      if (!pr.items?.length) throw new Error('The request has no items to quote.');

      const rfqNumber = await this.generateRfqNumber(pr.institution_id);

      const { data: rfq, error: rfqError } = await this.supabase
        .from('procurement_rfqs')
        .insert({
          institution_id: pr.institution_id,
          store_id: pr.store_id ?? null,
          rfq_number: rfqNumber,
          source_request_id: pr.id,
          domain: pr.domain,
          status: 'draft',
          created_by: userId,
        })
        .select()
        .single();
      if (rfqError) throw rfqError;

      const rfqItems = pr.items.map((it: any) => ({
        rfq_id: rfq.id,
        request_item_id: it.id,
        domain_item_id: it.domain_item_id ?? null,
        item_name: it.item_name,
        item_spec: it.item_spec ?? null,
        quantity: it.required_quantity,
        unit_id: it.unit_id ?? null,
        unit_label: it.unit_label ?? null,
      }));
      const { error: itemsErr } = await this.supabase
        .from('procurement_rfq_items')
        .insert(rfqItems);
      if (itemsErr) throw itemsErr;

      // Mark the PR converted (guarded so a concurrent convert can't double-run).
      await this.supabase
        .from('procurement_purchase_requests')
        .update({ status: 'converted', updated_at: new Date().toISOString() })
        .eq('id', pr.id)
        .in('status', CONVERTIBLE_PR_STATUSES);

      return rfq as ProcurementRfq;
    } catch (error) {
      console.error('[ProcurementRfqService] createFromApprovedPR:', error);
      throw error;
    }
  }

  /** The live (not cancelled) quotation raised from a request, newest first. */
  static async findForRequest(requestId: string): Promise<ProcurementRfq | null> {
    const { data, error } = await this.supabase
      .from('procurement_rfqs')
      .select('*')
      .eq('source_request_id', requestId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return (data?.[0] as ProcurementRfq) ?? null;
  }

  /** Attach vendors to an RFQ (idempotent via UNIQUE(rfq_id, supplier_id)). */
  static async addVendors(rfqId: string, supplierIds: string[]): Promise<void> {
    try {
      if (!supplierIds.length) return;
      const rows = supplierIds.map((supplier_id) => ({ rfq_id: rfqId, supplier_id }));
      const { error } = await this.supabase
        .from('procurement_rfq_vendors')
        .upsert(rows, { onConflict: 'rfq_id,supplier_id', ignoreDuplicates: true });
      if (error) throw error;
    } catch (error) {
      console.error('[ProcurementRfqService] addVendors:', error);
      throw error;
    }
  }

  static async removeVendor(rfqVendorId: string): Promise<void> {
    const { error } = await this.supabase
      .from('procurement_rfq_vendors')
      .delete()
      .eq('id', rfqVendorId);
    if (error) throw error;
  }

  /**
   * Store keeper → Super Admin: freeze the chosen vendors and send them for the
   * final approval. Replaces the old submit-for-review → approve → mark-sent chain;
   * the RPC checks at least one line is awarded and locks the quotations.
   */
  static async submitAward(rfqId: string): Promise<ProcurementRfq> {
    const { data, error } = await this.supabase.rpc('procurement_submit_award', { p_rfq_id: rfqId });
    if (error) {
      console.error('[ProcurementRfqService] submitAward:', error);
      throw error;
    }
    return data as ProcurementRfq;
  }

  /**
   * Super Admin approves the award. The RPC creates one APPROVED purchase order per
   * chosen vendor and marks the RFQ awarded, all in one transaction.
   */
  static async approveAward(rfqId: string): Promise<ProcurementPurchaseOrder[]> {
    const { data, error } = await this.supabase.rpc('procurement_approve_award', { p_rfq_id: rfqId });
    if (error) {
      console.error('[ProcurementRfqService] approveAward:', error);
      throw error;
    }
    return (data || []) as ProcurementPurchaseOrder[];
  }

  /** Super Admin returns the award to the store keeper — same RFQ, back to draft. */
  static async sendBackAward(rfqId: string, reason: string): Promise<ProcurementRfq> {
    const { data, error } = await this.supabase.rpc('procurement_send_back_award', {
      p_rfq_id: rfqId,
      p_reason: reason,
    });
    if (error) {
      console.error('[ProcurementRfqService] sendBackAward:', error);
      throw error;
    }
    return data as ProcurementRfq;
  }

  static async cancelRfq(id: string): Promise<ProcurementRfq> {
    const { data, error } = await this.supabase
      .from('procurement_rfqs')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as ProcurementRfq;
  }

  /** Active vendors for this institution (RFQ vendor picker). */
  static async getVendorsForSelect(
    institutionId: string
  ): Promise<
    Array<{ id: string; name: string; code: string; email: string | null; gstin: string | null; phone: string | null }>
  > {
    const { data, error } = await this.supabase
      .from('ims_suppliers')
      .select('id, name, code, email, gstin, phone')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  /** Submitted/approved PRs not yet converted — candidates for RFQ creation. */
  static async getApprovedRequestsForSelect(
    institutionId: string
  ): Promise<Array<{ id: string; request_number: string; item_names: string[] }>> {
    const { data, error } = await this.supabase
      .from('procurement_purchase_requests')
      .select('id, request_number, items:procurement_purchase_request_items(item_name)')
      .eq('institution_id', institutionId)
      .in('status', CONVERTIBLE_PR_STATUSES)
      .order('created_at', { ascending: false });
    if (error) throw error;
    // Item names let the picker tell requests apart — a bare PR number means nothing to the user.
    return (data || []).map((r: any) => ({
      id: r.id,
      request_number: r.request_number,
      item_names: (r.items || []).map((it: { item_name: string | null }) => it.item_name).filter(Boolean),
    }));
  }

  private static async generateRfqNumber(institutionId: string): Promise<string> {
    const today = new Date().toISOString().split('T')[0];
    const { data: nextNum, error } = await this.supabase.rpc('procurement_next_number', {
      p_institution_id: institutionId,
      p_doc_type: 'RFQ',
      p_date: today,
    });
    const yymmdd = today.replace(/-/g, '').slice(2);
    if (error || nextNum == null) {
      console.error('[ProcurementRfqService] generateRfqNumber:', error);
      return `RFQ-${yymmdd}-${String(Date.now()).slice(-5)}`;
    }
    return `RFQ-${yymmdd}-${String(nextNum).padStart(5, '0')}`;
  }
}
