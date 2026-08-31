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
// Helpers
// =====================================================================================

/**
 * The proposed salary is optional. Treat blank / null / undefined as "not decided
 * yet" and store NULL; reject only a value that was actually supplied but invalid.
 * Guards against a form sending '' (which Postgres would reject as 22P02 numeric).
 */
function normaliseSalary(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(n) || n <= 0) {
    throw new Error('proposed_monthly_salary must be a positive number when provided');
  }
  return n;
}

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
   *
   * proposed_monthly_salary is OPTIONAL — a package may be opened without a
   * figure (breakdown/notes carry the offer). When supplied it must be positive.
   */
  static async proposePackage(
    supabase: SupabaseClient,
    payload: HRRecruitmentCandidatePackageInsert
  ): Promise<HRRecruitmentCandidatePackage> {
    const monthlySalary = normaliseSalary(payload.proposed_monthly_salary);

    const { data, error } = await supabase
      .from('hr_recruitment_candidate_packages')
      .insert({
        candidate_id: payload.candidate_id,
        hr_organization_id: payload.hr_organization_id ?? null,
        proposed_by: payload.proposed_by,
        proposed_monthly_salary: monthlySalary,
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

    // -------------------------------------------------------------------
    // Director's ruling, 2026-08-28: a salary package may only be fixed
    // AFTER the candidate's full approval chain has completed.
    //
    // Fixing it mid-chain flipped the candidate to 'package_fixed', a status
    // RecruitmentService.approveCandidate then refuses — so the final
    // approver could never record their decision and the hire deadlocked.
    // (Sabari V S, frozen 4 days at the super-admin step.) updateStatus's own
    // transition map already encodes the rule: package_fixed follows approved.
    //
    // This check runs BEFORE the package is touched, and throws rather than
    // just narrowing the filter below: a PostgREST update whose filter matches
    // no row returns neither an error nor a row count, so a narrowed filter
    // alone would fail SILENTLY and leave the package approved with the
    // candidate stranded. A refusal must always be explicit (CLAUDE.md #27).
    // -------------------------------------------------------------------
    const { data: parent, error: parentErr } = await supabase
      .from('hr_recruitment_candidates')
      .select('status')
      .eq('id', pkg.candidate_id)
      .single();
    if (parentErr) throw parentErr;
    if (!parent) throw new Error('Parent candidate not found for this package');
    // Refuse only the states that mean the chain has NOT finished. Anything at
    // or past 'approved' is allowed: `package_fixed` sits DOWNSTREAM of
    // 'approved' in updateStatus's transition map, so a candidate already
    // there has completed every approval — refusing them would block a revised
    // or counter-offer package on a fully-approved hire. (Measured on
    // production 2026-08-31: SARANYA R and Anand V both sit at package_fixed
    // with a further proposed package; an `=== 'approved'` test refused both.)
    const CHAIN_INCOMPLETE: readonly string[] = ['submitted', 'pending_approval'];
    if (CHAIN_INCOMPLETE.includes(parent.status)) {
      throw new Error(
        `Cannot fix the salary package while the hire is still in status '${parent.status}'. ` +
        'Every approver must sign off first — the package can only be fixed once the ' +
        'candidate reaches \'approved\'.'
      );
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

    // Advance parent candidate to package_fixed.
    //
    // Filter on `id` ONLY. Do NOT re-add a `.eq('status', ...)` filter here:
    // PostgREST re-applies request filters to an UPDATE's RETURNING
    // projection, so filtering on the very column being written makes the row
    // update itself out of its own response body — the write commits and the
    // caller sees []. That exact pattern silently broke meeting booking for
    // months (fixed in #3126). The guard above already proves the status.
    // Advance ONLY from 'approved'. A candidate already at 'package_fixed' or
    // beyond (e.g. 'offer_issued') must be left alone — writing 'package_fixed'
    // unconditionally would drag them BACKWARDS through the transition map.
    // The previous `.in(['approved','pending_approval','submitted'])` filter
    // gave that protection as a side effect; deciding in code keeps it while
    // still avoiding the RETURNING trap described above.
    if (parent.status === 'approved') {
      const { data: advanced, error: candidateErr } = await supabase
        .from('hr_recruitment_candidates')
        .update({ status: 'package_fixed' })
        .eq('id', pkg.candidate_id)
        .select('id');
      if (candidateErr) throw candidateErr;
      if (!advanced || advanced.length === 0) {
        throw new Error(
          'The salary package was approved but the hire could not be advanced to ' +
          '"package fixed". Please reload the candidate and check their status.'
        );
      }
    }
    // Every other status is already AT or PAST package_fixed, or is terminal
    // (rejected / withdrawn / offer_rescinded / no_show). Either way there is
    // nothing to advance, and that is success — not a silent failure.
    //
    // This deliberately PRESERVES pre-existing behaviour for the terminal ones:
    // main's `.in(['approved','pending_approval','submitted'])` filter also
    // matched no row for them, wrote nothing and raised nothing. Whether a
    // package should be approvable at all for a rejected or withdrawn candidate
    // is a real open question — but changing it is not this fix's job, and a
    // test below pins the equivalence so the answer stays deliberate.

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
        proposed_monthly_salary: normaliseSalary(newPackage.proposed_monthly_salary),
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
