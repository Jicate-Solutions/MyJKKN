'use client';

import { useState, useEffect, useRef, forwardRef } from 'react';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit,
  Save,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Lock,
  Unlock,
  ListFilter,
  FileDown,
  Printer,
  Calendar,
  Settings,
  Download
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import Loading from '@/components/Loading/Loading';
import { useToast } from '@/hooks/use-toast';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { useTimetables } from '@/hooks/academic/use-timetables';
import { PeriodService } from '@/lib/services/academic/period-service';
import { useStaff } from '@/hooks/staff/use-staff';
import { useCourses } from '@/hooks/organization/use-courses';
import { useSections } from '@/hooks/organization/use-sections';
import {
  Timetable,
  TimetableSlot,
  TimetableSubSlot,
  DayOfWeek,
  Period,
  CreateTimetableSlotDto,
  CreateTimetableSubSlotDto
} from '@/types/academics';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// All available days (Monday to Saturday - Sunday is holiday)
const ALL_DAYS_OF_WEEK: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY'
];

// Create a sortable period item component
interface SortablePeriodItemProps {
  period: Period;
  index: number;
  onRemove: (id: string) => void;
  isLocked: boolean;
  onToggleLock: (id: string) => void;
}

function SortablePeriodItem({
  period,
  index,
  onRemove,
  isLocked,
  onToggleLock
}: SortablePeriodItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: period.id,
    disabled: isLocked
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
    boxShadow: isDragging ? '0 8px 16px rgba(0,0,0,0.1)' : 'none'
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 border p-2 rounded-md ${
        isLocked
          ? 'bg-slate-50 border-slate-200'
          : isDragging
          ? 'bg-blue-50 border-blue-200 shadow-lg'
          : 'bg-white hover:bg-slate-50 border-slate-200'
      } transition-colors mb-1.5`}
    >
      <div
        className={`${
          isLocked
            ? 'text-slate-300 cursor-not-allowed'
            : 'cursor-move text-blue-600 hover:text-blue-700'
        } p-1 rounded-md ${!isLocked && 'hover:bg-blue-50'} transition-colors`}
        {...(!isLocked ? attributes : {})}
        {...(!isLocked ? listeners : {})}
        title={isLocked ? 'Locked - cannot move' : 'Drag to reorder'}
      >
        <GripVertical className='h-3.5 w-3.5' />
      </div>
      <div className='flex-1'>
        <div className='flex items-center gap-1 mb-0.5'>
          <span className='font-semibold text-xs text-slate-800'>
            {period.period_name}
          </span>
          {period.is_break && (
            <Badge
              variant='outline'
              className='h-3.5 px-1 py-0 text-[9px] bg-amber-50 text-amber-600 border-amber-200'
            >
              Break
            </Badge>
          )}
        </div>
        <p className='text-[10px] text-slate-500'>
          {new Date(`2000-01-01T${period.start_time}`).toLocaleTimeString(
            'en-US',
            {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            }
          )}{' '}
          -{' '}
          {new Date(`2000-01-01T${period.end_time}`).toLocaleTimeString(
            'en-US',
            {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            }
          )}
        </p>
      </div>
      <div className='flex items-center gap-1'>
        <Button
          variant='ghost'
          size='sm'
          className={`h-6 w-6 p-0 rounded-full ${
            isLocked
              ? 'bg-blue-50 text-blue-600'
              : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
          }`}
          onClick={() => onToggleLock(period.id)}
          title={isLocked ? 'Unlock position' : 'Lock position'}
        >
          {isLocked ? (
            <Lock className='h-3 w-3' />
          ) : (
            <Unlock className='h-3 w-3' />
          )}
        </Button>
        <Button
          variant='ghost'
          size='sm'
          className='h-6 w-6 p-0 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50'
          onClick={() => onRemove(period.id)}
          title='Remove period'
        >
          <Trash2 className='h-3 w-3' />
        </Button>
      </div>
    </div>
  );
}

// Temporary component stubs - these should be replaced with full implementations
const TimetableGrid = forwardRef<
  HTMLDivElement,
  {
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
>(
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

    // Helper function to render slot content
    const renderSlotContent = (
      slot: TimetableSlot | undefined,
      day: DayOfWeek,
      period: Period
    ) => {
      if (!slot) {
        return (
          <Button
            variant='ghost'
            className='w-full h-20 border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-200'
            onClick={() => onSlotClick(day, period)}
          >
            <div className='text-center'>
              <Plus className='h-4 w-4 mx-auto mb-1 text-gray-400' />
              <span className='text-xs text-gray-500'>Add Class</span>
            </div>
          </Button>
        );
      }

      // Break slot
      if (slot.is_break_slot) {
        return (
          <Button
            variant='outline'
            className='w-full h-20 bg-orange-50 border-orange-200 hover:bg-orange-100 text-orange-900'
            onClick={() => onSlotClick(day, period, slot)}
          >
            <div className='text-center'>
              <Badge
                variant='secondary'
                className='mb-1 bg-orange-200 text-orange-800'
              >
                Break
              </Badge>
              <div className='text-xs font-medium'>
                {slot.break_description || 'Break Time'}
              </div>
            </div>
          </Button>
        );
      }

      // Combined class slot
      if (slot.is_combined && slot.sub_slots && slot.sub_slots.length > 0) {
        return (
          <Button
            variant='outline'
            className='w-full h-20 bg-purple-50 border-purple-200 hover:bg-purple-100 text-purple-900 p-1'
            onClick={() => onSlotClick(day, period, slot)}
          >
            <div className='w-full space-y-1'>
              <Badge
                variant='secondary'
                className='text-xs bg-purple-200 text-purple-800 mb-1'
              >
                Combined Class
              </Badge>
              <div className='grid grid-cols-2 gap-1 text-xs'>
                {slot.sub_slots.slice(0, 2).map((subSlot, index) => (
                  <div
                    key={index}
                    className='bg-white/70 rounded px-1 py-0.5 border'
                  >
                    {subSlot.is_break_slot ? (
                      <span className='text-orange-600 font-medium'>Break</span>
                    ) : (
                      <div className='truncate'>
                        <div className='font-medium truncate'>
                          {subSlot.course?.course_code || 'Course'}
                        </div>
                        {subSlot.staff_members &&
                          subSlot.staff_members.length > 0 && (
                            <div className='text-gray-600 truncate'>
                              {subSlot.staff_members[0]?.first_name}{' '}
                              {subSlot.staff_members[0]?.last_name}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Button>
        );
      }

      // Regular class slot
      return (
        <Button
          variant='outline'
          className='w-full h-20 bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-900'
          onClick={() => onSlotClick(day, period, slot)}
        >
          <div className='text-center w-full'>
            <div className='font-medium text-sm mb-1 truncate'>
              {slot.course?.course_name || slot.course?.course_code || 'Course'}
            </div>
            {slot.staff_members && slot.staff_members.length > 0 && (
              <div className='text-xs text-gray-600 mb-1 truncate'>
                {slot.staff_members
                  .map((s) => `${s.first_name} ${s.last_name}`)
                  .join(', ')}
              </div>
            )}
            {slot.sections && slot.sections.length > 0 && (
              <div className='text-xs text-gray-500 truncate'>
                {slot.sections.map((s) => s.section_name).join(', ')}
              </div>
            )}
          </div>
        </Button>
      );
    };

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
      <div ref={ref} className='border rounded-lg overflow-hidden bg-white'>
        <div className='bg-gray-50 p-4 border-b'>
          <h3 className='text-lg font-semibold'>Timetable Grid</h3>
          <p className='text-sm text-gray-600 mt-1'>
            Click on any slot to add or edit classes
          </p>
        </div>

        <div className='overflow-x-auto'>
          <table className='w-full border-collapse'>
            <thead>
              <tr className='bg-gray-100'>
                <th className='border border-gray-200 p-3 text-left font-medium w-32'>
                  Time / Day
                </th>
                {selectedDays.map((day) => (
                  <th
                    key={day}
                    className='border border-gray-200 p-3 text-center font-medium min-w-40'
                  >
                    <div className='space-y-1'>
                      <div className='font-semibold'>
                        {day.charAt(0) + day.slice(1).toLowerCase()}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedPeriods.map((period) => {
                const isLocked = lockedPeriods.includes(period.id);
                return (
                  <tr key={period.id} className='hover:bg-gray-50'>
                    <td className='border border-gray-200 p-3 bg-gray-50'>
                      <div className='space-y-1'>
                        <div className='font-medium text-sm'>
                          {period.period_name}
                          {isLocked && (
                            <Lock className='inline h-3 w-3 ml-1 text-blue-500' />
                          )}
                        </div>
                        <div className='text-xs text-gray-500'>
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
                        {period.is_break && (
                          <Badge
                            variant='outline'
                            className='text-xs bg-orange-100 text-orange-700 border-orange-200'
                          >
                            Break Period
                          </Badge>
                        )}
                      </div>
                    </td>
                    {selectedDays.map((day) => {
                      const slot = getSlotForDayAndPeriod(day, period.id);
                      return (
                        <td
                          key={`${day}-${period.id}`}
                          className='border border-gray-200 p-2'
                        >
                          {renderSlotContent(slot, day, period)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selectedPeriods.length === 0 && (
          <div className='p-8 text-center text-gray-500'>
            <p>
              No periods configured. Please add periods to see the timetable.
            </p>
          </div>
        )}
      </div>
    );
  }
);

TimetableGrid.displayName = 'TimetableGrid';

const SlotDialog = ({
  isOpen,
  onClose,
  day,
  period,
  existingSlot,
  slotType,
  setSlotType,
  selectedCourse,
  setSelectedCourse,
  selectedStaff,
  setSelectedStaff,
  selectedSections,
  setSelectedSections,
  isCombinedClass,
  setIsCombinedClass,
  subSlots,
  updateSubSlot,
  updateSubSlotStaff,
  updateSubSlotSections,
  saving,
  onSave,
  onDelete,
  courses,
  staff,
  sections
}: any) => {
  if (!isOpen || !day || !period) return null;

  const isBreakSlot = slotType === 'break';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='max-w-4xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            {existingSlot ? 'Edit' : 'Create'} Slot
            <Badge variant='outline' className='text-xs'>
              {day.charAt(0) + day.slice(1).toLowerCase()} -{' '}
              {period?.period_name}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className='space-y-6'>
          {/* Slot Type Selection */}
          <div className='space-y-3'>
            <Label className='text-sm font-medium'>Slot Type</Label>
            <div className='flex gap-4'>
              <div className='flex items-center space-x-2'>
                <Checkbox
                  id='regularSlot'
                  checked={slotType === 'regular'}
                  onCheckedChange={() => setSlotType('regular')}
                />
                <Label htmlFor='regularSlot'>Regular Class</Label>
              </div>
              <div className='flex items-center space-x-2'>
                <Checkbox
                  id='breakSlot'
                  checked={slotType === 'break'}
                  onCheckedChange={() => setSlotType('break')}
                />
                <Label htmlFor='breakSlot'>Break</Label>
              </div>
            </div>
          </div>

          {!isBreakSlot && (
            <div className='space-y-3'>
              <div className='flex items-center space-x-2'>
                <Checkbox
                  id='combinedClass'
                  checked={isCombinedClass}
                  onCheckedChange={setIsCombinedClass}
                />
                <Label htmlFor='combinedClass'>Combined Class</Label>
                <Badge variant='secondary' className='text-xs ml-2'>
                  Split period into 2 sub-slots
                </Badge>
              </div>
            </div>
          )}

          {/* Break Slot Configuration */}
          {isBreakSlot && (
            <div className='space-y-3'>
              <Label htmlFor='breakDescription'>Break Description</Label>
              <Input
                id='breakDescription'
                placeholder='e.g., Lunch Break, Tea Break'
                className='max-w-md'
              />
            </div>
          )}

          {/* Regular Slot Configuration */}
          {!isBreakSlot && !isCombinedClass && (
            <div className='space-y-4 border rounded-lg p-4'>
              <h4 className='font-medium'>Class Configuration</h4>

              {/* Course Selection */}
              <div className='space-y-2'>
                <Label>Course</Label>
                <Select
                  value={selectedCourse}
                  onValueChange={setSelectedCourse}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select a course' />
                  </SelectTrigger>
                  <SelectContent>
                    {courses?.map((course: any) => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.course_name} ({course.course_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Staff Selection */}
              <div className='space-y-2'>
                <Label>Staff (Multiple selection allowed)</Label>
                <div className='border rounded-md p-2 max-h-32 overflow-y-auto'>
                  {staff?.map((member: any) => (
                    <div
                      key={member.id}
                      className='flex items-center space-x-2 py-1'
                    >
                      <Checkbox
                        id={`staff-${member.id}`}
                        checked={selectedStaff.includes(member.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedStaff([...selectedStaff, member.id]);
                          } else {
                            setSelectedStaff(
                              selectedStaff.filter(
                                (id: string) => id !== member.id
                              )
                            );
                          }
                        }}
                      />
                      <Label htmlFor={`staff-${member.id}`} className='text-sm'>
                        {member.first_name} {member.last_name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section Selection */}
              <div className='space-y-2'>
                <Label>Sections (Multiple selection allowed)</Label>
                <div className='border rounded-md p-2 max-h-32 overflow-y-auto'>
                  {sections?.map((section: any) => (
                    <div
                      key={section.id}
                      className='flex items-center space-x-2 py-1'
                    >
                      <Checkbox
                        id={`section-${section.id}`}
                        checked={selectedSections.includes(section.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedSections([
                              ...selectedSections,
                              section.id
                            ]);
                          } else {
                            setSelectedSections(
                              selectedSections.filter(
                                (id: string) => id !== section.id
                              )
                            );
                          }
                        }}
                      />
                      <Label
                        htmlFor={`section-${section.id}`}
                        className='text-sm'
                      >
                        {section.section_name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Combined Class Configuration */}
          {!isBreakSlot && isCombinedClass && (
            <div className='space-y-4'>
              <h4 className='font-medium'>Combined Class Configuration</h4>

              {subSlots.map((subSlot: any, index: number) => (
                <div key={index} className='border rounded-lg p-4 space-y-4'>
                  <div className='flex items-center justify-between'>
                    <h5 className='font-medium'>Sub-slot {index + 1}</h5>
                    <div className='flex items-center space-x-2'>
                      <Checkbox
                        id={`subSlotBreak-${index}`}
                        checked={subSlot.is_break_slot}
                        onCheckedChange={(checked) => {
                          updateSubSlot(index, { is_break_slot: checked });
                        }}
                      />
                      <Label
                        htmlFor={`subSlotBreak-${index}`}
                        className='text-sm'
                      >
                        Break Slot
                      </Label>
                    </div>
                  </div>

                  {subSlot.is_break_slot ? (
                    <div className='space-y-2'>
                      <Label>Break Description</Label>
                      <Input
                        value={subSlot.break_description || ''}
                        onChange={(e) =>
                          updateSubSlot(index, {
                            break_description: e.target.value
                          })
                        }
                        placeholder='e.g., Short Break'
                      />
                    </div>
                  ) : (
                    <div className='space-y-4'>
                      {/* Course Selection */}
                      <div className='space-y-2'>
                        <Label>Course</Label>
                        <Select
                          value={subSlot.course_id || ''}
                          onValueChange={(value) =>
                            updateSubSlot(index, { course_id: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder='Select a course' />
                          </SelectTrigger>
                          <SelectContent>
                            {courses?.map((course: any) => (
                              <SelectItem key={course.id} value={course.id}>
                                {course.course_name} ({course.course_code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Staff Selection */}
                      <div className='space-y-2'>
                        <Label>Staff</Label>
                        <div className='border rounded-md p-2 max-h-24 overflow-y-auto'>
                          {staff?.map((member: any) => (
                            <div
                              key={member.id}
                              className='flex items-center space-x-2 py-1'
                            >
                              <Checkbox
                                id={`subSlotStaff-${index}-${member.id}`}
                                checked={
                                  subSlot.staff_ids?.includes(member.id) ||
                                  false
                                }
                                onCheckedChange={(checked) => {
                                  const currentStaff = subSlot.staff_ids || [];
                                  if (checked) {
                                    updateSubSlotStaff(index, [
                                      ...currentStaff,
                                      member.id
                                    ]);
                                  } else {
                                    updateSubSlotStaff(
                                      index,
                                      currentStaff.filter(
                                        (id: string) => id !== member.id
                                      )
                                    );
                                  }
                                }}
                              />
                              <Label
                                htmlFor={`subSlotStaff-${index}-${member.id}`}
                                className='text-xs'
                              >
                                {member.first_name} {member.last_name}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Section Selection */}
                      <div className='space-y-2'>
                        <Label>Sections</Label>
                        <div className='border rounded-md p-2 max-h-24 overflow-y-auto'>
                          {sections?.map((section: any) => (
                            <div
                              key={section.id}
                              className='flex items-center space-x-2 py-1'
                            >
                              <Checkbox
                                id={`subSlotSection-${index}-${section.id}`}
                                checked={
                                  subSlot.section_ids?.includes(section.id) ||
                                  false
                                }
                                onCheckedChange={(checked) => {
                                  const currentSections =
                                    subSlot.section_ids || [];
                                  if (checked) {
                                    updateSubSlotSections(index, [
                                      ...currentSections,
                                      section.id
                                    ]);
                                  } else {
                                    updateSubSlotSections(
                                      index,
                                      currentSections.filter(
                                        (id: string) => id !== section.id
                                      )
                                    );
                                  }
                                }}
                              />
                              <Label
                                htmlFor={`subSlotSection-${index}-${section.id}`}
                                className='text-xs'
                              >
                                {section.section_name}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className='flex items-center justify-between'>
          <div>
            {existingSlot && (
              <Button
                variant='destructive'
                onClick={onDelete}
                className='mr-auto'
              >
                Delete Slot
              </Button>
            )}
          </div>
          <div className='flex gap-2'>
            <Button variant='outline' onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving
                ? 'Saving...'
                : existingSlot
                ? 'Update Slot'
                : 'Create Slot'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function TimetableDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const unwrappedParams = use(params);
  const timetableId = unwrappedParams.id;
  const { saveTimetableAsTemplate } = useTimetables();

  // Add ref for timetable grid capture
  const timetableGridRef = useRef<HTMLDivElement>(null);
  const timetableInfoRef = useRef<HTMLDivElement>(null);

  // States
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<Period[]>([]);
  const [periodSelectorOpen, setPeriodSelectorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);
  const [isBreakSlot, setIsBreakSlot] = useState(false);
  const [breakDescription, setBreakDescription] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [sectionSearchQuery, setSectionSearchQuery] = useState('');
  const [savingSlot, setSavingSlot] = useState(false);

  // Combined class state
  const [isCombinedClass, setIsCombinedClass] = useState(false);
  const [subSlots, setSubSlots] = useState<CreateTimetableSubSlotDto[]>([
    {
      sub_slot_order: 1,
      course_id: '',
      staff_ids: [],
      section_ids: [],
      is_break_slot: false,
      break_description: ''
    },
    {
      sub_slot_order: 2,
      course_id: '',
      staff_ids: [],
      section_ids: [],
      is_break_slot: false,
      break_description: ''
    }
  ]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState<TimetableSlot | null>(null);
  const [lockedPeriods, setLockedPeriods] = useState<string[]>([]);
  const [addPeriodDialogOpen, setAddPeriodDialogOpen] = useState(false);
  const [savingPeriods, setSavingPeriods] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Day configuration state
  const [selectedDays, setSelectedDays] =
    useState<DayOfWeek[]>(ALL_DAYS_OF_WEEK);
  const [dayConfigOpen, setDayConfigOpen] = useState(false);

  // Additional state for UI components
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [slotType, setSlotType] = useState<'regular' | 'break'>('regular');
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);

  // Fetch courses, staff and sections data
  const {
    courses,
    loading: loadingCourses,
    fetchCourses
  } = useCourses({
    institution_id: timetable?.institution_id,
    isActive: true
  });

  const {
    staff,
    loading: loadingStaff,
    fetchStaff
  } = useStaff({
    isActive: true
  });

  const { sections, loading: loadingSections, fetchSections } = useSections();

  // Helper function to sort periods by name naturally (Period 1, Period 2, etc.)
  const sortPeriodsByName = (periods: Period[]): Period[] => {
    return periods.sort((a, b) => {
      const aName = a.period_name.toLowerCase();
      const bName = b.period_name.toLowerCase();

      // Extract numbers from period names for proper sorting
      const aMatch = aName.match(/(\d+)/);
      const bMatch = bName.match(/(\d+)/);

      if (aMatch && bMatch) {
        const aNumber = parseInt(aMatch[1]);
        const bNumber = parseInt(bMatch[1]);
        return aNumber - bNumber;
      }

      // Fallback to alphabetical sorting if no numbers found
      return aName.localeCompare(bName);
    });
  };

  // Handle unsaved changes warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue =
          'You have unsaved changes. Are you sure you want to leave?';
        return 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Load selected periods from local storage
  useEffect(() => {
    if (typeof window !== 'undefined' && timetableId) {
      const storedPeriods = localStorage.getItem(
        `selectedPeriods-${timetableId}`
      );
      if (storedPeriods) {
        try {
          const periodIds = JSON.parse(storedPeriods);
          // We'll apply these IDs after periods are loaded
          if (periods.length > 0) {
            // Fix: Instead of just filtering, we need to maintain the order from localStorage
            const orderedPeriods = periodIds
              .map((id: string) => periods.find((period) => period.id === id))
              .filter(Boolean); // Filter out any undefined values

            if (orderedPeriods.length > 0) {
              setSelectedPeriods(orderedPeriods);
            }
          }
        } catch (err) {
          console.error('Error parsing stored periods:', err);
        }
      }

      // Load locked periods from localStorage
      const storedLockedPeriods = localStorage.getItem(
        `lockedPeriods-${timetableId}`
      );
      if (storedLockedPeriods) {
        try {
          const lockedIds = JSON.parse(storedLockedPeriods);
          setLockedPeriods(lockedIds);
        } catch (err) {
          console.error('Error parsing locked periods:', err);
        }
      }
    }
  }, [periods, timetableId]);

  // Save selected periods to local storage
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

  // Save locked periods to local storage
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

  // Fetch timetable data
  const fetchTimetableData = async () => {
    try {
      setLoading(true);
      setError(null);
      const timetableData = await TimetableService.getTimetable(timetableId);
      setTimetable(timetableData);

      // Set slots from timetable data
      if (timetableData.slots) {
        setSlots(timetableData.slots);
      } else {
        setSlots([]);
      }

      // Fetch periods filtered by institution
      const periodsResult = await PeriodService.getPeriods({
        limit: 50,
        institution_id: timetableData.institution_id
      });
      setPeriods(periodsResult.data);

      // Load selected periods from timetable_periods table
      const timetablePeriods = await TimetableService.getTimetablePeriods(
        timetableId
      );
      if (timetablePeriods.length > 0) {
        const selectedPeriodsFromDB = timetablePeriods
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((tp) => tp.period)
          .filter(Boolean);
        setSelectedPeriods(selectedPeriodsFromDB);
      }

      // Load selected days from timetable data
      if (
        timetableData.selected_days &&
        timetableData.selected_days.length > 0
      ) {
        setSelectedDays(timetableData.selected_days);
      } else {
        setSelectedDays(ALL_DAYS_OF_WEEK);
      }

      // Load related courses - fetch from course mappings for this program and semester
      if (timetableData.institution_id) {
        fetchCourses({
          institution_id: timetableData.institution_id,
          isActive: true
        });
      }

      // Load staff
      fetchStaff();

      // Load sections
      fetchSections();
    } catch (err) {
      console.error('Error fetching timetable data:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimetableData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timetableId]);

  // Save as template handler
  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a template name',
        variant: 'destructive'
      });
      return;
    }

    setSavingTemplate(true);
    try {
      const success = await saveTimetableAsTemplate(timetableId, templateName);
      if (success) {
        toast({
          title: 'Success',
          description: 'Timetable saved as template successfully'
        });
        setTemplateDialogOpen(false);
      } else {
        throw new Error('Failed to save template');
      }
    } catch (err) {
      console.error('Error saving as template:', err);
      toast({
        title: 'Error',
        description: 'Failed to save as template. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setSavingTemplate(false);
    }
  };

  // Open slot dialog to add or edit a slot
  const openSlotDialog = (
    day: DayOfWeek,
    period: Period,
    existingSlot?: TimetableSlot
  ) => {
    setSelectedDay(day);
    setSelectedPeriod(period);

    if (existingSlot) {
      setSelectedSlot(existingSlot);
      setIsCombinedClass(existingSlot.is_combined || false);

      if (existingSlot.is_combined && existingSlot.sub_slots) {
        // Handle combined slot with sub-slots
        setIsBreakSlot(false);
        setBreakDescription('');
        setSelectedCourseId('');
        setSelectedStaffIds([]);
        setSelectedSectionIds([]);

        // Populate sub-slots
        const updatedSubSlots = [
          {
            sub_slot_order: 1 as const,
            course_id:
              existingSlot.sub_slots.find((ss) => ss.sub_slot_order === 1)
                ?.course_id || '',
            staff_ids:
              existingSlot.sub_slots
                .find((ss) => ss.sub_slot_order === 1)
                ?.staff_members?.map((s) => s.id) || [],
            section_ids:
              existingSlot.sub_slots
                .find((ss) => ss.sub_slot_order === 1)
                ?.sections?.map((s) => s.id) || [],
            is_break_slot:
              existingSlot.sub_slots.find((ss) => ss.sub_slot_order === 1)
                ?.is_break_slot || false,
            break_description:
              existingSlot.sub_slots.find((ss) => ss.sub_slot_order === 1)
                ?.break_description || ''
          },
          {
            sub_slot_order: 2 as const,
            course_id:
              existingSlot.sub_slots.find((ss) => ss.sub_slot_order === 2)
                ?.course_id || '',
            staff_ids:
              existingSlot.sub_slots
                .find((ss) => ss.sub_slot_order === 2)
                ?.staff_members?.map((s) => s.id) || [],
            section_ids:
              existingSlot.sub_slots
                .find((ss) => ss.sub_slot_order === 2)
                ?.sections?.map((s) => s.id) || [],
            is_break_slot:
              existingSlot.sub_slots.find((ss) => ss.sub_slot_order === 2)
                ?.is_break_slot || false,
            break_description:
              existingSlot.sub_slots.find((ss) => ss.sub_slot_order === 2)
                ?.break_description || ''
          }
        ];
        setSubSlots(updatedSubSlots);
      } else {
        // Handle regular slot
        setIsBreakSlot(existingSlot.is_break_slot);
        setBreakDescription(existingSlot.break_description || '');
        setSelectedCourseId(existingSlot.course_id || '');

        // Handle both legacy single staff and new multiple staff
        if (
          existingSlot.staff_members &&
          existingSlot.staff_members.length > 0
        ) {
          setSelectedStaffIds(existingSlot.staff_members.map((s) => s.id));
        } else if (existingSlot.staff_id) {
          setSelectedStaffIds([existingSlot.staff_id]);
        } else {
          setSelectedStaffIds([]);
        }

        // Handle sections
        if (existingSlot.sections && existingSlot.sections.length > 0) {
          setSelectedSectionIds(existingSlot.sections.map((s) => s.id));
        } else {
          setSelectedSectionIds([]);
        }

        // Reset sub-slots to default
        setSubSlots([
          {
            sub_slot_order: 1,
            course_id: '',
            staff_ids: [],
            section_ids: [],
            is_break_slot: false,
            break_description: ''
          },
          {
            sub_slot_order: 2,
            course_id: '',
            staff_ids: [],
            section_ids: [],
            is_break_slot: false,
            break_description: ''
          }
        ]);
      }
    } else {
      // Creating new slot - reset everything
      setSelectedSlot(null);
      setIsCombinedClass(false);
      setIsBreakSlot(false);
      setBreakDescription('');
      setSelectedCourseId('');
      setSelectedStaffIds([]);
      setSelectedSectionIds([]);
      setSubSlots([
        {
          sub_slot_order: 1,
          course_id: '',
          staff_ids: [],
          section_ids: [],
          is_break_slot: false,
          break_description: ''
        },
        {
          sub_slot_order: 2,
          course_id: '',
          staff_ids: [],
          section_ids: [],
          is_break_slot: false,
          break_description: ''
        }
      ]);
    }

    setSlotDialogOpen(true);
  };

  // Close slot dialog and reset form
  const closeSlotDialog = () => {
    setSlotDialogOpen(false);
    setSelectedDay(null);
    setSelectedPeriod(null);
    setSelectedSlot(null);
    setIsCombinedClass(false);
    setIsBreakSlot(false);
    setBreakDescription('');
    setSelectedCourseId('');
    setSelectedStaffIds([]);
    setSelectedSectionIds([]);
    setStaffSearchQuery('');
    setSectionSearchQuery('');
    setSubSlots([
      {
        sub_slot_order: 1,
        course_id: '',
        staff_ids: [],
        section_ids: [],
        is_break_slot: false,
        break_description: ''
      },
      {
        sub_slot_order: 2,
        course_id: '',
        staff_ids: [],
        section_ids: [],
        is_break_slot: false,
        break_description: ''
      }
    ]);
  };

  // Helper functions for sub-slot management
  const updateSubSlot = (
    index: number,
    updates: Partial<CreateTimetableSubSlotDto>
  ) => {
    setSubSlots((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, ...updates } : slot))
    );
  };

  const updateSubSlotStaff = (index: number, staffIds: string[]) => {
    updateSubSlot(index, { staff_ids: staffIds });
  };

  const updateSubSlotSections = (index: number, sectionIds: string[]) => {
    updateSubSlot(index, { section_ids: sectionIds });
  };

  // Save a timetable slot
  const saveSlot = async () => {
    if (!selectedDay || !selectedPeriod) return;

    setSavingSlot(true);
    try {
      if (isCombinedClass) {
        // Handle combined class
        const slotData: CreateTimetableSlotDto = {
          timetable_id: timetableId,
          day_of_week: selectedDay,
          period_id: selectedPeriod.id,
          is_combined: true,
          is_break_slot: false,
          sub_slots: subSlots.filter(
            (subSlot) =>
              subSlot.is_break_slot ||
              (subSlot.course_id && subSlot.course_id !== 'none')
          )
        };

        let result;
        if (selectedSlot) {
          // Update existing slot
          result = await TimetableService.updateTimetableSlot(selectedSlot.id, {
            is_combined: true,
            is_break_slot: false,
            course_id: undefined, // No main course for combined slots
            staff_ids: [], // Clear main staff for combined slots
            section_ids: [], // Clear main sections for combined slots
            sub_slots: slotData.sub_slots
          });
        } else {
          // Create new slot
          result = await TimetableService.createTimetableSlot(slotData);
        }

        // Check for staff conflicts in sub-slots
        for (const subSlot of subSlots) {
          if (subSlot.staff_ids && subSlot.staff_ids.length > 0) {
            for (const staffId of subSlot.staff_ids) {
              const hasConflict = await TimetableService.checkStaffConflicts(
                staffId,
                selectedDay,
                selectedPeriod.id,
                timetableId
              );

              if (hasConflict) {
                const staffMember = staff.find((s) => s.id === staffId);
                const staffName = staffMember
                  ? `${staffMember.first_name} ${staffMember.last_name}`
                  : 'Staff member';

                toast({
                  title: 'Warning',
                  description: `${staffName} is already assigned to another class at this time.`,
                  variant: 'destructive'
                });
              }
            }
          }
        }
      } else {
        // Handle regular slot
        const slotData: CreateTimetableSlotDto = {
          timetable_id: timetableId,
          day_of_week: selectedDay,
          period_id: selectedPeriod.id,
          is_combined: false,
          is_break_slot: isBreakSlot,
          break_description: isBreakSlot ? breakDescription : undefined,
          course_id:
            !isBreakSlot && selectedCourseId && selectedCourseId !== 'none'
              ? selectedCourseId
              : undefined,
          staff_ids:
            !isBreakSlot && selectedCourseId && selectedCourseId !== 'none'
              ? selectedStaffIds.filter((id) => id !== 'none')
              : undefined,
          section_ids:
            !isBreakSlot && selectedCourseId && selectedCourseId !== 'none'
              ? selectedSectionIds.filter((id) => id !== 'none')
              : undefined
        };

        let result;
        if (selectedSlot) {
          // Update existing slot
          result = await TimetableService.updateTimetableSlot(selectedSlot.id, {
            is_combined: false,
            is_break_slot: isBreakSlot,
            break_description: isBreakSlot ? breakDescription : undefined,
            course_id:
              !isBreakSlot && selectedCourseId && selectedCourseId !== 'none'
                ? selectedCourseId
                : undefined,
            staff_ids:
              !isBreakSlot && selectedCourseId && selectedCourseId !== 'none'
                ? selectedStaffIds.filter((id) => id !== 'none')
                : undefined,
            section_ids:
              !isBreakSlot && selectedCourseId && selectedCourseId !== 'none'
                ? selectedSectionIds.filter((id) => id !== 'none')
                : undefined,
            sub_slots: [] // Clear sub-slots for regular slots
          });
        } else {
          // Create new slot
          result = await TimetableService.createTimetableSlot(slotData);
        }

        // Check for staff conflicts for regular slots
        if (slotData.staff_ids && slotData.staff_ids.length > 0) {
          for (const staffId of slotData.staff_ids) {
            const hasConflict = await TimetableService.checkStaffConflicts(
              staffId,
              slotData.day_of_week,
              slotData.period_id,
              timetableId
            );

            if (hasConflict) {
              const staffMember = staff.find((s) => s.id === staffId);
              const staffName = staffMember
                ? `${staffMember.first_name} ${staffMember.last_name}`
                : 'Staff member';

              toast({
                title: 'Warning',
                description: `${staffName} is already assigned to another class at this time.`,
                variant: 'destructive'
              });
            }
          }
        }
      }

      // Refresh timetable data
      await fetchTimetableData();

      toast({
        title: 'Success',
        description: selectedSlot
          ? 'Slot updated successfully'
          : 'Slot added successfully'
      });

      closeSlotDialog();
    } catch (err) {
      console.error('Error saving slot:', err);
      toast({
        title: 'Error',
        description: 'Failed to save slot. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setSavingSlot(false);
    }
  };

  // Delete a timetable slot
  const deleteSlot = async () => {
    if (!slotToDelete) return;

    try {
      await TimetableService.deleteTimetableSlot(slotToDelete.id);

      // Refresh timetable data
      await fetchTimetableData();

      toast({
        title: 'Success',
        description: 'Slot deleted successfully'
      });

      setDeleteDialogOpen(false);
      setSlotToDelete(null);
    } catch (err) {
      console.error('Error deleting slot:', err);
      toast({
        title: 'Error',
        description: 'Failed to delete slot. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Open delete dialog
  const openDeleteDialog = (slot: TimetableSlot) => {
    setSlotToDelete(slot);
    setDeleteDialogOpen(true);
  };

  // Get slot for a day and period
  const getSlot = (day: DayOfWeek, periodId: string) => {
    return timetable?.slots?.find(
      (slot) => slot.day_of_week === day && slot.period_id === periodId
    );
  };

  // Handle period selection
  const handlePeriodSelection = (selectedIds: string[]) => {
    const newSelectedPeriods = periods.filter((period) =>
      selectedIds.includes(period.id)
    );
    setSelectedPeriods(newSelectedPeriods);
    setPeriodSelectorOpen(false);
  };

  // Set up DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8 // Start dragging after moving 8px to prevent accidental drags
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  // Handle DnD end event
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSelectedPeriods((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
      setHasUnsavedChanges(true);
    }
  };

  // Handle removing a period
  const handleRemovePeriod = (id: string) => {
    setSelectedPeriods(selectedPeriods.filter((p) => p.id !== id));
    // Also remove from locked periods if it was locked
    if (lockedPeriods.includes(id)) {
      setLockedPeriods(lockedPeriods.filter((periodId) => periodId !== id));
    }
    setHasUnsavedChanges(true);
  };

  // Toggle lock for a period
  const toggleLockPeriod = (id: string) => {
    if (lockedPeriods.includes(id)) {
      setLockedPeriods(lockedPeriods.filter((periodId) => periodId !== id));
    } else {
      setLockedPeriods([...lockedPeriods, id]);
    }
  };

  // Add a period to the timetable
  const addPeriod = (period: Period) => {
    if (!selectedPeriods.some((p) => p.id === period.id)) {
      setSelectedPeriods((prev) => sortPeriodsByName([...prev, period]));
      setHasUnsavedChanges(true);
    }
  };

  // Save selected periods and days to database
  const savePeriodSelections = async () => {
    if (!timetable) return;

    setSavingPeriods(true);
    try {
      // Save period selections to timetable_periods table
      const currentPeriodIds = selectedPeriods.map((p) => p.id);
      await TimetableService.saveTimetablePeriods(
        timetableId,
        currentPeriodIds
      );

      // Save day selections to timetables table
      await TimetableService.saveTimetableDays(timetableId, selectedDays);

      // Only remove slots for periods that are no longer selected OR days that are no longer selected
      const slotsToDelete =
        timetable.slots?.filter(
          (slot) =>
            (!currentPeriodIds.includes(slot.period_id) ||
              !selectedDays.includes(slot.day_of_week)) &&
            !slot.course_id && // Only delete empty slots
            !slot.is_break_slot &&
            !slot.break_description // Don't delete break slots with descriptions
        ) || [];

      // Delete slots for periods/days that are no longer selected
      for (const slot of slotsToDelete) {
        await TimetableService.deleteTimetableSlot(slot.id);
      }

      // Refresh timetable data
      await fetchTimetableData();

      // Clear unsaved changes flag after successful save
      setHasUnsavedChanges(false);

      toast({
        title: 'Success',
        description: `Timetable configuration saved successfully. All users can now see the same layout.`
      });
    } catch (err) {
      console.error('Error saving timetable configuration:', err);
      toast({
        title: 'Error',
        description:
          'Failed to save timetable configuration. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setSavingPeriods(false);
    }
  };

  // Get available periods (not already selected)
  const getAvailablePeriods = () => {
    return periods.filter(
      (period) => !selectedPeriods.some((p) => p.id === period.id)
    );
  };

  // Day management functions
  const handleDayToggle = (day: DayOfWeek) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      // Insert in correct order
      const newDays = [...selectedDays, day];
      const orderedDays = ALL_DAYS_OF_WEEK.filter((day) =>
        newDays.includes(day)
      );
      setSelectedDays(orderedDays);
    }
    setHasUnsavedChanges(true);
  };

  const selectAllDays = () => {
    setSelectedDays([...ALL_DAYS_OF_WEEK]);
    setHasUnsavedChanges(true);
  };

  const clearAllDays = () => {
    setSelectedDays([]);
    setHasUnsavedChanges(true);
  };

  // Add PDF export function
  const exportToPDF = async () => {
    if (!timetable || !timetableGridRef.current || !timetableInfoRef.current)
      return;

    try {
      // Show loading toast
      toast({
        title: 'Generating PDF',
        description: 'Please wait while we generate your timetable PDF...'
      });

      const pdf = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.width;
      const pageHeight = pdf.internal.pageSize.height;
      const margin = 15;

      // Set document properties
      pdf.setProperties({
        title: `Timetable - ${timetable.timetable_name}`,
        subject: `Timetable for ${timetable.semester}`,
        creator: 'JKKN Timetable System'
      });

      // Save the PDF
      pdf.save(
        `Timetable_${timetable.timetable_name.replace(/\s+/g, '_')}.pdf`
      );

      // Success toast
      toast({
        title: 'PDF Generated',
        description: 'Your timetable has been exported to PDF successfully.'
      });
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast({
        title: 'Error',
        description: 'Failed to generate PDF. Please try again.',
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return <Loading title='Loading timetable...' />;
  }

  if (error || !timetable) {
    return (
      <ContentLayout title='Timetable Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error || 'Timetable not found'}</p>
          <Button
            variant='outline'
            onClick={() => router.push('/academic/timetables')}
            className='mt-4'
          >
            Back to Timetables
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Timetable Details'>
      <div className='space-y-6'>
        {/* Timetable Header */}
        <div className='bg-white rounded-lg shadow-sm border'>
          <div className='p-6'>
            <div className='flex items-center justify-between mb-4'>
              <div>
                <h1 className='text-2xl font-bold text-gray-900'>
                  {timetable.timetable_name}
                </h1>
                <p className='text-sm text-gray-500 mt-1'>
                  Manage and view the timetable details
                </p>
              </div>
              <div className='flex items-center gap-2'>
                <Button variant='outline' size='sm'>
                  <ArrowLeft className='h-4 w-4 mr-2' />
                  Back
                </Button>
              </div>
            </div>

            {/* Timetable Info Cards */}
            <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
              {/* Institution & Academic Details */}
              <div className='space-y-4'>
                <h3 className='font-medium text-gray-900'>
                  Institution & Academic Details
                </h3>
                <div className='space-y-3 text-sm'>
                  <div>
                    <span className='text-gray-500'>Institution</span>
                    <p className='font-medium'>
                      {timetable.institution?.name || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className='text-gray-500'>Academic Year</span>
                    <p className='font-medium'>2025-2026 A</p>
                  </div>
                  <div>
                    <span className='text-gray-500'>Start Date</span>
                    <p className='font-medium'>June 1st, 2025</p>
                  </div>
                  <div>
                    <span className='text-gray-500'>End Date</span>
                    <p className='font-medium'>June 30th, 2025</p>
                  </div>
                </div>
              </div>

              {/* Program Information */}
              <div className='space-y-4'>
                <h3 className='font-medium text-gray-900'>
                  Program Information
                </h3>
                <div className='space-y-3 text-sm'>
                  <div>
                    <span className='text-gray-500'>Degree</span>
                    <p className='font-medium'>Undergraduate</p>
                  </div>
                  <div>
                    <span className='text-gray-500'>Program</span>
                    <p className='font-medium'>
                      (BDS) Bachelor of Dental Surgery
                    </p>
                  </div>
                  <div>
                    <span className='text-gray-500'>Department</span>
                    <p className='font-medium'>Department of BDS</p>
                  </div>
                  <div>
                    <span className='text-gray-500'>Semester / Section</span>
                    <p className='font-medium'>
                      {typeof timetable.semester === 'object' &&
                      timetable.semester &&
                      'semester_name' in timetable.semester
                        ? (timetable.semester as any).semester_name
                        : typeof timetable.semester === 'string'
                        ? timetable.semester
                        : 'Semester CBRI A'}{' '}
                      / Section
                    </p>
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className='space-y-4'>
                <h3 className='font-medium text-gray-900'>Dates</h3>
                <div className='space-y-3 text-sm'>
                  <div>
                    <span className='text-gray-500'>Created</span>
                    <p className='font-medium'>Jun 23, 2025</p>
                  </div>
                  <div>
                    <span className='text-gray-500'>Last Updated</span>
                    <p className='font-medium'>Jun 23, 2025</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Timetable Section */}
        <div className='bg-white rounded-lg shadow-sm border'>
          <div className='p-6'>
            <div className='flex items-center justify-between mb-6'>
              <div>
                <h2 className='text-lg font-semibold text-gray-900'>
                  Timetable
                </h2>
                <p className='text-sm text-gray-500'>
                  Schedule for{' '}
                  {typeof timetable.semester === 'object' &&
                  timetable.semester &&
                  'semester_name' in timetable.semester
                    ? (timetable.semester as any).semester_name
                    : typeof timetable.semester === 'string'
                    ? timetable.semester
                    : 'Semester CBRI A'}{' '}
                  / Section
                </p>
              </div>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setPeriodSelectorOpen(true)}
                >
                  <Settings className='h-4 w-4 mr-2' />
                  Configure Periods
                  <Badge variant='secondary' className='ml-2'>
                    {selectedPeriods.length}
                  </Badge>
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setDayConfigOpen(true)}
                >
                  <Calendar className='h-4 w-4 mr-2' />
                  Configure Days
                  <Badge variant='secondary' className='ml-2'>
                    {selectedDays.length}
                  </Badge>
                </Button>
                <Button
                  variant='default'
                  size='sm'
                  onClick={savePeriodSelections}
                  disabled={savingPeriods}
                  className='bg-green-600 hover:bg-green-700'
                >
                  <Save className='h-4 w-4 mr-2' />
                  Save Configuration
                </Button>
                <Button variant='outline' size='sm' onClick={exportToPDF}>
                  <Download className='h-4 w-4 mr-2' />
                  Export PDF
                </Button>
              </div>
            </div>

            {/* Simple Timetable Grid */}
            <div className='border rounded-lg overflow-hidden'>
              <table className='w-full'>
                <thead className='bg-blue-600 text-white'>
                  <tr>
                    <th className='border border-blue-500 p-3 text-left font-medium'>
                      Period / Day
                    </th>
                    {selectedDays.map((day) => (
                      <th
                        key={day}
                        className='border border-blue-500 p-3 text-center font-medium'
                      >
                        {day.charAt(0) + day.slice(1).toLowerCase()}
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
                      <td className='border border-gray-200 p-3 bg-green-600 text-white'>
                        <div className='font-medium'>{period.period_name}</div>
                        <div className='text-xs text-green-100'>
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
                      </td>
                      {selectedDays.map((day) => {
                        const slot = slots.find(
                          (s) =>
                            s.day_of_week === day && s.period_id === period.id
                        );
                        return (
                          <td
                            key={`${day}-${period.id}`}
                            className='border border-gray-200 p-2 text-center'
                          >
                            {slot ? (
                              <div
                                className='p-2 bg-blue-50 border border-blue-200 rounded cursor-pointer hover:bg-blue-100 transition-colors'
                                onClick={() =>
                                  openSlotDialog(day, period, slot)
                                }
                              >
                                {slot.is_break_slot ? (
                                  <div className='text-orange-600 font-medium'>
                                    {slot.break_description || 'Break'}
                                  </div>
                                ) : slot.is_combined ? (
                                  <div className='text-purple-600 text-xs'>
                                    <div className='font-medium'>
                                      Combined Class
                                    </div>
                                    {slot.sub_slots &&
                                      slot.sub_slots.length > 0 && (
                                        <div className='mt-1'>
                                          {slot.sub_slots.map(
                                            (subSlot, idx) => (
                                              <div
                                                key={idx}
                                                className='text-xs'
                                              >
                                                {subSlot.course?.course_code ||
                                                  'Course'}
                                              </div>
                                            )
                                          )}
                                        </div>
                                      )}
                                  </div>
                                ) : (
                                  <div className='text-blue-600 text-xs'>
                                    <div className='font-medium'>
                                      {slot.course?.course_code || 'Course'}
                                    </div>
                                    {slot.staff_members &&
                                      slot.staff_members.length > 0 && (
                                        <div className='text-gray-600'>
                                          {slot.staff_members[0]?.first_name}{' '}
                                          {slot.staff_members[0]?.last_name}
                                        </div>
                                      )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <Button
                                variant='ghost'
                                size='sm'
                                className='w-full h-16 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                                onClick={() => openSlotDialog(day, period)}
                              >
                                <Plus className='h-4 w-4' />
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

            {/* Add Period Button */}
            {getAvailablePeriods().length > 0 && (
              <div className='mt-4'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setAddPeriodDialogOpen(true)}
                  className='bg-green-600 text-white hover:bg-green-700 border-green-600'
                >
                  <Plus className='h-4 w-4 mr-2' />
                  Add Period
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Keep existing dialogs */}
      <SlotDialog
        isOpen={slotDialogOpen}
        onClose={closeSlotDialog}
        day={selectedDay}
        period={selectedPeriod}
        existingSlot={editingSlot}
        slotType={slotType}
        setSlotType={setSlotType}
        selectedCourse={selectedCourse}
        setSelectedCourse={setSelectedCourse}
        selectedStaff={selectedStaff}
        setSelectedStaff={setSelectedStaff}
        selectedSections={selectedSections}
        setSelectedSections={setSelectedSections}
        isCombinedClass={isCombinedClass}
        setIsCombinedClass={setIsCombinedClass}
        subSlots={subSlots}
        updateSubSlot={updateSubSlot}
        updateSubSlotStaff={updateSubSlotStaff}
        updateSubSlotSections={updateSubSlotSections}
        saving={savingSlot}
        onSave={saveSlot}
        onDelete={deleteSlot}
        courses={courses}
        staff={staff}
        sections={sections}
      />

      {/* Period Selector Dialog */}
      <Dialog open={periodSelectorOpen} onOpenChange={setPeriodSelectorOpen}>
        <DialogContent className='sm:max-w-4xl max-h-[85vh] overflow-hidden border-0 shadow-xl'>
          <DialogHeader className='bg-gradient-to-r from-slate-50 to-blue-50 p-4 rounded-t-lg border-b border-slate-200'>
            <DialogTitle className='text-slate-800 text-lg'>
              Configure Timetable Periods
            </DialogTitle>
            <DialogDescription>
              <span className='text-slate-600'>
                Manage the periods for your timetable. You can add, remove, and
                reorder periods to customize your schedule.
              </span>
            </DialogDescription>
            <div className='mt-2 text-xs bg-white/60 px-2.5 py-1 rounded-md border border-slate-200 inline-flex gap-1.5 items-center'>
              <Badge
                variant='outline'
                className='bg-blue-600 text-white border-0 h-4'
              >
                {selectedPeriods.length}
              </Badge>
              <span className='text-slate-600'>
                of {periods.length} periods selected
              </span>
              {hasUnsavedChanges && (
                <Badge
                  variant='outline'
                  className='bg-amber-100 text-amber-700 border-amber-200 h-4 px-1 animate-pulse'
                >
                  Unsaved
                </Badge>
              )}
            </div>
          </DialogHeader>

          <div className='flex flex-col lg:flex-row gap-4 p-4 max-h-[calc(85vh-140px)] overflow-hidden'>
            {/* Selected Periods Section */}
            <div className='flex-1 min-h-0'>
              <div className='flex items-center justify-between mb-3'>
                <h3 className='text-sm font-medium flex items-center gap-1.5 text-slate-700'>
                  <span className='bg-blue-100 w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-blue-700 font-bold'>
                    1
                  </span>
                  Selected Periods ({selectedPeriods.length})
                </h3>
                <div className='flex gap-1.5'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      setSelectedPeriods(
                        sortPeriodsByName(periods.filter((p) => !p.is_break))
                      );
                      setHasUnsavedChanges(true);
                    }}
                    className='h-6 text-[10px] text-green-600 border-green-200 hover:bg-green-50'
                  >
                    Add All Classes
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      setSelectedPeriods([]);
                      setLockedPeriods([]);
                      setHasUnsavedChanges(true);
                    }}
                    className='h-6 text-[10px] text-red-600 border-red-200 hover:bg-red-50'
                  >
                    Clear All
                  </Button>
                </div>
              </div>

              <div className='h-full overflow-y-auto space-y-1.5 pr-1'>
                <DndContext
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={selectedPeriods.map((p) => p.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {selectedPeriods.map((period, index) => (
                      <SortablePeriodItem
                        key={period.id}
                        period={period}
                        index={index}
                        onRemove={handleRemovePeriod}
                        isLocked={lockedPeriods.includes(period.id)}
                        onToggleLock={toggleLockPeriod}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                {selectedPeriods.length === 0 && (
                  <div className='flex flex-col items-center justify-center p-8 border border-dashed rounded-md bg-slate-50 text-center'>
                    <p className='text-sm text-slate-500 mb-2'>
                      No periods selected
                    </p>
                    <p className='text-xs text-slate-400 mb-3'>
                      Add periods from the available list to build your
                      timetable
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Available Periods Section */}
            <div className='flex-1 min-h-0'>
              <div className='flex items-center justify-between mb-3'>
                <h3 className='text-sm font-medium flex items-center gap-1.5 text-slate-700'>
                  <span className='bg-green-100 w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-green-700 font-bold'>
                    2
                  </span>
                  Available Periods ({getAvailablePeriods().length})
                </h3>
              </div>

              <div className='h-full overflow-y-auto pr-1'>
                <div className='grid grid-cols-1 gap-1.5'>
                  {getAvailablePeriods().map((period) => (
                    <div
                      key={period.id}
                      className='flex items-center gap-2 border p-2 rounded-md bg-slate-50 hover:bg-blue-50/50 transition-colors'
                    >
                      <div className='flex-1'>
                        <p className='font-medium text-xs text-slate-700'>
                          {period.period_name}
                        </p>
                        <p className='text-[10px] text-slate-500'>
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
                          {period.is_break && ' (Break)'}
                        </p>
                      </div>
                      <Button
                        variant='outline'
                        size='sm'
                        className='h-6 min-w-[50px] text-[10px] gap-1 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300'
                        onClick={() => {
                          setSelectedPeriods((prev) =>
                            sortPeriodsByName([...prev, period])
                          );
                          setHasUnsavedChanges(true);
                        }}
                        title='Add period to timetable'
                      >
                        <Plus className='h-3 w-3' />
                        Add
                      </Button>
                    </div>
                  ))}

                  {getAvailablePeriods().length === 0 && (
                    <div className='flex flex-col items-center justify-center p-4 border border-dashed rounded-md bg-slate-50 text-center'>
                      <p className='text-xs text-slate-500'>
                        All periods are already selected
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className='p-3 border-t border-slate-200 bg-slate-50 gap-2'>
            <Button
              variant='outline'
              onClick={() => setPeriodSelectorOpen(false)}
              className='h-8 text-xs text-slate-700 border-slate-300'
              disabled={savingPeriods}
            >
              Cancel
            </Button>
            <Button
              variant='default'
              onClick={async () => {
                await savePeriodSelections();
                setPeriodSelectorOpen(false);
              }}
              className={cn(
                'h-8 text-xs bg-blue-600 hover:bg-blue-700',
                hasUnsavedChanges &&
                  'animate-pulse bg-amber-600 hover:bg-amber-700'
              )}
              disabled={savingPeriods || selectedPeriods.length === 0}
            >
              {savingPeriods
                ? 'Saving...'
                : hasUnsavedChanges
                ? 'Save Changes'
                : 'Save Periods'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Period Dialog */}
      <Dialog open={addPeriodDialogOpen} onOpenChange={setAddPeriodDialogOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Add Period to Timetable</DialogTitle>
            <DialogDescription>
              Select a period to add to your timetable. You can add one period
              at a time.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-4 max-h-[60vh] overflow-y-auto'>
            {getAvailablePeriods().length > 0 ? (
              <div className='space-y-2'>
                {getAvailablePeriods().map((period) => (
                  <div
                    key={period.id}
                    className='flex items-center justify-between p-3 border rounded-md hover:bg-slate-50 transition-colors cursor-pointer'
                    onClick={() => {
                      addPeriod(period);
                      setAddPeriodDialogOpen(false);
                      toast({
                        title: 'Period Added',
                        description: `${period.period_name} has been added to your timetable.`
                      });
                    }}
                  >
                    <div className='flex-1'>
                      <div className='flex items-center gap-2'>
                        <h4 className='font-medium text-sm'>
                          {period.period_name}
                        </h4>
                        {period.is_break && (
                          <Badge
                            variant='outline'
                            className='h-4 px-1 text-[10px] bg-amber-50 text-amber-600 border-amber-200'
                          >
                            Break
                          </Badge>
                        )}
                      </div>
                      <p className='text-xs text-slate-500 mt-1'>
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
                      </p>
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-8 w-8 p-0 rounded-full text-green-600 border-green-200 hover:bg-green-50'
                    >
                      <Plus className='h-4 w-4' />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className='text-center py-8'>
                <p className='text-sm text-slate-500 mb-2'>
                  No periods available to add
                </p>
                <p className='text-xs text-slate-400'>
                  All periods have been added to the timetable
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setAddPeriodDialogOpen(false)}
              className='h-9'
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Day Configuration Dialog */}
      <Dialog open={dayConfigOpen} onOpenChange={setDayConfigOpen}>
        <DialogContent className='sm:max-w-[400px] border-0 shadow-lg'>
          <DialogHeader className='bg-gradient-to-r from-slate-50 to-green-50 p-4 rounded-t-lg border-b border-slate-200'>
            <DialogTitle className='text-slate-800 text-lg'>
              Configure Timetable Days
            </DialogTitle>
            <DialogDescription>
              <span className='text-slate-600'>
                Select which days to display in your timetable. You can
                customize the schedule according to your needs.
              </span>
            </DialogDescription>
            <div className='mt-2 text-xs bg-white/60 px-2.5 py-1 rounded-md border border-slate-200 inline-flex gap-1.5 items-center'>
              <Badge
                variant='outline'
                className='bg-green-600 text-white border-0 h-4'
              >
                {selectedDays.length}
              </Badge>
              <span className='text-slate-600'>
                of {ALL_DAYS_OF_WEEK.length} days selected
              </span>
              {hasUnsavedChanges && (
                <Badge
                  variant='outline'
                  className='bg-amber-100 text-amber-700 border-amber-200 h-4 px-1 animate-pulse'
                >
                  Unsaved
                </Badge>
              )}
            </div>
          </DialogHeader>

          <div className='space-y-4 py-4 px-4 max-h-[60vh] overflow-y-auto bg-gradient-to-br from-white to-slate-50'>
            <div className='flex items-center justify-between mb-1'>
              <h3 className='text-xs font-medium flex items-center gap-1.5 text-slate-700'>
                <span className='bg-green-100 h-4 rounded-full flex items-center justify-center text-[10px] text-green-700 font-bold'>
                  1
                </span>
                Working Days
              </h3>
              <div className='flex gap-1.5'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={selectAllDays}
                  className='h-6 text-[10px] text-green-600 border-green-200 hover:bg-green-50'
                >
                  Select All
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={clearAllDays}
                  className='h-6 text-[10px] text-red-600 border-red-200 hover:bg-red-50'
                >
                  Clear All
                </Button>
              </div>
            </div>

            <div className='grid grid-cols-1 gap-2 p-2 rounded-md border border-slate-200 bg-white shadow-sm'>
              {ALL_DAYS_OF_WEEK.map((day) => (
                <div
                  key={day}
                  className={`flex items-center gap-3 p-3 rounded-md border transition-colors cursor-pointer ${
                    selectedDays.includes(day)
                      ? 'bg-green-50 border-green-200 hover:bg-green-100'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                  onClick={() => handleDayToggle(day)}
                >
                  <Checkbox
                    checked={selectedDays.includes(day)}
                    onChange={() => handleDayToggle(day)}
                    className={
                      selectedDays.includes(day)
                        ? 'data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600'
                        : ''
                    }
                  />
                  <div className='flex-1'>
                    <div className='flex items-center gap-2'>
                      <span className='font-medium text-sm text-slate-700'>
                        {day.charAt(0) + day.slice(1).toLowerCase()}
                      </span>
                      {selectedDays.includes(day) && (
                        <Badge
                          variant='outline'
                          className='h-4 px-1 text-[10px] bg-green-100 text-green-700 border-green-200'
                        >
                          Selected
                        </Badge>
                      )}
                    </div>
                    <p className='text-xs text-slate-500 mt-0.5'>
                      {day === 'MONDAY' && 'Start of the work week'}
                      {day === 'TUESDAY' && 'Second day of the week'}
                      {day === 'WEDNESDAY' && 'Mid-week day'}
                      {day === 'THURSDAY' && 'Fourth day of the week'}
                      {day === 'FRIDAY' && 'Last working day'}
                      {day === 'SATURDAY' && 'Weekend working day'}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {selectedDays.length === 0 && (
              <div className='text-center py-4 text-amber-600 bg-amber-50 rounded-md border border-amber-200'>
                <p className='text-sm font-medium'>No days selected</p>
                <p className='text-xs mt-1'>
                  Please select at least one day to display in the timetable
                </p>
              </div>
            )}
          </div>

          <DialogFooter className='p-3 border-t border-slate-200 bg-slate-50 gap-2'>
            <Button
              variant='outline'
              onClick={() => setDayConfigOpen(false)}
              className='h-8 text-xs text-slate-700 border-slate-300'
              disabled={savingPeriods}
            >
              Cancel
            </Button>
            <Button
              variant='default'
              onClick={async () => {
                await savePeriodSelections();
                setDayConfigOpen(false);
              }}
              className={cn(
                'h-8 text-xs bg-green-600 hover:bg-green-700',
                hasUnsavedChanges &&
                  'animate-pulse bg-amber-600 hover:bg-amber-700'
              )}
              disabled={savingPeriods || selectedDays.length === 0}
            >
              {savingPeriods
                ? 'Saving...'
                : hasUnsavedChanges
                ? 'Save Changes'
                : 'Save Days'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
