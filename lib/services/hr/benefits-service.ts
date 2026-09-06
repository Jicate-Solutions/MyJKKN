/**
 * HR Benefits Service — C4.
 *
 * CRUD for hr_benefits_catalog + enrollment management.
 * All queries use RLS — scoped by institution via user_hr_access.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRBenefit,
  HRBenefitWithCount,
  HRBenefitEnrollment,
  CreateBenefitRequest,
  UpdateBenefitRequest,
  BenefitsEnrollmentStats,
  BenefitsFilters,
  BenefitsListResponse,
  BenefitCategory,
} from '@/types/hr-benefits';

export class BenefitsService {
  // ---------------------------------------------------------------------------
  // List benefits (paginated, with enrollment count)
  // ---------------------------------------------------------------------------

  static async listBenefits(
    supabase: SupabaseClient,
    filters: BenefitsFilters = {}
  ): Promise<BenefitsListResponse> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('hr_benefits_catalog')
      .select('*, hr_benefits_enrollments(count)', { count: 'exact' });

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const benefits: HRBenefitWithCount[] = (data ?? []).map((row: any) => ({
      id: row.id,
      institution_id: row.institution_id,
      name: row.name,
      category: row.category,
      description: row.description,
      cost_to_company: row.cost_to_company ?? 0,
      is_active: row.is_active,
      eligible_roles: row.eligible_roles ?? [],
      created_at: row.created_at,
      updated_at: row.updated_at,
      enrolled_count: row.hr_benefits_enrollments?.[0]?.count ?? 0,
    }));

    return {
      data: benefits,
      total: count ?? 0,
      page,
      limit,
    };
  }

  // ---------------------------------------------------------------------------
  // Get single benefit with enrollment details
  // ---------------------------------------------------------------------------

  static async getBenefit(
    supabase: SupabaseClient,
    id: string
  ): Promise<{
    benefit: HRBenefitWithCount;
    enrollments: HRBenefitEnrollment[];
  }> {
    const { data: benefit, error } = await supabase
      .from('hr_benefits_catalog')
      .select('*, hr_benefits_enrollments(count)')
      .eq('id', id)
      .single();

    if (error) throw error;

    // Get enrollments with staff info
    const { data: enrollments, error: enrollErr } = await supabase
      .from('hr_benefits_enrollments')
      .select('*, staff(full_name, email)')
      .eq('benefit_id', id)
      .order('enrolled_at', { ascending: false });

    if (enrollErr) throw enrollErr;

    return {
      benefit: {
        ...benefit,
        cost_to_company: benefit.cost_to_company ?? 0,
        eligible_roles: benefit.eligible_roles ?? [],
        enrolled_count: benefit.hr_benefits_enrollments?.[0]?.count ?? 0,
      } as HRBenefitWithCount,
      enrollments: (enrollments ?? []).map((e: any) => ({
        id: e.id,
        benefit_id: e.benefit_id,
        staff_id: e.staff_id,
        enrolled_at: e.enrolled_at,
        status: e.status,
        cancelled_at: e.cancelled_at,
        staff_name: e.staff?.full_name ?? 'Unknown',
        staff_email: e.staff?.email ?? '',
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Create benefit
  // ---------------------------------------------------------------------------

  static async createBenefit(
    supabase: SupabaseClient,
    data: CreateBenefitRequest
  ): Promise<HRBenefit> {
    const { data: benefit, error } = await supabase
      .from('hr_benefits_catalog')
      .insert({
        institution_id: data.institution_id,
        name: data.name,
        category: data.category,
        description: data.description ?? null,
        cost_to_company: data.cost_to_company ?? 0,
        eligible_roles: data.eligible_roles ?? [],
      })
      .select()
      .single();

    if (error) throw error;
    return benefit as HRBenefit;
  }

  // ---------------------------------------------------------------------------
  // Update benefit
  // ---------------------------------------------------------------------------

  static async updateBenefit(
    supabase: SupabaseClient,
    id: string,
    data: UpdateBenefitRequest
  ): Promise<HRBenefit> {
    const { data: benefit, error } = await supabase
      .from('hr_benefits_catalog')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return benefit as HRBenefit;
  }

  // ---------------------------------------------------------------------------
  // Delete benefit (soft — sets is_active = false)
  // ---------------------------------------------------------------------------

  static async deleteBenefit(
    supabase: SupabaseClient,
    id: string
  ): Promise<void> {
    const { error } = await supabase
      .from('hr_benefits_catalog')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  // ---------------------------------------------------------------------------
  // Enroll staff
  // ---------------------------------------------------------------------------

  static async enrollStaff(
    supabase: SupabaseClient,
    benefitId: string,
    staffId: string
  ): Promise<HRBenefitEnrollment> {
    const { data: enrollment, error } = await supabase
      .from('hr_benefits_enrollments')
      .insert({
        benefit_id: benefitId,
        staff_id: staffId,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw error;
    return enrollment as HRBenefitEnrollment;
  }

  // ---------------------------------------------------------------------------
  // Enrollment stats (dashboard summary)
  // ---------------------------------------------------------------------------

  static async getEnrollmentStats(
    supabase: SupabaseClient,
    institutionId?: string
  ): Promise<BenefitsEnrollmentStats> {
    // Get all benefits
    let benefitQuery = supabase
      .from('hr_benefits_catalog')
      .select('id, category, cost_to_company, is_active');

    if (institutionId) {
      benefitQuery = benefitQuery.eq('institution_id', institutionId);
    }

    const { data: benefits, error: bErr } = await benefitQuery;
    if (bErr) throw bErr;

    const allBenefits = benefits ?? [];
    const activeBenefitIds = allBenefits
      .filter((b) => b.is_active)
      .map((b) => b.id);

    // Get active enrollment counts
    let enrollQuery = supabase
      .from('hr_benefits_enrollments')
      .select('benefit_id')
      .eq('status', 'active');

    if (activeBenefitIds.length > 0) {
      enrollQuery = enrollQuery.in('benefit_id', activeBenefitIds);
    }

    const { data: enrollments, error: eErr } = await enrollQuery;
    if (eErr) throw eErr;

    const activeEnrollments = enrollments ?? [];

    // Count enrollments per benefit
    const enrollCountMap = new Map<string, number>();
    for (const e of activeEnrollments) {
      enrollCountMap.set(
        e.benefit_id,
        (enrollCountMap.get(e.benefit_id) ?? 0) + 1
      );
    }

    // Compute total monthly cost (benefit cost * enrollments)
    let totalMonthlyCost = 0;
    for (const b of allBenefits) {
      if (b.is_active) {
        const count = enrollCountMap.get(b.id) ?? 0;
        totalMonthlyCost += (b.cost_to_company ?? 0) * count;
      }
    }

    // By category
    const catMap = new Map<
      BenefitCategory,
      { count: number; cost: number }
    >();
    for (const b of allBenefits) {
      if (!b.is_active) continue;
      const cat = b.category as BenefitCategory;
      if (!catMap.has(cat)) catMap.set(cat, { count: 0, cost: 0 });
      const entry = catMap.get(cat)!;
      entry.count++;
      entry.cost += b.cost_to_company ?? 0;
    }

    return {
      total_benefits: allBenefits.length,
      active_benefits: allBenefits.filter((b) => b.is_active).length,
      total_active_enrollments: activeEnrollments.length,
      total_monthly_cost: totalMonthlyCost,
      by_category: Array.from(catMap.entries()).map(
        ([category, { count, cost }]) => ({
          category,
          count,
          cost,
        })
      ),
    };
  }
}
