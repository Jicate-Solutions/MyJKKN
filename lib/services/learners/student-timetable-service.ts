/**
 * Student Timetable Service
 * Created: 2026-01-14
 * Description: Service layer for student timetable data fetching and enrichment
 */

import { createClient } from '@/lib/supabase/server';
import { StudentTimetableData, EnrichedTimetableSlot, CurrentPeriodInfo } from '@/types/student-portal';
import { Period, DayOfWeek } from '@/types/academics';

export class StudentTimetableService {
  /**
   * Get student's timetable with enriched slot data
   * Fetches active timetable for student's section and enriches with course/staff details
   *
   * @param sectionId - Student's section ID
   * @param semesterId - Current semester ID
   * @returns StudentTimetableData | null
   */
  static async getStudentTimetable(
    sectionId: string,
    semesterId: string
  ): Promise<StudentTimetableData | null> {
    try {
      const supabase = await createClient();

      // Fetch active timetable for section
      const { data: timetable, error: timetableError } = await supabase
        .from('timetables')
        .select(`
          id,
          timetable_name,
          timetable_format,
          timetable_data,
          periods,
          selected_days,
          start_date,
          end_date,
          institution_id
        `)
        .eq('section_id', sectionId)
        .eq('semester_id', semesterId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (timetableError) {
        console.error('[StudentTimetable] Error fetching timetable:', timetableError);
        return null;
      }

      if (!timetable) {
        console.warn('[StudentTimetable] No active timetable found for section:', sectionId);
        return null;
      }

      // Get periods
      const { data: periods, error: periodsError } = await supabase
        .from('periods')
        .select('*')
        .eq('institution_id', timetable.institution_id)
        .order('start_time', { ascending: true });

      if (periodsError) {
        console.error('[StudentTimetable] Error fetching periods:', periodsError);
        return null;
      }

      // Parse timetable_data and enrich slots
      const enrichedSlots = await this.enrichTimetableSlots(
        timetable.timetable_data,
        periods || [],
        supabase
      );

      // Get section and semester names
      const { data: section } = await supabase
        .from('sections')
        .select('section_name')
        .eq('id', sectionId)
        .single();

      const { data: semester } = await supabase
        .from('semesters')
        .select('semester_name')
        .eq('id', semesterId)
        .single();

      return {
        timetable_id: timetable.id,
        timetable_name: timetable.timetable_name,
        timetable_format: timetable.timetable_format,
        periods: periods || [],
        slots: enrichedSlots,
        selected_days: timetable.selected_days,
        start_date: timetable.start_date,
        end_date: timetable.end_date,
        student_info: {
          name: '', // Will be filled by page component
          roll_number: '', // Will be filled by page component
          section_name: section?.section_name || 'Unknown',
          semester_name: semester?.semester_name || 'Unknown',
          degree_name: '', // Will be filled by page component
          department_name: '', // Will be filled by page component
          program_name: '' // Will be filled by page component
        }
      };
    } catch (error) {
      console.error('[StudentTimetable] Unexpected error:', error);
      return null;
    }
  }

  /**
   * Calculate current period from system time
   * Checks if current time falls within any period's time range
   *
   * @param periods - Array of period definitions
   * @param slots - Array of enriched timetable slots
   * @returns CurrentPeriodInfo | null
   */
  static getCurrentPeriod(
    periods: Period[],
    slots: EnrichedTimetableSlot[]
  ): CurrentPeriodInfo | null {
    try {
      const now = new Date();
      const currentDay = this.getCurrentDay();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      // Filter slots for current day
      const todaySlots = slots.filter(slot => slot.day === currentDay);

      // Check each period
      for (const slot of todaySlots) {
        const period = periods.find(p => p.id === slot.period_id);
        if (!period) continue;

        const [startH, startM] = period.start_time.split(':').map(Number);
        const [endH, endM] = period.end_time.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        // Check if current time is within this period
        if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
          const endTime = new Date();
          endTime.setHours(endH, endM, 0, 0);

          return {
            period_id: period.id,
            period_name: period.period_name,
            slot: period.is_break ? null : slot,
            time_range: `${this.formatTime(period.start_time)} - ${this.formatTime(period.end_time)}`,
            ends_at: endTime.toISOString()
          };
        }
      }

      return null; // No current period (before/after class hours)
    } catch (error) {
      console.error('[StudentTimetable] Error detecting current period:', error);
      return null;
    }
  }

