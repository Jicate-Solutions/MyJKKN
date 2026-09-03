import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import {
  describeOncePerLearnerError,
  isOncePerLearnerViolation,
  oncePerLearnerMessage
} from '@/lib/utils/billing-duplicate-error';
import { logActivityForCurrentUser, BillingActivityTemplates } from '@/lib/utils/activity-logger-client';
import { BillCancellationService } from './bill-cancellation-service';
import type {
  BillCancelReasonCode,
  BillCancellationAttachment,
  CancelBillResult
} from '@/types/billing-bill-cancellation';
import type {
  StudentBill,
  CreateStudentBillDto,
  UpdateStudentBillDto,
  StudentBillFilters,
  StudentBillListResponse,
  BulkBillScheduleDto,
  BulkOperationResult
} from '@/types/billing-schedule';
import type {
  BulkEditDownloadFilters,
  BillForBulkEdit
} from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

/**
 * One tranche of a bill's payment schedule, with the money already allocated
 * to it by the waterfall.
 *
 * `allocated_amount` / `is_settled` are NOT stored on the tranche — they are
 * derived per read from the bill's paid position, oldest tranche first. That
 * is why a stale value can never be shown: there is no value to go stale.
 */
export interface BillInstalmentState {
  instalment_id: string;
  bill_id: string;
  sequence_no: number;
  amount: number;
  due_date: string;
  allocated_amount: number;
  outstanding: number;
  is_settled: boolean;
  /** Its date has arrived — this is the part of the bill actually owed now. */
  is_due: boolean;
  promotes_to_status_code: string | null;
}

export class StudentBillService {
  private static supabase = createClientSupabaseClient();

  /**
   * Payment schedules for a set of bills, keyed by bill id.
   *
   * Batched on purpose: a learner's page renders every bill at once, and one
   * request per bill would be N round trips to render a table. Bills with no
   * schedule simply have no key — the caller shows them exactly as before.
   *
   * Reads vw_bill_instalment_state rather than the raw table so the allocation
   * comes from the same waterfall the promotion engine and the fee-paid
   * threshold use. Re-deriving "how much of this tranche is paid" in the client
   * would be a third implementation of it, free to disagree with both.
   */
  static async getInstalmentsForBills(
    billIds: string[],
  ): Promise<Map<string, BillInstalmentState[]>> {
    const byBill = new Map<string, BillInstalmentState[]>();
    if (billIds.length === 0) return byBill;

    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('vw_bill_instalment_state')
      .select(
        'instalment_id, bill_id, sequence_no, amount, due_date, allocated_amount, outstanding, is_settled, is_due, promotes_to_status_code',
      )
      .in('bill_id', billIds)
      // The waterfall settles the oldest debt first, so the schedule must read
      // in calendar order — a schedule authored out of sequence would otherwise
      // display in an order that contradicts how its money was allocated.
      .order('due_date', { ascending: true })
      .order('sequence_no', { ascending: true });

    // Supabase errors are plain objects, not Error instances — check, never
    // try/catch. A failure here must not blank the bills table: the schedule is
    // additional detail, and the bill rows are still correct without it.
    if (error) {
      console.warn('[billing] could not load bill instalments:', getErrorMessage(error));
      return byBill;
    }

    for (const row of (data ?? []) as BillInstalmentState[]) {
      const list = byBill.get(row.bill_id);
      if (list) list.push(row);
      else byBill.set(row.bill_id, [row]);
    }
    return byBill;
  }

  static async createStudentBill(
    billData: CreateStudentBillDto
  ): Promise<StudentBill> {
    try {
      // Get current user ID
      const { data: userData } = await (this.supabase as any).auth.getUser();
      const currentUserId = userData?.user?.id;

      // Calculate final amount if not provided
      const finalAmount =
        billData.final_amount ||
        billData.total_amount + (billData.tax_amount || 0);

      const query: any = this.supabase.from('billing_student_bills');
      const { data, error } = await query
        .insert({
          ...billData,
          final_amount: finalAmount,
          balance_amount: finalAmount,
          quantity: billData.quantity || 1,
          tax_amount: billData.tax_amount || 0,
          academic_year_id: billData.academic_year_id || null,
          created_by: currentUserId
        })
        .select(
          `
          *,
          student:learners_profiles(
            id,
            first_name,
            last_name,
            roll_number,
            student_email,
            student_mobile
          ),
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          item_category:billing_categories(
            id,
            category_name,
            amount,
            frequency
          )
        `
        )
        .single();

      // The once-per-learner guard fires in Postgres, so it arrives here as a
      // plain error object with a custom SQLSTATE. Rethrow as a real Error
      // carrying the readable text — callers toast `error.message`, and the raw
      // Supabase object would surface as "[object Object]".
      const duplicateMessage = describeOncePerLearnerError(error, {
        withBillId: false
      });
      if (duplicateMessage) throw new Error(duplicateMessage);

      if (error) throw error;

      // Handle recurring bills
      if (
        billData.is_recurring &&
        billData.number_of_recurrences &&
        billData.recurrence_pattern
      ) {
        await this.createRecurringBills(data, billData);
      }

      const studentNameBill = `${(data as any)?.student?.first_name || ''} ${(data as any)?.student?.last_name || ''}`.trim() || 'Unknown';
      const templateBill = BillingActivityTemplates.billCreated(
        billData.bill_description || 'Student bill',
        studentNameBill
      );
      logActivityForCurrentUser({
        ...templateBill,
        resourceId: (data as any).id,
        institutionId: billData.institution_id,
        metadata: {
          sub_type: templateBill.sub_type,
          student_id: billData.student_id,
          total_amount: billData.total_amount,
          final_amount: finalAmount,
          category_id: billData.item_category_id,
          is_recurring: billData.is_recurring,
        },
      });

      return data;
    } catch (error) {
      console.error('Error creating student bill:', error);
      throw error;
    }
  }

