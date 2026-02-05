import { useState, useEffect, useCallback } from 'react';
import { Period } from '@/types/academics';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { logger } from '@/lib/utils/enhanced-logger';
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
 *
 * Updates:
 * - 2025-10-27: timetablePeriods can be either string IDs or Period objects
 * - 2025-10-27: Added support for legacy format with period_id field (maps to id)
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
   *
   * Updates:
   * - 2025-10-27: Fixed issue where period IDs (strings) were treated as objects
   * - 2025-10-27: Added support for legacy format with period_id field instead of id
   */
  useEffect(() => {
    if (timetablePeriods && Array.isArray(timetablePeriods) && timetablePeriods.length > 0) {
      // Check if timetablePeriods contains IDs (strings) or full period objects
      const isIdArray = typeof timetablePeriods[0] === 'string';

      let mappedPeriods: Period[] = [];

      if (isIdArray) {
        // Database returns period IDs as strings - map them to full Period objects
        // Updated: 2025-10-27 - Removed period_id fallback as Period type only has id
        mappedPeriods = (timetablePeriods as string[])
          .map((periodId) =>
            availablePeriods.find((p) => p.id === periodId)
          )
          .filter(Boolean) as Period[];
      } else {
        // Already full objects (legacy data or direct objects)
        // Handle both new format (period.id) and legacy format (period.period_id)
        let legacyCount = 0;
        let modernCount = 0;

        mappedPeriods = timetablePeriods
          .map((period: any) => {
            if (!period) return null;

            // Legacy format: has period_id instead of id
            if (period.period_id && !period.id) {
              legacyCount++;

              return {
                id: period.period_id,
                period_name: period.period_name,
                start_time: period.start_time,
                end_time: period.end_time,
                is_break: period.is_break || false,
                institution_id: period.institution_id,
                created_at: period.created_at || new Date().toISOString(),
                updated_at: period.updated_at || new Date().toISOString()
              } as Period;
            }

            // New format: already has id field
            if (period.id) {
              modernCount++;
              return period as Period;
            }

            return null;
          })
          .filter(Boolean) as Period[];

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
              availablePeriods.find((period) => period.id === id)
            )
            .filter(Boolean) as Period[];

          if (orderedPeriods.length > 0) {
            setSelectedPeriods(orderedPeriods);
          }
        } catch (err) {
          logger.error('academic/timetables', 'Error parsing stored periods', err);
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
          logger.error('academic/timetables', 'Error parsing locked periods', err);
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

      console.log('[DEBUG HOOK] savePeriodSelections received:');
      console.log('[DEBUG HOOK] selectedDays:', selectedDays);
      console.log('[DEBUG HOOK] selectedDates:', selectedDates);
      console.log('[DEBUG HOOK] timetableFormat:', timetableFormat);

      // CRITICAL FIX: 2025-11-17 - Database stores full period objects, not just IDs
      // Format periods as full objects with all required fields
      // Use 'id' (modern format) instead of 'period_id' (legacy format) to avoid conversion
      const periodsData = selectedPeriods.map((period, index) => ({
        id: period.id,
        period_name: period.period_name,
        start_time: period.start_time,
        end_time: period.end_time,
        is_break: period.is_break,
        sort_order: index,
        institution_id: period.institution_id,
        created_at: period.created_at,
        updated_at: period.updated_at
      }));

      // Build update data
      const updateData: any = {
        periods: periodsData,
        timetable_format: timetableFormat
      };

      // Add format-specific data
      if (timetableFormat === 'batch') {
        updateData.selected_dates = selectedDates;
        console.log('[DEBUG HOOK] Setting selected_dates in updateData:', selectedDates);
      } else {
        updateData.selected_days = selectedDays;
      }

      console.log('[DEBUG HOOK] Final updateData:', JSON.stringify(updateData, null, 2));

      // Update timetable
      await TimetableService.updateTimetable(timetableId, updateData);

      toast.success('Timetable configuration saved successfully');
    } catch (error) {
      logger.error('academic/timetables', 'Error saving period selections', error);
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