  /**
   * Get current day of week (MONDAY-SUNDAY)
   * Returns MONDAY for Sunday (no classes on Sunday)
   */
  private static getCurrentDay(): DayOfWeek {
    const days: DayOfWeek[] = [
      'SUNDAY', // 0
      'MONDAY', // 1
      'TUESDAY', // 2
      'WEDNESDAY', // 3
      'THURSDAY', // 4
      'FRIDAY', // 5
      'SATURDAY' // 6
    ];

    const dayIndex = new Date().getDay();
    // If Sunday, default to Monday
    return dayIndex === 0 ? 'MONDAY' : days[dayIndex];
  }

  /**
   * Enrich raw timetable slot data with course and staff information
   * Batches queries to avoid N+1 problem
   *
   * @private
   */
  private static async enrichTimetableSlots(
    timetableData: any,
    periods: Period[],
    supabase: any
  ): Promise<EnrichedTimetableSlot[]> {
    try {
      if (!timetableData || typeof timetableData !== 'object') {
        return [];
      }

      const slots: any[] = [];
      const periodMap = new Map(periods.map(p => [p.id, p]));

      // Parse timetable_data structure
      // Format: { [day]: { [periodId]: slotData } } or array of slots
      if (Array.isArray(timetableData)) {
        slots.push(...timetableData);
      } else if (timetableData.slots && Array.isArray(timetableData.slots)) {
        slots.push(...timetableData.slots);
      } else {
        // Day-based structure
        Object.entries(timetableData).forEach(([day, dayData]: [string, any]) => {
          if (typeof dayData === 'object' && dayData !== null) {
            Object.entries(dayData).forEach(([periodId, slotData]: [string, any]) => {
              if (slotData && typeof slotData === 'object') {
                slots.push({
                  ...slotData,
                  day: day as DayOfWeek,
                  period_id: periodId
                });
              }
            });
          }
        });
      }

      if (slots.length === 0) {
        return [];
      }

      // Extract unique IDs for batch fetching
      const courseIds = [...new Set(slots.map(s => s.course_id).filter(Boolean))];
      const staffIds = [...new Set(slots.flatMap(s => s.staff_ids || []).filter(Boolean))];

      // Batch fetch courses and staff
      const [coursesResult, staffResult] = await Promise.all([
        courseIds.length > 0
          ? supabase
              .from('courses')
              .select('id, course_name, course_code')
              .in('id', courseIds)
          : { data: [], error: null },
        staffIds.length > 0
          ? supabase
              .from('staff')
              .select('id, first_name, last_name')
              .in('id', staffIds)
          : { data: [], error: null }
      ]);

      if (coursesResult.error) {
        console.warn('[StudentTimetable] Error fetching courses:', coursesResult.error);
      }
      if (staffResult.error) {
        console.warn('[StudentTimetable] Error fetching staff:', staffResult.error);
      }

      // Create lookup maps
      const courseMap = new Map(
        (coursesResult.data || []).map(c => [c.id, c])
      );
      const staffMap = new Map(
        (staffResult.data || []).map(s => [
          s.id,
          { staff_id: s.id, staff_name: `${s.first_name} ${s.last_name}` }
        ])
      );

      // Enrich slots
      return slots.map((slot, index) => {
        const period = periodMap.get(slot.period_id);
        const course = courseMap.get(slot.course_id);
        const staffMembers = (slot.staff_ids || [])
          .map((id: string) => staffMap.get(id))
          .filter(Boolean);

        return {
          slot_id: slot.id || `slot-${index}`,
          day: slot.day || 'MONDAY',
          period_id: slot.period_id,
          period: period
            ? {
                period_name: period.period_name,
                start_time: period.start_time,
                end_time: period.end_time,
                is_break: period.is_break
              }
            : {
                period_name: 'Unknown',
                start_time: '00:00:00',
                end_time: '00:00:00',
                is_break: false
              },
          course: course
            ? {
                course_id: course.id,
                course_name: course.course_name,
                course_code: course.course_code
              }
            : {
                course_id: slot.course_id || '',
                course_name: 'Unknown Course',
                course_code: 'N/A'
              },
          staff_members: staffMembers,
          room: slot.room
        };
      });
    } catch (error) {
      console.error('[StudentTimetable] Error enriching slots:', error);
      return [];
    }
  }

  /**
   * Format time string (HH:MM:SS) to 12-hour format
   * @private
   */
  private static formatTime(timeStr: string): string {
    try {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
    } catch (error) {
      return timeStr;
    }
  }
}
