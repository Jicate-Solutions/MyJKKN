'use client';

import React from 'react';
import { X, Plus } from 'lucide-react';
import { DayOfWeek, Period } from '@/types/academics';
import { Badge } from '@/components/ui/badge';

interface BatchTimetableGridProps {
  selectedDates: string[];
  selectedPeriods: Period[];
  slots: any[];
  onSlotClick: (date: string, period: Period, existingSlot?: any) => void;
  onRemoveDate?: (dateStr: string) => void;
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
      onRemoveDate,
      lockedPeriods
    },
    ref
  ) => {
    // Parse date ranges from the selectedDates array
    const groupDatesIntoRanges = (dates: string[]) => {
      if (dates.length === 0) return [];

      const ranges: { start: string; end: string; dates: string[] }[] = [];

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
              dates: rangeDates
            });
          }
        } else if (!item.includes('RANGE')) {
          // Handle individual dates (legacy support)
          ranges.push({
            start: item,
            end: item,
            dates: [item]
          });
        }
      });

      return ranges;
    };

    const dateRanges = groupDatesIntoRanges(selectedDates);

    // Helper function to get slot for date range and period
    const getSlotForDateRangeAndPeriod = (
      dateRange: { start: string; end: string; dates: string[] },
      periodId: string
    ) => {
      if (!slots) return null;
      // Look for a slot that matches any date in the range
      return slots.find(
        (slot: any) =>
          dateRange.dates.includes(slot.slot_date || '') &&
          slot.period_id === periodId
      );
    };

    // Helper function to format time
    const formatTime = (timeString: string) => {
      return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    };

    if (selectedPeriods.length === 0) {
      return (
        <div
          ref={ref}
          className='flex items-center justify-center h-64 bg-gray-50 rounded-lg border border-dashed border-gray-300'
        >
          <div className='text-center'>
            <div className='text-gray-500 text-lg mb-2'>
              No periods configured
            </div>
            <div className='text-gray-400 text-sm'>
              Please configure periods first to view the timetable
            </div>
          </div>
        </div>
      );
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
            {/* Date Range Rows */}
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
                      {onRemoveDate && (
                        <button
                          onClick={() => {
                            // Remove the range marker from selectedDates
                            const rangeMarker = `RANGE:${dateRange.start}:${dateRange.end}`;
                            onRemoveDate(rangeMarker);
                          }}
                          className='opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-green-500 rounded'
                          title='Remove this date range'
                        >
                          <X className='h-3 w-3 text-white' />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Period Cells */}
                  {selectedPeriods.map((period) => {
                    const existingSlot = getSlotForDateRangeAndPeriod(
                      dateRange,
                      period.id
                    );
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
                            hover:shadow-md min-h-[60px] flex flex-col justify-center
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
                                dateRange.start,
                                period,
                                existingSlot
                              );
                            }}
                          >
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
                                          <div>
                                            <div className='font-semibold text-xs mb-0.5 leading-tight'>
                                              {subSlot.course?.course_code ||
                                                'Course'}
                                            </div>
                                            {subSlot.staff_members &&
                                              subSlot.staff_members.length >
                                                0 && (
                                                <div className='text-xs text-gray-700 mb-0.5 leading-tight'>
                                                  <div className='truncate'>
                                                    {
                                                      subSlot.staff_members[0]
                                                        ?.first_name
                                                    }{' '}
                                                    {
                                                      subSlot.staff_members[0]
                                                        ?.last_name
                                                    }
                                                  </div>
                                                </div>
                                              )}
                                            {subSlot.sections &&
                                              subSlot.sections.length > 0 && (
                                                <div className='text-xs'>
                                                  <Badge
                                                    variant='outline'
                                                    className='text-xs bg-purple-50 text-purple-700 border-purple-200 px-1 py-0 h-4'
                                                  >
                                                    {
                                                      subSlot.sections[0]
                                                        ?.section_name
                                                    }
                                                  </Badge>
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
                            className='w-full h-14 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 rounded'
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isBreakPeriod && !isLocked) {
                                onSlotClick(dateRange.start, period, undefined);
                              }
                            }}
                          >
                            <div className='flex flex-col items-center gap-0.5'>
                              <div className='text-gray-400 text-lg'>+</div>
                              <span className='text-xs text-gray-500'>Add</span>
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
