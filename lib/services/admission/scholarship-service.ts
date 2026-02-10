// lib/services/admission/scholarship-service.ts
// Service for scholarships and scholarship applications

import { createClientSupabaseClient } from '@/lib/supabase/client';

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

export class ScholarshipService {
  static async getScholarships(institutionId: string): Promise<Scholarship[]> {
    const supabase = createClientSupabaseClient();
    const { data: scholarships, error } = await (supabase as any)
      .from('scholarships')
      .select('*')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get application counts per scholarship
    const { data: appCounts, error: appError } = await (supabase as any)
      .from('scholarship_applications')
      .select('scholarship_id, status')
      .eq('institution_id', institutionId);

    if (appError) throw appError;

    const countMap = new Map<string, { total: number; awarded: number }>();
    for (const app of appCounts || []) {
      if (!countMap.has(app.scholarship_id)) {
        countMap.set(app.scholarship_id, { total: 0, awarded: 0 });
      }
      const entry = countMap.get(app.scholarship_id)!;
      entry.total++;
      if (app.status === 'approved') entry.awarded++;
    }

    return (scholarships || []).map((s: any) => ({
      ...s,
      applicationsCount: countMap.get(s.id)?.total || 0,
      awardedCount: countMap.get(s.id)?.awarded || 0,
    }));
  }

  static async getScholarshipApplications(institutionId: string): Promise<ScholarshipApplication[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('scholarship_applications')
      .select(`
        *,
        scholarship:scholarships(id, name, scholarship_type, benefit_type, benefit_value)
      `)
      .eq('institution_id', institutionId)
      .order('applied_at', { ascending: false });

    if (error) throw error;
    return data || [];
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
    const { data, error } = await (supabase as any)
      .from('scholarships')
      .insert({
        institution_id: institutionId,
        name: input.name,
        scholarship_type: input.scholarship_type,
        benefit_type: input.benefit_type,
        benefit_value: input.benefit_value,
        total_slots: input.total_slots,
        description: input.description || null,
        eligibility_criteria: input.eligibility_criteria ? { raw: input.eligibility_criteria } : null,
        is_active: true,
        used_slots: 0,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateApplicationStatus(
    applicationId: string,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    options?: { approved_amount?: number; rejection_reason?: string }
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any)
      .from('scholarship_applications')
      .update({
        status,
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        ...(options?.approved_amount && { approved_amount: options.approved_amount }),
        ...(options?.rejection_reason && { rejection_reason: options.rejection_reason }),
      })
      .eq('id', applicationId);

    if (error) throw error;
  }
}
