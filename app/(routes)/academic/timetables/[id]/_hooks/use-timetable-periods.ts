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
 * Updated: 2025-10-27 - timetablePeriods can be either string IDs or Period objects
 */
export function useTimetablePeriods(
  timetableId: string,
  availablePeriods: Period[],
  timetablePeriods?: Period[] | string[]
): UseTimetablePeriodsResult {
  const [selectedPeriods, setSelectedPeriods] = useState<Period[]>([]);
  const [lockedPeriods, setLockedPeriods] = useState<string[]>([]);
  const [savingPeriods, setSavingPeriods] = useState(false);

  /**
   * Load selected periods from timetable data or localStorage
   * Updated: 2025-10-27 - Fixed issue where period IDs (strings) were treated as objects
   */
  useEffect(() => {
    if (timetablePeriods && Array.isArray(timetablePeriods) && timetablePeriods.length > 0) {
      // Check if timetablePeriods contains IDs (strings) or full period objects
      const isIdArray = typeof timetablePeriods[0] === 'string';

      let mappedPeriods: Period[] = [];

      if (isIdArray) {
        // Database returns period IDs as strings - map them to full Period objects
        mappedPeriods = (timetablePeriods as string[])
          .map((periodId) =>
            availablePeriods.find(
              (p) => p.id === periodId || (p as any).period_id === periodId
            )
          )
          .filter(Boolean)
          .map((period: any) => ({
            ...period,
            id: period.period_id || period.id
          })) as Period[];
      } else {
        // Already full objects (legacy data or direct objects) - just normalize
        mappedPeriods = timetablePeriods
          .map((period: any) => ({
            ...period,
            id: period.period_id || period.id
          }))
          .filter((period: any) => period && period.id) as Period[];
      }

      setSelectedPeriods(mappedPeriods);

      // Keep localStorage in sync but don't clear it - it serves as backup
      if (typeof window !== 'undefined' && timetableId && mappedPeriods.length > 0) {
        const periodIds = mappedPeriods.map((period) => period.id);
        localStorage.setItem(
          `selectedPeriods-${timetableId}`,
          JSON.stringify(periodIds)
        );
      }
    } else if (typeof window !== 'undefined' && timetableId && availablePeriods.length > 0) {
      // Try loading from localStorage as fallback
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
