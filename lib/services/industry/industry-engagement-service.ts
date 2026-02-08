// ============================================================================
// Industry Engagement Service
// CRUD operations for learner industry engagements
// Note: Using 'as any' type casts because industry tables are new and
// Supabase TypeScript types haven't been regenerated yet
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  LearnerIndustryEngagement,
  IndustryListResponse,
  LearnerEngagementFilters,
  CreateLearnerEngagementDTO,
  UpdateLearnerEngagementDTO,
  EngagementFeedback,
  IndustryStats
} from '@/types/industry';

export class IndustryEngagementService {
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
      console.error(`[IndustryEngagementService] Invalid ${fieldName}: ${actualValue}`);
      throw new Error(`Invalid ${fieldName}: ${actualValue}. Expected a valid UUID.`);
    }
  }

  /**
   * Get paginated list of learner engagements
   */
  static async getEngagements(
    filters: LearnerEngagementFilters = {}
  ): Promise<IndustryListResponse<LearnerIndustryEngagement>> {
    const supabase = createClientSupabaseClient();
    const {
      learner_id,
      partner_id,
      project_id,
      mentor_id,
      engagement_type,
      status,
      page = 1,
      limit = 10
    } = filters;

    let query = (supabase as any)
      .from('learner_industry_engagements')
      .select(`
        *,
        project:industry_projects(id, project_title, status),
        mentor:industry_mentors(id, mentor_name, designation),
        partner:industry_partners(id, company_name)
      `, { count: 'exact' });

    // Apply filters
    if (learner_id) {
      query = query.eq('learner_id', learner_id);
    }

    if (partner_id) {
      query = query.eq('partner_id', partner_id);
    }

    if (project_id) {
      query = query.eq('project_id', project_id);
    }

    if (mentor_id) {
      query = query.eq('mentor_id', mentor_id);
    }

    if (engagement_type) {
      if (Array.isArray(engagement_type)) {
        query = query.in('engagement_type', engagement_type);
      } else {
        query = query.eq('engagement_type', engagement_type);
      }
    }

    if (status) {
      if (Array.isArray(status)) {
        query = query.in('status', status);
      } else {
        query = query.eq('status', status);
      }
    }

    // Apply sorting
    query = query.order('created_at', { ascending: false });

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[IndustryEngagementService] getEngagements error:', error);
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
   * Get single engagement by ID
   */
  static async getEngagementById(id: string): Promise<LearnerIndustryEngagement> {
    this.validateId(id, 'engagement ID');
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('learner_industry_engagements')
      .select(`
        *,
        project:industry_projects(id, project_title, description, status, technologies, deliverables),
        mentor:industry_mentors(id, mentor_name, designation, email, expertise_areas),
        partner:industry_partners(id, company_name, industry_sector, contact_email)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[IndustryEngagementService] getEngagementById error:', error);
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Get engagements by learner ID
   */
  static async getEngagementsByLearnerId(
    learnerId: string,
    status?: string | string[]
  ): Promise<LearnerIndustryEngagement[]> {
    this.validateId(learnerId, 'learner ID');
    const supabase = createClientSupabaseClient();

    let query = (supabase as any)
      .from('learner_industry_engagements')
      .select(`
        *,
        project:industry_projects(id, project_title, status),
        mentor:industry_mentors(id, mentor_name),
        partner:industry_partners(id, company_name)
      `)
      .eq('learner_id', learnerId);

    if (status) {
      if (Array.isArray(status)) {
        query = query.in('status', status);
      } else {
        query = query.eq('status', status);
      }
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('[IndustryEngagementService] getEngagementsByLearnerId error:', error);
      throw new Error(error.message);
    }

    return data || [];
  }

  /**
   * Get active engagements for a learner
   */
  static async getActiveLearnerEngagements(
    learnerId: string
  ): Promise<LearnerIndustryEngagement[]> {
    return this.getEngagementsByLearnerId(learnerId, ['applied', 'approved', 'active']);
  }

  /**
   * Create new learner engagement
   */
  static async createEngagement(
    dto: CreateLearnerEngagementDTO
  ): Promise<LearnerIndustryEngagement> {
    // Validate required fields
    this.validateId(dto.learner_id, 'learner_id');
    this.validateId(dto.institution_id, 'institution_id');

    // Validate optional UUIDs if provided
    if (dto.project_id) {
      this.validateId(dto.project_id, 'project_id');
    }
    if (dto.mentor_id) {
      this.validateId(dto.mentor_id, 'mentor_id');
    }
    if (dto.partner_id) {
      this.validateId(dto.partner_id, 'partner_id');
    }

    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('learner_industry_engagements')
      .insert({
        ...dto,
        status: dto.status || 'applied', // Use 'applied' as default (matches DB ENUM)
        competencies_demonstrated: [],
        hours_completed: 0
      })
      .select()
      .single();

    if (error) {
      console.error('[IndustryEngagementService] createEngagement error:', error);
      throw new Error(error.message);
    }

    // If this is a mentorship engagement, increment mentor's mentee count
    // Note: This RPC function may need to be created separately
    if (dto.mentor_id && dto.engagement_type === 'mentorship') {
      try {
        await (supabase as any).rpc('increment_mentor_mentees', { mentor_id: dto.mentor_id });
      } catch (rpcError) {
        console.warn('[IndustryEngagementService] increment_mentor_mentees RPC not available:', rpcError);
      }
    }

    return data;
  }

  /**
   * Update learner engagement
   */
  static async updateEngagement(
    id: string,
    dto: UpdateLearnerEngagementDTO
  ): Promise<LearnerIndustryEngagement> {
    this.validateId(id, 'engagement ID');

    // Validate optional UUIDs if provided in update
    if (dto.project_id) {
      this.validateId(dto.project_id, 'project_id');
    }
    if (dto.mentor_id) {
      this.validateId(dto.mentor_id, 'mentor_id');
    }
    if (dto.partner_id) {
      this.validateId(dto.partner_id, 'partner_id');
    }

    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('learner_industry_engagements')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[IndustryEngagementService] updateEngagement error:', error);
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Update engagement status
   */
  static async updateEngagementStatus(
    id: string,
    status: LearnerIndustryEngagement['status'],
    endDate?: string
  ): Promise<void> {
    this.validateId(id, 'engagement ID');
    const supabase = createClientSupabaseClient();

    const updateData: Record<string, any> = {
      status,
      updated_at: new Date().toISOString()
    };

    // Set end_date if completing or terminating (DB column: end_date)
    if (['completed', 'terminated', 'withdrawn'].includes(status)) {
      updateData.end_date = endDate || new Date().toISOString().split('T')[0];
    }

    const { error } = await (supabase as any)
      .from('learner_industry_engagements')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('[IndustryEngagementService] updateEngagementStatus error:', error);
      throw new Error(error.message);
    }
  }

  /**
   * Add feedback to engagement
   * NOTE: DB has a single `feedback` JSONB column (NOT separate mentor/learner columns)
   * The feedback object can have any structure, e.g., { mentor_feedback: {...}, learner_feedback: {...} }
   */
  static async addFeedback(
    id: string,
    feedbackType: 'mentor_feedback' | 'learner_feedback',
    feedbackData: any
  ): Promise<LearnerIndustryEngagement> {
    this.validateId(id, 'engagement ID');
    const supabase = createClientSupabaseClient();

    // First get current feedback JSONB
    const { data: existing, error: fetchError } = await (supabase as any)
      .from('learner_industry_engagements')
      .select('feedback')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[IndustryEngagementService] addFeedback fetch error:', fetchError);
      throw new Error(fetchError.message);
    }

    // Merge new feedback into the existing feedback JSONB
    const currentFeedback = existing?.feedback || {};
    const updatedFeedback = {
      ...currentFeedback,
      [feedbackType]: feedbackData
    };

    const { data, error } = await (supabase as any)
      .from('learner_industry_engagements')
      .update({
        feedback: updatedFeedback,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[IndustryEngagementService] addFeedback error:', error);
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Update progress percentage
   * NOTE: DB doesn't have hours_completed column - tracking is via progress_percentage
   */
  static async updateProgress(id: string, progressPercentage: number): Promise<void> {
    this.validateId(id, 'engagement ID');

    if (progressPercentage < 0 || progressPercentage > 100) {
      throw new Error('Progress percentage must be between 0 and 100');
    }

    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any)
      .from('learner_industry_engagements')
      .update({
        progress_percentage: progressPercentage,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('[IndustryEngagementService] updateProgress error:', error);
      throw new Error(error.message);
    }
  }

  /**
   * Add demonstrated competency
   */
  static async addDemonstratedCompetency(
    id: string,
    competencyId: string
  ): Promise<void> {
    this.validateId(id, 'engagement ID');
    this.validateId(competencyId, 'competency ID');
    const supabase = createClientSupabaseClient();

    // Get current competencies
    const { data: existing, error: fetchError } = await (supabase as any)
      .from('learner_industry_engagements')
      .select('competencies_demonstrated')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[IndustryEngagementService] addDemonstratedCompetency fetch error:', fetchError);
      throw new Error(fetchError.message);
    }

    const currentCompetencies = existing?.competencies_demonstrated || [];
    if (currentCompetencies.includes(competencyId)) {
      return; // Already added
    }

    const { error } = await (supabase as any)
      .from('learner_industry_engagements')
      .update({
        competencies_demonstrated: [...currentCompetencies, competencyId],
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('[IndustryEngagementService] addDemonstratedCompetency error:', error);
      throw new Error(error.message);
    }
  }

  /**
   * Get industry module statistics
   */
  static async getIndustryStats(institutionId: string): Promise<IndustryStats> {
    const supabase = createClientSupabaseClient();

    // Get partner stats
    const { data: partners, error: partnerError } = await (supabase as any)
      .from('industry_partners')
      .select('id, is_active, partnership_type')
      .eq('institution_id', institutionId);

    if (partnerError) {
      console.error('[IndustryEngagementService] getIndustryStats partner error:', partnerError);
      throw new Error(partnerError.message);
    }

    const partnerIds = (partners || []).map((p: any) => p.id);

    // Initialize empty arrays for when there are no partners
    // This avoids the "invalid input syntax for type uuid" error from ['none']
    let mentors: any[] = [];
    let projects: any[] = [];
    let engagements: any[] = [];

    // Only query related tables if we have partner IDs
    if (partnerIds.length > 0) {
      // Get mentor stats
      const { data: mentorData, error: mentorError } = await (supabase as any)
        .from('industry_mentors')
        .select('id, is_active')
        .in('partner_id', partnerIds);

      if (mentorError) {
        console.error('[IndustryEngagementService] getIndustryStats mentor error:', mentorError);
        throw new Error(mentorError.message);
      }
      mentors = mentorData || [];

      // Get project stats
      const { data: projectData, error: projectError } = await (supabase as any)
        .from('industry_projects')
        .select('id, status')
        .in('partner_id', partnerIds);

      if (projectError) {
        console.error('[IndustryEngagementService] getIndustryStats project error:', projectError);
        throw new Error(projectError.message);
      }
      projects = projectData || [];

      // Get engagement stats
      const { data: engagementData, error: engagementError } = await (supabase as any)
        .from('learner_industry_engagements')
        .select('id, status, engagement_type')
        .in('partner_id', partnerIds);

      if (engagementError) {
        console.error('[IndustryEngagementService] getIndustryStats engagement error:', engagementError);
        throw new Error(engagementError.message);
      }
      engagements = engagementData || [];
    }

    // Calculate stats
    const partnerList = partners || [];
    const mentorList = mentors;
    const projectList = projects;
    const engagementList = engagements;

    const byPartnershipType = partnerList.reduce((acc: Record<string, number>, p: any) => {
      if (p.partnership_type) {
        acc[p.partnership_type] = (acc[p.partnership_type] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    const byProjectStatus = projectList.reduce((acc: Record<string, number>, p: any) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byEngagementType = engagementList.reduce((acc: Record<string, number>, e: any) => {
      acc[e.engagement_type] = (acc[e.engagement_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total_partners: partnerList.length,
      active_partners: partnerList.filter((p: any) => p.is_active).length,
      total_mentors: mentorList.length,
      active_mentors: mentorList.filter((m: any) => m.is_active).length,
      total_projects: projectList.length,
      open_projects: projectList.filter((p: any) => p.status === 'open').length,
      total_engagements: engagementList.length,
      active_engagements: engagementList.filter((e: any) => ['applied', 'approved', 'active'].includes(e.status)).length,
      by_partnership_type: byPartnershipType as any,
      by_project_status: byProjectStatus as any,
      by_engagement_type: byEngagementType as any
    };
  }
}
