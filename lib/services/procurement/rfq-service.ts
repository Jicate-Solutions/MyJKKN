// lib/services/procurement/rfq-service.ts
//
// Request for Quotation service (PRD steps 3-4). Converts an APPROVED purchase
// request into an RFQ (snapshotting its items), attaches vendors, and issues the
// Purchase Requirement List. Numbering uses procurement_next_number (doc_type 'RFQ').

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ProcurementRfq,
  RfqWithDetails,
  RfqFilters,
} from '@/types/procurement';

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
           vendors:procurement_rfq_vendors(count)`,
          { count: 'exact' }
        );

      if (filters.search) {
        // Match either the RFQ's own number or the source purchase request's
        // number, since users often search by the PR they're looking to convert.
        const { data: matchingPRs } = await this.supabase
          .from('procurement_purchase_requests')
          .select('id')
          .ilike('request_number', `%${filters.search}%`);
        const prIds = (matchingPRs || []).map((r: { id: string }) => r.id);

        const orClause = prIds.length
          ? `rfq_number.ilike.%${filters.search}%,source_request_id.in.(${prIds.join(',')})`
          : `rfq_number.ilike.%${filters.search}%`;
        query = query.or(orClause);
      }
      if (filters.status) query = query.eq('status', filters.status);
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
   * Convert an APPROVED purchase request into an RFQ: snapshot its items into
   * procurement_rfq_items and mark the PR 'converted'. Guarded on PR status so a
   * request can't be converted twice or before approval.
   */
  static async createFromApprovedPR(requestId: string, userId: string): Promise<ProcurementRfq> {
    try {
      const { data: pr, error: prError } = await this.supabase
        .from('procurement_purchase_requests')
        .select('*, items:procurement_purchase_request_items(*)')
        .eq('id', requestId)
        .single();
      if (prError) throw prError;
      if (pr.status !== 'approved') {
        throw new Error(`Only an approved request can become an RFQ (current: ${pr.status}).`);
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
        .eq('status', 'approved');

      return rfq as ProcurementRfq;
    } catch (error) {
      console.error('[ProcurementRfqService] createFromApprovedPR:', error);
      throw error;
    }
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
   * draft|rejected -> pending_review: the creator submits the RFQ for Super-Admin
   * review. Guarded so only an editable RFQ can enter review.
   */
  static async submitForReview(rfqId: string): Promise<ProcurementRfq> {
    try {
      const { data, error } = await this.supabase
        .from('procurement_rfqs')
        .update({ status: 'pending_review', updated_at: new Date().toISOString() })
        .eq('id', rfqId)
        .in('status', ['draft', 'rejected'])
        .select()
        .single();
      if (error) throw error;
      if (!data) throw new Error('RFQ is not in a draft/rejected state; refresh and retry.');
      return data as ProcurementRfq;
    } catch (error) {
      console.error('[ProcurementRfqService] submitForReview:', error);
      throw error;
    }
  }

  /** pending_review -> approved: reviewer clears the RFQ to be sent to vendors. */
  static async approveRfq(rfqId: string, reviewerId: string): Promise<ProcurementRfq> {
    try {
      const now = new Date().toISOString();
      const { data, error } = await this.supabase
        .from('procurement_rfqs')
        .update({
          status: 'approved',
          reviewed_by: reviewerId,
          reviewed_at: now,
          review_notes: null,
          updated_at: now,
        })
        .eq('id', rfqId)
        .eq('status', 'pending_review')
        .select()
        .single();
      if (error) throw error;
      if (!data) throw new Error('RFQ is not awaiting review; refresh and retry.');
      return data as ProcurementRfq;
    } catch (error) {
      console.error('[ProcurementRfqService] approveRfq:', error);
      throw error;
    }
  }

  /** pending_review -> rejected: reviewer returns the RFQ to the creator with a reason. */
  static async rejectRfq(rfqId: string, reviewerId: string, notes: string): Promise<ProcurementRfq> {
    try {
      const now = new Date().toISOString();
      const { data, error } = await this.supabase
        .from('procurement_rfqs')
        .update({
          status: 'rejected',
          reviewed_by: reviewerId,
          reviewed_at: now,
          review_notes: notes?.trim() || null,
          updated_at: now,
        })
        .eq('id', rfqId)
        .eq('status', 'pending_review')
        .select()
        .single();
      if (error) throw error;
      if (!data) throw new Error('RFQ is not awaiting review; refresh and retry.');
      return data as ProcurementRfq;
    } catch (error) {
      console.error('[ProcurementRfqService] rejectRfq:', error);
      throw error;
    }
  }

  /** approved -> sent: stamp sent_at on the RFQ and its vendor rows. */
  static async markSent(rfqId: string): Promise<ProcurementRfq> {
    try {
      const now = new Date().toISOString();
      const { data, error } = await this.supabase
        .from('procurement_rfqs')
        .update({ status: 'sent', sent_at: now, updated_at: now })
        .eq('id', rfqId)
        .eq('status', 'approved')
        .select()
        .single();
      if (error) throw error;
      if (!data) throw new Error('RFQ must be approved before it can be sent; refresh and retry.');

      await this.supabase
        .from('procurement_rfq_vendors')
        .update({ sent_at: now })
        .eq('rfq_id', rfqId)
        .is('sent_at', null);

      return data as ProcurementRfq;
    } catch (error) {
      console.error('[ProcurementRfqService] markSent:', error);
      throw error;
    }
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
  ): Promise<Array<{ id: string; name: string; code: string; email: string | null }>> {
    const { data, error } = await this.supabase
      .from('ims_suppliers')
      .select('id, name, code, email')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  /** Approved PRs not yet converted — candidates for RFQ creation. */
  static async getApprovedRequestsForSelect(
    institutionId: string
  ): Promise<Array<{ id: string; request_number: string }>> {
    const { data, error } = await this.supabase
      .from('procurement_purchase_requests')
      .select('id, request_number')
      .eq('institution_id', institutionId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
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
