import { useState, useEffect, useCallback } from 'react';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { PeriodService } from '@/lib/services/academic/period-service';
import { logger } from '@/lib/utils/enhanced-logger';
import { Timetable, Period, DayOfWeek } from '@/types/academics';
import toast from 'react-hot-toast';

/**
 * Validates if a string is a valid UUID format
 * Also rejects TanStack Table's temporary drag IDs (%%drp:id:xxxxx%%)
 */
function isValidUUID(id: string): boolean {
  if (!id) return false;
  // Reject TanStack Table temporary drag IDs
  if (id.includes('%%drp:id:')) return false;
  // Check UUID format
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Recovers date ranges from timetable_data keys when selected_dates is empty
 * Groups consecutive dates into RANGE markers
 *
 * Fixed: 2025-12-04 - Auto-recover dates from timetable_data when selected_dates is empty
 * This prevents batch mode timetables from showing "No dates selected" when data exists
 */
function recoverDatesFromTimetableData(timetableData: Record<string, any> | null): string[] {
  if (!timetableData) return [];

  // Extract date keys (format: YYYY-MM-DD)
  const dateKeys = Object.keys(timetableData)
    .filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key))
    .sort();

  if (dateKeys.length === 0) return [];

  // Group consecutive dates into ranges
  const ranges: string[] = [];
  let rangeStart = dateKeys[0];
  let rangeEnd = dateKeys[0];

  for (let i = 1; i < dateKeys.length; i++) {
    const current = new Date(dateKeys[i]);
    const previous = new Date(rangeEnd);
    const diffDays = (current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays === 1) {
      // Consecutive date, extend range
      rangeEnd = dateKeys[i];
    } else {
      // Gap found, save current range and start new one
      ranges.push(`RANGE:${rangeStart}:${rangeEnd}`);
      rangeStart = dateKeys[i];
      rangeEnd = dateKeys[i];
    }
  }

  // Don't forget the last range
  ranges.push(`RANGE:${rangeStart}:${rangeEnd}`);

  return ranges;
}

interface UseTimetableDetailResult {
  // Data
  timetable: Timetable | null;
  periods: Period[];
  slots: any[];

  // Loading & Error States
  loading: boolean;
  error: string | null;

  // Attendance Status
  hasAttendance: boolean;
  markedPeriods: string[];

  // Format & Configuration
  timetableFormat: 'regular' | 'batch';
  selectedDays: DayOfWeek[];
  selectedDates: string[];

  // Actions
  fetchTimetableData: (preserveUnsavedDates?: boolean) => Promise<void>;
  setTimetableFormat: (format: 'regular' | 'batch') => void;
  setSelectedDays: (days: DayOfWeek[]) => void;
  setSelectedDates: (dates: string[]) => void;
  setSlots: (slots: any[]) => void;
}

/**
 * Custom hook for managing timetable detail data
 * Handles fetching timetable, periods, slots, and attendance status
 */
