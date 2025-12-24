import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export interface AttendanceReportFilters {
  institution_id?: string;
  academic_year_id?: string;
  department_id?: string;
  program_id?: string;
  degree_id?: string;
  semester_id?: string;
  section_id?: string;
  faculty_id?: string;
  course_id?: string;
  date_range?: {
    from: string;
    to: string;
  };
  attendance_status?: 'all' | 'completed' | 'pending';
  attendance_threshold?: number;
}

export interface AttendanceReport {
  id: string;
  attendance_date: string;
  institution_id: string;
  institution_name?: string;
  department_id?: string;
  department_name?: string;
  program_id?: string;
  program_name?: string;
  degree_id?: string;
  degree_name?: string;
  semester_id?: string;
  semester_name?: string;
  section_id: string;
  section_name?: string;
  timetable_id: string;
  periods_count: number;
  total_students: number;
  average_attendance: number;
  faculty_details: any[];
  courses: any[];
  created_at: string;
  updated_at: string;
}

export interface AttendanceStatistics {
  totalClasses: number;
  averageAttendance: number;
  totalStudents: number;
  totalFaculty: number;
  presentToday: number;
  absentToday: number;
  todayClasses: number;
  todayAttendanceRate: number;
  weeklyComparison: number;
  attendanceTrend: any[];
  departmentComparison: any[];
  lowAttendanceAlerts: any[];
  todayPeriods: number;
  todayTotalCapacity: number;
}

