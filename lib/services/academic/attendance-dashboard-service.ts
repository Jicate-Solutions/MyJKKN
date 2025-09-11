import { createClientSupabaseClient } from '@/lib/supabase/client';
import { cache } from 'react';
import type {
  AttendanceStats,
  PendingAttendancePeriod,
  PendingAttendanceResponse,
  DashboardFilters,
  AttendanceTrendData
} from '@/types/attendance-dashboard';

export class AttendanceDashboardService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get today's attendance statistics with hierarchical structure
   * Supports institution filtering for super admins
   */
  static getTodayAttendanceStats = cache(
    async (userInstitutionId?: string): Promise<AttendanceStats[]> => {
      try {
        const today = new Date().toISOString().split('T')[0];

        // Build the query for getting attendance data
        let query = this.supabase
          .from('student_attendance')
          .select(`
            institution_id,
            timetable_id,
            section_id,
            attendance_data,
            academic_year_id,
            degree_id,
            program_id,
            department_id,
            semester_id
          `)
          .eq('attendance_date', today);

        // Apply institution filter if provided
        if (userInstitutionId) {
          query = query.eq('institution_id', userInstitutionId);
        }

        const { data: attendanceData, error } = await query;

        if (error) {
          console.error('Error fetching attendance data:', error);
          throw error;
        }

        if (!attendanceData || attendanceData.length === 0) {
          return [];
        }

        // Get related data in separate queries
        const institutionIds = [...new Set(attendanceData.map(r => r.institution_id))];
        const departmentIds = [...new Set(attendanceData.map(r => r.department_id))];
        const semesterIds = [...new Set(attendanceData.map(r => r.semester_id))];
        const sectionIds = [...new Set(attendanceData.map(r => r.section_id))];

        // Fetch institutions
        const { data: institutions } = await this.supabase
          .from('institutions')
          .select('id, name')
          .in('id', institutionIds);

        // Fetch departments
        const { data: departments } = await this.supabase
          .from('departments')
          .select('id, department_name')
          .in('id', departmentIds);

        // Fetch semesters
        const { data: semesters } = await this.supabase
          .from('semesters')
          .select('id, semester_name')
          .in('id', semesterIds);

        // Fetch sections
        const { data: sections } = await this.supabase
          .from('sections')
          .select('id, section_name')
          .in('id', sectionIds);

        // Get student counts for each section - with proper validation
        let studentsData: any[] = [];
        if (sectionIds.length > 0) {
          // Filter out any null/undefined values and ensure valid UUIDs
          const validSectionIds = sectionIds.filter(id => 
            id && 
            typeof id === 'string' && 
            id.length > 0 &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
          );
          
          if (validSectionIds.length > 0) {
            console.log('Valid section IDs for student query:', validSectionIds);
            const { data: studentQueryResult, error: studentError } = await this.supabase
              .from('students')
              .select('section_id')
              .in('section_id', validSectionIds)
              .eq('is_active', true);
              
            if (studentError) {
              console.error('Error fetching students:', studentError);
            } else {
              studentsData = studentQueryResult || [];
            }
          }
        }

        // Create lookup maps
        const institutionMap = institutions?.reduce((acc, inst) => {
          acc[inst.id] = inst;
          return acc;
        }, {} as Record<string, any>) || {};

        const departmentMap = departments?.reduce((acc, dept) => {
          acc[dept.id] = dept;
          return acc;
        }, {} as Record<string, any>) || {};

        const semesterMap = semesters?.reduce((acc, sem) => {
          acc[sem.id] = sem;
          return acc;
        }, {} as Record<string, any>) || {};

        const sectionMap = sections?.reduce((acc, sec) => {
          acc[sec.id] = sec;
          return acc;
        }, {} as Record<string, any>) || {};

        // Count students per section
        const studentCounts = studentsData?.reduce((acc, student) => {
          acc[student.section_id] = (acc[student.section_id] || 0) + 1;
          return acc;
        }, {} as Record<string, number>) || {};

        // Process and aggregate the data
        const institutionStats = new Map<string, any>();

        attendanceData.forEach((record) => {
          const institutionId = record.institution_id;
          const departmentId = record.department_id;
          const semesterId = record.semester_id;
          const sectionId = record.section_id;

          // Initialize institution if not exists
          if (!institutionStats.has(institutionId)) {
            institutionStats.set(institutionId, {
              institution_id: institutionId,
              institution_name: institutionMap[institutionId]?.name || 'Unknown Institution',
              total_students: 0,
              total_present: 0,
              total_absent: 0,
              attendance_percentage: 0,
              departments: new Map()
            });
          }

          const institution = institutionStats.get(institutionId);

          // Initialize department if not exists
          if (!institution.departments.has(departmentId)) {
            institution.departments.set(departmentId, {
              department_id: departmentId,
              department_name: departmentMap[departmentId]?.department_name || 'Unknown Department',
              total_students: 0,
              total_present: 0,
              total_absent: 0,
              attendance_percentage: 0,
              semesters: new Map()
            });
          }

          const department = institution.departments.get(departmentId);

          // Initialize semester if not exists
          if (!department.semesters.has(semesterId)) {
            department.semesters.set(semesterId, {
              semester_id: semesterId,
              semester_name: semesterMap[semesterId]?.semester_name || 'Unknown Semester',
              total_students: 0,
              total_present: 0,
              total_absent: 0,
              attendance_percentage: 0,
              sections: new Map()
            });
          }

          const semester = department.semesters.get(semesterId);

          // Process attendance data for this section
          const attendanceData = record.attendance_data as any;
          const sectionStudentCount = studentCounts[sectionId] || 0;

          let sectionPresent = 0;
          let sectionAbsent = 0;
          let periodCount = 0;

          if (attendanceData && typeof attendanceData === 'object') {
            // Count attendance for each period
            Object.values(attendanceData).forEach((periodData: any) => {
              if (
                periodData &&
                periodData.students &&
                Array.isArray(periodData.students)
              ) {
                periodCount++;
                periodData.students.forEach((student: any) => {
                  if (student.status === 'Present') {
                    sectionPresent++;
                  } else if (student.status === 'Absent') {
                    sectionAbsent++;
                  }
                });
              }
            });
          }

          // Average attendance across periods if multiple periods
          if (periodCount > 1) {
            sectionPresent = Math.round(sectionPresent / periodCount);
            sectionAbsent = Math.round(sectionAbsent / periodCount);
          }

          const sectionPercentage =
            sectionStudentCount > 0
              ? Math.round((sectionPresent / sectionStudentCount) * 100)
              : 0;

          // Update or add section
          semester.sections.set(sectionId, {
            section_id: sectionId,
            section_name: sectionMap[sectionId]?.section_name || 'Unknown Section',
            total_students: sectionStudentCount,
            present: sectionPresent,
            absent: sectionAbsent,
            percentage: sectionPercentage
          });

          // Update aggregates up the hierarchy
          semester.total_students += sectionStudentCount;
          semester.total_present += sectionPresent;
          semester.total_absent += sectionAbsent;

          department.total_students += sectionStudentCount;
          department.total_present += sectionPresent;
          department.total_absent += sectionAbsent;

          institution.total_students += sectionStudentCount;
          institution.total_present += sectionPresent;
          institution.total_absent += sectionAbsent;
        });

        // Calculate percentages and convert Maps to arrays
        const result: AttendanceStats[] = [];

        institutionStats.forEach((institution) => {
          institution.attendance_percentage =
            institution.total_students > 0
              ? Math.round(
                  (institution.total_present / institution.total_students) * 100
                )
              : 0;

          const departments: any[] = [];
          institution.departments.forEach((department: any) => {
            department.attendance_percentage =
              department.total_students > 0
                ? Math.round(
                    (department.total_present / department.total_students) * 100
                  )
                : 0;

            const semesters: any[] = [];
            department.semesters.forEach((semester: any) => {
              semester.attendance_percentage =
                semester.total_students > 0
                  ? Math.round(
                      (semester.total_present / semester.total_students) * 100
                    )
                  : 0;

              semester.sections = Array.from(semester.sections.values());
              semesters.push(semester);
            });

            department.semesters = semesters;
            departments.push(department);
          });

          institution.departments = departments;
          result.push(institution);
        });

        return result;
      } catch (error) {
        console.error('Error in getTodayAttendanceStats:', error);
        throw error;
      }
    }
  );

  /**
   * Get today's pending attendance periods
   * Returns periods that should have been marked but haven't been
   */
  static async getTodayPendingAttendance(
    filters: DashboardFilters = {}
  ): Promise<PendingAttendanceResponse> {
    try {
      const {
        userInstitutionId,
        page = 1,
        limit = 10,
        sortBy = 'period_name',
        sortDirection = 'asc',
        search = '',
        departmentId,
        semesterId,
        sectionId
      } = filters;

      const today = new Date().toISOString().split('T')[0];
      const dayOfWeek = new Date()
        .toLocaleDateString('en-US', { weekday: 'long' })
        .toUpperCase();
      const offset = (page - 1) * limit;

      // Step 1: Find all scheduled periods for today
      let scheduledQuery = this.supabase
        .from('timetables')
        .select(`
          id,
          institution_id,
          department_id,
          semester_id,
          section_id,
          timetable_data,
          periods
        `)
        .eq('is_active', true)
        .lte('start_date', today)
        .gte('end_date', today);

      // Apply filters
      if (userInstitutionId) {
        scheduledQuery = scheduledQuery.eq('institution_id', userInstitutionId);
      }
      if (departmentId) {
        scheduledQuery = scheduledQuery.eq('department_id', departmentId);
      }
      if (semesterId) {
        scheduledQuery = scheduledQuery.eq('semester_id', semesterId);
      }
      if (sectionId) {
        scheduledQuery = scheduledQuery.eq('section_id', sectionId);
      }

      const { data: scheduledTimetables, error: scheduledError } =
        await scheduledQuery;

      if (scheduledError) {
        console.error('Error fetching scheduled timetables:', scheduledError);
        throw scheduledError;
      }

      // Get related data for display names
      const timetableIds = scheduledTimetables?.map(t => t.id) || [];
      const institutionIds = [...new Set(scheduledTimetables?.map(t => t.institution_id) || [])];
      const departmentIds = [...new Set(scheduledTimetables?.map(t => t.department_id) || [])];
      const semesterIds = [...new Set(scheduledTimetables?.map(t => t.semester_id) || [])];
      const sectionIds = [...new Set(scheduledTimetables?.map(t => t.section_id) || [])];

      // Fetch lookup data
      const [institutionsData, departmentsData, semestersData, sectionsData] = await Promise.all([
        this.supabase.from('institutions').select('id, name').in('id', institutionIds),
        this.supabase.from('departments').select('id, department_name').in('id', departmentIds),
        this.supabase.from('semesters').select('id, semester_name').in('id', semesterIds),
        this.supabase.from('sections').select('id, section_name').in('id', sectionIds)
      ]);

      // Create lookup maps
      const institutionLookup = institutionsData.data?.reduce((acc, inst) => {
        acc[inst.id] = inst;
        return acc;
      }, {} as Record<string, any>) || {};

      const departmentLookup = departmentsData.data?.reduce((acc, dept) => {
        acc[dept.id] = dept;
        return acc;
      }, {} as Record<string, any>) || {};

      const semesterLookup = semestersData.data?.reduce((acc, sem) => {
        acc[sem.id] = sem;
        return acc;
      }, {} as Record<string, any>) || {};

      const sectionLookup = sectionsData.data?.reduce((acc, sec) => {
        acc[sec.id] = sec;
        return acc;
      }, {} as Record<string, any>) || {};

      // Step 2: Extract all scheduled periods for today
      const scheduledPeriods = new Set<string>();
      const periodDetails = new Map<string, any>();

      scheduledTimetables?.forEach((timetable) => {
        const timetableData = timetable.timetable_data as any;
        const periods = timetable.periods as any;

        if (
          timetableData &&
          timetableData[dayOfWeek] &&
          Array.isArray(timetableData[dayOfWeek])
        ) {
          timetableData[dayOfWeek].forEach((slot: any) => {
            if (slot && slot.period_id) {
              const periodKey = `${timetable.id}_${slot.period_id}`;
              scheduledPeriods.add(periodKey);

              // Find period details from periods array
              const periodInfo = Array.isArray(periods)
                ? periods.find((p: any) => p.id === slot.period_id)
                : null;

              periodDetails.set(periodKey, {
                timetable_id: timetable.id,
                section_id: timetable.section_id,
                period_id: slot.period_id,
                period_name: periodInfo
                  ? `${periodInfo.period_name} (${periodInfo.start_time} - ${periodInfo.end_time})`
                  : 'Unknown Period',
                start_time: periodInfo?.start_time || '',
                end_time: periodInfo?.end_time || '',
                course_name: slot.course?.course_name || 'Unknown Course',
                faculty_name:
                  slot.staff?.full_name ||
                  slot.staff?.first_name + ' ' + slot.staff?.last_name ||
                  'Unknown Faculty',
                institution_name: institutionLookup[timetable.institution_id]?.name || 'Unknown Institution',
                department_name: departmentLookup[timetable.department_id]?.department_name || 'Unknown Department',
                semester_name: semesterLookup[timetable.semester_id]?.semester_name || 'Unknown Semester',
                section_name: sectionLookup[timetable.section_id]?.section_name || 'Unknown Section'
              });
            }
          });
        }
      });

      // Step 3: Find all marked periods for today
      let markedQuery = this.supabase
        .from('student_attendance')
        .select('timetable_id, attendance_data')
        .eq('attendance_date', today);

      if (userInstitutionId) {
        markedQuery = markedQuery.eq('institution_id', userInstitutionId);
      }

      const { data: markedAttendance, error: markedError } = await markedQuery;

      if (markedError) {
        console.error('Error fetching marked attendance:', markedError);
        throw markedError;
      }

      const markedPeriods = new Set<string>();
      markedAttendance?.forEach((record) => {
        const attendanceData = record.attendance_data as any;
        if (attendanceData && typeof attendanceData === 'object') {
          Object.keys(attendanceData).forEach((periodId) => {
            const periodKey = `${record.timetable_id}_${periodId}`;
            markedPeriods.add(periodKey);
          });
        }
      });

      // Step 4: Find pending periods (scheduled but not marked)
      const pendingPeriods: PendingAttendancePeriod[] = [];

      scheduledPeriods.forEach((periodKey) => {
        if (!markedPeriods.has(periodKey)) {
          const details = periodDetails.get(periodKey);
          if (details) {
            // Apply search filter if provided
            if (search) {
              const searchLower = search.toLowerCase();
              const searchableText = [
                details.institution_name,
                details.department_name,
                details.semester_name,
                details.section_name,
                details.period_name,
                details.course_name,
                details.faculty_name
              ]
                .join(' ')
                .toLowerCase();

              if (searchableText.includes(searchLower)) {
                pendingPeriods.push(details);
              }
            } else {
              pendingPeriods.push(details);
            }
          }
        }
      });

      // Step 5: Apply sorting and pagination
      const sortedPeriods = pendingPeriods.sort((a, b) => {
        let comparison = 0;

        switch (sortBy) {
          case 'institution_name':
            comparison = a.institution_name.localeCompare(b.institution_name);
            break;
          case 'department_name':
            comparison = a.department_name.localeCompare(b.department_name);
            break;
          case 'semester_name':
            comparison = a.semester_name.localeCompare(b.semester_name);
            break;
          case 'section_name':
            comparison = a.section_name.localeCompare(b.section_name);
            break;
          case 'course_name':
            comparison = a.course_name.localeCompare(b.course_name);
            break;
          case 'faculty_name':
            comparison = a.faculty_name.localeCompare(b.faculty_name);
            break;
          case 'start_time':
            comparison = a.start_time.localeCompare(b.start_time);
            break;
          default: // period_name
            comparison = a.period_name.localeCompare(b.period_name);
        }

        return sortDirection === 'desc' ? -comparison : comparison;
      });

      const totalCount = sortedPeriods.length;
      const paginatedPeriods = sortedPeriods.slice(offset, offset + limit);

      return {
        data: paginatedPeriods,
        metadata: {
          total: totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit)
        }
      };
    } catch (error) {
      console.error('Error in getTodayPendingAttendance:', error);
      throw error;
    }
  }

  /**
   * Get attendance summary for a date range
   * Useful for trend analysis
   */
  static async getAttendanceTrend(
    institutionId: string,
    days: number = 7
  ): Promise<AttendanceTrendData[]> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days + 1);

      const dates = [];
      for (
        let d = new Date(startDate);
        d <= endDate;
        d.setDate(d.getDate() + 1)
      ) {
        dates.push(d.toISOString().split('T')[0]);
      }

      const { data: attendanceData, error } = await this.supabase
        .from('student_attendance')
        .select('attendance_date, attendance_data')
        .eq('institution_id', institutionId)
        .in('attendance_date', dates)
        .order('attendance_date');

      if (error) throw error;

      // Calculate daily percentages
      const dailyStats = dates.map((date) => {
        const dayRecords =
          attendanceData?.filter((record) => record.attendance_date === date) ||
          [];

        let totalPresent = 0;
        let totalStudents = 0;

        dayRecords.forEach((record) => {
          const attendanceData = record.attendance_data as any;
          if (attendanceData && typeof attendanceData === 'object') {
            Object.values(attendanceData).forEach((periodData: any) => {
              if (
                periodData &&
                periodData.students &&
                Array.isArray(periodData.students)
              ) {
                periodData.students.forEach((student: any) => {
                  totalStudents++;
                  if (student.status === 'Present') {
                    totalPresent++;
                  }
                });
              }
            });
          }
        });

        const percentage =
          totalStudents > 0
            ? Math.round((totalPresent / totalStudents) * 100)
            : 0;

        return {
          date,
          percentage
        };
      });

      return dailyStats;
    } catch (error) {
      console.error('Error in getAttendanceTrend:', error);
      throw error;
    }
  }
}