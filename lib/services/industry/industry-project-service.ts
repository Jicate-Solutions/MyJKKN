// ============================================================================
// Industry Project Service
// CRUD operations for industry projects
// Note: Using 'as any' type casts because industry tables are new and
// Supabase TypeScript types haven't been regenerated yet
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  IndustryProject,
  IndustryListResponse,
  IndustryProjectFilters,
  CreateIndustryProjectDTO,
  UpdateIndustryProjectDTO,
  ProjectPickerOption,
  ProjectSummary
} from '@/types/industry';

export class IndustryProjectService {
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
      console.error(`[IndustryProjectService] Invalid ${fieldName}: ${actualValue}`);
      throw new Error(`Invalid ${fieldName}: ${actualValue}. Expected a valid UUID.`);
    }
  }

  /**
   * Get paginated list of industry projects
   */
  static async getProjects(
    filters: IndustryProjectFilters = {}
  ): Promise<IndustryListResponse<IndustryProject>> {
    const supabase = createClientSupabaseClient();
    const {
      partner_id,
      status,
      difficulty_level,
      required_competency,
      is_remote,
      has_stipend,
      search,
      page = 1,
      limit = 10,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = filters;

    let query = (supabase as any)
      .from('industry_projects')
      .select(`
        *,
        partner:industry_partners(id, company_name, industry_sector),
        mentor:industry_mentors(id, mentor_name, designation)
      `, { count: 'exact' });

    // Apply filters
    if (partner_id) {
      query = query.eq('partner_id', partner_id);
    }

    if (status) {
      if (Array.isArray(status)) {
        query = query.in('status', status);
      } else {
        query = query.eq('status', status);
      }
    }

    if (difficulty_level) {
      if (Array.isArray(difficulty_level)) {
        query = query.in('difficulty_level', difficulty_level);
      } else {
        query = query.eq('difficulty_level', difficulty_level);
      }
    }

    if (required_competency) {
      query = query.contains('required_competencies', [required_competency]);
    }

    if (typeof is_remote === 'boolean') {
      query = query.eq('is_remote', is_remote);
    }

    if (has_stipend) {
      query = query.gt('stipend_amount', 0);
    }

    if (search) {
      query = query.or(`project_title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Apply sorting
    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[IndustryProjectService] getProjects error:', error);
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
   * Get single project by ID
   */
  static async getProjectById(id: string): Promise<IndustryProject> {
    this.validateId(id, 'project ID');
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('industry_projects')
      .select(`
        *,
        partner:industry_partners(id, company_name, industry_sector, contact_person, contact_email),
        mentor:industry_mentors(id, mentor_name, designation, email, expertise_areas),
        engagements:learner_industry_engagements(count)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[IndustryProjectService] getProjectById error:', error);
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Get projects by partner ID
   */
  static async getProjectsByPartnerId(partnerId: string): Promise<IndustryProject[]> {
    this.validateId(partnerId, 'partner ID');
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('industry_projects')
      .select(`
        *,
        mentor:industry_mentors(id, mentor_name)
      `)
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[IndustryProjectService] getProjectsByPartnerId error:', error);
      throw new Error(error.message);
    }

    return data || [];
  }

  /**
   * Get open projects (for learner browsing)
   */
  static async getOpenProjects(
    filters: Omit<IndustryProjectFilters, 'status'> = {}
  ): Promise<IndustryListResponse<IndustryProject>> {
    return this.getProjects({
      ...filters,
      status: 'open'
    });
  }

  /**
   * Create new industry project
   */
  static async createProject(dto: CreateIndustryProjectDTO): Promise<IndustryProject> {
    this.validateId(dto.partner_id, 'partner_id');
    if (dto.mentor_id) {
      this.validateId(dto.mentor_id, 'mentor_id');
    }
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('industry_projects')
      .insert({
        ...dto,
        status: dto.status || 'draft',
        stipend_currency: dto.stipend_currency || 'INR'
      })
      .select()
      .single();

    if (error) {
      console.error('[IndustryProjectService] createProject error:', error);
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Update industry project
   */
  static async updateProject(
    id: string,
    dto: UpdateIndustryProjectDTO
  ): Promise<IndustryProject> {
    this.validateId(id, 'project ID');
    if (dto.mentor_id) {
      this.validateId(dto.mentor_id, 'mentor_id');
    }
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('industry_projects')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[IndustryProjectService] updateProject error:', error);
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Update project status
   */
  static async updateProjectStatus(
    id: string,
    status: IndustryProject['status']
  ): Promise<void> {
    this.validateId(id, 'project ID');
    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any)
      .from('industry_projects')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[IndustryProjectService] updateProjectStatus error:', error);
      throw new Error(error.message);
    }
  }

  /**
   * Delete project (only if draft)
   */
  static async deleteProject(id: string): Promise<void> {
    this.validateId(id, 'project ID');
    const supabase = createClientSupabaseClient();

    // First check if project is in draft status
    const { data: project, error: fetchError } = await (supabase as any)
      .from('industry_projects')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[IndustryProjectService] deleteProject fetch error:', fetchError);
      throw new Error(fetchError.message);
    }

    if (project.status !== 'draft') {
      throw new Error('Only draft projects can be deleted');
    }

    const { error } = await (supabase as any)
      .from('industry_projects')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[IndustryProjectService] deleteProject error:', error);
      throw new Error(error.message);
    }
  }

  /**
   * Cancel project
   */
  static async cancelProject(id: string): Promise<void> {
    await this.updateProjectStatus(id, 'cancelled');
  }

  /**
   * Get project options for picker
   */
  static async getProjectOptions(partnerId?: string): Promise<ProjectPickerOption[]> {
    const supabase = createClientSupabaseClient();

    let query = (supabase as any)
      .from('industry_projects')
      .select(`
        id,
        project_title,
        status,
        max_team_size,
        partner:industry_partners(company_name),
        engagements:learner_industry_engagements(count)
      `)
      .in('status', ['open', 'assigned']);

    if (partnerId) {
      query = query.eq('partner_id', partnerId);
    }

    query = query.order('project_title');

    const { data, error } = await query;

    if (error) {
      console.error('[IndustryProjectService] getProjectOptions error:', error);
      throw new Error(error.message);
    }

    return (data || []).map((p: any) => ({
      id: p.id,
      project_title: p.project_title,
      partner_name: p.partner?.company_name || '',
      status: p.status,
      spots_remaining: (p.max_team_size || 1) - (p.engagements?.[0]?.count || 0)
    }));
  }

  /**
   * Get project summaries for listings
   */
  static async getProjectSummaries(partnerId?: string): Promise<ProjectSummary[]> {
    const supabase = createClientSupabaseClient();

    let query = (supabase as any)
      .from('industry_projects')
      .select(`
        id,
        project_title,
        difficulty_level,
        status,
        application_deadline,
        max_team_size,
        partner:industry_partners(company_name),
        engagements:learner_industry_engagements(count)
      `)
      .in('status', ['open', 'assigned', 'in_progress']);

    if (partnerId) {
      query = query.eq('partner_id', partnerId);
    }

    query = query.order('application_deadline', { ascending: true, nullsFirst: false });

    const { data, error } = await query;

    if (error) {
      console.error('[IndustryProjectService] getProjectSummaries error:', error);
      throw new Error(error.message);
    }

    return (data || []).map((p: any) => ({
      id: p.id,
      project_title: p.project_title,
      partner_name: p.partner?.company_name || '',
      difficulty_level: p.difficulty_level,
      status: p.status,
      application_deadline: p.application_deadline,
      applicants_count: p.engagements?.[0]?.count || 0,
      spots_remaining: (p.max_team_size || 1) - (p.engagements?.[0]?.count || 0)
    }));
  }
}
