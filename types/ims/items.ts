/**
 * IMS Inventory Items
 */

export type ImsItemType = 'consumable' | 'equipment' | 'medicine' | 'stationery' | 'other';

export interface ImsItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category_id: string;
  item_type: ImsItemType;
  base_unit_id: string;
  purchase_unit_id: string | null;
  sale_unit_id: string | null;
  indent_unit_id: string | null;
  hsn_code: string | null;
  gst_rate: number;
  cost_price: number;
  mrp: number;
  selling_price: number;
  reorder_level: number;
  max_stock_level: number;
  is_active: boolean;
  track_batch: boolean;
  track_expiry: boolean;
  is_sellable_to_students: boolean;
  institution_id: string | null;
  store_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImsItemWithRelations extends ImsItem {
  category: { id: string; name: string; code: string } | null;
  base_unit: { id: string; name: string; abbreviation: string } | null;
  purchase_unit?: { id: string; name: string; abbreviation: string } | null;
  sale_unit?: { id: string; name: string; abbreviation: string } | null;
  indent_unit?: { id: string; name: string; abbreviation: string } | null;
  stock?: { current_quantity: number; available_quantity: number } | null;
}

export interface ImsItemFilters {
  search?: string;
  category_id?: string;
  item_type?: ImsItemType;
  is_active?: boolean;
  institution_id?: string;
  store_id?: string;
  page?: number;
  limit?: number;
}

export type CreateImsItemDto = Omit<ImsItem, 'id' | 'created_at' | 'updated_at'>;
export type UpdateImsItemDto = Partial<CreateImsItemDto>;
