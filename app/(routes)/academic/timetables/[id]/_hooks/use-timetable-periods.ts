import { useState, useEffect, useCallback } from 'react';
import { Period } from '@/types/academics';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import toast from 'react-hot-toast';

interface UseTimetablePeriodsResult {
  // Selected Periods
  selectedPeriods: Period[];
  setSelectedPeriods: (periods: Period[]) => void;

  // Locked Periods (have attendance)
  lockedPeriods: string[];
  setLockedPeriods: (ids: string[]) => void;

  // Actions
  savePeriodSelections: (
    timetableId: string,
    selectedDays: any[],
    selectedDates: any[],
    timetableFormat: 'regular' | 'batch'
  ) => Promise<void>;

  // State
  savingPeriods: boolean;
}

/**
 * Custom hook for managing timetable period selections
 * Handles selected periods, locked periods, and local storage
 */
export function useTimetablePeriods(
  timetableId: string,
  availablePeriods: Period[],
  timetablePeriods?: Period[]
): UseTimetablePeriodsResult {
  const [selectedPeriods, setSelectedPeriods] = useState<Period[]>([]);
  const [lockedPeriods, setLockedPeriods] = useState<string[]>([]);
  const [savingPeriods, setSavingPeriods] = useState(false);

  /**
   * Load selected periods from timetable data or localStorage
   */
  useEffect(() => {
    if (timetablePeriods && Array.isArray(timetablePeriods) && timetablePeriods.length > 0) {
      // Map periods to expected format
      const mappedPeriods = timetablePeriods
        .map((period: any) => ({
          ...period,
          id: period.period_id || period.id
        }))
        .filter((period: any) => period && period.id);

      setSelectedPeriods(mappedPeriods);

      // Clear localStorage since we're using timetable's saved periods
      if (typeof window !== 'undefined' && timetableId) {
        localStorage.removeItem(`selectedPeriods-${timetableId}`);
      }
    } else if (typeof window !== 'undefined' && timetableId && availablePeriods.length > 0) {
      // Try loading from localStorage
      const storedPeriods = localStorage.getItem(`selectedPeriods-${timetableId}`);
      if (storedPeriods) {
        try {
          const periodIds = JSON.parse(storedPeriods);
          const orderedPeriods = periodIds
            .map((id: string) =>
              availablePeriods.find(
                (period) => period.id === id || (period as any).period_id === id
              )
            )
            .filter(Boolean)
            .map((period: any) => ({
              ...period,
              id: period.period_id || period.id
            }));

          if (orderedPeriods.length > 0) {
            setSelectedPeriods(orderedPeriods);
          }
        } catch (err) {
          console.error('[useTimetablePeriods] Error parsing stored periods:', err);
        }
      }
    }
  }, [timetablePeriods, availablePeriods, timetableId]);

  /**
   * Load locked periods from localStorage
   */
  useEffect(() => {
    if (typeof window !== 'undefined' && timetableId) {
      const storedLockedPeriods = localStorage.getItem(`lockedPeriods-${timetableId}`);
      if (storedLockedPeriods) {
        try {
          const lockedIds = JSON.parse(storedLockedPeriods);
          setLockedPeriods(lockedIds);
        } catch (err) {
          console.error('[useTimetablePeriods] Error parsing locked periods:', err);
        }
      }
    }
  }, [timetableId]);

  /**
   * Save selected periods to localStorage
   */
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      timetableId &&
      selectedPeriods.length > 0
    ) {
      const periodIds = selectedPeriods.map((period) => period.id);
      localStorage.setItem(
        `selectedPeriods-${timetableId}`,
        JSON.stringify(periodIds)
      );
    }
  }, [selectedPeriods, timetableId]);

  /**
   * Save locked periods to localStorage
   */
  useEffect(() => {
    if (typeof window !== 'undefined' && timetableId) {
      if (lockedPeriods.length > 0) {
        localStorage.setItem(
          `lockedPeriods-${timetableId}`,
          JSON.stringify(lockedPeriods)
        );
      } else {
        localStorage.removeItem(`lockedPeriods-${timetableId}`);
      }
    }
  }, [lockedPeriods, timetableId]);

  /**
   * Save period selections to database
   */
  const savePeriodSelections = useCallback(async (
    timetableId: string,
    selectedDays: any[],
    selectedDates: any[],
    timetableFormat: 'regular' | 'batch'
  ) => {
    try {
      setSavingPeriods(true);

      // Prepare period IDs
      const periodIds = selectedPeriods.map((period) => period.id);

      // Build update data
      const updateData: any = {
        periods: periodIds,
        timetable_format: timetableFormat
      };

      // Add format-specific data
      if (timetableFormat === 'batch') {
        updateData.selected_dates = selectedDates;
      } else {
        updateData.selected_days = selectedDays;
      }

      // Update timetable
      await TimetableService.updateTimetable(timetableId, updateData);

      toast.success('Timetable configuration saved successfully');
    } catch (error) {
      console.error('[useTimetablePeriods] Error saving period selections:', error);
      toast.error('Failed to save timetable configuration');
      throw error;
    } finally {
      setSavingPeriods(false);
    }
  }, [selectedPeriods]);

  return {
    selectedPeriods,
    setSelectedPeriods,
    lockedPeriods,
    setLockedPeriods,
    savePeriodSelections,
    savingPeriods
  };
}
