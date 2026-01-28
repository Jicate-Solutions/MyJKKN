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
  } = usePeriodsForDate(sectionId, selectedDate, periodType);

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

  if (isLoading) {
    return <PeriodSelectorSkeleton />;
  }

  if (error || !periodDetection?.valid) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Unable to load periods
            </p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
              {periodDetection?.error || 'No timetable found for selected date'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const timetableData = periodDetection.timetable || {};
  const availablePeriods = Object.keys(timetableData);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Period Type Selection */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Select Period Type</Label>
        <RadioGroup
          value={periodType}
          onValueChange={handlePeriodTypeChange}
          disabled={disabled}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          {PERIOD_TYPES.map((type) => (
            <label
              key={type.value}
              className={cn(
                'flex items-start gap-3 rounded-lg border-2 p-4 cursor-pointer transition-all',
                periodType === type.value
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 dark:border-gray-700 hover:border-primary/50',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <RadioGroupItem value={type.value} id={type.value} className="mt-1" />
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {type.label}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {type.description}
                </div>
                {periodType === type.value && type.value !== 'periodwise' && (
                  <div className="text-xs text-primary mt-2 font-medium">
                    {periodDetection.periods.length} period(s) selected
                  </div>
                )}
              </div>
            </label>
          ))}
        </RadioGroup>
      </div>

      {/* Period-wise Selection */}
      {periodType === 'periodwise' && (
        <div className="space-y-3">
          <Label className="text-base font-medium">
            Select Specific Periods
            {selectedPeriods.length > 0 && (
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                ({selectedPeriods.length} selected)
              </span>
            )}
          </Label>

          {availablePeriods.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              No periods available for this date
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {availablePeriods.map((slotId) => {
                const period = timetableData[slotId];
                const isSelected = selectedPeriods.includes(slotId);

                return (
                  <label
                    key={slotId}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer transition-all',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 dark:border-gray-700 hover:border-primary/50',
                      disabled && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) =>
                        handlePeriodToggle(slotId, checked as boolean)
                      }
                      disabled={disabled}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                        {period.period_name || `Period ${period.period_id}`}
                        {period.course_name && (
                          <span className="text-gray-600 dark:text-gray-400 ml-1">
                            ({period.course_name})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 mt-1">
                        <Clock className="h-3 w-3" />
                        <span>
                          {period.start_time} - {period.end_time}
                        </span>
                      </div>
                      {period.faculty_name && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Faculty: {period.faculty_name}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {periodType === 'periodwise' && selectedPeriods.length === 0 && (
            <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-3">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Please select at least one period
              </p>
            </div>
          )}
        </div>
      )}

      {/* Auto-detected Periods Summary */}
      {periodType !== 'periodwise' && periodDetection.periods.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
            Auto-detected Periods:
          </div>
          <div className="flex flex-wrap gap-2">
            {periodDetection.periods.map((slotId) => {
              const period = timetableData[slotId];
              return (
                <div
                  key={slotId}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                >
                  <Clock className="h-3 w-3" />
                  {period?.period_name || slotId}
                  <span className="text-gray-600 dark:text-gray-400">
                    ({period?.start_time})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
