// types/categories.ts

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subcategory extends Omit<Category, 'id'> {
  id: string;
  category_id: string;
}

export interface CategoryWithSubcategories extends Category {
  subcategories: Subcategory[];
}

export interface CategoryFormData {
  id?: string;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

export const defaultCategoryFormData: CategoryFormData = {
  name: '',
  slug: '',
  description: '',
  display_order: 0,
  is_active: true
};

// Add Database type definitions
export interface Database {
  public: {
    Tables: {
      application_categories: {
        Row: CategoryFormData;
        Insert: Omit<CategoryFormData, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<
          Omit<CategoryFormData, 'id' | 'created_at' | 'updated_at'>
        >;
      };
      application_subcategories: {
        Row: SubcategoryFormData;
        Insert: Omit<SubcategoryFormData, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<
          Omit<SubcategoryFormData, 'id' | 'created_at' | 'updated_at'>
        >;
      };
    };
  };
}

export interface SubcategoryFormData {
  id?: string;
  category_id: string;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export const defaultSubcategoryFormData: SubcategoryFormData = {
  category_id: '',
  name: '',
  slug: '',
  description: '',
  display_order: 0,
  is_active: true
};
