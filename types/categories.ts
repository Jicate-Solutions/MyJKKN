// types/categories.ts
export interface Subcategory {
    id: string;
    name: string;
    description: string | null;
    category_id: string;
    created_at: string;
    updated_at: string;
  }
  
  export interface Category {
    id: string;
    name: string;
    description: string | null;
    subcategories: Subcategory[];
    created_at: string;
    updated_at: string;
  }
  
  export type CreateCategoryDTO = Pick<Category, 'name' | 'description'>;
  export type UpdateCategoryDTO = Partial<CreateCategoryDTO>;
  
  export type CreateSubcategoryDTO = Pick<Subcategory, 'name' | 'description' | 'category_id'>;
  export type UpdateSubcategoryDTO = Partial<Omit<CreateSubcategoryDTO, 'category_id'>>;
  
  // Add these to your Database type
  export interface Database {
    public: {
      Tables: {
        categories: {
          Row: Omit<Category, 'subcategories'>;
          Insert: CreateCategoryDTO;
          Update: UpdateCategoryDTO;
        };
        subcategories: {
          Row: Subcategory;
          Insert: CreateSubcategoryDTO;
          Update: UpdateSubcategoryDTO;
        };
      };
    };
  }