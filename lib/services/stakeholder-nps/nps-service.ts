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
        ...dto,
        question: dto.question || 'How likely are you to recommend our institution to others?',
        status: dto.status || 'draft',
        created_by: user?.id
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
      query = query.ilike('title', `%${filters.search}%`);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[NPSService] Get surveys error:', error);
      throw new Error(`Failed to fetch surveys: ${error.message}`);
    }

    return {
      data: (data as NPSSurvey[]) || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  static async getSurveyById(id: string): Promise<NPSSurvey | null> {
    const { data, error } = await this.supabase
      .from('nps_surveys')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[NPSService] Get survey error:', error);
      throw new Error(`Failed to fetch survey: ${error.message}`);
    }

    if (data) {
      await this.validateInstitutionAccess(data.institution_id);
    }

    return data as NPSSurvey | null;
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

  // ============================================
  // Response Operations
  // ============================================

  static async submitResponse(dto: SubmitNPSResponseDto): Promise<NPSResponse> {
    const survey = await this.getSurveyById(dto.survey_id);
    if (!survey) {
      throw new Error('Survey not found');
    }

    if (survey.status !== 'active') {
      throw new Error('Survey is not active');
    }

    const now = new Date();
    const startDate = new Date(survey.start_date);
    const endDate = new Date(survey.end_date);

    if (now < startDate || now > endDate) {
      throw new Error('Survey is not within active date range');
    }

    const { data, error } = await this.supabase
      .from('nps_responses')
      .insert(dto)
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

  static async getResponse(id: string): Promise<NPSResponse | null> {
    const { data, error } = await this.supabase
      .from('nps_responses')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[NPSService] Get response error:', error);
      throw new Error(`Failed to fetch response: ${error.message}`);
    }

    return data as NPSResponse | null;
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

    if (filters.stakeholder_type) {
      query = query.eq('stakeholder_type', filters.stakeholder_type);
    }

    if (filters.sentiment) {
      query = query.eq('sentiment', filters.sentiment);
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

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[NPSService] Get responses error:', error);
      throw new Error(`Failed to fetch responses: ${error.message}`);
    }

    if (filters.institution_id && data && data.length > 0) {
      await this.validateInstitutionAccess(filters.institution_id);
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
    by_stakeholder: Record<string, {
      score: number;
      responses: number;
      promoters: number;
      passives: number;
      detractors: number;
    }>;
    recent_feedback?: Array<{
      id: string;
      score: number;
      feedback: string;
      stakeholder_type: string;
      submitted_at: string;
    }>;
  }> {
    await this.validateInstitutionAccess(institutionId);

    // Get all analytics for the institution
    const { data: analytics, error: analyticsError } = await this.supabase
      .from('nps_survey_analytics')
      .select('*')
      .eq('institution_id', institutionId);

    if (analyticsError) {
      console.error('[NPSService] Get dashboard analytics error:', analyticsError);
      throw new Error(`Failed to fetch dashboard analytics: ${analyticsError.message}`);
    }

    // Aggregate data
    const byStakeholder: Record<string, {
      score: number;
      responses: number;
      promoters: number;
      passives: number;
      detractors: number;
    }> = {};

    let totalPromoters = 0;
    let totalPassives = 0;
    let totalDetractors = 0;
    let totalResponses = 0;

    if (analytics) {
      for (const item of analytics) {
        totalPromoters += item.promoter_count || 0;
        totalPassives += item.passive_count || 0;
        totalDetractors += item.detractor_count || 0;
        totalResponses += item.total_responses || 0;

        // Aggregate by stakeholder types (if stored)
        if (item.responses_by_type) {
          for (const [type, count] of Object.entries(item.responses_by_type as Record<string, number>)) {
            if (!byStakeholder[type]) {
              byStakeholder[type] = {
                score: 0,
                responses: 0,
                promoters: 0,
                passives: 0,
                detractors: 0
              };
            }
            byStakeholder[type].responses += count;
          }
        }
      }
    }

    // Calculate overall NPS
    const total = totalPromoters + totalPassives + totalDetractors;
    const overallNPS = total > 0
      ? Math.round(((totalPromoters - totalDetractors) / total) * 100)
      : 0;

    // Get recent feedback
    const { data: recentFeedback, error: feedbackError } = await this.supabase
      .from('nps_responses')
      .select(`
        id,
        score,
        feedback,
        stakeholder_type,
        created_at
      `)
      .not('feedback', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);

    if (feedbackError) {
      console.warn('[NPSService] Get recent feedback warning:', feedbackError);
    }

    return {
      overall_nps: overallNPS,
      total_responses: totalResponses,
      by_stakeholder: byStakeholder,
      recent_feedback: recentFeedback?.map(f => ({
        id: f.id,
        score: f.score,
        feedback: f.feedback,
        stakeholder_type: f.stakeholder_type,
        submitted_at: f.created_at
      })) || []
    };
  }
}
