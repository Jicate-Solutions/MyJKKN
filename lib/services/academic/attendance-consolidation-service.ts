import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  deriveDailyStatus,
  dailyStatusToDays,
} from '@/lib/utils/academic/attendance-sessions';
import { getPolicyBool } from '@/lib/policies/get-policy-client';
import { POLICY_KEYS } from '@/lib/policies/keys';
import type {
  EffectiveAttendanceRow,
  EffectiveAttendanceCoupling,
} from '@/types/session-feedback';
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
  SubjectwiseCourseColumn,
  SubjectwiseGroup,
  SubjectwiseStudentRow,
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
   * PR-D — DERIVED "effective attendance %" coupling (DARK, compliance-gated).
   * =====================================================================
   * Returns a per-learner comparison of the OFFICIAL attendance %
   * (present/(present+absent)) vs an EFFECTIVE % that only counts present marks
   * the learner CONFIRMED with post-class feedback — so present-but-no-feedback
   * lowers the effective %.
   *
   * SAFETY (non-negotiable):
   *  - This is a READ-ONLY, recomputable derivation. It NEVER writes
   *    student_attendance.attendance_data or any official attendance figure.
   *  - It is GATED behind session_feedback.attendance_coupling_enabled, seeded
   *    FALSE. While OFF this method computes NOTHING (returns { enabled:false,
   *    rows:[] }) and the official attendance %/eligibility is entirely untouched.
   *  - It is deliberately NOT wired into generateReportData / calculateReportData
   *    (the official-% path). Enabling it and consuming the effective % on an
   *    eligibility surface requires legal/compliance sign-off first (spec R2).
   *
   * @param institutionId scope; omit for the caller's RLS-permitted scope.
   */
  static async getEffectiveAttendanceCoupling(
    from: string,
    to: string,
    scope?: {
      institutionId?: string | null;
      programId?: string | null;
      departmentId?: string | null;
      sectionId?: string | null;
    }
  ): Promise<EffectiveAttendanceCoupling> {
    // Fail-safe: any policy-read failure is treated as OFF (feature dark).
    let enabled = false;
    try {
      enabled = await getPolicyBool(
        POLICY_KEYS.SESSION_FEEDBACK_ATTENDANCE_COUPLING_ENABLED,
        false,
        scope?.institutionId ?? null
      );
    } catch (e) {
      logger.warn(
        'academic/attendance-consolidation',
        'attendance_coupling_enabled policy read failed; treating coupling as OFF',
        e
      );
      return { enabled: false, rows: [] };
    }

    if (!enabled) {
      return { enabled: false, rows: [] };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any).rpc(
      'fn_scf_effective_attendance',
      {
        p_from: from,
        p_to: to,
        p_institution_id: scope?.institutionId ?? null,
        p_program_id: scope?.programId ?? null,
        p_department_id: scope?.departmentId ?? null,
        p_section_id: scope?.sectionId ?? null,
      }
    );

    if (error) {
      logger.error(
        'academic/attendance-consolidation',
        'fn_scf_effective_attendance failed',
        error
      );
      // Fail-safe: never surface a partial/erroring effective % as authoritative.
      return { enabled: true, rows: [] };
    }

    return { enabled: true, rows: (data ?? []) as EffectiveAttendanceRow[] };
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

      // Calculate statistics based on the selected template (Added: 2026-07-04)
      // 'subjectwise' = Camu-style students x courses % (A/T) matrix;
      // anything else (incl. old rows without the key) = original summary.
      const reportData =
        params.template === 'subjectwise'
          ? await this.calculateSubjectwiseData(
              attendanceRecords,
              params,
              institutionId
            )
          : await this.calculateReportData(
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
      // Fixed: 2026-07-04 - Supabase errors are plain objects, not Error
      // instances; instanceof always fell through to "Unknown error" and
      // hid the real failure from the UI.
      await this.updateReport(reportId, {
        status: 'failed',
        errorMessage: getErrorMessage(error),
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
      // Fixed: 2026-07-04 - student_attendance has no FK to timetables, so the
      // former `timetable:timetables(attendance_mode)` embed made PostgREST
      // reject the whole query (PGRST200) and every report since 2026-06-11
      // failed. attendance_mode is now resolved in a separate batched query.
      // Also paginate: PostgREST caps responses at 1000 rows, which silently
      // truncated long date ranges.
      const PAGE_SIZE = 1000;
      const allRecords: any[] = [];

      for (let offset = 0; ; offset += PAGE_SIZE) {
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
        if (params.degrees && params.degrees.length > 0) {
          const validDegrees = params.degrees.filter(id => id && id.trim() !== '');
          if (validDegrees.length > 0) {
            query = query.in('degree_id', validDegrees);
          }
        }

        if (params.departments && params.departments.length > 0) {
          const validDepartments = params.departments.filter(id => id && id.trim() !== '');
          if (validDepartments.length > 0) {
            query = query.in('department_id', validDepartments);
          }
        }

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

        const { data, error } = await query
          .order('attendance_date', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
          logger.error('academic/attendance-consolidation', 'Failed to fetch attendance records', error);
          throw error;
        }

        allRecords.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
      }

      // Resolve attendance_mode for session_wise detection (no FK = no embed)
      const timetableIds = Array.from(
        new Set(allRecords.map((r) => r.timetable_id).filter(Boolean))
      );
      const modeByTimetableId = new Map<string, string | null>();
      for (let i = 0; i < timetableIds.length; i += 100) {
        const chunk = timetableIds.slice(i, i + 100);
        const { data: timetableRows, error: timetableError } = await this.supabase
          .from('timetables')
          .select('id, attendance_mode')
          .in('id', chunk);

        if (timetableError) {
          logger.error('academic/attendance-consolidation', 'Failed to fetch timetable attendance modes', timetableError);
          throw timetableError;
        }

        for (const row of timetableRows || []) {
          modeByTimetableId.set(row.id, row.attendance_mode);
        }
      }

      for (const record of allRecords) {
        record.timetable = record.timetable_id
          ? { attendance_mode: modeByTimetableId.get(record.timetable_id) ?? null }
          : null;
      }

      return allRecords;
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

    // Course scoping (Added: 2026-07-04) - course lives only inside the JSONB
    // period slots, so it is filtered here rather than in SQL.
    const courseFilter =
      params.courses && params.courses.length > 0
        ? new Set(params.courses.filter((id) => id && id.trim() !== ''))
        : null;

    // Process each attendance record
    for (const record of attendanceRecords) {
      const attendanceData = record.attendance_data || {};

      // Extract students from attendance_data (JSONB structure)
      // Each key in attendance_data represents a period_id with student attendance for that period
      const periodSlots = Object.values(attendanceData);

      for (const slot of periodSlots as any[]) {
        if (courseFilter && !courseFilter.has(slot.course_id)) continue;
        const students = slot.students || [];

        for (const student of students) {
          let groupKey: string;
          let groupName: string;
          let groupType = params.groupBy;

          // Determine group based on groupBy type
          switch (params.groupBy) {
            case 'department':
              groupKey = record.department?.id || 'unknown';
              groupName = record.department?.department_name || 'Unknown Department';
              break;
            case 'course':
              groupKey = slot.course_id || 'unknown';
              groupName = slot.course_name || 'Unknown Course';
              break;
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
              // Updated: 2026-06-10 - Per-date session tallies for session_wise
              // day-level full/half/absent derivation.
              isSessionWise: false,
              sessionDays: new Map<string, { present: number; total: number }>(),
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

          // Updated: 2026-06-10 - For session_wise (school day-wise) timetables,
          // tally per-date session presence so we can derive a full/half/absent
          // daily status (both present = full, one = half, none = absent).
          const recordSessionWise =
            (record.timetable as any)?.attendance_mode === 'session_wise';
          if (recordSessionWise) {
            studentData.isSessionWise = true;
            const date = record.attendance_date;
            const day =
              studentData.sessionDays.get(date) || { present: 0, total: 0 };
            day.total++;
            if (student.status === 'Present') day.present++;
            studentData.sessionDays.set(date, day);
          }

          // Track working days at group level
          group.dates.add(record.attendance_date);
        }
      }
    }

    // Day-wise (session_wise) attendance now lives in student_attendance too
    // (attendance_data keyed 'FN'/'AN'), so it is already counted by the loop
    // above — the per-date session tally branch derives full/half/absent. No
    // separate merge is needed.

    logger.info('academic/attendance-consolidation', 'Attendance records processed', {
      totalGroups: groups.size,
      totalRecords: attendanceRecords.length,
      note: 'Period-wise + day-wise attendance tracking enabled'
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
        let attendancePercentage =
          totalPeriods > 0
            ? (totalPresent / totalPeriods) * 100
            : 0;

        // Updated: 2026-06-10 - For session_wise students, classify each day as
        // full / half / absent and weight half as 0.5 of a day. This is robust
        // even when only one of the two sessions was recorded on a given day.
        let fullDays: number | undefined;
        let halfDays: number | undefined;
        let absentDays: number | undefined;
        if (studentData.isSessionWise && studentData.sessionDays.size > 0) {
          fullDays = 0;
          halfDays = 0;
          absentDays = 0;
          let weightedDays = 0;
          for (const [, day] of studentData.sessionDays as Map<
            string,
            { present: number; total: number }
          >) {
            const status = deriveDailyStatus({
              fnPresent: day.present >= 1,
              anPresent: day.present >= 2,
            });
            if (status === 'full') fullDays++;
            else if (status === 'half') halfDays++;
            else absentDays++;
            weightedDays += dailyStatusToDays(status);
          }
          const daysCounted = fullDays + halfDays + absentDays;
          attendancePercentage =
            daysCounted > 0 ? (weightedDays / daysCounted) * 100 : 0;
        }

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
          // Session_wise day-level breakdown (undefined for period_wise students)
          isSessionWise: studentData.isSessionWise || undefined,
          fullDays,
          halfDays,
          absentDays,
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
   * SUBJECTWISE (Camu-format) TEMPLATE — Added: 2026-07-04
   * Builds one matrix block per group (default: section): students as rows,
   * courses as columns, each cell = attended/marked period counts per course.
   * Mirrors the Camu "Attendance Summary Subjectwise %" report.
   */
  private static async calculateSubjectwiseData(
    attendanceRecords: any[],
    params: ConsolidationReportParams,
    institutionId: string
  ): Promise<ConsolidationReportData> {
    const courseFilter =
      params.courses && params.courses.length > 0
        ? new Set(params.courses.filter((id) => id && id.trim() !== ''))
        : null;

    // Matrix blocks make sense per department/semester/section only; anything
    // else falls back to the Camu default of one matrix per section.
    const groupBy = ['department', 'semester', 'section'].includes(params.groupBy)
      ? params.groupBy
      : 'section';

    const groups = new Map<string, any>();
    const allDates = new Set<string>();
    const allCourseIds = new Set<string>();
    const academicYearIds = new Set<string>();

    for (const record of attendanceRecords) {
      const periodSlots = Object.values(record.attendance_data || {});
      if (record.academic_year_id) academicYearIds.add(record.academic_year_id);

      let groupKey: string;
      let groupName: string;
      switch (groupBy) {
        case 'department':
          groupKey = record.department?.id || 'unknown';
          groupName = record.department?.department_name || 'Unknown Department';
          break;
        case 'semester':
          groupKey = record.semester?.id || 'unknown';
          groupName = record.semester?.semester_name || 'Unknown Semester';
          break;
        default:
          groupKey = record.section?.id || 'unknown';
          groupName = record.section?.section_name || 'Unknown Section';
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          groupId: groupKey,
          groupName,
          groupType: groupBy,
          students: new Map<string, any>(),
          // courseId -> periods marked for the course in this group (header "(T)")
          courseTotals: new Map<string, number>(),
          courseNames: new Map<string, string>(),
        });
      }
      const group = groups.get(groupKey);

      for (const slot of periodSlots as any[]) {
        if (courseFilter && !courseFilter.has(slot.course_id)) continue;
        const students = slot.students || [];
        if (students.length === 0) continue;

        // Legacy/manual slots without a course bucket under "General"
        const courseId = slot.course_id || 'general';
        allCourseIds.add(courseId);
        if (!group.courseNames.has(courseId)) {
          group.courseNames.set(courseId, slot.course_name || 'General');
        }
        group.courseTotals.set(
          courseId,
          (group.courseTotals.get(courseId) || 0) + 1
        );
        allDates.add(record.attendance_date);

        for (const student of students) {
          const studentId = student.student_id;
          if (!group.students.has(studentId)) {
            group.students.set(studentId, {
              studentId,
              studentName: studentId, // enriched below
              perCourse: new Map<string, { present: number; total: number }>(),
              overallPresent: 0,
              overallTotal: 0,
            });
          }
          const row = group.students.get(studentId);
          const cell = row.perCourse.get(courseId) || { present: 0, total: 0 };
          // Same semantics as the summary template: Present = attended,
          // Absent = marked but missed, OnDuty excluded from both A and T.
          if (student.status === 'Present') {
            cell.present++;
            cell.total++;
            row.overallPresent++;
            row.overallTotal++;
          } else if (student.status === 'Absent') {
            cell.total++;
            row.overallTotal++;
          }
          row.perCourse.set(courseId, cell);
        }
      }
    }

    // Drop groups that ended up empty after course filtering
    for (const [key, group] of groups) {
      if (group.students.size === 0) groups.delete(key);
    }

    // Names / roll numbers / hierarchy via the shared learner lookup
    await this.enrichStudentData(groups, institutionId);

    // Resolve course codes (the Camu column headers) — codes are not in the JSONB
    const courseLookup = new Map<
      string,
      { course_code: string; course_name: string }
    >();
    const courseIdList = Array.from(allCourseIds).filter((id) => id !== 'general');
    for (let i = 0; i < courseIdList.length; i += 100) {
      const chunk = courseIdList.slice(i, i + 100);
      const { data: courseRows, error: courseError } = await this.supabase
        .from('courses')
        .select('id, course_code, course_name')
        .in('id', chunk);
      if (courseError) {
        logger.error('academic/attendance-consolidation', 'Failed to fetch course codes', courseError);
        throw courseError;
      }
      for (const c of courseRows || []) {
        courseLookup.set(c.id, {
          course_code: c.course_code,
          course_name: c.course_name,
        });
      }
    }

    // Academic year name(s) for the report header line
    let academicYearName: string | undefined;
    if (academicYearIds.size > 0) {
      const { data: ayRows, error: ayError } = await this.supabase
        .from('academic_years')
        .select('id, academic_year_name')
        .in('id', Array.from(academicYearIds).slice(0, 100));
      if (ayError) {
        logger.error('academic/attendance-consolidation', 'Failed to fetch academic years', ayError);
      }
      academicYearName =
        (ayRows || [])
          .map((ay) => (ay.academic_year_name || '').trim())
          .filter(Boolean)
          .join(', ') || undefined;
    }

    // Build the final SubjectwiseGroup[] payload + overall summary numbers
    const subjectwiseGroups: SubjectwiseGroup[] = [];
    let totalPresentOverall = 0;
    let totalAbsentOverall = 0;
    const distinctStudents = new Set<string>();

    for (const [, group] of groups) {
      const courses: SubjectwiseCourseColumn[] = Array.from(
        group.courseTotals.entries() as Iterable<[string, number]>
      )
        .map(([courseId, totalPeriods]) => ({
          courseId,
          courseCode:
            courseLookup.get(courseId)?.course_code ||
            (courseId === 'general' ? 'GEN' : courseId.slice(0, 8)),
          courseName:
            courseLookup.get(courseId)?.course_name ||
            group.courseNames.get(courseId) ||
            'General',
          totalPeriods,
        }))
        .sort((a, b) =>
          a.courseCode.localeCompare(b.courseCode, undefined, { numeric: true })
        );

      const students: SubjectwiseStudentRow[] = [];
      let firstStudent: any = null;
      for (const [, row] of group.students) {
        if (!firstStudent) firstStudent = row;
        distinctStudents.add(row.studentId);
        totalPresentOverall += row.overallPresent;
        totalAbsentOverall += row.overallTotal - row.overallPresent;
        students.push({
          studentId: row.studentId,
          studentName: row.studentName,
          rollNumber: row.rollNumber,
          perCourse: Object.fromEntries(row.perCourse),
          overallPresent: row.overallPresent,
          overallTotal: row.overallTotal,
        });
      }
      students.sort((a, b) =>
        (a.rollNumber || a.studentName || '').localeCompare(
          b.rollNumber || b.studentName || '',
          undefined,
          { numeric: true }
        )
      );

      subjectwiseGroups.push({
        groupId: group.groupId,
        groupName: group.groupName,
        groupType: group.groupType,
        degreeName: firstStudent?.degreeName,
        departmentName: firstStudent?.departmentName,
        programName: firstStudent?.programName,
        semesterName: firstStudent?.semesterName,
        sectionName:
          group.groupType === 'section'
            ? group.groupName
            : firstStudent?.sectionName,
        academicYearName,
        courses,
        students,
      });
    }

    subjectwiseGroups.sort((a, b) => a.groupName.localeCompare(b.groupName));

    const totalPeriodsOverall = totalPresentOverall + totalAbsentOverall;
    const summary: ReportSummary = {
      totalStudents: distinctStudents.size,
      totalWorkingDays: allDates.size,
      averageAttendance:
        totalPeriodsOverall > 0
          ? Math.round(((totalPresentOverall / totalPeriodsOverall) * 100) * 100) / 100
          : 0,
      totalPresent: totalPresentOverall,
      totalAbsent: totalAbsentOverall,
      dateRange: { from: params.dateFrom, to: params.dateTo },
    };

    return { summary, groups: [], subjectwiseGroups };
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
