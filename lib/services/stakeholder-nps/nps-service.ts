// Stakeholder NPS Service
// Business logic for NPS surveys, responses, and analytics

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  NPSSurvey,
  NPSResponse,
  NPSAnalytics,
  NPSDashboardData,
  StakeholderType,
  SurveyStatus,
  CreateSurveyDto,
  UpdateSurveyDto,
  SubmitResponseDto,
  SurveyFilters,
  ResponseFilters,
  AnalyticsFilters,
  SurveyListResponse,
  ResponseListResponse
} from '@/types/stakeholder-nps';

export class NPSService {
  private static supabase = createClientSupabaseClient();

  // =====================================================
  // SURVEY OPERATIONS
  // =====================================================

  /**
   * Get all surveys with filters and pagination
   */
  static async getSurveys(filters: SurveyFilters = {}): Promise<SurveyListResponse> {
    const {
      institution_id,
      stakeholder_type,
      status,
      department_id,
      program_id,
      search,
      start_date_from,
      start_date_to,
      page = 1,
      limit = 10,
      sortBy = 'created_at',
      sortDirection = 'desc'
    } = filters;

    let query = this.supabase
      .from('nps_surveys')
      .select(`
        *,
        department:departments(id, department_name),
        program:programs(id, program_name),
        creator:users_profiles!nps_surveys_created_by_fkey(id, full_name, email)
      `, { count: 'exact' });

    // Apply filters
    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }
    if (stakeholder_type) {
      query = query.eq('stakeholder_type', stakeholder_type);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (department_id) {
      query = query.eq('department_id', department_id);
    }
    if (program_id) {
      query = query.eq('program_id', program_id);
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }
    if (start_date_from) {
      query = query.gte('start_date', start_date_from);
    }
    if (start_date_to) {
      query = query.lte('start_date', start_date_to);
    }

    // Apply sorting
    query = query.order(sortBy, { ascending: sortDirection === 'asc' });

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[stakeholder-nps] Error fetching surveys:', error);
      throw new Error(`Failed to fetch surveys: ${error.message}`);
    }

    // Get response counts for each survey
    const surveyIds = data?.map(s => s.id) || [];
    if (surveyIds.length > 0) {
      const { data: responseCounts } = await this.supabase
        .from('nps_responses')
        .select('survey_id')
        .in('survey_id', surveyIds);

      const countMap = new Map<string, number>();
      responseCounts?.forEach(r => {
        countMap.set(r.survey_id, (countMap.get(r.survey_id) || 0) + 1);
      });

      data?.forEach(survey => {
        (survey as NPSSurvey).response_count = countMap.get(survey.id) || 0;
      });
    }

