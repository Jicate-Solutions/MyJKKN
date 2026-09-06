import { createClientSupabaseClient } from '@/lib/supabase/client';
import { isBillableBill } from '@/lib/billing/bill-status';
import type {
  StudentForBilling,
  StudentForBillingListResponse,
  StudentSearchFilters,
  StudentBillingSummary,
  StudentBill,
  BillingReceipt,
  BillingInvoice
} from '@/types/billing-schedule';

// ============================================================================
// Lifecycle statuses where a student is billable.
// ----------------------------------------------------------------------------
// Post-2026-05-21 workflow realignment, the lifecycle flows:
//   account   → bills generated for the joining cycle
//   reserved  → one cycle's bills paid, seat held
//   admitted  → joining confirmed
//   active    → post-joining, regular semester billing
//
// All four states have outstanding or paid bills that the billing module
// must surface. Earlier code hardcoded ['active'] (or ['active','account'])
// in five different spots — every post-realignment learner in 'reserved' or
// 'admitted' silently 404'd from the billing schedule student detail page
// with PGRST116 (single-row fetch returned 0 rows).
//
// Centralized here so the next realignment is one edit instead of five.
// ============================================================================
const BILLABLE_LIFECYCLE_STATUSES = ['account', 'reserved', 'admitted', 'active'] as const;

// Helper type for raw Supabase response
type RawStudentData = {
  id: string;
  roll_number: string;
  register_number?: string;
  first_name: string;
  last_name: string;
  father_name: string;
  student_mobile: string;
  college_email: string;
  institution_id: string;
  academic_year_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_id: string;
  section_id: string;
  // Gender / quota / community. Selected by getStudentForBilling only.
  gender?: string;
  quota_id?: string;
  community_category_id?: string;
  // 2026-05-21: surfaced so the billing detail page can show the learner's
  // current lifecycle (account / reserved / admitted / active) next to
  // the bill totals. Selected by getStudentForBilling only.
  lifecycle_status?: string;
  // Accommodation type. Selected by getStudentForBilling only.
  accommodation_type_id?: string;
  // Admission year. Selected by getStudentForBilling only.
  admission_year_id?: string;
  institution?: any;
  academic_year?: any;
  degree?: any;
  department?: any;
  program?: any;
  semester?: any;
  section?: any;
  quota?: any;
  community_category?: any;
  accommodation_type?: any;
  admission_year?: any;
};

export class StudentSearchService {
  private static supabase = createClientSupabaseClient();

  // Helper function to map raw data to StudentForBilling
  private static mapToStudentForBilling(
    rawData: RawStudentData,
    outstandingAmount: number
  ): StudentForBilling {
    return {
      id: rawData.id,
      roll_number: rawData.roll_number,
      register_number: rawData.register_number,
      first_name: rawData.first_name,
      last_name: rawData.last_name,
      father_name: rawData.father_name,
      mobile_number: rawData.student_mobile,
      college_email: rawData.college_email,
      institution_id: rawData.institution_id,
      academic_year_id: rawData.academic_year_id,
      degree_id: rawData.degree_id,
      department_id: rawData.department_id,
      program_id: rawData.program_id,
      semester_id: rawData.semester_id,
      section_id: rawData.section_id,
      institution: rawData.institution || {
        id: rawData.institution_id,
        name: ''
      },
      academic_year: rawData.academic_year || {
        id: rawData.academic_year_id,
        academic_year_name: ''
      },
      degree: rawData.degree || {
        id: rawData.degree_id,
        degree_name: ''
      },
      department: rawData.department || {
        id: rawData.department_id,
        department_name: ''
      },
      program: rawData.program || { id: rawData.program_id, program_name: '' },
      semester: rawData.semester || {
        id: rawData.semester_id,
        semester_name: ''
      },
      section: rawData.section || {
        id: rawData.section_id,
        section_name: ''
      },
      // Same rule as admission_year below: searchStudentsForBilling does not
      // select these, so they stay undefined there rather than being defaulted
      // to an empty shell.
      gender: rawData.gender,
      quota_id: rawData.quota_id,
      quota: rawData.quota || undefined,
      community_category_id: rawData.community_category_id,
      community_category: rawData.community_category || undefined,
      accommodation_type_id: rawData.accommodation_type_id,
      accommodation_type: rawData.accommodation_type || undefined,
      // searchStudentsForBilling does not select these, so they stay undefined
      // there rather than being defaulted to an empty shell — the detail page
      // is the only caller that renders them.
      admission_year_id: rawData.admission_year_id,
      admission_year: rawData.admission_year || undefined,
      lifecycle_status: rawData.lifecycle_status,
      outstanding_amount: outstandingAmount
    };
  }

