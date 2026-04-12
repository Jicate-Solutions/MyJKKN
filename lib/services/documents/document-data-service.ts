/**
 * Document Data Service
 * Gathers all data needed for document generation from existing MyJKKN tables.
 * Single queries with JOINs — no N+1 problems.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LearnerCoreData, BillingData, AuthorityData, DocumentType } from '@/types/documents';

export class DocumentDataService {
  private static supabase = createClientSupabaseClient();

  /**
   * Fetch core learner data with all academic hierarchy joins.
   * Single query, used by all 15 document types.
   */
  static async getLearnerCoreData(learnerId: string): Promise<LearnerCoreData> {
    try {
      const { data, error } = await this.supabase
        .from('learners_profiles')
        .select(`
          id, first_name, last_name, date_of_birth, gender,
          roll_number, register_number, student_photo_url,
          student_mobile, student_email,
          father_name, mother_name,
          permanent_address_street, permanent_address_district,
          permanent_address_state, permanent_address_pin_code,
          lifecycle_status, admission_year,
          aadhar_number, blood_group, religion, community, caste,
          tenth_marks, twelfth_marks,
          institution_id,
          institutions:institution_id (
            id, name, logo_url, address_line1, city, state, pin_code,
            counselling_code, accredited_by
          ),
          degrees:degree_id ( degree_name, degree_type ),
          departments:department_id ( department_name ),
          programs:program_id ( program_name, program_type ),
          semesters:semester_id ( semester_name ),
          sections:section_id ( section_name ),
          academic_years:academic_year_id ( academic_year_name ),
          batches:batch_id ( batch_name ),
          regulations:regulation_id ( regulation_code )
        `)
        .eq('id', learnerId)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Learner not found');

      // Flatten joined data
      const inst = data.institutions as Record<string, unknown> | null;
      return {
        ...data,
        institution_id: data.institution_id,
        institution_name: String((inst as Record<string, unknown>)?.name || ''),
        institution_logo_url: (inst as Record<string, unknown>)?.logo_url as string | undefined,
        institution_address: (inst as Record<string, unknown>)?.address_line1 as string | undefined,
        institution_city: (inst as Record<string, unknown>)?.city as string | undefined,
        institution_state: (inst as Record<string, unknown>)?.state as string | undefined,
        institution_pin_code: (inst as Record<string, unknown>)?.pin_code as string | undefined,
        institution_counselling_code: (inst as Record<string, unknown>)?.counselling_code as string | undefined,
        institution_accredited_by: (inst as Record<string, unknown>)?.accredited_by as string | undefined,
        degree_name: (data.degrees as Record<string, unknown> | null)?.degree_name as string | undefined,
        degree_type: (data.degrees as Record<string, unknown> | null)?.degree_type as string | undefined,
        department_name: (data.departments as Record<string, unknown> | null)?.department_name as string | undefined,
        program_name: (data.programs as Record<string, unknown> | null)?.program_name as string | undefined,
        program_type: (data.programs as Record<string, unknown> | null)?.program_type as string | undefined,
        section_name: (data.sections as Record<string, unknown> | null)?.section_name as string | undefined,
        semester_name: (data.semesters as Record<string, unknown> | null)?.semester_name as string | undefined,
        academic_year_name: (data.academic_years as Record<string, unknown> | null)?.academic_year_name as string | undefined,
        batch_name: (data.batches as Record<string, unknown> | null)?.batch_name as string | undefined,
        regulation_code: (data.regulations as Record<string, unknown> | null)?.regulation_code as string | undefined,
        tenth_marks: data.tenth_marks as LearnerCoreData['tenth_marks'],
        twelfth_marks: data.twelfth_marks as LearnerCoreData['twelfth_marks'],
      } as unknown as LearnerCoreData;
    } catch (error) {
      console.error('[documents/data] Failed to fetch learner core data:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch learner data');
    }
  }

  /**
   * Fetch all active learners in a section (for bulk generation).
   * Single query returning all learners with hierarchy.
   */
  static async getSectionLearnersData(sectionId: string): Promise<LearnerCoreData[]> {
    try {
      const { data, error } = await this.supabase
        .from('learners_profiles')
        .select(`
          id, first_name, last_name, date_of_birth, gender,
          roll_number, register_number, student_photo_url,
          student_mobile, student_email,
          father_name, mother_name,
          permanent_address_street, permanent_address_district,
          permanent_address_state, permanent_address_pin_code,
          lifecycle_status, institution_id,
          institutions:institution_id ( id, name, logo_url, address_line1, city, state, pin_code, counselling_code, accredited_by ),
          degrees:degree_id ( degree_name, degree_type ),
          departments:department_id ( department_name ),
          programs:program_id ( program_name, program_type ),
          semesters:semester_id ( semester_name ),
          sections:section_id ( section_name ),
          academic_years:academic_year_id ( academic_year_name ),
          batches:batch_id ( batch_name ),
          regulations:regulation_id ( regulation_code )
        `)
        .eq('section_id', sectionId)
        .eq('lifecycle_status', 'active')
        .order('roll_number', { ascending: true });

      if (error) throw error;

      return (data || []).map((d) => {
        const inst = d.institutions as Record<string, unknown> | null;
        return {
          ...d,
          institution_name: String((inst as Record<string, unknown>)?.name || ''),
          institution_logo_url: (inst as Record<string, unknown>)?.logo_url as string | undefined,
          institution_address: (inst as Record<string, unknown>)?.address_line1 as string | undefined,
          institution_city: (inst as Record<string, unknown>)?.city as string | undefined,
          institution_state: (inst as Record<string, unknown>)?.state as string | undefined,
          institution_pin_code: (inst as Record<string, unknown>)?.pin_code as string | undefined,
          institution_counselling_code: (inst as Record<string, unknown>)?.counselling_code as string | undefined,
          institution_accredited_by: (inst as Record<string, unknown>)?.accredited_by as string | undefined,
          degree_name: (d.degrees as Record<string, unknown> | null)?.degree_name as string | undefined,
          degree_type: (d.degrees as Record<string, unknown> | null)?.degree_type as string | undefined,
          department_name: (d.departments as Record<string, unknown> | null)?.department_name as string | undefined,
          program_name: (d.programs as Record<string, unknown> | null)?.program_name as string | undefined,
          program_type: (d.programs as Record<string, unknown> | null)?.program_type as string | undefined,
          section_name: (d.sections as Record<string, unknown> | null)?.section_name as string | undefined,
          semester_name: (d.semesters as Record<string, unknown> | null)?.semester_name as string | undefined,
          academic_year_name: (d.academic_years as Record<string, unknown> | null)?.academic_year_name as string | undefined,
          batch_name: (d.batches as Record<string, unknown> | null)?.batch_name as string | undefined,
          regulation_code: (d.regulations as Record<string, unknown> | null)?.regulation_code as string | undefined,
        } as LearnerCoreData;
      });
    } catch (error) {
      console.error('[documents/data] Failed to fetch section learners:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch section learners');
    }
  }

  /**
   * Fetch billing data for fee notice documents.
   */
  static async getLearnerBillingData(learnerId: string): Promise<BillingData> {
    try {
      const { data, error } = await this.supabase
        .from('billing_student_bills')
        .select('id, bill_description, final_amount, due_date, status, balance_amount')
        .eq('student_id', learnerId)
        .in('status', ['unpaid', 'partial'])
        .order('due_date', { ascending: true });

      if (error) throw error;

      const bills = (data || []).map((b) => ({
        id: b.id,
        description: b.bill_description || 'Fee',
        amount: Number(b.final_amount) || 0,
        due_date: b.due_date || '',
        status: b.status as 'unpaid' | 'paid' | 'partial',
        balance: Number(b.balance_amount) || 0,
      }));

      return {
        totalOutstanding: bills.reduce((sum, b) => sum + b.balance, 0),
        bills,
      };
    } catch (error) {
      console.error('[documents/data] Failed to fetch billing data:', error);
      return { totalOutstanding: 0, bills: [] };
    }
  }

  /**
   * Fetch authority figures for signatures (Principal, HoD, Class Incharge).
   */
  static async getAuthoritySignatures(institutionId: string, departmentId?: string): Promise<AuthorityData> {
    try {
      const result: AuthorityData = {};

      // Principal
      const { data: principalData } = await this.supabase
        .from('staff')
        .select('first_name, last_name, designation')
        .eq('institution_id', institutionId)
        .ilike('designation', '%Principal%')
        .eq('is_active', true)
        .limit(1)
        .single();

      if (principalData) {
        result.principal = {
          name: `${principalData.first_name} ${principalData.last_name}`.trim(),
          designation: principalData.designation || 'Principal',
        };
      }

      // HoD (if department provided)
      if (departmentId) {
        const { data: hodData } = await this.supabase
          .from('staff')
          .select('first_name, last_name, designation')
          .eq('department_id', departmentId)
          .or('designation.ilike.%Head%,designation.ilike.%HOD%')
          .eq('is_active', true)
          .limit(1)
          .single();

        if (hodData) {
          result.hod = {
            name: `${hodData.first_name} ${hodData.last_name}`.trim(),
            designation: hodData.designation || 'Head of Department',
          };
        }
      }

      return result;
    } catch (error) {
      console.error('[documents/data] Failed to fetch authority data:', error);
      return {};
    }
  }

  /**
   * Aggregate all data needed for a specific document type.
   * Dispatches to the right combination of data fetchers.
   */
  static async aggregateDataForDocument(
    documentType: DocumentType,
    learnerId: string,
    additionalData?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const coreData = await this.getLearnerCoreData(learnerId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, unknown> = { ...(coreData as any), ...additionalData };

    // Add full_name convenience field
    result.full_name = `${coreData.first_name} ${coreData.last_name}`.trim();

    // Fetch extra data based on document type
    switch (documentType) {
      case 'fee_notice_letter': {
        const billingData = await this.getLearnerBillingData(learnerId);
        result.bills = billingData.bills;
        result.totalOutstanding = billingData.totalOutstanding;
        break;
      }
      case 'attendance_certificate':
      case 'report_card':
      case 'progress_report': {
        // Attendance data would be fetched here when available
        // For now, pass through any attendance data from additionalData
        break;
      }
      default:
        break;
    }

    return result;
  }
}
