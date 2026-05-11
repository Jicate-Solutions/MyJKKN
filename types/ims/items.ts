/**
 * IMS Inventory Items
 */

export type ImsItemType = 'consumable' | 'equipment' | 'medicine' | 'stationery' | 'other';

export interface ImsItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  company_name: string | null;
  category_id: string | null;
  item_type: ImsItemType;
  base_unit_id: string | null;
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
  is_distributable: boolean;
  is_bundle: boolean;
  brand: string | null;
  variant_attributes: Record<string, string | number | boolean>;
  image_url: string | null;
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
  is_distributable?: boolean;
  is_bundle?: boolean;
  brand?: string;
  institution_id?: string;
  store_id?: string;
  page?: number;
  limit?: number;
}

// New distribution fields default at DB level, so they're optional on create
type ImsItemDistributionFields = 'is_distributable' | 'is_bundle' | 'brand' | 'variant_attributes' | 'image_url';

export type CreateImsItemDto =
  Omit<ImsItem, 'id' | 'created_at' | 'updated_at' | ImsItemDistributionFields>
  & Partial<Pick<ImsItem, ImsItemDistributionFields>>;
export type UpdateImsItemDto = Partial<CreateImsItemDto>;
