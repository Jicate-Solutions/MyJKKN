// lib/services/ims/indent-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ImsActivityLogService } from './activity-log-service';
import { issueStockToDepartment } from './issue-stock';
import type {
  ImsIndentRequest,
  ImsIndentWithItems,
  ImsIndentFilters,
  CreateImsIndentDto,
} from '@/types/ims';

export class ImsIndentService {
  private static get supabase() {
    // IMS tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * Store/institution joins for supply requests (inter_ and intra_institution).
   *
   * The columns are INVERTED relative to physical goods flow — `source_store_id`
   * is the store that RAISED the request (goods end there) and
   * `destination_store_id` is the store that SUPPLIES it. Aliasing them to
   * `requesting_store` / `supplying_store` un-inverts the semantics at the read
   * layer so the UI can be written the way a human reads it, with no migration.
   *
   * There are THREE foreign keys from ims_indent_requests to ims_stores
   * (store_id, source_store_id, destination_store_id), so every embed must name
   * its constraint — a bare `ims_stores(...)` hint is ambiguous and errors.
   */
  private static readonly SUPPLY_STORE_JOINS = `
    requesting_store:ims_stores!ims_indent_requests_source_store_id_fkey(id,name,code,is_central_supply_store),
    supplying_store:ims_stores!ims_indent_requests_destination_store_id_fkey(id,name,code,is_central_supply_store),
    counterpart_institution:institutions!ims_indent_requests_destination_institution_id_fkey(id,name)
  `;

  /**
   * List indents with department, requested_by joins, search, and pagination.
   */
  static async getIndents(filters: ImsIndentFilters = {}): Promise<{
    data: ImsIndentRequest[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('ims_indent_requests')
        .select(
          `*,
           department:departments(id,department_name),
           requested_by_profile:profiles!requested_by(full_name),
           approved_by_profile:profiles!approved_by(full_name),
           ${ImsIndentService.SUPPLY_STORE_JOINS}`,
          { count: 'exact' }
        );

      // Search on indent_number or purpose
      if (filters.search) {
        query = query.or(
          `indent_number.ilike.%${filters.search}%,purpose.ilike.%${filters.search}%`
        );
      }

      // Status filter
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      // Urgency filter
      if (filters.urgency) {
        query = query.eq('urgency', filters.urgency);
      }

      // Department filter
      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      // Requested by filter
      if (filters.requested_by) {
        query = query.eq('requested_by', filters.requested_by);
      }

      // Primary: store_id; Fallback: institution_id
      if (filters.store_id) {
        query = query.eq('store_id', filters.store_id);
      } else if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      // Cross-store scope filter. `request_scopes` (plural) matches several at
      // once — the transfers screen shows intra_ and inter_institution together.
      if (filters.request_scopes?.length) {
        query = query.in('request_scope', filters.request_scopes);
      } else if (filters.request_scope) {
        query = query.eq('request_scope', filters.request_scope);
      }

      // Source store filter (who raised the request)
      if (filters.source_store_id) {
        query = query.eq('source_store_id', filters.source_store_id);
      }

      // Destination store filter (who should fulfill it)
      if (filters.destination_store_id) {
        query = query.eq('destination_store_id', filters.destination_store_id);
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
        data: (data || []) as ImsIndentRequest[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsIndentService] Error in getIndents:', errDetail, error);
      throw error;
    }
  }

  /**
   * Get a single indent with all items.
   */
  static async getIndent(id: string, institutionId?: string): Promise<ImsIndentWithItems> {
    try {
      let query = this.supabase
        .from('ims_indent_requests')
        .select(
          `*,
           department:departments(id,department_name),
           requested_by_profile:profiles!requested_by(full_name),
           approved_by_profile:profiles!approved_by(full_name),
           ${ImsIndentService.SUPPLY_STORE_JOINS}`
        )
        .eq('id', id);

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data: indent, error: indentError } = await query.single();

      if (indentError) throw indentError;

      // Fetch indent items
      const { data: items, error: itemsError } = await this.supabase
        .from('ims_indent_request_items')
        .select(
          `*,
           item:ims_items(id,name,code),
           unit:ims_units(id,name,abbreviation)`
        )
        .eq('indent_id', id)
        .order('id', { ascending: true });

      if (itemsError) throw itemsError;

      return {
        ...indent,
        items: items || [],
      } as ImsIndentWithItems;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsIndentService] Error in getIndent:', errDetail, error);
      throw error;
    }
  }

