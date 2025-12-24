import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  FacultySlot,
  FacultyAvailability,
  FacultyCalendarFilters,
  InstitutionHierarchyFilters,
  FacultyCalendarApiResponse,
  FacultyAvailabilityApiResponse,
  FacultyWorkloadStats
} from '@/types/faculty-calendar';
import type { DayOfWeek } from '@/types/academics';
import { logger } from '@/lib/utils/enhanced-logger';

export class FacultyTimetableService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get timetable slots assigned to a specific faculty member
   * Used for faculty's personal calendar view
   */
  static async getFacultyTimetableSlots(
    staffId: string,
    dateRange: { from: Date; to: Date },
    filters?: Partial<FacultyCalendarFilters>
  ): Promise<FacultyCalendarApiResponse> {
    try {
      // Get all timetables where this staff member might be assigned
      let timetableQuery = this.supabase
        .from('timetables')
        .select(
          `
          id,
          timetable_name,
          timetable_format,
          start_date,
          end_date,
          institution:institutions(id, name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester,
          timetable_data
        `
        )
        .eq('is_active', true);

      // Apply institution filter if provided
      if (filters?.institution_id) {
        timetableQuery = timetableQuery.eq(
          'institution_id',
          filters.institution_id
        );
      }

      // Apply date range filter
      timetableQuery = timetableQuery
        .lte('start_date', dateRange.to.toISOString().split('T')[0])
        .gte('end_date', dateRange.from.toISOString().split('T')[0]);

      const { data: timetables, error: timetableError } = await timetableQuery;

      if (timetableError) {
        logger.error('academic/timetables', 'Error fetching timetables', timetableError);
        throw timetableError;
      }

      if (!timetables || timetables.length === 0) {
        return { slots: [], total_count: 0 };
      }

      const allSlots: FacultySlot[] = [];

      // Process each timetable to extract faculty's assigned slots
      for (const timetable of timetables) {
        try {
          // Use RPC to get all slots for this timetable
          const { data: timetableSlots, error: slotsError } =
            await (this.supabase as any).rpc('get_all_timetable_slots', {
              p_timetable_id: timetable.id
            });

          if (slotsError) {
            logger.error('academic/timetables', `Error fetching slots for timetable ${timetable.id}`, slotsError);
            continue;
          }

          // Filter slots to only include those assigned to this staff member
          const facultySlots = (timetableSlots || [])
            .map((item: any) => item.slot)
            .filter((slot: any) => {
              // Check if staff is assigned to main slot
              if (slot.staff_members && Array.isArray(slot.staff_members)) {
                const isMainStaff = slot.staff_members.some(
                  (staff: any) => staff.id === staffId
                );
                if (isMainStaff) return true;
              }

              // Check if staff is assigned to any sub-slot (for combined classes)
              if (slot.sub_slots && Array.isArray(slot.sub_slots)) {
                const isSubSlotStaff = slot.sub_slots.some(
                  (subSlot: any) =>
                    subSlot.staff_members &&
                    Array.isArray(subSlot.staff_members) &&
                    subSlot.staff_members.some(
                      (staff: any) => staff.id === staffId
                    )
                );
                if (isSubSlotStaff) return true;
              }

              return false;
            });

          // Transform slots to FacultySlot format
          for (const slot of facultySlots) {
            const facultySlot: FacultySlot = {
              id: slot.id,
              slot_date: slot.slot_date,
              day_of_week: slot.day_of_week,
              period_id: slot.period_id,
              period_name: slot.period?.period_name || 'Unknown Period',
              start_time: slot.period?.start_time || '00:00',
              end_time: slot.period?.end_time || '00:00',
              course: slot.course
                ? {
                    id: slot.course.id,
                    course_code: slot.course.course_code,
                    course_name: slot.course.course_name
                  }
                : undefined,
              sections: slot.sections
                ? slot.sections.map((section: any) => ({
                    id: section.id,
                    section_name: section.section_name
                  }))
                : [],
              staff_members: slot.staff_members,
              timetable: {
                id: timetable.id,
                timetable_name: timetable.timetable_name,
                timetable_format: timetable.timetable_format,
                institution_name:
                  (timetable.institution as any)?.name || 'Unknown Institution',
                department_name:
                  (timetable.department as any)?.department_name ||
                  'Unknown Department',
                program_name: (timetable.program as any)?.program_name,
                semester: timetable.semester
              },
              is_break_slot: slot.is_break_slot || false,
              break_description: slot.break_description,
              is_combined: slot.is_combined || false,
              sub_slots: slot.sub_slots
                ? slot.sub_slots.map((subSlot: any) => ({
                    sub_slot_order: subSlot.sub_slot_order,
                    course: subSlot.course
                      ? {
                          id: subSlot.course.id,
                          course_code: subSlot.course.course_code,
                          course_name: subSlot.course.course_name
                        }
                      : undefined,
                    sections: subSlot.sections
                      ? subSlot.sections.map((section: any) => ({
                          id: section.id,
                          section_name: section.section_name
                        }))
                      : [],
                    is_break_slot: subSlot.is_break_slot || false,
                    break_description: subSlot.break_description
                  }))
                : undefined
            };

            allSlots.push(facultySlot);
          }
        } catch (error) {
          logger.error('academic/timetables', `Error processing timetable ${timetable.id}`, error);
          continue;
        }
      }

      // Apply additional filters
      let filteredSlots = allSlots;

      // Filter by break slots inclusion
      if (filters?.include_break_slots === false) {
        filteredSlots = filteredSlots.filter((slot) => !slot.is_break_slot);
      }

      // Filter by timetable format
      if (filters?.timetable_format && filters.timetable_format !== 'all') {
        filteredSlots = filteredSlots.filter(
          (slot) => slot.timetable.timetable_format === filters.timetable_format
        );
      }

      return {
        slots: filteredSlots,
        total_count: filteredSlots.length
      };
    } catch (error) {
      logger.error('academic/timetables', 'Error in getFacultyTimetableSlots', error);
      throw error;
    }
  }

  /**
   * Get all faculty timetable slots for admin view
   * Supports filtering by institution hierarchy
   */
  static async getAllFacultyTimetableSlots(
    dateRange: { from: Date; to: Date },
    filters: FacultyCalendarFilters
  ): Promise<FacultyCalendarApiResponse> {
    try {
      // Build timetable query with filters
      let timetableQuery = this.supabase
        .from('timetables')
        .select(
          `
          id,
          timetable_name,
          timetable_format,
          start_date,
          end_date,
          institution:institutions(id, name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester,
          timetable_data
        `
        )
        .eq('is_active', true);

      // Apply filters
      if (filters.institution_id) {
        timetableQuery = timetableQuery.eq(
          'institution_id',
          filters.institution_id
        );
      }
      if (filters.department_id) {
        timetableQuery = timetableQuery.eq(
          'department_id',
          filters.department_id
        );
      }
      if (filters.program_id) {
        timetableQuery = timetableQuery.eq('program_id', filters.program_id);
      }
      if (filters.academic_year_id) {
        timetableQuery = timetableQuery.eq(
          'academic_year_id',
          filters.academic_year_id
        );
      }
      if (filters.semester_id) {
        timetableQuery = timetableQuery.eq('semester_id', filters.semester_id);
      }
      if (filters.section_name) {
        // Convert section_name to section_id first
        const { data: sectionData } = await this.supabase
          .from('sections')
          .select('id')
          .eq('section_name', filters.section_name)
          .single();

        if (sectionData) {
          timetableQuery = timetableQuery.eq('section_id', sectionData.id);
        }
      }

      // Apply date range filter
      timetableQuery = timetableQuery
        .lte('start_date', dateRange.to.toISOString().split('T')[0])
        .gte('end_date', dateRange.from.toISOString().split('T')[0]);

      const { data: timetables, error: timetableError } = await timetableQuery;

      if (timetableError) {
        logger.error('academic/timetables', 'Error fetching timetables for admin', timetableError);
        throw timetableError;
      }

      if (!timetables || timetables.length === 0) {
        return { slots: [], total_count: 0 };
      }

      const allSlots: FacultySlot[] = [];

      // Process each timetable
      for (const timetable of timetables) {
        try {
          const { data: timetableSlots, error: slotsError } =
            await (this.supabase as any).rpc('get_all_timetable_slots', {
              p_timetable_id: timetable.id
            });

          if (slotsError) {
            logger.error('academic/timetables', `Error fetching slots for timetable ${timetable.id}`, slotsError);
            continue;
          }

          // Transform all slots and include staff information
          for (const slotItem of timetableSlots || []) {
            const slot = slotItem.slot;

            // Skip if slot is undefined
            if (!slot) continue;

            // Skip slots with no staff assigned (unless including break slots)
            const hasStaff =
              (slot.staff_members && slot.staff_members.length > 0) ||
              (slot.sub_slots &&
                slot.sub_slots.some(
                  (ss: any) => ss.staff_members && ss.staff_members.length > 0
                ));

            if (!hasStaff && !slot.is_break_slot) continue;
            if (slot.is_break_slot && filters.include_break_slots === false)
              continue;

            // Apply staff filter if specified
            if (filters.staff_ids && filters.staff_ids.length > 0) {
              const hasMatchingStaff =
                (slot.staff_members &&
                  slot.staff_members.some((staff: any) =>
                    filters.staff_ids!.includes(staff.id)
                  )) ||
                (slot.sub_slots &&
                  slot.sub_slots.some(
                    (subSlot: any) =>
                      subSlot.staff_members &&
                      subSlot.staff_members.some((staff: any) =>
                        filters.staff_ids!.includes(staff.id)
                      )
                  ));

              if (!hasMatchingStaff) continue;
            }

            const facultySlot: FacultySlot = {
              id: slot.slot_id || `${slot.day_of_week}-${slot.period_id}`, // Use slot_id or generate one
              slot_date: slot.slot_date,
              day_of_week: slot.day_of_week,
              period_id: slot.period_id,
              period_name: slot.period?.period_name || 'Unknown Period',
              start_time: slot.period?.start_time || '00:00:00',
              end_time: slot.period?.end_time || '00:00:00',
              course: slot.course
                ? {
                    id: slot.course.id,
                    course_code: slot.course.course_code,
                    course_name: slot.course.course_name
                  }
                : undefined,
              sections: slot.sections
                ? slot.sections.map((section: any) => ({
                    id: section.id,
                    section_name: section.section_name
                  }))
                : [],
              staff_members: slot.staff_members,
              timetable: {
                id: timetable.id,
                timetable_name: timetable.timetable_name,
                timetable_format: timetable.timetable_format,
                institution_name:
                  (timetable.institution as any)?.name || 'Unknown Institution',
                department_name:
                  (timetable.department as any)?.department_name ||
                  'Unknown Department',
                program_name: (timetable.program as any)?.program_name,
                semester: timetable.semester
              },
              is_break_slot: slot.is_break_slot || false,
              break_description: slot.break_description,
              is_combined: slot.is_combined || false,
              sub_slots: slot.sub_slots
                ? slot.sub_slots.map((subSlot: any) => ({
                    sub_slot_order: subSlot.sub_slot_order,
                    course: subSlot.course
                      ? {
                          id: subSlot.course.id,
                          course_code: subSlot.course.course_code,
                          course_name: subSlot.course.course_name
                        }
                      : undefined,
                    sections: subSlot.sections
                      ? subSlot.sections.map((section: any) => ({
                          id: section.id,
                          section_name: section.section_name
                        }))
                      : [],
                    is_break_slot: subSlot.is_break_slot || false,
                    break_description: subSlot.break_description
                  }))
                : undefined
            };

            allSlots.push(facultySlot);
          }
        } catch (error) {
          logger.error('academic/timetables', `Error processing timetable ${timetable.id}`, error);
          continue;
        }
      }

      return {
        slots: allSlots,
        total_count: allSlots.length
      };
    } catch (error) {
      logger.error('academic/timetables', 'Error in getAllFacultyTimetableSlots', error);
      throw error;
    }
  }

  /**
   * Get faculty availability for a specific time slot
   * Used for scheduling and conflict detection
   */
  static async getFacultyAvailability(
    date: string,
    periodId: string,
    filters: InstitutionHierarchyFilters
  ): Promise<FacultyAvailabilityApiResponse> {
    try {
      // Get period details
      const { data: period, error: periodError } = await this.supabase
        .from('periods')
        .select('period_name, start_time, end_time')
        .eq('id', periodId)
        .single();

      if (periodError || !period) {
        throw new Error('Period not found');
      }

      // Get all faculty in the specified filters
      let staffQuery = this.supabase
        .from('staff')
        .select(
          `
          id,
          first_name,
          last_name,
          department:departments(id, department_name)
        `
        )
        .eq('is_active', true)
        .eq('institution_id', filters.institution_id);

      if (filters.department_id) {
        staffQuery = staffQuery.eq('department_id', filters.department_id);
      }

      const { data: allStaff, error: staffError } = await staffQuery;

      if (staffError) {
        logger.error('academic/timetables', 'Error fetching staff', staffError);
        throw staffError;
      }

      if (!allStaff || allStaff.length === 0) {
        return {
          date,
          period_id: periodId,
          period_name: period.period_name,
          start_time: period.start_time,
          end_time: period.end_time,
          available_faculty: [],
          unavailable_faculty: []
        };
      }

      // Determine day of week from date
      const dayOfWeek = this.getDayOfWeekFromDate(date);

      // Get all timetables that might have conflicts
      const { data: timetables, error: timetableError } = await this.supabase
        .from('timetables')
        .select('id, timetable_name, timetable_format')
        .eq('is_active', true)
        .eq('institution_id', filters.institution_id)
        .lte('start_date', date)
        .gte('end_date', date);

      if (timetableError) {
        logger.error('academic/timetables', 'Error fetching timetables', timetableError);
        throw timetableError;
      }

      const staffAvailability = new Map<string, FacultyAvailability>();

      // Initialize all staff as available
      for (const staff of allStaff) {
        staffAvailability.set(staff.id, {
          staff_id: staff.id,
          staff_name: `${staff.first_name} ${staff.last_name}`,
          department_name:
            (staff as any).department?.department_name || 'Unknown Department',
          is_available: true,
          conflicting_slots: []
        });
      }

      // Check for conflicts in each timetable
      for (const timetable of timetables || []) {
        try {
          let slotsData;

          if (timetable.timetable_format === 'batch') {
            // For batch mode, check specific date
            const { data: batchSlots, error: batchError } =
              await (this.supabase as any).rpc('get_timetable_slots_for_day_or_date', {
                p_timetable_id: timetable.id,
                p_day_of_week: null,
                p_slot_date: date
              });
            if (batchError) throw batchError;
            slotsData = batchSlots;
          } else {
            // For regular mode, check day of week
            const { data: regularSlots, error: regularError } =
              await (this.supabase as any).rpc('get_timetable_slots_for_day_or_date', {
                p_timetable_id: timetable.id,
                p_day_of_week: dayOfWeek,
                p_slot_date: null
              });
            if (regularError) throw regularError;
            slotsData = regularSlots;
          }

          // Check for conflicts in the specific period
          const conflictingSlots = (slotsData || [])
            .map((item: any) => item.slot)
            .filter((slot: any) => slot.period_id === periodId);

          for (const slot of conflictingSlots) {
            // Check main slot staff
            if (slot.staff_members && Array.isArray(slot.staff_members)) {
              for (const staff of slot.staff_members) {
                const availability = staffAvailability.get(staff.id);
                if (availability) {
                  availability.is_available = false;
                  availability.conflicting_slots =
                    availability.conflicting_slots || [];
                  availability.conflicting_slots.push({
                    timetable_name: timetable.timetable_name,
                    course_code: slot.course?.course_code || 'Unknown Course',
                    section_names:
                      slot.sections?.map((s: any) => s.section_name) || []
                  });
                }
              }
            }

            // Check sub-slot staff (for combined classes)
            if (slot.sub_slots && Array.isArray(slot.sub_slots)) {
              for (const subSlot of slot.sub_slots) {
                if (
                  subSlot.staff_members &&
                  Array.isArray(subSlot.staff_members)
                ) {
                  for (const staff of subSlot.staff_members) {
                    const availability = staffAvailability.get(staff.id);
                    if (availability) {
                      availability.is_available = false;
                      availability.conflicting_slots =
                        availability.conflicting_slots || [];
                      availability.conflicting_slots.push({
                        timetable_name: timetable.timetable_name,
                        course_code:
                          subSlot.course?.course_code || 'Unknown Course',
                        section_names:
                          subSlot.sections?.map((s: any) => s.section_name) ||
                          []
                      });
                    }
                  }
                }
              }
            }
          }
        } catch (error) {
          logger.error('academic/timetables', `Error checking conflicts in timetable ${timetable.id}`, error);
          continue;
        }
      }

      // Separate available and unavailable faculty
      const availableFaculty: FacultyAvailability[] = [];
      const unavailableFaculty: FacultyAvailability[] = [];

      for (const availability of staffAvailability.values()) {
        if (availability.is_available) {
          availableFaculty.push(availability);
        } else {
          unavailableFaculty.push(availability);
        }
      }

      return {
        date,
        period_id: periodId,
        period_name: period.period_name,
        start_time: period.start_time,
        end_time: period.end_time,
        available_faculty: availableFaculty,
        unavailable_faculty: unavailableFaculty
      };
    } catch (error) {
      logger.error('academic/timetables', 'Error in getFacultyAvailability', error);
      throw error;
    }
  }

  /**
   * Get current user's staff record
   * Used to determine if current user is faculty and get their staff ID
   */
  static async getCurrentUserStaffRecord(): Promise<any | null> {
    try {
      const {
        data: { user },
        error: userError
      } = await this.supabase.auth.getUser();

      if (userError || !user) {
        return null;
      }

      // Get user profile to check role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        logger.warn('academic/timetables', 'Profile lookup failed', { message: profileError?.message });
        return null;
      }

      // If user is not faculty, return null
      if (profile.role !== 'faculty') {
        return null;
      }

      // Find staff record by matching email and name
      const { data: staffRecord, error: staffError } = await this.supabase
        .from('staff')
        .select(
          `
          id,
          first_name,
          last_name,
          email,
          institution_email,
          staff_id,
          designation,
          department:departments(id, department_name),
          institution:institutions(id, name)
        `
        )
        .or(`email.eq.${user.email},institution_email.eq.${user.email}`)
        .eq('is_active', true)
        .single();

      if (staffError || !staffRecord) {
        logger.warn('academic/timetables', 'No staff record found for faculty user', {
          email: user.email,
          error: staffError?.message,
          query: `email.eq.${user.email},institution_email.eq.${user.email}`
        });
        return null;
      }

      return staffRecord;
    } catch (error) {
      logger.error('academic/timetables', 'Error getting current user staff record', error);
      return null;
    }
  }

  /**
   * Helper method to get day of week from date string
   */
  private static getDayOfWeekFromDate(dateString: string): DayOfWeek {
    const date = new Date(dateString);
    const dayIndex = date.getDay(); // 0 = Sunday, 1 = Monday, etc.

    const dayMap: { [key: number]: DayOfWeek } = {
      0: 'SUNDAY',
      1: 'MONDAY',
      2: 'TUESDAY',
      3: 'WEDNESDAY',
      4: 'THURSDAY',
      5: 'FRIDAY',
      6: 'SATURDAY'
    };

    return dayMap[dayIndex] || 'MONDAY';
  }

  /**
   * Get faculty workload statistics
   * Used for analytics and workload distribution
   */
  static async getFacultyWorkloadStats(
    staffIds: string[],
    dateRange: { from: Date; to: Date },
    filters?: Partial<FacultyCalendarFilters>
  ): Promise<FacultyWorkloadStats[]> {
    try {
      const workloadStats: FacultyWorkloadStats[] = [];

      for (const staffId of staffIds) {
        const response = await this.getFacultyTimetableSlots(
          staffId,
          dateRange,
          filters
        );
        const slots = response.slots;

        // Calculate statistics
        const totalPeriods = slots.length;
        const totalHours = slots.reduce((acc, slot) => {
          const startTime = new Date(`2000-01-01T${slot.start_time}`);
          const endTime = new Date(`2000-01-01T${slot.end_time}`);
          const hours =
            (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
          return acc + hours;
        }, 0);

        const coursesSet = new Set<string>();
        const sectionsSet = new Set<string>();
        let breakPeriods = 0;

        for (const slot of slots) {
          if (slot.is_break_slot) {
            breakPeriods++;
          } else {
            if (slot.course) coursesSet.add(slot.course.id);
            if (slot.sections) {
              slot.sections.forEach((section) => sectionsSet.add(section.id));
            }
          }
        }

        // Get staff name
        const { data: staff } = await this.supabase
          .from('staff')
          .select('first_name, last_name')
          .eq('id', staffId)
          .single();

        const staffName = staff
          ? `${staff.first_name} ${staff.last_name}`
          : 'Unknown Staff';

        workloadStats.push({
          staff_id: staffId,
          staff_name: staffName,
          total_periods: totalPeriods,
          total_hours: Math.round(totalHours * 100) / 100, // Round to 2 decimal places
          courses_count: coursesSet.size,
          sections_count: sectionsSet.size,
          break_periods: breakPeriods,
          utilization_percentage:
            totalPeriods > 0
              ? Math.round(((totalPeriods - breakPeriods) / totalPeriods) * 100)
              : 0
        });
      }

      return workloadStats;
    } catch (error) {
      logger.error('academic/timetables', 'Error calculating faculty workload stats', error);
      throw error;
    }
  }
}
