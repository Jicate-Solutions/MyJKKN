'use client';

import React, { useState, useEffect } from 'react';
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
import { AlertCircle, CheckCircle2, Loader2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
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
    section_ids: string[];
  }) => void;
  onConflictCheck?: (params: {
    timetable_id: string;
    period_slot_id: string;
    batch_id: string;
    date: string;
  }) => Promise<PracticalConflictCheck>;
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
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');

  const [conflictCheck, setConflictCheck] = useState<{
    checking: boolean;
    hasConflict: boolean;
    message?: string;
  }>({ checking: false, hasConflict: false });

  // Get selected objects for display
  const selectedBatch = practicalConfig.batches.find((b) => b.batch_id === selectedBatchId);
  const selectedCourse = practicalConfig.available_courses.find(
    (c) => c.course_id === selectedCourseId
  );

  // Check for conflicts when batch is selected
  useEffect(() => {
    const checkConflict = async () => {
      if (!selectedBatchId || !onConflictCheck) {
        setConflictCheck({ checking: false, hasConflict: false });
        return;
      }

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
            : '✓ Available - No attendance marked yet'
        });
      } catch (error) {
        console.error('[academic/attendance] Error checking conflict:', error);
        setConflictCheck({
          checking: false,
          hasConflict: false,
          message: 'Unable to verify availability. Please proceed with caution.'
        });
      }
    };

    checkConflict();
  }, [selectedBatchId, periodId, date, timetableId, onConflictCheck]);

  const handleLoadStudents = () => {
    if (!selectedBatch || !selectedCourse) {
      return;
    }

    onSelectionComplete({
      batch_id: selectedBatch.batch_id,
      batch_name: selectedBatch.batch_name,
      course_id: selectedCourse.course_id,
      course_name: selectedCourse.course_name,
      section_ids: selectedBatch.section_ids || []
    });
  };

  const isSelectionComplete =
    selectedBatchId && selectedCourseId && !conflictCheck.hasConflict;

  return (
    <Card className='border-2 border-blue-200 bg-blue-50/50 dark:bg-blue-900/10'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-blue-900 dark:text-blue-100'>
          🔬 Practical Period - Select Batch & Course
        </CardTitle>
        <CardDescription className='text-blue-700 dark:text-blue-300'>
          Choose which batch and course to mark attendance for.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* Batch Selector */}
        <div className='space-y-2'>
          <Label className='text-sm font-medium'>
            Select Batch <span className='text-red-500'>*</span>
          </Label>
          <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
            <SelectTrigger className={cn(!selectedBatchId && 'border-red-300')}>
              <SelectValue placeholder='Choose batch...' />
            </SelectTrigger>
            <SelectContent>
              {practicalConfig.batches.map((batch) => (
                <SelectItem key={batch.batch_id} value={batch.batch_id}>
                  {batch.batch_name} (~{batch.estimated_count} students)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Conflict Check Status */}
          {selectedBatchId && (
            <div className='mt-2'>
              {conflictCheck.checking ? (
                <Alert className='py-2'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  <AlertDescription className='text-xs'>
                    Checking availability...
                  </AlertDescription>
                </Alert>
              ) : conflictCheck.hasConflict ? (
                <Alert variant='destructive' className='py-2'>
                  <AlertCircle className='h-4 w-4' />
                  <AlertDescription className='text-xs'>{conflictCheck.message}</AlertDescription>
                </Alert>
              ) : conflictCheck.message ? (
                <Alert className='py-2 bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'>
                  <CheckCircle2 className='h-4 w-4' />
                  <AlertDescription className='text-xs'>{conflictCheck.message}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}
        </div>

        {/* Course Selector */}
        <div className='space-y-2'>
          <Label className='text-sm font-medium'>
            Select Course <span className='text-red-500'>*</span>
          </Label>
          <Select
            value={selectedCourseId}
            onValueChange={setSelectedCourseId}
            disabled={!selectedBatchId}
          >
            <SelectTrigger className={cn(!selectedCourseId && 'border-red-300')}>
              <SelectValue placeholder='Choose course...' />
            </SelectTrigger>
            <SelectContent>
              {practicalConfig.available_courses.map((course) => (
                <SelectItem key={course.course_id} value={course.course_id}>
                  {course.course_name}{course.course_code ? ` (${course.course_code})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!selectedBatchId && (
            <p className='text-xs text-muted-foreground'>Select a batch first</p>
          )}
        </div>

        {/* Selection Summary */}
        {selectedBatch && selectedCourse && (
          <Alert className='bg-blue-100 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700'>
            <Users className='h-4 w-4 text-blue-700 dark:text-blue-300' />
            <AlertDescription className='text-xs text-blue-800 dark:text-blue-200'>
              <strong>Ready to load:</strong> {selectedBatch.batch_name} students for{' '}
              {selectedCourse.course_name}
              {selectedBatch.section_ids && selectedBatch.section_ids.length > 0 && (
                <span className='block mt-1'>
                  ({selectedBatch.section_ids.length} section
                  {selectedBatch.section_ids.length !== 1 ? 's' : ''})
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Load Students Button */}
        <Button
          onClick={handleLoadStudents}
          disabled={!isSelectionComplete}
          className='w-full'
          size='lg'
        >
          {isSelectionComplete ? (
            <>
              <CheckCircle2 className='mr-2 h-4 w-4' />
              Load Students & Mark Attendance
            </>
          ) : (
            <>
              <AlertCircle className='mr-2 h-4 w-4' />
              {conflictCheck.hasConflict
                ? 'Cannot Load - Conflict Detected'
                : 'Complete All Selections to Load Students'}
            </>
          )}
        </Button>

        {/* Info */}
        <Alert>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription className='text-xs'>
            <strong>Note:</strong> After loading students, you&apos;ll mark attendance as usual.
            The batch/course selection will be saved with the attendance record.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
