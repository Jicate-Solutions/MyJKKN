'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  DayOfWeek,
  Period,
  CreateTimetableSubSlotDto
} from '@/types/academics';
import { StaffPlanService } from '@/lib/services/academic/staff-plan-service';

interface SlotDialogProps {
  isOpen: boolean;
  onClose: () => void;
  day: DayOfWeek | null;
  period: Period | null;
  existingSlot?: any;
  slotType: 'regular' | 'break';
  setSlotType: (type: 'regular' | 'break') => void;
  isBreakSlot: boolean;
  setIsBreakSlot: (isBreak: boolean) => void;
  breakDescription: string;
  setBreakDescription: (desc: string) => void;
  selectedCourse: string;
  setSelectedCourse: (course: string) => void;
  selectedStaff: string[];
  setSelectedStaff: (staff: string[]) => void;
  selectedSections: string[];
  setSelectedSections: (sections: string[]) => void;
  isCombinedClass: boolean;
  setIsCombinedClass: (combined: boolean) => void;
  subSlots: CreateTimetableSubSlotDto[];
  updateSubSlot: (
    index: number,
    updates: Partial<CreateTimetableSubSlotDto>
  ) => void;
  updateSubSlotStaff: (index: number, staffIds: string[]) => void;
  updateSubSlotSections: (index: number, sectionIds: string[]) => void;
  onSave: () => void;
  onDelete: () => void;
  courses: any[];
  staff: any[];
  sections: any[];
  filteredSections: any[];
  loadingFilteredSections: boolean;
  timetable: any;
}

