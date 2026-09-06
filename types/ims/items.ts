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

/** A store's listing of an item: does it carry it, and does it sell it at the counter. */
export interface ImsStoreItem {
  id: string;
  store_id: string;
  item_id: string;
  is_sellable_to_students: boolean;
  is_active: boolean;
  added_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImsItemWithRelations extends ImsItem {
  category: { id: string; name: string; code: string } | null;
  base_unit: { id: string; name: string; abbreviation: string } | null;
  purchase_unit?: { id: string; name: string; abbreviation: string } | null;
  sale_unit?: { id: string; name: string; abbreviation: string } | null;
  indent_unit?: { id: string; name: string; abbreviation: string } | null;
  /**
   * The active store's listing, present only on a store-scoped query. Read
   * `store_link.is_sellable_to_students` — NOT the item-level column — when
   * showing whether an item is at THIS store's counter.
   */
  store_link?: { is_sellable_to_students: boolean; is_active: boolean } | null;
  stock?: {
    current_quantity: number;
    available_quantity: number;
    /** Quantity at item creation ("Opening stock"). 0 when no opening batch exists. */
    opening_quantity: number;
  } | null;
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
  /**
   * Which catalogue to read.
   *
   * `'store'` — only what `store_id` actually carries (an `ims_store_items` row).
   * `'institution'` — the whole institution catalogue, including items no store
   *   has listed yet. The warehouse needs this: it must be able to push an item
   *   to a store *before* that store stocks it.
   *
   * Defaults to `'store'` when a `store_id` is given, `'institution'` otherwise.
   */
  scope?: 'store' | 'institution';
  /** Store-scoped only: keep just the items with stock on hand at `store_id`. */
  has_stock?: boolean;
  /**
   * Narrow to items that do / do not appear at the POS. Backed by
   * `is_sellable_to_students` — the legacy column name; the UI says "At POS"
   * because the counter also serves walk-ins and patients. Reads the per-store
   * flag under `'store'` scope and the item-level default under `'institution'`.
   */
  pos_visibility?: 'at_pos' | 'not_at_pos';
  page?: number;
  limit?: number;
}

// New distribution fields default at DB level, so they're optional on create
type ImsItemDistributionFields = 'is_distributable' | 'is_bundle' | 'brand' | 'variant_attributes' | 'image_url';

/**
 * `code` is optional because it is GENERATED. Omit it and the BEFORE INSERT
 * trigger `ims_items_autofill_code` fills it from the institution's sequence
 * (migration 20260804120000). Passing one is still honoured — the bulk import
 * does, for sheets that carry explicit codes — but nothing should invent one.
 */
export type CreateImsItemDto =
  Omit<ImsItem, 'id' | 'created_at' | 'updated_at' | 'code' | ImsItemDistributionFields>
  & Partial<Pick<ImsItem, 'code' | ImsItemDistributionFields>>;
export type UpdateImsItemDto = Partial<CreateImsItemDto>;