export class AttendanceReportService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get attendance reports with role-based filtering
   */
  static async getAttendanceReports(
    filters: AttendanceReportFilters,
    userRole: 'super_admin' | 'admin' | 'faculty' | 'hod',
    userId?: string,
    page: number = 1,
    limit: number = 50
  ) {
    try {
      // Store staff ID for faculty filtering
      let staffId: string | null = null;

      // Apply role-based filtering
      if ((userRole === 'faculty' || userRole === 'hod') && userId) {
        // First check if user has super admin access or admin role
        const { data: profileData } = await this.supabase
          .from('profiles')
          .select('role, is_super_admin, department_id')
          .eq('id', userId)
          .single() as { data: { role: string; is_super_admin: boolean; department_id: string } | null };

        // Allow full access if user is super admin or admin
        if (profileData?.is_super_admin || profileData?.role === 'admin') {
          // Super admin or admin - full access
        } else if (profileData?.role === 'hod') {
          // HOD users see all attendance reports from their department
          if (profileData.department_id) {
            // Add department filter for HOD users
            filters.department_id = profileData.department_id;
          } else {
            logger.warn('academic/attendance-reports', 'HOD user has no department_id assigned', { userId });
            return { data: [], count: 0, error: 'Department not assigned to HOD user' };
          }
        } else {
          // For regular faculty, get staff record for filtering
          const { data: staffData } = await this.supabase
            .from('staff')
            .select('id')
            .eq('profile_id', userId)
            .single() as { data: { id: string } | null };

          if (!staffData) {
            logger.error('academic/attendance-reports', 'Staff record not found for faculty user', { userId });
            // Return empty result for faculty without staff record
            return { data: [], count: 0, error: 'Staff record not found' };
          }

          staffId = staffData.id;

          // Use RPC function for faculty filtering - much more efficient
          return await this.getFacultyAttendanceReports(
            staffId!,
            filters,
            page,
            limit
          );
        }
      }

      // Build query for non-faculty users - start with basic fields
      let query = this.supabase
        .from('student_attendance')
        .select('*', { count: 'exact' });

      // Apply filters using direct foreign key columns
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }
      if (filters.academic_year_id) {
        query = query.eq('academic_year_id', filters.academic_year_id);
      }
      if (filters.degree_id) {
        query = query.eq('degree_id', filters.degree_id);
      }
      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }
      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }
      if (filters.semester_id) {
        query = query.eq('semester_id', filters.semester_id);
      }
      // Updated: 2025-10-08 - Section filtering handled differently based on timetable type
      // For now, we filter by root section_id at SQL level
      // Semester-level records with multiple sections will be filtered post-query
      if (filters.section_id) {
        query = query.eq('section_id', filters.section_id);
      }
      if (filters.date_range) {
        query = query
          .gte('attendance_date', filters.date_range.from)
          .lte('attendance_date', filters.date_range.to);
      }

      // Apply pagination for non-faculty users
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      // Order by date desc
      query = query.order('attendance_date', { ascending: false });

      const { data, error, count } = await query;

      if (error) {
        logger.error('academic/attendance-reports', 'Error fetching reports', error);
        return { data: [], count: 0, error: error.message };
      }

      // Fetch related data in batch for better performance
      const sectionIds = [
        ...new Set(data?.map((r: any) => r.section_id).filter(Boolean) || [])
      ];
      const semesterIds = [
        ...new Set(data?.map((r: any) => r.semester_id).filter(Boolean) || [])
      ];
      const programIds = [
        ...new Set(data?.map((r: any) => r.program_id).filter(Boolean) || [])
      ];
      const departmentIds = [
        ...new Set(data?.map((r: any) => r.department_id).filter(Boolean) || [])
      ];
      const degreeIds = [
        ...new Set(data?.map((r: any) => r.degree_id).filter(Boolean) || [])
      ];
      const institutionIds = [
        ...new Set(data?.map((r: any) => r.institution_id).filter(Boolean) || [])
      ];

      // Fetch all related data in parallel
      const [
        sections,
        semesters,
        programs,
        departments,
        degrees,
        institutions
      ] = await Promise.all([
        sectionIds.length > 0
          ? this.supabase
              .from('sections')
              .select('id, section_name')
              .in('id', sectionIds)
          : Promise.resolve({ data: [] as Array<{ id: string; section_name: string }> }),
        semesterIds.length > 0
          ? this.supabase
              .from('semesters')
              .select('id, semester_name')
              .in('id', semesterIds)
          : Promise.resolve({ data: [] as Array<{ id: string; semester_name: string }> }),
        programIds.length > 0
          ? this.supabase
              .from('programs')
              .select('id, program_name')
              .in('id', programIds)
          : Promise.resolve({ data: [] as Array<{ id: string; program_name: string }> }),
        departmentIds.length > 0
          ? this.supabase
              .from('departments')
              .select('id, department_name')
              .in('id', departmentIds)
          : Promise.resolve({ data: [] as Array<{ id: string; department_name: string }> }),
        degreeIds.length > 0
          ? this.supabase
              .from('degrees')
              .select('id, degree_name')
              .in('id', degreeIds)
          : Promise.resolve({ data: [] as Array<{ id: string; degree_name: string }> }),
        institutionIds.length > 0
          ? this.supabase
              .from('institutions')
              .select('id, name')
              .in('id', institutionIds)
          : Promise.resolve({ data: [] as Array<{ id: string; name: string }> })
      ]);

      // Create lookup maps
      const sectionMap = new Map(
        (sections.data || []).map((s: any) => [s.id, s.section_name])
      );
      const semesterMap = new Map(
        (semesters.data || []).map((s: any) => [s.id, s.semester_name])
      );
      const programMap = new Map(
        (programs.data || []).map((p: any) => [p.id, p.program_name])
      );
      const departmentMap = new Map(
        (departments.data || []).map((d: any) => [d.id, d.department_name])
      );
      const degreeMap = new Map(
        (degrees.data || []).map((d: any) => [d.id, d.degree_name])
      );
      const institutionMap = new Map(
        (institutions.data || []).map((i: any) => [i.id, i.name])
      );

      // Process data with related information
      const processedReports: AttendanceReport[] = (data || []).map(
        (record: any) => {
          const attendanceData = record.attendance_data as any;
          // Convert object to array of periods (attendance_data is an object with timetable_slot_id as keys)
          const periods = attendanceData ? Object.values(attendanceData) : [];

          let totalStudents = 0;
          let totalPresent = 0;
          const facultyMap = new Map();
          const coursesMap = new Map();

          periods.forEach((period: any) => {
            // Count students and attendance
            if (period.students && Array.isArray(period.students)) {
              const students = period.students;
              totalStudents = Math.max(totalStudents, students.length);
              // Check for 'status' field which contains 'Present' or 'Absent'
              totalPresent += students.filter(
                (s: any) => s.status === 'Present'
              ).length;
            }

            // Collect faculty
            if (period.assigned_faculty) {
              const faculty = period.assigned_faculty;
              if (Array.isArray(faculty)) {
                faculty.forEach((f: any) => {
                  facultyMap.set(f.faculty_id, {
                    faculty_id: f.faculty_id,
                    faculty_name: f.faculty_name,
                    faculty_email: f.faculty_email,
                    is_primary: f.is_primary
                  });
                });
              } else {
                facultyMap.set(faculty.faculty_id, {
                  faculty_id: faculty.faculty_id,
                  faculty_name: faculty.faculty_name,
                  faculty_email: faculty.faculty_email,
                  is_primary: true
                });
              }
            }

            // Collect courses
            if (period.course_id && period.course_name) {
              coursesMap.set(period.course_id, {
                course_id: period.course_id,
                course_name: period.course_name,
                course_code: period.course_code
              });
            }
          });

          const avgAttendance =
            totalStudents > 0 && periods.length > 0
              ? (totalPresent / (periods.length * totalStudents)) * 100
              : 0;

          // Map related data from lookup maps
          return {
            id: record.id,
            attendance_date: record.attendance_date,
            institution_id: record.institution_id,
            institution_name: institutionMap.get(record.institution_id),
            department_id: record.department_id,
            department_name: departmentMap.get(record.department_id),
            program_id: record.program_id,
            program_name: programMap.get(record.program_id),
            degree_id: record.degree_id,
            degree_name: degreeMap.get(record.degree_id),
            semester_id: record.semester_id,
            semester_name: semesterMap.get(record.semester_id),
            section_id: record.section_id,
            section_name: sectionMap.get(record.section_id)
              ? `Section ${sectionMap.get(record.section_id)}`
              : undefined,
            timetable_id: record.timetable_id,
            periods_count: periods.length,
            total_students: totalStudents,
            average_attendance: Math.round(avgAttendance * 100) / 100,
            faculty_details: Array.from(facultyMap.values()),
            courses: Array.from(coursesMap.values()),
            created_at: record.created_at,
            updated_at: record.updated_at
          };
        }
      );

      // No client-side filtering needed - faculty uses RPC function

      return {
        data: processedReports,
        count: count || 0, // Use database count since filtering is done at SQL level
        error: null
      };
    } catch (error) {
      logger.error('academic/attendance-reports', 'Error in getAttendanceReports', error);
      return { data: [], count: 0, error: 'Failed to fetch reports' };
    }
  }

  /**
   * Get attendance reports for faculty using RPC function (scalable for large datasets)
   */
  static async getFacultyAttendanceReports(
    staffId: string,
    filters: AttendanceReportFilters,
    page: number = 1,
    limit: number = 50
  ) {
    try {
      // Calculate offset for pagination
      const offset = (page - 1) * limit;

      // Call the RPC function with all filters
      const { data: rpcData, error } = await (this.supabase as any).rpc(
        'get_faculty_attendance_reports',
        {
          faculty_staff_id: staffId,
          filter_institution_id: filters.institution_id || null,
          filter_academic_year_id: filters.academic_year_id || null,
          filter_degree_id: filters.degree_id || null,
          filter_department_id: filters.department_id || null,
          filter_program_id: filters.program_id || null,
          filter_semester_id: filters.semester_id || null,
          filter_section_id: filters.section_id || null,
          filter_date_from: filters.date_range?.from || null,
          filter_date_to: filters.date_range?.to || null,
          page_offset: offset,
          page_limit: limit
        }
      );

      if (error) {
        logger.error('academic/attendance-reports', 'Error in faculty RPC call', error);
        return { data: [], count: 0, error: error.message };
      }

      if (!rpcData || rpcData.length === 0) {
        return { data: [], count: 0, error: null };
      }

      // Get total count from first record (all records have same total_count)
      const totalCount = rpcData[0]?.total_count || 0;

      // Process the data similar to regular processing but without client-side filtering
      const processedReports = await this.processAttendanceReports(rpcData);

      return {
        data: processedReports,
        count: parseInt(totalCount),
        error: null
      };
    } catch (error) {
      logger.error('academic/attendance-reports', 'Error in getFacultyAttendanceReports', error);
      return { data: [], count: 0, error: 'Failed to fetch faculty reports' };
    }
  }

  /**
   * Process raw attendance records into report format
   */
  static async processAttendanceReports(data: any[]) {
    // Get unique IDs for lookup data
    const sectionIds = [
      ...new Set(data.map((r) => r.section_id).filter(Boolean))
    ];
    const semesterIds = [
      ...new Set(data.map((r) => r.semester_id).filter(Boolean))
    ];
    const programIds = [
      ...new Set(data.map((r) => r.program_id).filter(Boolean))
    ];
    const departmentIds = [
      ...new Set(data.map((r) => r.department_id).filter(Boolean))
    ];
    const degreeIds = [
      ...new Set(data.map((r) => r.degree_id).filter(Boolean))
    ];
    const institutionIds = [
      ...new Set(data.map((r) => r.institution_id).filter(Boolean))
    ];

    // Fetch all related data in parallel - with error handling for empty arrays
    const [sections, semesters, programs, departments, degrees, institutions] =
      await Promise.all([
        sectionIds.length > 0
          ? this.supabase
              .from('sections')
              .select('id, section_name')
              .in('id', sectionIds)
              .then((result) => {
                if (result.error)
                  logger.error('academic/attendance-reports', 'Error fetching sections', result.error);
                return result;
              })
          : Promise.resolve({ data: [] as Array<{ id: string; section_name: string }> }),
        semesterIds.length > 0
          ? this.supabase
              .from('semesters')
              .select('id, semester_name')
              .in('id', semesterIds)
              .then((result) => {
                if (result.error)
                  logger.error('academic/attendance-reports', 'Error fetching semesters', result.error);
                return result;
              })
          : Promise.resolve({ data: [] as Array<{ id: string; semester_name: string }> }),
        programIds.length > 0
          ? this.supabase
              .from('programs')
              .select('id, program_name')
              .in('id', programIds)
              .then((result) => {
                if (result.error)
                  logger.error('academic/attendance-reports', 'Error fetching programs', result.error);
                return result;
              })
          : Promise.resolve({ data: [] as Array<{ id: string; program_name: string }> }),
        departmentIds.length > 0
          ? this.supabase
              .from('departments')
              .select('id, department_name')
              .in('id', departmentIds)
              .then((result) => {
                if (result.error)
                  logger.error('academic/attendance-reports', 'Error fetching departments', result.error);
                return result;
              })
          : Promise.resolve({ data: [] as Array<{ id: string; department_name: string }> }),
        degreeIds.length > 0
          ? this.supabase
              .from('degrees')
              .select('id, degree_name')
              .in('id', degreeIds)
              .then((result) => {
                if (result.error)
                  logger.error('academic/attendance-reports', 'Error fetching degrees', result.error);
                return result;
              })
          : Promise.resolve({ data: [] as Array<{ id: string; degree_name: string }> }),
        institutionIds.length > 0
          ? this.supabase
              .from('institutions')
              .select('id, name')
              .in('id', institutionIds)
              .then((result) => {
                if (result.error)
                  logger.error('academic/attendance-reports', 'Error fetching institutions', result.error);
                return result;
              })
          : Promise.resolve({ data: [] as Array<{ id: string; name: string }> })
      ]);

    // Create lookup maps
    const sectionMap = new Map(
      (sections.data || []).map((s: any) => [s.id, s.section_name])
    );
    const semesterMap = new Map(
      (semesters.data || []).map((s: any) => [s.id, s.semester_name])
    );
    const programMap = new Map(
      (programs.data || []).map((p: any) => [p.id, p.program_name])
    );
    const departmentMap = new Map(
      (departments.data || []).map((d: any) => [d.id, d.department_name])
    );
    const degreeMap = new Map(
      (degrees.data || []).map((d: any) => [d.id, d.degree_name])
    );
    const institutionMap = new Map(
      (institutions.data || []).map((i: any) => [i.id, i.name])
    );

    // Process each record
    return data.map((record) => {
      const attendanceData = record.attendance_data as any;
      const periods = attendanceData ? Object.values(attendanceData) : [];

      let totalStudents = 0;
      let totalPresent = 0;
      const facultyMap = new Map();
      const coursesMap = new Map();

      periods.forEach((period: any) => {
        // Count students and attendance
        if (period.students && Array.isArray(period.students)) {
          const students = period.students;
          totalStudents = Math.max(totalStudents, students.length);
          totalPresent += students.filter(
            (s: any) => s.status === 'Present'
          ).length;
        }

        // Collect faculty
        if (period.assigned_faculty) {
          const faculty = period.assigned_faculty;
          if (Array.isArray(faculty)) {
            faculty.forEach((f: any) => {
              facultyMap.set(f.faculty_id, {
                faculty_id: f.faculty_id,
                faculty_name: f.faculty_name,
                faculty_email: f.faculty_email,
                is_primary: f.is_primary
              });
            });
          } else {
            facultyMap.set(faculty.faculty_id, {
              faculty_id: faculty.faculty_id,
              faculty_name: faculty.faculty_name,
              faculty_email: faculty.faculty_email,
              is_primary: true
            });
          }
        }

        // Collect courses
        if (period.course_id && period.course_name) {
          coursesMap.set(period.course_id, {
            course_id: period.course_id,
            course_name: period.course_name,
            course_code: period.course_code
          });
        }
      });

      const avgAttendance =
        totalStudents > 0 && periods.length > 0
          ? (totalPresent / (periods.length * totalStudents)) * 100
          : 0;

      return {
        id: record.id,
        attendance_date: record.attendance_date,
        institution_id: record.institution_id,
        institution_name: institutionMap.get(record.institution_id),
        department_id: record.department_id,
        department_name: departmentMap.get(record.department_id),
        program_id: record.program_id,
        program_name: programMap.get(record.program_id),
        degree_id: record.degree_id,
        degree_name: degreeMap.get(record.degree_id),
        semester_id: record.semester_id,
        semester_name: semesterMap.get(record.semester_id),
        section_id: record.section_id,
        section_name: sectionMap.get(record.section_id)
          ? `Section ${sectionMap.get(record.section_id)}`
          : undefined,
        timetable_id: record.timetable_id,
        periods_count: periods.length,
        total_students: totalStudents,
        average_attendance: Math.round(avgAttendance * 100) / 100,
        faculty_details: Array.from(facultyMap.values()),
        courses: Array.from(coursesMap.values()),
        created_at: record.created_at,
        updated_at: record.updated_at
      };
    });
  }

  /**
   * Get detailed report by ID
   */
  static async getReportDetails(
    reportId: string,
    userRole: 'super_admin' | 'admin' | 'faculty',
    userId?: string
  ) {
    try {
      const { data, error } = await this.supabase
        .from('student_attendance')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) {
        logger.error('academic/attendance-reports', 'Error fetching report details', error);
        return { data: null, error: error.message };
      }

      if (!data) {
        return { data: null, error: 'Report not found' };
      }

      // Check role-based access for faculty (only for strict faculty role)
      if (userRole === 'faculty' && userId) {
        // First check if user has super admin access or admin role
        const { data: profileData } = await this.supabase
          .from('profiles')
          .select('role, is_super_admin')
          .eq('id', userId)
          .single() as { data: { role: string; is_super_admin: boolean } | null };

        // Allow access if user is super admin or admin
        if (profileData?.is_super_admin || profileData?.role === 'admin') {
          // Super admin or admin - full access
        } else {
          // For regular faculty, check staff assignment
          const { data: staffData } = await this.supabase
            .from('staff')
            .select('id')
            .eq('profile_id', userId)
            .single() as { data: { id: string } | null };

          if (!staffData) {
            logger.warn('academic/attendance-reports', 'Faculty profile not found in staff table', { userId });
            // Don't block access - allow faculty to view reports even without staff record
            // This handles cases where faculty users don't have corresponding staff records
          } else {
            // Check if faculty is assigned to any period
            const attendanceData = (data as any).attendance_data as any;
            // attendance_data is an object with timetable_slot_id as keys and period data as values
            const periods = Object.values(attendanceData || {});

            const isAssigned = periods.some((period: any) => {
              const facultyMatch = Array.isArray(period.assigned_faculty)
                ? period.assigned_faculty.some((f: any) => f.faculty_id === staffData.id)
                : period.assigned_faculty?.faculty_id === staffData.id;
              return facultyMatch;
            });

            if (!isAssigned) {
              logger.error('academic/attendance-reports', 'Faculty not assigned to this report', {
                userId,
                staffId: staffData.id,
                reportId: (data as any).id
              });
              // Deny access - faculty can only view reports they are assigned to
              return {
                data: null,
                error: 'Access denied: You are not assigned to this report'
              };
            }
          }
        }
      }

      // Process attendance data for detailed view
      const attendanceData = (data as any).attendance_data as any;
      // Convert object to array of periods (attendance_data is an object with timetable_slot_id as keys)
      const periodsObject = attendanceData || {};
      let periods = Object.entries(periodsObject).map(
        ([slotId, periodData]: [string, any]) => ({
          ...periodData,
          timetable_slot_id: slotId
        })
      );

      // Filter periods for faculty users - only show periods they are assigned to
      let facultyStaffId: string | null = null;
      if (userRole === 'faculty' && userId) {
        // Get staff ID if not super admin or admin
        const { data: profileData } = await this.supabase
          .from('profiles')
          .select('role, is_super_admin')
          .eq('id', userId)
          .single() as { data: { role: string; is_super_admin: boolean } | null };

        if (!profileData?.is_super_admin && profileData?.role !== 'admin') {
          const { data: staffData } = await this.supabase
            .from('staff')
            .select('id')
            .eq('profile_id', userId)
            .single() as { data: { id: string } | null };

          if (staffData) {
            facultyStaffId = staffData.id;

            // Filter periods to only include those assigned to this faculty
            periods = periods.filter((period: any) => {
              if (Array.isArray(period.assigned_faculty)) {
                return period.assigned_faculty.some(
                  (f: any) => f.faculty_id === facultyStaffId
                );
              }
              return period.assigned_faculty?.faculty_id === facultyStaffId;
            });

            if (periods.length === 0) {
              logger.warn('academic/attendance-reports', 'No periods found for this faculty in the report', { facultyStaffId });
            }
          }
        }
      }

      // Build period details and sort by start time
      const periodDetails = [];
      const studentMap = new Map();

      // Sort periods by start_time before processing
      const sortedPeriods = periods.sort((a, b) => {
        if (!a.start_time || !b.start_time) return 0;
        return a.start_time.localeCompare(b.start_time);
      });

      // Collect all unique course IDs to fetch course codes
      const courseIds = [
        ...new Set(sortedPeriods.map((p) => p.course_id).filter(Boolean))
      ];
      const courseCodeMap = new Map();

      if (courseIds.length > 0) {
        const { data: coursesData } = await this.supabase
          .from('courses')
          .select('id, course_code')
          .in('id', courseIds) as { data: Array<{ id: string; course_code: string }> | null };

        if (coursesData) {
          coursesData.forEach((course: any) => {
            courseCodeMap.set(course.id, course.course_code);
          });
        }
      }

      for (const period of sortedPeriods) {
        const students = period.students || [];
        const presentCount = students.filter(
          (s: any) => s.status === 'Present'
        ).length;
        const totalCount = students.length;

        // Handle both single faculty and array of faculty
        let facultyArray = [];
        if (Array.isArray(period.assigned_faculty)) {
          facultyArray = period.assigned_faculty;
        } else if (period.assigned_faculty) {
          facultyArray = [
            {
              ...period.assigned_faculty,
              is_primary: true
            }
          ];
        }

        // Get all unique student IDs for this period to fetch fresh data
        const studentIds = students
          .map((s: any) => s.student_id)
          .filter(Boolean);

        // Fetch fresh student data from students table
        // Updated: 2025-10-08 - Fetch student info and separately fetch section info
        const studentDataMap = new Map();
        if (studentIds.length > 0) {
          const { data: freshStudentData } = await this.supabase
            .from('learners_profiles')
            .select('id, first_name, last_name, roll_number, student_photo_url, section_id')
            .in('id', studentIds);

          if (freshStudentData) {
            freshStudentData.forEach((student: any) => {
              studentDataMap.set(student.id, {
                student_name: student.first_name || 'Unknown',
                roll_number: student.roll_number,
                avatar_url: student.student_photo_url,
                current_section_id: student.section_id // Current section (may have changed)
              });
            });
          }
        }

        // Collect all unique section_ids from attendance_data AND students table for name lookup
        const sectionIdsToFetch = new Set<string>();
        students.forEach((s: any) => {
          if (s.section_id) sectionIdsToFetch.add(s.section_id); // From attendance_data
          const studentData = studentDataMap.get(s.student_id);
          if (studentData?.current_section_id) sectionIdsToFetch.add(studentData.current_section_id); // From students table
        });

        // Fetch section names for all section_ids
        const sectionNamesMap = new Map();
        if (sectionIdsToFetch.size > 0) {
          const { data: sectionsData } = await this.supabase
            .from('sections')
            .select('id, section_name')
            .in('id', Array.from(sectionIdsToFetch)) as { data: Array<{ id: string; section_name: string }> | null };

          if (sectionsData) {
            sectionsData.forEach((section: any) => {
              sectionNamesMap.set(section.id, section.section_name);
            });
          }
        }

        // Process students for this period with fresh data
        // Updated: 2025-10-08 - Include section info
        // Priority: 1) section_id from attendance_data (frozen at marking time - historical accuracy)
        //          2) section_id from students table (fallback for old records without section_id)
        const processedStudents = students.map((s: any) => {
          const freshData = studentDataMap.get(s.student_id) || {};

          // Determine section_id: prioritize attendance_data, fallback to current student section
          const sectionId = s.section_id || freshData.current_section_id;
          const sectionName = sectionId ? sectionNamesMap.get(sectionId) : null;

          return {
            student_id: s.student_id,
            student_name: freshData.student_name || s.student_name || 'Unknown',
            roll_number: freshData.roll_number || s.roll_number,
            avatar_url: freshData.avatar_url || s.avatar_url,
            section_id: sectionId,
            section_name: sectionName,
            is_present: s.status === 'Present'
          };
        });

        // Determine the actual period number to use
        const actualPeriodNumber: number =
          period.period_number || periodDetails.length + 1;

        // Update consolidated student map
        // Updated: 2025-10-08 - Include section info in consolidated students
        processedStudents.forEach((student: any) => {
          if (!studentMap.has(student.student_id)) {
            studentMap.set(student.student_id, {
              ...student,
              periods_attended: []
            });
          }
          if (student.is_present) {
            studentMap
              .get(student.student_id)
              .periods_attended.push(`P${actualPeriodNumber}`);
          }
        });

        periodDetails.push({
          period_id: period.period_id,
          period_number: actualPeriodNumber,
          period_name: period.period_name || `Period ${actualPeriodNumber}`,
          start_time: period.start_time,
          end_time: period.end_time,
          course_code: period.course_id
            ? courseCodeMap.get(period.course_id) || ''
            : '',
          course_name: period.course_name || 'Unknown Course',
          faculty: facultyArray,
          marked_by_details: period.marked_by_details,
          students: processedStudents,
          present_count: presentCount,
          absent_count: totalCount - presentCount,
          total_count: totalCount,
          attendance_percentage:
            totalCount > 0 ? (presentCount / totalCount) * 100 : 0
        });
      }

      // Build consolidated student list
      const consolidatedStudents = Array.from(studentMap.values()).map(
        (student: any) => {
          const attendedCount = student.periods_attended.length;
          return {
            ...student,
            is_present: attendedCount > 0,
            attendance_percentage: (attendedCount / periods.length) * 100
          };
        }
      );

      // Calculate overall statistics
      const totalStudents = consolidatedStudents.length;
      const presentStudents = consolidatedStudents.filter(
        (s: any) => s.is_present
      ).length;
      const averageAttendance =
        totalStudents > 0 ? (presentStudents / totalStudents) * 100 : 0;

      // Extract marked by details from attendance_data JSON
      let markedByDetails = {
        marked_by_id: '',
        marked_by_name: 'Unknown',
        marked_by_email: ''
      };

      // Look for marked_by_details in any period of the attendance_data
      if (attendanceData && Object.keys(attendanceData).length > 0) {
        const firstPeriod = Object.values(attendanceData)[0] as any;
        if (firstPeriod?.marked_by_details) {
          markedByDetails = {
            marked_by_id: firstPeriod.marked_by_details.marker_id || '',
            marked_by_name:
              firstPeriod.marked_by_details.marker_name || 'Unknown',
            marked_by_email: firstPeriod.marked_by_details.marker_email || ''
          };
        } else if (firstPeriod?.assigned_faculty) {
          // Fallback to assigned faculty if marked_by_details not available
          const faculty = Array.isArray(firstPeriod.assigned_faculty)
            ? firstPeriod.assigned_faculty[0]
            : firstPeriod.assigned_faculty;
          markedByDetails = {
            marked_by_id: faculty?.faculty_id || '',
            marked_by_name: faculty?.faculty_name || 'Unknown',
            marked_by_email: faculty?.faculty_email || ''
          };
        }
      }

      // Fetch related data including academic_year
      // Updated: 2025-10-09 - Fetch all sections from section_ids array for multi-section support
      const dataTyped = data as any;
      const [
        sectionData,
        allSectionsData,
        semesterData,
        programData,
        departmentData,
        degreeData,
        institutionData,
        academicYearData,
        timetableData
      ] = await Promise.all([
        dataTyped.section_id
          ? this.supabase
              .from('sections')
              .select('section_name')
              .eq('id', dataTyped.section_id)
              .single()
          : Promise.resolve({ data: null as { section_name: string } | null }),
        // Fetch all sections for multi-section timetables
        dataTyped.section_ids && Array.isArray(dataTyped.section_ids) && dataTyped.section_ids.length > 0
          ? this.supabase
              .from('sections')
              .select('id, section_name')
              .in('id', dataTyped.section_ids)
          : Promise.resolve({ data: [] as Array<{ id: string; section_name: string }> }),
        dataTyped.semester_id
          ? this.supabase
              .from('semesters')
              .select('semester_name')
              .eq('id', dataTyped.semester_id)
              .single()
          : Promise.resolve({ data: null as { semester_name: string } | null }),
        dataTyped.program_id
          ? this.supabase
              .from('programs')
              .select('program_name')
              .eq('id', dataTyped.program_id)
              .single()
          : Promise.resolve({ data: null as { program_name: string } | null }),
        dataTyped.department_id
          ? this.supabase
              .from('departments')
              .select('department_name')
              .eq('id', dataTyped.department_id)
              .single()
          : Promise.resolve({ data: null as { department_name: string } | null }),
        dataTyped.degree_id
          ? this.supabase
              .from('degrees')
              .select('degree_name')
              .eq('id', dataTyped.degree_id)
              .single()
          : Promise.resolve({ data: null as { degree_name: string } | null }),
        dataTyped.institution_id
          ? this.supabase
              .from('institutions')
              .select('name')
              .eq('id', dataTyped.institution_id)
              .single()
          : Promise.resolve({ data: null as { name: string } | null }),
        dataTyped.academic_year_id
          ? this.supabase
              .from('academic_years')
              .select('academic_year_name')
              .eq('id', dataTyped.academic_year_id)
              .single()
          : Promise.resolve({ data: null as { academic_year_name: string } | null }),
        dataTyped.timetable_id
          ? this.supabase
              .from('timetables')
              .select('timetable_name, timetable_type') // Updated: 2025-10-08
              .eq('id', dataTyped.timetable_id)
              .single()
          : Promise.resolve({ data: null as { timetable_name: string; timetable_type: string } | null })
      ]);

      // Build the detailed report
      // Updated: 2025-10-08 - Added timetable_type
      // Updated: 2025-10-09 - Added section_ids and section_names for multi-section support
      const detailedReport = {
        id: dataTyped.id,
        attendance_date: dataTyped.attendance_date,
        institution_id: dataTyped.institution_id,
        institution_name: (institutionData.data as any)?.name,
        department_id: dataTyped.department_id,
        department_name: (departmentData.data as any)?.department_name,
        program_id: dataTyped.program_id,
        program_name: (programData.data as any)?.program_name,
        degree_id: dataTyped.degree_id,
        degree_name: (degreeData.data as any)?.degree_name,
        semester_id: dataTyped.semester_id,
        semester_name: (semesterData.data as any)?.semester_name,
        section_id: dataTyped.section_id,
        section_name: (sectionData.data as any)?.section_name
          ? `Section ${(sectionData.data as any).section_name}`
          : undefined,
        section_ids: dataTyped.section_ids || undefined,
        section_names: allSectionsData.data && (allSectionsData.data as any).length > 0
          ? (allSectionsData.data as any).map((s: any) => s.section_name)
          : undefined,
        academic_year_id: dataTyped.academic_year_id,
        academic_year_name:
          (academicYearData.data as any)?.academic_year_name || 'Unknown Academic Year',
        timetable_id: dataTyped.timetable_id,
        timetable_name: (timetableData.data as any)?.timetable_name,
        timetable_type: (timetableData.data as any)?.timetable_type,
        marked_by_id: markedByDetails.marked_by_id,
        marked_by_name: markedByDetails.marked_by_name,
        marked_by_email: markedByDetails.marked_by_email,
        period_details: periodDetails,
        consolidated_students: consolidatedStudents,
        total_students: totalStudents,
        total_present: presentStudents,
        total_absent: totalStudents - presentStudents,
        average_attendance: averageAttendance,
        created_at: dataTyped.created_at,
        updated_at: dataTyped.updated_at
      };

      return {
        data: detailedReport,
        error: null
      };
    } catch (error) {
      logger.error('academic/attendance-reports', 'Error in getReportDetails', error);
      return { data: null, error: 'Failed to fetch report details' };
    }
  }

  /**
   * Get attendance statistics
   */
  static async getAttendanceStatistics(
    filters: AttendanceReportFilters,
    level: 'institution' | 'department' | 'faculty' = 'institution',
    facultyStaffId?: string
  ): Promise<{ data: AttendanceStatistics | null; error: string | null }> {
    try {
      // Use same date range as reports or default to a broader range for statistics
      // If no date range specified, use a wider range to match all available data
      const endDate =
        filters.date_range?.to || new Date().toISOString().split('T')[0];
      const startDate = filters.date_range?.from || '2020-01-01'; // Broader default range

      let data: any[] = [];
      let count = 0;

      // For faculty users, use the same RPC function as the table to ensure consistency
      if (level === 'faculty' && facultyStaffId) {
        const { data: rpcData, error } = await (this.supabase as any).rpc(
          'get_faculty_attendance_reports',
          {
            faculty_staff_id: facultyStaffId,
            filter_institution_id: filters.institution_id || null,
            filter_academic_year_id: filters.academic_year_id || null,
            filter_degree_id: filters.degree_id || null,
            filter_department_id: filters.department_id || null,
            filter_program_id: filters.program_id || null,
            filter_semester_id: filters.semester_id || null,
            filter_section_id: filters.section_id || null,
            filter_date_from: startDate,
            filter_date_to: endDate,
            page_offset: 0,
            page_limit: 10000 // Large limit to get all records for statistics
          }
        );

        if (error) {
          logger.error('academic/attendance-reports', 'Error in faculty statistics RPC', error);
          return { data: null, error: error.message };
        }

        data = rpcData || [];
        count = data.length > 0 ? data[0]?.total_count || data.length : 0;
      } else {
        // Build base query for non-faculty users
        let query = this.supabase
          .from('student_attendance')
          .select('id, attendance_date, attendance_data, institution_id', {
            count: 'exact'
          });

        // Apply filters
        if (filters.institution_id) {
          query = query.eq('institution_id', filters.institution_id);
        }
        if (filters.academic_year_id) {
          query = query.eq('academic_year_id', filters.academic_year_id);
        }
        if (filters.degree_id) {
          query = query.eq('degree_id', filters.degree_id);
        }
        if (filters.department_id) {
          query = query.eq('department_id', filters.department_id);
        }
        if (filters.program_id) {
          query = query.eq('program_id', filters.program_id);
        }
        if (filters.semester_id) {
          query = query.eq('semester_id', filters.semester_id);
        }
        if (filters.section_id) {
          query = query.eq('section_id', filters.section_id);
        }

        query = query
          .gte('attendance_date', startDate)
          .lte('attendance_date', endDate);

        const result = await query;

        if (result.error) {
          return { data: null, error: result.error.message };
        }

        data = result.data || [];
        count = result.count || 0;
      }

      // Calculate statistics
      let totalClasses = 0;
      let totalAttendance = 0;
      const studentsSet = new Set();
      const facultySet = new Set();
      const dailyStats: { [key: string]: { present: number; total: number } } =
        {};

      (data || []).forEach((record) => {
        const attendanceData = record.attendance_data as any;
        // Convert object to array of periods (attendance_data is an object with timetable_slot_id as keys)
        const periods = attendanceData ? Object.values(attendanceData) : [];

        // For faculty users, the RPC function already filters records, so no need to filter again
        // For non-faculty users, we don't need period-level filtering since they can see all periods

        periods.forEach((period: any) => {
          // Only count periods where attendance was actually marked (students array exists and has attendance data)
          const hasAttendanceMarked =
            period.students &&
            Array.isArray(period.students) &&
            period.students.length > 0 &&
            period.students.some((s: any) => s.status);

          if (hasAttendanceMarked) {
            totalClasses++;

            // Count students
            period.students.forEach((s: any) => {
              studentsSet.add(s.student_id);

              const date = record.attendance_date;
              if (!dailyStats[date]) {
                dailyStats[date] = { present: 0, total: 0 };
              }
              dailyStats[date].total++;
              if (s.status === 'Present') {
                dailyStats[date].present++;
                totalAttendance++;
              }
            });

            // Count faculty (only for periods with marked attendance)
            if (period.assigned_faculty) {
              if (Array.isArray(period.assigned_faculty)) {
                period.assigned_faculty.forEach((f: any) =>
                  facultySet.add(f.faculty_id)
                );
              } else {
                facultySet.add(period.assigned_faculty.faculty_id);
              }
            }
          }
        });
      });

      // Calculate trend
      const attendanceTrend = Object.entries(dailyStats)
        .map(([date, stats]) => ({
          date,
          percentage: stats.total > 0 ? (stats.present / stats.total) * 100 : 0,
          present: stats.present,
          total: stats.total
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-30); // Last 30 days for trend

      // Get today's stats and enhanced metrics
      const today = new Date().toISOString().split('T')[0];
      const todayStats = dailyStats[today] || { present: 0, total: 0 };

      // Calculate today's specific metrics
      const todayRecords = (data || []).filter(
        (record) => record.attendance_date === today
      );
      let todayPeriods = 0;
      let todayTotalCapacity = 0;

      todayRecords.forEach((record) => {
        const attendanceData = record.attendance_data as any;
        const periods = attendanceData ? Object.values(attendanceData) : [];

        // For faculty users, the data is already filtered by the RPC function, so no additional filtering needed

        periods.forEach((period: any) => {
          // Only count periods where attendance was actually marked
          const hasAttendanceMarked =
            period.students &&
            Array.isArray(period.students) &&
            period.students.length > 0 &&
            period.students.some((s: any) => s.status);

          if (hasAttendanceMarked) {
            todayPeriods++;
            todayTotalCapacity += period.students.length;
          }
        });
      });

      const todayAttendanceRate =
        todayStats.total > 0
          ? Math.round((todayStats.present / todayStats.total) * 100 * 100) /
            100
          : 0;

      // Calculate weekly comparison
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const lastWeekStats = dailyStats[oneWeekAgo] || { present: 0, total: 0 };
      const lastWeekRate =
        lastWeekStats.total > 0
          ? (lastWeekStats.present / lastWeekStats.total) * 100
          : 0;
      const weeklyComparison = todayAttendanceRate - lastWeekRate;

      // Calculate low attendance alerts (days with < 75% attendance)
      const lowAttendanceAlerts = Object.entries(dailyStats)
        .filter(([_, stats]) => {
          const percentage =
            stats.total > 0 ? (stats.present / stats.total) * 100 : 0;
          return percentage < 75 && percentage > 0;
        })
        .map(([date, stats]) => ({
          date,
          percentage: (stats.present / stats.total) * 100,
          section: undefined // Can be enhanced to include section info
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10); // Top 10 recent alerts

      // Calculate overall average attendance
      const totalStudentDays = Array.from(Object.values(dailyStats)).reduce(
        (sum, stats) => sum + stats.total,
        0
      );
      const totalPresentDays = Array.from(Object.values(dailyStats)).reduce(
        (sum, stats) => sum + stats.present,
        0
      );
      const averageAttendance =
        totalStudentDays > 0
          ? Math.round((totalPresentDays / totalStudentDays) * 100 * 100) / 100
          : 0;

      const statistics: AttendanceStatistics = {
        totalClasses: totalClasses, // Now counts only periods where attendance was marked
        averageAttendance,
        totalStudents: studentsSet.size,
        totalFaculty: facultySet.size,
        presentToday: todayStats.present,
        absentToday: todayStats.total - todayStats.present,
        todayClasses: todayPeriods, // Now counts only periods with marked attendance for today
        todayAttendanceRate,
        weeklyComparison,
        todayPeriods,
        todayTotalCapacity,
        attendanceTrend,
        departmentComparison: [], // Can be enhanced with department-wise data
        lowAttendanceAlerts
      };

      return { data: statistics, error: null };
    } catch (error) {
      logger.error('academic/attendance-reports', 'Error calculating statistics', error);
      return { data: null, error: 'Failed to calculate statistics' };
    }
  }

  /**
   * Check if user can view a specific report
   */
  static async canViewReport(
    reportId: string,
    userRole: 'super_admin' | 'admin' | 'faculty',
    userId?: string
  ): Promise<boolean> {
    if (userRole === 'super_admin') {
      return true;
    }

    if (userRole === 'faculty' && userId) {
      const reportResult = await this.supabase
        .from('student_attendance')
        .select('attendance_data')
        .eq('id', reportId)
        .single();

      const report = reportResult.data as { attendance_data: any } | null;

      if (!report) return false;

      const staffResult = await this.supabase
        .from('staff')
        .select('id')
        .eq('profile_id', userId)
        .single();

      const staffData = staffResult.data as { id: string } | null;

      if (!staffData) return false;

      // Check if faculty is assigned to any period in this attendance
      const attendanceData = report.attendance_data as any;
      if (attendanceData) {
        for (const period of Object.values(attendanceData)) {
          const periodData = period as any;
          if (periodData.assigned_faculty) {
            if (Array.isArray(periodData.assigned_faculty)) {
              if (
                periodData.assigned_faculty.some(
                  (f: any) => f.faculty_id === staffData.id
                )
              ) {
                return true;
              }
            } else if (
              periodData.assigned_faculty.faculty_id === staffData.id
            ) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }
}
