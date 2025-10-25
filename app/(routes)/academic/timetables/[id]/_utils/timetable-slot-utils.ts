import { Period, DayOfWeek } from '@/types/academics';

/**
 * Build slot data for saving to database
 */
export function buildSlotData(config: {
  period: Period;
  day: DayOfWeek | string;
  timetableId: string;
  courseId?: string;
  staffIds?: string[];
  sectionIds?: string[];
  isBreak?: boolean;
  breakDescription?: string;
  isSubdivided?: boolean;
  subdivisionConfig?: any;
}): any {
  const {
    period,
    day,
    timetableId,
    courseId,
    staffIds,
    sectionIds,
    isBreak,
    breakDescription,
    isSubdivided,
    subdivisionConfig
  } = config;

  const baseSlot = {
    timetable_id: timetableId,
    period_id: period.id,
    slot_date: day, // For batch mode, this is date; for regular, it's day of week
    is_break_slot: isBreak || false
  };

  // Break slot
  if (isBreak) {
    return {
      ...baseSlot,
      break_description: breakDescription || 'Break',
      course_id: null,
      staff_ids: [],
      section_ids: []
    };
  }

  // Subdivided slot
  if (isSubdivided && subdivisionConfig) {
    return {
      ...baseSlot,
      is_subdivided: true,
      subdivision_type: subdivisionConfig.subdivision_type,
      subdivision_mode: subdivisionConfig.subdivision_mode,
      sub_slots: subdivisionConfig.sub_slots,
      section_ids: sectionIds || [],
      // Store parent course/staff if applicable
      course_id: courseId || null,
      staff_ids: staffIds || []
    };
  }

  // Regular slot
  return {
    ...baseSlot,
    course_id: courseId || null,
    staff_ids: staffIds || [],
    section_ids: sectionIds || [],
    is_subdivided: false
  };
}

/**
 * Validate slot data before saving
 */
export function validateSlotData(slotData: any): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check required fields
  if (!slotData.timetable_id) {
    errors.push('Timetable ID is required');
  }

  if (!slotData.period_id) {
    errors.push('Period ID is required');
  }

  if (!slotData.slot_date) {
    errors.push('Slot date/day is required');
  }

  // Validate non-break slots
  if (!slotData.is_break_slot) {
    if (slotData.is_subdivided) {
      // Validate subdivided slot
      if (!slotData.sub_slots || slotData.sub_slots.length === 0) {
        errors.push('Subdivided slot must have at least one sub-slot');
      } else {
        // Validate each sub-slot
        slotData.sub_slots.forEach((subSlot: any, index: number) => {
          if (!subSlot.course_id && !subSlot.is_break_slot) {
            errors.push(`Sub-slot ${index + 1} requires a course`);
          }

          if (!subSlot.staff_ids || subSlot.staff_ids.length === 0) {
            if (!subSlot.is_break_slot) {
              errors.push(`Sub-slot ${index + 1} requires at least one staff member`);
            }
          }
        });
      }
    } else {
      // Validate regular slot
      if (!slotData.course_id) {
        errors.push('Course is required for non-break slots');
      }

      if (!slotData.staff_ids || slotData.staff_ids.length === 0) {
        errors.push('At least one staff member is required');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Find existing slot for a specific day and period
 */
export function findExistingSlot(
  slots: any[],
  day: DayOfWeek | string,
  periodId: string
): any | undefined {
  return slots.find(
    (slot) => slot.slot_date === day && slot.period_id === periodId
  );
}

/**
 * Check if a slot is subdivided
 */
export function isSubdividedSlot(slot: any): boolean {
  return !!(
    slot?.is_subdivided &&
    slot?.sub_slots &&
    slot.sub_slots.length > 0
  );
}

/**
 * Get slot display name
 */
export function getSlotDisplayName(slot: any): string {
  if (slot.is_break_slot) {
    return slot.break_description || 'Break';
  }

  if (isSubdividedSlot(slot)) {
    const subSlotCount = slot.sub_slots.length;
    return `${subSlotCount} ${slot.subdivision_type || 'groups'}`;
  }

  return slot.course?.course_name || 'Unknown Course';
}

/**
 * Extract student IDs from slot (including sub-slots)
 */
export function extractStudentIds(slot: any): string[] {
  const studentIds: string[] = [];

  if (isSubdividedSlot(slot)) {
    slot.sub_slots.forEach((subSlot: any) => {
      if (subSlot.student_ids && Array.isArray(subSlot.student_ids)) {
        studentIds.push(...subSlot.student_ids);
      }
    });
  } else if (slot.student_ids && Array.isArray(slot.student_ids)) {
    studentIds.push(...slot.student_ids);
  }

  return [...new Set(studentIds)]; // Remove duplicates
}

/**
 * Check if slot has student assignments
 */
export function hasStudentAssignments(slot: any): boolean {
  if (isSubdividedSlot(slot)) {
    return slot.sub_slots.some(
      (ss: any) => ss.student_ids && ss.student_ids.length > 0
    );
  }

  return !!(slot.student_ids && slot.student_ids.length > 0);
}

/**
 * Get staff names from slot
 */
export function getStaffNames(slot: any, allStaff: any[]): string[] {
  const staffIds = slot.staff_ids || [];

  return staffIds
    .map((staffId: string) => {
      const staff = allStaff.find((s) => s.id === staffId);
      return staff?.full_name || staff?.name || 'Unknown';
    })
    .filter(Boolean);
}

/**
 * Format slot for display in grid
 */
export function formatSlotForGrid(slot: any): {
  title: string;
  subtitle?: string;
  staffInfo?: string;
  badges?: string[];
  isBreak: boolean;
  isSubdivided: boolean;
} {
  if (slot.is_break_slot) {
    return {
      title: slot.break_description || 'Break',
      isBreak: true,
      isSubdivided: false
    };
  }

  if (isSubdividedSlot(slot)) {
    const subSlotCount = slot.sub_slots.length;
    const type = slot.subdivision_type || 'groups';

    return {
      title: `${subSlotCount} ${type}`,
      subtitle: `${slot.subdivision_mode || 'auto'} mode`,
      badges: slot.sub_slots.map((ss: any) => ss.group_name).filter(Boolean),
      isBreak: false,
      isSubdivided: true
    };
  }

  return {
    title: slot.course?.course_name || 'Unknown Course',
    subtitle: slot.course?.course_code,
    staffInfo: slot.staff
      ?.map((s: any) => s.full_name || s.name)
      .join(', '),
    isBreak: false,
    isSubdivided: false
  };
}