  static async updateStudentBill(
    id: string,
    billData: UpdateStudentBillDto
  ): Promise<StudentBill> {
    try {
      // First get the current bill to calculate proper balance_amount
      const currentBill = await this.getStudentBill(id);

      // Calculate final amount if any amount fields are being updated
      let finalAmount = billData.final_amount;
      if (
        !finalAmount &&
        (billData.total_amount !== undefined ||
          billData.tax_amount !== undefined)
      ) {
        const totalAmount = billData.total_amount ?? currentBill.total_amount;
        const taxAmount = billData.tax_amount ?? currentBill.tax_amount;
        finalAmount = totalAmount + taxAmount;
      }

      // Calculate the proper balance_amount based on payments made
      let balanceAmount = billData.balance_amount;
      if (finalAmount !== undefined) {
        // Get total payments for this bill
        const receiptQuery: any = this.supabase
          .from('billing_receipt_items')
          .select('amount_paid')
          .eq('bill_id', id);
        const { data: receiptItems } = await receiptQuery;

        const totalPaid =
          (receiptItems as any[])?.reduce((sum, item) => sum + item.amount_paid, 0) || 0;

        // Get total processed refunds for this bill
        let totalRefunded = 0;
        if (receiptItems && receiptItems.length > 0) {
          const receiptIdQuery: any = this.supabase
            .from('billing_receipt_items')
            .select('receipt_id')
            .eq('bill_id', id);
          const { data: receiptIdData } = await receiptIdQuery;

          const receiptIdList =
            (receiptIdData as any[])?.map((item) => item.receipt_id) || [];

          if (receiptIdList.length > 0) {
            const refundQuery: any = this.supabase
              .from('billing_refunds')
              .select('refund_amount')
              .in('receipt_id', receiptIdList)
              .eq('approval_status', 'processed');
            const { data: refundData } = await refundQuery;

            totalRefunded =
              (refundData as any[])?.reduce(
                (sum, refund) => sum + refund.refund_amount,
                0
              ) || 0;
          }
        }

        // Calculate net paid amount
        const netPaid = totalPaid - totalRefunded;

        // Calculate new balance
        balanceAmount = Math.max(0, finalAmount - netPaid);

        // Update status if needed
        if (!billData.status) {
          if (netPaid >= finalAmount) {
            billData.status = 'paid';
          } else if (netPaid > 0) {
            billData.status = 'partially_paid';
          } else {
            billData.status = 'unpaid';
          }
        }
      }

      // Prepare update data
      const updateData = {
        ...billData,
        ...(finalAmount !== undefined && { final_amount: finalAmount }),
        ...(balanceAmount !== undefined && { balance_amount: balanceAmount })
      };

      const updateQuery: any = this.supabase.from('billing_student_bills');
      const { data, error } = await updateQuery
        .update(updateData)
        .eq('id', id)
        .select(
          `
          *,
          student:learners_profiles(
            id,
            first_name,
            last_name,
            roll_number,
            student_email,
            student_mobile
          ),
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          item_category:billing_categories(
            id,
            category_name,
            amount,
            frequency
          )
        `
        )
        .single();

      if (error) throw error;

      const studentNameUpdate = `${(data as any)?.student?.first_name || ''} ${(data as any)?.student?.last_name || ''}`.trim() || 'Unknown';
      const templateBillUpdate = BillingActivityTemplates.billUpdated(
        (data as any)?.bill_description || 'Student bill',
        studentNameUpdate
      );
      logActivityForCurrentUser({
        ...templateBillUpdate,
        resourceId: id,
        institutionId: (data as any)?.institution_id,
        metadata: {
          sub_type: templateBillUpdate.sub_type,
          updated_fields: Object.keys(billData),
          final_amount: finalAmount,
          balance_amount: balanceAmount,
        },
      });

      return data;
    } catch (error) {
      console.error('Error updating student bill:', error);
      throw error;
    }
  }

