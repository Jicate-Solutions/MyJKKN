/**
 * Timetable Detail Page - Utility Functions
 *
 * Extracted complex logic from main component for better organization,
 * testability, and maintainability.
 */

// Timetable utilities
export {
  sortPeriodsByName,
  generateDateRange,
  validateDateRange,
  checkDatesWithSlots,
  calculateDaysInRange,
  exportTimetableToPDF,
  createRangeMarker,
  parseRangeMarker,
  isPeriodLocked
} from './timetable-utils';

// Slot utilities
export {
  buildSlotData,
  validateSlotData,
  findExistingSlot,
  isSubdividedSlot,
  getSlotDisplayName,
  extractStudentIds,
  hasStudentAssignments,
  getStaffNames,
  formatSlotForGrid
} from './timetable-slot-utils';

// Performance utilities
export {
  debounce,
  useDebounce,
  useDebouncedCallback,
  throttle,
  useThrottledCallback,
  arePropsEqual,
  shallowEqual
} from './performance-utils';
