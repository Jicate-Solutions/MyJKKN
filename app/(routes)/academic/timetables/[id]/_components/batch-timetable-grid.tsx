'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { X, Edit2 } from 'lucide-react';
import type { Period } from '@/types/academics';

interface BatchTimetableGridProps {
  selectedDates: string[];
  selectedPeriods: Period[];
  slots: any[];
  onSlotClick: (date: string, period: Period, existingSlot?: any) => void;
  onSlotDelete?: (date: string, period: Period, existingSlot: any) => void;
  onRemoveDate?: (dateStr: string) => void;
  onEditDate?: (dateStr: string) => void;
  lockedPeriods: string[];
}

export const BatchTimetableGrid = React.forwardRef<
  HTMLDivElement,
  BatchTimetableGridProps
>(
  (
    {
      selectedDates,
      selectedPeriods,
      slots,
      onSlotClick,
      onSlotDelete,
      onRemoveDate,
      onEditDate,
      lockedPeriods
    },
    ref
  ) => {
    // Parse date ranges from the selectedDates array
    const groupDatesIntoRanges = (dates: string[]) => {
      if (dates.length === 0) return [];

      const ranges: {
        start: string;
        end: string;
        dates: string[];
        rangeMarker: string;
      }[] = [];

      // Process each item in the dates array
      dates.forEach((item) => {
        // Check if this is a range marker (format: "RANGE:start:end")
        if (item.startsWith('RANGE:')) {
          const parts = item.split(':');
          if (parts.length === 3) {
            const startDate = parts[1];
            const endDate = parts[2];

            // Generate all dates in this range
            const rangeDates: string[] = [];
            const current = new Date(startDate);
            const end = new Date(endDate);

            while (current <= end) {
              rangeDates.push(current.toISOString().split('T')[0]);
              current.setDate(current.getDate() + 1);
            }

            ranges.push({
              start: startDate,
              end: endDate,
              dates: rangeDates,
              rangeMarker: item
            });
          }
        } else if (!item.includes('RANGE')) {
          // Handle individual dates (legacy support)
          ranges.push({
            start: item,
            end: item,
            dates: [item],
            rangeMarker: item
          });
        }
      });

      return ranges;
    };

    const dateRanges = groupDatesIntoRanges(selectedDates);

    // Helper function to format time
    const formatTime = (timeString: string) => {
      return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    };

    if (selectedPeriods.length === 0) {
      // Show different message based on whether dates are configured
      if (selectedDates.length > 0) {
        const dateRanges = groupDatesIntoRanges(selectedDates);
        return (
          <div ref={ref} className='space-y-4'>
            {/* Show configured date ranges */}
            <div className='bg-green-50 border border-green-200 rounded-lg p-4'>
              <div className='flex items-center gap-2 mb-2'>
                <div className='w-2 h-2 bg-green-500 rounded-full'></div>
                <span className='text-green-700 font-medium text-sm'>
                  {dateRanges.length} Date Range
                  {dateRanges.length !== 1 ? 's' : ''} Configured
                </span>
              </div>
              <div className='space-y-1'>
                {dateRanges.map((range, index) => (
                  <div key={index} className='text-sm text-green-600'>
                    {range.start === range.end
                      ? new Date(range.start).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })
                      : `${new Date(range.start).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })} - ${new Date(range.end).toLocaleDateString(
                          'en-US',
                          {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          }
                        )} (${range.dates.length} days)`}
                  </div>
                ))}
              </div>
            </div>

            {/* Show periods needed message */}
            <div className='flex items-center justify-center h-32 bg-amber-50 rounded-lg border border-dashed border-amber-300'>
              <div className='text-center'>
                <div className='text-amber-600 text-lg mb-2'>
                  Configure Periods to Complete Setup
                </div>
                <div className='text-amber-500 text-sm mb-2'>
                  Your date ranges are ready! Now configure time periods to
                  create your timetable.
                </div>
                <div className='text-xs text-amber-500'>
                  Click &quot;Configure Periods&quot; above to set up your time
                  periods.
                </div>
              </div>
            </div>
          </div>
        );
      } else {
        return (
          <div
            ref={ref}
            className='flex items-center justify-center h-64 bg-gray-50 rounded-lg border border-dashed border-gray-300'
          >
            <div className='text-center'>
              <div className='text-gray-500 text-lg mb-2'>
                No periods configured
              </div>
              <div className='text-gray-400 text-sm mb-4'>
                Click &quot;Configure Periods&quot; above to set up your time
                periods for this batch timetable.
              </div>
              <div className='text-xs text-gray-400'>
                After configuring periods, you can add date ranges and create
                your timetable schedule.
              </div>
            </div>
          </div>
        );
      }
    }

    if (selectedDates.length === 0) {
      return (
        <div
          ref={ref}
          className='overflow-x-auto border rounded-lg bg-white shadow-sm'
        >
          <div className='min-w-full'>
            {/* Header Row */}
            <div
              className='grid border-b bg-gray-50'
              style={{
                gridTemplateColumns: `150px repeat(${selectedPeriods.length}, minmax(140px, 1fr))`
              }}
            >
              <div className='p-3 text-sm font-semibold text-gray-700 border-r bg-gray-100 sticky left-0 z-10'>
                Date Range
              </div>
              {selectedPeriods.map((period) => (
                <div
                  key={period.id}
                  className='p-3 text-center border-r last:border-r-0'
                >
                  <div className='text-sm font-semibold text-gray-900'>
                    {period.period_name}
                  </div>
                  <div className='text-xs text-gray-500 mt-1'>
                    {formatTime(period.start_time)} -{' '}
                    {formatTime(period.end_time)}
                  </div>
                </div>
              ))}
            </div>
            {/* Show message that no dates are selected */}
            <div className='p-8 text-center'>
              <div className='text-gray-500 text-lg mb-2'>
                No dates selected
              </div>
              <div className='text-gray-400 text-sm'>
                Click &quot;Add Date Range&quot; to add dates to your batch
                timetable
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div ref={ref} className='border rounded-lg overflow-hidden shadow-sm'>
        <table className='w-full border-collapse'>
          <thead className='bg-gradient-to-r from-blue-600 to-blue-700 text-white'>
            <tr>
              <th className='border border-blue-500 p-2 text-left font-semibold text-xs w-32 sticky left-0 bg-blue-600'>
                <div className='flex items-center gap-1'>
                  <span>Date Range</span>
                </div>
              </th>
              {selectedPeriods.map((period) => (
                <th
                  key={period.id}
                  className='border border-blue-500 p-2 text-center font-semibold text-xs'
                >
                  <div>{period.period_name}</div>
                  <div className='text-xs font-normal text-blue-100 mt-0.5'>
                    {formatTime(period.start_time)} -{' '}
                    {formatTime(period.end_time)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Date Range Rows - One row per date range */}
            {dateRanges.map((dateRange, rangeIndex) => {
              const startDate = new Date(dateRange.start);
              const endDate = new Date(dateRange.end);
              const isSingleDate = dateRange.start === dateRange.end;

              return (
                <tr
                  key={`range-${rangeIndex}`}
                  className={rangeIndex % 2 === 0 ? 'bg-gray-50' : 'bg-white'}
                >
                  {/* Date Range Column */}
                  <td className='border border-gray-200 p-2 sticky left-0 bg-gradient-to-r from-green-600 to-green-700 text-white group'>
                    <div className='flex items-center justify-between'>
                      <div className='flex-1'>
                        {isSingleDate ? (
                          <>
                            <div className='text-xs font-semibold'>
                              {startDate.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </div>
                            <div className='text-xs text-green-100'>
                              {startDate.toLocaleDateString('en-US', {
                                year: 'numeric'
                              })}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className='text-xs font-semibold leading-tight'>
                              {startDate.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric'
                              })}{' '}
                              -{' '}
                              {endDate.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric'
                              })}
                            </div>
                            <div className='text-xs text-green-100'>
                              {startDate.toLocaleDateString('en-US', {
                                year: 'numeric'
                              })}{' '}
                              ({dateRange.dates.length} days)
                            </div>
                          </>
                        )}
                      </div>
                      <div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
                        {onEditDate && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditDate(dateRange.rangeMarker);
                            }}
                            className='p-1 hover:bg-green-500 rounded'
                            title='Edit this date range'
                          >
                            <Edit2 className='h-3 w-3 text-white' />
                          </button>
                        )}
                        {onRemoveDate && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveDate(dateRange.rangeMarker);
                            }}
                            className='p-1 hover:bg-red-500 rounded'
                            title='Remove this date range'
                          >
                            <X className='h-3 w-3 text-white' />
                          </button>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Period Cells */}
                  {selectedPeriods.map((period) => {
                    // Check if any date in the range has a slot for this period
                    // Updated: 2025-11-17 - Fixed slot matching for batch mode
                    // slot.slot_date is the range marker (e.g., "RANGE:2025-11-01:2025-11-05")
                    // We need to compare it with dateRange.rangeMarker, not individual dates
                    const existingSlot = slots?.find(
                      (slot: any) =>
                        slot.slot_date === dateRange.rangeMarker &&
                        slot.period_id === period.id
                    );

                    // DEBUG: Log what slot data we're passing to the dialog
                    if (existingSlot) {
                      console.log('[batch-grid] Found existing slot for click:', {
                        slot_date: existingSlot.slot_date,
                        period_id: existingSlot.period_id,
                        staff_ids: existingSlot.staff_ids,
                        is_subdivided: existingSlot.is_subdivided,
                        subdivision_type: existingSlot.subdivision_type,
                        sub_slots: existingSlot.sub_slots?.map((s: any) => ({
                          sub_slot_order: s.sub_slot_order,
                          staff_ids: s.staff_ids,
                          group_name: s.group_name
                        })),
                        dateRange: {
                          start: dateRange.start,
                          end: dateRange.end,
                          datesCount: dateRange.dates.length
                        }
                      });
                    }

                    const isLocked = lockedPeriods.includes(period.id);
                    const isEmpty = !existingSlot;
                    const isBreakPeriod = period.is_break;

                    return (
                      <td
                        key={period.id}
                        className='border border-gray-200 p-1.5 text-center align-top'
                      >
                        {isBreakPeriod ? (
                          <div className='w-full h-14 border-2 border-dashed border-orange-200 bg-orange-50 rounded flex flex-col items-center justify-center text-orange-600 cursor-not-allowed'>
                            <div className='text-sm font-semibold'>BREAK</div>
                            <div className='text-xs mt-0.5'>Break Period</div>
                          </div>
                        ) : isLocked ? (
                          <div className='w-full h-14 border-2 border-dashed border-red-200 bg-red-50 rounded flex flex-col items-center justify-center text-red-600 cursor-not-allowed'>
                            <div className='text-sm font-semibold'>LOCKED</div>
                            <div className='text-xs mt-0.5'>Period Locked</div>
                          </div>
                        ) : existingSlot ? (
                          <div
                            className={`
                            p-1.5 border-2 rounded cursor-pointer transition-all duration-200 
                            hover:shadow-md min-h-[60px] flex flex-col justify-center relative group
                            ${
                              existingSlot.is_break_slot
                                ? 'bg-orange-50 border-orange-200 hover:bg-orange-100'
                                : existingSlot.is_combined
                                ? 'bg-purple-50 border-purple-200 hover:bg-purple-100'
                                : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                            }
                          `}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSlotClick(
                                dateRange.rangeMarker, // Pass range identifier
                                period,
                                existingSlot
                              );
                            }}
                          >
                            {/* Delete button */}
                            {onSlotDelete && (
                              <button
                                className='absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-red-500 hover:bg-red-600 text-white z-10'
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSlotDelete(
                                    dateRange.rangeMarker, // Pass range identifier
                                    period,
                                    existingSlot
                                  );
                                }}
                                title='Delete slot from entire range'
                              >
                                <X className='h-3 w-3' />
                              </button>
                            )}
                            {existingSlot.is_break_slot ? (
                              <div className='text-orange-600 font-semibold text-xs min-h-[40px] flex items-center justify-center text-center'>
                                {existingSlot.break_description || 'Break'}
                              </div>
                            ) : existingSlot.is_combined &&
                              existingSlot.sub_slots ? (
                              <div className='text-purple-700 min-h-[60px] flex flex-col text-center'>
                                <div className='font-semibold text-xs mb-1 leading-tight'>
                                  Combined
                                </div>
                                <div className='flex-1 flex flex-col space-y-1'>
                                  {existingSlot.sub_slots.map(
                                    (subSlot: any, idx: number) => (
                                      <div
                                        key={`subSlot-${subSlot.id || idx}`}
                                        className='flex-1 border-gray-300 last:border-b-0 border-b border-dashed pb-0.5'
                                      >
                                        {subSlot.is_break_slot ? (
                                          <div className='text-orange-600 font-medium text-xs'>
                                            {subSlot.break_description ||
                                              'Break'}
                                          </div>
                                        ) : (
                                          <div className='flex flex-col'>
                                            <div className='font-medium text-xs leading-tight mb-0.5'>
                                              {subSlot.course?.course_code ||
                                                'Course'}
                                            </div>
                                            {subSlot.staff_members &&
                                              subSlot.staff_members.length >
                                                0 && (
                                                <div className='text-xs text-gray-700 mb-0.5 leading-tight'>
                                                  {subSlot.staff_members
                                                    .slice(0, 1)
                                                    .map(
                                                      (
                                                        staff: any,
                                                        idx: number
                                                      ) => (
                                                        <div
                                                          key={idx}
                                                          className='truncate text-xs'
                                                        >
                                                          {staff.first_name}{' '}
                                                          {staff.last_name}
                                                        </div>
                                                      )
                                                    )}
                                                  {subSlot.staff_members
                                                    .length > 1 && (
                                                    <div className='text-xs text-gray-500'>
                                                      +
                                                      {subSlot.staff_members
                                                        .length - 1}{' '}
                                                      more
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            {subSlot.sections &&
                                              subSlot.sections.length > 0 && (
                                                <div className='text-xs'>
                                                  {subSlot.sections
                                                    .slice(0, 1)
                                                    .map(
                                                      (
                                                        section: any,
                                                        idx: number
                                                      ) => (
                                                        <Badge
                                                          key={`${
                                                            section.id ||
                                                            section.section_name
                                                          }-${idx}`}
                                                          variant='outline'
                                                          className='text-xs bg-purple-50 text-purple-700 border-purple-200 mr-0.5 mb-0.5 px-1 py-0 h-4'
                                                        >
                                                          {section.section_name}
                                                        </Badge>
                                                      )
                                                    )}
                                                  {subSlot.sections.length >
                                                    1 && (
                                                    <span className='text-xs text-gray-500 ml-1'>
                                                      +
                                                      {subSlot.sections.length -
                                                        1}
                                                    </span>
                                                  )}
                                                </div>
                                              )}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className='text-blue-700 min-h-[50px] flex flex-col justify-center text-center'>
                                <div className='font-semibold text-xs mb-0.5 leading-tight'>
                                  {existingSlot.course?.course_code || 'Course'}
                                </div>
                                {existingSlot.staff_members &&
                                  existingSlot.staff_members.length > 0 && (
                                    <div className='text-xs text-gray-700 mb-0.5 leading-tight'>
                                      {existingSlot.staff_members
                                        .slice(0, 1)
                                        .map((staff: any, idx: number) => (
                                          <div
                                            key={idx}
                                            className='truncate text-xs'
                                          >
                                            {staff.first_name} {staff.last_name}
                                          </div>
                                        ))}
                                      {existingSlot.staff_members.length >
                                        1 && (
                                        <div className='text-xs text-gray-500'>
                                          +
                                          {existingSlot.staff_members.length -
                                            1}{' '}
                                          more
                                        </div>
                                      )}
                                    </div>
                                  )}
                                {existingSlot.sections &&
                                  existingSlot.sections.length > 0 && (
                                    <div className='text-xs'>
                                      {existingSlot.sections
                                        .slice(0, 2)
                                        .map((section: any, idx: number) => (
                                          <Badge
                                            key={`${
                                              section.id || section.section_name
                                            }-${idx}`}
                                            variant='outline'
                                            className='text-xs bg-blue-50 text-blue-700 border-blue-200 mr-0.5 mb-0.5 px-1 py-0 h-4'
                                          >
                                            {section.section_name}
                                          </Badge>
                                        ))}
                                      {existingSlot.sections.length > 2 && (
                                        <span className='text-xs text-gray-500'>
                                          +{existingSlot.sections.length - 2}
                                        </span>
                                      )}
                                    </div>
                                  )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <button
                            className='w-full h-14 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 rounded group'
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isBreakPeriod && !isLocked) {
                                onSlotClick(
                                  dateRange.rangeMarker, // Pass range identifier
                                  period,
                                  undefined
                                );
                              }
                            }}
                            title='Click to add course slot for this time period'
                          >
                            <div className='flex flex-col items-center gap-0.5'>
                              <div className='text-gray-400 text-lg group-hover:text-blue-500'>+</div>
                              <span className='text-xs text-gray-500 group-hover:text-blue-600 font-medium'>
                                Add Slot
                              </span>
                            </div>
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
);

BatchTimetableGrid.displayName = 'BatchTimetableGrid';
