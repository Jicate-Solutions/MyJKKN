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
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ImsItemCategoryWithChildren extends ImsItemCategory {
  children?: ImsItemCategoryWithChildren[];
}

export interface ImsCategoryFilters {
  search?: string;
  is_active?: boolean;
  parent_id?: string | null;
  store_id?: string;
  page?: number;
  limit?: number;
}

export type CreateImsCategoryDto = Omit<ImsItemCategory, 'id' | 'created_at' | 'updated_at'>;
export type UpdateImsCategoryDto = Partial<CreateImsCategoryDto>;
