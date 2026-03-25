'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Users,
  BookOpen,
  FlaskConical,
  UserCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { PracticalConfig, PracticalConflictCheck } from '@/types/academics';

interface PracticalAttendanceSelectorProps {
  practicalConfig: PracticalConfig;
  periodId: string;
  date: string;
  timetableId: string;
  onSelectionComplete: (selection: {
    batch_id: string;
    batch_name: string;
    course_id: string;
    course_name: string;
    course_code?: string;
    section_ids: string[];
    staff?: { id: string; first_name: string; last_name: string; email?: string }[];
  }) => void;
  onConflictCheck?: (params: {
    timetable_id: string;
    period_slot_id: string;
    batch_id: string;
    date: string;
  }) => Promise<PracticalConflictCheck>;
}

interface StaffInfo {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
}

export function PracticalAttendanceSelector({
  practicalConfig,
  periodId,
  date,
  timetableId,
  onSelectionComplete,
  onConflictCheck
}: PracticalAttendanceSelectorProps) {
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [conflictCheck, setConflictCheck] = useState<{
    checking: boolean;
    hasConflict: boolean;
    message?: string;
  }>({ checking: false, hasConflict: false });

  // Auto-resolved details from batch selection
  const [resolvedCourse, setResolvedCourse] = useState<{
    course_id: string;
    course_name: string;
    course_code?: string;
  } | null>(null);
  const [resolvedStaff, setResolvedStaff] = useState<StaffInfo[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Get selected batch object
  const selectedBatch = practicalConfig.batches.find((b) => b.batch_id === selectedBatchId);

  // Auto-resolve course and staff when batch is selected
  const resolveBatchDetails = useCallback(async (batchId: string) => {
    const batch = practicalConfig.batches.find((b) => b.batch_id === batchId);
    if (!batch) return;

    setLoadingDetails(true);
    const supabase = createClientSupabaseClient();

    try {
      // Step 1: Resolve course from batch.assigned_courses or fallback to available_courses
      let courseId = batch.assigned_courses?.[0] || '';
      let courseName = '';
      let courseCode = '';

      // Try matching against enriched available_courses first
      if (courseId && practicalConfig.available_courses) {
        const matchedCourse = practicalConfig.available_courses.find(
          (c) => c.course_id === courseId
        );
        if (matchedCourse) {
          courseName = matchedCourse.course_name || '';
          courseCode = matchedCourse.course_code || '';
        }
      }

      // If no assigned_courses on batch, use first available course
      if (!courseId && practicalConfig.available_courses?.length > 0) {
        const firstCourse = practicalConfig.available_courses[0];
        courseId = firstCourse.course_id;
        courseName = firstCourse.course_name || '';
        courseCode = firstCourse.course_code || '';
      }

      // If we still don't have the course name, fetch from DB
      if (courseId && !courseName) {
        try {
          const { data: courseData } = await supabase
            .from('courses')
            .select('id, course_name, course_code')
            .eq('id', courseId)
            .single();
          if (courseData) {
            courseName = courseData.course_name;
            courseCode = courseData.course_code || '';
          }
        } catch (e) {
          logger.warn('academic/attendance/mark', 'Could not fetch course details', { courseId });
        }
      }

      if (courseId) {
        setResolvedCourse({ course_id: courseId, course_name: courseName || courseId, course_code: courseCode });
      }

      // Step 2: Resolve staff from batch.staff_mapping or practicalConfig.staff_mapping
      const staffMapping = batch.staff_mapping || practicalConfig.staff_mapping;
      let staffIds: string[] = [];

      if (staffMapping && courseId && staffMapping[courseId]) {
        staffIds = staffMapping[courseId];
      } else if (staffMapping) {
        // Get all staff IDs from all course mappings
        staffIds = Object.values(staffMapping).flat();
      }

      if (staffIds.length > 0) {
        try {
          const { data: staffData } = await supabase
            .from('staff')
            .select('id, first_name, last_name, email')
            .in('id', staffIds);
          if (staffData) {
            setResolvedStaff(staffData as StaffInfo[]);
          }
        } catch (e) {
          logger.warn('academic/attendance/mark', 'Could not fetch staff details', { staffIds });
        }
      } else {
        setResolvedStaff([]);
      }
    } catch (error) {
      logger.error('academic/attendance/mark', 'Error resolving batch details', error);
    } finally {
      setLoadingDetails(false);
    }
  }, [practicalConfig]);

  // Check for conflicts when batch is selected
  useEffect(() => {
    if (!selectedBatchId) {
      setConflictCheck({ checking: false, hasConflict: false });
      setResolvedCourse(null);
      setResolvedStaff([]);
      return;
    }

    // Resolve batch details
    resolveBatchDetails(selectedBatchId);

    // Check conflict
    if (!onConflictCheck) return;

    const checkConflict = async () => {
      setConflictCheck({ checking: true, hasConflict: false });

      try {
        const result = await onConflictCheck({
          timetable_id: timetableId,
          period_slot_id: periodId,
          batch_id: selectedBatchId,
          date
        });

        setConflictCheck({
          checking: false,
          hasConflict: result.hasConflict,
          message: result.hasConflict
            ? result.message ||
              `This batch already has attendance marked${
                result.existingRecord?.time ? ` at ${result.existingRecord.time}` : ''
              }`
            : undefined
        });
      } catch (error) {
        setConflictCheck({
          checking: false,
          hasConflict: false,
          message: 'Unable to verify availability. Please proceed with caution.'
        });
      }
    };

    checkConflict();
  }, [selectedBatchId, periodId, date, timetableId, onConflictCheck, resolveBatchDetails]);

  const handleLoadStudents = () => {
    if (!selectedBatch || !resolvedCourse) return;

    onSelectionComplete({
      batch_id: selectedBatch.batch_id,
      batch_name: selectedBatch.batch_name,
      course_id: resolvedCourse.course_id,
      course_name: resolvedCourse.course_name,
      course_code: resolvedCourse.course_code,
      section_ids: selectedBatch.section_ids || [],
      staff: resolvedStaff
    });
  };

  const isReady = selectedBatchId && resolvedCourse && !conflictCheck.hasConflict && !loadingDetails;

  return (
    <Card className='border-2 border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10'>
      <CardHeader className='pb-4'>
        <CardTitle className='flex items-center gap-2 text-purple-900 dark:text-purple-100'>
          <FlaskConical className='h-5 w-5' />
          Practical Period - Select Batch
        </CardTitle>
        <CardDescription className='text-purple-700 dark:text-purple-300'>
          Select a batch to view assigned course, staff, and mark attendance.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* Batch Selector */}
        <div className='space-y-2'>
          <Label className='text-sm font-medium'>
            Select Batch <span className='text-red-500'>*</span>
          </Label>
          <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
            <SelectTrigger className={cn(
              'h-11',
              !selectedBatchId && 'border-purple-300 dark:border-purple-700'
            )}>
              <SelectValue placeholder='Choose a batch to mark attendance...' />
            </SelectTrigger>
            <SelectContent>
              {practicalConfig.batches.map((batch) => (
                <SelectItem key={batch.batch_id} value={batch.batch_id}>
                  <div className='flex items-center gap-2'>
                    <Users className='h-4 w-4 text-purple-600' />
                    <span className='font-medium'>{batch.batch_name}</span>
                    <span className='text-muted-foreground text-xs'>
                      (~{batch.estimated_count} students)
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Conflict Check Status */}
        {selectedBatchId && (
          <div>
            {conflictCheck.checking ? (
              <div className='flex items-center gap-2 text-sm text-muted-foreground py-1'>
                <Loader2 className='h-4 w-4 animate-spin' />
                Checking availability...
              </div>
            ) : conflictCheck.hasConflict ? (
              <Alert variant='destructive' className='py-2'>
                <AlertCircle className='h-4 w-4' />
                <AlertDescription className='text-xs'>{conflictCheck.message}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}

        {/* Batch Details - shown after selection */}
        {selectedBatch && !conflictCheck.hasConflict && (
          <>
            <Separator />

            {loadingDetails ? (
              <div className='flex items-center justify-center gap-2 py-6 text-muted-foreground'>
                <Loader2 className='h-5 w-5 animate-spin' />
                <span className='text-sm'>Loading batch details...</span>
              </div>
            ) : (
              <div className='space-y-3'>
                {/* Batch Info Header */}
                <div className='flex items-center gap-2'>
                  <Badge variant='outline' className='bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700'>
                    {selectedBatch.batch_name}
                  </Badge>
                  <span className='text-xs text-muted-foreground'>
                    ~{selectedBatch.estimated_count} students
                    {selectedBatch.section_ids && selectedBatch.section_ids.length > 0 && (
                      <> &middot; {selectedBatch.section_ids.length} section{selectedBatch.section_ids.length !== 1 ? 's' : ''}</>
                    )}
                  </span>
                </div>

                {/* Course Details */}
                {resolvedCourse && (
                  <div className='bg-white dark:bg-gray-800 rounded-lg border p-3 space-y-2'>
                    <div className='flex items-center gap-2'>
                      <BookOpen className='h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0' />
                      <span className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>Course</span>
                    </div>
                    <div className='pl-6'>
                      <p className='font-semibold text-sm'>
                        {resolvedCourse.course_code && (
                          <span className='text-blue-600 dark:text-blue-400'>{resolvedCourse.course_code} - </span>
                        )}
                        {resolvedCourse.course_name}
                      </p>
                    </div>
                  </div>
                )}

                {/* Staff Details */}
                {resolvedStaff.length > 0 && (
                  <div className='bg-white dark:bg-gray-800 rounded-lg border p-3 space-y-2'>
                    <div className='flex items-center gap-2'>
                      <UserCheck className='h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0' />
                      <span className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                        Assigned Faculty ({resolvedStaff.length})
                      </span>
                    </div>
                    <div className='pl-6 flex flex-wrap gap-2'>
                      {resolvedStaff.map((staff) => (
                        <Badge key={staff.id} variant='secondary' className='text-xs'>
                          {`${staff.first_name} ${staff.last_name}`.trim()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Load Students Button */}
                <Button
                  onClick={handleLoadStudents}
                  disabled={!isReady}
                  className='w-full bg-purple-600 hover:bg-purple-700 text-white'
                  size='lg'
                >
                  {isReady ? (
                    <>
                      <CheckCircle2 className='mr-2 h-4 w-4' />
                      Load Students & Mark Attendance
                    </>
                  ) : (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      Resolving batch details...
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}

        {/* No batch selected hint */}
        {!selectedBatchId && (
          <p className='text-xs text-muted-foreground text-center py-2'>
            Select a batch above to view course, staff details and mark attendance.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
