/**
 * AI Query Service
 * Core service layer for the Context-Aware AI Query System
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  AIUserContext,
  RateLimitResult,
  ToolResponse,
  DataScope,
  ActionExecutionResult,
} from '@/types/ai-query';

// Service instance holder for server-side usage
let supabaseInstance: SupabaseClient | null = null;

export class AIQueryService {
  /**
   * Initialize the service with a Supabase client
   * Must be called before using any service methods in server context
   */
  static initialize(client: SupabaseClient) {
    supabaseInstance = client;
  }

  private static get supabase(): SupabaseClient {
    if (!supabaseInstance) {
      throw new Error('AIQueryService not initialized. Call AIQueryService.initialize(client) first.');
    }
    return supabaseInstance;
  }

  // ============================================
  // User Context & Permissions
  // ============================================

  /**
   * Get the current user's context for AI queries
   */
  static async getUserContext(userId: string): Promise<AIUserContext | null> {
    const { data, error } = await this.supabase.rpc('ai_rpc_user_context', {
      p_user_id: userId,
    });

    if (error) {
      console.error('[ai-query] Failed to get user context:', error);
      return null;
    }

    return data as AIUserContext;
  }

  /**
   * Get the user's accessible data scope
   */
  static async getAccessibleScope(userId: string): Promise<DataScope | null> {
    const { data, error } = await this.supabase.rpc('ai_rpc_accessible_scope', {
      p_user_id: userId,
    });

    if (error) {
      console.error('[ai-query] Failed to get accessible scope:', error);
      return null;
    }

    return data as DataScope;
  }

  /**
   * Validate if user has a specific permission
   */
  static async validatePermission(
    userId: string,
    permission: string
  ): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('ai_rpc_validate_permission', {
      p_user_id: userId,
      p_permission: permission,
    });

    if (error) {
      console.error('[ai-query] Failed to validate permission:', error);
      return false;
    }

    return data === true;
  }

  // ============================================
  // Rate Limiting
  // ============================================

  /**
   * Check rate limit for a user
   */
  static async checkRateLimit(userId: string): Promise<RateLimitResult> {
    const { data, error } = await this.supabase.rpc('check_ai_query_rate_limit', {
      p_user_id: userId,
    });

    if (error) {
      console.error('[ai-query] Failed to check rate limit:', error);
      return {
        allowed: false,
        remaining: 0,
        reset_at: new Date(),
      };
    }

    return {
      ...data,
      reset_at: new Date(data.reset_at),
    } as RateLimitResult;
  }

  /**
   * Increment query count for rate limiting
   */
  static async incrementQueryCount(userId: string): Promise<void> {
    const { error } = await this.supabase.rpc('increment_ai_query_count', {
      p_user_id: userId,
    });

    if (error) {
      console.error('[ai-query] Failed to increment query count:', error);
    }
  }

  // ============================================
  // Query Logging
  // ============================================

  /**
   * Log an AI query
   */
  static async logQuery(params: {
    userId: string;
    institutionId?: string;
    queryText: string;
    queryType?: string;
    toolsCalled?: string[];
    responseTimeMs?: number;
    success?: boolean;
    errorCode?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<string | null> {
    const { data, error } = await this.supabase.rpc('log_ai_query', {
      p_user_id: params.userId,
      p_institution_id: params.institutionId,
      p_query_text: params.queryText,
      p_query_type: params.queryType || 'data_query',
      p_tools_called: params.toolsCalled || [],
      p_response_time_ms: params.responseTimeMs,
      p_success: params.success ?? true,
      p_error_code: params.errorCode,
      p_ip_address: params.ipAddress,
      p_user_agent: params.userAgent,
    });

    if (error) {
      console.error('[ai-query] Failed to log query:', error);
      return null;
    }

    return data as string;
  }

  // ============================================
  // Tool Execution
  // ============================================

  /**
   * Execute an RPC tool and return the result
   */
  static async executeTool(
    toolName: string,
    userId: string,
    params: Record<string, unknown> = {}
  ): Promise<ToolResponse> {
    const rpcName = `ai_rpc_${toolName}`;

    try {
      const { data, error } = await this.supabase.rpc(rpcName, {
        p_user_id: userId,
        ...params,
      });

      if (error) {
        console.error(`[ai-query] Tool ${toolName} failed:`, error);
        return {
          success: false,
          data: null,
          metadata: {
            total_count: 0,
            returned_count: 0,
            has_more: false,
            filters_applied: {},
          },
          actions_available: [],
          error: {
            code: 'TOOL_ERROR',
            message: error.message,
          },
        };
      }

      return data as ToolResponse;
    } catch (err) {
      console.error(`[ai-query] Tool ${toolName} exception:`, err);
      return {
        success: false,
        data: null,
        metadata: {
          total_count: 0,
          returned_count: 0,
          has_more: false,
          filters_applied: {},
        },
        actions_available: [],
        error: {
          code: 'TOOL_EXCEPTION',
          message: err instanceof Error ? err.message : 'Unknown error',
        },
      };
    }
  }

  // ============================================
  // Academic Module Tools
  // ============================================

  static async getAttendance(userId: string, params: {
    studentId?: string;
    sectionId?: string;
    departmentId?: string;
    dateFrom?: string;
    dateTo?: string;
    threshold?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('attendance', userId, {
      p_student_id: params.studentId,
      p_section_id: params.sectionId,
      p_department_id: params.departmentId,
      p_date_from: params.dateFrom,
      p_date_to: params.dateTo,
      p_threshold: params.threshold,
      p_limit: params.limit || 10000,
      p_offset: params.offset || 0,
    });
  }

  static async getAttendanceSummary(userId: string, params: {
    studentId?: string;
    sectionId?: string;
    departmentId?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('attendance_summary', userId, {
      p_student_id: params.studentId,
      p_section_id: params.sectionId,
      p_department_id: params.departmentId,
      p_date_from: params.dateFrom,
      p_date_to: params.dateTo,
    });
  }

  static async getAttendanceDefaulters(userId: string, params: {
    departmentId?: string;
    threshold?: number;
    semester?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('attendance_defaulters', userId, {
      p_department_id: params.departmentId,
      p_threshold: params.threshold || 75,
      p_semester: params.semester || 'current',
      p_limit: params.limit || 10000,
      p_offset: params.offset || 0,
    });
  }

  // ============================================
  // Billing Module Tools
  // ============================================

  static async getStudentBills(userId: string, params: {
    studentId?: string;
    sectionId?: string;
    departmentId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('student_bills', userId, {
      p_student_id: params.studentId,
      p_section_id: params.sectionId,
      p_department_id: params.departmentId,
      p_status: params.status,
      p_date_from: params.dateFrom,
      p_date_to: params.dateTo,
      p_limit: params.limit || 10000,
      p_offset: params.offset || 0,
    });
  }

  static async getFeeDefaulters(userId: string, params: {
    departmentId?: string;
    status?: string;
    minAmount?: number;
    dueBefore?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('fee_defaulters', userId, {
      p_department_id: params.departmentId,
      p_status: params.status || 'overdue',
      p_min_amount: params.minAmount,
      p_due_before: params.dueBefore,
      p_limit: params.limit || 10000,
      p_offset: params.offset || 0,
    });
  }

  // ============================================
  // Students Module Tools
  // ============================================

  static async getStudents(userId: string, params: {
    departmentId?: string;
    programId?: string;
    semesterId?: string;
    sectionId?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('students', userId, {
      p_department_id: params.departmentId,
      p_program_id: params.programId,
      p_semester_id: params.semesterId,
      p_section_id: params.sectionId,
      p_status: params.status,
      p_search: params.search,
      p_limit: params.limit || 10000,
      p_offset: params.offset || 0,
    });
  }

  static async getStudentDetails(userId: string, studentId: string): Promise<ToolResponse> {
    return this.executeTool('student_details', userId, {
      p_student_id: studentId,
    });
  }

  /**
   * Advanced student search with configurable search fields
   */
  static async searchStudents(userId: string, params: {
    searchQuery: string;
    searchFields?: string[];
    status?: string;
    departmentId?: string;
    exactMatch?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<ToolResponse> {
    return this.executeTool('student_search', userId, {
      p_search_query: params.searchQuery,
      p_search_fields: params.searchFields || ['name', 'roll_number', 'email', 'mobile'],
      p_status: params.status,
      p_department_id: params.departmentId,
      p_exact_match: params.exactMatch || false,
      p_limit: params.limit || 50,
      p_offset: params.offset || 0,
    });
  }

  /**
   * Get student counts grouped by department
   */
  static async getStudentsByDepartment(userId: string, params: {
    institutionId?: string;
    status?: string;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('students_by_department', userId, {
      p_institution_id: params.institutionId,
      p_status: params.status,
    });
  }

  /**
   * Get summary statistics for students
   */
  static async getStudentsSummary(userId: string, params: {
    institutionId?: string;
    departmentId?: string;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('students_summary', userId, {
      p_institution_id: params.institutionId,
      p_department_id: params.departmentId,
    });
  }

  /**
   * Search learners by location (district, state, taluk, city)
   * Returns learners with location statistics
   */
  static async getLearnersByLocation(userId: string, params: {
    district?: string;
    state?: string;
    taluk?: string;
    city?: string;
    status?: string;
    departmentId?: string;
    includeStats?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('learners_by_location', userId, {
      p_district: params.district,
      p_state: params.state,
      p_taluk: params.taluk,
      p_city: params.city,
      p_status: params.status,
      p_department_id: params.departmentId,
      p_include_stats: params.includeStats !== false,
      p_limit: params.limit || 100,
      p_offset: params.offset || 0,
    });
  }

  /**
   * Comprehensive learner search with ALL parameters
   * Searches across all institutions for super admin
   * Supports filtering by: demographics, accommodation, academic, admission, location, education background
   */
  static async getLearnersComprehensive(userId: string, params: {
    // Text search
    search?: string;
    // Identity filters
    status?: string;
    gender?: string;
    // Demographic filters
    religion?: string;
    community?: string;
    caste?: string;
    // Accommodation filters
    accommodationType?: string;
    hostelType?: string;
    busRequired?: boolean;
    busRoute?: string;
    busPickupLocation?: string;
    foodType?: string;
    // Academic filters
    institutionId?: string;
    departmentId?: string;
    programId?: string;
    degreeId?: string;
    semesterId?: string;
    sectionId?: string;
    academicYearId?: string;
    // Admission filters
    entryType?: string;
    quota?: string;
    category?: string;
    firstGraduate?: boolean;
    counselingApplied?: boolean;
    // Location filters
    district?: string;
    state?: string;
    taluk?: string;
    // Education background
    boardOfStudy?: string;
    lastSchool?: string;
    // Include options
    includeStats?: boolean;
    includeFullDetails?: boolean;
    // Pagination
    limit?: number;
    offset?: number;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('learners_comprehensive', userId, {
      p_search: params.search,
      p_status: params.status,
      p_gender: params.gender,
      p_religion: params.religion,
      p_community: params.community,
      p_caste: params.caste,
      p_accommodation_type: params.accommodationType,
      p_hostel_type: params.hostelType,
      p_bus_required: params.busRequired,
      p_bus_route: params.busRoute,
      p_bus_pickup_location: params.busPickupLocation,
      p_food_type: params.foodType,
      p_institution_id: params.institutionId,
      p_department_id: params.departmentId,
      p_program_id: params.programId,
      p_degree_id: params.degreeId,
      p_semester_id: params.semesterId,
      p_section_id: params.sectionId,
      p_academic_year_id: params.academicYearId,
      p_entry_type: params.entryType,
      p_quota: params.quota,
      p_category: params.category,
      p_first_graduate: params.firstGraduate,
      p_counseling_applied: params.counselingApplied,
      p_district: params.district,
      p_state: params.state,
      p_taluk: params.taluk,
      p_board_of_study: params.boardOfStudy,
      p_last_school: params.lastSchool,
      p_include_stats: params.includeStats !== false,
      p_include_full_details: params.includeFullDetails || false,
      p_limit: params.limit || 100,
      p_offset: params.offset || 0,
    });
  }

  // ============================================
  // Staff Module Tools
  // ============================================

  static async getStaff(userId: string, params: {
    departmentId?: string;
    employmentCategoryId?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('staff', userId, {
      p_department_id: params.departmentId,
      p_employment_category_id: params.employmentCategoryId,
      p_status: params.status,
      p_search: params.search,
      p_limit: params.limit || 10000,
      p_offset: params.offset || 0,
    });
  }

  // ============================================
  // Organization Module Tools
  // ============================================

  static async getHierarchySummary(userId: string, institutionId?: string): Promise<ToolResponse> {
    return this.executeTool('hierarchy_summary', userId, {
      p_institution_id: institutionId,
    });
  }

  static async getDepartments(userId: string, params: {
    institutionId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('departments', userId, {
      p_institution_id: params.institutionId,
      p_limit: params.limit || 10000,
      p_offset: params.offset || 0,
    });
  }

  // ============================================
  // Dashboard & Analytics Tools
  // ============================================

  static async getKPISummary(userId: string, institutionId?: string): Promise<ToolResponse> {
    return this.executeTool('kpi_summary', userId, {
      p_institution_id: institutionId,
    });
  }

  static async getAnalyticsOverview(userId: string, params: {
    dateFrom?: string;
    dateTo?: string;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('analytics_overview', userId, {
      p_date_from: params.dateFrom,
      p_date_to: params.dateTo,
    });
  }

  // ============================================
  // Action Tools
  // ============================================

  static async exportData(userId: string, params: {
    dataSource: string;
    filters?: Record<string, unknown>;
  }): Promise<ToolResponse> {
    return this.executeTool('export_data', userId, {
      p_data_source: params.dataSource,
      p_filters: params.filters || {},
    });
  }

  static async markNotificationRead(
    userId: string,
    notificationIds: string[]
  ): Promise<ActionExecutionResult> {
    const { data, error } = await this.supabase.rpc('ai_rpc_mark_notification_read', {
      p_user_id: userId,
      p_notification_ids: notificationIds,
    });

    if (error) {
      return {
        success: false,
        message: 'Failed to mark notifications as read',
        error: {
          code: 'ACTION_ERROR',
          message: error.message,
        },
      };
    }

    return data as ActionExecutionResult;
  }

  static async sendNotification(userId: string, params: {
    recipientIds: string[];
    title: string;
    message: string;
    type?: string;
    priority?: string;
  }): Promise<ActionExecutionResult> {
    const { data, error } = await this.supabase.rpc('ai_rpc_send_notification', {
      p_user_id: userId,
      p_recipient_ids: params.recipientIds,
      p_title: params.title,
      p_message: params.message,
      p_type: params.type || 'info',
      p_priority: params.priority || 'normal',
    });

    if (error) {
      return {
        success: false,
        message: 'Failed to send notification',
        error: {
          code: 'ACTION_ERROR',
          message: error.message,
        },
      };
    }

    return data as ActionExecutionResult;
  }

  static async sendBulkNotification(userId: string, params: {
    recipientIds: string[];
    title: string;
    message: string;
    type?: string;
    priority?: string;
  }): Promise<ActionExecutionResult> {
    const { data, error } = await this.supabase.rpc('ai_rpc_bulk_notification', {
      p_user_id: userId,
      p_recipient_ids: params.recipientIds,
      p_title: params.title,
      p_message: params.message,
      p_type: params.type || 'info',
      p_priority: params.priority || 'normal',
    });

    if (error) {
      return {
        success: false,
        message: 'Failed to send bulk notification',
        error: {
          code: 'ACTION_ERROR',
          message: error.message,
        },
      };
    }

    return data as ActionExecutionResult;
  }

  // ============================================
  // Notifications Tools
  // ============================================

  static async getNotifications(userId: string, params: {
    isRead?: boolean;
    type?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('notifications', userId, {
      p_is_read: params.isRead,
      p_type: params.type,
      p_limit: params.limit || 10000,
      p_offset: params.offset || 0,
    });
  }

  static async getUnreadNotifications(userId: string, limit?: number): Promise<ToolResponse> {
    return this.executeTool('unread_notifications', userId, {
      p_limit: limit || 50,
    });
  }

  // ============================================
  // Admissions Module Tools
  // ============================================

  /**
   * Comprehensive admission query with ALL fields, filters, and statistics
   * NO LIMIT - returns all matching records
   */
  static async getAdmissions(userId: string, params: {
    institutionId?: string;
    departmentId?: string;
    programId?: string;
    degreeId?: string;
    status?: string;
    entryType?: string;
    district?: string;
    state?: string;
    taluk?: string;
    gender?: string;
    religion?: string;
    community?: string;
    counselingApplied?: boolean;
    firstGraduate?: boolean;
    quota?: string;
    category?: string;
    accommodationType?: string;
    busRequired?: boolean;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    includeStats?: boolean;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('admissions', userId, {
      p_institution_id: params.institutionId,
      p_department_id: params.departmentId,
      p_program_id: params.programId,
      p_degree_id: params.degreeId,
      p_status: params.status,
      p_entry_type: params.entryType,
      p_district: params.district,
      p_state: params.state,
      p_taluk: params.taluk,
      p_gender: params.gender,
      p_religion: params.religion,
      p_community: params.community,
      p_counseling_applied: params.counselingApplied,
      p_first_graduate: params.firstGraduate,
      p_quota: params.quota,
      p_category: params.category,
      p_accommodation_type: params.accommodationType,
      p_bus_required: params.busRequired,
      p_search: params.search,
      p_date_from: params.dateFrom,
      p_date_to: params.dateTo,
      p_include_stats: params.includeStats !== false,
    });
  }

  /**
   * Get complete details of a specific admission including all 54 fields
   */
  static async getAdmissionDetails(userId: string, params: {
    admissionId?: string;
    applicationId?: string;
  }): Promise<ToolResponse> {
    return this.executeTool('admission_details', userId, {
      p_admission_id: params.admissionId,
      p_application_id: params.applicationId,
    });
  }

  /**
   * Search admissions by geographic location
   * Searches across district, state, taluk, city, and bus pickup location
   */
  static async getAdmissionsByLocation(userId: string, params: {
    district?: string;
    state?: string;
    taluk?: string;
    city?: string;
    status?: string;
    includeStats?: boolean;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('admissions_by_location', userId, {
      p_district: params.district,
      p_state: params.state,
      p_taluk: params.taluk,
      p_city: params.city,
      p_status: params.status,
      p_include_stats: params.includeStats !== false,
    });
  }

  /**
   * Get admission statistics and analytics
   * Institution-wise, status-wise, demographic breakdowns
   */
  static async getAdmissionStatistics(userId: string, params: {
    institutionId?: string;
    dateFrom?: string;
    dateTo?: string;
    groupBy?: string;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('admission_statistics', userId, {
      p_institution_id: params.institutionId,
      p_date_from: params.dateFrom,
      p_date_to: params.dateTo,
      p_group_by: params.groupBy || 'status',
    });
  }

  /**
   * Advanced admission analytics
   * Conversion rates, processing times, trends, comparisons
   */
  static async getAdmissionAnalytics(userId: string, params: {
    institutionId?: string;
    academicYearId?: string;
    includeTrends?: boolean;
  } = {}): Promise<ToolResponse> {
    return this.executeTool('admission_analytics', userId, {
      p_institution_id: params.institutionId,
      p_academic_year_id: params.academicYearId,
      p_include_trends: params.includeTrends !== false,
    });
  }
}
