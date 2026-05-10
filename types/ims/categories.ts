/**
 * IMS Item Categories
 */

export interface ImsItemCategory {
  id: string;
  name: string;
  code: string;
  description: string | null;
  parent_id: string | null;
  store_id: string | null;
  icon: string | null;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ImsItemCategoryWithChildren extends ImsItemCategory {
  children?: ImsItemCategoryWithChildren[];
  item_count?: number;
}

export interface ImsCategoryFilters {
  search?: string;
  is_active?: boolean;
  parent_id?: string | null;
  store_id?: string;
  page?: number;
  limit?: number;
}

// New display/system fields default at DB level, so they're optional on create
type ImsCategoryDisplayFields = 'icon' | 'sort_order' | 'is_system';

export type CreateImsCategoryDto =
  Omit<ImsItemCategory, 'id' | 'created_at' | 'updated_at' | ImsCategoryDisplayFields>
  & Partial<Pick<ImsItemCategory, ImsCategoryDisplayFields>>;
export type UpdateImsCategoryDto = Partial<CreateImsCategoryDto>;
