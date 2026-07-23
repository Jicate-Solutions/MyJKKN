import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  Amenity,
  AmenityScope,
  CreateAmenityDto,
  UpdateAmenityDto,
  AmenityFilters,
  AmenityListResponse,
} from '@/types/amenities';

/**
 * DB row shape — `hostel_amenity_tags` uses `active`, not `is_active`.
 * We translate both ways at the service boundary so callers see
 * `is_active` (matching Boobalan's amenities-categories convention).
 */
interface AmenityRow {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  description: string | null;
  scope: AmenityScope;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function rowToAmenity(row: AmenityRow): Amenity {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    icon: row.icon,
    description: row.description,
    scope: row.scope,
    sort_order: row.sort_order,
    is_active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class AmenityService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async getAmenities(
    filters: AmenityFilters = {}
  ): Promise<AmenityListResponse> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 100;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('hostel_amenity_tags')
      .select('*', { count: 'exact' })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .range(from, to);

    if (filters.is_active !== undefined) {
      query = query.eq('active', filters.is_active);
    }
    if (filters.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      logger.error('campus-living/amenities', 'Database error listing', error);
      throw new Error(error.message || 'Failed to fetch amenities');
    }

    const total = count ?? 0;
    return {
      data: ((data ?? []) as AmenityRow[]).map(rowToAmenity),
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getActiveAmenities(): Promise<Amenity[]> {
    const { data, error } = await this.supabase
      .from('hostel_amenity_tags')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      logger.error('campus-living/amenities', 'Database error listing active', error);
      throw new Error(error.message || 'Failed to fetch active amenities');
    }
    return ((data ?? []) as AmenityRow[]).map(rowToAmenity);
  }

  /**
   * Active amenities applicable to a given assignment scope. Returns rows
   * whose scope is the requested level OR 'both' (applies everywhere).
   * Used by the Block form (scope='block') and Room form (scope='room').
   */
  static async getAmenitiesByScope(scope: 'block' | 'room'): Promise<Amenity[]> {
    const { data, error } = await this.supabase
      .from('hostel_amenity_tags')
      .select('*')
      .eq('active', true)
      .in('scope', [scope, 'both'])
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      logger.error('campus-living/amenities', 'Database error listing by scope', error);
      throw new Error(error.message || 'Failed to fetch amenities by scope');
    }
    return ((data ?? []) as AmenityRow[]).map(rowToAmenity);
  }

  static async getAmenityById(id: string): Promise<Amenity> {
    const { data, error } = await this.supabase
      .from('hostel_amenity_tags')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      logger.error('campus-living/amenities', 'Database error fetching one', error);
      throw new Error(error.message || 'Failed to fetch amenity');
    }
    return rowToAmenity(data as AmenityRow);
  }

  static async createAmenity(dto: CreateAmenityDto): Promise<Amenity> {
    const insertRow: Partial<AmenityRow> = {
      code: dto.code,
      name: dto.name,
      icon: dto.icon ?? null,
      description: dto.description ?? null,
      scope: dto.scope ?? 'both',
      sort_order: dto.sort_order ?? 0,
      active: dto.is_active ?? true,
    };

    const { data, error } = await this.supabase
      .from('hostel_amenity_tags')
      .insert([insertRow])
      .select()
      .single();
    if (error) {
      logger.error('campus-living/amenities', 'Database error creating', error);
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.message || 'Failed to create amenity'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }
    return rowToAmenity(data as AmenityRow);
  }

  static async updateAmenity(
    id: string,
    dto: UpdateAmenityDto
  ): Promise<Amenity> {
    const updateRow: Partial<AmenityRow> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.name !== undefined) updateRow.name = dto.name;
    if (dto.icon !== undefined) updateRow.icon = dto.icon;
    if (dto.description !== undefined) updateRow.description = dto.description;
    if (dto.scope !== undefined) updateRow.scope = dto.scope;
    if (dto.sort_order !== undefined) updateRow.sort_order = dto.sort_order;
    if (dto.is_active !== undefined) updateRow.active = dto.is_active;

    const { data, error } = await this.supabase
      .from('hostel_amenity_tags')
      .update(updateRow)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      logger.error('campus-living/amenities', 'Database error updating', error);
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.message || 'Failed to update amenity'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }
    return rowToAmenity(data as AmenityRow);
  }

  static async deleteAmenity(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('hostel_amenity_tags')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error('campus-living/amenities', 'Database error deleting', error);
      throw new Error(error.message || 'Failed to delete amenity');
    }
  }

  static async bulkDeleteAmenities(
    ids: string[]
  ): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      try {
        await this.deleteAmenity(id);
        success.push(id);
      } catch (e) {
        logger.error('campus-living/amenities', `Error deleting ${id}`, e);
        failed.push({
          id,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }
    return { success, failed };
  }
}
