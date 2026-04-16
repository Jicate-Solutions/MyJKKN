/**
 * HR Recruitment Package Service (Phase 1A)
 *
 * Handles Salary negotiation history for hr_recruitment_candidate_packages.
 * Stricter RLS than parent candidates table (Learning #8).
 *
 * Spec: specs/hr-recruitment-module-spec.md — Decision R2.3
 * Pattern: mirrors LeaveService static class shape
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRRecruitmentCandidatePackage,
  HRRecruitmentCandidatePackageInsert,
} from '@/types/hr-recruitment';

// =====================================================================================
// Recruitment Package Service
// =====================================================================================

export class RecruitmentPackageService {
  // ----- List -----

  static async listPackages(
    supabase: SupabaseClient,
    candidateId: string
  ): Promise<HRRecruitmentCandidatePackage[]> {
    const { data, error } = await supabase
      .from('hr_recruitment_candidate_packages')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as HRRecruitmentCandidatePackage[];
  }

  static async getPackage(
    supabase: SupabaseClient,
    packageId: string
  ): Promise<HRRecruitmentCandidatePackage | null> {
    const { data, error } = await supabase
      .from('hr_recruitment_candidate_packages')
      .select('*')
      .eq('id', packageId)
      .maybeSingle();
    if (error) throw error;
    return data as HRRecruitmentCandidatePackage | null;
  }

  // ----- Propose -----

  /**
   * Propose a new Monthly Salary package for a candidate.
   * Any HR-authorised user with hr.recruitment.packages.propose permission can call this.
   */
  static async proposePackage(
    supabase: SupabaseClient,
    payload: HRRecruitmentCandidatePackageInsert
  ): Promise<HRRecruitmentCandidatePackage> {
    if (!payload.proposed_monthly_salary || payload.proposed_monthly_salary <= 0) {
      throw new Error('proposed_monthly_salary must be a positive number');
    }

    const { data, error } = await supabase
      .from('hr_recruitment_candidate_packages')
      .insert({
        candidate_id: payload.candidate_id,
        hr_organization_id: payload.hr_organization_id ?? null,
        proposed_by: payload.proposed_by,
        proposed_monthly_salary: payload.proposed_monthly_salary,
        proposed_monthly_salary_breakdown: payload.proposed_monthly_salary_breakdown ?? null,
        currency: payload.currency ?? 'INR',
        is_counter_offer: payload.is_counter_offer ?? false,
        parent_package_id: payload.parent_package_id ?? null,
        notes: payload.notes ?? null,
        status: 'proposed',
      })
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentCandidatePackage;
  }

  // ----- Approve -----

  /**
   * Approve a proposed package. Sets status='approved' and marks the parent
   * candidate's status as 'package_fixed'.
   */
  static async approvePackage(
    supabase: SupabaseClient,
    packageId: string,
    approverId: string
  ): Promise<HRRecruitmentCandidatePackage> {
    const pkg = await this.getPackage(supabase, packageId);
    if (!pkg) throw new Error('Package not found');
    if (pkg.status !== 'proposed') {
      throw new Error(`Cannot approve package in status '${pkg.status}'. Only 'proposed' packages can be approved.`);
    }

    const now = new Date().toISOString();

    // Mark the package as approved
    const { data, error } = await supabase
      .from('hr_recruitment_candidate_packages')
      .update({
        status: 'approved',
        approved_by: approverId,
        approved_at: now,
      })
      .eq('id', packageId)
      .select()
      .single();
    if (error) throw error;

    // Advance parent candidate to package_fixed
    const { error: candidateErr } = await supabase
      .from('hr_recruitment_candidates')
      .update({ status: 'package_fixed' })
      .eq('id', pkg.candidate_id)
      .in('status', ['approved', 'pending_approval', 'submitted']);
    if (candidateErr) throw candidateErr;

    return data as HRRecruitmentCandidatePackage;
  }

  // ----- Counter offer -----

  /**
   * Create a counter-offer package. Marks the parent package as 'countered'
   * and creates a child package with is_counter_offer=true.
   */
  static async counterOffer(
    supabase: SupabaseClient,
    parentPackageId: string,
    newPackage: Omit<HRRecruitmentCandidatePackageInsert, 'parent_package_id' | 'is_counter_offer'>
  ): Promise<HRRecruitmentCandidatePackage> {
    const parent = await this.getPackage(supabase, parentPackageId);
    if (!parent) throw new Error('Parent package not found');
    if (!['proposed'].includes(parent.status)) {
      throw new Error(`Cannot counter a package in status '${parent.status}'`);
    }

    // Mark parent as countered
    const { error: parentErr } = await supabase
      .from('hr_recruitment_candidate_packages')
      .update({ status: 'countered' })
      .eq('id', parentPackageId);
    if (parentErr) throw parentErr;

    // Create child counter-offer package
    const { data, error } = await supabase
      .from('hr_recruitment_candidate_packages')
      .insert({
        candidate_id: newPackage.candidate_id,
        hr_organization_id: newPackage.hr_organization_id ?? parent.hr_organization_id,
        proposed_by: newPackage.proposed_by,
        proposed_monthly_salary: newPackage.proposed_monthly_salary,
        proposed_monthly_salary_breakdown: newPackage.proposed_monthly_salary_breakdown ?? null,
        currency: newPackage.currency ?? parent.currency,
        is_counter_offer: true,
        parent_package_id: parentPackageId,
        notes: newPackage.notes ?? null,
        status: 'proposed',
      })
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentCandidatePackage;
  }

  // ----- Reject package -----

  static async rejectPackage(
    supabase: SupabaseClient,
    packageId: string,
    reason: string
  ): Promise<HRRecruitmentCandidatePackage> {
    const pkg = await this.getPackage(supabase, packageId);
    if (!pkg) throw new Error('Package not found');
    if (pkg.status !== 'proposed') {
      throw new Error(`Cannot reject package in status '${pkg.status}'`);
    }

    const { data, error } = await supabase
      .from('hr_recruitment_candidate_packages')
      .update({
        status: 'rejected',
        notes: reason,
      })
      .eq('id', packageId)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentCandidatePackage;
  }
}
