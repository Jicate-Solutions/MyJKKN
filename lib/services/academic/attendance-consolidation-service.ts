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
  private static get supabase() {
    return createClientSupabaseClient();
  }

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

      // Validate institution ID
      if (!dto.institutionId || dto.institutionId.trim() === '') {
        const error = new Error('Institution ID is required to create a consolidation report');
        logger.error('academic/attendance-consolidation', 'Invalid institution ID', {
          institutionId: dto.institutionId,
        });
        throw error;
      }

      // Clean report params - remove empty strings from filter arrays
      const cleanedParams = {
        ...dto.reportParams,
        programs: dto.reportParams.programs?.filter(id => id && id.trim() !== '') || [],
        semesters: dto.reportParams.semesters?.filter(id => id && id.trim() !== '') || [],
        sections: dto.reportParams.sections?.filter(id => id && id.trim() !== '') || [],
      };

      const { data, error } = await this.supabase
        .from('attendance_consolidation_reports')
        .insert({
          report_name: dto.reportName,
          report_description: dto.reportDescription,
          institution_id: dto.institutionId,
          generated_by: userId,
          report_params: cleanedParams,
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

      // Trigger report generation with cleaned params
      await this.generateReportData(data.id, cleanedParams, dto.institutionId);

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
          program:programs(id, program_name),
          semester:semesters(id, semester_name),
          department:departments(id, department_name)
        `)
        .eq('institution_id', institutionId)
        .gte('attendance_date', dateFrom)
        .lte('attendance_date', dateTo);

      // Apply filters - filter out empty strings to avoid UUID errors
      if (params.sections && params.sections.length > 0) {
        const validSections = params.sections.filter(id => id && id.trim() !== '');
        if (validSections.length > 0) {
          query = query.in('section_id', validSections);
        }
      }

      if (params.semesters && params.semesters.length > 0) {
        const validSemesters = params.semesters.filter(id => id && id.trim() !== '');
        if (validSemesters.length > 0) {
          query = query.in('semester_id', validSemesters);
        }
      }

      if (params.programs && params.programs.length > 0) {
        const validPrograms = params.programs.filter(id => id && id.trim() !== '');
        if (validPrograms.length > 0) {
          query = query.in('program_id', validPrograms);
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
      // Each key in attendance_data represents a period_id with student attendance for that period
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
              groupKey = record.program?.id || 'unknown';
              groupName = record.program?.program_name || 'Unknown Program';
              break;
            case 'semester':
              groupKey = record.semester?.id || 'unknown';
              groupName = record.semester?.semester_name || 'Unknown Semester';
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
              presentPeriodsCount: 0,
              absentPeriodsCount: 0,
              absentDates: new Set<string>(), // Still track dates for absent details feature
            });
          }

          const studentData = group.students.get(studentId);

          // Track attendance - COUNT PERIODS, not dates
          if (student.status === 'Present') {
            studentData.presentPeriodsCount++;
          } else if (student.status === 'Absent') {
            studentData.absentPeriodsCount++;
            studentData.absentDates.add(record.attendance_date); // Track date for absent details
          }

          // Track working days at group level
          group.dates.add(record.attendance_date);
        }
      }
    }

    logger.info('academic/attendance-consolidation', 'Attendance records processed', {
      totalGroups: groups.size,
      totalRecords: attendanceRecords.length,
      note: 'Period-wise attendance tracking enabled'
    });

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
        const totalPresent = studentData.presentPeriodsCount;
        const totalAbsent = studentData.absentPeriodsCount;
        const totalPeriods = totalPresent + totalAbsent;
        const attendancePercentage =
          totalPeriods > 0
            ? (totalPresent / totalPeriods) * 100
            : 0;

        const studentSummary: StudentAttendanceSummary = {
          studentId,
          studentName: studentData.studentName,
          rollNumber: studentData.rollNumber,
          sectionId: studentData.sectionId,
          sectionName: studentData.sectionName,
          // Hierarchy info from enrichment
          degreeName: studentData.degreeName,
          degreeCode: studentData.degreeCode,
          departmentName: studentData.departmentName,
          departmentCode: studentData.departmentCode,
          programName: studentData.programName,
          programCode: studentData.programCode,
          semesterName: studentData.semesterName,
          semesterNumber: studentData.semesterNumber,
          // Attendance stats
          totalWorkingDays,
          totalPresent,
          totalAbsent,
          attendancePercentage: Math.round(attendancePercentage * 100) / 100,
        };

        // Include absent details if requested
        if (params.includeAbsentDetails) {
          studentSummary.absentDates = Array.from(studentData.absentDates).sort() as string[];
        }

        studentSummaries.push(studentSummary);
        totalPresentOverall += totalPresent;
        totalAbsentOverall += totalAbsent;
      }

      // Calculate group statistics
      const totalStudents = groupData.students.size;
      const totalPresent = studentSummaries.reduce((sum, s) => sum + s.totalPresent, 0);
      const totalAbsent = studentSummaries.reduce((sum, s) => sum + s.totalAbsent, 0);
      const totalPeriods = totalPresent + totalAbsent;
      const averageAttendance =
        totalPeriods > 0
          ? (totalPresent / totalPeriods) * 100
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

    const totalPeriodsOverall = totalPresentOverall + totalAbsentOverall;

    logger.info('academic/attendance-consolidation', 'Consolidation statistics calculated', {
      totalStudents: totalStudentsOverall,
      totalWorkingDays,
      totalPeriods: totalPeriodsOverall,
      presentPeriods: totalPresentOverall,
      absentPeriods: totalAbsentOverall,
      averageAttendance: totalPeriodsOverall > 0
        ? Math.round(((totalPresentOverall / totalPeriodsOverall) * 100) * 100) / 100
        : 0
    });

    const summary: ReportSummary = {
      totalStudents: totalStudentsOverall,
      totalWorkingDays,
      averageAttendance:
        totalPeriodsOverall > 0
          ? Math.round(((totalPresentOverall / totalPeriodsOverall) * 100) * 100) / 100
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
   * Enrich student data with names, roll numbers, and hierarchy info
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

      if (allStudentIds.size === 0) {
        logger.warn('academic/attendance-consolidation', 'No student IDs to enrich');
        return;
      }

      logger.info('academic/attendance-consolidation', 'Enriching student data', {
        studentCount: allStudentIds.size,
        institutionId,
      });

      // Fetch student details with hierarchy info
      // Using explicit FK hints because constraint names are custom (fk_learners_profiles_*)
      // Also adding institution_id filter to satisfy RLS policy
      const studentIdsArray = Array.from(allStudentIds);

      logger.info('academic/attendance-consolidation', 'Fetching learner details', {
        studentIds: studentIdsArray.slice(0, 5), // Log first 5 for debugging
        totalCount: studentIdsArray.length,
      });

      // Batch queries to avoid URL length limits (Supabase .in() uses GET requests)
      // With 792 students, URL would be ~28KB (exceeds typical 8KB limit)
      const BATCH_SIZE = 100; // Safe batch size for URL length
      const batches: string[][] = [];

      for (let i = 0; i < studentIdsArray.length; i += BATCH_SIZE) {
        batches.push(studentIdsArray.slice(i, i + BATCH_SIZE));
      }

      logger.info('academic/attendance-consolidation', 'Using batched queries', {
        totalStudents: studentIdsArray.length,
        batchSize: BATCH_SIZE,
        batchCount: batches.length,
      });

      let finalStudents: any[] = [];
      let hasError = false;

      // Execute batches sequentially to avoid overwhelming the database
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        logger.info('academic/attendance-consolidation', `Processing batch ${i + 1}/${batches.length}`, {
          batchSize: batch.length,
        });

        const { data: batchStudents, error: batchError } = await this.supabase
          .from('learners_profiles')
          .select(`
            id,
            first_name,
            last_name,
            roll_number,
            institution_id,
            degree_id,
            department_id,
            program_id,
            semester_id,
            section_id
          `)
          .in('id', batch)
          .eq('institution_id', institutionId);

        if (batchError) {
          logger.error('academic/attendance-consolidation', `Batch ${i + 1} primary query failed`, {
            error: batchError.message,
            code: batchError.code,
            hint: batchError.hint,
            details: batchError.details,
            batchNumber: i + 1,
            batchSize: batch.length,
            institutionId,
          });

          // Try fallback without institution filter for this batch
          logger.info('academic/attendance-consolidation', `Attempting fallback for batch ${i + 1}`);

          const { data: fallbackData, error: fallbackError } = await this.supabase
            .from('learners_profiles')
            .select(`
              id,
              first_name,
              last_name,
              roll_number,
              institution_id,
              degree_id,
              department_id,
              program_id,
              semester_id,
              section_id
            `)
            .in('id', batch);

          if (fallbackError) {
            logger.error('academic/attendance-consolidation', `Batch ${i + 1} fallback also failed`, {
              error: fallbackError.message,
              code: fallbackError.code,
            });
            hasError = true;
            continue; // Skip this batch and continue with next
          }

          finalStudents = finalStudents.concat(fallbackData || []);
          logger.warn('academic/attendance-consolidation', `Using fallback for batch ${i + 1}`, {
            found: fallbackData?.length || 0,
            note: 'Primary query failed but fallback succeeded - possible RLS or institution_id issue',
          });
        } else {
          finalStudents = finalStudents.concat(batchStudents || []);
        }
      }

      if (hasError && finalStudents.length === 0) {
        logger.error('academic/attendance-consolidation', 'All batches failed', {
          totalBatches: batches.length,
        });
        return;
      }

      // Add validation logging
      const foundCount = finalStudents.length;
      const matchRate = allStudentIds.size > 0
        ? ((foundCount / allStudentIds.size) * 100).toFixed(1)
        : '0.0';

      logger.info('academic/attendance-consolidation', 'All batches completed - Student data fetched', {
        requested: allStudentIds.size,
        found: foundCount,
        matchRate: `${matchRate}%`,
        batchesProcessed: batches.length,
      });

      if (foundCount < allStudentIds.size) {
        const foundIds = new Set(finalStudents.map(s => s.id));
        const missingIds = Array.from(allStudentIds).filter(id => !foundIds.has(id));

        logger.warn('academic/attendance-consolidation', 'Some students not found', {
          matchRate: `${matchRate}%`,
          missing: missingIds.length,
          sampleMissing: missingIds.slice(0, 5),
        });
      }

      // Collect unique hierarchy IDs for separate queries
      const degreeIds = new Set<string>();
      const departmentIds = new Set<string>();
      const programIds = new Set<string>();
      const semesterIds = new Set<string>();
      const sectionIds = new Set<string>();

      finalStudents.forEach(s => {
        if (s.degree_id) degreeIds.add(s.degree_id);
        if (s.department_id) departmentIds.add(s.department_id);
        if (s.program_id) programIds.add(s.program_id);
        if (s.semester_id) semesterIds.add(s.semester_id);
        if (s.section_id) sectionIds.add(s.section_id);
      });

      // Fetch hierarchy data in parallel
      const [degreesResult, departmentsResult, programsResult, semestersResult, sectionsResult] = await Promise.all([
        degreeIds.size > 0
          ? this.supabase.from('degrees').select('id, degree_name, display_name').in('id', Array.from(degreeIds))
          : { data: [], error: null },
        departmentIds.size > 0
          ? this.supabase.from('departments').select('id, department_name, department_code, display_name').in('id', Array.from(departmentIds))
          : { data: [], error: null },
        programIds.size > 0
          ? this.supabase.from('programs').select('id, program_name, display_name').in('id', Array.from(programIds))
          : { data: [], error: null },
        semesterIds.size > 0
          ? this.supabase.from('semesters').select('id, semester_name, semester_code, semester_order').in('id', Array.from(semesterIds))
          : { data: [], error: null },
        sectionIds.size > 0
          ? this.supabase.from('sections').select('id, section_name').in('id', Array.from(sectionIds))
          : { data: [], error: null },
      ]);

      // Create lookup maps for hierarchy data
      const degreeLookup = new Map((degreesResult.data || []).map(d => [d.id, d]));
      const departmentLookup = new Map((departmentsResult.data || []).map(d => [d.id, d]));
      const programLookup = new Map((programsResult.data || []).map(p => [p.id, p]));
      const semesterLookup = new Map((semestersResult.data || []).map(s => [s.id, s]));
      const sectionLookup = new Map((sectionsResult.data || []).map(s => [s.id, s]));

      logger.info('academic/attendance-consolidation', 'Hierarchy data fetched', {
        degrees: degreeLookup.size,
        departments: departmentLookup.size,
        programs: programLookup.size,
        semesters: semesterLookup.size,
        sections: sectionLookup.size,
      });

      // Create student lookup map with enriched hierarchy data
      const studentLookup = new Map(finalStudents.map(s => {
        const degree = degreeLookup.get(s.degree_id) as any;
        const department = departmentLookup.get(s.department_id) as any;
        const program = programLookup.get(s.program_id) as any;
        const semester = semesterLookup.get(s.semester_id) as any;
        const section = sectionLookup.get(s.section_id) as any;

        return [s.id, {
          ...s,
          degree,
          department,
          program,
          semester,
          section,
        }];
      }));

      // Enrich each student in each group
      for (const groupData of groups.values()) {
        for (const [studentId, studentData] of groupData.students) {
          const studentInfo = studentLookup.get(studentId) as any;
          if (studentInfo) {
            const firstName = studentInfo.first_name || '';
            const lastName = studentInfo.last_name || '';
            studentData.studentName = `${firstName} ${lastName}`.trim() || studentId;
            studentData.rollNumber = studentInfo.roll_number;

            // Add hierarchy info from joined data
            studentData.degreeName = studentInfo.degree?.degree_name || studentInfo.degree?.display_name;
            studentData.degreeCode = studentInfo.degree?.id;
            studentData.departmentName = studentInfo.department?.department_name || studentInfo.department?.display_name;
            studentData.departmentCode = studentInfo.department?.department_code;
            studentData.programName = studentInfo.program?.program_name || studentInfo.program?.display_name;
            studentData.programCode = studentInfo.program?.id;
            studentData.semesterName = studentInfo.semester?.semester_name;
            studentData.semesterNumber = studentInfo.semester?.semester_order;
            studentData.sectionName = studentInfo.section?.section_name || studentData.sectionName;
          }
        }

        // For student-grouped reports, update group name
        if (groupData.groupType === 'student') {
          const studentInfo = studentLookup.get(groupData.groupId) as any;
          if (studentInfo) {
            const firstName = studentInfo.first_name || '';
            const lastName = studentInfo.last_name || '';
            groupData.groupName = `${firstName} ${lastName}`.trim() || groupData.groupId;
          }
        }
      }
    } catch (error) {
      logger.error('academic/attendance-consolidation', 'Error enriching student data', {
        error: error instanceof Error ? error.message : String(error),
      });
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
      logger.info('academic/attendance-consolidation', 'Attempting to delete report', { reportId, userId });

      const { data, error, count } = await this.supabase
        .from('attendance_consolidation_reports')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
        })
        .eq('id', reportId)
        .select('id')
        .single();

      if (error) {
        // Properly log Supabase error with all details
        logger.error('academic/attendance-consolidation', 'Failed to delete report', {
          reportId,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          errorHint: error.hint,
        });
        return false;
      }

      if (!data) {
        logger.warn('academic/attendance-consolidation', 'No report found or RLS policy blocked update', { reportId });
        return false;
      }

      logger.info('academic/attendance-consolidation', 'Report deleted successfully', { reportId });
      return true;
    } catch (error) {
      logger.error('academic/attendance-consolidation', 'Error deleting report', {
        reportId,
        error: error instanceof Error ? error.message : String(error),
      });
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
