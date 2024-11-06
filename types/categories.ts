// types/categories.ts
export interface Subcategory {
    id: string;
    name: string;
    description?: string;
    parent_id: string;
    created_at: string;
    updated_at: string;
  }
  
  export interface Category {
    id: string;
    name: string;
    description?: string;
    subcategories: Subcategory[];
    created_at: string;
    updated_at: string;
  }
  
  export interface CreateCategoryInput {
    name: string;
    description?: string;
  }
  
  export interface CreateSubcategoryInput {
    name: string;
    description?: string;
    parent_id: string;
  }
  
  export interface UpdateCategoryInput {
    name?: string;
    description?: string;
  }
  
  // Database types
  export interface Database {
    public: {
      Tables: {
        categories: {
          Row: Omit<Category, 'subcategories'>;
          Insert: Omit<Category, 'id' | 'created_at' | 'updated_at' | 'subcategories'>;
          Update: UpdateCategoryInput;
        };
        subcategories: {
          Row: Subcategory;
          Insert: Omit<Subcategory, 'id' | 'created_at' | 'updated_at'>;
          Update: Omit<UpdateCategoryInput, 'parent_id'>;
        };
      };
    };
  }