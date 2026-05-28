export interface MessCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateMessCategoryDto {
  name: string;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface UpdateMessCategoryDto {
  name?: string;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface MessCategoryFilters {
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface MessCategoryListResponse {
  data: MessCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
