// ============================================================================
// Industry Mentor Service
// CRUD operations for industry mentors
// Note: Using 'as any' type casts because industry tables are new and
// Supabase TypeScript types haven't been regenerated yet
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  IndustryMentor,
  IndustryListResponse,
  IndustryMentorFilters,
  CreateIndustryMentorDTO,
  UpdateIndustryMentorDTO,
  MentorPickerOption
} from '@/types/industry';

export class IndustryMentorService {
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
      console.error(`[IndustryMentorService] Invalid ${fieldName}: ${actualValue}`);
      throw new Error(`Invalid ${fieldName}: ${actualValue}. Expected a valid UUID.`);
    }
  }

  /**
   * Get paginated list of industry mentors
   */
  static async getMentors(
    filters: IndustryMentorFilters = {}
  ): Promise<IndustryListResponse<IndustryMentor>> {
    const supabase = createClientSupabaseClient();
    const {
      partner_id,
      expertise_area,
      is_active,
      has_availability,
      search,
      page = 1,
      limit = 10
    } = filters;

    let query = (supabase as any)
      .from('industry_mentors')
      .select(`
        *,
        partner:industry_partners(id, company_name, industry_sector)
      `, { count: 'exact' });

    // Apply filters
    if (partner_id) {
      query = query.eq('partner_id', partner_id);
    }

    if (expertise_area) {
      query = query.contains('expertise_areas', [expertise_area]);
    }

    if (typeof is_active === 'boolean') {
      query = query.eq('is_active', is_active);
    }

    if (has_availability) {
      query = query.not('availability', 'is', null);
    }

    if (search) {
      query = query.or(`mentor_name.ilike.%${search}%,designation.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // Apply sorting
    query = query.order('mentor_name', { ascending: true });

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[IndustryMentorService] getMentors error:', error);
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
   * Get single mentor by ID
   */
  static async getMentorById(id: string): Promise<IndustryMentor> {
    this.validateId(id, 'mentor ID');
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('industry_mentors')
      .select(`
        *,
        partner:industry_partners(id, company_name, industry_sector)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[IndustryMentorService] getMentorById error:', error);
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Get mentors by partner ID
   */
  static async getMentorsByPartnerId(partnerId: string): Promise<IndustryMentor[]> {
    this.validateId(partnerId, 'partner ID');
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('industry_mentors')
      .select('*')
      .eq('partner_id', partnerId)
      .eq('is_active', true)
      .order('mentor_name');

    if (error) {
      console.error('[IndustryMentorService] getMentorsByPartnerId error:', error);
      throw new Error(error.message);
    }

    return data || [];
  }

  /**
   * Create new industry mentor
   */
  static async createMentor(dto: CreateIndustryMentorDTO): Promise<IndustryMentor> {
    this.validateId(dto.institution_id, 'institution_id');
    // partner_id is optional - mentor may be independent
    if (dto.partner_id) {
      this.validateId(dto.partner_id, 'partner_id');
    }
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('industry_mentors')
      .insert({
        ...dto,
        current_mentees_count: 0 // DB column: current_mentees_count
      })
      .select()
      .single();

    if (error) {
      console.error('[IndustryMentorService] createMentor error:', error);
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Update industry mentor
   */
  static async updateMentor(
    id: string,
    dto: UpdateIndustryMentorDTO
  ): Promise<IndustryMentor> {
    this.validateId(id, 'mentor ID');
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('industry_mentors')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[IndustryMentorService] updateMentor error:', error);
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Archive mentor (soft delete)
   */
  static async archiveMentor(id: string): Promise<void> {
    this.validateId(id, 'mentor ID');
    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any)
      .from('industry_mentors')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[IndustryMentorService] archiveMentor error:', error);
      throw new Error(error.message);
    }
  }

  /**
   * Restore archived mentor
   */
  static async restoreMentor(id: string): Promise<void> {
    this.validateId(id, 'mentor ID');
    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any)
      .from('industry_mentors')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[IndustryMentorService] restoreMentor error:', error);
      throw new Error(error.message);
    }
  }

  /**
   * Get mentor options for picker
   */
  static async getMentorOptions(partnerId?: string): Promise<MentorPickerOption[]> {
    // Validate partnerId if provided
    if (partnerId) {
      this.validateId(partnerId, 'partner ID');
    }
    const supabase = createClientSupabaseClient();

    let query = (supabase as any)
      .from('industry_mentors')
      .select(`
        id,
        mentor_name,
        designation,
        expertise_areas,
        max_mentees,
        current_mentees_count,
        partner:industry_partners(company_name)
      `)
      .eq('is_active', true);

    if (partnerId) {
      query = query.eq('partner_id', partnerId);
    }

    query = query.order('mentor_name');

    const { data, error } = await query;

    if (error) {
      console.error('[IndustryMentorService] getMentorOptions error:', error);
      throw new Error(error.message);
    }

    return (data || []).map((m: any) => ({
      id: m.id,
      mentor_name: m.mentor_name,
      designation: m.designation,
      partner_name: m.partner?.company_name || '',
      expertise_areas: m.expertise_areas || [],
      available_slots: (m.max_mentees || 5) - (m.current_mentees || 0) // DB column name
    }));
  }
}
