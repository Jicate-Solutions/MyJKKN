'use client';

import { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Calendar, Lock, X, Users } from 'lucide-react';
import { DayOfWeek, Period } from '@/types/academics';

interface TimetableGridProps {
  selectedDays: DayOfWeek[];
  selectedPeriods: Period[];
  slots: any[];
  onSlotClick: (day: DayOfWeek, period: Period, existingSlot?: any) => void;
  onSlotDelete?: (day: DayOfWeek, period: Period, existingSlot: any) => void;
  lockedPeriods: string[];
  isSuperAdmin?: boolean;
}

export const TimetableGrid = forwardRef<HTMLDivElement, TimetableGridProps>(
  (
    {
      selectedDays,
      selectedPeriods,
      slots,
      onSlotClick,
      onSlotDelete,
      lockedPeriods,
      isSuperAdmin = false
    },
    ref
  ) => {
    // Helper function to get slot for a specific day and period
    const getSlotForDayAndPeriod = (day: DayOfWeek, periodId: string) => {
      if (!slots) return null;
      return slots.find(
        (slot: any) => slot.day_of_week === day && slot.period_id === periodId
      );
    };

    // Helper function to render regular slot content
    const renderRegularSlot = (slot: any) => (
      <div className='text-blue-700 min-h-[50px] flex flex-col justify-center text-center'>
        <div className='font-semibold text-xs mb-0.5 leading-tight'>
          {slot.course?.course_code || 'Course'}
        </div>
        {slot.staff_members && slot.staff_members.length > 0 && (
          <div className='text-xs text-gray-700 mb-0.5 leading-tight'>
            {slot.staff_members.slice(0, 1).map((staff: any, idx: number) => (
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
            {slot.sections.slice(0, 2).map((section: any, idx: number) => (
              <Badge
                key={`${section.id || section.section_name}-${idx}`}
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
    const renderCombinedSlot = (slot: any) => (
      <div className='text-purple-700 min-h-[60px] flex flex-col text-center'>
        <div className='font-semibold text-xs mb-1 leading-tight'>Combined</div>
        {slot.sub_slots && slot.sub_slots.length > 0 && (
          <div className='flex-1 flex flex-col space-y-1'>
            {slot.sub_slots.map((subSlot: any, idx: number) => (
              <div
                key={`subSlot-${subSlot.id || idx}`}
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
                            {subSlot.staff_members
                              .slice(0, 1)
                              .map((staff: any, idx: number) => (
                                <div key={idx} className='truncate text-xs'>
                                  {staff.first_name} {staff.last_name}
                                </div>
                              ))}
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

    // NEW: Helper function to render subdivided slot content (Updated: 2025-10-13)
    const renderSubdividedSlot = (slot: any) => {
      const groupCount = slot.sub_slots?.length || 0;
      const subdivisionTypeLabel = slot.subdivision_type
        ? slot.subdivision_type.charAt(0).toUpperCase() +
          slot.subdivision_type.slice(1)
        : 'Practical';

      // Extract all unique courses and staff from sub_slots
      const allCourses = new Set<string>();
      const allStaff = new Set<string>();

      slot.sub_slots?.forEach((subSlot: any, index: number) => {
        if (subSlot.course?.course_code) {
          allCourses.add(subSlot.course.course_code);
        }

        subSlot.staff_members?.forEach((staff: any) => {
          const staffName = `${staff.first_name} ${staff.last_name}`;
          allStaff.add(staffName);
        });
      });

      const coursesList = Array.from(allCourses);
      const staffList = Array.from(allStaff);

      return (
        <div className='text-purple-700 min-h-[60px] flex flex-col text-center'>
          <div className='flex items-center justify-center gap-1 mb-1'>
            <Users className='h-3 w-3' />
            <div className='font-semibold text-xs leading-tight'>
              {subdivisionTypeLabel}
            </div>
          </div>
          <div className='text-xs mb-1'>
            <Badge
              variant='secondary'
              className='text-xs bg-purple-100 text-purple-800 border-purple-300 px-1 py-0 h-4'
            >
              {groupCount} Groups
            </Badge>
          </div>
          {/* Show all courses */}
          {coursesList.length > 0 && (
            <div className='text-xs text-gray-700 mb-0.5 leading-tight'>
              {coursesList.slice(0, 2).join(', ')}
              {coursesList.length > 2 && ` +${coursesList.length - 2} more`}
            </div>
          )}
          {/* Show all staff names */}
          {staffList.length > 0 && (
            <div className='text-xs text-gray-600 leading-tight'>
              {staffList.slice(0, 2).join(', ')}
              {staffList.length > 2 && (
                <div className='text-xs text-gray-500'>
                  +{staffList.length - 2} more
                </div>
              )}
            </div>
          )}
        </div>
      );
    };

    // Helper function to render practical period slot content
    // Updated: 2025-11-07 - Added rendering for practical mode with batch information
    const renderPracticalSlot = (slot: any) => {
      const practicalConfig = slot.practical_config;
      if (!practicalConfig || !practicalConfig.batches) {
        return (
          <div className='text-amber-600 text-xs min-h-[50px] flex items-center justify-center'>
            Practical (No batches configured)
          </div>
        );
      }

      const batches = practicalConfig.batches;
      const batchNames = batches.map((b: any) => b.batch_name).filter(Boolean);

      // Collect all unique course codes from enriched batch data
      const allCourseCodes = new Set<string>();
      batches.forEach((batch: any) => {
        // Use enriched_courses which contain full course objects
        if (batch.enriched_courses && Array.isArray(batch.enriched_courses)) {
          batch.enriched_courses.forEach((course: any) => {
            if (course.course_code) {
              allCourseCodes.add(course.course_code);
            }
          });
        }
      });

      const coursesList = Array.from(allCourseCodes);

      return (
        <div className='text-purple-700 min-h-[50px] flex flex-col justify-center text-center'>
          <div className='font-semibold text-xs mb-0.5 leading-tight flex items-center justify-center gap-1'>
            <Users className='h-3 w-3' />
            <span>Practical</span>
          </div>
          {/* Show batch names */}
          {batchNames.length > 0 && (
            <div className='text-xs text-gray-700 mb-0.5 leading-tight'>
              {batchNames.slice(0, 2).join(', ')}
              {batchNames.length > 2 && ` +${batchNames.length - 2}`}
            </div>
          )}
          {/* Show course codes */}
          {coursesList.length > 0 && (
            <div className='text-xs text-gray-600 leading-tight'>
              {coursesList.slice(0, 2).join(', ')}
              {coursesList.length > 2 && ` +${coursesList.length - 2}`}
            </div>
          )}
        </div>
      );
    };

    // Helper function to render break slot content
    const renderBreakSlot = (slot: any) => (
      <div className='text-orange-600 font-semibold text-xs min-h-[40px] flex items-center justify-center'>
        {slot.break_description || 'Break'}
      </div>
    );

    if (selectedPeriods.length === 0) {
      return (
        <div ref={ref} className='border rounded-lg p-8 text-center'>
          <div className='text-gray-500'>
            <Calendar className='h-12 w-12 mx-auto mb-4 text-gray-300' />
            <h3 className='text-lg font-medium mb-2'>No Periods Configured</h3>
            <p className='text-sm'>
              Please configure periods to view the timetable grid.
            </p>
          </div>
        </div>
      );
    }

    // If no days selected, show the grid with empty message in day columns
    const daysToShow = selectedDays.length > 0 ? selectedDays : [];

    return (
      <div
        ref={ref}
        className='border rounded-lg shadow-sm inline-block min-w-full'
      >
        <table className='w-max min-w-full border-collapse'>
          <thead className='bg-gradient-to-r from-blue-600 to-blue-700 text-white'>
            <tr>
              <th className='border border-blue-500 p-2 text-left font-semibold text-xs w-24 sticky left-0 bg-blue-600 z-10'>
                <div className='flex items-center gap-1'>
                  <Calendar className='h-3 w-3' />
                  <span>Period</span>
                </div>
              </th>
              {daysToShow.length > 0 ? (
                daysToShow.map((day) => (
                  <th
                    key={day}
                    className='border border-blue-500 p-2 text-center font-semibold text-xs'
                  >
                    {day.substring(0, 3)}
                  </th>
                ))
              ) : (
                <th className='border border-blue-500 p-2 text-center font-semibold text-xs'>
                  <span className='text-yellow-200'>
                    No Days Selected - Please Configure Days
                  </span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {selectedPeriods.map((period, index) => (
              <tr
                key={period.id}
                className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}
              >
                <td
                  className={`border border-gray-200 p-2 sticky left-0 z-10 ${
                    period.is_break
                      ? 'bg-gradient-to-r from-orange-600 to-orange-700 text-white'
                      : 'bg-gradient-to-r from-green-600 to-green-700 text-white'
                  }`}
                >
                  <div className='flex items-center gap-1'>
                    {lockedPeriods.includes(period.id) && (
                      <Lock
                        className={`h-2 w-2 ${
                          period.is_break ? 'text-orange-200' : 'text-green-200'
                        }`}
                      />
                    )}
                    <div>
                      <div className='font-semibold text-xs leading-tight flex items-center gap-1'>
                        {period.period_name}
                        {period.is_break}
                      </div>
                      <div
                        className={`text-xs leading-tight ${
                          period.is_break ? 'text-orange-100' : 'text-green-100'
                        }`}
                      >
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
                {period.is_break ? (
                  // For break periods, show a single merged cell spanning all days
                  <td
                    colSpan={daysToShow.length || 1}
                    className='border border-gray-200 p-1.5 text-center align-middle'
                  >
                    <div
                      className='w-full h-14 border-2 border-dashed border-orange-200 bg-orange-50 rounded flex flex-col items-center justify-center text-orange-600 cursor-not-allowed mx-auto'
                      title={`Break period: ${period.period_name} (${new Date(
                        `2000-01-01T${period.start_time}`
                      ).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })} - ${new Date(
                        `2000-01-01T${period.end_time}`
                      ).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })})`}
                    >
                      <div className='text-sm font-semibold text-red-800'>
                        {period.period_name}
                      </div>
                      <div className='text-xs font-semibold text-black mt-1'>
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
                  </td>
                ) : daysToShow.length > 0 ? (
                  // For regular periods, show individual cells for each day
                  daysToShow.map((day) => {
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
                              hover:shadow-md min-h-[60px] flex flex-col justify-center relative group
                              ${
                                lockedPeriods.includes(period.id)
                                  ? 'border-orange-300 bg-orange-50'
                                  : ''
                              } ${
                              slot.is_break_slot
                                ? 'bg-orange-50 border-orange-200 hover:bg-orange-100'
                                : slot.period_mode === 'practical'
                                ? 'bg-purple-50 border-purple-400 hover:bg-purple-100'
                                : slot.is_subdivided
                                ? 'bg-purple-50 border-purple-300 hover:bg-purple-100'
                                : slot.is_combined
                                ? 'bg-purple-50 border-purple-200 hover:bg-purple-100'
                                : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                            }
                            `}
                            onClick={() => onSlotClick(day, period, slot)}
                          >
                            {/* Lock indicator for periods with attendance */}
                            {lockedPeriods.includes(period.id) &&
                              !isSuperAdmin && (
                                <div
                                  className='absolute top-1 left-1 p-1 rounded-full bg-orange-500 text-white z-10'
                                  title='Attendance marked - Cannot modify'
                                >
                                  <Lock className='h-3 w-3' />
                                </div>
                              )}
                            {/* Delete button - show for super admin even if locked, hide for others if locked */}
                            {onSlotDelete &&
                              (isSuperAdmin ||
                                !lockedPeriods.includes(period.id)) && (
                                <button
                                  className='absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-red-500 hover:bg-red-600 text-white z-10'
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSlotDelete(day, period, slot);
                                  }}
                                  title='Delete slot'
                                >
                                  <X className='h-3 w-3' />
                                </button>
                              )}
                            {slot.is_break_slot
                              ? renderBreakSlot(slot)
                              : slot.period_mode === 'practical'
                              ? renderPracticalSlot(slot)
                              : slot.is_subdivided
                              ? renderSubdividedSlot(slot)
                              : slot.is_combined
                              ? renderCombinedSlot(slot)
                              : renderRegularSlot(slot)}
                          </div>
                        ) : lockedPeriods.includes(period.id) &&
                          !isSuperAdmin ? (
                          // Show locked state for periods with attendance (except for super admin)
                          <div className='w-full h-14 border-2 border-dashed border-orange-300 bg-orange-50 rounded flex flex-col items-center justify-center cursor-not-allowed'>
                            <Lock className='h-3 w-3 text-orange-500' />
                            <span className='text-xs text-orange-600'>
                              Locked
                            </span>
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
                  })
                ) : (
                  // When no days are selected, show a placeholder cell
                  <td className='border border-gray-200 p-4 text-center align-middle'>
                    <div className='text-gray-400 text-sm'>
                      <Calendar className='h-8 w-8 mx-auto mb-2 text-gray-300' />
                      <p>Configure days to add slots</p>
                    </div>
                  </td>
                )}
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
