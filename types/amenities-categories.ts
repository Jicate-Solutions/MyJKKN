export interface AmenitiesCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAmenitiesCategoryDto {
  name: string;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface UpdateAmenitiesCategoryDto {
  name?: string;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface AmenitiesCategoryFilters {
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AmenitiesCategoryListResponse {
  data: AmenitiesCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
