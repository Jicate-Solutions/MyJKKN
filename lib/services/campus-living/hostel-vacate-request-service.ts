import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';
import {
  detectVacancyOnVacate,
  notifyUpgradePool,
} from '@/lib/services/campus-living/premium-vacancy-service';
import type {
  HostelVacateRequest,
  HostelVacateRequestWithContext,
  HostelClearanceItem,
  HostelVacateDocument,
  CreateVacateRequestDTO,
  VacateRequestFilters,
  VacateBillStatus,
} from '@/types/hostel-vacate';

const LOG = 'campus-living/vacate';

/** Supabase errors are plain objects: log the raw one, throw a real Error the toast can read. */
function fail(context: string, error: unknown): never {
  logger.error(LOG, context, error);
  throw new Error(getErrorMessage(error));
}

/**
 * Hostel vacate workflow (2026-09-30).
 *
 * draft -> pending_warden -> completed | rejected | cancelled.
 *
 * Every state change is a SECURITY DEFINER RPC that re-checks permission, scope,
 * the bill gate and the required checklist items in the database — nothing here
 * decides whether a request may advance. Approval auto-vacates: allocation
 * vacated + bed freed, learner moved to Day Scholar, hostel/mess categories
 * cleared (fn_cl_vacate_warden_approve).
 */
export class HostelVacateRequestService {
  // ════════════════════════════════════════════════════════════════════
  // READ
  // ════════════════════════════════════════════════════════════════════

  static async getRequests(
    institutionId: string | undefined,
    filters?: VacateRequestFilters,
    page = 1,
    pageSize = 50
  ) {
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('hostel_vacate_requests')
      .select(
        `*,
         allocation:hostel_allocations!hostel_vacate_requests_allocation_id_fkey(id, block_id, room_id, bed_id),
         resident:hostel_residents!hostel_vacate_requests_resident_id_fkey(id, profile_id, resident_type),
         learner_profile:profiles!hostel_vacate_requests_learner_id_fkey(id, full_name, email)`,
        { count: 'exact' }
      );

    // Empty/undefined institutionId = super-admin view (no filter); .eq(col, '')
    // would be rejected by Postgres as an invalid uuid.
    if (institutionId) query = query.eq('institution_id', institutionId);

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.resident_type) query = query.eq('resident_type', filters.resident_type);
    if (filters?.reason_type) query = query.eq('reason_type', filters.reason_type);
    if (filters?.allocation_id) query = query.eq('allocation_id', filters.allocation_id);
    if (filters?.submitted_by_id) query = query.eq('submitted_by_id', filters.submitted_by_id);

