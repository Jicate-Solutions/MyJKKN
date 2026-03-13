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
   * Check if a timetable_data JSONB structure contains slots referencing a given section_id.
   * Searches nested structure: { [day/date]: { [periodId]: { section_ids: [...] } } }
   * @private
   */
  private static timetableDataContainsSection(timetableData: any, sectionId: string): boolean {
    if (!timetableData || typeof timetableData !== 'object') return false;

    // Handle array format
    if (Array.isArray(timetableData)) {
      return timetableData.some(
        (slot: any) => Array.isArray(slot?.section_ids) && slot.section_ids.includes(sectionId)
      );
    }

    // Handle { slots: [...] } format
    if (timetableData.slots && Array.isArray(timetableData.slots)) {
      return timetableData.slots.some(
        (slot: any) => Array.isArray(slot?.section_ids) && slot.section_ids.includes(sectionId)
      );
    }

    // Handle day-based structure: { [day]: { [periodId]: { section_ids: [...] } } }
    for (const dayData of Object.values(timetableData)) {
      if (typeof dayData === 'object' && dayData !== null) {
        for (const slotData of Object.values(dayData as Record<string, any>)) {
          if (
            slotData &&
            typeof slotData === 'object' &&
            Array.isArray((slotData as any).section_ids) &&
            (slotData as any).section_ids.includes(sectionId)
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

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

      const timetableSelect = `
        id,
        timetable_name,
        timetable_format,
        timetable_data,
        periods,
        selected_days,
        start_date,
        end_date,
        institution_id,
        created_at
      `;

      // Step 1: Get all timetables with exact section_id match
      const { data: directMatches, error: directError } = await supabase
        .from('timetables')
        .select(timetableSelect)
        .eq('section_id', sectionId)
        .eq('semester_id', semesterId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (directError) {
        console.error('[StudentTimetable] Error fetching timetable:', directError);
        return null;
      }

      // Step 2: Fallback — section_id is NULL on the row but stored inside timetable_data JSONB
      const { data: nullSectionCandidates, error: fallbackError } = await supabase
        .from('timetables')
        .select(timetableSelect)
        .is('section_id', null)
        .eq('semester_id', semesterId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (fallbackError) {
        console.error('[StudentTimetable] Error in fallback timetable query:', fallbackError);
      }

      // Filter fallback candidates by JSONB section_ids
      const fallbackMatches = (nullSectionCandidates || []).filter((t: any) =>
        this.timetableDataContainsSection(t.timetable_data, sectionId)
      );

      // Merge all matching timetables (deduplicate by id)
      const allTimetables = new Map<string, any>();
      for (const t of (directMatches || [])) allTimetables.set(t.id, t);
      for (const t of fallbackMatches) if (!allTimetables.has(t.id)) allTimetables.set(t.id, t);

      const candidates = Array.from(allTimetables.values());

      if (candidates.length === 0) {
        console.warn('[StudentTimetable] No active timetable found for section:', sectionId);
        return null;
      }

      // Step 3: Pick the best timetable — prefer one whose date range covers today
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const timetableResult = this.selectBestTimetable(candidates, today);

      // Get periods
      const { data: periods, error: periodsError } = await supabase
        .from('periods')
        .select('*')
        .eq('institution_id', timetableResult.institution_id)
        .order('start_time', { ascending: true });

      if (periodsError) {
        console.error('[StudentTimetable] Error fetching periods:', periodsError);
        return null;
      }

      // Parse timetable_data and enrich slots
      const enrichedSlots = await this.enrichTimetableSlots(
        timetableResult.timetable_data,
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
        timetable_id: timetableResult.id,
        timetable_name: timetableResult.timetable_name,
        timetable_format: timetableResult.timetable_format,
        periods: periods || [],
        slots: enrichedSlots,
        selected_days: timetableResult.selected_days,
        start_date: timetableResult.start_date,
        end_date: timetableResult.end_date,
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
   * Select the best timetable from multiple candidates based on date range.
   * Priority: 1) Date range covers today, 2) Most recently created
   * @private
   */
  private static selectBestTimetable(candidates: any[], today: string): any {
    if (candidates.length === 1) return candidates[0];

    // Find timetables whose date range covers today
    const coveringToday = candidates.filter(t => {
      if (!t.start_date && !t.end_date) return false;
      const startOk = !t.start_date || t.start_date <= today;
      const endOk = !t.end_date || t.end_date >= today;
      return startOk && endOk;
    });

    if (coveringToday.length > 0) {
      // Among those covering today, pick the most recently created
      return coveringToday.sort((a: any, b: any) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      )[0];
    }

    // No timetable covers today — pick the one with the closest future start_date,
    // or the most recently created as final fallback
    const futureTimetables = candidates
      .filter(t => t.start_date && t.start_date > today)
      .sort((a: any, b: any) => a.start_date.localeCompare(b.start_date));

    if (futureTimetables.length > 0) return futureTimetables[0];

    // Final fallback: most recently created
    return candidates.sort((a: any, b: any) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    )[0];
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
        // Day-based structure (keys can be DayOfWeek names, date strings, or RANGE:start:end)
        const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
        const RANGE_REGEX = /^RANGE:/;
        const DAYS_OF_WEEK: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

        // Track seen combinations to deduplicate date-based slots that map to the same day
        const seenSlotKeys = new Set<string>();

        Object.entries(timetableData).forEach(([key, dayData]: [string, any]) => {
          if (typeof dayData !== 'object' || dayData === null) return;

          // Skip RANGE keys (metadata, not actual day slots)
          if (RANGE_REGEX.test(key)) return;

          // Determine the DayOfWeek for this key
          let dayOfWeek: DayOfWeek;
          if (DATE_REGEX.test(key)) {
            // Date string like "2025-09-02" — convert to day name
            const date = new Date(key + 'T00:00:00');
            dayOfWeek = DAYS_OF_WEEK[date.getDay()];
          } else {
            // Already a day name like "MONDAY"
            dayOfWeek = key as DayOfWeek;
          }

          Object.entries(dayData).forEach(([periodId, slotData]: [string, any]) => {
            if (slotData && typeof slotData === 'object') {
              // Deduplicate: same day + period + course should only appear once
              const dedupeKey = `${dayOfWeek}|${periodId}|${slotData.course_id || ''}`;
              if (seenSlotKeys.has(dedupeKey)) return;
              seenSlotKeys.add(dedupeKey);

              slots.push({
                ...slotData,
                day: dayOfWeek,
                period_id: periodId
              });
            }
          });
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
        const course = courseMap.get(slot.course_id) as any;
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
