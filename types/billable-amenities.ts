/**
 * Billable Amenities (chargeable services with fee models) — types.
 *
 * Maps DB table `hostel_billable_amenities` (column `active`) onto a
 * TypeScript shape that uses `is_active` for naming consistency with
 * Boobalan's `amenities-categories` module. The service layer handles
 * the column rename in both directions. A future PR 1b can harmonise
 * the DB column to `is_active`.
 */

export type FeeCalculationType =
  | 'ac_per_room_active_share'
  | 'per_resident_flat'
  | 'per_room_flat';

export type RefundMode = 'credit_to_next' | 'cash' | 'none';

export interface BillableAmenity {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  description: string | null;
  fee_calculation_type: FeeCalculationType;
  default_config_schema: Record<string, unknown>;
  commitment_months: number;
  late_joiner_min_months: number;
  upfront_required: boolean;
  refund_mode: RefundMode;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateBillableAmenityDto {
  code: string;
  name: string;
  icon?: string | null;
  description?: string | null;
  fee_calculation_type: FeeCalculationType;
  default_config_schema?: Record<string, unknown>;
  commitment_months?: number;
  late_joiner_min_months?: number;
  upfront_required?: boolean;
  refund_mode?: RefundMode;
  sort_order?: number;
  is_active?: boolean;
}

export interface UpdateBillableAmenityDto {
  name?: string;
  icon?: string | null;
  description?: string | null;
  fee_calculation_type?: FeeCalculationType;
  default_config_schema?: Record<string, unknown>;
  commitment_months?: number;
  late_joiner_min_months?: number;
  upfront_required?: boolean;
  refund_mode?: RefundMode;
  sort_order?: number;
  is_active?: boolean;
}

export interface BillableAmenityFilters {
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface BillableAmenityListResponse {
  data: BillableAmenity[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