export function SlotDialog({
  isOpen,
  onClose,
  day,
  period,
  existingSlot,
  slotType,
  setSlotType,
  isBreakSlot,
  setIsBreakSlot,
  breakDescription,
  setBreakDescription,
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
  onSave,
  onDelete,
  courses,
  staff,
  sections,
  filteredSections,
  loadingFilteredSections,
  timetable
}: SlotDialogProps) {
  const [courseAssignedStaff, setCourseAssignedStaff] = useState<any[]>([]);
  const [loadingCourseStaff, setLoadingCourseStaff] = useState(false);
  const [showAllStaff, setShowAllStaff] = useState(false);
  const [courseStaffError, setCourseStaffError] = useState<string | null>(null);

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
          ...(timetable?.semester &&
            typeof timetable.semester === 'object' &&
            'id' in timetable.semester && {
              semester_id: timetable.semester.id
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
          setShowAllStaff(true);
          setCourseStaffError(
            'No staff assigned to this course in staff planning. Showing all available staff.'
          );
        } else {
          setShowAllStaff(false);
        }
      } catch (error) {
        console.error('Error fetching course assigned staff:', error);
        setCourseStaffError(
          'Failed to load course-assigned staff. Showing all available staff.'
        );
        setCourseAssignedStaff([]);
        setShowAllStaff(true);
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

  if (!isOpen || !day || !period) return null;

  // Get the staff list to display (either course-assigned or all staff)
  const getDisplayStaff = () => {
    if (isBreakSlot || !selectedCourse || showAllStaff) {
      return staff || [];
    }
    return courseAssignedStaff;
  };

  const displayStaff = getDisplayStaff();

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
            <RadioGroup
              value={slotType}
              onValueChange={(value: 'regular' | 'break') => {
                setSlotType(value);
                setIsBreakSlot(value === 'break');
              }}
              className='flex gap-6'
            >
              <div className='flex items-center space-x-2'>
                <RadioGroupItem value='regular' id='regularSlot' />
                <Label htmlFor='regularSlot'>Regular Class</Label>
              </div>
              <div className='flex items-center space-x-2'>
                <RadioGroupItem value='break' id='breakSlot' />
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
                value={breakDescription}
                onChange={(e) => setBreakDescription(e.target.value)}
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
                <div className='flex items-center justify-between'>
                  <Label>Staff (Multiple selection allowed)</Label>
                  {selectedCourse && !isBreakSlot && (
                    <div className='flex items-center gap-2'>
                      {loadingCourseStaff ? (
                        <Badge variant='secondary' className='text-xs'>
                          Loading...
                        </Badge>
                      ) : courseAssignedStaff.length > 0 ? (
                        <Badge variant='default' className='text-xs'>
                          {showAllStaff
                            ? 'All Staff'
                            : `Course Staff (${courseAssignedStaff.length})`}
                        </Badge>
                      ) : (
                        <Badge variant='secondary' className='text-xs'>
                          All Staff
                        </Badge>
                      )}
                      {courseAssignedStaff.length > 0 && (
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='h-6 px-2 text-xs'
                          onClick={() => setShowAllStaff(!showAllStaff)}
                        >
                          {showAllStaff
                            ? 'Show Course Staff'
                            : 'Show All Staff'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {courseStaffError && (
                  <div className='text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1'>
                    {courseStaffError}
                  </div>
                )}

                <div className='border rounded-md p-2 max-h-32 overflow-y-auto'>
                  {displayStaff?.map((member: any) => (
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
                      <Label
                        htmlFor={`staff-${member.id}`}
                        className='text-sm flex items-center gap-2'
                      >
                        {member.first_name} {member.last_name}
                        {!showAllStaff &&
                          courseAssignedStaff.some(
                            (cs) => cs.id === member.id
                          ) && (
                            <Badge
                              variant='outline'
                              className='text-xs bg-green-50 text-green-700 border-green-200'
                            >
                              Course Assigned
                            </Badge>
                          )}
                        {member.designation && (
                          <span className='text-xs text-gray-500'>
                            ({member.designation})
                          </span>
                        )}
                      </Label>
                    </div>
                  ))}

                  {displayStaff?.length === 0 && !loadingCourseStaff && (
                    <div className='text-center py-4 text-gray-500 text-sm'>
                      {selectedCourse && !showAllStaff
                        ? 'No staff assigned to this course'
                        : 'No staff available'}
                    </div>
                  )}
                </div>
              </div>

              {/* Section Selection */}
              <div className='space-y-2'>
                <div className='flex items-center justify-between'>
                  <Label>Sections (Multiple selection allowed)</Label>
                  <div className='flex items-center gap-2'>
                    {loadingFilteredSections ? (
                      <Badge variant='secondary' className='text-xs'>
                        Loading sections...
                      </Badge>
                    ) : filteredSections?.length > 0 ? (
                      <Badge variant='default' className='text-xs'>
                        {timetable?.semester} Sections (
                        {filteredSections.length})
                      </Badge>
                    ) : (
                      <Badge
                        variant='outline'
                        className='text-xs border-orange-200 text-orange-700'
                      >
                        No {timetable?.semester} sections found
                      </Badge>
                    )}
                  </div>
                </div>

                <div className='border rounded-md p-2 max-h-32 overflow-y-auto'>
                  {filteredSections?.map((section: any) => (
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
                        className='text-sm flex items-center gap-2'
                      >
                        {section.section_name}
                        <Badge
                          variant='outline'
                          className='text-xs bg-blue-50 text-blue-700 border-blue-200'
                        >
                          Semester Section
                        </Badge>
                      </Label>
                    </div>
                  ))}

                  {filteredSections?.length === 0 &&
                    !loadingFilteredSections && (
                      <div className='text-center py-4 text-gray-500 text-sm'>
                        <div className='mb-1'>
                          No sections found for {timetable?.semester}
                        </div>
                        <div className='text-xs text-gray-400'>
                          Please create sections for this semester first
                        </div>
                      </div>
                    )}
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
                          updateSubSlot(index, {
                            is_break_slot: checked === true
                          });
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
                        <div className='flex items-center justify-between'>
                          <Label>Staff</Label>
                          {subSlot.course_id && (
                            <Badge variant='secondary' className='text-xs'>
                              {showAllStaff ? 'All Staff' : 'Course Staff'}
                            </Badge>
                          )}
                        </div>
                        <div className='border rounded-md p-2 max-h-24 overflow-y-auto'>
                          {displayStaff?.map((member: any) => (
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
                                className='text-xs flex items-center gap-1'
                              >
                                {member.first_name} {member.last_name}
                                {!showAllStaff &&
                                  courseAssignedStaff.some(
                                    (cs) => cs.id === member.id
                                  ) && (
                                    <Badge
                                      variant='outline'
                                      className='text-xs bg-green-50 text-green-700 border-green-200'
                                    >
                                      Assigned
                                    </Badge>
                                  )}
                              </Label>
                            </div>
                          ))}

                          {displayStaff?.length === 0 && (
                            <div className='text-center py-2 text-gray-500 text-xs'>
                              No staff available
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Section Selection */}
                      <div className='space-y-2'>
                        <div className='flex items-center justify-between'>
                          <Label>Sections</Label>
                          <Badge variant='secondary' className='text-xs'>
                            Semester ({filteredSections?.length || 0})
                          </Badge>
                        </div>
                        <div className='border rounded-md p-2 max-h-24 overflow-y-auto'>
                          {filteredSections?.map((section: any) => (
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
                                className='text-xs flex items-center gap-1'
                              >
                                {section.section_name}
                                <Badge
                                  variant='outline'
                                  className='text-xs bg-blue-50 text-blue-700 border-blue-200'
                                >
                                  Semester
                                </Badge>
                              </Label>
                            </div>
                          ))}

                          {filteredSections?.length === 0 && (
                            <div className='text-center py-2 text-gray-500 text-xs'>
                              <div className='mb-1'>
                                No sections available for {timetable?.semester}
                              </div>
                              <div className='text-xs text-gray-400'>
                                Create sections for this semester first
                              </div>
                            </div>
                          )}
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
            <Button onClick={onSave}>
              {existingSlot ? 'Update Slot' : 'Create Slot'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
