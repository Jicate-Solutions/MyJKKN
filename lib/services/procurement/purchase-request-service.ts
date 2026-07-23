// lib/services/procurement/purchase-request-service.ts
//
// Purchase Request service (PRD steps 1-2). PR and "Requisition" are one entity
// across a status lifecycle: draft -> submitted -> approved/rejected -> converted.
// Numbering uses the shared procurement_next_number RPC (doc_type 'PR').

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ProcurementPurchaseRequest,
  PurchaseRequestWithItems,
  PurchaseRequestFilters,
  CreatePurchaseRequestDto,
  PurchaseRequestType,
} from '@/types/procurement';

export class ProcurementPurchaseRequestService {
  private static get supabase() {
    // procurement_* tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /** List purchase requests with requester join, filtering, pagination. */
  static async getPurchaseRequests(filters: PurchaseRequestFilters = {}): Promise<{
    data: ProcurementPurchaseRequest[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('procurement_purchase_requests')
        .select(
          `*,
           requested_by_profile:profiles!requested_by(full_name),
           approved_by_profile:profiles!approved_by(full_name),
           items:procurement_purchase_request_items(count)`,
          { count: 'exact' }
        );

      if (filters.search) query = query.ilike('request_number', `%${filters.search}%`);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.request_type) query = query.eq('request_type', filters.request_type);
      if (filters.store_id) query = query.eq('store_id', filters.store_id);
      else if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);

      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const from = (page - 1) * limit;
      query = query.range(from, from + limit - 1).order('created_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;

      // Flatten the aggregate count Supabase returns as items:[{count}].
      const rows = (data || []).map((r: any) => ({
        ...r,
        item_count: Array.isArray(r.items) ? r.items[0]?.count ?? 0 : 0,
      }));

      return {
        data: rows as ProcurementPurchaseRequest[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[ProcurementPurchaseRequestService] getPurchaseRequests:', error);
      throw error;
    }
  }

  /** Single purchase request with its line items. */
  static async getPurchaseRequest(id: string): Promise<PurchaseRequestWithItems> {
    try {
      const { data: header, error: headerError } = await this.supabase
        .from('procurement_purchase_requests')
        .select(
          `*,
           requested_by_profile:profiles!requested_by(full_name),
           approved_by_profile:profiles!approved_by(full_name)`
        )
        .eq('id', id)
        .single();
      if (headerError) throw headerError;

      const { data: items, error: itemsError } = await this.supabase
        .from('procurement_purchase_request_items')
        .select('*')
        .eq('request_id', id)
        .order('created_at', { ascending: true });
      if (itemsError) throw itemsError;

      return { ...header, items: items || [] } as PurchaseRequestWithItems;
    } catch (error) {
      console.error('[ProcurementPurchaseRequestService] getPurchaseRequest:', error);
      throw error;
    }
  }

  /**
   * Create a PR (header + items) in 'draft'. Each line independently is either a
   * restock (domain_item_id set) or a new item (domain_item_id null) — a single PR
   * can freely mix both, e.g. several Chemicals lines where some are catalogued and
   * some aren't. New-item lines MUST carry a reason (PRD step 1 mandatory field),
   * checked per line rather than gated by a request-wide type. The header
   * request_type is a derived summary ('restock' | 'new_item' | 'mixed'), not
   * something the caller chooses.
   */
  static async createPurchaseRequest(
    data: CreatePurchaseRequestDto,
    userId: string
  ): Promise<ProcurementPurchaseRequest> {
    try {
      if (!data.items?.length) {
        throw new Error('A purchase request must have at least one item.');
      }
      const missingReason = data.items.find((i) => !i.domain_item_id && !i.reason?.trim());
      if (missingReason) {
        throw new Error(
          `New-item lines require a reason (missing on "${missingReason.item_name}").`
        );
      }

      const hasRestock = data.items.some((i) => !!i.domain_item_id);
      const hasNewItem = data.items.some((i) => !i.domain_item_id);
      const requestType: PurchaseRequestType =
        hasRestock && hasNewItem ? 'mixed' : hasNewItem ? 'new_item' : 'restock';

      const requestNumber = await this.generateRequestNumber(data.institution_id);

      const { data: header, error: headerError } = await this.supabase
        .from('procurement_purchase_requests')
        .insert({
          institution_id: data.institution_id,
          store_id: data.store_id ?? null,
          request_number: requestNumber,
          domain: data.domain ?? 'ims',
          request_type: requestType,
          status: 'draft',
          requested_by: userId,
          notes: data.notes ?? null,
        })
        .select()
        .single();
      if (headerError) throw headerError;

      const itemRows = data.items.map((i) => ({
        request_id: header.id,
        domain_item_id: i.domain_item_id ?? null,
        item_name: i.item_name,
        item_spec: i.item_spec ?? null,
        required_quantity: i.required_quantity,
        unit_id: i.unit_id ?? null,
        unit_label: i.unit_label ?? null,
        reason: i.reason ?? null,
        current_stock: i.current_stock ?? null,
        reorder_level: i.reorder_level ?? null,
        estimated_cost: i.estimated_cost ?? null,
      }));
      const { error: itemsError } = await this.supabase
        .from('procurement_purchase_request_items')
        .insert(itemRows);
      if (itemsError) throw itemsError;

      return header as ProcurementPurchaseRequest;
    } catch (error) {
      console.error('[ProcurementPurchaseRequestService] createPurchaseRequest:', error);
      throw error;
    }
  }

  /** draft -> submitted (Store Admin files the requisition). */
  static async submitPurchaseRequest(id: string): Promise<ProcurementPurchaseRequest> {
    return this.transition(id, 'draft', {
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    });
  }

  /** submitted -> approved (Super Admin). */
  static async approvePurchaseRequest(id: string, userId: string): Promise<ProcurementPurchaseRequest> {
    return this.transition(id, 'submitted', {
      status: 'approved',
      approved_by: userId,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    });
  }

  /** submitted -> rejected (reason required). */
  static async rejectPurchaseRequest(
    id: string,
    userId: string,
    reason: string
  ): Promise<ProcurementPurchaseRequest> {
    if (!reason?.trim()) throw new Error('A rejection reason is required.');
    return this.transition(id, 'submitted', {
      status: 'rejected',
      approved_by: userId,
      approved_at: new Date().toISOString(),
      rejection_reason: reason,
    });
  }

  /**
   * submitted -> approved, with optional quantity corrections. Persists any changed
   * required_quantity values first (recording original_quantity/quantity_modified_by/at
   * per item, plus a human-readable diff appended to `notes`), then approves via the
   * normal guarded transition.
   */
  static async approveWithModifications(
    id: string,
    userId: string,
    itemUpdates: { itemId: string; required_quantity: number }[]
  ): Promise<ProcurementPurchaseRequest> {
    try {
      if (itemUpdates.length > 0) {
        const { data: currentItems, error: itemsErr } = await this.supabase
          .from('procurement_purchase_request_items')
          .select('id, item_name, unit_label, required_quantity')
          .in('id', itemUpdates.map((u) => u.itemId))
          .eq('request_id', id);
        if (itemsErr) throw itemsErr;

        const changes: string[] = [];
        for (const u of itemUpdates) {
          if (!(u.required_quantity > 0)) throw new Error('Quantity must be greater than 0.');
          const before = currentItems?.find((i: any) => i.id === u.itemId);
          const isChanged = !!before && Number(before.required_quantity) !== u.required_quantity;
          if (isChanged) {
            changes.push(
              `${before.item_name} ${before.required_quantity}${before.unit_label || ''} → ${u.required_quantity}${before.unit_label || ''}`
            );
          }
          const update: Record<string, unknown> = { required_quantity: u.required_quantity };
          if (isChanged) {
            update.original_quantity = before.required_quantity;
            update.quantity_modified_by = userId;
            update.quantity_modified_at = new Date().toISOString();
          }
          const { error } = await this.supabase
            .from('procurement_purchase_request_items')
            .update(update)
            .eq('id', u.itemId)
            .eq('request_id', id);
          if (error) throw error;
        }

        if (changes.length > 0) {
          const { data: pr } = await this.supabase
            .from('procurement_purchase_requests')
            .select('notes')
            .eq('id', id)
            .single();
          const note = `Qty modified at approval: ${changes.join('; ')}`;
          await this.supabase
            .from('procurement_purchase_requests')
            .update({ notes: pr?.notes ? `${pr.notes}\n${note}` : note })
            .eq('id', id);
        }
      }

      return this.transition(id, 'submitted', {
        status: 'approved',
        approved_by: userId,
        approved_at: new Date().toISOString(),
        rejection_reason: null,
      });
    } catch (error) {
      console.error('[ProcurementPurchaseRequestService] approveWithModifications:', error);
      throw error;
    }
  }

  static async cancelPurchaseRequest(id: string): Promise<ProcurementPurchaseRequest> {
    try {
      const { data, error } = await this.supabase
        .from('procurement_purchase_requests')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as ProcurementPurchaseRequest;
    } catch (error) {
      console.error('[ProcurementPurchaseRequestService] cancelPurchaseRequest:', error);
      throw error;
    }
  }

  /**
   * Guarded status transition: only flips if the row is currently in `fromStatus`,
   * so a double-click or stale UI can't skip a step (e.g. approve an already-rejected
   * request). The `.eq('status', fromStatus)` in the UPDATE is the concurrency guard.
   */
  private static async transition(
    id: string,
    fromStatus: string,
    patch: Record<string, unknown>
  ): Promise<ProcurementPurchaseRequest> {
    try {
      const { data, error } = await this.supabase
        .from('procurement_purchase_requests')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', fromStatus)
        .select()
        .single();
      if (error) throw error;
      if (!data) {
        throw new Error(`Purchase request is not in "${fromStatus}" state; refresh and retry.`);
      }
      return data as ProcurementPurchaseRequest;
    } catch (error) {
      console.error('[ProcurementPurchaseRequestService] transition:', error);
      throw error;
    }
  }

  /**
   * Next PR number via the atomic procurement_next_number RPC.
   * Format: PR-YYMMDD-XXXXX (e.g. PR-260708-00001).
   */
  private static async generateRequestNumber(institutionId: string): Promise<string> {
    const today = new Date().toISOString().split('T')[0];
    const { data: nextNum, error } = await this.supabase.rpc('procurement_next_number', {
      p_institution_id: institutionId,
      p_doc_type: 'PR',
      p_date: today,
    });
    if (error || nextNum == null) {
      console.error('[ProcurementPurchaseRequestService] generateRequestNumber:', error);
      // Fallback keeps creation working even if the counter RPC hiccups.
      const yymmdd = today.replace(/-/g, '').slice(2);
      return `PR-${yymmdd}-${String(Date.now()).slice(-5)}`;
    }
    const yymmdd = today.replace(/-/g, '').slice(2);
    return `PR-${yymmdd}-${String(nextNum).padStart(5, '0')}`;
  }
}
