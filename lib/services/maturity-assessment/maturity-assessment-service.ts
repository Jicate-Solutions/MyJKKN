// lib/services/maturity-assessment/maturity-assessment-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  ensureObject,
  ensureArray,
  ensureNumber,
  isValidNumber,
  validateJsonField
} from '@/lib/utils/validation';
import type {
  MaturityFramework,
  MaturityAssessment,
  MaturityProgressItem,
  MaturityEvidence,
  MaturityDashboardData,
  MaturityDimension,
  MaturityDimensionName,
  MaturityStage,
  AssessmentStatus,
  ProgressStatus,
  CreateMaturityFrameworkDto,
  UpdateMaturityFrameworkDto,
  CreateMaturityAssessmentDto,
  UpdateMaturityAssessmentDto,
  CreateMaturityProgressItemDto,
  UpdateMaturityProgressItemDto,
  CreateMaturityEvidenceDto,
  MaturityAssessmentFilters,
  MaturityProgressFilters,
  MaturityAssessmentListResponse,
  MaturityProgressListResponse,
  RadarChartData,
  DepartmentComparisonData
} from '@/types/maturity-assessment';

export class MaturityAssessmentService {
  private static supabase: any = createClientSupabaseClient();

  /**
   * SECURITY: Validate institution access
   * Ensures user has permission to access the requested institution's data
   * @throws Error if institution_id is invalid or user lacks access
   */
  private static async validateInstitutionAccess(
    institutionId: string
  ): Promise<void> {
    if (!institutionId || institutionId.trim() === '') {
      throw new Error('Institution ID is required');
    }

    // Get current user
    const { data: { user }, error: authError } = await this.supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Authentication required');
    }

    // Check user's institution access
    const { data: access, error } = await this.supabase
      .from('user_institution_access')
      .select('institution_id')
      .eq('user_id', user.id)
      .eq('institution_id', institutionId)
      .single();

