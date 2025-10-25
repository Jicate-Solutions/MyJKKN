import { useState, useEffect, useCallback } from 'react';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { PeriodService } from '@/lib/services/academic/period-service';
import { Timetable, Period, DayOfWeek } from '@/types/academics';
import toast from 'react-hot-toast';

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
   */
  const fetchTimetableData = useCallback(async (preserveUnsavedDates: boolean = false) => {
    console.log(
      '[useTimetableDetail] Starting fetch, preserveUnsavedDates:',
      preserveUnsavedDates
    );

    try {
      setLoading(true);
      setError(null);

      // Store current unsaved dates if preserving
      const currentSelectedDates = preserveUnsavedDates ? selectedDates : [];

      // Fetch timetable data
      const timetableData = await TimetableService.getTimetable(timetableId);
      console.log(
        '[useTimetableDetail] Fetched timetable data, slots count:',
        timetableData.slots?.length
      );

      setTimetable(timetableData);

      // Check attendance status
      const attendanceStatus = await TimetableService.hasAttendanceMarked(timetableId);
      setHasAttendance(attendanceStatus.hasAttendance);
      setMarkedPeriods(attendanceStatus.markedPeriods);

      // Update timetable format
      if (timetableData.timetable_format) {
        setTimetableFormat(timetableData.timetable_format);
      }

      // Update selected days/dates based on format
      if (timetableData.timetable_format === 'batch') {
        // Batch mode: Load selected dates
        if (preserveUnsavedDates && currentSelectedDates.length > 0) {
          setSelectedDates(currentSelectedDates);
        } else if (
          timetableData.selected_dates &&
          Array.isArray(timetableData.selected_dates)
        ) {
          setSelectedDates(timetableData.selected_dates);
        } else {
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

      // Load available periods
      try {
        const periodsResponse = await PeriodService.getPeriods({
          institution_id: timetableData.institution_id,
          limit: 100
        });
        setPeriods(periodsResponse.data || []);
      } catch (error) {
        console.error('[useTimetableDetail] Error fetching periods:', error);
      }

      // Set slots (use enriched slots from timetable data)
      setSlots(timetableData.slots || []);
      console.log(
        '[useTimetableDetail] Set slots state, new slots count:',
        timetableData.slots?.length
      );

      // Debug: Log sample subdivided slot
      if (timetableData.slots && timetableData.slots.length > 0) {
        const sampleSlot = timetableData.slots.find((s: any) => s.is_subdivided);
        if (sampleSlot) {
          console.log('[useTimetableDetail] Sample subdivided slot:', {
            slot_date: sampleSlot.slot_date,
            period_id: sampleSlot.period_id,
            is_subdivided: sampleSlot.is_subdivided,
            sub_slots_count: sampleSlot.sub_slots?.length
          });
        }
      }
    } catch (err) {
      console.error('[useTimetableDetail] Error fetching timetable data:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      toast.error('Failed to load timetable data');
    } finally {
      setLoading(false);
    }
  }, [timetableId, selectedDates]);

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
