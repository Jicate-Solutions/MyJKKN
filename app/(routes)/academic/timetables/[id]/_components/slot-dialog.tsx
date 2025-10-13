'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DayOfWeek, Period, Timetable, SubdivisionType, SubdivisionMode } from '@/types/academics';
import { StaffPlanService } from '@/lib/services/academic/staff-plan-service';
import { format } from 'date-fns';

interface SlotDialogProps {
  isOpen: boolean;
  onClose: () => void;
  timetable: Timetable | null;
  existingSlot?: any;
  onSave: (slotData: any) => void;
  onDelete: () => void;
  courses: any[];
  staff: any[];
  sections: any[];
  filteredSections: any[];
  loadingFilteredSections: boolean;
  isUsingStaffPlanningData?: boolean;
  loadingStaffPlanData?: boolean;
  readOnly?: boolean;
}

export function SlotDialog({
  isOpen,
  onClose,
  timetable,
  existingSlot,
  onSave,
  onDelete,
  courses,
  staff,
  sections,
  filteredSections,
  loadingFilteredSections,
  isUsingStaffPlanningData = false,
  loadingStaffPlanData = false,
  readOnly = false
}: SlotDialogProps) {
  const [slotType, setSlotType] = useState<'regular' | 'break'>('regular');
  const [isBreakSlot, setIsBreakSlot] = useState(false);
  const [breakDescription, setBreakDescription] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [isCombinedClass, setIsCombinedClass] = useState(false);
  const [subSlots, setSubSlots] = useState<any[]>([]);

  // NEW: Section Subdivision state (Updated: 2025-10-11)
  const [isSubdivided, setIsSubdivided] = useState(false);
  const [subdivisionType, setSubdivisionType] = useState<SubdivisionType>('practical');
  const [subdivisionMode, setSubdivisionMode] = useState<SubdivisionMode>('auto');

  const [courseAssignedStaff, setCourseAssignedStaff] = useState<any[]>([]);
  const [loadingCourseStaff, setLoadingCourseStaff] = useState(false);
  const [courseStaffError, setCourseStaffError] = useState<string | null>(null);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [sectionSearchQuery, setSectionSearchQuery] = useState('');

  const isBatchMode = timetable?.timetable_format === 'batch';

  // Populate form when existing slot is provided
  useEffect(() => {
    if (existingSlot) {
      // Updated: 2025-10-13 - Handle subdivided slots with sub_slots
      if (existingSlot.is_subdivided && existingSlot.sub_slots) {
        // Handle subdivided slot (practical/lab groups)
        console.log('[academic/timetables] Loading subdivided slot with sub_slots:', {
          slotId: existingSlot.id,
          subSlotCount: existingSlot.sub_slots.length,
          subdivisionType: existingSlot.subdivision_type,
          subdivisionMode: existingSlot.subdivision_mode,
          subSlots: existingSlot.sub_slots
        });

        setSlotType('regular');
        setIsBreakSlot(false);
        setBreakDescription('');
        setSelectedCourse('');
        setSelectedStaff([]);
        setSelectedSections([]);
        setIsCombinedClass(false);
        setIsSubdivided(true);
        setSubdivisionType(existingSlot.subdivision_type || 'practical');
        setSubdivisionMode(existingSlot.subdivision_mode || 'auto');

        // Populate sub-slots from existing data - map ALL sub_slots, not just 2
        const updatedSubSlots = existingSlot.sub_slots.map((ss: any) => ({
          sub_slot_order: ss.sub_slot_order,
          course_id: ss.course_id || '',
          staff_ids: ss.staff_members?.map((s: any) => s.id) || ss.staff_ids || [],
          section_ids: ss.sections?.map((s: any) => s.id) || ss.section_ids || [],
          student_ids: ss.student_ids || [],
          group_name: ss.group_name || '',
          lab_room: ss.lab_room || '',
          max_capacity: ss.max_capacity,
          is_break_slot: ss.is_break_slot || false,
          break_description: ss.break_description || '',
          // CRITICAL: Keep references to the enriched objects for display
          course: ss.course,
          staff_members: ss.staff_members
        }));

        console.log('[academic/timetables] Updated sub-slots for dialog:', updatedSubSlots);

        setSubSlots(updatedSubSlots);
      } else if (existingSlot.is_combined && existingSlot.sub_slots) {
        // Handle combined slot with sub-slots
        setSlotType('regular');
        setIsBreakSlot(false);
        setBreakDescription('');
        setSelectedCourse('');
        setSelectedStaff([]);
        setSelectedSections([]);
        setIsCombinedClass(true);
        setIsSubdivided(false); // Ensure subdivision is off

        // Populate sub-slots for combined class (only 2 sub-slots)
        const updatedSubSlots = [
          {
            sub_slot_order: 1,
            course_id:
              existingSlot.sub_slots.find((ss: any) => ss.sub_slot_order === 1)
                ?.course_id || '',
            staff_ids:
              existingSlot.sub_slots
                .find((ss: any) => ss.sub_slot_order === 1)
                ?.staff_members?.map((s: any) => s.id) || [],
            section_ids:
              existingSlot.sub_slots
                .find((ss: any) => ss.sub_slot_order === 1)
                ?.sections?.map((s: any) => s.id) || [],
            is_break_slot:
              existingSlot.sub_slots.find((ss: any) => ss.sub_slot_order === 1)
                ?.is_break_slot || false,
            break_description:
              existingSlot.sub_slots.find((ss: any) => ss.sub_slot_order === 1)
                ?.break_description || ''
          },
          {
            sub_slot_order: 2,
            course_id:
              existingSlot.sub_slots.find((ss: any) => ss.sub_slot_order === 2)
                ?.course_id || '',
            staff_ids:
              existingSlot.sub_slots
                .find((ss: any) => ss.sub_slot_order === 2)
                ?.staff_members?.map((s: any) => s.id) || [],
            section_ids:
              existingSlot.sub_slots
                .find((ss: any) => ss.sub_slot_order === 2)
                ?.sections?.map((s: any) => s.id) || [],
            is_break_slot:
              existingSlot.sub_slots.find((ss: any) => ss.sub_slot_order === 2)
                ?.is_break_slot || false,
            break_description:
              existingSlot.sub_slots.find((ss: any) => ss.sub_slot_order === 2)
                ?.break_description || ''
          }
        ];
        setSubSlots(updatedSubSlots);
      } else {
        // Handle regular slot
        setSlotType(existingSlot.is_break_slot ? 'break' : 'regular');
        setIsBreakSlot(existingSlot.is_break_slot || false);
        setBreakDescription(existingSlot.break_description || '');
        setSelectedCourse(existingSlot.course_id || '');
        setIsCombinedClass(false);

        // NEW: Populate subdivision state (Updated: 2025-10-11)
        setIsSubdivided(existingSlot.is_subdivided || false);
        setSubdivisionType(existingSlot.subdivision_type || 'practical');
        setSubdivisionMode(existingSlot.subdivision_mode || 'auto');

        // Handle staff - check both staff_members (populated) and staff_ids (raw IDs)
        if (
          existingSlot.staff_members &&
          existingSlot.staff_members.length > 0
        ) {
          setSelectedStaff(existingSlot.staff_members.map((s: any) => s.id));
        } else if (
          existingSlot.staff_ids &&
          existingSlot.staff_ids.length > 0
        ) {
          setSelectedStaff(existingSlot.staff_ids);
        } else {
          setSelectedStaff([]);
        }

        // Handle sections - check both sections (populated) and section_ids (raw IDs)
        if (existingSlot.sections && existingSlot.sections.length > 0) {
          setSelectedSections(existingSlot.sections.map((s: any) => s.id));
        } else if (
          existingSlot.section_ids &&
          existingSlot.section_ids.length > 0
        ) {
          setSelectedSections(existingSlot.section_ids);
        } else {
          setSelectedSections([]);
        }

        // Reset sub-slots to default for regular slots
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
      // Reset form for new slot
      setSlotType('regular');
      setIsBreakSlot(false);
      setBreakDescription('');
      setSelectedCourse('');
      setSelectedStaff([]);
      setSelectedSections([]);
      setIsCombinedClass(false);
      // NEW: Reset subdivision state (Updated: 2025-10-11)
      setIsSubdivided(false);
      setSubdivisionType('practical');
      setSubdivisionMode('auto');
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
  }, [existingSlot]);

  const handleSave = () => {
    // Updated: 2025-10-09 - Auto-populate section_ids for section-level timetables
    let finalSectionIds = selectedSections;

    // For section-level timetables, auto-assign the timetable's section
    if (timetable?.timetable_type === 'section' && timetable?.section_id) {
      finalSectionIds = [timetable.section_id];
    }

    // Prepare slot data from the dialog's state
    // Updated: 2025-10-13 - Include sub_slots for both combined AND subdivided slots
    const slotData = {
      course_id: selectedCourse || undefined,
      staff_ids: selectedStaff,
      section_ids: finalSectionIds,
      is_break_slot: isBreakSlot,
      break_description: breakDescription,
      is_combined: isCombinedClass,
      // Updated: Include sub_slots for BOTH combined class AND subdivision
      sub_slots: (isCombinedClass || isSubdivided)
        ? subSlots.map((subSlot) => ({
            ...subSlot,
            // Also auto-assign section for sub-slots in section-level timetables
            section_ids:
              timetable?.timetable_type === 'section' && timetable?.section_id
                ? [timetable.section_id]
                : subSlot.section_ids
          }))
        : undefined,
      // NEW: Section Subdivision data (Updated: 2025-10-11)
      is_subdivided: isSubdivided,
      subdivision_type: isSubdivided ? subdivisionType : undefined,
      subdivision_mode: isSubdivided ? subdivisionMode : undefined
    };

    // Pass the slot data to the parent along with the date
    onSave(slotData);
  };

  const fetchCourseAssignedStaff = useCallback(
    async (courseId: string) => {
      try {
        setLoadingCourseStaff(true);
        setCourseStaffError(null);

        const filters = {
          is_active: true,
          ...(timetable?.institution_id && {
            institution_id: timetable.institution_id
          }),
          ...(timetable?.semester_id &&
            typeof timetable.semester_id === 'object' &&
            'id' in timetable.semester_id && {
              semester_id: (timetable.semester_id as { id: string }).id
            }),
          ...(timetable?.department_id && {
            department_id: timetable.department_id
          }),
          ...(timetable?.program_id && { program_id: timetable.program_id })
        };

        const assignedStaff = await StaffPlanService.getStaffAssignedToCourse(
          courseId,
          filters
        );
        setCourseAssignedStaff(assignedStaff);

        if (assignedStaff.length === 0) {
          setCourseStaffError(
            'No staff assigned to this course in staff planning. Please assign staff in Staff Planning module first.'
          );
        }
      } catch (error) {
        console.error('Error fetching course assigned staff:', error);
        setCourseStaffError(
          'Failed to load course-assigned staff. Please check Staff Planning module.'
        );
        setCourseAssignedStaff([]);
      } finally {
        setLoadingCourseStaff(false);
      }
    },
    [timetable]
  );

  // Fetch staff assigned to the selected course
  useEffect(() => {
    if (selectedCourse && !isBreakSlot && isOpen) {
      fetchCourseAssignedStaff(selectedCourse);
    } else {
      setCourseAssignedStaff([]);
      setCourseStaffError(null);
    }
  }, [selectedCourse, isBreakSlot, isOpen, fetchCourseAssignedStaff]);

  // Get the staff list to display (only course-assigned staff from staff planning)
  const getDisplayStaff = () => {
    if (isBreakSlot) {
      return staff || []; // For break slots, show all staff
    }
    if (!selectedCourse) {
      return []; // No course selected, show no staff
    }
    // ALWAYS show only staff from staff planning - no option to show all staff
    return courseAssignedStaff; // Only show staff from staff planning
  };

  const displayStaff = getDisplayStaff();

  // For batch mode, check if we should force mount the dialog
  useEffect(() => {
    if (isOpen && isBatchMode) {
      // Force a re-render after mount
      const timer = setTimeout(() => {
        // Re-render triggered
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isBatchMode]);

  // Early return after all hooks
  if (!isOpen || (isBatchMode && timetable?.timetable_format !== 'batch'))
    return null;

  // Add try-catch to handle any rendering errors
  try {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className='max-w-4xl max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              {readOnly
                ? 'View'
                : timetable?.timetable_format === 'batch'
                ? 'Edit'
                : 'Create'}{' '}
              Slot
              {readOnly && (
                <Badge variant='secondary' className='text-xs'>
                  Read Only
                </Badge>
              )}
              {timetable?.timetable_format === 'batch' && (
                <Badge variant='outline' className='text-xs'>
                  Date Range
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {readOnly ? (
                <>
                  Viewing slot details in read-only mode. You can only view the
                  information.
                </>
              ) : (
                <>
                  {timetable?.timetable_format === 'batch'
                    ? 'Edit the'
                    : 'Create a new'}{' '}
                  slot for{' '}
                  <span className='font-semibold'>
                    {timetable?.timetable_format === 'batch'
                      ? 'all dates in the selected range'
                      : 'the selected day'}
                  </span>{' '}
                  during{' '}
                  <span className='font-semibold'>
                    {/* {timetable?.period_name} */}
                  </span>
                  .
                  {timetable?.timetable_format === 'batch' && (
                    <span className='block mt-1 text-xs text-amber-600'>
                      Note: This configuration will apply to ALL dates in your
                      selected range.
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-6'>
            {/* Removed individual date picker for batch mode - slots apply to entire date range */}

            {/* Slot Type Selection */}
            <div className='space-y-3'>
              <Label className='text-sm font-medium'>Slot Type</Label>
              <RadioGroup
                value={slotType}
                onValueChange={(value: 'regular' | 'break') => {
                  if (!readOnly) {
                    setSlotType(value);
                    setIsBreakSlot(value === 'break');
                  }
                }}
                className='flex gap-6'
                disabled={readOnly}
              >
                <div className='flex items-center space-x-2'>
                  <RadioGroupItem
                    value='regular'
                    id='regularSlot'
                    disabled={readOnly}
                  />
                  <Label htmlFor='regularSlot'>Regular Class</Label>
                </div>
                <div className='flex items-center space-x-2'>
                  <RadioGroupItem
                    value='break'
                    id='breakSlot'
                    disabled={readOnly}
                  />
                  <Label htmlFor='breakSlot'>Break</Label>
                </div>
              </RadioGroup>
            </div>

            {!isBreakSlot && (
              <div className='space-y-3'>
                <div className='flex items-center space-x-2'>
                  <Checkbox
                    id='combinedClass'
                    checked={isCombinedClass}
                    onCheckedChange={(checked) => {
                      if (!readOnly) {
                        setIsCombinedClass(checked === true);
                        // Disable subdivision when combined class is enabled
                        if (checked) {
                          setIsSubdivided(false);
                        }
                      }
                    }}
                    disabled={readOnly}
                  />
                  <Label htmlFor='combinedClass'>Combined Class</Label>
                  <Badge variant='secondary' className='text-xs ml-2'>
                    Split period into 2 sub-slots
                  </Badge>
                </div>

                {/* NEW: Section Subdivision checkbox (Updated: 2025-10-11) */}
                {timetable?.timetable_type === 'section' && (
                  <div className='flex items-center space-x-2 pt-2'>
                    <Checkbox
                      id='sectionSubdivision'
                      checked={isSubdivided}
                      onCheckedChange={(checked) => {
                        if (!readOnly) {
                          setIsSubdivided(checked === true);
                          // Disable combined class when subdivision is enabled
                          if (checked) {
                            setIsCombinedClass(false);
                          }
                        }
                      }}
                      disabled={readOnly || isCombinedClass}
                    />
                    <Label htmlFor='sectionSubdivision'>Section Subdivision</Label>
                    <Badge variant='secondary' className='text-xs ml-2 bg-purple-100 text-purple-800 border-purple-300'>
                      Split students into groups
                    </Badge>
                  </div>
                )}

                {/* Subdivision Type & Mode Selection */}
                {isSubdivided && timetable?.timetable_type === 'section' && (
                  <div className='border rounded-lg p-4 space-y-4 bg-purple-50/50 dark:bg-purple-900/10'>
                    <div className='space-y-2'>
                      <Label className='text-sm font-medium'>Subdivision Type</Label>
                      <Select
                        value={subdivisionType}
                        onValueChange={(value) => setSubdivisionType(value as SubdivisionType)}
                        disabled={readOnly || existingSlot}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='practical'>Practical</SelectItem>
                          <SelectItem value='lab'>Lab</SelectItem>
                          <SelectItem value='tutorial'>Tutorial</SelectItem>
                          <SelectItem value='workshop'>Workshop</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className='space-y-2'>
                      <Label className='text-sm font-medium'>Student Assignment</Label>
                      <RadioGroup
                        value={subdivisionMode}
                        onValueChange={(value) => setSubdivisionMode(value as SubdivisionMode)}
                        className='flex gap-4'
                        disabled={readOnly || existingSlot}
                      >
                        <div className='flex items-center space-x-2'>
                          <RadioGroupItem value='auto' id='autoAssignment' disabled={readOnly || existingSlot} />
                          <Label htmlFor='autoAssignment' className='text-sm'>
                            Auto-distribute evenly
                          </Label>
                        </div>
                        <div className='flex items-center space-x-2'>
                          <RadioGroupItem value='manual' id='manualAssignment' disabled={readOnly || existingSlot} />
                          <Label htmlFor='manualAssignment' className='text-sm'>
                            Manual assignment
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {/* Updated: 2025-10-13 - Show existing subdivision configuration */}
                    {existingSlot && existingSlot.sub_slots && existingSlot.sub_slots.length > 0 && (
                      <div className='space-y-3'>
                        <div className='flex items-center justify-between'>
                          <Label className='text-sm font-medium'>Existing Configuration</Label>
                          <Badge variant='secondary' className='text-xs bg-purple-100 text-purple-800 border-purple-300'>
                            {existingSlot.sub_slots.length} Groups Configured
                          </Badge>
                        </div>
                        <div className='space-y-2 max-h-48 overflow-y-auto'>
                          {existingSlot.sub_slots.map((subSlot: any, index: number) => (
                            <div key={index} className='border rounded p-2 bg-white dark:bg-slate-800 text-xs space-y-1'>
                              <div className='flex items-center justify-between'>
                                <span className='font-semibold text-purple-700 dark:text-purple-300'>
                                  Group {subSlot.sub_slot_order}: {subSlot.group_name || `Group ${String.fromCharCode(64 + subSlot.sub_slot_order)}`}
                                </span>
                                {subSlot.max_capacity && (
                                  <Badge variant='outline' className='text-xs'>
                                    Max: {subSlot.max_capacity}
                                  </Badge>
                                )}
                              </div>
                              {subSlot.course && (
                                <div className='text-blue-700 dark:text-blue-300'>
                                  <strong>Course:</strong> {subSlot.course.course_name} ({subSlot.course.course_code})
                                </div>
                              )}
                              {subSlot.staff_members && subSlot.staff_members.length > 0 && (
                                <div className='text-gray-700 dark:text-gray-300'>
                                  <strong>Staff:</strong> {subSlot.staff_members.map((s: any) => `${s.first_name} ${s.last_name}`).join(', ')}
                                </div>
                              )}
                              {subSlot.student_ids && subSlot.student_ids.length > 0 && (
                                <div className='text-gray-600 dark:text-gray-400'>
                                  <strong>Students:</strong> {subSlot.student_ids.length} assigned
                                </div>
                              )}
                              {subSlot.lab_room && (
                                <div className='text-gray-600 dark:text-gray-400'>
                                  <strong>Lab:</strong> {subSlot.lab_room}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className='flex items-center gap-2 text-xs text-purple-700 dark:text-purple-300'>
                      <Badge variant='outline' className='text-xs'>
                        ℹ️ Info
                      </Badge>
                      <span>
                        {existingSlot ? 'Subdivision is already configured. You can view or update the configuration in the next step.' : 'In the next step, configure each group with course, staff, and students. Each group can have different courses and staff.'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Break Slot Configuration */}
            {isBreakSlot && (
              <div className='space-y-3'>
                <Label htmlFor='breakDescription'>Break Description</Label>
                <Input
                  id='breakDescription'
                  value={breakDescription}
                  onChange={(e) => setBreakDescription(e.target.value)}
                  placeholder='e.g., Lunch Break, Tea Break'
                  className='max-w-md'
                />
              </div>
            )}

            {/* Regular Slot Configuration */}
            {/* Updated: 2025-10-11 - Hide course/staff selection for subdivided slots */}
            {!isBreakSlot && !isCombinedClass && !isSubdivided && (
              <div className='space-y-4 border rounded-lg p-4'>
                <h4 className='font-medium'>Class Configuration</h4>

                {/* Course Selection */}
                <div className='space-y-2'>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <Label>
                        Course <span className='text-red-500'>*</span>
                      </Label>
                      <Badge variant='secondary' className='text-xs'>
                        {courses?.length || 0} available
                      </Badge>
                    </div>
                    <div className='flex items-center gap-2'>
                      {isUsingStaffPlanningData ? (
                        <Badge
                          variant='default'
                          className='text-xs bg-green-100 text-green-800 border-green-300'
                        >
                          From Staff Planning
                        </Badge>
                      ) : (
                        <Badge
                          variant='outline'
                          className='text-xs bg-amber-50 text-amber-700 border-amber-300'
                        >
                          All Courses
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Select
                    value={selectedCourse}
                    onValueChange={readOnly ? undefined : setSelectedCourse}
                    disabled={readOnly}
                  >
                    <SelectTrigger
                      className={
                        !selectedCourse || selectedCourse === 'none'
                          ? 'border-red-300'
                          : ''
                      }
                      disabled={readOnly}
                    >
                      <SelectValue placeholder='Select a course (required)' />
                    </SelectTrigger>
                    <SelectContent>
                      {courses?.length === 0 ? (
                        <div className='p-2 text-center text-sm text-muted-foreground'>
                          {loadingStaffPlanData
                            ? 'Loading courses...'
                            : 'No courses available'}
                        </div>
                      ) : (
                        courses?.map((course: any) => (
                          <SelectItem key={course.id} value={course.id}>
                            {course.course_name} ({course.course_code})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {!isUsingStaffPlanningData && courses?.length > 0 && (
                    <p className='text-xs text-amber-600'>
                      ⚠️ No staff planning found for semester &quot;
                      {timetable?.semesters?.semester_name || timetable?.semester_id}&quot;. Showing all available
                      courses.
                    </p>
                  )}
                  {isUsingStaffPlanningData && (
                    <p className='text-xs text-green-600'>
                      ✓ Showing courses from staff planning for semester &quot;
                      {timetable?.semesters?.semester_name || timetable?.semester_id}&quot;
                    </p>
                  )}
                </div>

                {/* Staff Selection */}
                <div className='space-y-2'>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <Label>
                        Staff <span className='text-red-500'>*</span>
                      </Label>
                      <Badge variant='secondary' className='text-xs'>
                        {displayStaff?.length || 0} available
                      </Badge>
                      <Badge
                        variant='default'
                        className='text-xs bg-green-100 text-green-800 border-green-300'
                      >
                        From Staff Planning Only
                      </Badge>
                    </div>
                  </div>

                  <div
                    className={`border rounded-md p-3 max-h-32 overflow-y-auto ${
                      !selectedStaff ||
                      selectedStaff.length === 0 ||
                      selectedStaff.every((id) => id === 'none')
                        ? 'border-red-300 bg-red-50'
                        : ''
                    }`}
                  >
                    {displayStaff?.map((staffMember: any) => (
                      <div
                        key={staffMember.id}
                        className='flex items-center space-x-2 py-1'
                      >
                        <Checkbox
                          id={`staff-${staffMember.id}`}
                          checked={selectedStaff.includes(staffMember.id)}
                          disabled={readOnly}
                          onCheckedChange={(checked) => {
                            if (!readOnly) {
                              if (checked) {
                                setSelectedStaff([
                                  ...selectedStaff,
                                  staffMember.id
                                ]);
                              } else {
                                setSelectedStaff(
                                  selectedStaff.filter(
                                    (id: string) => id !== staffMember.id
                                  )
                                );
                              }
                            }
                          }}
                        />
                        <Label
                          htmlFor={`staff-${staffMember.id}`}
                          className='text-sm flex items-center gap-2'
                        >
                          {staffMember.first_name} {staffMember.last_name}
                          <Badge
                            variant='outline'
                            className='text-xs bg-green-50 text-green-700 border-green-200'
                          >
                            {staffMember.staff_id}
                          </Badge>
                        </Label>
                      </div>
                    ))}

                    {displayStaff?.length === 0 && (
                      <div className='text-center py-4 text-gray-500 text-sm'>
                        <div className='mb-2'>No staff available</div>
                        <div className='text-xs text-gray-400'>
                          Please assign staff to the selected course first
                        </div>
                      </div>
                    )}
                  </div>
                  {(!selectedStaff ||
                    selectedStaff.length === 0 ||
                    selectedStaff.every((id) => id === 'none')) && (
                    <p className='text-sm text-red-600'>
                      At least one staff member is required
                    </p>
                  )}
                  {displayStaff?.length === 0 && (
                    <p className='text-xs text-red-600'>
                      ❌ No staff assigned to this course in staff planning for
                      semester &quot;
                      {timetable?.semester_id}&quot;. Please assign staff in
                      Staff Planning module first.
                    </p>
                  )}
                  {displayStaff?.length > 0 && (
                    <p className='text-xs text-green-600'>
                      ✓ Showing staff assigned to this course from staff
                      planning for semester &quot;
                      {timetable?.semesters?.semester_name || timetable?.semester_id}&quot;
                    </p>
                  )}
                </div>

                {/* Section Selection - Updated: 2025-10-09 - Hide for section-level timetables */}
                {timetable?.timetable_type === 'semester' ? (
                  // Semester-level timetable: Show multi-section selector
                  <div className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <Label>
                        Sections <span className='text-red-500'>*</span>
                      </Label>
                      <Badge variant='secondary' className='text-xs'>
                        Semester ({filteredSections?.length || 0})
                      </Badge>
                    </div>
                    <div
                      className={`border rounded-md p-2 max-h-32 overflow-y-auto ${
                        !selectedSections ||
                        selectedSections.length === 0 ||
                        selectedSections.every((id) => id === 'none')
                          ? 'border-red-300 bg-red-50'
                          : ''
                      }`}
                    >
                      {filteredSections?.map((section: any) => (
                        <div
                          key={section.id}
                          className='flex items-center space-x-2 py-1'
                        >
                          <Checkbox
                            id={`section-${section.id}`}
                            checked={selectedSections.includes(section.id)}
                            disabled={readOnly}
                            onCheckedChange={(checked) => {
                              if (!readOnly) {
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
                              }
                            }}
                          />
                          <Label
                            htmlFor={`section-${section.id}`}
                            className='text-sm flex items-center gap-2'
                          >
                            {section.section_name}
                          </Label>
                        </div>
                      ))}

                      {filteredSections?.length === 0 &&
                        !loadingFilteredSections && (
                          <div className='text-center py-4 text-gray-500 text-sm'>
                            <div className='mb-1'>
                              No sections found for {timetable?.semester_id}
                            </div>
                            <div className='text-xs text-gray-400'>
                              Please create sections for this semester first
                            </div>
                          </div>
                        )}
                    </div>
                    {(!selectedSections ||
                      selectedSections.length === 0 ||
                      selectedSections.every((id) => id === 'none')) && (
                      <p className='text-sm text-red-600'>
                        At least one section is required
                      </p>
                    )}
                  </div>
                ) : (
                  // Section-level timetable: Show info message only
                  <div className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <Label>Section</Label>
                      <Badge
                        variant='secondary'
                        className='text-xs bg-blue-100 text-blue-800 border-blue-300'
                      >
                        Auto-assigned from timetable
                      </Badge>
                    </div>
                    <div className='border rounded-md p-3 bg-blue-50 dark:bg-blue-900/20'>
                      {timetable?.section_id && (
                        <div className='flex items-center space-x-2 py-1'>
                          <Checkbox
                            id={`section-locked-${timetable.section_id}`}
                            checked={true}
                            disabled={true}
                          />
                          <Label
                            htmlFor={`section-locked-${timetable.section_id}`}
                            className='text-sm flex items-center gap-2 text-blue-700 dark:text-blue-300'
                          >
                            {timetable.sections?.section_name ||
                              sections.find(
                                (s: any) => s.id === timetable.section_id
                              )?.section_name ||
                              filteredSections.find(
                                (s: any) => s.id === timetable.section_id
                              )?.section_name ||
                              'Unknown'}
                            <Badge variant='outline' className='text-xs'>
                              Locked
                            </Badge>
                          </Label>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
                            // updateSubSlot(index, {
                            //   is_break_slot: checked === true
                            // });
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
                          onChange={(e) => {
                            // updateSubSlot(index, {
                            //   break_description: e.target.value
                            // })
                          }}
                          placeholder='e.g., Short Break'
                        />
                      </div>
                    ) : (
                      <div className='space-y-4'>
                        {/* Course Selection */}
                        <div className='space-y-2'>
                          <div className='flex items-center gap-2'>
                            <Label>
                              Course <span className='text-red-500'>*</span>
                            </Label>
                            <Badge variant='secondary' className='text-xs'>
                              {courses?.length || 0} available
                            </Badge>
                            {isUsingStaffPlanningData && (
                              <Badge
                                variant='default'
                                className='text-xs bg-green-100 text-green-800 border-green-300'
                              >
                                From Staff Planning
                              </Badge>
                            )}
                          </div>
                          <Select
                            value={subSlot.course_id || ''}
                            onValueChange={(value) => {
                              // updateSubSlot(index, { course_id: value })
                            }}
                          >
                            <SelectTrigger
                              className={
                                !subSlot.course_id ||
                                subSlot.course_id === 'none'
                                  ? 'border-red-300'
                                  : ''
                              }
                            >
                              <SelectValue placeholder='Select a course (required)' />
                            </SelectTrigger>
                            <SelectContent>
                              {courses?.map((course: any) => (
                                <SelectItem key={course.id} value={course.id}>
                                  {course.course_name} ({course.course_code})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {(!subSlot.course_id ||
                            subSlot.course_id === 'none') && (
                            <p className='text-sm text-red-600'>
                              Course is required
                            </p>
                          )}
                        </div>

                        {/* Staff Selection */}
                        <div className='space-y-2'>
                          <div className='flex items-center gap-2'>
                            <Label>
                              Staff <span className='text-red-500'>*</span>
                            </Label>
                            <Badge variant='secondary' className='text-xs'>
                              {displayStaff?.length || 0} available
                            </Badge>
                            <Badge
                              variant='default'
                              className='text-xs bg-green-100 text-green-800 border-green-300'
                            >
                              From Staff Planning Only
                            </Badge>
                          </div>
                          <div
                            className={`border rounded-md p-2 max-h-24 overflow-y-auto ${
                              !subSlot.staff_ids ||
                              subSlot.staff_ids.length === 0 ||
                              subSlot.staff_ids.every(
                                (id: string) => id === 'none'
                              )
                                ? 'border-red-300 bg-red-50'
                                : ''
                            }`}
                          >
                            {displayStaff?.map((staffMember: any) => (
                              <div
                                key={staffMember.id}
                                className='flex items-center space-x-2 py-1'
                              >
                                <Checkbox
                                  id={`subSlotStaff-${index}-${staffMember.id}`}
                                  checked={
                                    subSlot.staff_ids?.includes(
                                      staffMember.id
                                    ) || false
                                  }
                                  onCheckedChange={(checked) => {
                                    // const currentStaff =
                                    //   subSlot.staff_ids || [];
                                    // if (checked) {
                                    //   updateSubSlotStaff(index, [
                                    //     ...currentStaff,
                                    //     staffMember.id
                                    //   ]);
                                    // } else {
                                    //   updateSubSlotStaff(
                                    //     index,
                                    //     currentStaff.filter(
                                    //       (id: string) => id !== staffMember.id
                                    //     )
                                    //   );
                                    // }
                                  }}
                                />
                                <Label
                                  htmlFor={`subSlotStaff-${index}-${staffMember.id}`}
                                  className='text-xs flex items-center gap-1'
                                >
                                  {staffMember.first_name}{' '}
                                  {staffMember.last_name}
                                  <Badge
                                    variant='outline'
                                    className='text-xs bg-green-50 text-green-700 border-green-200'
                                  >
                                    {staffMember.staff_id}
                                  </Badge>
                                </Label>
                              </div>
                            ))}

                            {displayStaff?.length === 0 && (
                              <div className='text-center py-2 text-gray-500 text-xs'>
                                <div className='mb-1'>
                                  No staff assigned to this course
                                </div>
                                <div className='text-xs text-gray-400'>
                                  Please assign staff in Staff Planning module
                                  first
                                </div>
                              </div>
                            )}
                          </div>
                          {(!subSlot.staff_ids ||
                            subSlot.staff_ids.length === 0 ||
                            subSlot.staff_ids.every(
                              (id: string) => id === 'none'
                            )) && (
                            <p className='text-sm text-red-600'>
                              At least one staff member is required
                            </p>
                          )}
                        </div>

                        {/* Section Selection - Updated: 2025-10-09 - Hide for section-level timetables */}
                        {timetable?.timetable_type === 'semester' ? (
                          // Semester-level timetable: Show multi-section selector
                          <div className='space-y-2'>
                            <div className='flex items-center justify-between'>
                              <Label>
                                Sections <span className='text-red-500'>*</span>
                              </Label>
                              <Badge variant='secondary' className='text-xs'>
                                Semester ({filteredSections?.length || 0})
                              </Badge>
                            </div>
                            <div
                              className={`border rounded-md p-2 max-h-24 overflow-y-auto ${
                                !subSlot.section_ids ||
                                subSlot.section_ids.length === 0 ||
                                subSlot.section_ids.every(
                                  (id: string) => id === 'none'
                                )
                                  ? 'border-red-300 bg-red-50'
                                  : ''
                              }`}
                            >
                              {filteredSections?.map((section: any) => (
                                <div
                                  key={section.id}
                                  className='flex items-center space-x-2 py-1'
                                >
                                  <Checkbox
                                    id={`subSlotSection-${index}-${section.id}`}
                                    checked={
                                      subSlot.section_ids?.includes(
                                        section.id
                                      ) || false
                                    }
                                    onCheckedChange={(checked) => {
                                      // const currentSections =
                                      //   subSlot.section_ids || [];
                                      // if (checked) {
                                      //   updateSubSlotSections(index, [
                                      //     ...currentSections,
                                      //     section.id
                                      //   ]);
                                      // } else {
                                      //   updateSubSlotSections(
                                      //     index,
                                      //     currentSections.filter(
                                      //       (id: string) => id !== section.id
                                      //     )
                                      //   );
                                      // }
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

                              {filteredSections?.length === 0 && (
                                <div className='text-center py-2 text-gray-500 text-xs'>
                                  <div className='mb-1'>
                                    No sections available for{' '}
                                    {timetable?.semester_id}
                                  </div>
                                  <div className='text-xs text-gray-400'>
                                    Create sections for this semester first
                                  </div>
                                </div>
                              )}
                            </div>
                            {(!subSlot.section_ids ||
                              subSlot.section_ids.length === 0 ||
                              subSlot.section_ids.every(
                                (id: string) => id === 'none'
                              )) && (
                              <p className='text-sm text-red-600'>
                                At least one section is required
                              </p>
                            )}
                          </div>
                        ) : (
                          // Section-level timetable: Show info message only
                          <div className='space-y-2'>
                            <div className='flex items-center justify-between'>
                              <Label>Section</Label>
                              <Badge
                                variant='secondary'
                                className='text-xs bg-blue-100 text-blue-800 border-blue-300'
                              >
                                Auto-assigned
                              </Badge>
                            </div>
                            <div className='border rounded-md p-2 bg-blue-50 dark:bg-blue-900/20'>
                              <p className='text-xs text-blue-700 dark:text-blue-300'>
                                ℹ️ Section auto-assigned from timetable
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className='flex items-center justify-between'>
            <div>
              {/* Removed existingSlot prop */}
              {/* Removed onDelete prop */}
            </div>
            <div className='flex gap-2'>
              <Button variant='outline' onClick={onClose}>
                {readOnly ? 'Close' : 'Cancel'}
              </Button>
              {!readOnly && (
                <Button onClick={handleSave}>
                  {timetable?.timetable_format === 'batch'
                    ? 'Update Slot'
                    : 'Create Slot'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  } catch (error) {
    console.error('Error rendering SlotDialog:', error);
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
          </DialogHeader>
          <div className='text-red-600'>
            An error occurred while opening the dialog. Please try again.
          </div>
        </DialogContent>
      </Dialog>
    );
  }
}
