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

// Generate a unique code from the scholarship name, e.g. "Merit Excellence Award" → "MEA-1234"
function generateCode(name: string): string {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('');
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${initials}-${suffix}`;
}

export class ScholarshipService {
  static async getScholarships(institutionId: string | undefined): Promise<Scholarship[]> {
    const supabase = createClientSupabaseClient();

    let scholarshipsQuery = (supabase as any)
      .from('scholarships')
      .select('*')
      .order('created_at', { ascending: false });
    if (institutionId) scholarshipsQuery = scholarshipsQuery.eq('institution_id', institutionId);
    const { data: scholarships, error } = await scholarshipsQuery;

    if (error) throw error;

    // Get application counts — scholarship_applications has institution_id directly
    let appCountsQuery = (supabase as any)
      .from('scholarship_applications')
      .select('scholarship_id, status');
    if (institutionId) appCountsQuery = appCountsQuery.eq('institution_id', institutionId);
    const { data: appCounts, error: appError } = await appCountsQuery;

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

  static async getScholarshipApplications(institutionId: string | undefined): Promise<ScholarshipApplication[]> {
    const supabase = createClientSupabaseClient();

    let query = (supabase as any)
      .from('scholarship_applications')
      .select(`
        *,
        scholarship:scholarships(id, name, scholarship_type, benefit_type, benefit_value)
      `)
      .order('applied_at', { ascending: false });
    if (institutionId) query = query.eq('institution_id', institutionId);
    const { data, error } = await query;

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
        // code is NOT NULL with no default — generate from name
        code: generateCode(input.name),
        scholarship_type: input.scholarship_type,
        benefit_type: input.benefit_type,
        benefit_value: input.benefit_value,
        total_slots: input.total_slots,
        description: input.description || null,
        eligibility_criteria: input.eligibility_criteria
          ? { raw: input.eligibility_criteria }
          : {},
        is_active: true,
        used_slots: 0,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getScholarshipById(id: string): Promise<Scholarship | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('scholarships')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return data;
  }

  static async updateScholarship(
    id: string,
    input: {
      name?: string;
      scholarship_type?: string;
      benefit_type?: string;
      benefit_value?: number;
      total_slots?: number;
      description?: string;
      eligibility_criteria?: string;
      is_active?: boolean;
      valid_from?: string | null;
      valid_until?: string | null;
      academic_year?: string | null;
    }
  ): Promise<Scholarship> {
    const supabase = createClientSupabaseClient();

    const payload: Record<string, any> = {};
    if (input.name !== undefined) {
      payload.name = input.name;
      // regenerate code when name changes
      payload.code = generateCode(input.name);
    }
    if (input.scholarship_type !== undefined) payload.scholarship_type = input.scholarship_type;
    if (input.benefit_type !== undefined) payload.benefit_type = input.benefit_type;
    if (input.benefit_value !== undefined) payload.benefit_value = input.benefit_value;
    if (input.total_slots !== undefined) payload.total_slots = input.total_slots;
    if (input.description !== undefined) payload.description = input.description || null;
    if (input.eligibility_criteria !== undefined) {
      payload.eligibility_criteria = input.eligibility_criteria
        ? { raw: input.eligibility_criteria }
        : {};
    }
    if (input.is_active !== undefined) payload.is_active = input.is_active;
    if (input.valid_from !== undefined) payload.valid_from = input.valid_from;
    if (input.valid_until !== undefined) payload.valid_until = input.valid_until;
    if (input.academic_year !== undefined) payload.academic_year = input.academic_year;

    const { data, error } = await (supabase as any)
      .from('scholarships')
      .update(payload)
      .eq('id', id)
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
