/**
 * IMS Stock — Stock Summary, Batches, Issues, Adjustments
 */

export type ImsLocationType = 'central_store' | 'department';

export interface ImsStockSummary {
  id: string;
  item_id: string;
  current_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  total_value: number;
  institution_id: string;
  store_id: string | null;
  updated_at: string;
  // Joined fields
  item?: {
    id: string;
    name: string;
    code: string;
    reorder_level: number;
    max_stock_level: number;
    base_unit: { abbreviation: string } | null;
    category: { name: string } | null;
  };
}

export interface ImsStockBatch {
  id: string;
  item_id: string;
  batch_number: string | null;
  expiry_date: string | null;
  quantity: number;
  cost_price: number;
  total_value: number;
  grn_id: string | null;
  location_type: ImsLocationType;
  department_id: string | null;
  institution_id: string;
  store_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  item?: { id: string; name: string; code: string };
}

export interface ImsStockIssue {
  id: string;
  issue_number: string;
  indent_id: string | null;
  item_id: string;
  quantity: number;
  unit_id: string;
  department_id: string;
  issued_by: string;
  received_by: string | null;
  notes: string | null;
  institution_id: string;
  store_id: string | null;
  created_at: string;
}

export type ImsAdjustmentType =
  | 'physical_count'
  | 'damage'
  | 'expiry'
  | 'theft'
  | 'return_to_supplier'
  | 'transfer'
  | 'correction';

export interface ImsStockAdjustment {
  id: string;
  item_id: string;
  adjustment_type: ImsAdjustmentType;
  quantity: number;
  reason: string;
  department_id: string | null;
  adjusted_by: string;
  institution_id: string;
  store_id: string | null;
  created_at: string;
  // Joined
  item?: { id: string; name: string; code: string };
  department?: { id: string; department_name: string } | null;
  adjusted_by_profile?: { full_name: string } | null;
}

export interface ImsStockFilters {
  search?: string;
  category_id?: string;
  low_stock_only?: boolean;
  institution_id?: string;
  store_id?: string;
  page?: number;
  limit?: number;
}

export interface ImsBatchFilters {
  item_id?: string;
  location_type?: ImsLocationType;
  expiring_within_days?: number;
  institution_id?: string;
  store_id?: string;
  page?: number;
  limit?: number;
}

export interface ImsDepartmentStock {
  department_id: string;
  department_name: string;
  item_id: string;
  item_name: string;
  total_issued: number;
  total_consumed: number;
  total_returned: number;
  balance: number;
}

export interface ImsDepartmentStockMovement {
  id: string;
  type: 'received' | 'consumed' | 'returned' | 'adjusted';
  quantity: number;
  notes: string | null;
  created_at: string;
  created_by?: { full_name: string } | null;
}

export type ImsStockStatus = 'out_of_stock' | 'low_stock' | 'in_stock' | 'overstocked';

export function getStockStatus(
  quantity: number,
  reorderLevel: number,
  maxLevel: number
): ImsStockStatus {
  if (quantity <= 0) return 'out_of_stock';
  if (quantity <= reorderLevel) return 'low_stock';
  if (quantity > maxLevel) return 'overstocked';
  return 'in_stock';
}
