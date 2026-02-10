// lib/services/admission/lateral-entry-service.ts
// Service for lateral_entry_applications, lateral_entry_documents,
// lateral_entry_eligibility_rules, lateral_entry_vacancies

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface LateralEntryApplication {
  id: string;
  institution_id: string;
  application_number: string;
  application_type: string; // 'lateral_entry' | 'branch_transfer'
  student_name: string;
  email: string;
  phone: string;
  date_of_birth: string | null;
  current_institution: string;
  current_program: string;
  current_year: string;
  academic_score: number | null;
  cgpa: number | null;
  applied_program_id: string | null;
  applied_program_name: string | null;
  target_year: number | null;
  documents_uploaded: boolean;
  documents: unknown[];
  eligibility_status: string; // 'eligible' | 'pending_verification' | 'not_eligible'
  eligibility_notes: string | null;
  application_status: string; // 'under_review' | 'approved' | 'rejected' | 'documents_pending'
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  approval_notes: string | null;
  admission_id: string | null;
  student_id: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface LateralEntryDocument {
  id: string;
  application_id: string;
  document_type: string;
  document_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  is_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  verification_notes: string | null;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

export interface EligibilityRule {
  id: string;
  institution_id: string;
  rule_type: string;
  title: string;
  description: string | null;
  requirements: { field: string; value: string; operator?: string }[];
  target_year: string;
  target_program_id: string | null;
  target_program_name: string | null;
  min_score: number | null;
  max_score: number | null;
  min_cgpa: number | null;
  max_age: number | null;
  required_documents: string[];
  requires_entrance_exam: boolean;
  entrance_exam_name: string | null;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface LateralEntryVacancy {
  id: string;
  institution_id: string;
  program_id: string | null;
  program_name: string;
  academic_year: string;
  semester: string;
  total_intake: number;
  regular_seats: number;
  regular_filled: number;
  lateral_entry_seats: number;
  lateral_filled: number;
  available_regular: number;
  available_lateral: number;
  is_open: boolean;
  opens_at: string | null;
  closes_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LateralEntryFilters {
  institutionId: string;
  type?: string; // 'lateral_entry' | 'branch_transfer'
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateLateralEntryInput {
  institution_id: string;
  application_type: string;
  student_name: string;
  email: string;
  phone: string;
  date_of_birth?: string;
  current_institution: string;
  current_program: string;
  current_year?: string;
  academic_score?: number;
  applied_program_id?: string;
  applied_program_name?: string;
  target_year?: number;
  source?: string;
}

export class LateralEntryService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  // ── Applications ──

  static async getApplications(filters: LateralEntryFilters) {
    const { institutionId, type, status, search, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('lateral_entry_applications')
      .select('*', { count: 'exact' })
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type && type !== 'all') {
      query = query.eq('application_type', type);
    }

    if (status && status !== 'all') {
      query = query.eq('application_status', status);
    }

    if (search) {
      query = query.or(`student_name.ilike.%${search}%,application_number.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[admission/lateral-entry] Error fetching applications:', error);
      throw error;
    }

    return {
      data: (data || []) as LateralEntryApplication[],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  static async createApplication(input: CreateLateralEntryInput) {
    // Generate application number
    const prefix = input.application_type === 'branch_transfer' ? 'BT' : 'LE';
    const year = new Date().getFullYear();
    const { data: existing } = await this.supabase
      .from('lateral_entry_applications')
      .select('application_number')
      .like('application_number', `${prefix}-${year}-%`)
      .eq('institution_id', input.institution_id)
      .order('application_number', { ascending: false })
      .limit(1);

    let nextNum = 1;
    if (existing && existing.length > 0) {
      const lastNum = existing[0].application_number.split('-').pop();
      const parsed = parseInt(lastNum, 10);
      if (!isNaN(parsed)) nextNum = parsed + 1;
    }
    const applicationNumber = `${prefix}-${year}-${String(nextNum).padStart(3, '0')}`;

    const { data, error } = await this.supabase
      .from('lateral_entry_applications')
      .insert({
        ...input,
        application_number: applicationNumber,
        documents_uploaded: false,
        documents: [],
        eligibility_status: 'pending_verification',
        application_status: 'under_review',
      })
      .select()
      .single();

    if (error) {
      console.error('[admission/lateral-entry] Error creating application:', error);
      throw error;
    }

    return data as LateralEntryApplication;
  }

  static async updateApplicationStatus(id: string, status: string, notes?: string) {
    const updateData: Record<string, unknown> = {
      application_status: status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'approved') {
      updateData.reviewed_at = new Date().toISOString();
      if (notes) updateData.approval_notes = notes;
    }
    if (status === 'rejected') {
      updateData.reviewed_at = new Date().toISOString();
      if (notes) updateData.rejection_reason = notes;
    }

    const { data, error } = await this.supabase
      .from('lateral_entry_applications')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/lateral-entry] Error updating status:', error);
      throw error;
    }

    return data as LateralEntryApplication;
  }

  // ── Documents ──

  static async getDocuments(applicationId: string) {
    const { data, error } = await this.supabase
      .from('lateral_entry_documents')
      .select('*')
      .eq('application_id', applicationId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('[admission/lateral-entry] Error fetching documents:', error);
      throw error;
    }

    return (data || []) as LateralEntryDocument[];
  }

  // ── Eligibility Rules ──

  static async getEligibilityRules(institutionId: string) {
    const { data, error } = await this.supabase
      .from('lateral_entry_eligibility_rules')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('rule_type', { ascending: true });

    if (error) {
      console.error('[admission/lateral-entry] Error fetching eligibility rules:', error);
      throw error;
    }

    return (data || []) as EligibilityRule[];
  }

  // ── Vacancies ──

  static async getVacancies(institutionId: string) {
    const { data, error } = await this.supabase
      .from('lateral_entry_vacancies')
      .select('*')
      .eq('institution_id', institutionId)
      .order('program_name', { ascending: true });

    if (error) {
      console.error('[admission/lateral-entry] Error fetching vacancies:', error);
      throw error;
    }

    return (data || []) as LateralEntryVacancy[];
  }

  // ── Stats ──

  static async getStats(institutionId: string) {
    const { data, error } = await this.supabase
      .from('lateral_entry_applications')
      .select('application_type, application_status')
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[admission/lateral-entry] Error fetching stats:', error);
      throw error;
    }

    const rows = data || [];
    const total = rows.length;
    const lateralCount = rows.filter((r: { application_type: string }) => r.application_type === 'lateral_entry').length;
    const branchTransferCount = rows.filter((r: { application_type: string }) => r.application_type === 'branch_transfer').length;
    const approved = rows.filter((r: { application_status: string }) => r.application_status === 'approved').length;
    const pending = rows.filter((r: { application_status: string }) =>
      r.application_status === 'under_review' || r.application_status === 'documents_pending'
    ).length;

    return { total, lateralCount, branchTransferCount, approved, pending };
  }
}
