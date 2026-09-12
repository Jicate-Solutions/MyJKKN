// types/referral-rates.ts
// Referral payment machine — rate config + generator result shapes.
// Backs referral_rate_config + fn_generate_referral_commissions (migration
// 20260722120000). See SPECS.md §6 F4/F6.

export interface ReferralRateConfig {
  id: string;
  academic_year: number;
  institution_id: string | null;   // null = every institution
  program_id: string | null;       // null = every programme in scope
  flat_amount: number;             // gross rupees per admission
  tds_percent: number;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // populated via joins
  institution?: { id: string; name: string } | null;
  program?: { id: string; program_name: string } | null;
}

export interface CreateReferralRateInput {
  academic_year: number;
  institution_id?: string | null;
  program_id?: string | null;
  flat_amount: number;
  tds_percent: number;
  notes?: string | null;
}

export interface GenerateAgencyLine {
  agency: string;
  /** Eligible referrals only — held ones are counted separately. */
  referrals: number;
  /** Credits this agency has that are held — walk-in, attendance, or no
   *  register kept (rule 12, 2026-09-12). */
  held: number;
  /** Referrals for this agency whose learner never took the seat. */
  not_enrolled: number;
  net: number;
  payable: boolean;
}

export interface GenerateCommissionsResult {
  dry_run: boolean;
  academic_year: number;
  /** Everything the generator FOUND, held or not. Never shrinks silently. */
  candidates: number;
  /** Never took the seat — lifecycle_status outside the enrolled allow-list.
   *  BLOCKED outright, not held: there is nothing to review, they did not join. */
  blocked_not_enrolled: number;
  blocked_not_enrolled_gross: number;
  /** Enrolled, but a MARKED register has never recorded them present. Held, and
   *  releasable on the Review Worklist. A LEARNER problem: the register exists
   *  and has never seen them. Learners whose section nobody marks are counted
   *  under held_no_register instead, and are now ALSO held. */
  held_attendance: number;
  held_attendance_gross: number;
  /** Enrolled, but nobody marks this learner's section at all — or they have no
   *  section yet. Held from 2026-09-12 (rule 12, Director): a missing register
   *  is now a hold, reversing the earlier rule that let unmeasurable sections
   *  through. A COLLEGE problem, not the learner's and not the consultant's.
   *  Released through referral_attendance_clearances, the same path that
   *  releases held_attendance — marking the register also clears it. */
  held_no_register: number;
  held_no_register_gross: number;
  /** Walk-in credits with no payout clearance. Counted, valued, never written. */
  held_walkin: number;
  /** What the held population would be worth at the current rate. */
  held_gross: number;
  /** candidates − held_walkin. This is what a real run actually writes. */
  eligible: number;
  payable_now: number;
  blocked_no_bank: number;
  total_gross: number;
  total_tds: number;
  total_net: number;
  rows_written: number;
  by_agency: GenerateAgencyLine[];
}

export interface InstitutionOption { id: string; name: string }
export interface ProgramOption { id: string; program_name: string; institution_id: string | null }