    return {
      data: (data || []) as NPSSurvey[],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  /**
   * Get a single survey by ID
   */
  static async getSurvey(id: string): Promise<NPSSurvey> {
    const { data, error } = await this.supabase
      .from('nps_surveys')
      .select(`
        *,
        department:departments(id, department_name),
        program:programs(id, program_name),
        creator:users_profiles!nps_surveys_created_by_fkey(id, full_name, email)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[stakeholder-nps] Error fetching survey:', error);
      throw new Error(`Failed to fetch survey: ${error.message}`);
    }

    // Get response count
    const { count } = await this.supabase
      .from('nps_responses')
      .select('id', { count: 'exact', head: true })
      .eq('survey_id', id);

    return {
      ...data,
      response_count: count || 0
    } as NPSSurvey;
  }

  /**
   * Create a new survey
   */
  static async createSurvey(surveyData: CreateSurveyDto): Promise<NPSSurvey> {
    const { data: user } = await this.supabase.auth.getUser();

    const { data, error } = await this.supabase
      .from('nps_surveys')
      .insert({
        institution_id: surveyData.institution_id,
        title: surveyData.title,
        description: surveyData.description || null,
        stakeholder_type: surveyData.stakeholder_type,
        department_id: surveyData.department_id || null,
        program_id: surveyData.program_id || null,
        start_date: surveyData.start_date,
        end_date: surveyData.end_date,
        questions: surveyData.questions,
        status: 'draft',
        created_by: user?.user?.id || null
      })
      .select()
      .single();

    if (error) {
      console.error('[stakeholder-nps] Error creating survey:', error);
      throw new Error(`Failed to create survey: ${error.message}`);
    }

    return data as NPSSurvey;
  }

  /**
   * Update a survey
   */
  static async updateSurvey(id: string, updates: UpdateSurveyDto): Promise<NPSSurvey> {
    const updateData: Record<string, unknown> = {};

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.department_id !== undefined) updateData.department_id = updates.department_id;
    if (updates.program_id !== undefined) updateData.program_id = updates.program_id;
    if (updates.start_date !== undefined) updateData.start_date = updates.start_date;
    if (updates.end_date !== undefined) updateData.end_date = updates.end_date;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.questions !== undefined) updateData.questions = updates.questions;

    const { data, error } = await this.supabase
      .from('nps_surveys')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[stakeholder-nps] Error updating survey:', error);
      throw new Error(`Failed to update survey: ${error.message}`);
    }

    return data as NPSSurvey;
  }

  /**
   * Activate a survey
   */
  static async activateSurvey(id: string): Promise<NPSSurvey> {
    return this.updateSurvey(id, { status: 'active' });
  }

  /**
   * Close a survey
   */
  static async closeSurvey(id: string): Promise<NPSSurvey> {
    return this.updateSurvey(id, { status: 'closed' });
  }

  /**
   * Archive a survey
   */
  static async archiveSurvey(id: string): Promise<NPSSurvey> {
    return this.updateSurvey(id, { status: 'archived' });
  }

  /**
   * Delete a survey
   */
  static async deleteSurvey(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('nps_surveys')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[stakeholder-nps] Error deleting survey:', error);
      throw new Error(`Failed to delete survey: ${error.message}`);
    }
  }

  /**
   * Get active surveys for a stakeholder type (for public response submission)
   */
  static async getActiveSurveys(
    institutionId: string,
    stakeholderType: StakeholderType
  ): Promise<NPSSurvey[]> {
    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('nps_surveys')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('stakeholder_type', stakeholderType)
      .eq('status', 'active')
      .lte('start_date', now)
      .gte('end_date', now)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[stakeholder-nps] Error fetching active surveys:', error);
      throw new Error(`Failed to fetch active surveys: ${error.message}`);
    }

    return (data || []) as NPSSurvey[];
  }

  // =====================================================
  // RESPONSE OPERATIONS
  // =====================================================

  /**
   * Submit a survey response
   */
  static async submitResponse(responseData: SubmitResponseDto): Promise<NPSResponse> {
    const { data, error } = await this.supabase
      .from('nps_responses')
      .insert({
        survey_id: responseData.survey_id,
        respondent_id: responseData.respondent_id || null,
        respondent_type: responseData.respondent_type,
        respondent_email: responseData.respondent_email || null,
        respondent_name: responseData.respondent_name || null,
        nps_score: responseData.nps_score,
        additional_feedback: responseData.additional_feedback || null,
        question_responses: responseData.question_responses || {},
        department_id: responseData.department_id || null
      })
      .select()
      .single();

    if (error) {
      console.error('[stakeholder-nps] Error submitting response:', error);
      throw new Error(`Failed to submit response: ${error.message}`);
    }

    return data as NPSResponse;
  }

  /**
   * Get responses with filters and pagination
   */
  static async getResponses(filters: ResponseFilters = {}): Promise<ResponseListResponse> {
    const {
      survey_id,
      nps_category,
      department_id,
      respondent_type,
      submitted_from,
      submitted_to,
      search,
      page = 1,
      limit = 10,
      sortBy = 'submitted_at',
      sortDirection = 'desc'
    } = filters;

    let query = this.supabase
      .from('nps_responses')
      .select(`
        *,
        survey:nps_surveys(id, title, stakeholder_type),
        department:departments(id, department_name)
      `, { count: 'exact' });

    // Apply filters
    if (survey_id) {
      query = query.eq('survey_id', survey_id);
    }
    if (nps_category) {
      query = query.eq('nps_category', nps_category);
    }
    if (department_id) {
      query = query.eq('department_id', department_id);
    }
    if (respondent_type) {
      query = query.eq('respondent_type', respondent_type);
    }
    if (submitted_from) {
      query = query.gte('submitted_at', submitted_from);
    }
    if (submitted_to) {
      query = query.lte('submitted_at', submitted_to);
    }
    if (search) {
      query = query.or(`additional_feedback.ilike.%${search}%,respondent_email.ilike.%${search}%,respondent_name.ilike.%${search}%`);
    }

    // Apply sorting
    query = query.order(sortBy, { ascending: sortDirection === 'asc' });

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[stakeholder-nps] Error fetching responses:', error);
      throw new Error(`Failed to fetch responses: ${error.message}`);
    }

    return {
      data: (data || []) as NPSResponse[],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  /**
   * Get a single response by ID
   */
  static async getResponse(id: string): Promise<NPSResponse> {
    const { data, error } = await this.supabase
      .from('nps_responses')
      .select(`
        *,
        survey:nps_surveys(id, title, stakeholder_type, questions),
        department:departments(id, department_name)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[stakeholder-nps] Error fetching response:', error);
      throw new Error(`Failed to fetch response: ${error.message}`);
    }

    return data as NPSResponse;
  }

  /**
   * Get response summary for a survey
   */
  static async getSurveyResponseSummary(surveyId: string): Promise<{
    total: number;
    promoters: number;
    passives: number;
    detractors: number;
    nps_score: number;
    average_score: number;
  }> {
    const { data, error } = await this.supabase
      .from('nps_responses')
      .select('nps_score, nps_category')
      .eq('survey_id', surveyId);

    if (error) {
      console.error('[stakeholder-nps] Error fetching response summary:', error);
      throw new Error(`Failed to fetch response summary: ${error.message}`);
    }

    const responses = data || [];
    const total = responses.length;
    const promoters = responses.filter(r => r.nps_category === 'promoter').length;
    const passives = responses.filter(r => r.nps_category === 'passive').length;
    const detractors = responses.filter(r => r.nps_category === 'detractor').length;
    const nps_score = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;
    const average_score = total > 0
      ? Math.round((responses.reduce((sum, r) => sum + r.nps_score, 0) / total) * 10) / 10
      : 0;

    return {
      total,
      promoters,
      passives,
      detractors,
      nps_score,
      average_score
    };
  }

  // =====================================================
  // ANALYTICS OPERATIONS
  // =====================================================

  /**
   * Get analytics with filters
   */
  static async getAnalytics(filters: AnalyticsFilters = {}): Promise<NPSAnalytics[]> {
    const {
      institution_id,
      stakeholder_type,
      department_id,
      period_start,
      period_end
    } = filters;

    let query = this.supabase
      .from('nps_analytics')
      .select(`
        *,
        department:departments(id, department_name)
      `)
      .order('period_start', { ascending: false });

    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }
    if (stakeholder_type) {
      query = query.eq('stakeholder_type', stakeholder_type);
    }
    if (department_id) {
      query = query.eq('department_id', department_id);
    }
    if (period_start) {
      query = query.gte('period_start', period_start);
    }
    if (period_end) {
      query = query.lte('period_end', period_end);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[stakeholder-nps] Error fetching analytics:', error);
      throw new Error(`Failed to fetch analytics: ${error.message}`);
    }

    return (data || []) as NPSAnalytics[];
  }

