/**
 * Shared display vocabulary for one auto-allocation candidate row.
 *
 * Kept apart from both the table and the exporters so the on-screen labels and
 * the Excel/PDF cells can't drift: candidate-validation-table.tsx imports
 * BILL_STATE_LABEL, candidates-export.ts imports toExportRow, and both resolve
 * the same strings from here.
 *
 * Dependency-free on purpose — candidates-export.ts pulls in xlsx + jspdf and is
 * loaded by dynamic import, so nothing heavy may leak into this module.
 */

import type { AllocationCandidate, BillState } from '@/types/allocation-batch';

export const BILL_STATE_LABEL: Record<BillState, string> = {
  matched: 'Admission year',
  different_year: 'Fallback year',
  untagged: 'No usable bill',
  none: 'No bill',
};

// Mirrors <YesNo> in the table: a prerequisite-stage failure means the later
// conditions were never evaluated, so they export as '—', not as a false "No".
const yn = (ok: boolean, na: boolean) => (na ? '—' : ok ? 'Yes' : 'No');

const cap = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/** One flattened candidate, keyed by its export column header. */
export type CandidateExportRow = Record<string, string | number>;

export function toExportRow(c: AllocationCandidate): CandidateExportRow {
  const na = c.stage === 'prerequisite';
  return {
    Student: c.full_name,
    'Roll No': c.roll_number ?? '',
    Email: c.email ?? '',
    Institution: c.institution_name ?? '',
    Program: c.program_name ?? '',
    Semester: c.semester_name ?? '',
    Gender: cap(c.gender),
    'Admission Year': c.admission_academic_year_name ?? '',
    'Fee Basis Year': c.band_academic_year_name ?? '',
    // Left as a raw number so Excel can sum/filter it; the PDF formats it.
    'Band Fee': c.band_fee ?? '',
    'Bill Status': BILL_STATE_LABEL[c.bill_state] ?? c.bill_state,
    'Academic Bills': c.academic_bill_count ?? 0,
    'Current-Year Bills': c.current_year_bill_count ?? 0,
    'Has Profile': yn(c.has_profile, na),
    'Gender OK': yn(c.gender_ok, na),
    'Not Allocated': yn(c.not_allocated, na),
    'Physical Access': yn(c.physical_rule_ok, na),
    'Bed Available': yn(c.bed_available, na),
    'Goes To Block': c.target_block_name ?? '',
    // 'Overflow' = every room reserved for their cohort was full, so an
    // unreserved room of the SAME category was used.
    Placement: c.placement_tier === 'overflow' ? 'Overflow' : c.placement_tier === 'rule' ? 'Rule' : '',
    'Room Category': c.resolved_room_category_name ?? '',
    'Mess Category': c.resolved_mess_category_name ?? '',
    Stage: c.stage,
    Verdict: c.verdict === 'in' ? 'In' : 'Out',
    'Exclusion Reason': c.exclusion_reason ?? '',
  };
}

/**
 * The subset a landscape A4 page can hold and still stay legible. The full
 * 24-column schema only fits a spreadsheet — the PDF keeps the identity,
 * fee-basis and outcome columns and drops the per-condition Yes/No checks.
 */
export const CANDIDATE_PDF_COLUMNS: string[] = [
  'Student',
  'Roll No',
  'Institution',
  'Program',
  'Semester',
  'Fee Basis Year',
  'Band Fee',
  'Bill Status',
  'Goes To Block',
  'Placement',
  'Room Category',
  'Mess Category',
  'Verdict',
  'Exclusion Reason',
];