  static async deleteStudentBill(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('billing_student_bills')
        .delete()
        .eq('id', id);

      if (error) throw error;

      const templateBillDelete = BillingActivityTemplates.billDeleted(id);
      logActivityForCurrentUser({
        ...templateBillDelete,
        resourceId: id,
        metadata: { sub_type: templateBillDelete.sub_type },
      });
    } catch (error) {
      console.error('Error deleting student bill:', error);
      throw error;
    }
  }

  static async bulkDeleteStudentBills(
    ids: string[]
  ): Promise<BulkOperationResult> {
    const results: BulkOperationResult = {
      success: [],
      failed: []
    };

    for (const id of ids) {
      try {
        await this.deleteStudentBill(id);
        results.success.push(id);
      } catch (error) {
        results.failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    if (results.success.length > 0) {
      const templateBulkDelete = BillingActivityTemplates.billsBulkDeleted(results.success.length, ids.length);
      logActivityForCurrentUser({
        ...templateBulkDelete,
        metadata: { sub_type: templateBulkDelete.sub_type, deleted_ids: results.success, failed_count: results.failed.length },
      });
    }

    return results;
  }

  /**
   * Cancel a bill.
   *
   * This used to be a plain UPDATE that set status and appended the reason to
   * the free-text `remarks` column. It now delegates to
   * BillCancellationService, which goes through fn_cancel_student_bill --
   * a SECURITY DEFINER RPC that records the reason, the reason code and the
   * supporting documents in billing_bill_cancellations, and refuses a bill
   * that still has receipted money against it.
   *
   * The status allow-list, the receipted-money guard and the zeroing of
   * balance_amount all live in the RPC now. Duplicating them here is how the
   * two would drift apart, and a trigger rejects any UPDATE that tries to set
   * status='cancelled' outside the RPC, so a second implementation could not
   * work anyway.
   */
  static async cancelStudentBill(
    id: string,
    reasonCode: BillCancelReasonCode,
    reason: string,
    attachments: BillCancellationAttachment[]
  ): Promise<CancelBillResult> {
    return BillCancellationService.cancelBill({
      billId: id,
      reasonCode,
      reason,
      attachments,
    });
  }

  /**
   * Cancel several bills under ONE reason and ONE set of documents -- the
   * "these twelve rows are the same duplicate, here is the approval memo" case.
   * Each bill still goes through the RPC individually, so a bill that is
   * ineligible (wrong status, or money receipted against it) fails on its own
   * and the rest continue.
   */
  static async bulkCancelStudentBills(
    ids: string[],
    reasonCode: BillCancelReasonCode,
    reason: string,
    attachments: BillCancellationAttachment[]
  ): Promise<BulkOperationResult> {
    const results: BulkOperationResult = {
      success: [],
      failed: []
    };

    for (const id of ids) {
      try {
        await BillCancellationService.cancelBill({
          billId: id,
          reasonCode,
          reason,
          attachments,
        });
        results.success.push(id);
      } catch (error) {
        results.failed.push({
          id,
          error: getErrorMessage(error)
        });
      }
    }

    if (results.success.length > 0) {
      const template = BillingActivityTemplates.billsBulkCancelled(
        results.success.length,
        ids.length,
        reason
      );
      logActivityForCurrentUser({
        ...template,
        metadata: {
          sub_type: template.sub_type,
          cancelled_ids: results.success,
          failed_count: results.failed.length,
          reason_code: reasonCode,
          reason,
        },
      });
    }

    return results;
  }

  /**
   * Resolve an accommodation-type catalog code (e.g. 'hostel') to the matching
   * accommodation_type_id(s). The catalog is global (one row per code).
   * Returns [] on error (caller forces a no-match).
   */
  private static async resolveAccommodationTypeIds(
    code: string
  ): Promise<string[]> {
    try {
      const query = (this.supabase as any)
        .from('accommodation_types')
        .select('id')
        .eq('code', code);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((row: { id: string }) => row.id);
    } catch (error) {
      console.error('Error resolving accommodation type ids:', error);
      return [];
    }
  }

  // Cache for resolveInstitutionIdsByEntityType below. The institutions table
  // is a small, effectively static catalog and this runs on every list page,
  // pagination step and export.
  private static institutionIdsByEntityType = new Map<string, string[]>();

  /**
   * Resolve every institution id of a given entity_type ('institution' =
   * college, 'school', 'admin_office', 'company').
   *
   * Mirrors StudentSearchService.resolveInstitutionIdsByEntityType — the
   * students list and the bills list must agree on what "a college" is.
   * Returns [] on error, which the caller turns into a deliberate no-match
   * rather than silently widening the result set.
   */
  private static async resolveInstitutionIdsByEntityType(
    entityType: string
  ): Promise<string[]> {
    const cached = this.institutionIdsByEntityType.get(entityType);
    if (cached) return cached;

    try {
      const { data, error } = await (this.supabase as any)
        .from('institutions')
        .select('id')
        .eq('entity_type', entityType);

      if (error) throw error;
      const ids = (data || []).map((row: { id: string }) => row.id);
      if (ids.length > 0) this.institutionIdsByEntityType.set(entityType, ids);
      return ids;
    } catch (error) {
      console.error('Error resolving institution ids by entity type:', error);
      return [];
    }
  }

  /**
   * Resolve an admission-year NAME (e.g. '2025-2026') to every matching
   * admission_years id. Unlike accommodation_types, this catalog is
   * per-institution — one row per year per college — so a name maps to many
   * ids and filtering on a single id would scope the result to one college.
   * Returns [] on error (caller forces a no-match).
   */
  private static async resolveAdmissionYearIds(
    yearName: string
  ): Promise<string[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('admission_years')
        .select('id')
        .eq('admission_year_name', yearName);

      if (error) throw error;
      return (data || []).map((row: { id: string }) => row.id);
    } catch (error) {
      console.error('Error resolving admission year ids:', error);
      return [];
    }
  }

  static async getStudentBills(
    filters: StudentBillFilters = {}
  ): Promise<StudentBillListResponse> {
    try {
      // Check if any academic hierarchy filters are provided
      const hasAcademicFilters = !!(
        filters.degree_id ||
        filters.department_id ||
        filters.program_id ||
        filters.semester_id ||
        filters.section_id
      );

      // Accommodation-type filter. The UI sends a catalog *code* (e.g. 'hostel');
      // resolve it to the matching accommodation_type_id(s) so we can filter the
      // embedded learner. Like the academic filters, this needs the !inner join
      // (otherwise PostgREST returns the bill with student: null instead of
      // excluding it). null = filter inactive; [] = code matched nothing.
      const accommodationTypeIds: string[] | null = filters.accommodation_type
        ? await this.resolveAccommodationTypeIds(filters.accommodation_type)
        : null;

      // Admission-year filter. The UI sends a year NAME ('2025-2026') because
      // admission_years is keyed per institution; resolve it to every matching
      // id so the filter spans all colleges. Same contract as above:
      // null = filter inactive; [] = name matched nothing.
      const admissionYearIds: string[] | null = filters.admission_year
        ? await this.resolveAdmissionYearIds(filters.admission_year)
        : null;

      // ── Search strategy ────────────────────────────────────────────────
      // PostgREST cannot mix parent and embedded columns inside one top-level
      // logical tree — `or=(bill_description.ilike.*,student.first_name.ilike.*)`
      // is rejected with "failed to parse logic tree". So matching EITHER the
      // bill description OR the learner's name means pre-resolving the learner
      // ids and OR-ing them in as `student_id.in.(...)`.
      //
      // Those ids travel in the request URL. A broad term (e.g. a single "A")
      // matches thousands of learners, and ~400 uuids (~15KB of query string)
      // overruns the gateway's max request line: the call comes back as
      // "Bad Request"/"fetch failed" and the table renders "Failed to load
      // data". Inline the ids only while the list is small; once the term is
      // broad enough to overflow, drop to an !inner join and filter the
      // learner in-database instead — unbounded, one round trip, no URL growth.
      const MAX_INLINE_STUDENT_IDS = 150;

      const searchTerm = filters.search
        ? filters.search.replace(/[,()]/g, ' ').trim()
        : '';

      // Multi-word terms are AND-ed token by token. Matching the WHOLE phrase
      // against each column individually made "AKASH V" return nothing — no
      // single column holds it (first_name is 'AKASH', last_name is 'V').
      // Chained .or() calls are AND-ed by PostgREST, so each token must hit
      // SOME searchable column while different tokens may land on different
      // columns. Order is irrelevant ("V AKASH" works), and mixed terms like
      // "AKASH PB25" (name + roll fragment) now work too. A single token
      // produces exactly one .or(), i.e. the previous behaviour unchanged.
      // Capped at 5 tokens so a pasted sentence can't build a huge URL.
      const searchTokens = searchTerm
        ? searchTerm.split(/\s+/).filter(Boolean).slice(0, 5)
        : [];

      // The learner columns a search token may land on. Shared by both modes so
      // the inline lookup and the !inner fallback stay in step.
      const learnerSearchOr = (like: string) =>
        `first_name.ilike.${like},last_name.ilike.${like},roll_number.ilike.${like},college_email.ilike.${like}`;

      // Non-null → inline `student_id.in.(...)` mode; searchViaJoin → !inner mode.
      let searchStudentIds: string[] | null = null;
      let searchViaJoin = false;

      if (searchTokens.length > 0) {
        let learnerQuery = (this.supabase as any)
          .from('learners_profiles')
          .select('id');

        for (const token of searchTokens) {
          learnerQuery = learnerQuery.or(learnerSearchOr(`%${token}%`));
        }

        // One past the cap is all we need to know the list overflows.
        const { data: matchedStudents, error: studentLookupErr } =
          await learnerQuery.limit(MAX_INLINE_STUDENT_IDS + 1);

        if (studentLookupErr) throw studentLookupErr;

        const ids = (matchedStudents ?? [])
          .map((s: { id: string }) => s.id)
          .filter(Boolean);

        if (ids.length > MAX_INLINE_STUDENT_IDS) {
          searchViaJoin = true;
        } else {
          searchStudentIds = ids;
        }
      }

      // Any filter that targets a column on the embedded learner requires the
      // INNER-join variant of the select. lifecycle_status lives on
      // learners_profiles, so it joins the same club as the academic +
      // accommodation filters — as does a broad search that fell back to the
      // in-database learner match above.
      const hasStudentFilters =
        hasAcademicFilters ||
        accommodationTypeIds !== null ||
        admissionYearIds !== null ||
        !!filters.lifecycle_status ||
        searchViaJoin;

      let query;

      if (hasStudentFilters) {
        // !inner turns the student embed into an INNER JOIN so that
        // .eq('student.column', value) filters actually exclude parent
        // rows where the student doesn't match (without !inner, PostgREST
        // returns the bill with student: null instead of excluding it).
        query = (this.supabase as any).from('billing_student_bills').select(
          `
            id,
            student_id,
            institution_id,
            item_category_id,
            bill_description,
            due_date,
            quantity,
            unit_amount,
            total_amount,
            tax_amount,
            final_amount,
            status,
            payment_date,
            balance_amount,
            remarks,
            is_recurring,
            recurrence_pattern,
            number_of_recurrences,
            created_by,
            created_at,
            updated_at,
            academic_year_id,
            academic_year:academic_years(id, academic_year_name),
            student:learners_profiles!inner(
              first_name,
              last_name,
              roll_number,
              lifecycle_status,
              academic_year_id,
              degree_id,
              department_id,
              program_id,
              semester_id,
              section_id,
              accommodation_type_id,
              admission_year_id,
              department:departments(id, department_name),
              semester:semesters(id, semester_name)
            ),
            institution:institutions(
              id,
              name
            ),
            item_category:billing_categories(
              id,
              category_name,
              amount,
              frequency,
              collection_type
            )
          `,
          { count: 'exact' }
        );
      } else {
        // Use the optimized view that pre-joins all data when no academic filters are needed
        // Note: For now, let's use the full query to ensure we get all necessary data
        query = (this.supabase as any).from('billing_student_bills').select(
          `
            id,
            student_id,
            institution_id,
            item_category_id,
            bill_description,
            due_date,
            quantity,
            unit_amount,
            total_amount,
            tax_amount,
            final_amount,
            status,
            payment_date,
            balance_amount,
            remarks,
            is_recurring,
            recurrence_pattern,
            number_of_recurrences,
            created_by,
            created_at,
            updated_at,
            academic_year_id,
            academic_year:academic_years(id, academic_year_name),
            student:learners_profiles(
              first_name,
              last_name,
              roll_number,
              lifecycle_status,
              department:departments(id, department_name),
              semester:semesters(id, semester_name)
            ),
            institution:institutions(
              id,
              name
            ),
            item_category:billing_categories(
              id,
              category_name,
              amount,
              frequency,
              collection_type
            )
          `,
          { count: 'exact' }
        );
      }

      // Apply the search resolved above (see the MAX_INLINE_STUDENT_IDS note).
      if (searchTokens.length > 0) {
        if (searchViaJoin) {
          // Broad term: match the learner in-database via the !inner embed.
          // Scoped to the referenced table, so it AND's with any other learner
          // filter (department, lifecycle, …) rather than widening them. One
          // .or() per token, matching the token AND-ing of the inline path.
          // bill_description is not OR'd in here — PostgREST can't span the
          // join — but at >150 matching learners the name match dominates.
          for (const token of searchTokens) {
            query = query.or(learnerSearchOr(`%${token}%`), {
              referencedTable: 'student'
            });
          }
        } else {
          const orParts: string[] = [
            `bill_description.ilike.%${searchTerm}%`
          ];
          if (searchStudentIds && searchStudentIds.length > 0) {
            orParts.push(`student_id.in.(${searchStudentIds.join(',')})`);
          }
          query = query.or(orParts.join(','));
        }
      }

      if (filters.student_id) {
        query = query.eq('student_id', filters.student_id);
      }

      // Entity-type gate. Same shape as StudentSearchService: resolve the
      // matching institution ids and filter the FK column with .in(), rather
      // than filtering the embedded institutions resource (which PostgREST
      // only allows behind an !inner join, and an inner join here would drop
      // bills whose institution row is not visible).
      //
      // This is the query half of the college-only dropdown. Without it the
      // default "All Institutions" view still returns school-fee bills, i.e.
      // exactly the rows the dropdown was restricted to hide.
      if (filters.institution_entity_type) {
        const entityInstitutionIds = await this.resolveInstitutionIdsByEntityType(
          filters.institution_entity_type
        );
        query = query.in(
          'institution_id',
          entityInstitutionIds.length > 0
            ? entityInstitutionIds
            : ['00000000-0000-0000-0000-000000000000']
        );
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      } else {
        // Perf (2026-06-05): scope unfiltered lists to the caller's accessible
        // institutions so Postgres uses the institution_id index instead of a
        // full-table RLS scan. Without this, institution-scoped (non-admin) users
        // hit a 57014 "canceling statement due to statement timeout" — the SELECT
        // RLS evaluates role_has_institution_access() per row across EVERY
        // institution's bills (~5.8s over ~5.7k rows; with an institution filter
        // it's an index scan, ~12ms). _user_accessible_institutions() mirrors the
        // RLS institution scope exactly, so the set of visible rows is unchanged.
        // Falls back to the prior (unscoped) behavior if the RPC is unavailable.
        const { data: accessibleIds, error: accessErr } = await (this.supabase as any).rpc(
          '_user_accessible_institutions'
        );
        if (!accessErr && Array.isArray(accessibleIds) && accessibleIds.length > 0) {
          query = query.in('institution_id', accessibleIds);
        }
      }

      if (filters.item_category_id) {
        query = query.eq('item_category_id', filters.item_category_id);
      }

      // Ownership filter. Resolved to ids against the (global, ~20-row) category
      // master and applied as an IN list rather than switching the embedded
      // billing_categories join to !inner — an inner join here would silently
      // drop uncategorised bills from every query shape, and the select string
      // is built in two separate branches above.
      if (filters.collection_type) {
        const { data: cats, error: catErr } = await (this.supabase as any)
          .from('billing_categories')
          .select('id')
          .eq('collection_type', filters.collection_type);

        if (catErr) throw catErr;

        const categoryIds = ((cats ?? []) as { id: string }[]).map((c) => c.id);
        if (categoryIds.length === 0) {
          // No category carries this ownership — nothing can match. (page/limit
          // are only destructured further down, so read them off filters here.)
          return {
            data: [],
            metadata: {
              total: 0,
              page: filters.page || 1,
              limit: filters.limit || 10,
              totalPages: 0
            }
          };
        }
        query = query.in('item_category_id', categoryIds);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      // Academic year now lives ON the bill (not the student's current year),
      // so filter the bill's own column. 'unspecified' → bills with no year.
      if (filters.academic_year_id === 'unspecified') {
        query = query.is('academic_year_id', null);
      } else if (filters.academic_year_id) {
        query = query.eq('academic_year_id', filters.academic_year_id);
      }

      if (filters.due_date_from) {
        query = query.gte('due_date', filters.due_date_from);
      }

      if (filters.due_date_to) {
        query = query.lte('due_date', filters.due_date_to);
      }

      if (filters.amount_from) {
        query = query.gte('final_amount', filters.amount_from);
      }

      if (filters.amount_to) {
        query = query.lte('final_amount', filters.amount_to);
      }

      if (filters.is_recurring !== undefined) {
        query = query.eq('is_recurring', filters.is_recurring);
      }

      // Apply learner-embedded filters (only when using the !inner joined query)
      if (hasStudentFilters) {
        if (filters.degree_id) {
          query = query.eq('student.degree_id', filters.degree_id);
        }

        if (filters.department_id) {
          query = query.eq('student.department_id', filters.department_id);
        }

        if (filters.program_id) {
          query = query.eq('student.program_id', filters.program_id);
        }

        if (filters.semester_id) {
          query = query.eq('student.semester_id', filters.semester_id);
        }

        if (filters.section_id) {
          query = query.eq('student.section_id', filters.section_id);
        }

        if (filters.lifecycle_status) {
          query = query.eq('student.lifecycle_status', filters.lifecycle_status);
        }

        // Accommodation-type code resolved to id(s) above. Empty array means the
        // code matched no catalog row → force a no-match instead of all rows.
        if (accommodationTypeIds !== null) {
          query = query.in(
            'student.accommodation_type_id',
            accommodationTypeIds.length > 0
              ? accommodationTypeIds
              : ['00000000-0000-0000-0000-000000000000']
          );
        }

        // Admission-year name resolved to ids above (one per institution).
        // Empty array means the name matched no catalog row → force a no-match.
        if (admissionYearIds !== null) {
          query = query.in(
            'student.admission_year_id',
            admissionYearIds.length > 0
              ? admissionYearIds
              : ['00000000-0000-0000-0000-000000000000']
          );
        }
      }

      // Apply sorting with proper column mapping
      let sortBy = filters.sortBy || 'created_at';
      const sortDirection = filters.sortDirection || 'desc';

      // Map sort columns based on query type
      if (!hasAcademicFilters) {
        // When using view, map student fields appropriately
        if (
          sortBy === 'first_name' ||
          sortBy === 'last_name' ||
          sortBy === 'student_name'
        ) {
          sortBy = 'student_name';
        } else if (
          sortBy === 'student.first_name' ||
          sortBy === 'student.last_name'
        ) {
          sortBy = 'student_name';
        } else if (sortBy === 'student' || sortBy === 'student.name') {
          sortBy = 'student_name';
        }
      }

      query = query.order(sortBy, { ascending: sortDirection === 'asc' });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      query = query.range((page - 1) * limit, page * limit - 1);

      const { data, count, error } = await query;

      if (error) throw error;

      // Transform data based on the query type
      const transformedData = (data || []).map((bill: any): StudentBill => {
        // Common core bill fields
        const baseBill = {
          id: bill.id,
          student_id: bill.student_id,
          institution_id: bill.institution_id,
          item_category_id: bill.item_category_id,
          bill_description: bill.bill_description,
          due_date: bill.due_date,
          quantity: bill.quantity,
          unit_amount: bill.unit_amount,
          total_amount: bill.total_amount,
          tax_amount: bill.tax_amount,
          final_amount: bill.final_amount,
          status: bill.status,
          payment_date: bill.payment_date,
          balance_amount: bill.balance_amount,
          remarks: bill.remarks,
          is_recurring: bill.is_recurring,
          recurrence_pattern: bill.recurrence_pattern,
          number_of_recurrences: bill.number_of_recurrences,
          created_by: bill.created_by,
          created_at: bill.created_at,
          updated_at: bill.updated_at,
          academic_year_id: bill.academic_year_id
        };

        // Since we're now using the same query structure for both cases,
        // we can simplify the transformation logic
        const studentData = Array.isArray(bill.student)
          ? bill.student[0]
          : bill.student;
        const institutionData = Array.isArray(bill.institution)
          ? bill.institution[0]
          : bill.institution;
        const itemCategoryData = Array.isArray(bill.item_category)
          ? bill.item_category[0]
          : bill.item_category;
        const academicYearData = Array.isArray(bill.academic_year)
          ? bill.academic_year[0]
          : bill.academic_year;

        return {
          ...baseBill,
          student: {
            id: bill.student_id,
            first_name: studentData?.first_name || '',
            last_name: studentData?.last_name || '',
            roll_number: studentData?.roll_number || '',
            college_email: '', // Not queried to keep it light
            student_mobile: '', // Not queried to keep it light
            lifecycle_status: studentData?.lifecycle_status || undefined,
            department: studentData?.department || undefined,
            semester: studentData?.semester || undefined
          },
          institution: {
            id: bill.institution_id,
            name: institutionData?.name || '',
            counselling_code: '' // Not queried to keep it light
          },
          item_category: {
            id: bill.item_category_id,
            category_name: itemCategoryData?.category_name || ''
          },
          academic_year: academicYearData
            ? {
                id: academicYearData.id,
                academic_year_name: academicYearData.academic_year_name
              }
            : undefined
        };
      });

      return {
        data: transformedData,
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      // Supabase errors are plain objects — console.error alone prints "{}".
      console.error('Error fetching student bills:', getErrorMessage(error), error);
      // …and a plain object fails `error instanceof Error` in the DataTable,
      // which then shows the useless "Failed to load data: Unknown error".
      // Re-wrap so the real cause reaches the screen; `cause` keeps the original.
      if (error instanceof Error) throw error;
      throw new Error(getErrorMessage(error), { cause: error });
    }
  }

  static async getStudentBill(id: string): Promise<StudentBill> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('billing_student_bills')
        .select(
          `
          *,
          student:learners_profiles(
            id,
            first_name,
            last_name,
            roll_number,
            college_email,
            student_mobile,
            degree:degrees(id, degree_name),
            department:departments(id, department_name),
            semester:semesters(id, semester_name)
          ),
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          item_category:billing_categories(
            id,
            category_name,
            amount,
            frequency
          ),
          academic_year:academic_years(id, academic_year_name),
          discounts:billing_discounts(
            *,
            authorizer:profiles!fk_billing_discounts_authorizer(id, full_name)
          ),
          receipt_items:billing_receipt_items(
            *,
            receipt:billing_receipts(
              *,
              student:learners_profiles(id, first_name, last_name, college_email),
              accountant:profiles!fk_billing_receipts_accountant(id, full_name),
              refunds:billing_refunds(
                *,
                authorizer:profiles!fk_billing_refunds_authorizer(id, full_name),
                approver:profiles!fk_billing_refunds_approved_by(id, full_name)
              )
            )
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as StudentBill;
    } catch (error) {
      console.error('Error fetching student bill:', error);
      throw error;
    }
  }

  static async getStudentBillsByStudent(
    studentId: string,
    status?: string
  ): Promise<StudentBill[]> {
    try {
      let query = this.supabase
        .from('billing_student_bills')
        .select(
          `
          *,
          item_category:billing_categories(
            id,
            category_name,
            kind,
            amount,
            frequency
          ),
          academic_year:academic_years(id, academic_year_name),
          discounts:billing_discounts(*),
          receipt_items:billing_receipt_items(
            *,
            receipt:billing_receipts(*)
          )
        `
        )
        .eq('student_id', studentId)
        .order('due_date', { ascending: true });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as StudentBill[];
    } catch (error) {
      console.error('Error fetching student bills by student:', error);
      throw error;
    }
  }

  static async bulkCreateStudentBills(
    bulkData: BulkBillScheduleDto,
    onProgress?: (done: number, total: number) => void
  ): Promise<BulkOperationResult> {
    const results: BulkOperationResult = {
      success: [],
      failed: []
    };

    // Total work units = students × bills-per-student. The loop is sequential
    // (Supabase round-trip per row), so reporting after each iteration gives
    // truthful, monotonically-increasing progress.
    const total = bulkData.student_ids.length * bulkData.bills.length;
    let done = 0;
    onProgress?.(0, total);

    for (const studentId of bulkData.student_ids) {
      for (const billData of bulkData.bills) {
        try {
          await this.createStudentBill({
            ...billData,
            student_id: studentId
          });
          results.success.push(studentId);
        } catch (error) {
          results.failed.push({
            id: studentId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        } finally {
          done += 1;
          onProgress?.(done, total);
        }
      }
    }

    if (results.success.length > 0) {
      const templateBulkCreate = BillingActivityTemplates.billsBulkCreated(
        results.success.length,
        bulkData.student_ids.length
      );
      logActivityForCurrentUser({
        ...templateBulkCreate,
        metadata: {
          sub_type: templateBulkCreate.sub_type,
          student_count: bulkData.student_ids.length,
          bill_count_per_student: bulkData.bills.length,
          total_created: results.success.length,
          failed_count: results.failed.length,
        },
      });
    }

    return results;
  }

  static async markOverdueBills(): Promise<number> {
    try {
      const { data, error } = await (this.supabase as any).rpc('mark_overdue_bills');

      if (error) throw error;
      return data || 0;
    } catch (error) {
      console.error('Error marking overdue bills:', error);
      throw error;
    }
  }

  static async calculateStudentOutstanding(studentId: string): Promise<number> {
    try {
      // Use the optimized function with fallback
      const { data, error } = await (this.supabase as any).rpc(
        'calculate_student_outstanding_optimized',
        { student_uuid: studentId }
      );

      if (error) throw error;
      return data || 0;
    } catch (error) {
      console.error('Error calculating student outstanding:', error);

      // Fallback: calculate from bill balances directly
      try {
        const fallbackQuery: any = this.supabase
          .from('billing_student_bills')
          .select('balance_amount')
          .eq('student_id', studentId)
          .in('status', ['unpaid', 'partially_paid', 'overdue']);
        const { data: bills } = await fallbackQuery;

        return (
          (bills as any[])?.reduce((sum, bill) => sum + (bill.balance_amount || 0), 0) || 0
        );
      } catch (fallbackError) {
        console.error('Error in fallback calculation:', fallbackError);
        return 0;
      }
    }
  }

  private static async createRecurringBills(
    originalBill: StudentBill,
    billData: CreateStudentBillDto
  ): Promise<void> {
    if (!billData.number_of_recurrences || !billData.recurrence_pattern) return;

    const recurringBills = [];
    const originalDueDate = new Date(originalBill.due_date);

    for (let i = 1; i < billData.number_of_recurrences; i++) {
      const newDueDate = new Date(originalDueDate);

      switch (billData.recurrence_pattern) {
        case 'monthly':
          newDueDate.setMonth(newDueDate.getMonth() + i);
          break;
        case 'quarterly':
          newDueDate.setMonth(newDueDate.getMonth() + i * 3);
          break;
        case 'yearly':
          newDueDate.setFullYear(newDueDate.getFullYear() + i);
          break;
      }

      recurringBills.push({
        ...billData,
        due_date: newDueDate.toISOString().split('T')[0],
        bill_description: `${billData.bill_description} (${i + 1}/${
          billData.number_of_recurrences
        })`,
        is_recurring: false, // Prevent infinite recursion
        recurrence_pattern: undefined,
        number_of_recurrences: undefined
      });
    }

    if (recurringBills.length > 0) {
      const insertQuery: any = this.supabase.from('billing_student_bills');
      const { error } = await insertQuery.insert(recurringBills);

      // A once-per-learner category and a recurring bill are contradictory by
      // definition — say so plainly rather than surfacing a raw SQLSTATE, since
      // the fix is a configuration change, not a data fix.
      if (isOncePerLearnerViolation(error)) {
        throw new Error(
          `${oncePerLearnerMessage(error, { withBillId: false })} Recurring bills cannot be used with a category restricted to one bill per learner.`
        );
      }

      if (error) throw error;
    }
  }

  static async getUnpaidBillsByStudent(
    studentId: string
  ): Promise<StudentBill[]> {
    try {
      const { data, error } = await this.supabase
        .from('billing_student_bills')
        .select(
          `
          *,
          item_category:billing_categories(
            id,
            category_name,
            amount,
            frequency
          )
        `
        )
        .eq('student_id', studentId)
        .in('status', ['unpaid', 'partially_paid', 'overdue'])
        .order('due_date', { ascending: true });

      if (error) throw error;
      return (data || []) as StudentBill[];
    } catch (error) {
      console.error('Error fetching unpaid bills:', error);
      throw error;
    }
  }

  static async updateBillStatus(
    billId: string,
    status: string,
    balanceAmount?: number
  ): Promise<void> {
    try {
      const updateData: any = { status };

      if (status === 'paid') {
        updateData.balance_amount = 0;
        updateData.payment_date = new Date().toISOString();
      } else if (status === 'partially_paid' && balanceAmount !== undefined) {
        updateData.balance_amount = balanceAmount;
      } else if (status === 'unpaid' && balanceAmount !== undefined) {
        updateData.balance_amount = balanceAmount;
        updateData.payment_date = null; // Clear payment date if bill becomes unpaid due to refund
      }

      const statusUpdateQuery: any = this.supabase.from('billing_student_bills');
      const { error } = await statusUpdateQuery
        .update(updateData)
        .eq('id', billId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating bill status:', error);
      throw error;
    }
  }

  // Method to update bill balance after refund
  static async updateBillBalanceAfterRefund(
    billId: string,
    refundAmount: number
  ): Promise<void> {
    try {
      // First get the current bill details
      const bill = await this.getStudentBill(billId);

      // Calculate new balance (add refund amount back to balance)
      const newBalance = bill.balance_amount + refundAmount;

      // Determine new status based on balance
      let newStatus = bill.status;
      if (newBalance >= bill.final_amount) {
        newStatus = 'unpaid';
      } else if (newBalance > 0) {
        newStatus = 'partially_paid';
      } else {
        newStatus = 'paid';
      }

      // Update the bill
      await this.updateBillStatus(billId, newStatus, newBalance);
    } catch (error) {
      console.error('Error updating bill balance after refund:', error);
      throw error;
    }
  }

  // Method to get refunds for a specific bill
  static async getBillRefunds(billId: string): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('billing_refunds')
        .select(
          `
          *,
          receipt:billing_receipts!inner(
            id,
            receipt_number,
            receipt_items:billing_receipt_items!inner(
              bill_id
            )
          )
        `
        )
        .eq('receipt.receipt_items.bill_id', billId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching bill refunds:', error);
      throw error;
    }
  }

  // Method to calculate total refunded amount for a bill
  static async getBillTotalRefundAmount(billId: string): Promise<number> {
    try {
      const refunds = await this.getBillRefunds(billId);
      return refunds
        .filter(
          (refund) =>
            refund.approval_status === 'approved' ||
            refund.approval_status === 'processed'
        )
        .reduce((total, refund) => total + refund.refund_amount, 0);
    } catch (error) {
      console.error('Error calculating total refund amount:', error);
      return 0;
    }
  }

  /** Cap mirrored by the bulk-edit template route + filter-panel warning. */
  static readonly BULK_EDIT_DOWNLOAD_CAP = 5000;

  /**
   * Apply the bulk-edit download filters to a billing_student_bills query.
   * Shared by getBillsForBulkEdit + countBillsForBulkEdit so the count never
   * drifts from the exported set.
   */
  private static async applyBulkEditFilters(
    query: any,
    filters: BulkEditDownloadFilters,
    client: any
  ) {
    // College-only, unconditionally — bulk edit is a college surface and its
    // institution dropdown lists entity_type='institution'. With "All
    // institutions" chosen no institution_id is sent, so without this gate the
    // download (and therefore the APPLY step) would reach school-fee bills.
    // Resolved through the INJECTED client: this path runs server-side, where
    // the class-level browser client is not the caller.
    const { data: collegeRows } = await client
      .from('institutions')
      .select('id')
      .eq('entity_type', 'institution');
    const collegeIds = (collegeRows || []).map((r: { id: string }) => r.id);
    query = query.in(
      'institution_id',
      collegeIds.length > 0 ? collegeIds : ['00000000-0000-0000-0000-000000000000']
    );

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.item_category_id) {
      query = query.eq('item_category_id', filters.item_category_id);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.academic_year_id === 'unspecified') {
      query = query.is('academic_year_id', null);
    } else if (filters.academic_year_id) {
      query = query.eq('academic_year_id', filters.academic_year_id);
    }
    if (filters.due_date_from) {
      query = query.gte('due_date', filters.due_date_from);
    }
    if (filters.due_date_to) {
      query = query.lte('due_date', filters.due_date_to);
    }
    return query;
  }

  /**
   * Existing bills (current values) for the bulk-edit export, capped.
   * RLS (via the injected client) scopes rows to the caller.
   */
  static async getBillsForBulkEdit(
    filters: BulkEditDownloadFilters,
    client: any
  ): Promise<BillForBulkEdit[]> {
    let query = client
      .from('billing_student_bills')
      .select(
        `
        id,
        institution_id,
        status,
        final_amount,
        bill_description,
        due_date,
        remarks,
        student:learners_profiles(first_name, last_name, roll_number),
        institution:institutions(name),
        academic_year:academic_years(academic_year_name),
        item_category:billing_categories(category_name)
      `
      )
      .order('created_at', { ascending: false })
      .limit(StudentBillService.BULK_EDIT_DOWNLOAD_CAP);

    query = await StudentBillService.applyBulkEditFilters(query, filters, client);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((b: any): BillForBulkEdit => {
      const student = Array.isArray(b.student) ? b.student[0] : b.student;
      const institution = Array.isArray(b.institution)
        ? b.institution[0]
        : b.institution;
      const ay = Array.isArray(b.academic_year)
        ? b.academic_year[0]
        : b.academic_year;
      const cat = Array.isArray(b.item_category)
        ? b.item_category[0]
        : b.item_category;
      return {
        bill_id: b.id,
        institution_id: b.institution_id,
        institution_name: institution?.name || '',
        roll_number: student?.roll_number || '',
        student_name:
          `${student?.first_name || ''} ${student?.last_name || ''}`.trim() ||
          'Unknown',
        status: b.status,
        final_amount: b.final_amount ?? 0,
        academic_year_name: ay?.academic_year_name ?? null,
        category_name: cat?.category_name || '',
        bill_description: b.bill_description ?? null,
        due_date: b.due_date,
        remarks: b.remarks ?? null
      };
    });
  }

  /** Count of bills matching the bulk-edit filters (live preview). */
  static async countBillsForBulkEdit(
    filters: BulkEditDownloadFilters,
    client: any
  ): Promise<number> {
    let query = client
      .from('billing_student_bills')
      .select('id', { count: 'exact', head: true });
    query = await StudentBillService.applyBulkEditFilters(query, filters, client);
    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  }
}
