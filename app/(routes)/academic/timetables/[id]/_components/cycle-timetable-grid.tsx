'use client';

// cycle-timetable-grid.tsx
// Added: 2026-03-22 - Grid component for cycle-based timetable format.
// Columns = Cycle 1..N (dynamic). Rows = Periods (same as TimetableGrid).
// Slot rendering is identical to TimetableGrid — reuses same visual patterns.

import { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCcw, Lock, X, Users } from 'lucide-react';
import type { Period } from '@/types/academics';
import type { CycleKey } from '@/lib/services/academic/cycle-calculation-service';

interface CycleTimetableGridProps {
  numCycles: number;            // Total number of cycles (e.g. 6)
  selectedPeriods: Period[];
  slots: any[];
  /** cycleKey = "cycle-1", "cycle-2", etc. */
  onSlotClick: (cycleKey: CycleKey, period: Period, existingSlot?: any) => void;
  onSlotDelete?: (cycleKey: CycleKey, period: Period, existingSlot: any) => void;
  lockedPeriods: string[];
  /** If provided, this cycle number header is highlighted as "today" */
  todaysCycle?: number | null;
  isSuperAdmin?: boolean;
  canEdit?: boolean;
}

export const CycleTimetableGrid = forwardRef<HTMLDivElement, CycleTimetableGridProps>(
  (
    {
      numCycles,
      selectedPeriods,
      slots,
      onSlotClick,
      onSlotDelete,
      lockedPeriods,
      todaysCycle,
      isSuperAdmin = false,
      canEdit = false
    },
    ref
  ) => {
    // Build ordered array of cycle keys: ["cycle-1", "cycle-2", ...]
    const cycleKeys: CycleKey[] = Array.from(
      { length: numCycles },
      (_, i) => `cycle-${i + 1}` as CycleKey
    );

    // Lookup slot for a specific cycle and period
    const getSlot = (cycleKey: CycleKey, periodId: string) => {
      if (!slots) return null;
      // Slots from RPC have day_of_week set to the cycle key ("cycle-1", etc.)
      return slots.find(
        (s: any) => s.day_of_week === cycleKey && s.period_id === periodId
      ) ?? null;
    };

    // ── Slot renderers (identical visuals to TimetableGrid) ──────────────

    const renderRegularSlot = (slot: any) => (
      <div className='text-blue-700 min-h-[50px] flex flex-col justify-center text-center'>
        <div className='font-semibold text-xs mb-0.5 leading-tight'>
          {slot.course?.course_code || 'Course'}
        </div>
        {slot.staff_members?.length > 0 && (
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
        {slot.sections?.length > 0 && (
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

    const renderCombinedSlot = (slot: any) => (
      <div className='text-purple-700 min-h-[60px] flex flex-col text-center'>
        <div className='font-semibold text-xs mb-1 leading-tight'>Combined</div>
        {slot.sub_slots?.length > 0 && (
          <div className='flex-1 flex flex-col space-y-1'>
            {slot.sub_slots.map((subSlot: any, idx: number) => (
              <div
                key={`sub-${subSlot.id || idx}`}
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
                    {subSlot.staff_members?.length > 0 && (
                      <div className='text-xs text-gray-700 mb-0.5 leading-tight truncate'>
                        {subSlot.staff_members[0]?.first_name}{' '}
                        {subSlot.staff_members[0]?.last_name}
                      </div>
                    )}
                    {subSlot.sections?.length > 0 && (
                      <Badge
                        variant='outline'
                        className='text-xs bg-purple-50 text-purple-700 border-purple-200 px-1 py-0 h-4'
                      >
                        {subSlot.sections[0]?.section_name}
                        {subSlot.sections.length > 1 && ` +${subSlot.sections.length - 1}`}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );

    const renderSubdividedSlot = (slot: any) => {
      const groupCount = slot.sub_slots?.length || 0;
      const label = slot.subdivision_type
        ? slot.subdivision_type.charAt(0).toUpperCase() + slot.subdivision_type.slice(1)
        : 'Practical';
      const courses = new Set<string>();
      const staff = new Set<string>();
      slot.sub_slots?.forEach((s: any) => {
        if (s.course?.course_code) courses.add(s.course.course_code);
        s.staff_members?.forEach((m: any) => staff.add(`${m.first_name} ${m.last_name}`));
      });
      const courseList = [...courses];
      const staffList = [...staff];
      return (
        <div className='text-purple-700 min-h-[60px] flex flex-col text-center'>
          <div className='flex items-center justify-center gap-1 mb-1'>
            <Users className='h-3 w-3' />
            <span className='font-semibold text-xs leading-tight'>{label}</span>
          </div>
          <Badge variant='secondary' className='text-xs bg-purple-100 text-purple-800 border-purple-300 px-1 py-0 h-4 mx-auto mb-1'>
            {groupCount} Groups
          </Badge>
          {courseList.length > 0 && (
            <div className='text-xs text-gray-700 leading-tight'>
              {courseList.slice(0, 2).join(', ')}
              {courseList.length > 2 && ` +${courseList.length - 2}`}
            </div>
          )}
          {staffList.length > 0 && (
            <div className='text-xs text-gray-600 leading-tight'>
              {staffList.slice(0, 2).join(', ')}
              {staffList.length > 2 && <span className='text-gray-500'> +{staffList.length - 2}</span>}
            </div>
          )}
        </div>
      );
    };

    const renderPracticalSlot = (slot: any) => {
      const config = slot.practical_config;
      if (!config?.batches) {
        return (
          <div className='text-amber-600 text-xs min-h-[50px] flex items-center justify-center'>
            Practical (No batches)
          </div>
        );
      }
      const batchNames = config.batches.map((b: any) => b.batch_name).filter(Boolean);
      const courses = new Set<string>();
      config.batches.forEach((b: any) =>
        b.enriched_courses?.forEach((c: any) => { if (c.course_code) courses.add(c.course_code); })
      );
      const courseList = [...courses];
      return (
        <div className='text-purple-700 min-h-[50px] flex flex-col justify-center text-center'>
          <div className='font-semibold text-xs mb-0.5 leading-tight flex items-center justify-center gap-1'>
            <Users className='h-3 w-3' />
            <span>Practical</span>
          </div>
          {batchNames.length > 0 && (
            <div className='text-xs text-gray-700 mb-0.5 leading-tight'>
              {batchNames.slice(0, 2).join(', ')}
              {batchNames.length > 2 && ` +${batchNames.length - 2}`}
            </div>
          )}
          {courseList.length > 0 && (
            <div className='text-xs text-gray-600 leading-tight'>
              {courseList.slice(0, 2).join(', ')}
              {courseList.length > 2 && ` +${courseList.length - 2}`}
            </div>
          )}
        </div>
      );
    };

    const renderBreakSlot = (slot: any) => (
      <div className='text-orange-600 font-semibold text-xs min-h-[40px] flex items-center justify-center'>
        {slot.break_description || 'Break'}
      </div>
    );

    // ── Empty state ───────────────────────────────────────────────────────

    if (selectedPeriods.length === 0) {
      return (
        <div ref={ref} className='border rounded-lg p-8 text-center'>
          <div className='text-gray-500'>
            <RefreshCcw className='h-12 w-12 mx-auto mb-4 text-gray-300' />
            <h3 className='text-lg font-medium mb-2'>No Periods Configured</h3>
            <p className='text-sm'>
              Please configure periods to view the cycle timetable grid.
            </p>
          </div>
        </div>
      );
    }

    // ── Grid ─────────────────────────────────────────────────────────────

    return (
      <div ref={ref} className='border rounded-lg shadow-sm inline-block min-w-full'>
        <table className='w-max min-w-full border-collapse'>
          <thead className='bg-gradient-to-r from-amber-600 to-amber-700 text-white'>
            <tr>
              {/* Period column header */}
              <th className='border border-amber-500 p-2 text-left font-semibold text-xs w-24 sticky left-0 bg-amber-600 z-10'>
                <div className='flex items-center gap-1'>
                  <RefreshCcw className='h-3 w-3' />
                  <span>Period</span>
                </div>
              </th>
              {/* One column per cycle */}
              {cycleKeys.map((cycleKey, idx) => {
                const cycleNum = idx + 1;
                const isToday = todaysCycle === cycleNum;
                return (
                  <th
                    key={cycleKey}
                    className={`border border-amber-500 p-2 text-center font-semibold text-xs min-w-[120px] ${
                      isToday ? 'bg-amber-400 ring-2 ring-white ring-inset' : ''
                    }`}
                  >
                    <div className='flex flex-col items-center gap-0.5'>
                      <span>Cycle {cycleNum}</span>
                      {isToday && (
                        <span className='text-[10px] bg-white text-amber-700 rounded px-1 leading-tight font-bold'>
                          Today
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {selectedPeriods.map((period, rowIdx) => (
              <tr key={period.id} className={rowIdx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                {/* Period label cell (sticky) */}
                <td
                  className={`border border-gray-200 p-2 sticky left-0 z-10 ${
                    period.is_break
                      ? 'bg-gradient-to-r from-orange-600 to-orange-700 text-white'
                      : 'bg-gradient-to-r from-green-600 to-green-700 text-white'
                  }`}
                >
                  <div className='flex items-center gap-1'>
                    {lockedPeriods.includes(period.id) && (
                      <Lock className={`h-2 w-2 ${period.is_break ? 'text-orange-200' : 'text-green-200'}`} />
                    )}
                    <div>
                      <div className='font-semibold text-xs leading-tight'>
                        {period.period_name}
                      </div>
                      <div className={`text-xs leading-tight ${period.is_break ? 'text-orange-100' : 'text-green-100'}`}>
                        {new Date(`2000-01-01T${period.start_time}`).toLocaleTimeString('en-US', {
                          hour: 'numeric', minute: '2-digit', hour12: true
                        })}{' '}–{' '}
                        {new Date(`2000-01-01T${period.end_time}`).toLocaleTimeString('en-US', {
                          hour: 'numeric', minute: '2-digit', hour12: true
                        })}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Break row: spans all cycles */}
                {period.is_break ? (
                  <td
                    colSpan={numCycles}
                    className='border border-gray-200 p-1.5 text-center align-middle'
                  >
                    <div className='w-full h-14 border-2 border-dashed border-orange-200 bg-orange-50 rounded flex flex-col items-center justify-center text-orange-600 cursor-not-allowed mx-auto'>
                      <div className='text-sm font-semibold text-red-800'>{period.period_name}</div>
                      <div className='text-xs font-semibold text-black mt-1'>
                        {new Date(`2000-01-01T${period.start_time}`).toLocaleTimeString('en-US', {
                          hour: 'numeric', minute: '2-digit', hour12: true
                        })}{' '}–{' '}
                        {new Date(`2000-01-01T${period.end_time}`).toLocaleTimeString('en-US', {
                          hour: 'numeric', minute: '2-digit', hour12: true
                        })}
                      </div>
                    </div>
                  </td>
                ) : (
                  // Regular period: one cell per cycle
                  cycleKeys.map((cycleKey) => {
                    const slot = getSlot(cycleKey, period.id);
                    const isLocked = lockedPeriods.includes(period.id);

                    return (
                      <td
                        key={`${cycleKey}-${period.id}`}
                        className='border border-gray-200 p-1.5 text-center align-top'
                      >
                        {slot ? (
                          <div
                            className={`
                              p-1.5 border-2 rounded cursor-pointer transition-all duration-200
                              hover:shadow-md min-h-[60px] flex flex-col justify-center relative group
                              ${isLocked ? 'border-orange-300 bg-orange-50' : ''}
                              ${slot.is_break_slot
                                ? 'bg-orange-50 border-orange-200 hover:bg-orange-100'
                                : slot.period_mode === 'practical'
                                ? 'bg-purple-50 border-purple-400 hover:bg-purple-100'
                                : slot.is_subdivided
                                ? 'bg-purple-50 border-purple-300 hover:bg-purple-100'
                                : slot.is_combined
                                ? 'bg-purple-50 border-purple-200 hover:bg-purple-100'
                                : 'bg-blue-50 border-blue-200 hover:bg-blue-100'}
                            `}
                            onClick={() => onSlotClick(cycleKey, period, slot)}
                          >
                            {isLocked && !isSuperAdmin && (
                              <div
                                className='absolute top-1 left-1 p-1 rounded-full bg-orange-500 text-white z-10'
                                title='Attendance marked — Cannot modify'
                              >
                                <Lock className='h-3 w-3' />
                              </div>
                            )}
                            {canEdit && onSlotDelete && (isSuperAdmin || !isLocked) && (
                              <button
                                className='absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-red-500 hover:bg-red-600 text-white z-10'
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSlotDelete(cycleKey, period, slot);
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
                        ) : isLocked && !isSuperAdmin ? (
                          <div className='w-full h-14 border-2 border-dashed border-orange-300 bg-orange-50 rounded flex flex-col items-center justify-center cursor-not-allowed'>
                            <Lock className='h-3 w-3 text-orange-500' />
                            <span className='text-xs text-orange-600'>Locked</span>
                          </div>
                        ) : canEdit ? (
                          <Button
                            variant='ghost'
                            size='sm'
                            className='w-full h-14 border-2 border-dashed border-gray-200 hover:border-amber-400 hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors rounded'
                            onClick={() => onSlotClick(cycleKey, period)}
                          >
                            <div className='flex flex-col items-center gap-1'>
                              <span className='text-[10px]'>+ Add</span>
                            </div>
                          </Button>
                        ) : (
                          <div className='w-full h-14 border-2 border-dashed border-gray-100 rounded' />
                        )}
                      </td>
                    );
                  })
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
);

CycleTimetableGrid.displayName = 'CycleTimetableGrid';