  /**
   * Create an indent (header + items).
   *
   * Status routing (Phase D — HOD approval chain):
   * - Department-scoped requesters (lab assistants) enter at
   *   'pending_local_approval' so their HOD (departments.head_of_department_id)
   *   must approve before the store admin sees the request.
   * - Everyone else keeps the original single-step 'pending_approval'.
   */
  static async createIndent(
    data: CreateImsIndentDto,
    userId: string,
    opts?: { requiresHodApproval?: boolean }
  ): Promise<ImsIndentRequest> {
    try {
      const indentNumber = await this.generateIndentNumber(data.institution_id, data.store_id);
      const initialStatus = opts?.requiresHodApproval
        ? 'pending_local_approval'
        : 'pending_approval';

      // Insert indent header
      const { data: indent, error: indentError } = await this.supabase
        .from('ims_indent_requests')
        .insert({
          indent_number: indentNumber,
          department_id: data.department_id || null,
          requested_by: userId,
          required_date: data.required_date || null,
          purpose: data.purpose,
          urgency: data.urgency,
          is_emergency: data.is_emergency || false,
          emergency_reason: data.emergency_reason || null,
          status: initialStatus,
          institution_id: data.institution_id,
          ...(data.store_id ? { store_id: data.store_id } : {}),
          request_scope: data.request_scope ?? 'internal',
          ...(data.source_store_id ? { source_store_id: data.source_store_id } : {}),
          ...(data.destination_institution_id ? { destination_institution_id: data.destination_institution_id } : {}),
          ...(data.destination_store_id ? { destination_store_id: data.destination_store_id } : {}),
        })
        .select()
        .single();

      if (indentError) throw indentError;

      // Insert indent items
      const indentItems = data.items.map((item) => ({
        indent_id: indent.id,
        item_id: item.item_id,
        quantity: item.quantity,
        unit_id: item.unit_id,
        issued_quantity: 0,
        notes: item.notes || null,
      }));

      const { error: itemsError } = await this.supabase
        .from('ims_indent_request_items')
        .insert(indentItems);

      if (itemsError) throw itemsError;

      // Phase F: log to activity trail (non-fatal on failure)
      await ImsActivityLogService.log({
        entityType: 'indent',
        entityId: indent.id,
        institutionId: data.institution_id,
        action: 'raised',
        actorId: userId,
        notes: data.purpose,
        metadata: { indent_number: indentNumber, item_count: indentItems.length },
      });

      return indent as ImsIndentRequest;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsIndentService] Error in createIndent:', errDetail, error);
      throw error;
    }
  }

  /**
   * Update an editable indent (header + items). Only allowed while the indent is
   * still a draft or awaiting approval — once it moves past approval, edits are
   * blocked so an approved request can't be silently changed.
   *
   * Items are replaced wholesale (delete + re-insert): the edit form always
   * submits the full item set, and none have been issued yet at this stage.
   * Department/institution scoping is enforced by RLS on both tables, so a
   * department-scoped user can only edit their own department's indents.
   */
  static async updateIndent(
    id: string,
    data: Omit<
      CreateImsIndentDto,
      | 'institution_id'
      | 'store_id'
      | 'request_scope'
      | 'source_store_id'
      | 'destination_institution_id'
      | 'destination_store_id'
    >,
    userId: string
  ): Promise<ImsIndentRequest> {
    try {
      // Guard: only draft / pending_approval indents are editable.
      const { data: existing, error: fetchError } = await this.supabase
        .from('ims_indent_requests')
        .select('status')
        .eq('id', id)
        .single();
      if (fetchError) throw fetchError;
      if (!existing || !['draft', 'pending_approval'].includes(existing.status)) {
        throw new Error('This indent can no longer be edited (already processed).');
      }

      // Update header
      const { data: indent, error: headerError } = await this.supabase
        .from('ims_indent_requests')
        .update({
          department_id: data.department_id || null,
          required_date: data.required_date || null,
          purpose: data.purpose,
          urgency: data.urgency,
          is_emergency: data.is_emergency || false,
          emergency_reason: data.is_emergency ? data.emergency_reason || null : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      if (headerError) throw headerError;

      // Replace items (none issued yet at draft/pending_approval)
      const { error: delError } = await this.supabase
        .from('ims_indent_request_items')
        .delete()
        .eq('indent_id', id);
      if (delError) throw delError;

      const newItems = data.items.map((item) => ({
        indent_id: id,
        item_id: item.item_id,
        quantity: item.quantity,
        unit_id: item.unit_id,
        issued_quantity: 0,
        notes: item.notes || null,
      }));
      const { error: itemsError } = await this.supabase
        .from('ims_indent_request_items')
        .insert(newItems);
      if (itemsError) throw itemsError;

      // NOTE: no activity-trail entry here — ImsActivityAction has no 'updated'
      // action, and editing only happens pre-approval, so the 'raised' event
      // already anchors the audit timeline.
      void userId;

      return indent as ImsIndentRequest;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsIndentService] Error in updateIndent:', errDetail, error);
      throw error;
    }
  }

  /**
   * Approve an indent.
   */
  static async approveIndent(
    id: string,
    userId: string,
    notes?: string
  ): Promise<ImsIndentRequest> {
    try {
      const { data, error } = await this.supabase
        .from('ims_indent_requests')
        .update({
          status: 'approved',
          approved_by: userId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Phase F: log to activity trail
      await ImsActivityLogService.log({
        entityType: 'indent',
        entityId: id,
        institutionId: data.institution_id,
        action: 'approved',
        actorId: userId,
        notes: notes ?? null,
      });

      return data as ImsIndentRequest;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsIndentService] Error in approveIndent:', errDetail, error);
      throw error;
    }
  }

  /**
   * Reject an indent with a REQUIRED reason (Phase F: rejection accountability).
   * Uses the new dedicated rejected_by + rejected_at columns rather than
   * overwriting approved_by/approved_at (which previously conflated the two).
   */
  static async rejectIndent(
    id: string,
    userId: string,
    reason: string
  ): Promise<ImsIndentRequest> {
    // Phase F: rejection reason is required for accountability
    if (!reason || !reason.trim()) {
      throw new Error('Rejection reason is required');
    }

    try {
      const { data, error } = await this.supabase
        .from('ims_indent_requests')
        .update({
          status: 'rejected',
          rejected_by: userId,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Phase F: log to activity trail with mandatory reason
      await ImsActivityLogService.log({
        entityType: 'indent',
        entityId: id,
        institutionId: data.institution_id,
        action: 'rejected',
        actorId: userId,
        notes: reason,
      });

      return data as ImsIndentRequest;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsIndentService] Error in rejectIndent:', errDetail, error);
      throw error;
    }
  }

  /**
   * Local (branch) approval for inter-institution requests.
   * Transitions: pending_local_approval → pending_approval
   */
  static async localApproveIndent(id: string, userId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('ims_indent_requests')
        .update({
          status: 'pending_approval',
          local_approved_by: userId,
          local_approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'pending_local_approval');   // guard: only from this status

      if (error) throw error;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsIndentService] Error in localApproveIndent:', errDetail, error);
      throw error;
    }
  }

  /**
   * HOD approval queue (Phase D): indents awaiting HOD approval for every
   * department the given user heads. Resolution is fully dynamic — driven by
   * departments.head_of_department_id, never a hardcoded mapping — so a HOD
   * change is a single column update with no code deploy.
   *
   * Returns [] fast when the user heads no departments (page renders its
   * empty state rather than leaking other departments' requests).
   */
  static async getHodPendingIndents(
    hodUserId: string
  ): Promise<ImsIndentRequest[]> {
    try {
      const { data: headedDepts, error: deptError } = await this.supabase
        .from('departments')
        .select('id')
        .eq('head_of_department_id', hodUserId);

      if (deptError) throw deptError;
      const deptIds = (headedDepts ?? []).map((d: { id: string }) => d.id);
      if (deptIds.length === 0) return [];

      const { data, error } = await this.supabase
        .from('ims_indent_requests')
        .select(
          `*,
           department:departments(id,department_name),
           requested_by_profile:profiles!requested_by(full_name)`
        )
        .eq('status', 'pending_local_approval')
        .in('department_id', deptIds)
        .order('created_at', { ascending: true }); // oldest request first

      if (error) throw error;
      return (data ?? []) as ImsIndentRequest[];
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsIndentService] Error in getHodPendingIndents:', errDetail, error);
      throw error;
    }
  }

  /**
   * Issue a specific quantity for an indent item.
   * Decrements ims_stock_summary and logs an ims_stock_issues audit row so the
   * Items page balance and Department Stock page both reflect the issue.
   */
  static async issueItem(
    indentItemId: string,
    quantity: number,
    userId: string
  ): Promise<void> {
    try {
      // Get current item to calculate new issued quantity
      const { data: item, error: fetchError } = await this.supabase
        .from('ims_indent_request_items')
        .select('issued_quantity, quantity, indent_id, item_id, unit_id')
        .eq('id', indentItemId)
        .single();

      if (fetchError || !item) throw fetchError || new Error('Indent item not found');

      // Verify parent indent is approved
      const { data: indent } = await this.supabase
        .from('ims_indent_requests')
        .select('status, department_id, institution_id, store_id')
        .eq('id', item.indent_id)
        .single();

      if (!indent || !['approved', 'partially_issued'].includes(indent.status)) {
        throw new Error('Cannot issue items: indent is not in approved status');
      }

      const newIssuedQty = (item.issued_quantity || 0) + quantity;

      if (newIssuedQty > item.quantity) {
        throw new Error(
          `Cannot issue ${quantity} units. Exceeds requested quantity of ${item.quantity} (already issued: ${item.issued_quantity || 0})`
        );
      }

      // Decrement store stock + write the ims_stock_issues audit row. Shared
      // with the direct department issue so the two flows can't drift apart.
      await issueStockToDepartment({
        item_id: item.item_id,
        unit_id: item.unit_id,
        quantity,
        department_id: indent.department_id,
        issued_by: userId,
        indent_id: item.indent_id,
        store_id: indent.store_id,
        institution_id: indent.institution_id,
      });

      const { error } = await this.supabase
        .from('ims_indent_request_items')
        .update({ issued_quantity: newIssuedQty })
        .eq('id', indentItemId);

      if (error) throw error;

      // Roll the header status up from the items' fulfillment state — the UI's
      // isApproved check already expects a 'partially_issued' status mid-flow.
      const { data: siblings, error: siblingsErr } = await this.supabase
        .from('ims_indent_request_items')
        .select('quantity, issued_quantity')
        .eq('indent_id', item.indent_id);
      if (siblingsErr) throw siblingsErr;

      const allIssued = (siblings || []).every(
        (i: any) => Number(i.issued_quantity || 0) >= Number(i.quantity)
      );
      const anyIssued = (siblings || []).some((i: any) => Number(i.issued_quantity || 0) > 0);
      const newStatus = allIssued ? 'issued' : anyIssued ? 'partially_issued' : indent.status;

      if (newStatus !== indent.status) {
        const { error: statusErr } = await this.supabase
          .from('ims_indent_requests')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', item.indent_id);
        if (statusErr) throw statusErr;
      }
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsIndentService] Error in issueItem:', errDetail, error);
      throw error;
    }
  }

  /**
   * Mark an indent as fully issued.
   *
   * STATUS ONLY — this moves no stock and writes no audit row. It is the final
   * step after every line has already been issued through issueItem(), which is
   * what actually decrements ims_stock_summary.
   *
   * The UI only offers "Mark All Issued" once every line is fully issued, but
   * that gate lives in the page. Re-check it here so the invariant is real: a
   * caller that reached this another way must not be able to stamp an indent
   * 'issued' while its stock is still on the shelf. That would look exactly like
   * the "issued but stock never decreased" bug this module keeps being reported
   * for, while leaving no audit trail to explain it.
   */
  static async markAsIssued(id: string): Promise<ImsIndentRequest> {
    try {
      const { data: items, error: itemsError } = await this.supabase
        .from('ims_indent_request_items')
        .select('quantity, issued_quantity')
        .eq('indent_id', id);

      if (itemsError) throw itemsError;
      if (!items || items.length === 0) {
        throw new Error('Cannot mark as issued: this indent has no items');
      }

      const outstanding = (items as any[]).filter(
        (i) => Number(i.issued_quantity || 0) < Number(i.quantity)
      );
      if (outstanding.length > 0) {
        throw new Error(
          `Cannot mark as issued: ${outstanding.length} item(s) have not been fully issued yet. ` +
            'Issue them first so store stock is decremented.'
        );
      }

      const { data, error } = await this.supabase
        .from('ims_indent_requests')
        .update({
          status: 'issued',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as ImsIndentRequest;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsIndentService] Error in markAsIssued:', errDetail, error);
      throw error;
    }
  }

  /**
   * Confirm delivery of an indent.
   */
  static async confirmDelivery(id: string): Promise<ImsIndentRequest> {
    try {
      const { data, error } = await this.supabase
        .from('ims_indent_requests')
        .update({
          status: 'delivered',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as ImsIndentRequest;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsIndentService] Error in confirmDelivery:', errDetail, error);
      throw error;
    }
  }

  /**
   * Cancel an indent.
   */
  static async cancelIndent(id: string): Promise<ImsIndentRequest> {
    try {
      const { data, error } = await this.supabase
        .from('ims_indent_requests')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as ImsIndentRequest;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsIndentService] Error in cancelIndent:', errDetail, error);
      throw error;
    }
  }

  /**
   * Get all indents with pending_approval status.
   */
  static async getPendingIndents(filters: ImsIndentFilters = {}): Promise<{
    data: ImsIndentRequest[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    return this.getIndents({ ...filters, status: 'pending_approval' });
  }

  /**
   * Generate the next sequential indent number.
   * Format: IND-YYMMDD-XXXXX (e.g., IND-260226-00001)
   *
   * Uses atomic counter (ims_next_indent_number RPC) when storeId is available,
   * preventing duplicate numbers under concurrent usage.
   * Falls back to timestamp-based number for legacy paths without storeId.
   */
  private static async generateIndentNumber(institution_id: string, storeId?: string): Promise<string> {
    try {
      if (!storeId) {
        // Fallback for no storeId: use timestamp-based number
        const today = new Date();
        const yymmdd = today.toISOString().slice(2, 10).replace(/-/g, '');
        return `IND-${yymmdd}-${String(Date.now()).slice(-5)}`;
      }
      const today = new Date().toISOString().split('T')[0];
      const { data: nextNum, error } = await this.supabase.rpc('ims_next_indent_number', {
        p_store_id: storeId,
        p_date: today,
      });
      if (error || nextNum == null) throw error || new Error('No counter returned');
      const yymmdd = today.replace(/-/g, '').slice(2); // YYMMDD
      return `IND-${yymmdd}-${String(nextNum).padStart(5, '0')}`;
    } catch (error) {
      console.error('[ImsIndentService] Error generating indent number:', error);
      const yymmdd = new Date().toISOString().slice(2, 10).replace(/-/g, '');
      return `IND-${yymmdd}-${String(Date.now()).slice(-5)}`;
    }
  }
}