  static async searchStudentsForBilling(
    filters: StudentSearchFilters = {}
  ): Promise<StudentForBillingListResponse> {
    try {
      let query = this.supabase
        .from('learners_profiles')
        .select(
          `
          id,
          roll_number,
          register_number,
          first_name, last_name,
          father_name,
          student_mobile,
          college_email,
          institution_id,
          academic_year_id,
          degree_id,
          department_id,
          program_id,
          semester_id,
          section_id,
          institution:institutions!institution_id(id, name),
          academic_year:academic_years!academic_year_id(id, academic_year_name),
          degree:degrees!degree_id(id, degree_name),
          department:departments!department_id(id, department_name),
          program:programs!program_id(id, program_name),
          semester:semesters!semester_id(id, semester_name),
          section:sections!section_id(id, section_name)
        `,
          { count: 'exact' }
        )
        .in('lifecycle_status', [...BILLABLE_LIFECYCLE_STATUSES])
        .eq('is_profile_complete', true);

      // Apply filters
      // Apply hierarchy filters in order
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      // Entity-type gate. Follows the same .in() shape as the accommodation
      // filter below: resolve the matching institution ids and filter the FK
      // column directly, rather than filtering the embedded institutions
      // resource (which PostgREST only allows behind an !inner join).
      // Without this, "All institutions" also returned school learners.
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

      if (filters.academic_year_id) {
        query = query.eq('academic_year_id', filters.academic_year_id);
      }

      if (filters.degree_id) {
        query = query.eq('degree_id', filters.degree_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }

      if (filters.semester_id) {
        query = query.eq('semester_id', filters.semester_id);
      }

      if (filters.section_id) {
        query = query.eq('section_id', filters.section_id);
      }

      // Accommodation-type filter. The UI sends a catalog *code* (e.g. 'hostel');
      // resolve it to the global accommodation_type_id(s) and filter the
      // (left-joined) FK column directly. Using .in() avoids the
      // PostgREST "can't filter an embedded resource without !inner" pitfall.
      if (filters.accommodation_type) {
        const accommodationTypeIds = await this.resolveAccommodationTypeIds(
          filters.accommodation_type
        );
        // A real code always resolves to at least one id; the empty-array guard
        // forces a no-match instead of silently returning every student.
        query = query.in(
          'accommodation_type_id',
          accommodationTypeIds.length > 0
            ? accommodationTypeIds
            : ['00000000-0000-0000-0000-000000000000']
        );
      }

      // Unified operator search. One typed/scanned string matched against
      // every identifier the counter uses, in a single `or(...)` so the
      // search stays ONE round trip instead of five sequential lookups.
      // Takes precedence over the discrete name/roll/mobile filters, which
      // the bulk-create and bulk-edit pages still pass programmatically.
      const unifiedQuery = filters.query?.trim();
      if (unifiedQuery) {
        const term = this.escapeForOrFilter(unifiedQuery);
        query = query.or(
          [
            `first_name.ilike.%${term}%`,
            `last_name.ilike.%${term}%`,
            `roll_number.ilike.%${term}%`,
            `register_number.ilike.%${term}%`,
            `student_mobile.ilike.%${term}%`
          ].join(',')
        );
      } else {
        if (filters.first_name) {
          query = query.ilike('first_name', `%${filters.first_name}%`);
        }

        if (filters.last_name) {
          query = query.ilike('last_name', `%${filters.last_name}%`);
        }

        if (filters.roll_number) {
          query = query.ilike('roll_number', `%${filters.roll_number}%`);
        }

        if (filters.register_number) {
          query = query.ilike(
            'register_number',
            `%${filters.register_number}%`
          );
        }

        if (filters.mobile_number) {
          query = query.ilike('student_mobile', `%${filters.mobile_number}%`);
        }
      }

      // Apply sorting
      query = query.order('first_name', { ascending: true });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      query = query.range((page - 1) * limit, page * limit - 1);

      const { data, count, error } = await query;

      if (error) throw error;

      // Bulk fetch outstanding amounts (eliminates N+1 queries)
      const studentIds = (data || []).map((s: any) => s.id);
      const outstandingMap = await this.bulkCalculateOutstanding(studentIds);

      // Map students with their outstanding amounts
      const studentsWithOutstanding: StudentForBilling[] = (data || []).map(
        (student: any) =>
          this.mapToStudentForBilling(
            student,
            outstandingMap.get(student.id) || 0
          )
      );

      return {
        data: studentsWithOutstanding,
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error searching students for billing:', error);
      throw error;
    }
  }

  static async getStudentForBilling(
    studentId: string,
    options: { includeNonBillable?: boolean } = {}
  ): Promise<StudentForBilling> {
    try {
      let query = this.supabase
        .from('learners_profiles')
        .select(
          `
          id,
          roll_number,
          register_number,
          first_name, last_name,
          father_name,
          student_mobile,
          college_email,
          gender,
          lifecycle_status,
          quota_id,
          community_category_id,
          accommodation_type_id,
          admission_year_id,
          institution_id,
          academic_year_id,
          degree_id,
          department_id,
          program_id,
          semester_id,
          section_id,
          institution:institutions!institution_id(id, name),
          academic_year:academic_years!academic_year_id(id, academic_year_name),
          degree:degrees!degree_id(id, degree_name),
          department:departments!department_id(id, department_name),
          program:programs!program_id(id, program_name),
          semester:semesters!semester_id(id, semester_name),
          section:sections!section_id(id, section_name),
          quota:quotas!quota_id(id, name),
          community_category:community_categories!community_category_id(id, code),
          accommodation_type:accommodation_types!accommodation_type_id(id, code, name),
          admission_year:admission_years!admission_year_id(id, admission_year_name, year)
        `
        )
        .eq('id', studentId);

      // Billing pickers/creation flows only work with billable learners, but
      // the read-only detail page must load ANY learner — bills raised before
      // a learner became rejected/withdrawn still need to be viewable
      // (cancel/refund), and filtering here made those pages throw PGRST116
      // ("students not found") for everyone.
      if (!options.includeNonBillable) {
        query = query.in('lifecycle_status', [...BILLABLE_LIFECYCLE_STATUSES]);
      }

      const { data, error } = await query.single();

      if (error) throw error;

      const outstandingAmount = await this.calculateStudentOutstanding(
        studentId
      );
      return this.mapToStudentForBilling(data, outstandingAmount);
    } catch (error) {
      console.error('Error fetching student for billing:', error);
      throw error;
    }
  }

  static async getStudentBillingSummary(
    studentId: string
  ): Promise<StudentBillingSummary> {
    try {
      // Get student details (read-only summary — include non-billable
      // learners so bills raised before rejection/withdrawal stay viewable)
      const student = await this.getStudentForBilling(studentId, {
        includeNonBillable: true
      });

      // Get all bills for the student
      const billsQuery: any = this.supabase
        .from('billing_student_bills')
        .select(
          `
          *,
          creator:profiles!fk_billing_student_bills_created_by(id, full_name),
          item_category:billing_categories(
            id,
            category_name,
            kind,
            amount,
            frequency
          ),
          academic_year:academic_years(id, academic_year_name),
          receipt_items:billing_receipt_items(
            *,
            receipt:billing_receipts(*)
          )
        `
        )
        .eq('student_id', studentId)
        .order('due_date', { ascending: false });
      const { data: bills, error: billsError } = await billsQuery;

      if (billsError) throw billsError;

      // Get all receipts for the student
      const receiptsQuery: any = this.supabase
        .from('billing_receipts')
        .select(
          `
          *,
          creator:profiles!fk_billing_receipts_created_by(id, full_name),
          accountant:profiles!fk_billing_receipts_accountant(id, full_name),
          receipt_items:billing_receipt_items(
            *,
            bill:billing_student_bills(*)
          ),
          refunds:billing_refunds(*)
        `
        )
        .eq('student_id', studentId)
        .order('receipt_date', { ascending: false });
      const { data: receipts, error: receiptsError } = await receiptsQuery;

      if (receiptsError) throw receiptsError;

      // Get all discounts for the student's bills
      const billIds = (bills as any[])?.map((bill) => bill.id) || [];
      let discounts: any[] = [];
      if (billIds.length > 0) {
        const { data: discountData, error: discountsError } =
          await this.supabase
            .from('billing_discounts')
            .select(
              `
            *,
            creator:profiles!fk_billing_discounts_created_by(id, full_name),
            bill:billing_student_bills(*)
          `
            )
            .in('bill_id', billIds)
            .order('created_at', { ascending: false });

        if (discountsError) throw discountsError;
        discounts = discountData || [];
      }

      // Get all refunds for the student's receipts
      const receiptIds = (receipts as any[])?.map((receipt) => receipt.id) || [];
      let refunds: any[] = [];
      if (receiptIds.length > 0) {
        const { data: refundData, error: refundsError } = await this.supabase
          .from('billing_refunds')
          .select(
            `
            *,
            creator:profiles!fk_billing_refunds_created_by(id, full_name),
            receipt:billing_receipts(*)
          `
          )
          .in('receipt_id', receiptIds)
          .order('created_at', { ascending: false });

        if (refundsError) throw refundsError;
        refunds = refundData || [];
      }

      // Get all invoices for the student
      const { data: invoices, error: invoicesError } = await this.supabase
        .from('billing_invoices')
        .select(
          `
          *,
          invoice_items:billing_invoice_items(
            *,
            receipt:billing_receipts(*)
          )
        `
        )
        .eq('student_id', studentId)
        .order('invoice_date', { ascending: false });

      if (invoicesError) throw invoicesError;

      // Calculate summary
      // Count only bills the learner actually owes. A raw `bills.length`
      // counted cancelled and superseded rows too, so a learner with one live
      // bill and one cancelled bill was reported as having 2 bills.
      const totalBills = (bills as any[])?.filter(isBillableBill).length || 0;

      // Calculate total paid amount from receipts
      const totalReceiptAmount =
        (receipts as any[])?.reduce((sum, receipt) => sum + receipt.payment_amount, 0) ||
        0;

      // Calculate total processed refunds amount
      const totalProcessedRefunds =
        refunds
          ?.filter((refund) => refund.approval_status === 'processed')
          .reduce((sum, refund) => sum + refund.refund_amount, 0) || 0;

      // Net paid amount = total receipts - processed refunds
      const paidAmount = totalReceiptAmount - totalProcessedRefunds;

      const outstandingAmount = student.outstanding_amount;
      const overdueAmount =
        (bills as any[])
          ?.filter((bill) => bill.status === 'overdue')
          .reduce((sum, bill) => sum + bill.balance_amount, 0) || 0;
      const discountAmount =
        discounts
          ?.filter((discount) => discount.approval_status === 'approved')
          .reduce((sum, discount) => sum + discount.discount_amount, 0) || 0;

      // Total refund amount (for reporting purposes) - includes all refunds regardless of status
      const refundAmount =
        refunds?.reduce((sum, refund) => sum + refund.refund_amount, 0) || 0;

      return {
        student,
        bills: (bills || []) as StudentBill[],
        receipts: (receipts || []) as BillingReceipt[],
        discounts,
        refunds,
        invoices: (invoices || []) as BillingInvoice[],
        summary: {
          total_bills: totalBills,
          paid_amount: paidAmount,
          outstanding_amount: outstandingAmount,
          overdue_amount: overdueAmount,
          discount_amount: discountAmount,
          refund_amount: refundAmount
        }
      };
    } catch (error) {
      console.error('Error fetching student billing summary:', error);
      throw error;
    }
  }

  private static async calculateStudentOutstanding(
    studentId: string
  ): Promise<number> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'calculate_student_outstanding',
        { student_uuid: studentId }
      );

      if (error) throw error;
      return data || 0;
    } catch (error) {
      console.error('Error calculating student outstanding:', error);
      return 0; // Return 0 if calculation fails
    }
  }

  /**
   * Bulk calculate outstanding amounts for multiple students in a single query.
   * Eliminates N+1 query pattern by fetching all amounts at once.
   */
  private static async bulkCalculateOutstanding(
    studentIds: string[]
  ): Promise<Map<string, number>> {
    const outstandingMap = new Map<string, number>();

    if (studentIds.length === 0) {
      return outstandingMap;
    }

    try {
      const { data, error } = await (this.supabase as any).rpc(
        'bulk_calculate_student_outstanding',
        { student_ids: studentIds }
      );

      if (error) throw error;

      // Build map from results
      if (data) {
        for (const row of data) {
          outstandingMap.set(row.student_id, row.outstanding_amount || 0);
        }
      }

      // Ensure all requested students have an entry (default to 0)
      for (const id of studentIds) {
        if (!outstandingMap.has(id)) {
          outstandingMap.set(id, 0);
        }
      }

      return outstandingMap;
    } catch (error) {
      console.error('Error bulk calculating student outstanding:', error);
      // Return map with all zeros on error
      for (const id of studentIds) {
        outstandingMap.set(id, 0);
      }
      return outstandingMap;
    }
  }

  /**
   * Sanitize a user/scanner supplied term for use inside a PostgREST
   * `or=(...)` list.
   *
   * That grammar is positional: `,` separates conditions, `(` `)` group them
   * and `"` quotes a value. A raw comma or bracket in the term does not throw
   * — it silently reinterprets the rest of the filter as new conditions, which
   * would widen the result set instead of narrowing it. Roll numbers, register
   * numbers, mobile numbers and names never legitimately contain these, so
   * they are dropped rather than escaped.
   */
  private static escapeForOrFilter(term: string): string {
    return term.replace(/[,()"\\*]/g, '').trim();
  }

  /**
   * Resolve an accommodation-type catalog code (e.g. 'hostel') to the matching
   * accommodation_type_id(s). The catalog is global (one row per code).
   * Returns [] on error (caller forces no-match).
   */
  private static async resolveAccommodationTypeIds(
    code: string
  ): Promise<string[]> {
    try {
      const query = this.supabase
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

  // Cache for resolveInstitutionIdsByEntityType below.
  private static institutionIdsByEntityType = new Map<string, string[]>();

  /**
   * Resolve every institution id of a given entity_type ('institution' =
   * college, 'school', 'admin_office', 'company').
   *
   * Cached for the page's lifetime — the institutions table is a small,
   * effectively static catalog and this runs on every student search
   * (including each pagination step and the export).
   *
   * Returns [] on error, which the caller turns into a deliberate no-match
   * rather than silently widening the result set.
   */
  private static async resolveInstitutionIdsByEntityType(
    entityType: string
  ): Promise<string[]> {
    const cached = this.institutionIdsByEntityType.get(entityType);
    if (cached) return cached;

    try {
      const { data, error } = await this.supabase
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

  static async getStudentsByInstitution(
    institutionId: string,
    limit: number = 50
  ): Promise<StudentForBilling[]> {
    try {
      const { data, error } = await this.supabase
        .from('learners_profiles')
        .select(
          `
          id,
          roll_number,
          first_name, last_name,
          father_name,
          student_mobile,
          college_email,
          institution_id,
          department_id,
          program_id,
          semester_id,
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters(id, semester_name)
        `
        )
        .eq('institution_id', institutionId)
        .in('lifecycle_status', [...BILLABLE_LIFECYCLE_STATUSES])
        .order('first_name', { ascending: true })
        .limit(limit);

      if (error) throw error;

      // Bulk fetch outstanding amounts (eliminates N+1 queries)
      const studentIds = (data || []).map((s: any) => s.id);
      const outstandingMap = await this.bulkCalculateOutstanding(studentIds);

      // Map students with their outstanding amounts
      const studentsWithOutstanding: StudentForBilling[] = (data || []).map(
        (student: any) =>
          this.mapToStudentForBilling(
            student,
            outstandingMap.get(student.id) || 0
          )
      );

      return studentsWithOutstanding;
    } catch (error) {
      console.error('Error fetching students by institution:', error);
      throw error;
    }
  }

  static async getStudentsWithOutstandingBills(
    institutionId?: string,
    limit: number = 50
  ): Promise<StudentForBilling[]> {
    try {
      let query = this.supabase
        .from('learners_profiles')
        .select(
          `
          id,
          roll_number,
          first_name, last_name,
          father_name,
          student_mobile,
          college_email,
          institution_id,
          academic_year_id,
          degree_id,
          department_id,
          program_id,
          semester_id,
          section_id,
          institution:institutions!institution_id(id, name),
          academic_year:academic_years!academic_year_id(id, academic_year_name),
          degree:degrees!degree_id(id, degree_name),
          department:departments!department_id(id, department_name),
          program:programs!program_id(id, program_name),
          semester:semesters!semester_id(id, semester_name),
          section:sections!section_id(id, section_name)
        `
        )
        .in('lifecycle_status', [...BILLABLE_LIFECYCLE_STATUSES]);

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      query = query.order('first_name', { ascending: true }).limit(limit);

      const { data, error } = await query;

      if (error) throw error;

      // Bulk fetch outstanding amounts (eliminates N+1 queries)
      const studentIds = (data || []).map((s: any) => s.id);
      const outstandingMap = await this.bulkCalculateOutstanding(studentIds);

      // Filter students with outstanding bills and map them
      const studentsWithOutstanding: StudentForBilling[] = (data || [])
        .filter((student: any) => (outstandingMap.get(student.id) || 0) > 0)
        .map((student: any) =>
          this.mapToStudentForBilling(
            student,
            outstandingMap.get(student.id) || 0
          )
        );

      return studentsWithOutstanding;
    } catch (error) {
      console.error('Error fetching students with outstanding bills:', error);
      throw error;
    }
  }

  static async searchStudentsByQuery(
    searchQuery: string,
    institutionId?: string,
    limit: number = 20
  ): Promise<StudentForBilling[]> {
    try {
      let query = this.supabase
        .from('learners_profiles')
        .select(
          `
          id,
          roll_number,
          register_number,
          first_name, last_name,
          father_name,
          student_mobile,
          college_email,
          institution_id,
          department_id,
          program_id,
          semester_id,
          institution:institutions(id, name),
          department:departments(id, department_name)
        `
        )
        .in('lifecycle_status', [...BILLABLE_LIFECYCLE_STATUSES]);

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      // Search across multiple fields. register_number joins the set so a
      // scanned ID-card barcode resolves here too, and the term is sanitized
      // for the or(...) grammar (see escapeForOrFilter).
      const term = this.escapeForOrFilter(searchQuery);
      query = query.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,roll_number.ilike.%${term}%,register_number.ilike.%${term}%,student_mobile.ilike.%${term}%,college_email.ilike.%${term}%`
      );

      query = query.order('first_name', { ascending: true }).limit(limit);

      const { data, error } = await query;

      if (error) throw error;

      // Bulk fetch outstanding amounts (eliminates N+1 queries)
      const studentIds = (data || []).map((s: any) => s.id);
      const outstandingMap = await this.bulkCalculateOutstanding(studentIds);

      // Map students with their outstanding amounts
      const studentsWithOutstanding: StudentForBilling[] = (data || []).map(
        (student: any) =>
          this.mapToStudentForBilling(
            student,
            outstandingMap.get(student.id) || 0
          )
      );

      return studentsWithOutstanding;
    } catch (error) {
      console.error('Error searching students by query:', error);
      throw error;
    }
  }
}
