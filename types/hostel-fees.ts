// Hostel fees — unified fee table (renamed from hostel_category_fees → hostel_fees).
// Each row targets EXACTLY ONE of: hostel_category (per-bed room rate), mess
// category (flat mess rate), or admission package (flat all-in package price).
// Enforced in the DB by the hostel_fees_one_target CHECK.

export type FeeTargetKind = 'hostel_room' | 'mess' | 'package';
export type FeeFrequency = 'annual' | 'semester' | 'monthly' | 'one_time';

export interface HostelFee {
  id: string;
  hostel_year_id: string;
  hostel_category_id: string | null;
  mess_category_id: string | null;
  package_id: string | null;
  amount: number;
  frequency: FeeFrequency;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateHostelFeeDto {
  hostel_year_id: string;
  hostel_category_id?: string | null;
  mess_category_id?: string | null;
  package_id?: string | null;
  amount: number;
  frequency: FeeFrequency;
  is_active?: boolean;
}

export interface UpdateHostelFeeDto {
  amount?: number;
  frequency?: FeeFrequency;
  is_active?: boolean;
}

export const FEE_FREQUENCY_LABELS: Record<FeeFrequency, string> = {
  annual: 'Annual',
  semester: 'Semester',
  monthly: 'Monthly',
  one_time: 'One-time',
};

export const FEE_TARGET_LABELS: Record<FeeTargetKind, string> = {
  hostel_room: 'Hostel Room',
  mess: 'Mess',
  package: 'Package',
};

/** Kinds configurable in the Category Fees section (package is configured separately). */
export const CATEGORY_FEE_KINDS: FeeTargetKind[] = ['hostel_room', 'mess'];

/** Which target a fee row points at (exactly one of the three FKs is set). */
export function getFeeTargetKind(
  fee: Pick<HostelFee, 'hostel_category_id' | 'mess_category_id' | 'package_id'>
): FeeTargetKind {
  if (fee.package_id) return 'package';
  return fee.hostel_category_id ? 'hostel_room' : 'mess';
}

/** The id of whichever target is referenced. */
export function getFeeTargetId(
  fee: Pick<HostelFee, 'hostel_category_id' | 'mess_category_id' | 'package_id'>
): string | null {
  return fee.hostel_category_id ?? fee.mess_category_id ?? fee.package_id ?? null;
}
