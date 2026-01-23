import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  AttendanceConsolidationReport,
  CreateConsolidationReportDto,
  UpdateConsolidationReportDto,
  ConsolidationReportFilters,
  ConsolidationReportListResponse,
  ConsolidationReportData,
  ConsolidationReportParams,
  ReportSummary,
  GroupAttendanceSummary,
  StudentAttendanceSummary,
} from '@/types/attendance';

/**
 * ATTENDANCE CONSOLIDATION REPORT SERVICE
 * =====================================================
 * Purpose: Generate and manage institution-wide attendance consolidation reports
 * Created: 2026-01-23
 *
 * Features:
 * - Create and generate consolidation reports
 * - Calculate attendance statistics grouped by program/semester/section/student
 * - Support flexible date ranges and filters
 * - Soft delete functionality
 * - Export to PDF/Excel/CSV formats
 */
export class AttendanceConsolidationService {
  private static supabase = createClientSupabaseClient();

  /**
   * Create a new consolidation report
   * This creates the report record and triggers the generation process
   */
  static async createReport(
    dto: CreateConsolidationReportDto,
    userId: string
  ): Promise<AttendanceConsolidationReport | null> {
    try {
      logger.info('academic/attendance-consolidation', 'Creating consolidation report', {
        reportName: dto.reportName,
        userId,
      });

      const { data, error } = await this.supabase
        .from('attendance_consolidation_reports')
        .insert({
          report_name: dto.reportName,
          report_description: dto.reportDescription,
          institution_id: dto.institutionId,
          generated_by: userId,
          report_params: dto.reportParams,
          format: dto.format || 'pdf',
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        logger.error('academic/attendance-consolidation', 'Failed to create report', error);
        throw error;
      }

      logger.info('academic/attendance-consolidation', 'Report created successfully', {
        reportId: data.id,
      });

      // Trigger report generation
      await this.generateReportData(data.id, dto.reportParams, dto.institutionId);

      return this.mapDatabaseToReport(data);
    } catch (error) {
      logger.error('academic/attendance-consolidation', 'Error creating report', error);
      return null;
    }
  }

  /**
   * Generate report data by querying attendance records and calculating statistics
   */
  static async generateReportData(
    reportId: string,
    params: ConsolidationReportParams,
    institutionId: string
  ): Promise<boolean> {
    try {
      logger.info('academic/attendance-consolidation', 'Generating report data', {
        reportId,
        params,
      });

      // Update status to processing
      await this.updateReportStatus(reportId, 'processing');

      // Fetch all attendance records within date range
      const attendanceRecords = await this.fetchAttendanceRecords(
        institutionId,
        params.dateFrom,
        params.dateTo,
        params
      );

      if (!attendanceRecords || attendanceRecords.length === 0) {
        logger.warn('academic/attendance-consolidation', 'No attendance records found', {
          reportId,
          dateRange: `${params.dateFrom} to ${params.dateTo}`,
        });

        await this.updateReport(reportId, {
          status: 'completed',
          reportData: {
            summary: {
              totalStudents: 0,
              totalWorkingDays: 0,
              averageAttendance: 0,
              totalPresent: 0,
              totalAbsent: 0,
              dateRange: { from: params.dateFrom, to: params.dateTo },
            },
            groups: [],
          },
          completedAt: new Date().toISOString(),
        });

        return true;
      }

      // Calculate statistics based on groupBy type
      const reportData = await this.calculateReportData(
        attendanceRecords,
        params,
        institutionId
      );

      // Update report with generated data
      await this.updateReport(reportId, {
        status: 'completed',
        reportData,
        completedAt: new Date().toISOString(),
      });

      logger.info('academic/attendance-consolidation', 'Report generated successfully', {
        reportId,
        totalGroups: reportData.groups.length,
      });

      return true;
    } catch (error) {
      logger.error('academic/attendance-consolidation', 'Error generating report data', error);

      // Update status to failed
      await this.updateReport(reportId, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      return false;
    }
  }

  /**
   * Fetch attendance records within date range with filters
   */
  private static async fetchAttendanceRecords(
    institutionId: string,
    dateFrom: string,
    dateTo: string,
    params: ConsolidationReportParams
  ) {
    try {
      let query = this.supabase
        .from('student_attendance')
        .select(`
          *,
          section:sections(id, section_name),
          timetable:timetables(
            id,
            timetable_name,
            program:programs(id, program_name),
            semester:semesters(id, semester_name),
            department:departments(id, department_name)
          )
        `)
        .eq('institution_id', institutionId)
        .gte('attendance_date', dateFrom)
        .lte('attendance_date', dateTo);

      // Apply filters
      if (params.sections && params.sections.length > 0) {
        query = query.in('section_id', params.sections);
      }

      if (params.semesters && params.semesters.length > 0) {
        // Note: Need to join through timetables table
        // This is a simplified version - may need refinement
        const { data: timetables } = await this.supabase
          .from('timetables')
          .select('id')
          .in('semester_id', params.semesters);

        if (timetables && timetables.length > 0) {
          query = query.in('timetable_id', timetables.map(t => t.id));
        }
      }

      if (params.programs && params.programs.length > 0) {
        const { data: timetables } = await this.supabase
          .from('timetables')
          .select('id')
          .in('program_id', params.programs);

        if (timetables && timetables.length > 0) {
          query = query.in('timetable_id', timetables.map(t => t.id));
        }
      }

      const { data, error } = await query;

      if (error) {
        logger.error('academic/attendance-consolidation', 'Failed to fetch attendance records', error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('academic/attendance-consolidation', 'Error fetching attendance records', error);
      throw error;
    }
  }

  /**
   * Calculate report data and statistics
   */
  private static async calculateReportData(
    attendanceRecords: any[],
    params: ConsolidationReportParams,
    institutionId: string
  ): Promise<ConsolidationReportData> {
    // Group data based on groupBy parameter
    const groups = new Map<string, any>();

    // Process each attendance record
    for (const record of attendanceRecords) {
      const attendanceData = record.attendance_data || {};

      // Extract students from attendance_data (JSONB structure)
      const periodSlots = Object.values(attendanceData);

      for (const slot of periodSlots as any[]) {
        const students = slot.students || [];

        for (const student of students) {
          let groupKey: string;
          let groupName: string;
          let groupType = params.groupBy;

          // Determine group based on groupBy type
          switch (params.groupBy) {
            case 'program':
              groupKey = record.timetable?.program?.id || 'unknown';
              groupName = record.timetable?.program?.program_name || 'Unknown Program';
              break;
            case 'semester':
              groupKey = record.timetable?.semester?.id || 'unknown';
              groupName = record.timetable?.semester?.semester_name || 'Unknown Semester';
              break;
            case 'section':
              groupKey = record.section?.id || 'unknown';
              groupName = record.section?.section_name || 'Unknown Section';
              break;
            case 'student':
              groupKey = student.student_id;
              groupName = student.student_id; // Will be enriched later
              break;
            default:
              groupKey = 'all';
              groupName = 'All Students';
          }

          // Initialize group if not exists
          if (!groups.has(groupKey)) {
            groups.set(groupKey, {
              groupId: groupKey,
              groupName,
              groupType,
              students: new Map<string, any>(),
              dates: new Set<string>(),
            });
          }

          const group = groups.get(groupKey);
          const studentId = student.student_id;

          // Initialize student if not exists
          if (!group.students.has(studentId)) {
            group.students.set(studentId, {
              studentId,
              studentName: studentId, // Will be enriched later
              sectionId: student.section_id,
              sectionName: record.section?.section_name,
              presentDates: new Set<string>(),
              absentDates: new Set<string>(),
            });
          }

          const studentData = group.students.get(studentId);

          // Track attendance
          if (student.status === 'Present') {
            studentData.presentDates.add(record.attendance_date);
          } else if (student.status === 'Absent') {
            studentData.absentDates.add(record.attendance_date);
          }

          // Track working days at group level
          group.dates.add(record.attendance_date);
        }
      }
    }

    // Enrich student data (fetch names, roll numbers)
    await this.enrichStudentData(groups, institutionId);

    // Calculate statistics for each group
    const groupSummaries: GroupAttendanceSummary[] = [];
    let totalStudentsOverall = 0;
    let totalPresentOverall = 0;
    let totalAbsentOverall = 0;

    for (const [groupId, groupData] of groups) {
      const studentSummaries: StudentAttendanceSummary[] = [];
      const totalWorkingDays = groupData.dates.size;

      for (const [studentId, studentData] of groupData.students) {
        const totalPresent = studentData.presentDates.size;
        const totalAbsent = studentData.absentDates.size;
        const attendancePercentage =
          totalWorkingDays > 0
            ? (totalPresent / totalWorkingDays) * 100
            : 0;

        const studentSummary: StudentAttendanceSummary = {
          studentId,
          studentName: studentData.studentName,
          rollNumber: studentData.rollNumber,
          sectionId: studentData.sectionId,
          sectionName: studentData.sectionName,
          totalWorkingDays,
          totalPresent,
          totalAbsent,
          attendancePercentage: Math.round(attendancePercentage * 100) / 100,
        };

        // Include absent details if requested
        if (params.includeAbsentDetails) {
          studentSummary.absentDates = Array.from(studentData.absentDates).sort();
        }

        studentSummaries.push(studentSummary);
        totalPresentOverall += totalPresent;
        totalAbsentOverall += totalAbsent;
      }

      // Calculate group statistics
      const totalStudents = groupData.students.size;
      const totalPresent = studentSummaries.reduce((sum, s) => sum + s.totalPresent, 0);
      const totalAbsent = studentSummaries.reduce((sum, s) => sum + s.totalAbsent, 0);
      const averageAttendance =
        totalStudents > 0 && totalWorkingDays > 0
          ? (totalPresent / (totalStudents * totalWorkingDays)) * 100
          : 0;

      groupSummaries.push({
        groupName: groupData.groupName,
        groupId,
        groupType: groupData.groupType,
        totalStudents,
        totalWorkingDays,
        averageAttendance: Math.round(averageAttendance * 100) / 100,
        totalPresent,
        totalAbsent,
        students: studentSummaries.sort((a, b) =>
          (a.studentName || '').localeCompare(b.studentName || '')
        ),
      });

      totalStudentsOverall += totalStudents;
    }

    // Calculate overall summary
    const allDates = new Set<string>();
    attendanceRecords.forEach(r => allDates.add(r.attendance_date));
    const totalWorkingDays = allDates.size;

    const summary: ReportSummary = {
      totalStudents: totalStudentsOverall,
      totalWorkingDays,
      averageAttendance:
        totalStudentsOverall > 0 && totalWorkingDays > 0
          ? Math.round(((totalPresentOverall / (totalStudentsOverall * totalWorkingDays)) * 100) * 100) / 100
          : 0,
      totalPresent: totalPresentOverall,
      totalAbsent: totalAbsentOverall,
      dateRange: {
        from: params.dateFrom,
        to: params.dateTo,
      },
    };

    return {
      summary,
      groups: groupSummaries.sort((a, b) => a.groupName.localeCompare(b.groupName)),
    };
  }

  /**
   * Enrich student data with names and roll numbers
   */
  private static async enrichStudentData(groups: Map<string, any>, institutionId: string) {
    try {
      // Collect all unique student IDs
      const allStudentIds = new Set<string>();
      for (const groupData of groups.values()) {
        for (const studentId of groupData.students.keys()) {
          allStudentIds.add(studentId);
        }
      }

      if (allStudentIds.size === 0) return;

      // Fetch student details
      const { data: students, error } = await this.supabase
        .from('learners_profiles')
        .select('id, student_name, roll_number')
        .eq('institution_id', institutionId)
        .in('id', Array.from(allStudentIds));

      if (error) {
        logger.warn('academic/attendance-consolidation', 'Failed to fetch student details', error);
        return;
      }

      // Create lookup map
      const studentLookup = new Map(students?.map(s => [s.id, s]) || []);

      // Enrich each student in each group
      for (const groupData of groups.values()) {
        for (const [studentId, studentData] of groupData.students) {
          const studentInfo = studentLookup.get(studentId);
          if (studentInfo) {
            studentData.studentName = studentInfo.student_name || studentId;
            studentData.rollNumber = studentInfo.roll_number;
          }
        }

        // For student-grouped reports, update group name
        if (groupData.groupType === 'student') {
          const studentInfo = studentLookup.get(groupData.groupId);
          if (studentInfo) {
            groupData.groupName = studentInfo.student_name || groupData.groupId;
          }
        }
      }
    } catch (error) {
      logger.warn('academic/attendance-consolidation', 'Error enriching student data', error);
    }
  }

  /**
   * Get a consolidation report by ID
   */
  static async getReport(reportId: string): Promise<AttendanceConsolidationReport | null> {
    try {
      const { data, error } = await this.supabase
        .from('attendance_consolidation_reports')
        .select(`
          *,
          institution:institutions(id, name),
          generated_by_profile:profiles!attendance_consolidation_reports_generated_by_fkey(id, email, full_name)
        `)
        .eq('id', reportId)
        .eq('is_deleted', false)
        .single();

      if (error) {
        logger.error('academic/attendance-consolidation', 'Failed to fetch report', error);
        return null;
      }

      return this.mapDatabaseToReport(data);
    } catch (error) {
      logger.error('academic/attendance-consolidation', 'Error fetching report', error);
      return null;
    }
  }

  /**
   * List consolidation reports with filters
   */
  static async listReports(
    filters: ConsolidationReportFilters
  ): Promise<ConsolidationReportListResponse | null> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const offset = (page - 1) * limit;

      let query = this.supabase
        .from('attendance_consolidation_reports')
        .select(`
          *,
          institution:institutions(id, name),
          generated_by_profile:profiles!attendance_consolidation_reports_generated_by_fkey(id, email, full_name)
        `, { count: 'exact' })
        .eq('is_deleted', false);

      // Apply filters
      if (filters.institutionId) {
        query = query.eq('institution_id', filters.institutionId);
      }

      if (filters.generatedBy) {
        query = query.eq('generated_by', filters.generatedBy);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }

      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }

      // Apply pagination and ordering
      query = query.order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        logger.error('academic/attendance-consolidation', 'Failed to list reports', error);
        return null;
      }

      return {
        data: data.map(this.mapDatabaseToReport),
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    } catch (error) {
      logger.error('academic/attendance-consolidation', 'Error listing reports', error);
      return null;
    }
  }

  /**
   * Update a consolidation report
   */
  static async updateReport(
    reportId: string,
    dto: UpdateConsolidationReportDto
  ): Promise<AttendanceConsolidationReport | null> {
    try {
      const updateData: any = {};

      if (dto.reportName !== undefined) updateData.report_name = dto.reportName;
      if (dto.reportDescription !== undefined) updateData.report_description = dto.reportDescription;
      if (dto.status !== undefined) updateData.status = dto.status;
      if (dto.reportData !== undefined) updateData.report_data = dto.reportData;
      if (dto.fileUrl !== undefined) updateData.file_url = dto.fileUrl;
      if (dto.fileSize !== undefined) updateData.file_size = dto.fileSize;
      if (dto.errorMessage !== undefined) updateData.error_message = dto.errorMessage;
      if (dto.completedAt !== undefined) updateData.completed_at = dto.completedAt;

      const { data, error } = await this.supabase
        .from('attendance_consolidation_reports')
        .update(updateData)
        .eq('id', reportId)
        .select()
        .single();

      if (error) {
        logger.error('academic/attendance-consolidation', 'Failed to update report', error);
        return null;
      }

      return this.mapDatabaseToReport(data);
    } catch (error) {
      logger.error('academic/attendance-consolidation', 'Error updating report', error);
      return null;
    }
  }

  /**
   * Update report status
   */
  static async updateReportStatus(reportId: string, status: 'pending' | 'processing' | 'completed' | 'failed') {
    return this.updateReport(reportId, { status });
  }

  /**
   * Delete a consolidation report (soft delete)
   */
  static async deleteReport(reportId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('attendance_consolidation_reports')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
        })
        .eq('id', reportId);

