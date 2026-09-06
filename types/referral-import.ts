// types/referral-import.ts
// Referral import upload — staging row + batch shapes. Backs referral_import_*
// tables and fn_validate / fn_enrich / fn_promote. SPECS.md §6 F1, D18-D40.

export type ImportVerdict = 'ok' | 'flagged' | 'blocked' | 'no_match';

// The exact template headers (must match docs/referral-2025-26-import-template.xlsx).
export const TEMPLATE_HEADERS = [
  'Referrer Name *', 'Referrer Type *', 'Referrer Code', 'Referrer Phone/Email',
  'Student Application No. *', 'Student Name *', 'Programme', 'Institution',
  'Referral Date', 'Amount Agreed (Rs)', 'Amount Already Paid (Rs)',
  'Paid Date', 'Paid Method', 'Paid Reference',
] as const;

export interface ParsedRow {
  referrer_name: string | null;
  referrer_type: string | null;
  referrer_code: string | null;
  referrer_contact: string | null;
  student_application_id: string | null;
  student_name: string | null;
  programme: string | null;
  institution: string | null;
  referral_date: string | null;
  amount_agreed: number | null;
  amount_paid: number | null;
  paid_date: string | null;
  paid_method: string | null;
  paid_reference: string | null;
}

export interface ImportRow extends ParsedRow {
  id: string;
  row_number: number;
  verdict: ImportVerdict | null;
  verdict_reasons: string[];
  is_already_paid: boolean;
  enrolment_status: 'confirmed' | 'registrar' | null;
  amount_owed: number | null;
  existing_referrer_id: string | null;
  promoted_at: string | null;
}

export interface ImportBatch {
  id: string;
  filename: string | null;
  status: 'draft' | 'validated' | 'approved' | 'committed' | 'cancelled';
  row_count: number;
  ok_count: number;
  flagged_count: number;
  blocked_count: number;
  no_match_count: number;
  already_paid_count: number;
  created_at: string;
}

export interface PromoteResult {
  attributions_written: number;
  already_recorded: number;
  conflicts_disputed: number;
  paid_records: number;
}
