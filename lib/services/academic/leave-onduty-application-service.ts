/**
 * Leave/OnDuty Application Service
 *
 * Handles all business logic for leave and onduty applications including:
 * - Application creation and validation
 * - Timetable-based period detection
 * - Application retrieval with filters
 * - Application cancellation
 * - File attachment management
 *
 * @module services/academic/leave-onduty-application-service
 * @created 2026-01-28
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  LeaveOndutyApplication,
  ApplicationFormData,
  ApplicationFilters,
  CreateApplicationInput,
  UpdateApplicationInput,
  ValidationResult,
  FileRequirements,
  PeriodDetectionResult,
  TimetablePeriod,
  AvailableDateInfo,
  DEFAULT_VALIDATION_RULES,
} from '@/types/leave-onduty';

// Helper to get untyped client for tables not yet in database.types.ts
const getSupabase = () => createClientSupabaseClient() as any;

export class LeaveOndutyApplicationService {
  /**
   * Create a new leave/onduty application
   */
  static async createApplication(
    data: ApplicationFormData,
    learnerId: string,
    institutionId: string
  ): Promise<LeaveOndutyApplication> {
    const supabase = getSupabase();

    // Get learner details for department/semester/section
    const { data: learner, error: learnerError } = await supabase
      .from('learners_profiles')
      .select('department_id, semester_id, section_id')
      .eq('id', learnerId)
      .single();

    if (learnerError || !learner) {
      throw new Error('Learner not found');
    }

    // Validate application data
    const validation = await this.validateApplicationData(data, learner.section_id);
    if (!validation.valid) {
      throw new Error(validation.error || 'Validation failed');
    }

    // Upload attachment if provided
    let attachmentUrl: string | null = null;
    if (data.attachment_file) {
      attachmentUrl = await this.uploadAttachment(
        data.attachment_file,
        institutionId,
        learnerId
      );
    }

    // Detect periods based on period_type
    const periodDetection = await this.getPeriodsForDate(
      learner.section_id,
      data.start_date,
      data.period_type
    );

    if (!periodDetection.valid) {
      throw new Error(periodDetection.error || 'Period detection failed');
    }

    // Determine selected periods
    const selectedPeriods =
      data.period_type === 'periodwise'
        ? data.selected_periods
        : periodDetection.periods;

    // Create application
    const { data: application, error: createError } = await supabase
      .from('leave_onduty_applications')
      .insert({
        learner_id: learnerId,
        institution_id: institutionId,
        department_id: learner.department_id,
        semester_id: learner.semester_id,
        section_id: learner.section_id,
        category: data.category,
        sub_category: data.sub_category,
        start_date: data.start_date,
        end_date: data.end_date,
        period_type: data.period_type,
        selected_periods: selectedPeriods,
        reason: data.reason,
        attachment_url: attachmentUrl,
        status: 'pending',
        current_step: 1,
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Failed to create application: ${createError.message}`);
    }

    return application;
  }

  /**
   * Get applications by learner with filters
   */
  static async getApplicationsByLearner(
    learnerId: string,
    filters?: Partial<ApplicationFilters>
  ): Promise<LeaveOndutyApplication[]> {
    const supabase = getSupabase();

    let query: any = supabase
      .from('leave_onduty_applications')
      .select(
        `
        *,
        institution:institutions(id, name),
        department:departments(id, department_name),
        semester:semesters(id, semester_name),
        section:sections(id, section_name),
        approvals:leave_onduty_approvals(
          *,
          approver:profiles(id, full_name, email, avatar_url)
        )
      `
      )
      .eq('learner_id', learnerId)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.start_date) {
      query = query.gte('start_date', filters.start_date);
    }
    if (filters?.end_date) {
      query = query.lte('end_date', filters.end_date);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch applications: ${error.message}`);
    }

    return (data as LeaveOndutyApplication[]) || [];
  }

  /**
   * Get applications by approver
   */
  static async getApplicationsByApprover(
    approverId: string,
    filters?: Partial<ApplicationFilters>
  ): Promise<LeaveOndutyApplication[]> {
    const supabase = getSupabase();

    // First get application IDs where user is an approver
    const { data: approvalIds } = await supabase
      .from('leave_onduty_approvals')
      .select('application_id')
      .eq('approver_id', approverId);

    if (!approvalIds || approvalIds.length === 0) {
      return [];
    }

    const applicationIds = approvalIds.map((a: { application_id: string }) => a.application_id);

    let query: any = supabase
      .from('leave_onduty_applications')
      .select(
        `
        *,
        learner:learners_profiles(
          id,
          first_name,
          last_name,
          roll_number,
          register_number,
          student_email
        ),
        institution:institutions(id, name),
        department:departments(id, department_name),
        semester:semesters(id, semester_name),
        section:sections(id, section_name),
        approvals:leave_onduty_approvals(
          *,
          approver:profiles(id, full_name, email, avatar_url)
        )
      `
      )
      .in('id', applicationIds)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters?.department_id) {
      query = query.eq('department_id', filters.department_id);
    }
    if (filters?.semester_id) {
      query = query.eq('semester_id', filters.semester_id);
    }
    if (filters?.section_id) {
      query = query.eq('section_id', filters.section_id);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch applications: ${error.message}`);
    }

    return (data as LeaveOndutyApplication[]) || [];
  }

  /**
   * Get application details by ID
   */
  static async getApplicationDetails(
    applicationId: string
  ): Promise<LeaveOndutyApplication> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('leave_onduty_applications')
      .select(
        `
        *,
        learner:learners_profiles(
          id,
          first_name,
          last_name,
          roll_number,
          register_number,
          student_email
        ),
        institution:institutions(id, name),
        department:departments(id, department_name),
        semester:semesters(id, semester_name),
        section:sections(id, section_name),
        approvals:leave_onduty_approvals(
          *,
          approver:profiles(id, full_name, email, avatar_url)
        )
      `
      )
      .eq('id', applicationId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch application: ${error.message}`);
    }

    return data as LeaveOndutyApplication;
  }

  /**
   * Cancel an application (learner only, pending status only)
   */
  static async cancelApplication(
    applicationId: string,
    learnerId: string
  ): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
      .from('leave_onduty_applications')
      .update({ status: 'cancelled' })
      .eq('id', applicationId)
      .eq('learner_id', learnerId)
      .eq('status', 'pending');

    if (error) {
      throw new Error(`Failed to cancel application: ${error.message}`);
    }
  }

  /**
   * Validate application data before submission
   */
  static async validateApplicationData(
    data: ApplicationFormData,
    sectionId: string
  ): Promise<ValidationResult> {
    // Validate date range
    const startDate = new Date(data.start_date);
    const endDate = new Date(data.end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check max backdate
    const maxBackdate = new Date();
    maxBackdate.setDate(
      maxBackdate.getDate() - DEFAULT_VALIDATION_RULES.dates.maxBackdate
    );
    maxBackdate.setHours(0, 0, 0, 0);

    if (startDate < maxBackdate) {
      return {
        valid: false,
        error: `Cannot apply for dates more than ${DEFAULT_VALIDATION_RULES.dates.maxBackdate} days in the past`,
      };
    }

    // Check date range validity
    if (endDate < startDate) {
      return {
        valid: false,
        error: 'End date cannot be before start date',
      };
    }

    // Validate reason length
    if (data.reason.length > 500) {
      return {
        valid: false,
        error: 'Reason cannot exceed 500 characters',
      };
    }

    if (data.reason.trim().length < 10) {
      return {
        valid: false,
        error: 'Reason must be at least 10 characters',
      };
    }

    // Validate file attachment requirements
    const dayCount = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
    const fileReq = this.getFileRequirements(data.category, data.sub_category, dayCount);

    if (fileReq.required && !data.attachment_file) {
      return {
        valid: false,
        error: fileReq.reason,
      };
    }

    if (data.attachment_file) {
      if (data.attachment_file.size > fileReq.maxSize) {
        return {
          valid: false,
          error: `File size cannot exceed ${fileReq.maxSize / (1024 * 1024)}MB`,
        };
      }

      if (!fileReq.allowedTypes.includes(data.attachment_file.type)) {
        return {
          valid: false,
          error: 'File type not allowed. Only PDF, JPG, and PNG files are accepted',
        };
      }
    }

    // Validate period selection
    if (data.period_type === 'periodwise' && data.selected_periods.length === 0) {
      return {
        valid: false,
        error: 'Please select at least one period',
      };
    }

    // Validate timetable exists for selected dates
    const timetableValidation = await this.validateTimetableExists(
      sectionId,
      data.start_date
    );
    if (!timetableValidation.valid) {
      return timetableValidation;
    }

    return { valid: true };
  }

  /**
   * Get file attachment requirements based on application type
   */
  static getFileRequirements(
    category: string,
    subCategory: string,
    dayCount: number
  ): FileRequirements {
    const required =
      subCategory === 'medical' ||
      category === 'onduty' ||
      dayCount > 3;

    let reason = '';
    if (subCategory === 'medical') {
      reason = 'Medical certificate is required for medical leave';
    } else if (category === 'onduty') {
      reason = 'Supporting document is required for onduty applications';
    } else if (dayCount > 3) {
      reason = 'Supporting document is required for leave exceeding 3 days';
    }

    return {
      required,
      reason,
      maxSize: DEFAULT_VALIDATION_RULES.attachment.maxSize,
      allowedTypes: DEFAULT_VALIDATION_RULES.attachment.allowedTypes,
    };
  }

  /**
   * Get available dates with timetables for a section
   */
  static async getAvailableDatesForSection(
    sectionId: string,
    semesterId: string,
    startDate: string,
    endDate: string
  ): Promise<AvailableDateInfo[]> {
    const supabase = getSupabase();

    // Get active timetable for section
    const { data: timetable } = await supabase
      .from('timetables')
      .select('*')
      .eq('section_id', sectionId)
      .eq('semester_id', semesterId)
      .eq('is_active', true)
      .single();

    const dates: AvailableDateInfo[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      dates.push({
        date: dateStr,
        has_timetable: !!timetable && !isWeekend,
        total_periods: timetable ? Object.keys(timetable.timetable_data || {}).length : 0,
        is_weekend: isWeekend,
        is_holiday: false, // TODO: Check holiday calendar
      });
    }

    return dates;
  }

  /**
   * Get periods for a specific date based on period type
   */
  static async getPeriodsForDate(
    sectionId: string,
    date: string,
    periodType: string
  ): Promise<PeriodDetectionResult> {
    const supabase = getSupabase();

    // Get active timetable for section
    const { data: timetable, error: timetableError } = await supabase
      .from('timetables')
      .select('*')
      .eq('section_id', sectionId)
      .eq('is_active', true)
      .single();

    if (timetableError || !timetable) {
      return {
        valid: false,
        periods: [],
        error: 'No active timetable found for this section',
      };
    }

    const timetableData = timetable.timetable_data || {};
    const allPeriods = Object.keys(timetableData);

    if (allPeriods.length === 0) {
      return {
        valid: false,
        periods: [],
        error: 'No classes scheduled for this date',
      };
    }

    let selectedPeriods: string[] = [];

    switch (periodType) {
      case 'fullday':
        selectedPeriods = allPeriods;
        break;

      case 'forenoon':
        selectedPeriods = allPeriods.filter((slotId) => {
          const period = timetableData[slotId];
          if (!period.start_time) return false;
          const startTime = this.parseTime(period.start_time);
          const forenoonStart = this.parseTime(
            DEFAULT_VALIDATION_RULES.periods.forenoonStart
          );
          const forenoonEnd = this.parseTime(
            DEFAULT_VALIDATION_RULES.periods.forenoonEnd
          );
          return startTime >= forenoonStart && startTime <= forenoonEnd;
        });
        break;

      case 'afternoon':
        selectedPeriods = allPeriods.filter((slotId) => {
          const period = timetableData[slotId];
          if (!period.start_time) return false;
          const startTime = this.parseTime(period.start_time);
          const afternoonStart = this.parseTime(
            DEFAULT_VALIDATION_RULES.periods.afternoonStart
          );
          const afternoonEnd = this.parseTime(
            DEFAULT_VALIDATION_RULES.periods.afternoonEnd
          );
          return startTime >= afternoonStart && startTime <= afternoonEnd;
        });
        break;

      case 'periodwise':
        // For periodwise, return all periods for manual selection
        selectedPeriods = allPeriods;
        break;

      default:
        return {
          valid: false,
          periods: [],
          error: 'Invalid period type',
        };
    }

    return {
      valid: true,
      periods: selectedPeriods,
      timetable: timetableData,
    };
  }

  /**
   * Helper to parse time string to minutes since midnight
   */
  private static parseTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Validate that timetable exists for a date
   */
  private static async validateTimetableExists(
    sectionId: string,
    date: string
  ): Promise<ValidationResult> {
    const supabase = getSupabase();

    const { data: timetable, error } = await supabase
      .from('timetables')
      .select('id, timetable_data')
      .eq('section_id', sectionId)
      .eq('is_active', true)
      .single();

    if (error || !timetable) {
      return {
        valid: false,
        error: 'No active timetable found for your section. Please contact administrator.',
      };
    }

    const timetableData = timetable.timetable_data || {};
    if (Object.keys(timetableData).length === 0) {
      return {
        valid: false,
        error: 'No classes scheduled in the timetable. Please contact administrator.',
      };
    }

    return { valid: true };
  }

  /**
   * Upload attachment to storage
   */
  private static async uploadAttachment(
    file: File,
    institutionId: string,
    learnerId: string
  ): Promise<string> {
    const supabase = getSupabase();

    const timestamp = Date.now();
    const fileName = `${timestamp}-${file.name}`;
    const filePath = `${institutionId}/${learnerId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('leave-onduty-attachments')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload attachment: ${error.message}`);
    }

    // Get public URL (signed URL for private bucket)
    const { data: urlData } = supabase.storage
      .from('leave-onduty-attachments')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  }

  /**
   * Get all applications with admin filters
   */
  static async getAllApplications(
    filters: ApplicationFilters
  ): Promise<LeaveOndutyApplication[]> {
    const supabase = getSupabase();

    let query: any = supabase
      .from('leave_onduty_applications')
      .select(
        `
        *,
        learner:learners_profiles(
          id,
          first_name,
          last_name,
          roll_number,
          register_number,
          student_email
        ),
        institution:institutions(id, name),
        department:departments(id, department_name),
        semester:semesters(id, semester_name),
        section:sections(id, section_name),
        approvals:leave_onduty_approvals(
          *,
          approver:profiles(id, full_name, email, avatar_url)
        )
      `
      )
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.department_id) {
      query = query.eq('department_id', filters.department_id);
    }
    if (filters.semester_id) {
      query = query.eq('semester_id', filters.semester_id);
    }
    if (filters.section_id) {
      query = query.eq('section_id', filters.section_id);
    }
    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.sub_category) {
      query = query.eq('sub_category', filters.sub_category);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.start_date) {
      query = query.gte('start_date', filters.start_date);
    }
    if (filters.end_date) {
      query = query.lte('end_date', filters.end_date);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch applications: ${error.message}`);
    }

    return (data as LeaveOndutyApplication[]) || [];
  }
}
