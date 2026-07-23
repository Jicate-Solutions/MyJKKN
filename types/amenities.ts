/**
 * Amenities (informational tags) — types.
 *
 * Maps DB table `hostel_amenity_tags` (column `active`) onto a TypeScript
 * shape that uses `is_active` for naming consistency with the rest of the
 * campus-living modules. The service layer handles the column rename in both
 * directions. A future PR can harmonise the DB column to `is_active`; this
 * layer keeps the UI shape stable in the meantime.
 *
 * `scope` classifies where the amenity applies: block-level, room-level, or
 * both. The Block form fetches scope IN ('block','both'); the Room form
 * fetches scope IN ('room','both').
 */

/** hostel_amenity_tags.scope CHECK values. */
export type AmenityScope = 'block' | 'room' | 'both';

export interface Amenity {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  description: string | null;
  scope: AmenityScope;
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
  scope?: AmenityScope;
  sort_order?: number;
  is_active?: boolean;
}

export interface UpdateAmenityDto {
  name?: string;
  icon?: string | null;
  description?: string | null;
  scope?: AmenityScope;
  sort_order?: number;
  is_active?: boolean;
}

export interface AmenityFilters {
  is_active?: boolean;
  scope?: AmenityScope;
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
