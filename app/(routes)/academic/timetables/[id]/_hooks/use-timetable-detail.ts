import { useState, useEffect, useCallback } from 'react';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { PeriodService } from '@/lib/services/academic/period-service';
import { logger } from '@/lib/utils/enhanced-logger';
import { Timetable, Period, DayOfWeek } from '@/types/academics';
import toast from 'react-hot-toast';

/**
 * Validates if a string is a valid UUID format.
 * Returns false for Next.js DRP (Dynamic Route Parameter) placeholders
 * like %%drp:id:xxxx%%, which appear during client-side navigation
 * with cacheComponents enabled.
 */
function isValidUUID(id: string): boolean {
  if (!id) return false;
  // Reject Next.js DRP placeholders (generated in fallback-params.js)
  if (id.includes('%%drp:')) return false;
  // Check UUID format
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Recovers date ranges from timetable_data keys when selected_dates is empty or missing
 *
 * Fixed: 2025-12-04 - Auto-recover dates from timetable_data when selected_dates is empty
 * Fixed: 2026-02-10 - Also recover when selected_dates is [] (empty array) but timetable_data has dates
 *   Previously only recovered for null/undefined, treating [] as "intentionally empty".
 *   But [] can also mean the user never clicked "Save Configuration" after adding ranges.
 *   Now checks timetable_data for RANGE keys first, then falls back to grouping individual dates.
 */
function recoverDatesFromTimetableData(timetableData: Record<string, any> | null): string[] {
  if (!timetableData) return [];

  // First, check for existing RANGE markers in timetable_data keys
  // These are the most reliable source since they were explicitly created
  const rangeKeys = Object.keys(timetableData)
    .filter(key => key.startsWith('RANGE:'))
    .sort();

  if (rangeKeys.length > 0) {
    logger.info('academic/timetables', 'Recovered date ranges from RANGE keys in timetable_data', {
      rangeCount: rangeKeys.length,
      ranges: rangeKeys
    });
    return rangeKeys;
  }

  // Fallback: Extract individual date keys and group consecutive ones into ranges
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

  logger.info('academic/timetables', 'Recovered date ranges from individual date keys', {
    dateCount: dateKeys.length,
    rangeCount: ranges.length,
    ranges
  });

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
   * Fixed: 2026-02-03 - Added UUID validation to prevent errors from DRP placeholders
   * Fixed: 2026-02-25 - DRP placeholders now keep loading state instead of setting error.
   *   The %%drp:id:xxxx%% pattern comes from Next.js fallback-params.js (not TanStack Table).
   *   It's a transient state during client-side navigation that resolves automatically.
   */
  const fetchTimetableData = useCallback(async (preserveUnsavedDates: boolean = false) => {
    // Validate timetable ID before making API calls
    if (!isValidUUID(timetableId)) {
      // If this is a Next.js DRP placeholder, keep loading (it will resolve)
      if (timetableId.includes('%%drp:')) {
        logger.dev('academic/timetables', 'DRP placeholder detected, waiting for resolution', { timetableId });
        return; // Keep loading=true, don't set error
      }
      // Truly invalid ID (not a DRP placeholder)
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
          Array.isArray(timetableData.selected_dates) &&
          timetableData.selected_dates.length > 0
        ) {
          // Use non-empty database value directly
          setSelectedDates(timetableData.selected_dates);
        } else {
          // AUTO-RECOVERY: selected_dates is null, undefined, or empty []
          // Fixed: 2026-02-10 - Always attempt recovery when selected_dates has no entries.
          // Previously, [] was treated as "intentionally empty", but this caused a bug where
          // date ranges were stored in timetable_data (via slot creation) but never saved to
          // selected_dates (user didn't click "Save Configuration"). The result was date ranges
          // invisible in the UI but blocking new range creation via checkDatesWithSlots.
          // Now we check timetable_data for RANGE keys or date keys to recover missing ranges.
          const recoveredDates = recoverDatesFromTimetableData(timetableData.timetable_data);
          if (recoveredDates.length > 0) {
            setSelectedDates(recoveredDates);
          } else {
            setSelectedDates([]);
          }
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
