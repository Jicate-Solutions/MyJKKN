'use client';

// Updated: 2025-10-11 - Improved student assignment UX
// Updated: 2025-10-13 - Added course-based staff filtering from staff planning
// Subdivision Group Card - Display and edit individual subdivision group

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Users, User, MapPin, Plus, X } from 'lucide-react';
import { SubdivisionGroup, SubdivisionMode, Timetable } from '@/types/academics';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StaffPlanService } from '@/lib/services/academic/staff-plan-service';

interface SubdivisionGroupCardProps {
  group: SubdivisionGroup;
  allStudents: Array<{ id: string; first_name: string; last_name: string; roll_number: string }>;
  studentsInOtherGroups: string[]; // Updated: 2025-10-11 - Track students assigned to other groups
  availableStaff: Array<{ id: string; first_name: string; last_name: string; staff_id: string }>;
  availableCourses: Array<{ id: string; course_name: string; course_code: string }>;
  onUpdate: (updates: Partial<SubdivisionGroup>) => void;
  subdivisionMode: SubdivisionMode;
  timetable: Timetable | null; // Updated: 2025-10-13 - Added for staff planning context
}

export function SubdivisionGroupCard({
  group,
  allStudents,
  studentsInOtherGroups,
  availableStaff,
  availableCourses,
  onUpdate,
  subdivisionMode,
  timetable
}: SubdivisionGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Updated: 2025-10-13 - Added course-based staff filtering
  const [courseAssignedStaff, setCourseAssignedStaff] = useState<any[]>([]);
  const [loadingCourseStaff, setLoadingCourseStaff] = useState(false);

  // Fetch staff assigned to the selected course from staff planning
  useEffect(() => {
    const fetchCourseStaff = async () => {
      if (!group.course_id || !timetable) {
        setCourseAssignedStaff([]);
        return;
      }

      try {
        setLoadingCourseStaff(true);
        const filters = {
          is_active: true,
          ...(timetable.institution_id && {
            institution_id: timetable.institution_id
          }),
          ...(timetable.semester_id &&
            typeof timetable.semester_id === 'object' &&
            'id' in timetable.semester_id && {
              semester_id: (timetable.semester_id as { id: string }).id
            }),
          ...(timetable.department_id && {
            department_id: timetable.department_id
          }),
          ...(timetable.program_id && { program_id: timetable.program_id })
        };

        const assignedStaff = await StaffPlanService.getStaffAssignedToCourse(
          group.course_id,
          filters
        );
        setCourseAssignedStaff(assignedStaff);
      } catch (error) {
        console.error('[subdivision-group-card] Error fetching course assigned staff:', error);
        setCourseAssignedStaff([]);
      } finally {
        setLoadingCourseStaff(false);
      }
    };

    fetchCourseStaff();
  }, [group.course_id, timetable]);

  // Updated: 2025-10-11 - Better student categorization for UX
  const assignedStudents = allStudents.filter((s) => group.student_ids.includes(s.id));

  // Available students: Not in this group AND not in other groups
  const availableStudents = allStudents.filter(
    (s) => !group.student_ids.includes(s.id) && !studentsInOtherGroups.includes(s.id)
  );

  // Students in other groups (for reference)
  const studentsInOther = allStudents.filter((s) => studentsInOtherGroups.includes(s.id));

  // Updated: 2025-10-13 - Use course-assigned staff or fall back to all staff if no course selected
  const displayStaff = group.course_id ? courseAssignedStaff : [];
  const assignedStaff = displayStaff.filter((s) => group.staff_ids.includes(s.id));

  const handleAddStudent = (studentId: string) => {
    if (subdivisionMode === 'auto') return;
    onUpdate({ student_ids: [...group.student_ids, studentId] });
  };

  const handleRemoveStudent = (studentId: string) => {
    if (subdivisionMode === 'auto') return;
    onUpdate({ student_ids: group.student_ids.filter((id) => id !== studentId) });
  };

  const handleStaffToggle = (staffId: string, isChecked: boolean) => {
    const newStaffIds = isChecked
      ? [...group.staff_ids, staffId]
      : group.staff_ids.filter((id) => id !== staffId);

    onUpdate({ staff_ids: newStaffIds });
  };

  return (
    <Card className='border-l-4 border-l-purple-500'>
      <CardHeader>
        <CardTitle className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <Input
              value={group.group_name}
              onChange={(e) => onUpdate({ group_name: e.target.value })}
              className='font-semibold text-lg w-auto'
            />
          </div>
          <div className='flex items-center gap-2'>
            <Badge
              variant={group.student_ids.length > 0 ? 'default' : 'secondary'}
              className={group.student_ids.length > 0 ? 'bg-green-600' : ''}
            >
              <Users className='w-3 h-3 mr-1' />
              {group.student_ids.length} students
            </Badge>
            <Badge
              variant={group.staff_ids.length > 0 ? 'default' : 'secondary'}
              className='text-xs'
            >
              <User className='w-3 h-3 mr-1' />
              {group.staff_ids.length} staff
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* Course Selection */}
        <div className='space-y-2'>
          <Label className='text-sm font-medium'>
            Course <span className='text-red-500'>*</span>
          </Label>
          <Select
            value={group.course_id || ''}
            onValueChange={(value) => onUpdate({ course_id: value })}
          >
            <SelectTrigger className={!group.course_id ? 'border-red-300' : ''}>
              <SelectValue placeholder='Select a course (required)' />
            </SelectTrigger>
            <SelectContent>
              {availableCourses.length === 0 ? (
                <div className='p-2 text-center text-sm text-muted-foreground'>
                  No courses available
                </div>
              ) : (
                availableCourses.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.course_name} ({course.course_code})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {!group.course_id && (
            <p className='text-xs text-red-600'>
              Course is required for this group
            </p>
          )}
        </div>

        {/* Lab Room & Capacity */}
        <div className='grid grid-cols-2 gap-4'>
          <div className='space-y-2'>
            <Label className='text-xs flex items-center gap-1'>
              <MapPin className='w-3 h-3' />
              Lab/Room (Optional)
            </Label>
            <Input
              value={group.lab_room || ''}
              onChange={(e) => onUpdate({ lab_room: e.target.value })}
              placeholder='e.g., Lab Room 1'
              className='text-sm'
            />
          </div>
          <div className='space-y-2'>
            <Label className='text-xs'>Max Capacity (Optional)</Label>
            <Input
              type='number'
              value={group.max_capacity || ''}
              onChange={(e) =>
                onUpdate({
                  max_capacity: e.target.value ? parseInt(e.target.value) : undefined
                })
              }
              placeholder='e.g., 40'
              className='text-sm'
            />
          </div>
        </div>

        {/* Staff Selection */}
        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <Label className='text-sm font-medium'>
              Assigned Staff <span className='text-red-500'>*</span>
            </Label>
            {group.course_id && (
              <Badge
                variant='default'
                className='text-xs bg-green-100 text-green-800 border-green-300'
              >
                From Staff Planning
              </Badge>
            )}
          </div>
          {group.staff_ids.length === 0 && (
            <div className='text-xs text-red-600 mb-2'>
              ⚠ At least one staff member is required
            </div>
          )}
          <div className='border rounded-md p-3 max-h-32 overflow-y-auto bg-white dark:bg-slate-950'>
            {loadingCourseStaff ? (
              <div className='text-center text-sm text-muted-foreground py-2'>
                Loading staff...
              </div>
            ) : !group.course_id ? (
              <div className='text-center text-sm text-muted-foreground py-2'>
                Please select a course first
              </div>
            ) : displayStaff.length === 0 ? (
              <div className='text-center text-sm text-muted-foreground py-2'>
                <div className='mb-1'>No staff assigned to this course</div>
                <div className='text-xs text-gray-400'>
                  Please assign staff in Staff Planning module first
                </div>
              </div>
            ) : (
              <div className='space-y-2'>
                {displayStaff.map((staffMember) => (
                  <div key={staffMember.id} className='flex items-center space-x-2'>
                    <Checkbox
                      id={`staff-${group.group_order}-${staffMember.id}`}
                      checked={group.staff_ids.includes(staffMember.id)}
                      onCheckedChange={(checked) =>
                        handleStaffToggle(staffMember.id, checked === true)
                      }
                    />
                    <Label
                      htmlFor={`staff-${group.group_order}-${staffMember.id}`}
                      className='text-sm flex items-center gap-2 cursor-pointer'
                    >
                      {staffMember.first_name} {staffMember.last_name}
                      <Badge variant='outline' className='text-xs'>
                        {staffMember.staff_id}
                      </Badge>
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Student Assignment - Updated: 2025-10-11 - Completely redesigned for better UX */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant='outline' size='sm' className='w-full'>
              <span className='flex items-center gap-2'>
                {isExpanded ? <ChevronUp className='w-4 h-4' /> : <ChevronDown className='w-4 h-4' />}
                Student Assignment
                {assignedStudents.length > 0 && (
                  <Badge variant='default' className='ml-auto bg-green-600'>
                    {assignedStudents.length} assigned
                  </Badge>
                )}
                {availableStudents.length > 0 && (
                  <Badge variant='secondary' className='bg-blue-100 text-blue-800'>
                    {availableStudents.length} available
                  </Badge>
                )}
              </span>
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className='mt-4 space-y-3'>
            {subdivisionMode === 'auto' && (
              <div className='bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-md p-3 text-xs text-blue-700 dark:text-blue-300'>
                ℹ️ Students were automatically distributed. Use manual mode to customize assignments.
              </div>
            )}

            {/* Assigned Students Section */}
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <Label className='text-xs font-medium text-green-700 dark:text-green-300'>
                  Assigned to This Group ({assignedStudents.length})
                </Label>
                {subdivisionMode === 'manual' && assignedStudents.length > 0 && (
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => onUpdate({ student_ids: [] })}
                    className='h-6 text-xs text-red-600 hover:text-red-700'
                  >
                    Remove All
                  </Button>
                )}
              </div>

              {assignedStudents.length === 0 ? (
                <div className='border-2 border-dashed rounded-md p-4 text-center text-sm text-muted-foreground'>
                  No students assigned yet
                </div>
              ) : (
                <ScrollArea className='h-40 border rounded-md p-2 bg-green-50/50 dark:bg-green-900/10'>
                  <div className='space-y-1'>
                    {assignedStudents.map((student) => (
                      <div
                        key={student.id}
                        className='flex items-center justify-between py-1 px-2 bg-white dark:bg-slate-900 rounded border group hover:border-green-500'
                      >
                        <div className='flex items-center gap-2 flex-1'>
                          <div className='text-xs font-medium'>
                            {student.first_name} {student.last_name}
                          </div>
                          <Badge variant='outline' className='text-xs'>
                            {student.roll_number}
                          </Badge>
                        </div>
                        {subdivisionMode === 'manual' && (
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => handleRemoveStudent(student.id)}
                            className='h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity'
                          >
                            <X className='w-3 h-3 text-red-600' />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Available Students Section - Only show in manual mode */}
            {subdivisionMode === 'manual' && (
              <div className='space-y-2'>
                <div className='flex items-center justify-between'>
                  <Label className='text-xs font-medium text-blue-700 dark:text-blue-300'>
                    Available Students ({availableStudents.length})
                  </Label>
                  {availableStudents.length > 0 && (
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => {
                        const allAvailableIds = availableStudents.map((s) => s.id);
                        onUpdate({ student_ids: [...group.student_ids, ...allAvailableIds] });
                      }}
                      className='h-6 text-xs text-blue-600 hover:text-blue-700'
                    >
                      Add All Available
                    </Button>
                  )}
                </div>

                {availableStudents.length === 0 ? (
                  <div className='border-2 border-dashed rounded-md p-4 text-center'>
                    <div className='text-sm text-muted-foreground'>
                      {studentsInOther.length > 0
                        ? '✓ All students have been assigned to groups'
                        : '✓ No more students available'
                      }
                    </div>
                  </div>
                ) : (
                  <ScrollArea className='h-40 border rounded-md p-2 bg-blue-50/50 dark:bg-blue-900/10'>
                    <div className='space-y-1'>
                      {availableStudents.map((student) => (
                        <div
                          key={student.id}
                          className='flex items-center justify-between py-1 px-2 bg-white dark:bg-slate-900 rounded border group hover:border-blue-500 cursor-pointer'
                          onClick={() => handleAddStudent(student.id)}
                        >
                          <div className='flex items-center gap-2 flex-1'>
                            <div className='text-xs font-medium'>
                              {student.first_name} {student.last_name}
                            </div>
                            <Badge variant='outline' className='text-xs'>
                              {student.roll_number}
                            </Badge>
                          </div>
                          <Button
                            variant='ghost'
                            size='sm'
                            className='h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity'
                          >
                            <Plus className='w-3 h-3 text-blue-600' />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}

            {/* Summary Stats */}
            <div className='flex items-center gap-4 text-xs pt-2 border-t'>
              <div className='flex items-center gap-1'>
                <Badge variant='default' className='bg-green-600'>
                  {assignedStudents.length}
                </Badge>
                <span className='text-muted-foreground'>in this group</span>
              </div>
              {availableStudents.length > 0 && (
                <div className='flex items-center gap-1'>
                  <Badge variant='secondary' className='bg-blue-100 text-blue-800'>
                    {availableStudents.length}
                  </Badge>
                  <span className='text-muted-foreground'>available</span>
                </div>
              )}
              {studentsInOther.length > 0 && (
                <div className='flex items-center gap-1'>
                  <Badge variant='outline'>
                    {studentsInOther.length}
                  </Badge>
                  <span className='text-muted-foreground'>in other groups</span>
                </div>
              )}
            </div>

            {/* Capacity Warning */}
            {group.max_capacity && group.student_ids.length > group.max_capacity && (
              <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-md p-2 text-xs text-red-700 dark:text-red-300'>
                ⚠ Group exceeds maximum capacity: {group.student_ids.length}/{group.max_capacity}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
