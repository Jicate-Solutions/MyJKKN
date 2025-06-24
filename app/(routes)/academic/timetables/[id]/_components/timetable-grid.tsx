'use client';

import { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Calendar, Lock } from 'lucide-react';
import { TimetableSlot, DayOfWeek, Period } from '@/types/academics';

interface TimetableGridProps {
  selectedDays: DayOfWeek[];
  selectedPeriods: Period[];
  slots: TimetableSlot[];
  onSlotClick: (
    day: DayOfWeek,
    period: Period,
    existingSlot?: TimetableSlot
  ) => void;
  lockedPeriods: string[];
}

export const TimetableGrid = forwardRef<HTMLDivElement, TimetableGridProps>(
  (
    { selectedDays, selectedPeriods, slots, onSlotClick, lockedPeriods },
    ref
  ) => {
    // Helper function to get slot for a specific day and period
    const getSlotForDayAndPeriod = (day: DayOfWeek, periodId: string) => {
      return slots.find(
        (slot) => slot.day_of_week === day && slot.period_id === periodId
      );
    };

    // Helper function to render regular slot content
    const renderRegularSlot = (slot: TimetableSlot) => (
      <div className='text-blue-700 min-h-[50px] flex flex-col justify-center text-center'>
        <div className='font-semibold text-xs mb-0.5 leading-tight'>
          {slot.course?.course_code || 'Course'}
        </div>
        {slot.staff_members && slot.staff_members.length > 0 && (
          <div className='text-xs text-gray-700 mb-0.5 leading-tight'>
            {slot.staff_members.slice(0, 1).map((staff, idx) => (
              <div key={idx} className='truncate text-xs'>
                {staff.first_name} {staff.last_name}
              </div>
            ))}
            {slot.staff_members.length > 1 && (
              <div className='text-xs text-gray-500'>
                +{slot.staff_members.length - 1} more
              </div>
            )}
          </div>
        )}
        {slot.sections && slot.sections.length > 0 && (
          <div className='text-xs'>
            {slot.sections.slice(0, 2).map((section, idx) => (
              <Badge
                key={idx}
                variant='outline'
                className='text-xs bg-blue-50 text-blue-700 border-blue-200 mr-0.5 mb-0.5 px-1 py-0 h-4'
              >
                {section.section_name}
              </Badge>
            ))}
            {slot.sections.length > 2 && (
              <span className='text-xs text-gray-500'>
                +{slot.sections.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    );

    // Helper function to render combined slot content
    const renderCombinedSlot = (slot: TimetableSlot) => (
      <div className='text-purple-700 min-h-[60px] flex flex-col text-center'>
        <div className='font-semibold text-xs mb-1 leading-tight'>Combined</div>
        {slot.sub_slots && slot.sub_slots.length > 0 && (
          <div className='flex-1 flex flex-col space-y-1'>
            {slot.sub_slots.map((subSlot, idx) => (
              <div
                key={idx}
                className='flex-1 border-gray-300 last:border-b-0 border-b border-dashed pb-0.5'
              >
                {subSlot.is_break_slot ? (
                  <div className='text-orange-600 font-medium text-xs'>
                    {subSlot.break_description || 'Break'}
                  </div>
                ) : (
                  <div>
                    <div className='font-semibold text-xs mb-0.5 leading-tight'>
                      {subSlot.course?.course_code || 'Course'}
                    </div>
                    {subSlot.staff_members &&
                      subSlot.staff_members.length > 0 && (
                        <div className='text-xs text-gray-700 mb-0.5 leading-tight'>
                          <div className='truncate'>
                            {subSlot.staff_members[0]?.first_name}{' '}
                            {subSlot.staff_members[0]?.last_name}
                          </div>
                        </div>
                      )}
                    {subSlot.sections && subSlot.sections.length > 0 && (
                      <div className='text-xs'>
                        <Badge
                          variant='outline'
                          className='text-xs bg-purple-50 text-purple-700 border-purple-200 px-1 py-0 h-4'
                        >
                          {subSlot.sections[0]?.section_name}
                        </Badge>
                        {subSlot.sections.length > 1 && (
                          <span className='text-xs text-gray-500 ml-1'>
                            +{subSlot.sections.length - 1}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );

    // Helper function to render break slot content
    const renderBreakSlot = (slot: TimetableSlot) => (
      <div className='text-orange-600 font-semibold text-xs min-h-[40px] flex items-center justify-center'>
        {slot.break_description || 'Break'}
      </div>
    );

    if (selectedPeriods.length === 0 || selectedDays.length === 0) {
      return (
        <div ref={ref} className='border rounded-lg p-8 text-center'>
          <div className='text-gray-500'>
            <Calendar className='h-12 w-12 mx-auto mb-4 text-gray-300' />
            <h3 className='text-lg font-medium mb-2'>
              No Timetable Configuration
            </h3>
            <p className='text-sm'>
              Please configure periods and days to view the timetable grid.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div ref={ref} className='border rounded-lg overflow-hidden shadow-sm'>
        <table className='w-full border-collapse'>
          <thead className='bg-gradient-to-r from-blue-600 to-blue-700 text-white'>
            <tr>
              <th className='border border-blue-500 p-2 text-left font-semibold text-xs w-24 sticky left-0 bg-blue-600 z-10'>
                <div className='flex items-center gap-1'>
                  <Calendar className='h-3 w-3' />
                  <span>Period</span>
                </div>
              </th>
              {selectedDays.map((day) => (
                <th
                  key={day}
                  className='border border-blue-500 p-2 text-center font-semibold text-xs'
                >
                  {day.substring(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selectedPeriods.map((period, index) => (
              <tr
                key={period.id}
                className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}
              >
                <td className='border border-gray-200 p-2 bg-gradient-to-r from-green-600 to-green-700 text-white sticky left-0 z-10'>
                  <div className='flex items-center gap-1'>
                    {lockedPeriods.includes(period.id) && (
                      <Lock className='h-2 w-2 text-green-200' />
                    )}
                    <div>
                      <div className='font-semibold text-xs leading-tight'>
                        {period.period_name}
                      </div>
                      <div className='text-xs text-green-100 leading-tight'>
                        {new Date(
                          `2000-01-01T${period.start_time}`
                        ).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}{' '}
                        -{' '}
                        {new Date(
                          `2000-01-01T${period.end_time}`
                        ).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </div>
                    </div>
                  </div>
                </td>
                {selectedDays.map((day) => {
                  const slot = getSlotForDayAndPeriod(day, period.id);
                  return (
                    <td
                      key={`${day}-${period.id}`}
                      className='border border-gray-200 p-1.5 text-center align-top'
                    >
                      {slot ? (
                        <div
                          className={`
                            p-1.5 border-2 rounded cursor-pointer transition-all duration-200 
                            hover:shadow-md min-h-[60px] flex flex-col justify-center
                            ${
                              slot.is_break_slot
                                ? 'bg-orange-50 border-orange-200 hover:bg-orange-100'
                                : slot.is_combined
                                ? 'bg-purple-50 border-purple-200 hover:bg-purple-100'
                                : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                            }
                          `}
                          onClick={() => onSlotClick(day, period, slot)}
                        >
                          {slot.is_break_slot
                            ? renderBreakSlot(slot)
                            : slot.is_combined
                            ? renderCombinedSlot(slot)
                            : renderRegularSlot(slot)}
                        </div>
                      ) : (
                        <Button
                          variant='ghost'
                          size='sm'
                          className='w-full h-14 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200'
                          onClick={() => onSlotClick(day, period)}
                        >
                          <div className='flex flex-col items-center gap-0.5'>
                            <Plus className='h-3 w-3 text-gray-400' />
                            <span className='text-xs text-gray-500'>Add</span>
                          </div>
                        </Button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {selectedPeriods.length === 0 && (
          <div className='p-8 text-center text-gray-500'>
            <p>
              No periods configured. Please configure periods to see the
              timetable.
            </p>
          </div>
        )}
      </div>
    );
  }
);

TimetableGrid.displayName = 'TimetableGrid';
