// lib/services/ims/indent-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
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
           approved_by_profile:profiles!approved_by(full_name)`,
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
           approved_by_profile:profiles!approved_by(full_name)`
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
   * Create an indent (header + items) in pending_approval status.
   */
  static async createIndent(
    data: CreateImsIndentDto,
    userId: string
  ): Promise<ImsIndentRequest> {
    try {
      const indentNumber = await this.generateIndentNumber(data.institution_id, data.store_id);

      // Insert indent header
      const { data: indent, error: indentError } = await this.supabase
        .from('ims_indent_requests')
        .insert({
          indent_number: indentNumber,
          department_id: data.department_id,
          requested_by: userId,
          required_date: data.required_date || null,
          purpose: data.purpose,
          urgency: data.urgency,
          is_emergency: data.is_emergency || false,
          emergency_reason: data.emergency_reason || null,
          status: 'pending_approval',
          institution_id: data.institution_id,
          ...(data.store_id ? { store_id: data.store_id } : {}),
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

      return indent as ImsIndentRequest;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsIndentService] Error in createIndent:', errDetail, error);
      throw error;
    }
  }

  /**
   * Approve an indent.
   */
  static async approveIndent(
    id: string,
    userId: string
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

      return data as ImsIndentRequest;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsIndentService] Error in approveIndent:', errDetail, error);
      throw error;
    }
  }

  /**
   * Reject an indent with a reason.
   */
  static async rejectIndent(
    id: string,
    userId: string,
    reason: string
  ): Promise<ImsIndentRequest> {
    try {
      const { data, error } = await this.supabase
        .from('ims_indent_requests')
        .update({
          status: 'rejected',
          approved_by: userId,
          approved_at: new Date().toISOString(),
          rejection_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as ImsIndentRequest;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsIndentService] Error in rejectIndent:', errDetail, error);
      throw error;
    }
  }

  /**
   * Issue a specific quantity for an indent item.
   */
  static async issueItem(
    indentItemId: string,
    quantity: number
  ): Promise<void> {
    try {
      // Get current item to calculate new issued quantity
      const { data: item, error: fetchError } = await this.supabase
        .from('ims_indent_request_items')
        .select('issued_quantity, quantity, indent_id')
        .eq('id', indentItemId)
        .single();

      if (fetchError || !item) throw fetchError || new Error('Indent item not found');

      // Verify parent indent is approved
      const { data: indent } = await this.supabase
        .from('ims_indent_requests')
        .select('status')
        .eq('id', item.indent_id)
        .single();

      if (!indent || indent.status !== 'approved') {
        throw new Error('Cannot issue items: indent is not in approved status');
      }

      const newIssuedQty = (item.issued_quantity || 0) + quantity;

      if (newIssuedQty > item.quantity) {
        throw new Error(
          `Cannot issue ${quantity} units. Exceeds requested quantity of ${item.quantity} (already issued: ${item.issued_quantity || 0})`
        );
      }

      const { error } = await this.supabase
        .from('ims_indent_request_items')
        .update({ issued_quantity: newIssuedQty })
        .eq('id', indentItemId);

      if (error) throw error;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsIndentService] Error in issueItem:', errDetail, error);
      throw error;
    }
  }

  /**
   * Mark an indent as fully issued.
   */
  static async markAsIssued(id: string): Promise<ImsIndentRequest> {
    try {
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
