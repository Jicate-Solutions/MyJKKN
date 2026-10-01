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
  VacateAdvanceResult,
  VacateDamageLineInput,
  VacateFineBill,
  VacateLearnerDetails,
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
 * (2026-10-01) draft -> pending_dues -> pending_principal -> pending_warden ->
 * pending_mess -> pending_cao -> [pending_fine] -> completed | rejected | cancelled.
 *
 * Every state change is a SECURITY DEFINER RPC that re-checks permission, scope,
 * the bill gate, the checklist and the room inspection in the database —
 * nothing here decides whether a request may advance. The vacate itself
 * (allocation vacated + bed freed, learner moved to Day Scholar, categories
 * cleared) happens at the CAO approval, or when the damage-fine bill is settled.
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
         clearance_items:hostel_clearance_items(*),
         damages:hostel_vacate_damages(*),
         approvals:hostel_vacate_approvals(*)`
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

  /**
   * Full learner record for the request (profile -> learners_profiles + lookups).
   * Every embed can come back NULL when RLS hides that lookup row for the viewer,
   * so each field is optional and the UI renders '—' rather than failing.
   * Returns null when the resident has no learner record.
   */
  static async getLearnerDetails(profileId: string): Promise<VacateLearnerDetails | null> {
    const supabase = createClientSupabaseClient();
    const { data: prof, error: profError } = await supabase
      .from('profiles')
      .select('learner_id')
      .eq('id', profileId)
      .maybeSingle();
    if (profError) fail('Failed to load the learner profile', profError);
    if (!prof?.learner_id) return null;

    const { data, error } = await supabase
      .from('learners_profiles')
      .select(
        `id, first_name, last_name, roll_number, college_email, student_mobile, student_email,
         gender, blood_group, student_photo_url, lifecycle_status,
         father_name, father_mobile, mother_name, mother_mobile,
         permanent_address_street, permanent_address_taluk, permanent_address_district,
         permanent_address_state, permanent_address_pin_code,
         institution:institutions!fk_learners_profiles_institution(name),
         degree:degrees!fk_learners_profiles_degree(degree_name),
         program:programs!fk_learners_profiles_program(program_name),
         department:departments!fk_learners_profiles_department(department_name),
         semester:semesters!fk_learners_profiles_semester(semester_name),
         section:sections!fk_learners_profiles_section(section_name),
         batch:batches!fk_learners_profiles_batch(batch_name),
         academic_year:academic_years!fk_learners_profiles_academic_year(academic_year_name),
         accommodation:accommodation_types!learners_profiles_accommodation_type_id_fkey(name),
         hostel_category:hostel_categories!learners_profiles_hostel_category_id_fkey(name),
         mess_category:mess_categories!learners_profiles_mess_category_id_fkey(name)`,
      )
      .eq('id', prof.learner_id)
      .maybeSingle();
    if (error) fail('Failed to load the learner record', error);
    if (!data) return null;

    const row = data as unknown as Record<string, any>;
    const address = [
      row.permanent_address_street,
      row.permanent_address_taluk,
      row.permanent_address_district,
      row.permanent_address_state,
      row.permanent_address_pin_code,
    ]
      .filter(Boolean)
      .join(', ');
    return {
      learner_profile_id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown',
      roll_number: row.roll_number ?? null,
      college_email: row.college_email ?? null,
      student_mobile: row.student_mobile ?? null,
      student_email: row.student_email ?? null,
      gender: row.gender ?? null,
      blood_group: row.blood_group ?? null,
      photo_url: row.student_photo_url ?? null,
      lifecycle_status: row.lifecycle_status ?? null,
      father_name: row.father_name ?? null,
      father_mobile: row.father_mobile ?? null,
      mother_name: row.mother_name ?? null,
      mother_mobile: row.mother_mobile ?? null,
      address: address || null,
      institution: row.institution?.name ?? null,
      degree: row.degree?.degree_name ?? null,
      program: row.program?.program_name ?? null,
      department: row.department?.department_name ?? null,
      semester: row.semester?.semester_name ?? null,
      section: row.section?.section_name ?? null,
      batch: row.batch?.batch_name ?? null,
      academic_year: row.academic_year?.academic_year_name ?? null,
      accommodation: row.accommodation?.name ?? null,
      hostel_category: row.hostel_category?.name ?? null,
      mess_category: row.mess_category?.name ?? null,
    };
  }

  /** id -> display name for the decision timeline (names RLS hides simply stay absent). */
  static async getActorNames(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    if (error) fail('Failed to load approver names', error);
    const names: Record<string, string> = {};
    for (const row of data ?? []) if (row.full_name) names[row.id] = row.full_name;
    return names;
  }

  /** The damage-fine bill raised at CAO approval (null until then). */
  static async getFineBill(billId: string): Promise<VacateFineBill | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('billing_student_bills')
      .select('id, final_amount, balance_amount, status, due_date, bill_description')
      .eq('id', billId)
      .maybeSingle();
    if (error) fail('Failed to load the fine bill', error);
    return (data as unknown as VacateFineBill | null) ?? null;
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
  // WRITE — approver actions
  // ════════════════════════════════════════════════════════════════════

  /** Step 1 refresh: moves the request on if every hostel/mess bill is now settled. */
  static async recheckBills(requestId: string) {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_vacate_recheck_bills', {
      p_request_id: requestId,
    });
    if (error) fail('Failed to re-check bills', error);
    return data as unknown as { advanced: boolean; status: string; bills: VacateBillStatus };
  }

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
   * Warden's room inspection. noDamage=true with no lines = "no damage";
   * otherwise at least one line. Replaces any earlier lines for the request.
   */
  static async setDamages(requestId: string, lines: VacateDamageLineInput[], noDamage: boolean) {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_vacate_set_damages', {
      p_request_id: requestId,
      p_lines: lines.map((l) => ({
        damage_type_id: l.damage_type_id,
        amount: l.amount,
        note: l.note ?? null,
      })),
      p_no_damage: noDamage,
    });
    if (error) fail('Failed to save room inspection', error);
    return data as unknown as { room_inspected: boolean; damage_total: number; lines: number };
  }

  /**
   * Approve the step the request is at (principal / warden / mess / CAO). The RPC
   * checks the step's permission and refuses while a gate is open (unpaid bills,
   * unticked required items, missing room inspection). At the CAO step it either
   * completes the vacate or raises the damage-fine bill (status pending_fine).
   */
  static async advance(requestId: string, remarks?: string | null) {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_vacate_advance', {
      p_request_id: requestId,
      p_remarks: remarks?.trim() ? remarks.trim() : undefined,
    });
    if (error) fail('Failed to approve vacate request', error);
    const result = data as unknown as VacateAdvanceResult;

    // The vacate is already committed (bed freed). The premium-upgrade offer is
    // a best-effort follow-up: a failure here is logged loudly and swallowed so
    // it never reads as a failed vacate. (A vacate completed by the fine-payment
    // trigger has no client call, so it is not offered here.)
    if (result.status === 'completed') {
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
    }
    return result;
  }

  /** Retry completion when the fine was settled but the automatic completion failed. */
  static async completeAfterFine(requestId: string) {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_vacate_complete_after_fine', {
      p_request_id: requestId,
    });
    if (error) fail('Failed to complete the vacate', error);
    return data as unknown as { success: boolean };
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
