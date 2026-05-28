export type CategoryKind = 'hostel_room' | 'mess' | 'amenity';
export type FeeFrequency = 'annual' | 'semester' | 'monthly' | 'one_time';

export interface HostelCategoryFee {
  id: string;
  hostel_year_id: string;
  hostel_category_id: string | null;
  mess_category_id: string | null;
  amenities_category_id: string | null;
  amount: number;
  frequency: FeeFrequency;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateHostelCategoryFeeDto {
  hostel_year_id: string;
  hostel_category_id?: string | null;
  mess_category_id?: string | null;
  amenities_category_id?: string | null;
  amount: number;
  frequency: FeeFrequency;
  is_active?: boolean;
}

export interface UpdateHostelCategoryFeeDto {
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

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  hostel_room: 'Hostel Room',
  mess: 'Mess',
  amenity: 'Amenity',
};

/** Which category table a fee row points at (exactly one FK is set). */
export function getCategoryKind(
  fee: Pick<
    HostelCategoryFee,
    'hostel_category_id' | 'mess_category_id' | 'amenities_category_id'
  >
): CategoryKind {
  if (fee.hostel_category_id) return 'hostel_room';
  if (fee.mess_category_id) return 'mess';
  return 'amenity';
}

/** The id of whichever category is referenced. */
export function getCategoryId(
  fee: Pick<
    HostelCategoryFee,
    'hostel_category_id' | 'mess_category_id' | 'amenities_category_id'
  >
): string | null {
  return (
    fee.hostel_category_id ?? fee.mess_category_id ?? fee.amenities_category_id
  );
}