      if (error) {
        logger.error('academic/attendance-consolidation', 'Failed to delete report', error);
        return false;
      }

      logger.info('academic/attendance-consolidation', 'Report deleted successfully', { reportId });
      return true;
    } catch (error) {
      logger.error('academic/attendance-consolidation', 'Error deleting report', error);
      return false;
    }
  }

  /**
   * Map database record to TypeScript model
   */
  private static mapDatabaseToReport(data: any): AttendanceConsolidationReport {
    return {
      id: data.id,
      reportName: data.report_name,
      reportDescription: data.report_description,
      institutionId: data.institution_id,
      generatedBy: data.generated_by,
      reportParams: data.report_params,
      reportData: data.report_data,
      status: data.status,
      format: data.format,
      fileUrl: data.file_url,
      fileSize: data.file_size,
      errorMessage: data.error_message,
      retryCount: data.retry_count || 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      completedAt: data.completed_at,
      isDeleted: data.is_deleted || false,
      deletedAt: data.deleted_at,
      deletedBy: data.deleted_by,
      institution: data.institution,
      generatedByProfile: data.generated_by_profile ? {
        id: data.generated_by_profile.id,
        email: data.generated_by_profile.email,
        fullName: data.generated_by_profile.full_name,
      } : undefined,
    };
  }
}
