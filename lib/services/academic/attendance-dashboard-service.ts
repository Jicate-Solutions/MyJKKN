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
    async (
      userInstitutionId?: string,
      canViewAllInstitutions: boolean = false,
      dateString?: string,
      academicYearId?: string
    ): Promise<AttendanceStats[]> => {
      try {
        const today = dateString || new Date().toISOString().split('T')[0];

        console.log('📊 Fetching attendance stats:', {
          today,
          userInstitutionId,
          canViewAllInstitutions,
          academicYearId,
          mode:
            canViewAllInstitutions && !userInstitutionId
              ? 'ALL_INSTITUTIONS'
              : 'SPECIFIC_INSTITUTION'
        });

        // Build the query for getting attendance data with pagination
        let attendanceData: any[] = [];
        const ATTENDANCE_BATCH_SIZE = 1000;
        let attendanceFrom = 0;
        let fetchMoreAttendance = true;

        console.log('🔄 Starting paginated attendance fetch...');

        while (fetchMoreAttendance) {
          let query = this.supabase
            .from('student_attendance')
            .select(
              `
            institution_id,
            timetable_id,
            section_id,
            attendance_data,
            academic_year_id,
            degree_id,
            program_id,
            department_id,
            semester_id
            `
            )
            .eq('attendance_date', today)
            .range(attendanceFrom, attendanceFrom + ATTENDANCE_BATCH_SIZE - 1);

          // Access control:
          // - Super admin with canViewAllInstitutions=true and no userInstitutionId: show all institutions
          // - Super admin with specific userInstitutionId: show that institution
          // - Regular users: always filter by their institution (userInstitutionId)
          if (userInstitutionId) {
            query = query.eq('institution_id', userInstitutionId);
            if (attendanceFrom === 0) {
              console.log('🏢 Filtering by institution:', userInstitutionId);
            }
          } else if (!canViewAllInstitutions) {
            // If no institution provided and user can't view all, return empty result
            console.warn(
              '❌ No institution ID provided and user cannot view all institutions'
            );
            return [];
          } else {
            if (attendanceFrom === 0) {
              console.log('🌐 Fetching data for all institutions');
            }
          }

          // Apply academic year filter if provided
          if (academicYearId) {
            query = query.eq('academic_year_id', academicYearId);
            if (attendanceFrom === 0) {
              console.log('🎓 Filtering by academic year:', academicYearId);
            }
          }

          const { data: batchAttendance, error } = await query;

          if (error) {
            console.error('Error fetching attendance data batch:', error);
            throw error;
          }

          if (batchAttendance && batchAttendance.length > 0) {
            attendanceData = attendanceData.concat(batchAttendance);
            console.log(
              `📦 Fetched attendance batch ${
                Math.floor(attendanceFrom / ATTENDANCE_BATCH_SIZE) + 1
              }: ${batchAttendance.length} records (Total: ${
                attendanceData.length
              })`
            );

            // If we got less than BATCH_SIZE, we've reached the end
            if (batchAttendance.length < ATTENDANCE_BATCH_SIZE) {
              fetchMoreAttendance = false;
            } else {
              attendanceFrom += ATTENDANCE_BATCH_SIZE;
            }
          } else {
            fetchMoreAttendance = false;
          }
        }

        if (!attendanceData || attendanceData.length === 0) {
          console.log('📋 No attendance data found for today:', today);
          console.log(
            '📊 Will show student counts with 0% attendance for all institutions'
          );
          // Don't return empty - we still want to show student counts even without attendance data
        }

        console.log(
          `📊 Found ${attendanceData.length} attendance records for processing`
        );

        if (attendanceData && attendanceData.length >= 50000) {
          console.warn(
            '⚠️ Attendance query hit the 50,000 limit - there may be more attendance records not fetched'
          );
        }

        // Log unique institutions found in data
        const foundInstitutions = [
          ...new Set(attendanceData.map((r) => r.institution_id))
        ];
        console.log('🏢 Institutions in data:', foundInstitutions);

        // Get related data in separate queries
        const institutionIds =
          attendanceData && attendanceData.length > 0
            ? [...new Set(attendanceData.map((r) => r.institution_id))]
            : [];
        const departmentIds =
          attendanceData && attendanceData.length > 0
            ? [...new Set(attendanceData.map((r) => r.department_id))]
            : [];
        const semesterIds =
          attendanceData && attendanceData.length > 0
            ? [...new Set(attendanceData.map((r) => r.semester_id))]
            : [];
        const sectionIds =
          attendanceData && attendanceData.length > 0
            ? [...new Set(attendanceData.map((r) => r.section_id))]
            : [];

        // First, let's get all students with their related info to build the complete structure
        let studentsData: any[] = [];
        let allInstitutionIds: string[] = [];
        let allDepartmentIds: string[] = [];
        let allSemesterIds: string[] = [];
        let allSectionIds: string[] = [];

        console.log(
          '📊 Fetching students. Institution ID:',
          userInstitutionId,
          'Can view all:',
          canViewAllInstitutions
        );

        try {
          // Implement pagination to fetch all student records
          const BATCH_SIZE = 1000;
          let from = 0;
          let fetchMore = true;

          console.log('🔄 Starting paginated student fetch...');

          while (fetchMore) {
            let query = this.supabase
              .from('students')
              .select(
                `
                id, 
                section_id, 
                institution_id, 
                academic_year_id,
                department_id,
                semester_id,
                sections:sections(id, section_name),
                departments:departments(id, department_name),
                semesters:semesters(id, semester_name),
                institutions:institutions(id, name)
              `
              )
              .eq('status', 'active')
              .range(from, from + BATCH_SIZE - 1);

            // Apply institution filter based on access level
            if (userInstitutionId) {
              query = query.eq('institution_id', userInstitutionId);
              if (from === 0) {
                console.log(
                  '🔍 Querying specific institution:',
                  userInstitutionId
                );
              }
            } else if (canViewAllInstitutions) {
              if (from === 0) {
                console.log('🔍 Querying all institutions for super admin');
              }
            } else {
              console.log('⚠️ No institution access - returning empty results');
              return [];
            }

            // Apply academic year filter if provided
            if (academicYearId) {
              query = query.eq('academic_year_id', academicYearId);
              if (from === 0) {
                console.log(
                  '🎓 Filtering students by academic year:',
                  academicYearId
                );
              }
            }

            const { data: batchStudents, error: studentsError } = await query;

            if (studentsError) {
              console.error('Error fetching students batch:', studentsError);
              return [];
            }

            if (batchStudents && batchStudents.length > 0) {
              studentsData = studentsData.concat(batchStudents);
              console.log(
                `📦 Fetched batch ${Math.floor(from / BATCH_SIZE) + 1}: ${
                  batchStudents.length
                } students (Total: ${studentsData.length})`
              );

              // If we got less than BATCH_SIZE, we've reached the end
              if (batchStudents.length < BATCH_SIZE) {
                fetchMore = false;
              } else {
                from += BATCH_SIZE;
              }
            } else {
              fetchMore = false;
            }
          }

          // Final logging and processing
          if (studentsData.length > 0) {
            const institutionCount = userInstitutionId
              ? 1
              : new Set(studentsData.map((s) => s.institution_id)).size;
            console.log(
              `✅ Found ${studentsData.length} active students across ${institutionCount} institution(s)`
            );

            // Extract all unique IDs for fetching related data
            allInstitutionIds = [
              ...new Set(studentsData.map((s) => s.institution_id))
            ];
            allDepartmentIds = [
              ...new Set(
                studentsData.map((s) => s.department_id).filter(Boolean)
              )
            ];
            allSemesterIds = [
              ...new Set(studentsData.map((s) => s.semester_id).filter(Boolean))
            ];
            allSectionIds = [
              ...new Set(studentsData.map((s) => s.section_id).filter(Boolean))
            ];
          } else {
            console.log('📊 No active students found');
          }
        } catch (error) {
          console.error('Unexpected error fetching students:', error);
          return [];
        }

        // Now fetch minimal related data for attendance records (if any)
        const attendanceInstitutionIds =
          institutionIds.length > 0 ? institutionIds : [];
        const attendanceDepartmentIds =
          departmentIds.length > 0 ? departmentIds : [];
        const attendanceSemesterIds = semesterIds.length > 0 ? semesterIds : [];
        const attendanceSectionIds = sectionIds.length > 0 ? sectionIds : [];

        // We'll use the student data for the complete structure since it has all the info we need
        // No need for separate fetches - we already have the related data from the students query

        // Create section-wise count for matching with attendance data
        const studentsBySection = studentsData.reduce((acc, student) => {
          if (student.section_id) {
            acc[student.section_id] = (acc[student.section_id] || 0) + 1;
          }
          return acc;
        }, {} as Record<string, number>);

        console.log(
          '📊 Students by section count:',
          Object.keys(studentsBySection).length,
          'sections'
        );

        // Build institution hierarchy from student data
        const institutionStats = new Map<string, any>();

        // First, create the complete hierarchy structure from students
        studentsData.forEach((student) => {
          const institutionId = student.institution_id;
          const departmentId = student.department_id;
          const semesterId = student.semester_id;
          const sectionId = student.section_id;

          // Initialize institution if not exists
          if (!institutionStats.has(institutionId)) {
            institutionStats.set(institutionId, {
              institution_id: institutionId,
              institution_name:
                student.institutions?.name || 'Unknown Institution',
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
              department_name:
                student.departments?.department_name || 'Unknown Department',
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
              semester_name:
                student.semesters?.semester_name || 'Unknown Semester',
              total_students: 0,
              total_present: 0,
              total_absent: 0,
              attendance_percentage: 0,
              sections: new Map()
            });
          }

          const semester = department.semesters.get(semesterId);

          // Initialize or update section
          if (!semester.sections.has(sectionId)) {
            semester.sections.set(sectionId, {
              section_id: sectionId,
              section_name: student.sections?.section_name || 'Unknown Section',
              total_students: 0,
              present: 0,
              absent: 0,
              percentage: 0
            });
          }

          // Count this student
          const section = semester.sections.get(sectionId);
          section.total_students += 1;
          semester.total_students += 1;
          department.total_students += 1;
          institution.total_students += 1;
        });

        console.log(
          '📊 Built hierarchy from students:',
          institutionStats.size,
          'institutions'
        );

        // Now process attendance data if it exists
        if (attendanceData && attendanceData.length > 0) {
          console.log('📊 Processing attendance data...');
          attendanceData.forEach((record) => {
            const institutionId = record.institution_id;
            const departmentId = record.department_id;
            const semesterId = record.semester_id;
            const sectionId = record.section_id;

            // Get the existing hierarchy (should exist from student data)
            const institution = institutionStats.get(institutionId);
            if (!institution) {
              console.warn(
                `Institution ${institutionId} not found in student data - skipping attendance record`
              );
              return;
            }

            const department = institution.departments.get(departmentId);
            if (!department) {
              console.warn(
                `Department ${departmentId} not found in student data - skipping attendance record`
              );
              return;
            }

            const semester = department.semesters.get(semesterId);
            if (!semester) {
              console.warn(
                `Semester ${semesterId} not found in student data - skipping attendance record`
              );
              return;
            }

            const section = semester.sections.get(sectionId);
            if (!section) {
              console.warn(
                `Section ${sectionId} not found in student data - skipping attendance record`
              );
              return;
            }

            // Process attendance data for this section
            const recordAttendanceData = record.attendance_data as any;
            let sectionPresent = 0;
            let sectionAbsent = 0;
            let periodCount = 0;

            if (
              recordAttendanceData &&
              typeof recordAttendanceData === 'object'
            ) {
              // Count attendance for each period
              Object.values(recordAttendanceData).forEach((periodData: any) => {
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

            // Update section attendance data (student count already set from student data)
            section.present = sectionPresent;
            section.absent = sectionAbsent;
            section.percentage =
              section.total_students > 0
                ? Math.round((sectionPresent / section.total_students) * 100)
                : 0;

            // Update aggregates up the hierarchy
            semester.total_present += sectionPresent;
            semester.total_absent += sectionAbsent;
            department.total_present += sectionPresent;
            department.total_absent += sectionAbsent;
            institution.total_present += sectionPresent;
            institution.total_absent += sectionAbsent;
          });
        } else {
          console.log(
            '📊 No attendance data - showing student counts with 0% attendance'
          );
        }

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

        console.log(
          `✅ Processed statistics for ${result.length} institution(s):`
        );
        result.forEach((i) => {
          console.log(
            `🏢 ${i.institution_name}: ${i.total_students} students, ${i.attendance_percentage}% attendance (${i.total_present} present, ${i.total_absent} absent)`
          );
        });

        return result;
      } catch (error) {
        console.error('Error in getTodayAttendanceStats:', error);
        throw error;
      }
    }
  );

  /**
   * Get pending attendance periods with enhanced filtering and date range support
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
        sortBy = 'attendance_date',
        sortDirection = 'desc',
        search = '',
        startDate,
        endDate,
        institutionId,
        academicYearId,
        degreeId,
        departmentId,
        programId,
        semesterId,
        sectionId,
        staffId
      } = filters;

      // Determine date range
      const today = new Date().toISOString().split('T')[0];
      const queryStartDate = startDate || today;
      const queryEndDate = endDate || today;

      console.log('🔍 Enhanced Pending Attendance Query:', {
        queryStartDate,
        queryEndDate,
        userInstitutionId,
        filters
      });

      // Generate date range
      const dates = [];
      const start = new Date(queryStartDate);
      const end = new Date(queryEndDate);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
      }

      const offset = (page - 1) * limit;

      // Step 1: Build comprehensive timetable query with all hierarchy joins
      let timetableQuery = this.supabase
        .from('timetables')
        .select(
          `
          id,
          timetable_name,
          institution_id,
          academic_year_id,
          degree_id,
          department_id,
          program_id,
          semester_id,
          section_id,
          timetable_data,
          periods,
          start_date,
          end_date,
          institution:institutions(id, name),
          academic_year:academic_years(id, academic_year_name),
          degree:degrees(id, degree_name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters(id, semester_name),
          section:sections(id, section_name)
        `
        )
        .eq('is_active', true);

      // Apply hierarchy filters
      const effectiveInstitutionId = institutionId || userInstitutionId;
      if (effectiveInstitutionId) {
        timetableQuery = timetableQuery.eq(
          'institution_id',
          effectiveInstitutionId
        );
      }
      if (academicYearId) {
        timetableQuery = timetableQuery.eq('academic_year_id', academicYearId);
      }
      if (degreeId) {
        timetableQuery = timetableQuery.eq('degree_id', degreeId);
      }
      if (departmentId) {
        timetableQuery = timetableQuery.eq('department_id', departmentId);
      }
      if (programId) {
        timetableQuery = timetableQuery.eq('program_id', programId);
      }
      if (semesterId) {
        timetableQuery = timetableQuery.eq('semester_id', semesterId);
      }
      if (sectionId) {
        timetableQuery = timetableQuery.eq('section_id', sectionId);
      }

      // Apply date range filtering for timetable validity - remove for now to get all timetables
      // TODO: Add proper date filtering logic later if needed
      // For now, let's get all active timetables and filter in code

      const { data: timetables, error: timetableError } = await timetableQuery;

      if (timetableError) {
        console.error('Error fetching timetables:', timetableError);
        throw timetableError;
      }

      console.log(`📅 Found ${timetables?.length || 0} active timetables`);
      console.log(`📊 Date range: ${queryStartDate} to ${queryEndDate}`);
      console.log(`📊 Querying for dates:`, dates);
      
      // Debug: Check the structure of the first timetable
      if (timetables && timetables.length > 0) {
        console.log('🔍 Sample timetable structure:', {
          id: timetables[0].id,
          institution_id: timetables[0].institution_id,
          institution: timetables[0].institution,
          degree: timetables[0].degree,
          department: timetables[0].department,
          program: timetables[0].program,
          semester: timetables[0].semester,
          section: timetables[0].section,
          academic_year: timetables[0].academic_year
        });
      }

      // Step 2: Get courses and staff data for enrichment
      const courseIds = new Set<string>();
      const staffIds = new Set<string>();

      timetables?.forEach((timetable) => {
        const timetableData = timetable.timetable_data as any;
        if (timetableData) {
          Object.values(timetableData).forEach((daySlots: any) => {
            if (daySlots && typeof daySlots === 'object') {
              Object.values(daySlots).forEach((slot: any) => {
                if (slot?.course_id) courseIds.add(slot.course_id);
                if (slot?.staff_ids && Array.isArray(slot.staff_ids)) {
                  slot.staff_ids.forEach((id: string) => staffIds.add(id));
                }
                if (slot?.primary_staff_id) staffIds.add(slot.primary_staff_id);
              });
            }
          });
        }
      });

      // Fetch course and staff lookup data
      const [coursesData, staffData] = await Promise.all([
        courseIds.size > 0
          ? this.supabase
              .from('courses')
              .select('id, course_name, course_code')
              .in('id', Array.from(courseIds))
          : { data: [] },
        staffIds.size > 0
          ? this.supabase
              .from('staff')
              .select('id, first_name, last_name, email, institution_email')
              .in('id', Array.from(staffIds))
          : { data: [] }
      ]);

      // Create lookup maps
      const courseLookup = (coursesData.data || []).reduce((acc, course) => {
        acc[course.id] = course;
        return acc;
      }, {} as Record<string, any>);

      const staffLookup = (staffData.data || []).reduce((acc, staff) => {
        acc[staff.id] = staff;
        return acc;
      }, {} as Record<string, any>);

      // Step 3: Extract scheduled periods for each date in range
      const allScheduledPeriods = new Map<string, PendingAttendancePeriod>();

      dates.forEach((date) => {
        const dateObj = new Date(date);
        const dayOfWeek = dateObj
          .toLocaleDateString('en-US', { weekday: 'long' })
          .toUpperCase();

        timetables?.forEach((timetable) => {
          // Check if timetable is valid for the current date
          const isValidForDate = 
            (!timetable.start_date || timetable.start_date <= date) &&
            (!timetable.end_date || timetable.end_date >= date);
          
          if (!isValidForDate) {
            return; // Skip this timetable for this date
          }

          const timetableData = timetable.timetable_data as any;
          const periods = timetable.periods as any;

          if (timetableData && timetableData[dayOfWeek]) {
            Object.entries(timetableData[dayOfWeek]).forEach(
              ([periodId, slot]: [string, any]) => {
                if (slot && !slot.is_break_slot && slot.course_id) {
                  const periodInfo = Array.isArray(periods)
                    ? periods.find((p: any) => p.period_id === periodId)
                    : null;

                  if (periodInfo && !periodInfo.is_break) {
                    const course = courseLookup[slot.course_id];
                    const primaryStaff = staffLookup[slot.primary_staff_id];
                    const assignedStaff = (slot.staff_ids || [])
                      .map((staffId: string) => {
                        const staff = staffLookup[staffId];
                        return staff
                          ? {
                              staff_id: staff.id,
                              staff_name: `${staff.first_name} ${staff.last_name}`,
                              staff_email:
                                staff.email || staff.institution_email,
                              is_primary: staffId === slot.primary_staff_id
                            }
                          : null;
                      })
                      .filter(Boolean);

                    const periodKey = `${date}_${timetable.id}_${periodId}`;

                    // Apply staff filter if provided
                    if (
                      staffId &&
                      !assignedStaff.some((s: any) => s.staff_id === staffId)
                    ) {
                      return;
                    }

                    const pendingPeriod: PendingAttendancePeriod = {
                      // Date and period info
                      attendance_date: date,
                      period_name: periodInfo.period_name,
                      period_id: periodId,
                      start_time: periodInfo.start_time,
                      end_time: periodInfo.end_time,

                      // Course info
                      course_name: course?.course_name || 'Unknown Course',
                      course_code: course?.course_code,

                      // Institution hierarchy
                      institution_id: timetable.institution_id,
                      institution_name:
                        (timetable.institution as any)?.name ||
                        'Unknown Institution',
                      degree_id: timetable.degree_id,
                      degree_name:
                        (timetable.degree as any)?.degree_name || 'Unknown Degree',
                      department_id: timetable.department_id,
                      department_name:
                        (timetable.department as any)?.department_name ||
                        'Unknown Department',
                      program_id: timetable.program_id,
                      program_name:
                        (timetable.program as any)?.program_name ||
                        'Unknown Program',
                      semester_id: timetable.semester_id,
                      semester_name:
                        (timetable.semester as any)?.semester_name ||
                        'Unknown Semester',
                      section_id: timetable.section_id,
                      section_name:
                        (timetable.section as any)?.section_name ||
                        'Unknown Section',

                      // Academic year
                      academic_year_id: timetable.academic_year_id,
                      academic_year_name:
                        (timetable.academic_year as any)?.academic_year_name ||
                        'Unknown Academic Year',

                      // Staff details
                      assigned_staff: assignedStaff,
                      primary_staff_name: primaryStaff
                        ? `${primaryStaff.first_name} ${primaryStaff.last_name}`
                        : 'Unknown Staff',

                      // Timetable reference
                      timetable_id: timetable.id,
                      timetable_name: timetable.timetable_name
                    };

                    allScheduledPeriods.set(periodKey, pendingPeriod);
                    console.log(`📋 Scheduled period key: ${periodKey} for date ${date}, timetable ${timetable.id}`);
                  }
                }
              }
            );
          }
        });
      });

      console.log(
        `📋 Found ${allScheduledPeriods.size} scheduled periods across date range`
      );
      console.log(`📋 Sample scheduled periods:`, Array.from(allScheduledPeriods.keys()).slice(0, 5));
      
      // Debug: Log first few scheduled periods
      let count = 0;
      allScheduledPeriods.forEach((period, key) => {
        if (count < 3) {
          console.log(`📋 Sample period ${count + 1}:`, {
            key,
            timetable: period.timetable_name,
            period: period.period_name,
            date: period.attendance_date,
            course: period.course_name
          });
          count++;
        }
      });

      // Step 4: Find marked attendance for the date range
      let attendanceQuery = this.supabase
        .from('student_attendance')
        .select('attendance_date, timetable_id, attendance_data')
        .in('attendance_date', dates);

      if (effectiveInstitutionId) {
        attendanceQuery = attendanceQuery.eq(
          'institution_id',
          effectiveInstitutionId
        );
      }

      const { data: markedAttendance, error: attendanceError } =
        await attendanceQuery;

      if (attendanceError) {
        console.error('Error fetching marked attendance:', attendanceError);
        throw attendanceError;
      }

      // Create set of marked periods
      const markedPeriods = new Set<string>();
      markedAttendance?.forEach((record) => {
        const attendanceData = record.attendance_data as any;
        if (attendanceData && typeof attendanceData === 'object') {
          Object.keys(attendanceData).forEach((periodId) => {
            const periodKey = `${record.attendance_date}_${record.timetable_id}_${periodId}`;
            markedPeriods.add(periodKey);
            console.log(`✅ Marked period key: ${periodKey} for date ${record.attendance_date}`);
          });
        }
      });

      console.log(`✅ Found ${markedPeriods.size} marked periods`);
      console.log(`✅ Sample marked periods:`, Array.from(markedPeriods).slice(0, 5));

      // Step 5: Find pending periods (scheduled but not marked)
      const pendingPeriods: PendingAttendancePeriod[] = [];

      allScheduledPeriods.forEach((period, periodKey) => {
        const isMarked = markedPeriods.has(periodKey);
        if (!isMarked) {
          console.log(`🔍 Processing pending period: ${periodKey} (not marked)`);
        } else {
          console.log(`⏭️ Skipping marked period: ${periodKey}`);
        }
        
        if (!isMarked) {
          // Apply search filter
          if (search) {
            const searchLower = search.toLowerCase();
            const searchableText = [
              period.institution_name,
              period.degree_name,
              period.department_name,
              period.program_name,
              period.semester_name,
              period.section_name,
              period.period_name,
              period.course_name,
              period.primary_staff_name,
              period.attendance_date
            ]
              .join(' ')
              .toLowerCase();

            if (searchableText.includes(searchLower)) {
              pendingPeriods.push(period);
            }
          } else {
            pendingPeriods.push(period);
          }
        }
      });

      console.log(`⏳ Found ${pendingPeriods.length} pending periods`);

      // Step 6: Apply sorting
      const sortedPeriods = pendingPeriods.sort((a, b) => {
        let comparison = 0;

        switch (sortBy) {
          case 'attendance_date':
            comparison = a.attendance_date.localeCompare(b.attendance_date);
            break;
          case 'institution_name':
            comparison = a.institution_name.localeCompare(b.institution_name);
            break;
          case 'degree_name':
            comparison = a.degree_name.localeCompare(b.degree_name);
            break;
          case 'department_name':
            comparison = a.department_name.localeCompare(b.department_name);
            break;
          case 'program_name':
            comparison = a.program_name.localeCompare(b.program_name);
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
          case 'primary_staff_name':
            comparison = a.primary_staff_name.localeCompare(
              b.primary_staff_name
            );
            break;
          case 'start_time':
            comparison = a.start_time.localeCompare(b.start_time);
            break;
          default: // period_name
            comparison = a.period_name.localeCompare(b.period_name);
        }

        return sortDirection === 'desc' ? -comparison : comparison;
      });

      // Step 7: Apply pagination
      const totalCount = sortedPeriods.length;
      const paginatedPeriods = sortedPeriods.slice(offset, offset + limit);

      console.log(
        `📄 Returning ${
          paginatedPeriods.length
        } periods (page ${page}/${Math.ceil(totalCount / limit)})`
      );

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
      console.error('Error in enhanced getTodayPendingAttendance:', error);
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