    const from = (page - 1) * pageSize;
    query = query
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, from + pageSize - 1);

    const { data, error, count } = await query;
    if (error) fail('Failed to fetch vacate requests', error);
    return {
      data: (data ?? []) as unknown as HostelVacateRequestWithContext[],
      count: count ?? 0,
    };
  }

  static async getRequest(id: string): Promise<HostelVacateRequestWithContext> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_vacate_requests')
      .select(
        `*,
         allocation:hostel_allocations!hostel_vacate_requests_allocation_id_fkey(id, block_id, room_id, bed_id),
         resident:hostel_residents!hostel_vacate_requests_resident_id_fkey(id, profile_id, resident_type),
         learner_profile:profiles!hostel_vacate_requests_learner_id_fkey(id, full_name, email),
         documents:hostel_vacate_documents(*),
         clearance_items:hostel_clearance_items(*)`
      )
      .eq('id', id)
      .maybeSingle();

    if (error) fail('Failed to fetch vacate request', error);
    if (!data) throw new Error(`Vacate request ${id} not found.`);
    return data as unknown as HostelVacateRequestWithContext;
  }

  /** The caller's own requests (raised by them, or raised on their behalf). */
  static async getMyRequests(userId: string) {
    const supabase = createClientSupabaseClient();
    // Two eq queries instead of an interpolated .or() string.
    const [submitted, aboutMe] = await Promise.all([
      supabase.from('hostel_vacate_requests').select('*').eq('submitted_by_id', userId),
      supabase.from('hostel_vacate_requests').select('*').eq('learner_id', userId),
    ]);
    if (submitted.error) fail('Failed to fetch my requests', submitted.error);
    if (aboutMe.error) fail('Failed to fetch my requests', aboutMe.error);

    const byId = new Map<string, HostelVacateRequest>();
    for (const row of [...(submitted.data ?? []), ...(aboutMe.data ?? [])]) {
      byId.set(row.id, row as unknown as HostelVacateRequest);
    }
    return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  /** Every hostel/mess bill (all years) for the request's learner + the outstanding total. */
  static async getBillStatus(requestId: string): Promise<VacateBillStatus> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_vacate_bill_status', {
      p_request_id: requestId,
    });
    if (error) fail('Failed to load bill status', error);
    return data as unknown as VacateBillStatus;
  }

  // ════════════════════════════════════════════════════════════════════
  // WRITE — raise / submit
  // ════════════════════════════════════════════════════════════════════

  /** Creates a draft. The RPC decides own-vs-on-behalf from auth.uid(). */
  static async createDraft(payload: CreateVacateRequestDTO) {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_vacate_create', {
      p_allocation_id: payload.allocation_id,
      p_reason_type: payload.reason_type,
      p_reason_text: payload.reason_text,
      p_requested_date: payload.requested_vacate_date,
      p_medical_notes: payload.medical_notes ?? undefined,
    });
    if (error) fail('Failed to create draft', error);
    return data as unknown as HostelVacateRequest;
  }

  /** Submit: freezes the checklist for this request and holds the bed (pending_vacate). */
  static async submitDraft(requestId: string) {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_vacate_submit', {
      p_request_id: requestId,
    });
    if (error) fail('Failed to submit vacate request', error);
    return data as unknown as HostelVacateRequest;
  }

  // ════════════════════════════════════════════════════════════════════
  // WRITE — warden actions
  // ════════════════════════════════════════════════════════════════════

  static async setChecklistItem(itemId: string, cleared: boolean, notes: string | null) {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_vacate_set_item', {
      p_item_id: itemId,
      p_cleared: cleared,
      p_notes: notes ?? undefined,
    });
    if (error) fail('Failed to update checklist item', error);
    return data as unknown as HostelClearanceItem;
  }

  /**
   * Approve = auto-vacate. The RPC refuses while any hostel/mess bill has a
   * balance or any required checklist item is unticked; there is no override.
   */
  static async approve(requestId: string, remarks?: string | null) {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_vacate_warden_approve', {
      p_request_id: requestId,
      p_remarks: remarks ?? undefined,
    });
    if (error) fail('Failed to approve vacate request', error);

    // The vacate is already committed (bed freed). The premium-upgrade offer is
    // a best-effort follow-up: a failure here is logged loudly and swallowed so
    // it never reads as a failed vacate.
    try {
      const vacancy = await detectVacancyOnVacate(requestId);
      if (vacancy) await notifyUpgradePool(vacancy.id);
    } catch (notifyError) {
      logger.error(
        LOG,
        'Premium-vacancy detect/notify failed AFTER successful vacate (vacate stands; upgrade offer not sent)',
        notifyError,
      );
    }
    return data as unknown as { success: boolean; request_id: string; allocation_id: string };
  }

  static async reject(requestId: string, reason: string) {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_vacate_reject', {
      p_request_id: requestId,
      p_reason: reason,
    });
    if (error) fail('Failed to reject vacate request', error);
    return data as unknown as HostelVacateRequest;
  }

  static async cancel(requestId: string, reason: string) {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_vacate_cancel', {
      p_request_id: requestId,
      p_reason: reason,
    });
    if (error) fail('Failed to cancel vacate request', error);
    return data as unknown as HostelVacateRequest;
  }

  // ════════════════════════════════════════════════════════════════════
  // Documents (row insert only — the caller uploads to storage first)
  // ════════════════════════════════════════════════════════════════════

  static async createDocument(payload: {
    vacate_request_id: string;
    document_type: HostelVacateDocument['document_type'];
    file_url: string;
    file_name: string;
    file_size_bytes: number;
    mime_type: HostelVacateDocument['mime_type'];
    uploaded_by: string;
    notes?: string;
  }) {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_vacate_documents')
      .insert(payload)
      .select()
      .single();
    if (error) fail('Failed to save document', error);
    return data as unknown as HostelVacateDocument;
  }

  static async deleteDocument(documentId: string) {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase.from('hostel_vacate_documents').delete().eq('id', documentId);
    if (error) fail('Failed to delete document', error);
  }
}
