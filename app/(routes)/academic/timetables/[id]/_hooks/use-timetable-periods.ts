'use client';

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
    timetableFormat: 'regular' | 'batch' | 'cycle'
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

            let base: Period | null = null;

            // Legacy format: has period_id instead of id
            if (period.period_id && !period.id) {
              legacyCount++;

              base = {
                id: period.period_id,
                period_name: period.period_name,
                start_time: period.start_time,
                end_time: period.end_time,
                is_break: period.is_break || false,
                institution_id: period.institution_id,
                created_at: period.created_at || new Date().toISOString(),
                updated_at: period.updated_at || new Date().toISOString()
              } as Period;
            } else if (period.id) {
              // New format: already has id field
              modernCount++;
              base = period as Period;
            }

            if (!base) return null;

            // Fixed: 2026-08-19 - timetables.periods is a denormalized SNAPSHOT of the
            // period rows, written when the timetable was configured. Editing a timing in
            // the Period master (academic/periods) does NOT rewrite that snapshot, so the
            // grid kept rendering pre-edit times while "Search Period" — which joins the
            // master by id — rendered the corrected ones (JKKN AHS, Aug 2026). The master
            // is the authority for name/timings: overlay it here, keeping the snapshot's
            // ordering and any field the master does not own. Periods deleted from the
            // master have no live row, so their snapshot values are left untouched.
            const master = availablePeriods.find((p) => p.id === base!.id);
            if (!master) return base;

            // REPURPOSE GUARD: a differing name means the master row was edited into a
            // DIFFERENT period, not merely re-timed (AHS turned its "AHS P6" row into
            // "AHS BREAK" and created a new P6 elsewhere). Slots already scheduled
            // against it must keep their own definition; repointing them is a data
            // repair, not something this read path may infer.
            const snapshotName = String(base.period_name ?? '').trim();
            const masterName = String(master.period_name ?? '').trim();
            if (snapshotName && masterName && snapshotName !== masterName) {
              return base;
            }

            return {
              ...base,
              period_name: master.period_name,
              start_time: master.start_time,
              end_time: master.end_time,
              is_break: master.is_break ?? base.is_break
            } as Period;
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
    timetableFormat: 'regular' | 'batch' | 'cycle'
  ) => {
    try {
      setSavingPeriods(true);

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
      } else {
        updateData.selected_days = selectedDays;
      }

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
