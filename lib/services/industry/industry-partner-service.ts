// ============================================================================
// Industry Partner Service
// CRUD operations for industry partners
// Note: Using 'as any' type casts because industry tables are new and
// Supabase TypeScript types haven't been regenerated yet
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  IndustryPartner,
  IndustryListResponse,
  IndustryPartnerFilters,
  CreateIndustryPartnerDTO,
  UpdateIndustryPartnerDTO,
  PartnerPickerOption,
  PartnerSummary
} from '@/types/industry';

export class IndustryPartnerService {
  /**
   * Validate UUID format to prevent "invalid input syntax for type uuid" errors
   */
  private static isValidUUID(id: string | undefined | null): boolean {
    if (!id || typeof id !== 'string' || id === 'undefined' || id === 'null' || id.trim() === '') {
      return false;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  /**
   * Validate ID and throw descriptive error if invalid
   */
  private static validateId(id: string | undefined | null, fieldName: string = 'ID'): void {
    if (!this.isValidUUID(id)) {
      const actualValue = id === undefined ? 'undefined' : id === null ? 'null' : `"${id}"`;
      console.error(`[IndustryPartnerService] Invalid ${fieldName}: ${actualValue}`);
      throw new Error(`Invalid ${fieldName}: ${actualValue}. Expected a valid UUID.`);
    }
  }

  /**
   * Get paginated list of industry partners
   */
  static async getPartners(
    filters: IndustryPartnerFilters = {}
  ): Promise<IndustryListResponse<IndustryPartner>> {
    const supabase = createClientSupabaseClient();
    const {
      institution_id,
      partnership_type,
      industry_sector,
      is_active,
      search,
      page = 1,
      limit = 10,
      sort_by = 'company_name',
      sort_order = 'asc'
    } = filters;

    let query = (supabase as any)
      .from('industry_partners')
      .select('*', { count: 'exact' });

    // Apply filters
    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    if (partnership_type) {
      if (Array.isArray(partnership_type)) {
        query = query.in('partnership_type', partnership_type);
      } else {
        query = query.eq('partnership_type', partnership_type);
      }
    }

    if (industry_sector) {
      query = query.eq('industry_sector', industry_sector);
    }

    if (typeof is_active === 'boolean') {
      query = query.eq('is_active', is_active);
    }

    if (search) {
      query = query.or(`company_name.ilike.%${search}%,contact_person.ilike.%${search}%`);
    }

    // Apply sorting
    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[IndustryPartnerService] getPartners error:', error);
      throw new Error(error.message);
    }

    return {
      data: data || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  /**
   * Get single partner by ID
   */
  static async getPartnerById(id: string): Promise<IndustryPartner> {
    this.validateId(id, 'partner ID');
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('industry_partners')
      .select(`
        *,
        mentors:industry_mentors(count),
        projects:industry_projects(count)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[IndustryPartnerService] getPartnerById error:', error);
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Create new industry partner
   */
  static async createPartner(dto: CreateIndustryPartnerDTO): Promise<IndustryPartner> {
    this.validateId(dto.institution_id, 'institution_id');
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('industry_partners')
      .insert(dto)
      .select()
      .single();

    if (error) {
      console.error('[IndustryPartnerService] createPartner error:', error);
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Update industry partner
   */
  static async updatePartner(
    id: string,
    dto: UpdateIndustryPartnerDTO
  ): Promise<IndustryPartner> {
    this.validateId(id, 'partner ID');
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('industry_partners')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[IndustryPartnerService] updatePartner error:', error);
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Archive partner (soft delete)
   */
  static async archivePartner(id: string): Promise<void> {
    this.validateId(id, 'partner ID');
    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any)
      .from('industry_partners')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[IndustryPartnerService] archivePartner error:', error);
      throw new Error(error.message);
    }
  }

  /**
   * Restore archived partner
   */
  static async restorePartner(id: string): Promise<void> {
    this.validateId(id, 'partner ID');
    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any)
      .from('industry_partners')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[IndustryPartnerService] restorePartner error:', error);
      throw new Error(error.message);
    }
  }

  /**
   * Get partner options for picker
   */
  static async getPartnerOptions(institutionId: string): Promise<PartnerPickerOption[]> {
    this.validateId(institutionId, 'institution ID');
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('industry_partners')
      .select('id, company_name, industry_sector, is_active')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('company_name');

    if (error) {
      console.error('[IndustryPartnerService] getPartnerOptions error:', error);
      throw new Error(error.message);
    }

    return data || [];
  }

  /**
   * Get partner summaries for dashboard
   */
  static async getPartnerSummaries(institutionId: string): Promise<PartnerSummary[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('industry_partners')
      .select(`
        id,
        company_name,
        industry_sector,
        partnership_type,
        mentors:industry_mentors(count),
        projects:industry_projects(count)
      `)
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('company_name');

    if (error) {
      console.error('[IndustryPartnerService] getPartnerSummaries error:', error);
      throw new Error(error.message);
    }

    return (data || []).map((p: any) => ({
      id: p.id,
      company_name: p.company_name,
      industry_sector: p.industry_sector,
      partnership_type: p.partnership_type,
      mentors_count: p.mentors?.[0]?.count || 0,
      projects_count: p.projects?.[0]?.count || 0,
      active_engagements: 0 // Would need separate query
    }));
  }
}
