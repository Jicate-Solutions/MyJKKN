'use client';

/**
 * Period Selector Component
 *
 * Intelligent period selection based on timetable data.
 * Supports: Fullday, Forenoon, Afternoon, Periodwise selection.
 *
 * @module components/academic/leave-onduty/period-selector
 */

import { useState, useEffect } from 'react';
import { usePeriodsForDate } from '@/hooks/academic/use-leave-onduty';
import { PeriodType, PERIOD_TYPES } from '@/types/leave-onduty';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface PeriodSelectorProps {
  sectionId: string;
  semesterId: string;
  selectedDate: string;
  periodType: PeriodType;
  selectedPeriods: string[];
  onPeriodTypeChange: (type: PeriodType) => void;
  onPeriodsChange: (periods: string[]) => void;
  disabled?: boolean;
  className?: string;
}

export function PeriodSelector({
  sectionId,
  semesterId,
  selectedDate,
  periodType,
  selectedPeriods,
  onPeriodTypeChange,
  onPeriodsChange,
  disabled = false,
  className,
}: PeriodSelectorProps) {
  const {
    data: periodDetection,
    isLoading,
    error,
  } = usePeriodsForDate(sectionId, semesterId, selectedDate, periodType);

  // Debug logging
  console.log('[PeriodSelector] Props:', {
    sectionId,
    semesterId,
    selectedDate,
    periodType,
    selectedPeriods,
  });
  console.log('[PeriodSelector] Query result:', {
    periodDetection,
    isLoading,
    error,
  });

  // Auto-update selected periods when period type changes
  useEffect(() => {
    if (periodDetection?.valid && periodType !== 'periodwise') {
      onPeriodsChange(periodDetection.periods);
    }
  }, [periodType, periodDetection, onPeriodsChange]);

  const handlePeriodTypeChange = (value: string) => {
    const newType = value as PeriodType;
    onPeriodTypeChange(newType);

    // Clear manual selection when switching away from periodwise
    if (newType !== 'periodwise') {
      onPeriodsChange([]);
    }
  };

  const handlePeriodToggle = (periodSlotId: string, checked: boolean) => {
    if (checked) {
      onPeriodsChange([...selectedPeriods, periodSlotId]);
    } else {
      onPeriodsChange(selectedPeriods.filter((p) => p !== periodSlotId));
    }
  };

  if (!selectedDate) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Please select a date first
        </div>
      </div>
    );
  }

  const hasTimetable = periodDetection?.valid && !error;
  const timetableData = periodDetection?.timetable || {};
  const availablePeriods = Object.keys(timetableData);

  return (
    <div className={cn('space-y-4 sm:space-y-6', className)}>
      {/* Period Type Selection - Always show */}
      <div className="space-y-2 sm:space-y-3">
        <Label className="text-sm sm:text-base font-medium">
          Select Period Type<span className="text-red-500 ml-1">*</span>
        </Label>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 sm:h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <RadioGroup
            value={periodType}
            onValueChange={handlePeriodTypeChange}
            disabled={disabled}
            className="grid grid-cols-2 gap-2 sm:gap-3"
          >
            {PERIOD_TYPES.map((type) => (
              <label
                key={type.value}
                className={cn(
                  'flex items-start gap-2 sm:gap-3 rounded-lg border-2 p-2.5 sm:p-4 cursor-pointer transition-all',
                  periodType === type.value
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary/50',
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <RadioGroupItem value={type.value} id={type.value} className="mt-0.5 h-4 w-4" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-xs sm:text-sm text-gray-900 dark:text-gray-100">
                    {type.label}
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1 line-clamp-2">
                    {type.description}
                  </div>
                  {periodType === type.value && type.value !== 'periodwise' && hasTimetable && periodDetection?.periods && (
                    <div className="text-[10px] sm:text-xs text-primary mt-1 sm:mt-2 font-medium">
                      {periodDetection.periods.length} selected
                    </div>
                  )}
                </div>
              </label>
            ))}
          </RadioGroup>
        )}
      </div>

      {/* Timetable Warning - Show if no timetable found */}
      {!isLoading && !hasTimetable && (
        <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-3 sm:p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs sm:text-sm font-medium text-yellow-800 dark:text-yellow-200">
                No timetable found
              </p>
              <p className="text-[10px] sm:text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                {periodDetection?.error || 'No timetable found for selected date. Your application will be processed based on the selected period type.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Period-wise Selection - Only show if timetable exists */}
      {periodType === 'periodwise' && hasTimetable && (
        <div className="space-y-2 sm:space-y-3">
          <Label className="text-sm sm:text-base font-medium">
            Select Specific Periods
            {selectedPeriods.length > 0 && (
              <span className="text-xs sm:text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                ({selectedPeriods.length} selected)
              </span>
            )}
          </Label>

          {availablePeriods.length === 0 ? (
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              No periods available for this date
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:gap-3">
              {availablePeriods.map((periodId, index) => {
                const period = timetableData[periodId];
                const isSelected = selectedPeriods.includes(periodId);

                // Skip break periods
                if (period?.is_break) return null;

                // Get display values from enriched data
                const periodName = period?.period_name || `Period ${index + 1}`;
                const startTime = period?.start_time || '';
                const endTime = period?.end_time || '';
                const courseName = period?.course_name || '';
                const courseCode = period?.course_code || '';

                // Format time display
                const timeDisplay = startTime && endTime
                  ? `${startTime} - ${endTime}`
                  : startTime || '';

                return (
                  <label
                    key={periodId}
                    className={cn(
                      'flex items-center gap-2 sm:gap-3 rounded-lg border-2 p-2.5 sm:p-3 cursor-pointer transition-all',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 dark:border-gray-700 hover:border-primary/50',
                      disabled && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) =>
                        handlePeriodToggle(periodId, checked as boolean)
                      }
                      disabled={disabled}
                      className="h-4 w-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100 text-xs sm:text-sm truncate">
                          {periodName}
                        </span>
                        {timeDisplay && (
                          <span className="flex items-center gap-1 text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">
                            <Clock className="h-3 w-3" />
                            {timeDisplay}
                          </span>
                        )}
                      </div>
                      {(courseName || courseCode) && (
                        <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {courseCode ? `${courseCode} - ${courseName}` : courseName}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {selectedPeriods.length === 0 && (
            <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-2 sm:p-3">
              <p className="text-xs sm:text-sm text-yellow-800 dark:text-yellow-200">
                Please select at least one period
              </p>
            </div>
          )}
        </div>
      )}

      {/* Period-wise without timetable */}
      {periodType === 'periodwise' && !hasTimetable && !isLoading && (
        <div className="rounded-md bg-gray-50 dark:bg-gray-800 p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            Period-wise selection requires a timetable. Please select Full Day, Forenoon, or Afternoon instead.
          </p>
        </div>
      )}

      {/* Auto-detected Periods Summary - Hidden, periods are auto-selected in background */}
      {/* Only show count indicator in the period type card instead */}
    </div>
  );
}

function PeriodSelectorSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