  /**
   * Get dashboard data for an institution
   */
  static async getDashboardData(institutionId: string): Promise<NPSDashboardData> {
    const { data, error } = await this.supabase.rpc('get_nps_dashboard', {
      p_institution_id: institutionId
    });

    if (error) {
      console.error('[stakeholder-nps] Error fetching dashboard data:', error);
      // Return empty dashboard data if function fails
      return {
        overall_nps: 0,
        total_responses: 0,
        response_rate: 0,
        by_stakeholder: {
          parent: { score: 0, responses: 0, promoters: 0, passives: 0, detractors: 0 },
          learner: { score: 0, responses: 0, promoters: 0, passives: 0, detractors: 0 },
          alumni: { score: 0, responses: 0, promoters: 0, passives: 0, detractors: 0 },
          industry: { score: 0, responses: 0, promoters: 0, passives: 0, detractors: 0 },
          staff: { score: 0, responses: 0, promoters: 0, passives: 0, detractors: 0 }
        },
        by_department: {},
        trend: [],
        recent_feedback: []
      };
    }

    return data as NPSDashboardData;
  }

  /**
   * Manually trigger analytics recalculation for a survey
   */
  static async recalculateAnalytics(surveyId: string): Promise<void> {
    const { error } = await this.supabase.rpc('recalculate_nps_analytics', {
      p_survey_id: surveyId
    });

    if (error) {
      console.error('[stakeholder-nps] Error recalculating analytics:', error);
      throw new Error(`Failed to recalculate analytics: ${error.message}`);
    }
  }

  // =====================================================
  // EXPORT OPERATIONS
  // =====================================================

  /**
   * Export survey responses to CSV format
   */
  static async exportResponses(surveyId: string): Promise<string> {
    const { data: responses, error } = await this.supabase
      .from('nps_responses')
      .select(`
        id,
        nps_score,
        nps_category,
        additional_feedback,
        respondent_type,
        respondent_email,
        respondent_name,
        submitted_at,
        department:departments(department_name)
      `)
      .eq('survey_id', surveyId)
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('[stakeholder-nps] Error exporting responses:', error);
      throw new Error(`Failed to export responses: ${error.message}`);
    }

    // Build CSV
    const headers = [
      'ID',
      'NPS Score',
      'Category',
      'Feedback',
      'Respondent Type',
      'Email',
      'Name',
      'Department',
      'Submitted At'
    ];

    const rows = responses?.map(r => [
      r.id,
      r.nps_score,
      r.nps_category,
      `"${(r.additional_feedback || '').replace(/"/g, '""')}"`,
      r.respondent_type,
      r.respondent_email || '',
      r.respondent_name || '',
      (r.department as { department_name: string } | null)?.department_name || '',
      r.submitted_at
    ]) || [];

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}
