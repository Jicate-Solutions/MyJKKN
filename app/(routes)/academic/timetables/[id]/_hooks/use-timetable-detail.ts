'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

// ─── State shape ─────────────────────────────────────────────────────────────

/**
 * All timetable detail state in a single object.
 * Batching into one shape lets fetchTimetableData do a single setState
 * at the end of each load cycle — collapsing 8 separate renders into 1.
 *
 * Performance fix: 2026-03-20
 */
interface TimetableDetailState {
  timetable: Timetable | null;
  periods: Period[];
  slots: any[];
  loading: boolean;
  error: string | null;
  hasAttendance: boolean;
  markedPeriods: string[];
  timetableFormat: 'regular' | 'batch' | 'cycle';
  selectedDays: DayOfWeek[];
  selectedDates: string[];
}

const DEFAULT_SELECTED_DAYS: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY'
];

const INITIAL_STATE: TimetableDetailState = {
  timetable: null,
  periods: [],
  slots: [],
  loading: true,
  error: null,
  hasAttendance: false,
  markedPeriods: [],
  timetableFormat: 'regular',
  selectedDays: DEFAULT_SELECTED_DAYS,
  selectedDates: [],
};

// ─── Public interface ─────────────────────────────────────────────────────────

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
  timetableFormat: 'regular' | 'batch' | 'cycle';
  selectedDays: DayOfWeek[];
  selectedDates: string[];

  // Actions
  fetchTimetableData: (preserveUnsavedDates?: boolean) => Promise<void>;
  setTimetableFormat: (format: 'regular' | 'batch' | 'cycle') => void;
  setSelectedDays: (days: DayOfWeek[]) => void;
  setSelectedDates: (dates: string[]) => void;
  setSlots: (slots: any[]) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Custom hook for managing timetable detail data.
 * Handles fetching timetable, periods, slots, and attendance status.
 *
 * Performance fix (2026-03-20):
 * - Collapsed 8 individual useState calls into one state object.
 * - fetchTimetableData now does a single batched setState at the end,
 *   reducing render count from 8 to 1 per load cycle.
 * - stateRef keeps fetchTimetableData stable (no stale-closure deps)
 *   while still reading latest selectedDates/selectedDays.
 */
export function useTimetableDetail(timetableId: string): UseTimetableDetailResult {
  const [state, setState] = useState<TimetableDetailState>(INITIAL_STATE);

  // Always-current ref — avoids adding state to useCallback deps
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * Fetch timetable data from server
   * @param preserveUnsavedDates - Whether to preserve current date selections (for batch mode)
   *
   * Fixed: 2025-10-27 - Removed selectedDates from dependency array to prevent stale closures
   * Fixed: 2026-02-03 - Added UUID validation to prevent errors from DRP placeholders
   * Fixed: 2026-02-25 - DRP placeholders now keep loading state instead of setting error.
   * Fixed: 2026-03-20 - Single batched setState replaces 8 scattered setState calls.
   *   Uses stateRef to read current selectedDates/selectedDays without adding them to deps.
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
      setState(prev => ({ ...prev, error: 'Invalid timetable ID. Please navigate from the timetables list.', loading: false }));
      return;
    }

    // Read current selected dates via ref (avoids stale closure without extra deps)
    const currentSelectedDates = preserveUnsavedDates ? stateRef.current.selectedDates : [];

    // Show loading — single setState here, one more at the end = 2 total renders
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Fetch main timetable record
      const timetableData = await TimetableService.getTimetable(timetableId);

      // Kick off parallel operations immediately after timetable resolves
      const attendanceStatusPromise = TimetableService.hasAttendanceMarked(timetableId);
      const periodsPromise = PeriodService.getPeriods({
        institution_id: timetableData.institution_id,
        limit: 100
      });

      // Resolve format-dependent days/dates
      const format: 'regular' | 'batch' | 'cycle' = timetableData.timetable_format || 'regular';
      let resolvedDays: DayOfWeek[] = stateRef.current.selectedDays;
      let resolvedDates: string[] = [];

      if (format === 'batch') {
        // Batch mode: Load selected dates
        // FIX: 2026-02-05 - Preserve unsaved dates even if empty (user may have deleted all ranges)
        if (preserveUnsavedDates) {
          resolvedDates = currentSelectedDates;
        } else if (
          timetableData.selected_dates &&
          Array.isArray(timetableData.selected_dates) &&
          timetableData.selected_dates.length > 0
        ) {
          resolvedDates = timetableData.selected_dates;
        } else {
          // AUTO-RECOVERY: selected_dates is null, undefined, or empty []
          // Fixed: 2026-02-10 - Always attempt recovery when selected_dates has no entries.
          resolvedDates = recoverDatesFromTimetableData(timetableData.timetable_data);
        }
      } else {
        // Regular mode: Load selected days
        if (timetableData.selected_days && Array.isArray(timetableData.selected_days)) {
          resolvedDays = timetableData.selected_days;
        }
      }

      // Await parallel ops together
      const [attendanceStatus, periodsResponse] = await Promise.all([
        attendanceStatusPromise,
        periodsPromise
      ]);

      // ── Single batched setState — only 1 render after all data is ready ──
      setState({
        timetable: timetableData,
        periods: periodsResponse.data || [],
        slots: timetableData.slots || [],
        loading: false,
        error: null,
        hasAttendance: attendanceStatus.hasAttendance,
        markedPeriods: attendanceStatus.markedPeriods,
        timetableFormat: format,
        selectedDays: resolvedDays,
        selectedDates: resolvedDates,
      });

    } catch (err) {
      logger.error('academic/timetables', 'Error fetching timetable data', err);
      toast.error('Failed to load timetable data');
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'An error occurred',
      }));
    }
  }, [timetableId]); // stateRef always current — no need to add state to deps

  // Initial load — only re-run when timetableId changes (not on fetchTimetableData recreation)
  useEffect(() => {
    fetchTimetableData();
  }, [timetableId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stable individual setters (backward-compatible API) ──────────────────

  const setTimetableFormat = useCallback((format: 'regular' | 'batch' | 'cycle') => {
    setState(prev => ({ ...prev, timetableFormat: format }));
  }, []);

  const setSelectedDays = useCallback((days: DayOfWeek[]) => {
    setState(prev => ({ ...prev, selectedDays: days }));
  }, []);

  const setSelectedDates = useCallback((dates: string[]) => {
    setState(prev => ({ ...prev, selectedDates: dates }));
  }, []);

  const setSlots = useCallback((slots: any[]) => {
    setState(prev => ({ ...prev, slots }));
  }, []);

  return {
    // Spread state fields for backward-compatible destructuring
    timetable: state.timetable,
    periods: state.periods,
    slots: state.slots,
    loading: state.loading,
    error: state.error,
    hasAttendance: state.hasAttendance,
    markedPeriods: state.markedPeriods,
    timetableFormat: state.timetableFormat,
    selectedDays: state.selectedDays,
    selectedDates: state.selectedDates,

    // Actions
    fetchTimetableData,
    setTimetableFormat,
    setSelectedDays,
    setSelectedDates,
    setSlots,
  };
}
