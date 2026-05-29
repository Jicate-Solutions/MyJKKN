/**
 * Amenities (informational tags) — types.
 *
 * Maps DB table `hostel_amenity_tags` (column `active`) onto a TypeScript
 * shape that uses `is_active` for naming consistency with Boobalan's
 * `amenities-categories` module. The service layer handles the column
 * rename in both directions. A future PR 1b can harmonise the DB column
 * to `is_active`; this layer keeps the UI shape stable in the meantime.
 */
export interface Amenity {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAmenityDto {
  code: string;
  name: string;
  icon?: string | null;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface UpdateAmenityDto {
  name?: string;
  icon?: string | null;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface AmenityFilters {
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AmenityListResponse {
  data: Amenity[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
