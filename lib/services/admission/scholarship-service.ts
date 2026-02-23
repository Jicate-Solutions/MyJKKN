// lib/services/admission/scholarship-service.ts
// Service for scholarships and scholarship applications

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ── Interface (kept stable so the UI doesn't change) ────────────────────────

export interface Scholarship {
  id: string;
  name: string;
  scholarship_type: string;
  benefit_type: string;
  benefit_value: number | null;
  max_benefit: number | null;
  total_slots: number | null;
  used_slots: number | null;
  is_active: boolean;
  eligibility_criteria: Record<string, any> | null;
  description: string | null;
  code: string | null;
  academic_year: string | null;
  valid_from: string | null;
  valid_until: string | null;
  requires_application: boolean;
  auto_qualify: boolean;
  created_at: string;
  // Computed
  applicationsCount?: number;
  awardedCount?: number;
}

export interface ScholarshipApplication {
  id: string;
  scholarship_id: string;
  application_id: string | null;
  status: string;
  applied_at: string;
  approved_amount: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  review_notes: string | null;
  documents: any | null;
  supporting_data: any | null;
  // Joined
  scholarship?: Scholarship;
}

// ── DB column → interface mapping ────────────────────────────────────────────
// DB table: admission_scholarships
//   type              → scholarship_type
//   amount / percentage → benefit_value  (benefit_type = 'fixed' | 'percentage')
//   max_recipients    → total_slots
//   deadline          → valid_until

function mapDbRowToScholarship(s: any): Scholarship {
  const isPercentage = s.percentage != null;
  return {
    id: s.id,
    name: s.name,
    scholarship_type: s.type || '',
    benefit_type: isPercentage ? 'percentage' : 'fixed',
    benefit_value: isPercentage ? (s.percentage ?? 0) : (s.amount ?? 0),
    max_benefit: null,
    total_slots: s.max_recipients ?? 0,
    used_slots: 0, // not tracked in admission_scholarships schema
    is_active: s.is_active ?? true,
    eligibility_criteria: s.eligibility_criteria ? { raw: s.eligibility_criteria } : null,
    description: s.description ?? null,
    code: null,
    academic_year: null,
    valid_from: null,
    valid_until: s.deadline ?? null,
    requires_application: true,
    auto_qualify: false,
    created_at: s.created_at,
  };
}

export class ScholarshipService {
  static async getScholarships(institutionId: string | undefined): Promise<Scholarship[]> {
    const supabase = createClientSupabaseClient();

    let scholarshipsQuery = (supabase as any)
      .from('admission_scholarships')
      .select('*')
      .order('created_at', { ascending: false });
    if (institutionId) scholarshipsQuery = scholarshipsQuery.eq('institution_id', institutionId);
    const { data: scholarships, error } = await scholarshipsQuery;

    if (error) throw error;

    // Get application counts per scholarship (RLS already scopes by institution)
    const scholarshipIds = (scholarships || []).map((s: any) => s.id);
    let appCounts: any[] = [];
    if (scholarshipIds.length > 0) {
      const { data } = await (supabase as any)
        .from('admission_scholarship_applications')
        .select('scholarship_id, status')
        .in('scholarship_id', scholarshipIds);
      appCounts = data || [];
    }

    const countMap = new Map<string, { total: number; awarded: number }>();
    for (const app of appCounts) {
      if (!countMap.has(app.scholarship_id)) {
        countMap.set(app.scholarship_id, { total: 0, awarded: 0 });
      }
      const entry = countMap.get(app.scholarship_id)!;
      entry.total++;
      if (app.status === 'approved') entry.awarded++;
    }

    return (scholarships || []).map((s: any) => ({
      ...mapDbRowToScholarship(s),
      applicationsCount: countMap.get(s.id)?.total || 0,
      awardedCount: countMap.get(s.id)?.awarded || 0,
    }));
  }

  static async getScholarshipApplications(institutionId: string | undefined): Promise<ScholarshipApplication[]> {
    const supabase = createClientSupabaseClient();

    // RLS on admission_scholarship_applications scopes by institution automatically.
    // For super_admin (institutionId=undefined) it returns all rows.
    // For regular users their RLS policy limits to their institution's scholarships.
    let query = (supabase as any)
      .from('admission_scholarship_applications')
      .select(`
        *,
        scholarship:admission_scholarships(id, name, type, amount, percentage)
      `)
      .order('applied_at', { ascending: false });

    // Extra institution filter for non-super_admin to mirror what RLS already does
    if (institutionId) {
      const { data: schIds } = await (supabase as any)
        .from('admission_scholarships')
        .select('id')
        .eq('institution_id', institutionId);
      const ids = (schIds || []).map((s: any) => s.id);
      if (ids.length === 0) return [];
      query = query.in('scholarship_id', ids);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((app: any) => ({
      ...app,
      rejection_reason: app.remarks ?? null,
      review_notes: null,
      documents: null,
      supporting_data: null,
      scholarship: app.scholarship
        ? {
            ...mapDbRowToScholarship(app.scholarship),
            name: app.scholarship.name,
          }
        : undefined,
    }));
  }

  static async createScholarship(
    institutionId: string,
    input: {
      name: string;
      scholarship_type: string;
      benefit_type: string;
      benefit_value: number;
      total_slots: number;
      description?: string;
      eligibility_criteria?: string;
    }
  ): Promise<Scholarship> {
    const supabase = createClientSupabaseClient();

    const insertPayload: Record<string, any> = {
      institution_id: institutionId,
      name: input.name,
      type: input.scholarship_type,
      max_recipients: input.total_slots,
      description: input.description || null,
      eligibility_criteria: input.eligibility_criteria || null,
      is_active: true,
    };

    // DB stores fixed amount and percentage separately
    if (input.benefit_type === 'percentage') {
      insertPayload.percentage = input.benefit_value;
    } else {
      insertPayload.amount = input.benefit_value;
    }

    const { data, error } = await (supabase as any)
      .from('admission_scholarships')
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw error;
    return mapDbRowToScholarship(data);
  }

  static async updateApplicationStatus(
    applicationId: string,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    options?: { approved_amount?: number; rejection_reason?: string }
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any)
      .from('admission_scholarship_applications')
      .update({
        status,
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        ...(options?.approved_amount && { approved_amount: options.approved_amount }),
        // DB uses 'remarks' for rejection notes
        ...(options?.rejection_reason && { remarks: options.rejection_reason }),
      })
      .eq('id', applicationId);

    if (error) throw error;
  }
}
