'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type {
  PracticalConfig,
  BatchDefinition,
  CourseOption
} from '@/types/academics';

interface PracticalPeriodConfigFormProps {
  value?: PracticalConfig;
  onChange: (config: PracticalConfig) => void;
  semesterId: string;
  sections: Array<{ id: string; section_name: string }>;
  courses: Array<{ id: string; course_name: string; course_code: string }>;
  availableStaff?: Array<{ id: string; first_name: string; last_name: string; staff_id: string }>;
}

export function PracticalPeriodConfigForm({
  value,
  onChange,
  semesterId,
  sections,
  courses,
  availableStaff
}: PracticalPeriodConfigFormProps) {
  const [batches, setBatches] = useState<BatchDefinition[]>(
    value?.batches || []
  );
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>(
    value?.available_courses?.map((c) => c.course_id) || []
  );
  const [staffMapping, setStaffMapping] = useState<Record<string, string[]>>(
    value?.staff_mapping || {}
  );
  const [rotationType, setRotationType] = useState<'manual' | 'automatic'>(
    value?.rotation_type || 'manual'
  );

  // Notify parent of changes
  useEffect(() => {
    const config: PracticalConfig = {
      batches,
      available_courses: selectedCourseIds
        .map((id) => {
          const course = courses.find((c) => c.id === id);
          if (!course) return null;
          const courseOption: CourseOption = {
            course_id: course.id,
            course_name: course.course_name
          };
          if (course.course_code) {
            courseOption.course_code = course.course_code;
          }
          return courseOption;
        })
        .filter((c): c is CourseOption => c !== null),
      rotation_type: rotationType,
      staff_mapping: staffMapping
    };
    onChange(config);
  }, [batches, selectedCourseIds, rotationType, staffMapping]);

  const addBatch = () => {
    const newBatch: BatchDefinition = {
      batch_id: `batch_${Date.now()}`,
      batch_name: `Batch ${String.fromCharCode(65 + batches.length)}`, // A, B, C...
      assignment_type: 'section',
      section_ids: [],
      estimated_count: 0
    };
    setBatches([...batches, newBatch]);
  };

  const removeBatch = (batchId: string) => {
    setBatches(batches.filter((b) => b.batch_id !== batchId));
  };

  const updateBatch = (
    batchId: string,
    updates: Partial<BatchDefinition>
  ) => {
    setBatches(
      batches.map((b) => (b.batch_id === batchId ? { ...b, ...updates } : b))
    );
  };

  const toggleCourse = (courseId: string) => {
    setSelectedCourseIds((prev) => {
      const newSelected = prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId];

      // Remove staff mapping if course is deselected
      if (!newSelected.includes(courseId)) {
        setStaffMapping((prevMapping) => {
          const newMapping = { ...prevMapping };
          delete newMapping[courseId];
          return newMapping;
        });
      }

      return newSelected;
    });
  };

  const toggleStaffForCourse = (courseId: string, staffId: string) => {
    setStaffMapping((prev) => {
      const currentStaff = prev[courseId] || [];
      const newStaff = currentStaff.includes(staffId)
        ? currentStaff.filter((id) => id !== staffId)
        : [...currentStaff, staffId];

      return {
        ...prev,
        [courseId]: newStaff
      };
    });
  };

  const toggleSectionForBatch = (batchId: string, sectionId: string) => {
    updateBatch(batchId, {
      section_ids: batches
        .find((b) => b.batch_id === batchId)
        ?.section_ids?.includes(sectionId)
        ? batches
            .find((b) => b.batch_id === batchId)
            ?.section_ids?.filter((id) => id !== sectionId)
        : [
            ...(batches.find((b) => b.batch_id === batchId)?.section_ids || []),
            sectionId
          ]
    });
  };

  return (
    <div className='space-y-6'>
      {/* Info Alert */}
      <Alert>
        <AlertCircle className='h-4 w-4' />
        <AlertDescription>
          <strong>Practical Period Mode:</strong> Configure available batches and courses.
          Faculty will select which batch and course when marking attendance.
        </AlertDescription>
      </Alert>

      {/* Batch Definition Section */}
      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <div>
            <Label className='text-sm font-medium'>Define Available Batches</Label>
            <p className='text-xs text-muted-foreground mt-1'>
              Create batches for practical period attendance
            </p>
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={addBatch}
            className='gap-2'
          >
            <Plus className='h-4 w-4' />
            Add Batch
          </Button>
        </div>

        {batches.length === 0 ? (
          <Card className='border-dashed'>
            <CardContent className='pt-6 pb-6 text-center text-muted-foreground'>
              <p className='text-sm'>No batches configured yet</p>
              <p className='text-xs mt-1'>Click &quot;Add Batch&quot; to create your first batch</p>
            </CardContent>
          </Card>
        ) : (
          <div className='space-y-3'>
            {batches.map((batch, index) => (
              <Card key={batch.batch_id}>
                <CardContent className='pt-4 space-y-3'>
                  <div className='flex items-center justify-between'>
                    <Badge variant='secondary'>Batch {index + 1}</Badge>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => removeBatch(batch.batch_id)}
                      className='h-8 w-8 p-0 text-destructive hover:text-destructive'
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>

                  {/* Batch Name */}
                  <div className='space-y-2'>
                    <Label className='text-xs'>Batch Name</Label>
                    <Input
                      placeholder='e.g., Batch A, Group 1'
                      value={batch.batch_name}
                      onChange={(e) =>
                        updateBatch(batch.batch_id, {
                          batch_name: e.target.value
                        })
                      }
                    />
                  </div>

                  {/* Assignment Type */}
                  <div className='space-y-2'>
                    <Label className='text-xs'>Student Assignment</Label>
                    <Select
                      value={batch.assignment_type}
                      onValueChange={(val: 'section' | 'manual') =>
                        updateBatch(batch.batch_id, {
                          assignment_type: val,
                          section_ids: val === 'manual' ? [] : batch.section_ids
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='section'>
                          Students from specific sections
                        </SelectItem>
                        <SelectItem value='manual'>
                          Manual student selection at attendance
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Section Selection (if assignment_type = 'section') */}
                  {batch.assignment_type === 'section' && (
                    <div className='space-y-2'>
                      <Label className='text-xs'>
                        Sections in this Batch ({batch.section_ids?.length || 0} selected)
                      </Label>
                      <div className='border rounded-md p-3 max-h-32 overflow-y-auto space-y-2'>
                        {sections.length === 0 ? (
                          <p className='text-xs text-muted-foreground text-center py-2'>
                            No sections available for this semester
                          </p>
                        ) : (
                          sections.map((section) => (
                            <div
                              key={section.id}
                              className='flex items-center space-x-2'
                            >
                              <Checkbox
                                id={`batch-${batch.batch_id}-section-${section.id}`}
                                checked={batch.section_ids?.includes(
                                  section.id
                                )}
                                onCheckedChange={() =>
                                  toggleSectionForBatch(
                                    batch.batch_id,
                                    section.id
                                  )
                                }
                              />
                              <Label
                                htmlFor={`batch-${batch.batch_id}-section-${section.id}`}
                                className='text-xs font-normal cursor-pointer'
                              >
                                {section.section_name}
                              </Label>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Warning for no sections selected */}
                      {batch.section_ids?.length === 0 && (
                        <p className='text-xs text-amber-600 mt-2'>
                          ⚠️ This batch has no sections selected. Students will not be loaded at attendance time.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Estimated Count */}
                  <div className='space-y-2'>
                    <Label className='text-xs'>Estimated Student Count</Label>
                    <Input
                      type='number'
                      min='0'
                      placeholder='e.g., 15'
                      value={batch.estimated_count || ''}
                      onChange={(e) =>
                        updateBatch(batch.batch_id, {
                          estimated_count: parseInt(e.target.value) || 0
                        })
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Warning for no batches configured */}
        {batches.length === 0 && (
          <Alert variant='destructive' className='mt-3'>
            <AlertCircle className='h-4 w-4' />
            <AlertDescription className='text-xs'>
              <strong>⚠️ At least one batch must be configured</strong>
              <p className='mt-1'>
                Practical periods require batches to be defined. Click &quot;Add Batch&quot; to create your first batch.
              </p>
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Available Courses Section */}
      <div className='space-y-3'>
        <div>
          <Label className='text-sm font-medium'>Available Courses</Label>
          <p className='text-xs text-muted-foreground mt-1'>
            Select courses that can be taught in this period ({selectedCourseIds.length} selected)
          </p>
        </div>
        <div className='border rounded-md p-3 max-h-40 overflow-y-auto space-y-2'>
          {courses.length === 0 ? (
            <p className='text-xs text-muted-foreground text-center py-4'>
              No courses available
            </p>
          ) : (
            courses.map((course) => (
              <div key={course.id} className='flex items-center space-x-2'>
                <Checkbox
                  id={`course-${course.id}`}
                  checked={selectedCourseIds.includes(course.id)}
                  onCheckedChange={() => toggleCourse(course.id)}
                />
                <Label
                  htmlFor={`course-${course.id}`}
                  className='text-xs font-normal cursor-pointer'
                >
                  {course.course_name} ({course.course_code})
                </Label>
              </div>
            ))
          )}
        </div>
        {selectedCourseIds.length === 0 && (
          <p className='text-xs text-amber-600'>
            ⚠️ At least one course should be selected
          </p>
        )}
      </div>

      {/* Staff Assignment Section */}
      {selectedCourseIds.length > 0 && availableStaff && availableStaff.length > 0 && (
        <div className='space-y-3'>
          <div>
            <Label className='text-sm font-medium'>Assign Staff to Courses</Label>
            <p className='text-xs text-muted-foreground mt-1'>
              Select which staff can teach each course during practical periods
            </p>
          </div>

          <div className='space-y-4'>
            {selectedCourseIds.map((courseId) => {
              const course = courses.find((c) => c.id === courseId);
              if (!course) return null;

              const assignedStaff = staffMapping[courseId] || [];

              return (
                <Card key={courseId} className='border'>
                  <CardContent className='pt-4 pb-4 space-y-3'>
                    <div className='flex items-center justify-between'>
                      <div>
                        <h4 className='text-sm font-medium'>{course.course_name}</h4>
                        <p className='text-xs text-muted-foreground'>
                          {course.course_code} • {assignedStaff.length} staff assigned
                        </p>
                      </div>
                    </div>

                    <div className='border rounded-md p-3 max-h-32 overflow-y-auto space-y-2'>
                      {availableStaff.map((staff) => (
                        <div key={staff.id} className='flex items-center space-x-2'>
                          <Checkbox
                            id={`staff-${courseId}-${staff.id}`}
                            checked={assignedStaff.includes(staff.id)}
                            onCheckedChange={() => toggleStaffForCourse(courseId, staff.id)}
                          />
                          <Label
                            htmlFor={`staff-${courseId}-${staff.id}`}
                            className='text-xs font-normal cursor-pointer'
                          >
                            {staff.first_name} {staff.last_name} ({staff.staff_id})
                          </Label>
                        </div>
                      ))}
                    </div>

                    {assignedStaff.length === 0 && (
                      <p className='text-xs text-amber-600'>
                        ⚠️ No staff assigned to this course
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Rotation Type */}
      <div className='space-y-3'>
        <div>
          <Label className='text-sm font-medium'>Rotation Management</Label>
          <p className='text-xs text-muted-foreground mt-1'>
            How batch-lab assignments are managed
          </p>
        </div>
        <Select
          value={rotationType}
          onValueChange={(val: 'manual' | 'automatic') => setRotationType(val)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='manual'>
              Manual - Faculty selects batch/course at attendance time
            </SelectItem>
            <SelectItem value='automatic'>
              Automatic - System rotates batches automatically (Future)
            </SelectItem>
          </SelectContent>
        </Select>
        {rotationType === 'automatic' && (
          <Alert>
            <AlertCircle className='h-4 w-4' />
            <AlertDescription className='text-xs'>
              Automatic rotation is not yet implemented. System will still require manual selection.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Summary */}
      <Card className='bg-blue-50 dark:bg-blue-900/20 border-blue-200'>
        <CardContent className='pt-4 pb-4'>
          <p className='text-xs text-blue-700 dark:text-blue-300'>
            <strong>ℹ️ Summary:</strong> You have configured {batches.length} batch
            {batches.length !== 1 ? 'es' : ''}, {selectedCourseIds.length} course
            {selectedCourseIds.length !== 1 ? 's' : ''}, and{' '}
            {Object.keys(staffMapping).reduce((total, courseId) => total + staffMapping[courseId].length, 0)}{' '}
            staff assignment{Object.keys(staffMapping).reduce((total, courseId) => total + staffMapping[courseId].length, 0) !== 1 ? 's' : ''}.
            Faculty will select which batch and course when marking attendance.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
