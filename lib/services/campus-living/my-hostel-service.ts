import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { HostelYearService } from '@/lib/services/campus-living/hostel-year-service';

export interface MyHostelSummary {
  learnerId: string;
  accommodationType: string | null;
  hostelCategory: { id: string; name: string; type: string | null } | null;
  messCategory: { id: string; name: string } | null;
  hostelFee: number | null;
  institutionId: string | null;
}

export class MyHostelService {
  // Resolves the current learner's hostel summary from their OWN learners_profiles
  // row (RLS: students_view_own_learner_profile). learnerId = profiles.learner_id.
  static async getMySummary(learnerId: string): Promise<MyHostelSummary | null> {
    if (!learnerId) return null;
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('learners_profiles')
      .select(
        'id, accommodation_type, hostel_fee, institution_id, ' +
        'hostelCategory:hostel_category_id(id, name, type), ' +
        'messCategory:mess_category_id(id, name)'
      )
      .eq('id', learnerId)
      .maybeSingle();
    if (error) { logger.error('campus-living/my-hostel', 'getMySummary', error); throw error; }
    if (!data) return null;
    const row = data as any;
    return {
      learnerId: row.id,
      accommodationType: row.accommodation_type ?? null,
      hostelCategory: row.hostelCategory ?? null,
      messCategory: row.messCategory ?? null,
      hostelFee: row.hostel_fee ?? null,
      institutionId: row.institution_id ?? null,
    };
  }

  // Fee breakdown (additive room+mess) for the resident's hostel
  // category in the current hostel year.
  static async getMyCategoryFees(hostelCategoryId: string) {
    if (!hostelCategoryId) return [];
    const supabase = createClientSupabaseClient();
    const year = await HostelYearService.getCurrentYear();
    if (!year) return [];
    const { data, error } = await supabase
      .from('hostel_category_fees')
      .select('id, amount, frequency, mess_category_id, is_active')
      .eq('hostel_year_id', year.id)
      .eq('hostel_category_id', hostelCategoryId)
      .eq('is_active', true);
    if (error) { logger.error('campus-living/my-hostel', 'getMyCategoryFees', error); throw error; }
    return data ?? [];
  }
}
