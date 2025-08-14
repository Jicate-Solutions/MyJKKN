// Attendance Helper Functions

import type { AttendancePeriodOption } from '@/types/attendance';

/**
 * Safely find a period by timetable slot ID
 */
export function findPeriodBySlotId(
  periods: AttendancePeriodOption[] | undefined | null,
  slotId: string | undefined | null
): AttendancePeriodOption | undefined {
  if (!periods || !Array.isArray(periods) || !slotId) {
    return undefined;
  }
  
  return periods.find(
    (p) => p && typeof p === 'object' && p.timetable_slot_id === slotId
  );
}

/**
 * Safely filter periods
 */
export function filterPeriods(
  periods: AttendancePeriodOption[] | undefined | null,
  predicate: (period: AttendancePeriodOption) => boolean
): AttendancePeriodOption[] {
  if (!periods || !Array.isArray(periods)) {
    return [];
  }
  
  return periods.filter(
    (p) => p && typeof p === 'object' && predicate(p)
  );
}

/**
 * Get period display name
 */
export function getPeriodDisplayName(period: AttendancePeriodOption | undefined | null): string {
  if (!period) {
    return 'Unknown Period';
  }
  
  const periodName = period.period_name || 'Unknown';
  const courseName = period.course?.course_name || '';
  
  return courseName ? `${periodName} - ${courseName}` : periodName;
}

/**
 * Get period time range
 */
export function getPeriodTimeRange(period: AttendancePeriodOption | undefined | null): string {
  if (!period) {
    return '';
  }
  
  const start = period.start_time || '';
  const end = period.end_time || '';
  
  if (start && end) {
    return `${start} - ${end}`;
  }
  
  return start || end || '';
}

/**
 * Check if periods array is valid and has items
 */
export function hasAvailablePeriods(
  periods: AttendancePeriodOption[] | undefined | null
): boolean {
  return Boolean(periods && Array.isArray(periods) && periods.length > 0);
}

/**
 * Get staff names from period
 */
export function getPeriodStaffNames(period: AttendancePeriodOption | undefined | null): string {
  if (!period) {
    return 'Not assigned';
  }
  
  // Check for staff_members array (new format)
  if (period.staff_members && Array.isArray(period.staff_members) && period.staff_members.length > 0) {
    return period.staff_members
      .map((staff: any) => {
        const firstName = staff.first_name || '';
        const lastName = staff.last_name || '';
        return `${firstName} ${lastName}`.trim() || 'Unknown';
      })
      .join(', ');
  }
  
  // Check for single staff (old format)
  if (period.staff) {
    const firstName = period.staff.first_name || '';
    const lastName = period.staff.last_name || '';
    return `${firstName} ${lastName}`.trim() || 'Unknown';
  }
  
  return 'Not assigned';
}