export function useTimetableDetail(timetableId: string): UseTimetableDetailResult {
  // State
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAttendance, setHasAttendance] = useState(false);
  const [markedPeriods, setMarkedPeriods] = useState<string[]>([]);
  const [timetableFormat, setTimetableFormat] = useState<'regular' | 'batch'>('regular');
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY'
  ]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

  /**
   * Fetch timetable data from server
   * @param preserveUnsavedDates - Whether to preserve current date selections (for batch mode)
   *
   * Fixed: 2025-10-27 - Removed selectedDates from dependency array to prevent stale closures
   * Now uses a ref pattern to access current selectedDates value
   * Fixed: 2026-02-03 - Added UUID validation to prevent errors from TanStack Table drag IDs
   */
  const fetchTimetableData = useCallback(async (preserveUnsavedDates: boolean = false) => {
    // Validate timetable ID before making API calls
    // This prevents errors from TanStack Table's temporary drag IDs (%%drp:id:xxxxx%%)
    if (!isValidUUID(timetableId)) {
      logger.error('academic/timetables', 'Invalid timetable ID format', { timetableId });
      setError('Invalid timetable ID. Please navigate from the timetables list.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Use functional setState to access current selectedDates without adding to dependencies
      let currentSelectedDates: string[] = [];
      if (preserveUnsavedDates) {
        setSelectedDates((prev) => {
          currentSelectedDates = prev;
          return prev; // Don't change state, just capture current value
        });
      }

      // Fetch timetable data
      const timetableData = await TimetableService.getTimetable(timetableId);

      setTimetable(timetableData);

      // Check attendance status in parallel with other operations
      const attendanceStatusPromise = TimetableService.hasAttendanceMarked(timetableId);

      // Update timetable format
      if (timetableData.timetable_format) {
        setTimetableFormat(timetableData.timetable_format);
      }

      // Update selected days/dates based on format
      if (timetableData.timetable_format === 'batch') {
        // Batch mode: Load selected dates
        // FIX: 2026-02-05 - Preserve unsaved dates even if empty (user may have deleted all ranges)
        if (preserveUnsavedDates) {
          // When preserving unsaved dates, use current state (even if empty)
          // This allows users to delete all date ranges
          setSelectedDates(currentSelectedDates);
        } else if (
          timetableData.selected_dates &&
          Array.isArray(timetableData.selected_dates)
        ) {
          // Use database value (even if empty - user may have intentionally cleared all dates)
          setSelectedDates(timetableData.selected_dates);
        } else if (timetableData.selected_dates === null || timetableData.selected_dates === undefined) {
          // AUTO-RECOVERY: Only recover if selected_dates is null/undefined (not just empty array)
          // This distinguishes between "no data" (null) and "intentionally empty" ([])
          // Fixed: 2026-02-05 - Don't auto-recover if selected_dates is explicitly set to []
          const recoveredDates = recoverDatesFromTimetableData(timetableData.timetable_data);
          if (recoveredDates.length > 0) {
            setSelectedDates(recoveredDates);
          } else {
            setSelectedDates([]);
          }
        } else {
          // Fallback: empty array
          setSelectedDates([]);
        }
      } else {
        // Regular mode: Load selected days
        if (
          timetableData.selected_days &&
          Array.isArray(timetableData.selected_days)
        ) {
          setSelectedDays(timetableData.selected_days);
        }
      }

      // Load available periods in parallel
      const periodsPromise = PeriodService.getPeriods({
        institution_id: timetableData.institution_id,
        limit: 100
      });

      // Wait for parallel operations
      try {
        const [attendanceStatus, periodsResponse] = await Promise.all([
          attendanceStatusPromise,
          periodsPromise
        ]);

        setHasAttendance(attendanceStatus.hasAttendance);
        setMarkedPeriods(attendanceStatus.markedPeriods);
        setPeriods(periodsResponse.data || []);
      } catch (error) {
        logger.error('academic/timetables', 'Error fetching parallel data', error);
      }

      // Set slots (use enriched slots from timetable data)
      setSlots(timetableData.slots || []);
    } catch (err) {
      logger.error('academic/timetables', 'Error fetching timetable data', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      toast.error('Failed to load timetable data');
    } finally {
      setLoading(false);
    }
  }, [timetableId]); // Removed selectedDates from dependencies

  // Initial load
  useEffect(() => {
    fetchTimetableData();
  }, [timetableId]); // Only depend on timetableId, not the full callback

  return {
    // Data
    timetable,
    periods,
    slots,

    // Loading & Error
    loading,
    error,

    // Attendance Status
    hasAttendance,
    markedPeriods,

    // Format & Configuration
    timetableFormat,
    selectedDays,
    selectedDates,

    // Actions
    fetchTimetableData,
    setTimetableFormat,
    setSelectedDays,
    setSelectedDates,
    setSlots
  };
}
