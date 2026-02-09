/**
 * Stakeholder NPS Service
 * Handles all NPS survey and response operations with institution access validation
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  NPSSurvey,
  NPSResponse,
  NPSSurveyAnalytics,
  NPSTrendData,
  CreateNPSSurveyDto,
  UpdateNPSSurveyDto,
  SubmitNPSResponseDto,
  NPSSurveyFilters,
  NPSResponseFilters,
  NPSAnalyticsFilters,
  NPSSurveyListResponse,
  NPSResponseListResponse
} from '@/types/stakeholder-nps';

export class NPSService {
  // Cast to any to avoid TypeScript deep instantiation errors with Supabase types
  private static supabase = createClientSupabaseClient() as any;

  // ============================================
  // Security Utilities
  // ============================================

  /**
   * Sanitize search input to prevent SQL ILIKE injection
   * Escapes %, _, and \ characters
   */
  private static sanitizeSearch(input: string): string {
    if (!input) return '';
    return input
      .replace(/\\/g, '\\\\')  // Escape backslash first
      .replace(/%/g, '\\%')    // Escape % wildcard
      .replace(/_/g, '\\_');   // Escape _ wildcard
  }

  // ============================================
  // Security Validation
  // ============================================

  private static async validateInstitutionAccess(institutionId: string): Promise<void> {
    if (!institutionId || institutionId.trim() === '') {
      throw new Error('Institution ID is required');
    }

    const { data: { user }, error: authError } = await this.supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Authentication required');
    }

    const { data: access, error } = await this.supabase
      .from('user_institution_access')
      .select('institution_id')
      .eq('user_id', user.id)
      .eq('institution_id', institutionId)
      .single();

    if (error || !access) {
      console.error('[stakeholder-nps] Access denied:', { userId: user.id, institutionId });
      throw new Error('Access denied: Institution not accessible to user');
    }
  }

  // ============================================
  // Survey CRUD Operations
  // ============================================

  static async createSurvey(dto: CreateNPSSurveyDto): Promise<NPSSurvey> {
    await this.validateInstitutionAccess(dto.institution_id);

    const { data: { user } } = await this.supabase.auth.getUser();

    const { data, error } = await this.supabase
      .from('nps_surveys')
      .insert({
        institution_id: dto.institution_id,
        title: dto.title,
        description: dto.description ?? null,
        stakeholder_types: dto.stakeholder_types,
        question: dto.question || 'How likely are you to recommend our institution to others?',
        start_date: dto.start_date,
        end_date: dto.end_date,
        status: dto.status || 'draft',
        created_by: user?.id ?? null
      })
      .select()
      .single();

    if (error) {
      console.error('[NPSService] Create survey error:', error);
      throw new Error(`Failed to create survey: ${error.message}`);
    }

    return data as NPSSurvey;
  }

  static async getSurveys(filters: NPSSurveyFilters): Promise<NPSSurveyListResponse> {
    await this.validateInstitutionAccess(filters.institution_id);

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('nps_surveys')
      .select('*', { count: 'exact' })
      .eq('institution_id', filters.institution_id);

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status);
      } else {
        query = query.eq('status', filters.status);
      }
    }

    if (filters.stakeholder_type) {
      query = query.contains('stakeholder_types', [filters.stakeholder_type]);
    }

    if (filters.start_date_from) {
      query = query.gte('start_date', filters.start_date_from);
    }

    if (filters.start_date_to) {
      query = query.lte('start_date', filters.start_date_to);
    }

    if (filters.search) {
      const sanitized = this.sanitizeSearch(filters.search);
      query = query.or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
    }

    // Apply sorting
    const sortBy = filters.sortBy || 'created_at';
    const sortDirection = filters.sortDirection || 'desc';
    query = query.order(sortBy, { ascending: sortDirection === 'asc' });

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[NPSService] Get surveys error:', error);
      throw new Error(`Failed to fetch surveys: ${error.message}`);
    }

    // Get response counts for each survey
    const surveys = (data as NPSSurvey[]) || [];
    if (surveys.length > 0) {
      const surveyIds = surveys.map(s => s.id);
      const { data: responses } = await this.supabase
        .from('nps_responses')
        .select('survey_id')
        .in('survey_id', surveyIds);

      // Count responses per survey
      const responseCounts = (responses || []).reduce((acc: Record<string, number>, r: any) => {
        acc[r.survey_id] = (acc[r.survey_id] || 0) + 1;
        return acc;
      }, {});

      // Add response counts to surveys
      surveys.forEach(survey => {
        survey.response_count = responseCounts[survey.id] || 0;
      });
    }

    return {
      data: surveys,
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  static async getSurvey(id: string, institutionId?: string): Promise<NPSSurvey> {
    let query = this.supabase
      .from('nps_surveys')
      .select('*')
      .eq('id', id);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Survey not found or access denied');
      }
      console.error('[NPSService] Get survey error:', error);
      throw new Error(`Failed to fetch survey: ${error.message}`);
    }

    if (!data) {
      throw new Error('Survey not found');
    }

    // Get response count
    const { count } = await this.supabase
      .from('nps_responses')
      .select('*', { count: 'exact', head: true })
      .eq('survey_id', id);

    const survey = data as NPSSurvey;
    survey.response_count = count || 0;

    return survey;
  }

  static async getSurveyById(id: string): Promise<NPSSurvey | null> {
    try {
      return await this.getSurvey(id);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return null;
      }
      throw error;
    }
  }

  static async updateSurvey(id: string, dto: UpdateNPSSurveyDto): Promise<NPSSurvey> {
    const existing = await this.getSurveyById(id);
    if (!existing) {
      throw new Error('Survey not found');
    }

    await this.validateInstitutionAccess(existing.institution_id);

    const { data, error } = await this.supabase
      .from('nps_surveys')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[NPSService] Update survey error:', error);
      throw new Error(`Failed to update survey: ${error.message}`);
    }

    return data as NPSSurvey;
  }

  static async deleteSurvey(id: string): Promise<void> {
    const existing = await this.getSurveyById(id);
    if (!existing) {
      throw new Error('Survey not found');
    }

    await this.validateInstitutionAccess(existing.institution_id);

    const { error } = await this.supabase
      .from('nps_surveys')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[NPSService] Delete survey error:', error);
      throw new Error(`Failed to delete survey: ${error.message}`);
    }
  }

  static async activateSurvey(id: string): Promise<NPSSurvey> {
    return this.updateSurvey(id, { status: 'active' });
  }

  static async closeSurvey(id: string): Promise<NPSSurvey> {
    return this.updateSurvey(id, { status: 'closed' });
  }

  static async archiveSurvey(id: string): Promise<NPSSurvey> {
    return this.updateSurvey(id, { status: 'archived' });
  }

  static async getActiveSurveys(institutionId: string, stakeholderType: string): Promise<NPSSurvey[]> {
    await this.validateInstitutionAccess(institutionId);

    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('nps_surveys')
      .select('*')
      .eq('institution_id', institutionId)
      .contains('stakeholder_types', [stakeholderType])
      .eq('status', 'active')
      .lte('start_date', now)
      .gte('end_date', now)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[NPSService] Get active surveys error:', error);
      throw new Error(`Failed to fetch active surveys: ${error.message}`);
    }

    return (data as NPSSurvey[]) || [];
  }

  // ============================================
  // Response Operations
  // ============================================

  static async submitResponse(dto: SubmitNPSResponseDto): Promise<NPSResponse> {
    // Validate NPS score
    if (dto.score < 0 || dto.score > 10) {
      throw new Error('NPS score must be between 0 and 10');
    }

    // Get and validate survey
    const { data: survey, error: surveyError } = await this.supabase
      .from('nps_surveys')
      .select('id, status, end_date, institution_id')
      .eq('id', dto.survey_id)
      .single();

    if (surveyError || !survey) {
      throw new Error('Survey not found');
    }

    if (survey.status !== 'active') {
      throw new Error('Survey is not currently active');
    }

    const now = new Date();
    const endDate = new Date(survey.end_date);
    if (now > endDate) {
      throw new Error('Survey has ended');
    }

    const { data, error } = await this.supabase
      .from('nps_responses')
      .insert({
        survey_id: dto.survey_id,
        stakeholder_id: dto.stakeholder_id,
        stakeholder_type: dto.stakeholder_type,
        stakeholder_email: dto.stakeholder_email ?? null,
        stakeholder_name: dto.stakeholder_name ?? null,
        score: dto.score,
        feedback: dto.feedback ?? null
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('You have already submitted a response for this survey');
      }
      console.error('[NPSService] Submit response error:', error);
      throw new Error(`Failed to submit response: ${error.message}`);
    }

    return data as NPSResponse;
  }

  static async getResponse(id: string, institutionId?: string): Promise<NPSResponse> {
    const { data, error } = await this.supabase
      .from('nps_responses')
      .select(`
        *,
        survey:nps_surveys(institution_id)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Response not found or access denied');
      }
      console.error('[NPSService] Get response error:', error);
      throw new Error(`Failed to fetch response: ${error.message}`);
    }

    if (!data) {
      throw new Error('Response not found');
    }

    // Validate institution access if provided
    if (institutionId && data.survey?.institution_id !== institutionId) {
      throw new Error('Response not found or access denied');
    }

    return data as NPSResponse;
  }

  static async getResponses(filters: NPSResponseFilters): Promise<NPSResponseListResponse> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('nps_responses')
      .select('*', { count: 'exact' });

    if (filters.survey_id) {
      query = query.eq('survey_id', filters.survey_id);
    }

    if (filters.sentiment) {
      query = query.eq('sentiment', filters.sentiment);
    }

    if (filters.stakeholder_type) {
      query = query.eq('stakeholder_type', filters.stakeholder_type);
    }

    if (filters.score_min !== undefined) {
      query = query.gte('score', filters.score_min);
    }

    if (filters.score_max !== undefined) {
      query = query.lte('score', filters.score_max);
    }

    if (filters.has_feedback !== undefined) {
      if (filters.has_feedback) {
        query = query.not('feedback', 'is', null);
      } else {
        query = query.is('feedback', null);
      }
    }

    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }

    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    // Apply sorting
    query = query.order('created_at', { ascending: false });

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[NPSService] Get responses error:', error);
      throw new Error(`Failed to fetch responses: ${error.message}`);
    }

    return {
      data: (data as NPSResponse[]) || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  // ============================================
  // Analytics Operations
  // ============================================

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
      .select('score, sentiment')
      .eq('survey_id', surveyId);

    if (error) {
      console.error('[NPSService] Get response summary error:', error);
      throw new Error(`Failed to fetch response summary: ${error.message}`);
    }

    const responses = (data || []) as Array<{ score: number; sentiment: string }>;
    const total = responses.length;

    if (total === 0) {
      return {
        total: 0,
        promoters: 0,
        passives: 0,
        detractors: 0,
        nps_score: 0,
        average_score: 0
      };
    }

    const promoters = responses.filter(r => r.sentiment === 'promoter').length;
    const passives = responses.filter(r => r.sentiment === 'passive').length;
    const detractors = responses.filter(r => r.sentiment === 'detractor').length;

    // NPS = ((Promoters - Detractors) / Total) * 100
    const nps_score = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;

    // Calculate average score
    const totalScore = responses.reduce((sum, r) => sum + r.score, 0);
    const average_score = Math.round((totalScore / total) * 10) / 10;

    return {
      total,
      promoters,
      passives,
      detractors,
      nps_score,
      average_score
    };
  }

  static async getSurveyAnalytics(surveyId: string): Promise<NPSSurveyAnalytics | null> {
    const { data, error } = await this.supabase
      .from('nps_survey_analytics')
      .select('*')
      .eq('survey_id', surveyId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[NPSService] Get analytics error:', error);
      throw new Error(`Failed to fetch analytics: ${error.message}`);
    }

    if (data) {
      await this.validateInstitutionAccess(data.institution_id);
    }

    return data as NPSSurveyAnalytics | null;
  }

  static async getAnalytics(filters: any): Promise<any[]> {
    await this.validateInstitutionAccess(filters.institution_id);

    let query = this.supabase
      .from('nps_analytics')
      .select('*')
      .eq('institution_id', filters.institution_id);

    if (filters.stakeholder_type) {
      query = query.eq('stakeholder_type', filters.stakeholder_type);
    }

    if (filters.department_id) {
      query = query.eq('department_id', filters.department_id);
    }

    if (filters.period_start) {
      query = query.gte('period_start', filters.period_start);
    }

    if (filters.period_end) {
      query = query.lte('period_end', filters.period_end);
    }

    query = query.order('period_start', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('[NPSService] Get analytics error:', error);
      throw new Error(`Failed to fetch analytics: ${error.message}`);
    }

    return data || [];
  }

  static async recalculateAnalytics(surveyId: string): Promise<void> {
    const { error } = await this.supabase.rpc('recalculate_nps_analytics', {
      p_survey_id: surveyId
    });

    if (error) {
      console.error('[NPSService] Recalculate analytics error:', error);
      throw new Error(`Failed to recalculate analytics: ${error.message}`);
    }
  }

  static async exportResponses(surveyId: string, format: 'csv' | 'json' = 'csv'): Promise<string | object> {
    const { data, error } = await this.supabase
      .from('nps_responses')
      .select(`
        id,
        score,
        sentiment,
        feedback,
        stakeholder_type,
        stakeholder_email,
        stakeholder_name,
        created_at
      `)
      .eq('survey_id', surveyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[NPSService] Export responses error:', error);
      throw new Error(`Failed to export responses: ${error.message}`);
    }

    const responses = data || [];

    if (format === 'json') {
      return responses;
    }

    // Create CSV header
    const headers = [
      'ID',
      'NPS Score',
      'Category',
      'Feedback',
      'Stakeholder Type',
      'Email',
      'Name',
      'Submitted At'
    ];

    // Create CSV rows
    const rows = responses.map((r: any) => [
      r.id,
      r.score,
      r.sentiment,
      r.feedback ? `"${r.feedback.replace(/"/g, '""')}"` : '',
      r.stakeholder_type,
      r.stakeholder_email || '',
      r.stakeholder_name || '',
      r.created_at
    ]);

    // Combine headers and rows
    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    return csv;
  }

  static async getTrendAnalytics(filters: NPSAnalyticsFilters): Promise<NPSTrendData[]> {
    await this.validateInstitutionAccess(filters.institution_id);

    let query = this.supabase
      .from('nps_trend_analysis')
      .select('*')
      .eq('institution_id', filters.institution_id);

    if (filters.stakeholder_type) {
      query = query.eq('stakeholder_type', filters.stakeholder_type);
    }

    if (filters.date_from) {
      query = query.gte('month', filters.date_from);
    }

    if (filters.date_to) {
      query = query.lte('month', filters.date_to);
    }

    query = query.order('month', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('[NPSService] Get trend analytics error:', error);
      throw new Error(`Failed to fetch trend analytics: ${error.message}`);
    }

    return (data as NPSTrendData[]) || [];
  }

  static async getTopFeedback(surveyId: string): Promise<{ promoters: string[]; detractors: string[] }> {
    const survey = await this.getSurveyById(surveyId);
    if (!survey) {
      throw new Error('Survey not found');
    }

    const { data: promoters, error: promotersError } = await this.supabase
      .from('nps_responses')
      .select('feedback')
      .eq('survey_id', surveyId)
      .eq('sentiment', 'promoter')
      .not('feedback', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (promotersError) {
      console.error('[NPSService] Get promoter feedback error:', promotersError);
      throw new Error(`Failed to fetch promoter feedback: ${promotersError.message}`);
    }

    const { data: detractors, error: detractorsError } = await this.supabase
      .from('nps_responses')
      .select('feedback')
      .eq('survey_id', surveyId)
      .eq('sentiment', 'detractor')
      .not('feedback', 'is', null)
      .order('created_at', { ascending: false})
      .limit(10);

    if (detractorsError) {
      console.error('[NPSService] Get detractor feedback error:', detractorsError);
      throw new Error(`Failed to fetch detractor feedback: ${detractorsError.message}`);
    }

    return {
      promoters: promoters?.map(r => r.feedback).filter(Boolean) as string[] || [],
      detractors: detractors?.map(r => r.feedback).filter(Boolean) as string[] || []
    };
  }

  // ============================================
  // Dashboard Operations
  // ============================================

  static async getDashboardData(institutionId: string): Promise<{
    overall_nps: number;
    total_responses: number;
    response_rate: number;
    by_stakeholder: Record<string, {
      score: number;
      responses: number;
      promoters: number;
      passives: number;
      detractors: number;
    }>;
    by_department: Record<string, {
      name: string;
      score: number;
      responses: number;
    }>;
    trend: Array<{
      period: string;
      score: number;
      responses: number;
    }>;
    recent_feedback: Array<{
      id: string;
      score: number;
      category: string;
      feedback: string;
      stakeholder_type: string;
      submitted_at: string;
    }>;
  }> {
    await this.validateInstitutionAccess(institutionId);

    // Initialize empty result structure with all stakeholder types
    const emptyResult = {
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

    // Call RPC function to get dashboard data
    const { data, error } = await this.supabase.rpc('get_nps_dashboard', {
      p_institution_id: institutionId
    });

    if (error || !data) {
      console.warn('[NPSService] Dashboard RPC error or no data:', error);
      return emptyResult;
    }

    // Return the data from RPC with proper structure
    return {
      overall_nps: data.overall_nps || 0,
      total_responses: data.total_responses || 0,
      response_rate: data.response_rate || 0,
      by_stakeholder: data.by_stakeholder || emptyResult.by_stakeholder,
      by_department: data.by_department || {},
      trend: data.trend || [],
      recent_feedback: data.recent_feedback || []
    };
  }
}
