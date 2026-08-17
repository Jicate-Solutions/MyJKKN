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
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import type {
  PracticalConfig,
  BatchDefinition,
  CourseOption
} from '@/types/academics';
import { useBatchLearners } from '@/hooks/use-batch-learners';

interface PracticalPeriodConfigFormProps {
  value?: PracticalConfig;
  onChange: (config: PracticalConfig) => void;
  semesterId: string;
  sections: Array<{ id: string; section_name: string }>;
  courses: Array<{ id: string; course_name: string; course_code: string }>;
  availableStaff?: Array<{ id: string; first_name: string; last_name: string; staff_id: string }>;
  /**
   * Added: 2026-08-17 (BUG-005826) — scope for the manual learner picker. A
   * manual batch is used when the split is per learner inside one section
   * (allied / generic elective), so the candidates are the whole
   * programme+semester cohort, not one section's.
   */
  programId?: string;
}

export function PracticalPeriodConfigForm({
  value,
  onChange,
  semesterId,
  sections,
  courses,
  availableStaff,
  programId
}: PracticalPeriodConfigFormProps) {
  const adapt = useAdaptiveLabels();
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

  // Manual learner assignment (Added: 2026-08-17, BUG-005826)
  const [learnerSearch, setLearnerSearch] = useState<Record<string, string>>({});

  // Fetch only once a batch actually asks for manual assignment. Most practical
  // periods are section-assigned and must not pay for this query.
  //
  // The loading lifecycle lives in useBatchLearners rather than here: the first
  // version was an inline effect that guarded on its own state and cancelled on
  // cleanup, which deadlocked on "Loading learners..." under StrictMode. See the
  // hook for the full account.
  const { learners, state: learnersState } = useBatchLearners({
    enabled: batches.some((b) => b.assignment_type === 'manual'),
    programId,
    semesterId
  });

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

  // NEW: Batch-specific course/staff management (Updated: 2025-11-07)
  const toggleCourseForBatch = (batchId: string, courseId: string) => {
    updateBatch(batchId, {
      assigned_courses: batches
        .find((b) => b.batch_id === batchId)
        ?.assigned_courses?.includes(courseId)
        ? batches
            .find((b) => b.batch_id === batchId)
            ?.assigned_courses?.filter((id) => id !== courseId)
        : [
            ...(batches.find((b) => b.batch_id === batchId)?.assigned_courses || []),
            courseId
          ]
    });
  };

  const toggleStaffForBatchCourse = (batchId: string, courseId: string, staffId: string) => {
    const batch = batches.find((b) => b.batch_id === batchId);
    if (!batch) return;

    const batchStaffMapping = batch.staff_mapping || {};
    const currentStaff = batchStaffMapping[courseId] || [];
    const newStaff = currentStaff.includes(staffId)
      ? currentStaff.filter((id) => id !== staffId)
      : [...currentStaff, staffId];

    updateBatch(batchId, {
      staff_mapping: {
        ...batchStaffMapping,
        [courseId]: newStaff
      }
    });
  };

  // Added: 2026-08-17 (BUG-005826)
  const toggleLearnerForBatch = (batchId: string, learnerId: string) => {
    const current = batches.find((b) => b.batch_id === batchId)?.student_ids || [];
    const next = current.includes(learnerId)
      ? current.filter((id) => id !== learnerId)
      : [...current, learnerId];

    updateBatch(batchId, {
      student_ids: next,
      // Keep the count honest. It is the number the faculty compares the marking
      // screen against, and a stale estimate is how a 9-learner lab showing 19
      // names went unquestioned for a fortnight.
      estimated_count: next.length
    });
  };

  const setLearnersForBatch = (batchId: string, learnerIds: string[]) => {
    updateBatch(batchId, {
      student_ids: learnerIds,
      estimated_count: learnerIds.length
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
                          section_ids: val === 'manual' ? [] : batch.section_ids,
                          // Updated: 2026-08-17 - drop the learner list when the
                          // batch goes back to whole sections, so a stale
                          // hand-picked list cannot keep narrowing a roster the
                          // sections are now meant to define.
                          student_ids: val === 'manual' ? batch.student_ids : []
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
                        {/* Updated: 2026-08-17 (BUG-005826) - the old wording
                            promised a manual picker on the marking screen that
                            never existed. The learners are chosen here, now that
                            there is a field to keep them in. */}
                        <SelectItem value='manual'>
                          Specific learners (choose below)
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

                  {/* Learner Selection (if assignment_type = 'manual')
                      Added: 2026-08-17 (BUG-005826). Use this when the batch is a
                      SUBSET of one section — allied, generic elective and
                      non-major electives are chosen per learner, so no section
                      can express them and section scope loads the whole class. */}
                  {batch.assignment_type === 'manual' && (
                    <div className='space-y-2'>
                      <div className='flex items-center justify-between gap-2'>
                        <Label className='text-xs'>
                          Learners in this Batch ({batch.student_ids?.length || 0} selected)
                        </Label>
                        {(batch.student_ids?.length || 0) > 0 && (
                          <Button
                            type='button'
                            variant='ghost'
                            size='sm'
                            className='h-6 text-xs'
                            onClick={() => setLearnersForBatch(batch.batch_id, [])}
                          >
                            Clear
                          </Button>
                        )}
                      </div>

                      {/* 'idle' is the tick before the effect runs. Showing
                          nothing there makes the panel flicker empty, which
                          reads as "no learners" rather than "not yet". */}
                      {(learnersState === 'loading' || learnersState === 'idle') && (
                        <p className='text-xs text-muted-foreground py-2'>
                          Loading learners...
                        </p>
                      )}

                      {learnersState === 'error' && (
                        <p className='text-xs text-red-600 py-2'>
                          Could not load learners. Close and reopen this slot to retry.
                        </p>
                      )}

                      {learnersState === 'loaded' && learners.length === 0 && (
                        <p className='text-xs text-amber-600 py-2'>
                          ⚠️ No active learners found for this programme and semester.
                        </p>
                      )}

                      {learnersState === 'loaded' && learners.length > 0 && (() => {
                        const selected = batch.student_ids || [];
                        // A learner in two batches of the same period would be
                        // marked twice for the same hour. Show it rather than
                        // block it — a period can legitimately be re-authored.
                        const takenElsewhere = new Set(
                          batches
                            .filter((b) => b.batch_id !== batch.batch_id)
                            .flatMap((b) => b.student_ids || [])
                        );
                        const term = (learnerSearch[batch.batch_id] || '').toLowerCase();
                        const visible = term
                          ? learners.filter(
                              (l) =>
                                l.name.toLowerCase().includes(term) ||
                                l.roll_number.toLowerCase().includes(term)
                            )
                          : learners;

                        return (
                          <>
                            <Input
                              placeholder='Search by name or roll number...'
                              className='h-8 text-xs'
                              value={learnerSearch[batch.batch_id] || ''}
                              onChange={(e) =>
                                setLearnerSearch((prev) => ({
                                  ...prev,
                                  [batch.batch_id]: e.target.value
                                }))
                              }
                            />

                            <div className='border rounded-md p-3 max-h-56 overflow-y-auto space-y-2'>
                              {visible.length === 0 ? (
                                <p className='text-xs text-muted-foreground text-center py-2'>
                                  No learner matches "{learnerSearch[batch.batch_id]}"
                                </p>
                              ) : (
                                visible.map((learner) => {
                                  const isSelected = selected.includes(learner.id);
                                  const clash = !isSelected && takenElsewhere.has(learner.id);

                                  return (
                                    <div
                                      key={learner.id}
                                      className='flex items-center space-x-2'
                                    >
                                      <Checkbox
                                        id={`batch-${batch.batch_id}-learner-${learner.id}`}
                                        checked={isSelected}
                                        onCheckedChange={() =>
                                          toggleLearnerForBatch(batch.batch_id, learner.id)
                                        }
                                      />
                                      <Label
                                        htmlFor={`batch-${batch.batch_id}-learner-${learner.id}`}
                                        className='text-xs font-normal cursor-pointer flex items-center gap-2'
                                      >
                                        {learner.roll_number && (
                                          <span className='text-muted-foreground'>
                                            {learner.roll_number}
                                          </span>
                                        )}
                                        <span>{learner.name}</span>
                                        {clash && (
                                          <Badge
                                            variant='outline'
                                            className='text-[10px] py-0 text-amber-600 border-amber-300'
                                          >
                                            in another batch
                                          </Badge>
                                        )}
                                      </Label>
                                    </div>
                                  );
                                })
                              )}
                            </div>

                            {selected.length === 0 && (
                              <p className='text-xs text-amber-600'>
                                ⚠️ No learners selected. This batch will show the whole
                                class at attendance time.
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Estimated Count
                      Updated: 2026-08-17 - derived, not typed, once the batch
                      names its learners. Two numbers for the same thing is how
                      the count stayed plausible while the roster was wrong. */}
                  <div className='space-y-2'>
                    <Label className='text-xs'>
                      {batch.assignment_type === 'manual'
                        ? 'Learner Count (from selection)'
                        : 'Estimated Learner Count'}
                    </Label>
                    <Input
                      type='number'
                      min='0'
                      placeholder='e.g., 15'
                      disabled={batch.assignment_type === 'manual'}
                      value={batch.estimated_count || ''}
                      onChange={(e) =>
                        updateBatch(batch.batch_id, {
                          estimated_count: parseInt(e.target.value) || 0
                        })
                      }
                    />
                  </div>

                  {/* NEW: Batch-Specific Course Assignment (Updated: 2025-11-07) */}
                  <div className='space-y-2'>
                    <Label className='text-xs'>
                      {adapt('Courses')} for this Batch ({batch.assigned_courses?.length || 0} selected)
                    </Label>
                    <div className='border rounded-md p-3 max-h-32 overflow-y-auto space-y-2 bg-blue-50 dark:bg-blue-900/10'>
                      {courses.length === 0 ? (
                        <p className='text-xs text-muted-foreground text-center py-2'>
                          No {adapt('courses')} available
                        </p>
                      ) : (
                        courses.map((course) => (
                          <div
                            key={course.id}
                            className='flex items-center space-x-2'
                          >
                            <Checkbox
                              id={`batch-${batch.batch_id}-course-${course.id}`}
                              checked={batch.assigned_courses?.includes(course.id) || false}
                              onCheckedChange={() =>
                                toggleCourseForBatch(batch.batch_id, course.id)
                              }
                            />
                            <Label
                              htmlFor={`batch-${batch.batch_id}-course-${course.id}`}
                              className='text-xs font-normal cursor-pointer'
                            >
                              {course.course_name} ({course.course_code})
                            </Label>
                          </div>
                        ))
                      )}
                    </div>
                    {(!batch.assigned_courses || batch.assigned_courses.length === 0) && (
                      <p className='text-xs text-amber-600'>
                        ⚠️ No {adapt('courses')} assigned to this batch
                      </p>
                    )}
                  </div>

                  {/* NEW: Batch-Specific Staff Assignment (Updated: 2025-11-07) */}
                  {batch.assigned_courses && batch.assigned_courses.length > 0 && availableStaff && availableStaff.length > 0 && (
                    <div className='space-y-2'>
                      <Label className='text-xs font-medium'>Staff for this Batch</Label>
                      <div className='space-y-3'>
                        {batch.assigned_courses.map((courseId) => {
                          const course = courses.find((c) => c.id === courseId);
                          if (!course) return null;

                          const batchStaffMapping = batch.staff_mapping || {};
                          const assignedStaff = batchStaffMapping[courseId] || [];

                          return (
                            <div key={courseId} className='border rounded-md p-2 bg-green-50 dark:bg-green-900/10'>
                              <div className='mb-2'>
                                <p className='text-xs font-medium'>
                                  {course.course_name} ({course.course_code})
                                </p>
                                <p className='text-[10px] text-muted-foreground'>
                                  {assignedStaff.length} staff assigned
                                </p>
                              </div>
                              <div className='space-y-1 max-h-24 overflow-y-auto'>
                                {availableStaff.map((staff) => (
                                  <div key={staff.id} className='flex items-center space-x-2'>
                                    <Checkbox
                                      id={`batch-${batch.batch_id}-course-${courseId}-staff-${staff.id}`}
                                      checked={assignedStaff.includes(staff.id)}
                                      onCheckedChange={() =>
                                        toggleStaffForBatchCourse(
                                          batch.batch_id,
                                          courseId,
                                          staff.id
                                        )
                                      }
                                    />
                                    <Label
                                      htmlFor={`batch-${batch.batch_id}-course-${courseId}-staff-${staff.id}`}
                                      className='text-[11px] font-normal cursor-pointer'
                                    >
                                      {staff.first_name} {staff.last_name} ({staff.staff_id})
                                    </Label>
                                  </div>
                                ))}
                              </div>
                              {assignedStaff.length === 0 && (
                                <p className='text-[10px] text-amber-600 mt-1'>
                                  ⚠️ No staff assigned
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
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

      {/* REMOVED: Deprecated global course and staff sections */}
      {/* Now using batch-specific course and staff assignment (see above) */}

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

      {/* Summary - Updated: 2025-11-07 - Show batch-specific stats */}
      <Card className='bg-blue-50 dark:bg-blue-900/20 border-blue-200'>
        <CardContent className='pt-4 pb-4 space-y-2'>
          <p className='text-xs text-blue-700 dark:text-blue-300'>
            <strong>ℹ️ Summary:</strong> You have configured {batches.length} batch
            {batches.length !== 1 ? 'es' : ''} with individual course and staff assignments.
          </p>
          <div className='space-y-1'>
            {batches.map((batch, index) => {
              const coursesCount = batch.assigned_courses?.length || 0;
              const staffCount = Object.values(batch.staff_mapping || {}).reduce(
                (total, staffIds) => total + staffIds.length,
                0
              );
              return (
                <div key={batch.batch_id} className='text-xs text-blue-600 dark:text-blue-400 pl-4'>
                  <strong>{batch.batch_name}:</strong> {coursesCount} {adapt('course')}{coursesCount !== 1 ? 's' : ''}, {staffCount} staff assignment{staffCount !== 1 ? 's' : ''}
                </div>
              );
            })}
          </div>
          <p className='text-xs text-blue-700 dark:text-blue-300 pt-2'>
            Faculty will select which batch and course when marking attendance.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