    if (error || !access) {
      console.error('[maturity-assessment] Access denied:', { userId: user.id, institutionId });
      throw new Error('Access denied: Institution not accessible to user');
    }
  }

  private static supabase: any = createClientSupabaseClient();

  // ============================================================
  // Default Dimensions
  // ============================================================

  static getDefaultDimensions(): MaturityDimension[] {
    return [
      {
        name: 'Leadership',
        description: 'Leadership commitment to excellence and transformation',
        stage_1_criteria: 'Reactive response to issues only, no visible commitment',
        stage_2_criteria: 'Sponsors some improvement initiatives occasionally',
        stage_3_criteria: 'Actively involved in quality reviews and planning',
        stage_4_criteria: 'Drives transformation, visible commitment, role model'
      },
      {
        name: 'Strategy',
        description: 'Strategic alignment of improvement efforts with organizational goals',
        stage_1_criteria: 'No clear goals or metrics defined',
        stage_2_criteria: 'Goals defined but not systematically tracked',
        stage_3_criteria: 'Goals linked to KPIs with regular review cycles',
        stage_4_criteria: 'Fully integrated strategic planning with continuous alignment'
      },
      {
        name: 'People',
        description: 'Staff capability development and engagement',
        stage_1_criteria: 'No formal training or development programs',
        stage_2_criteria: 'Ad-hoc training programs conducted occasionally',
        stage_3_criteria: 'Structured development plans for all staff',
        stage_4_criteria: 'Continuous learning culture with career pathways'
      },
      {
        name: 'Processes',
        description: 'Process documentation, standardization, and optimization',
        stage_1_criteria: 'No documented processes, ad-hoc operations',
        stage_2_criteria: 'Some key processes documented',
        stage_3_criteria: 'All processes documented with SLAs and monitoring',
        stage_4_criteria: 'Automated, optimized, and continuously improved'
      },
      {
        name: 'Resources',
        description: 'Data-driven decision making and resource optimization',
        stage_1_criteria: 'No systematic data collection or analysis',
        stage_2_criteria: 'Basic metrics tracked manually',
        stage_3_criteria: 'Comprehensive KPIs with dashboards and reports',
        stage_4_criteria: 'Predictive analytics with real-time insights'
      },
      {
        name: 'Results',
        description: 'Stakeholder engagement, satisfaction, and outcomes',
        stage_1_criteria: 'Complaints handled reactively, no measurement',
        stage_2_criteria: 'Feedback collected occasionally',
        stage_3_criteria: 'NPS tracked with action plans created',
        stage_4_criteria: 'Proactive engagement, high satisfaction, outcomes tracked'
      }
    ];
  }

  // ============================================================
  // Framework Methods
  // ============================================================

  static async getFramework(institutionId: string): Promise<MaturityFramework | null> {
    const { data, error } = await this.supabase
      .from('maturity_frameworks')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[MaturityAssessmentService] Error fetching framework:', error);
      throw new Error(`Failed to fetch framework: ${error.message}`);
    }

    return data as MaturityFramework | null;
  }

  static async getFrameworkById(id: string): Promise<MaturityFramework | null> {
    const { data, error } = await this.supabase
      .from('maturity_frameworks')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[MaturityAssessmentService] Error fetching framework:', error);
      throw new Error(`Failed to fetch framework: ${error.message}`);
    }

    return data as MaturityFramework | null;
  }

  static async createFramework(dto: CreateMaturityFrameworkDto): Promise<MaturityFramework> {
    // SECURITY: Validate institution_id is provided
    if (!dto.institution_id) {
      throw new Error('Institution ID is required');
    }

    const user = await this.supabase.auth.getUser();

    // SECURITY: Validate user is authenticated
    if (!user?.data?.user?.id) {
      throw new Error('User must be authenticated');
    }

    const { data, error } = await this.supabase
      .from('maturity_frameworks')
      .insert({
        institution_id: dto.institution_id,
        name: dto.name || 'Excellence Journey',
        description: dto.description || 'Based on TQM International Education Excellence Model',
        dimensions: dto.dimensions || this.getDefaultDimensions(),
        created_by: user.data.user.id
      })
      .select()
      .single();

    if (error) {
      console.error('[MaturityAssessmentService] Error creating framework:', error);
      throw new Error(`Failed to create framework: ${error.message}`);
    }

    return data as MaturityFramework;
  }

  static async getOrCreateFramework(institutionId: string): Promise<MaturityFramework> {
    let framework = await this.getFramework(institutionId);

    if (!framework) {
      framework = await this.createFramework({ institution_id: institutionId });
    }

    return framework;
  }

  static async updateFramework(
    id: string,
    dto: UpdateMaturityFrameworkDto
  ): Promise<MaturityFramework> {
    const user = await this.supabase.auth.getUser();

    const { data, error } = await this.supabase
      .from('maturity_frameworks')
      .update({
        ...dto,
        updated_by: user.data.user?.id
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[MaturityAssessmentService] Error updating framework:', error);
      throw new Error(`Failed to update framework: ${error.message}`);
    }

    return data as MaturityFramework;
  }

  // ============================================================
  // Assessment Methods
  // ============================================================

  static async getAssessments(
    filters: MaturityAssessmentFilters = {}
  ): Promise<MaturityAssessmentListResponse> {
    let query = this.supabase
      .from('maturity_assessments')
      .select(
        `
        *,
        department:departments(id, name),
        assessor:users_profiles!assessor_id(id, full_name, email),
        reviewer:users_profiles!reviewed_by(id, full_name, email),
        framework:maturity_frameworks(id, name, dimensions),
        institution:institutions(id, name, counselling_code)
      `,
        { count: 'exact' }
      );

    // Apply filters
    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.department_id) {
      query = query.eq('department_id', filters.department_id);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.assessor_id) {
      query = query.eq('assessor_id', filters.assessor_id);
    }
    if (filters.date_from) {
      query = query.gte('assessment_date', filters.date_from);
    }
    if (filters.date_to) {
      query = query.lte('assessment_date', filters.date_to);
    }

    // Apply sorting
    const sortBy = filters.sortBy || 'assessment_date';
    const sortDirection = filters.sortDirection || 'desc';
    query = query.order(sortBy, { ascending: sortDirection === 'asc' });

    // Apply pagination
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('[MaturityAssessmentService] Error fetching assessments:', error);
      throw new Error(`Failed to fetch assessments: ${error.message}`);
    }

    return {
      data: (data as MaturityAssessment[]) || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  static async getAssessmentById(id: string, institutionId?: string): Promise<MaturityAssessment | null> {
    let query = this.supabase
      .from('maturity_assessments')
      .select(
        `
        *,
        department:departments(id, name),
        assessor:users_profiles!assessor_id(id, full_name, email),
        reviewer:users_profiles!reviewed_by(id, full_name, email),
        framework:maturity_frameworks(*),
        institution:institutions(id, name, counselling_code),
        progress_items:maturity_progress(*)
      `
      )
      .eq('id', id);

    // SECURITY: Filter by institution_id if provided to prevent cross-institution access
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query.single();

    if (error && error.code !== 'PGRST116') {
      console.error('[MaturityAssessmentService] Error fetching assessment:', error);
      // SECURITY: Don't expose internal error details
      throw new Error('Failed to fetch assessment');
    }

    return data as MaturityAssessment | null;
  }

  static async getLatestAssessment(
    institutionId: string,
    departmentId?: string
  ): Promise<MaturityAssessment | null> {
    let query = this.supabase
      .from('maturity_assessments')
      .select(
        `
        *,
        department:departments(id, name),
        assessor:users_profiles!assessor_id(id, full_name, email),
        framework:maturity_frameworks(id, name, dimensions)
      `
      )
      .eq('institution_id', institutionId)
      .eq('status', 'approved')
      .order('assessment_date', { ascending: false })
      .limit(1);

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    } else {
      query = query.is('department_id', null);
    }

    const { data, error } = await query.single();

    if (error && error.code !== 'PGRST116') {
      console.error('[MaturityAssessmentService] Error fetching latest assessment:', error);
      throw new Error(`Failed to fetch latest assessment: ${error.message}`);
    }

    return data as MaturityAssessment | null;
  }

  static calculateOverallStage(dimensionScores: Record<string, number>): MaturityStage {
    // SAFETY: Validate dimensionScores is an object
    const validatedScores = ensureObject(dimensionScores, {});

    const scores = Object.values(validatedScores).filter(
      (s) => isValidNumber(s) && s >= 1 && s <= 4
    );

    if (scores.length === 0) {
      console.warn('[MaturityAssessment] No valid dimension scores, defaulting to stage 1');
      return 1;
    }

    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.max(1, Math.min(4, Math.floor(average))) as MaturityStage;
  }

  static async createAssessment(dto: CreateMaturityAssessmentDto): Promise<MaturityAssessment> {
    // SECURITY: Validate required fields
    if (!dto.institution_id || !dto.framework_id || !dto.dimension_scores) {
      throw new Error('Institution ID, framework ID, and dimension scores are required');
    }

    const user = await this.supabase.auth.getUser();

    // SECURITY: Validate user is authenticated
    if (!user?.data?.user?.id) {
      throw new Error('User must be authenticated');
    }

    // SECURITY: Verify framework belongs to the institution
    const { data: framework, error: frameworkError } = await this.supabase
      .from('maturity_frameworks')
      .select('institution_id')
      .eq('id', dto.framework_id)
      .eq('institution_id', dto.institution_id)
      .single();

    if (frameworkError || !framework) {
      throw new Error('Invalid framework for this institution');
    }

    // Calculate overall stage
    const overall_stage = this.calculateOverallStage(dto.dimension_scores);

    const { data, error } = await this.supabase
      .from('maturity_assessments')
      .insert({
        institution_id: dto.institution_id,
        framework_id: dto.framework_id,
        department_id: dto.department_id || null,
        assessment_date: dto.assessment_date,
        assessor_id: dto.assessor_id || user.data.user.id,
        dimension_scores: dto.dimension_scores,
        overall_stage,
        evidence: dto.evidence || null,
        improvement_plan: dto.improvement_plan || null,
        target_stage: dto.target_stage || null,
        target_date: dto.target_date || null,
        status: 'draft',
        created_by: user.data.user.id
      })
      .select()
      .single();

    if (error) {
      console.error('[MaturityAssessmentService] Error creating assessment:', error);
      throw new Error(`Failed to create assessment: ${error.message}`);
    }

    return data as MaturityAssessment;
  }

  static async updateAssessment(
    id: string,
    dto: UpdateMaturityAssessmentDto
  ): Promise<MaturityAssessment> {
    const user = await this.supabase.auth.getUser();

    const updateData: Record<string, unknown> = {
      ...dto,
      updated_by: user.data.user?.id
    };

    // Recalculate overall stage if dimension scores changed
    if (dto.dimension_scores) {
      updateData.overall_stage = this.calculateOverallStage(dto.dimension_scores);
    }

    const { data, error } = await this.supabase
      .from('maturity_assessments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[MaturityAssessmentService] Error updating assessment:', error);
      throw new Error(`Failed to update assessment: ${error.message}`);
    }

    return data as MaturityAssessment;
  }

  static async submitAssessment(id: string): Promise<MaturityAssessment> {
    return this.updateAssessment(id, { status: 'submitted' });
  }

  static async approveAssessment(id: string, reviewerId: string): Promise<MaturityAssessment> {
    const user = await this.supabase.auth.getUser();

    const { data, error } = await this.supabase
      .from('maturity_assessments')
      .update({
        status: 'approved',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        updated_by: user.data.user?.id
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[MaturityAssessmentService] Error approving assessment:', error);
      throw new Error(`Failed to approve assessment: ${error.message}`);
    }

    return data as MaturityAssessment;
  }

  static async rejectAssessment(id: string): Promise<MaturityAssessment> {
    return this.updateAssessment(id, { status: 'draft' });
  }

  static async archiveAssessment(id: string): Promise<MaturityAssessment> {
    return this.updateAssessment(id, { status: 'archived' });
  }

  static async deleteAssessment(id: string): Promise<void> {
    const { error } = await this.supabase.from('maturity_assessments').delete().eq('id', id);

    if (error) {
      console.error('[MaturityAssessmentService] Error deleting assessment:', error);
      throw new Error(`Failed to delete assessment: ${error.message}`);
    }
  }

  // ============================================================
  // Progress Item Methods
  // ============================================================

  static async getProgressItems(
    filters: MaturityProgressFilters = {}
  ): Promise<MaturityProgressListResponse> {
    let query = this.supabase
      .from('maturity_progress')
      .select(
        `
        *,
        assignee:users_profiles!assigned_to(id, full_name)
      `,
        { count: 'exact' }
      );

    // Apply filters
    if (filters.assessment_id) {
      query = query.eq('assessment_id', filters.assessment_id);
    }
    if (filters.dimension) {
      query = query.eq('dimension', filters.dimension);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.assigned_to) {
      query = query.eq('assigned_to', filters.assigned_to);
    }
    if (filters.overdue) {
      query = query
        .not('status', 'eq', 'completed')
        .lt('due_date', new Date().toISOString().split('T')[0]);
    }

    // Apply sorting
    query = query.order('due_date', { ascending: true, nullsFirst: false });

    // Apply pagination
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('[MaturityAssessmentService] Error fetching progress items:', error);
      throw new Error(`Failed to fetch progress items: ${error.message}`);
    }

    return {
      data: (data as MaturityProgressItem[]) || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  static async getProgressItemById(id: string): Promise<MaturityProgressItem | null> {
    const { data, error } = await this.supabase
      .from('maturity_progress')
      .select(
        `
        *,
        assignee:users_profiles!assigned_to(id, full_name),
        assessment:maturity_assessments(id, assessment_date, institution_id)
      `
      )
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[MaturityAssessmentService] Error fetching progress item:', error);
      throw new Error(`Failed to fetch progress item: ${error.message}`);
    }

    return data as MaturityProgressItem | null;
  }

  static async createProgressItem(dto: CreateMaturityProgressItemDto): Promise<MaturityProgressItem> {
    const user = await this.supabase.auth.getUser();

    const { data, error } = await this.supabase
      .from('maturity_progress')
      .insert({
        assessment_id: dto.assessment_id,
        action_item: dto.action_item,
        dimension: dto.dimension,
        target_stage: dto.target_stage,
        due_date: dto.due_date || null,
        notes: dto.notes || null,
        assigned_to: dto.assigned_to || null,
        status: 'pending',
        created_by: user.data.user?.id
      })
      .select()
      .single();

    if (error) {
      console.error('[MaturityAssessmentService] Error creating progress item:', error);
      throw new Error(`Failed to create progress item: ${error.message}`);
    }

    return data as MaturityProgressItem;
  }

  static async updateProgressItem(
    id: string,
    dto: UpdateMaturityProgressItemDto
  ): Promise<MaturityProgressItem> {
    const user = await this.supabase.auth.getUser();

    const updateData: Record<string, unknown> = {
      ...dto,
      updated_by: user.data.user?.id
    };

    // Set completed_at if status changed to completed
    if (dto.status === 'completed' && !dto.completed_at) {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase
      .from('maturity_progress')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[MaturityAssessmentService] Error updating progress item:', error);
      throw new Error(`Failed to update progress item: ${error.message}`);
    }

    return data as MaturityProgressItem;
  }

  static async deleteProgressItem(id: string): Promise<void> {
    const { error } = await this.supabase.from('maturity_progress').delete().eq('id', id);

    if (error) {
      console.error('[MaturityAssessmentService] Error deleting progress item:', error);
      throw new Error(`Failed to delete progress item: ${error.message}`);
    }
  }

  // ============================================================
  // Evidence Methods
  // ============================================================

  static async getEvidence(assessmentId: string): Promise<MaturityEvidence[]> {
    const { data, error } = await this.supabase
      .from('maturity_evidence')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[MaturityAssessmentService] Error fetching evidence:', error);
      throw new Error(`Failed to fetch evidence: ${error.message}`);
    }

    return (data as MaturityEvidence[]) || [];
  }

  static async createEvidence(dto: CreateMaturityEvidenceDto): Promise<MaturityEvidence> {
    const user = await this.supabase.auth.getUser();

    const { data, error } = await this.supabase
      .from('maturity_evidence')
      .insert({
        ...dto,
        created_by: user.data.user?.id
      })
      .select()
      .single();

    if (error) {
      console.error('[MaturityAssessmentService] Error creating evidence:', error);
      throw new Error(`Failed to create evidence: ${error.message}`);
    }

    return data as MaturityEvidence;
  }

  static async deleteEvidence(id: string): Promise<void> {
    const { error } = await this.supabase.from('maturity_evidence').delete().eq('id', id);

    if (error) {
      console.error('[MaturityAssessmentService] Error deleting evidence:', error);
      throw new Error(`Failed to delete evidence: ${error.message}`);
    }
  }

  // ============================================================
  // Dashboard Methods
  // ============================================================

  static async getDashboard(institutionId: string): Promise<MaturityDashboardData> {
    // Get latest approved assessments
    const { data: assessments, error: assessmentError } = await this.supabase
      .from('maturity_assessments')
      .select(
        `
        *,
        department:departments(id, name)
      `
      )
      .eq('institution_id', institutionId)
      .eq('status', 'approved')
      .order('assessment_date', { ascending: false });

    if (assessmentError) {
      console.error('[MaturityAssessmentService] Error fetching dashboard data:', assessmentError);
      throw new Error(`Failed to fetch dashboard data: ${assessmentError.message}`);
    }

    // SAFETY: Ensure assessments is an array
    const safeAssessments = ensureArray(assessments, []);

    // Calculate by department (latest only)
    const byDepartment: Record<string, MaturityStage> = {};
    const seenDepts = new Set<string>();

    safeAssessments.forEach((a) => {
      const deptId = a.department_id || 'institution';
      if (!seenDepts.has(deptId)) {
        seenDepts.add(deptId);
        const deptName = (a.department as { name: string } | null)?.name || 'Institution-wide';
        // SAFETY: Ensure overall_stage is valid
        byDepartment[deptName] = ensureNumber(a.overall_stage, 1) as MaturityStage;
      }
    });

    // Calculate by dimension (average of latest assessments)
    const byDimension: Record<MaturityDimensionName, number> = {
      Leadership: 0,
      Strategy: 0,
      People: 0,
      Processes: 0,
      Resources: 0,
      Results: 0
    };
    const dimensionCounts: Record<string, number> = {};

    // Use only latest 10 assessments for dimension averages
    safeAssessments.slice(0, 10).forEach((a) => {
      // SAFETY: Validate dimension_scores exists and is an object
      const scores = ensureObject(a.dimension_scores, {});

      Object.entries(scores).forEach(([dim, score]) => {
        // SAFETY: Ensure score is a valid number
        const validScore = ensureNumber(score, 1);

        if (!byDimension[dim as MaturityDimensionName]) {
          byDimension[dim as MaturityDimensionName] = 0;
          dimensionCounts[dim] = 0;
        }
        byDimension[dim as MaturityDimensionName] += validScore;
        dimensionCounts[dim] = (dimensionCounts[dim] || 0) + 1;
      });
    });

    Object.keys(byDimension).forEach((dim) => {
      if (dimensionCounts[dim]) {
        byDimension[dim as MaturityDimensionName] /= dimensionCounts[dim];
      }
    });

    // Calculate overall - SAFETY: Ensure we have valid stages
    const overallScores = safeAssessments.map((a) => ensureNumber(a.overall_stage, 1));
    const institutionOverall = overallScores.length > 0
      ? Math.max(1, Math.min(4, Math.round(
          overallScores.reduce((a, b) => a + b, 0) / overallScores.length
        ))) as MaturityStage
      : 1;

    // Trend (last 12 assessments)
    const trend = safeAssessments
      .slice(0, 12)
      .map((a) => ({
        date: a.assessment_date,
        stage: ensureNumber(a.overall_stage, 1),
        department: (a.department as { name: string } | null)?.name
      }))
      .reverse();

    // Progress items summary
    const assessmentIds = safeAssessments.map((a) => a.id);
    let progressSummary = {
      total: 0,
      completed: 0,
      in_progress: 0,
      pending: 0,
      blocked: 0,
      overdue: 0
    };

    if (assessmentIds.length > 0) {
      const { data: progressItems } = await this.supabase
        .from('maturity_progress')
        .select('status, due_date')
        .in('assessment_id', assessmentIds);

      // SAFETY: Ensure progressItems is an array
      const safeProgressItems = ensureArray(progressItems, []);
      const now = new Date();

      progressSummary = {
        total: safeProgressItems.length,
        completed: safeProgressItems.filter((p) => p.status === 'completed').length,
        in_progress: safeProgressItems.filter((p) => p.status === 'in_progress').length,
        pending: safeProgressItems.filter((p) => p.status === 'pending').length,
        blocked: safeProgressItems.filter((p) => p.status === 'blocked').length,
        overdue: safeProgressItems.filter(
          (p) => p.status !== 'completed' && p.due_date && new Date(p.due_date) < now
        ).length
      };
    }

    return {
      institution_overall: institutionOverall,
      by_department: byDepartment,
      by_dimension: byDimension,
      trend,
      improvement_items: progressSummary,
      latest_assessments: safeAssessments.slice(0, 5) as MaturityAssessment[]
    };
  }

  // ============================================================
  // Visualization Data Methods
  // ============================================================

  static async getRadarChartData(assessmentId: string): Promise<RadarChartData> {
    const assessment = await this.getAssessmentById(assessmentId);
    if (!assessment) {
      throw new Error('Assessment not found');
    }

    const current = Object.entries(assessment.dimension_scores).map(([dimension, score]) => ({
      dimension: dimension as MaturityDimensionName,
      score: score as MaturityStage,
      target: assessment.target_stage || undefined
    }));

    // Get previous assessment for comparison
    let previous: RadarChartData['previous'];
    const { data: prevAssessment } = await this.supabase
      .from('maturity_assessments')
      .select('dimension_scores')
      .eq('institution_id', assessment.institution_id)
      .eq('department_id', assessment.department_id)
      .eq('status', 'approved')
      .lt('assessment_date', assessment.assessment_date)
      .order('assessment_date', { ascending: false })
      .limit(1)
      .single();

    if (prevAssessment) {
      previous = Object.entries(prevAssessment.dimension_scores as Record<string, number>).map(
        ([dimension, score]) => ({
          dimension: dimension as MaturityDimensionName,
          score: score as MaturityStage
        })
      );
    }

    return { current, previous };
  }

  static async getDepartmentComparison(institutionId: string): Promise<DepartmentComparisonData[]> {
    const { data, error } = await this.supabase
      .from('maturity_assessments')
      .select(
        `
        id,
        department_id,
        department:departments(id, name),
        overall_stage,
        dimension_scores,
        assessment_date
      `
      )
      .eq('institution_id', institutionId)
      .eq('status', 'approved')
      .not('department_id', 'is', null)
      .order('assessment_date', { ascending: false });

    if (error) {
      console.error('[MaturityAssessmentService] Error fetching comparison data:', error);
      throw new Error(`Failed to fetch comparison data: ${error.message}`);
    }

    // Get latest assessment per department
    const latestByDept = new Map<string, DepartmentComparisonData>();

    data?.forEach((a) => {
      if (a.department_id && !latestByDept.has(a.department_id)) {
        latestByDept.set(a.department_id, {
          department_id: a.department_id,
          department_name: (a.department as { name: string })?.name || 'Unknown',
          overall_stage: a.overall_stage as MaturityStage,
          dimension_scores: a.dimension_scores as Record<MaturityDimensionName, MaturityStage>,
          assessment_date: a.assessment_date
        });
      }
    });

    return Array.from(latestByDept.values());
  }
}
