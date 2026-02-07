'use client';

import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Users,
  UserCheck,
  UserX,
  Calendar,
  Clock,
  BookOpen,
  GraduationCap,
  Building2,
  Check,
  X,
  Loader2,
  Sparkles,
  Star
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { LearningBehavior } from '@/types/attendance';
import { LEARNING_BEHAVIOR_LABELS } from '@/types/attendance';

interface AttendanceSummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  loading: boolean;
  students: any[];
  attendanceData: Record<string, 'Present' | 'Absent'>;
  contextData: any;
  courseName?: string;
  periodName?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  existingAttendance?: any;
  // P1.5.4 - Engagement data
  engagementData?: Record<string, { score?: number; behaviors?: LearningBehavior[]; notes?: string }>;
  isEngagementRequired?: boolean;
}

export function AttendanceSummaryModal({
  open,
  onOpenChange,
  onConfirm,
  loading,
  students,
  attendanceData,
  contextData,
  courseName,
  periodName,
  date,
  startTime,
  endTime,
  existingAttendance,
  engagementData,
  isEngagementRequired
}: AttendanceSummaryModalProps) {
  // Calculate stats
  const presentCount = Object.values(attendanceData).filter(
    (status) => status === 'Present'
  ).length;
  const absentCount = Object.values(attendanceData).filter(
    (status) => status === 'Absent'
  ).length;
  const attendancePercentage =
    students.length > 0
      ? Math.round((presentCount / students.length) * 100)
      : 0;

  const presentStudents = students.filter(
    (student) => attendanceData[student.id] === 'Present'
  );
  const absentStudents = students.filter(
    (student) => attendanceData[student.id] === 'Absent'
  );

  // P1.5.4 - Calculate engagement stats
  const engagementScores = engagementData
    ? Object.values(engagementData)
        .map(e => e.score)
        .filter((s): s is number => s !== undefined && s > 0)
    : [];
  const averageEngagement = engagementScores.length > 0
    ? Math.round((engagementScores.reduce((a, b) => a + b, 0) / engagementScores.length) * 10) / 10
    : 0;
  const allBehaviors = engagementData
    ? Object.values(engagementData)
        .flatMap(e => e.behaviors || [])
    : [];
  const behaviorCounts: Record<string, number> = {};
  allBehaviors.forEach(b => {
    behaviorCounts[b] = (behaviorCounts[b] || 0) + 1;
  });
  const hasEngagementData = engagementScores.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-4xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2 text-xl'>
            <GraduationCap className='h-6 w-6 text-blue-600 dark:text-blue-400' />
            {existingAttendance
              ? 'Update Attendance Summary'
              : 'Attendance Summary'}
          </DialogTitle>
          <DialogDescription>
            Please review the attendance details before{' '}
            {existingAttendance ? 'updating' : 'saving'}.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-6'>
          {/* Class Information */}
          <Card className='border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20'>
            <CardContent className='p-4'>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm'>
                <div className='flex items-center gap-2'>
                  <BookOpen className='h-4 w-4 text-blue-600 dark:text-blue-400' />
                  <div>
                    <p className='text-gray-600 dark:text-gray-400'>Course</p>
                    <p className='font-semibold'>
                      {courseName || 'Unknown Course'}
                    </p>
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <Clock className='h-4 w-4 text-green-600 dark:text-green-400' />
                  <div>
                    <p className='text-gray-600 dark:text-gray-400'>Period</p>
                    <p className='font-semibold'>
                      {periodName || 'Unknown Period'}
                    </p>
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <Calendar className='h-4 w-4 text-purple-600 dark:text-purple-400' />
                  <div>
                    <p className='text-gray-600 dark:text-gray-400'>Date</p>
                    <p className='font-semibold'>
                      {date
                        ? format(new Date(date), 'dd MMM yyyy')
                        : 'Unknown Date'}
                    </p>
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <Clock className='h-4 w-4 text-orange-600 dark:text-orange-400' />
                  <div>
                    <p className='text-gray-600 dark:text-gray-400'>Time</p>
                    <p className='font-semibold'>
                      {startTime && endTime
                        ? `${startTime} - ${endTime}`
                        : 'Unknown Time'}
                    </p>
                  </div>
                </div>
                {/* Updated: 2025-10-08 - Support for multi-section display */}
                <div className='flex items-center gap-2'>
                  <Building2 className={contextData?.slot_sections && contextData.slot_sections.length > 1 ? 'h-4 w-4 text-green-600 dark:text-green-400' : 'h-4 w-4 text-indigo-600 dark:text-indigo-400'} />
                  <div>
                    <p className='text-gray-600 dark:text-gray-400'>Section{contextData?.slot_sections && contextData.slot_sections.length > 1 ? 's' : ''}</p>
                    <p className={contextData?.slot_sections && contextData.slot_sections.length > 1 ? 'font-semibold text-green-700 dark:text-green-300' : 'font-semibold'}>
                      {contextData?.slot_sections && contextData.slot_sections.length > 0
                        ? contextData.slot_sections.length === 1
                          ? contextData.slot_sections[0].section_name
                          : `${contextData.slot_sections.length} Sections: ${contextData.slot_sections.map((s: any) => s.section_name).join(', ')}`
                        : contextData?.section_name || 'Unknown Section'
                      }
                    </p>
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <Users className='h-4 w-4 text-gray-600 dark:text-gray-400' />
                  <div>
                    <p className='text-gray-600 dark:text-gray-400'>
                      Total Students
                    </p>
                    <p className='font-semibold'>{students.length}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Attendance Statistics */}
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
            <Card className='border-0 shadow-lg bg-gradient-to-br from-green-500 to-green-600 text-white'>
              <CardContent className='p-4 text-center'>
                <UserCheck className='h-8 w-8 mx-auto mb-2' />
                <div className='text-2xl font-bold'>{presentCount}</div>
                <div className='text-green-100 text-sm'>Present</div>
              </CardContent>
            </Card>

            <Card className='border-0 shadow-lg bg-gradient-to-br from-red-500 to-red-600 text-white'>
              <CardContent className='p-4 text-center'>
                <UserX className='h-8 w-8 mx-auto mb-2' />
                <div className='text-2xl font-bold'>{absentCount}</div>
                <div className='text-red-100 text-sm'>Absent</div>
              </CardContent>
            </Card>

            <Card
              className={cn(
                'border-0 shadow-lg text-white',
                attendancePercentage >= 75
                  ? 'bg-gradient-to-br from-emerald-500 to-emerald-600'
                  : attendancePercentage >= 50
                  ? 'bg-gradient-to-br from-yellow-500 to-orange-500'
                  : 'bg-gradient-to-br from-red-500 to-red-600'
              )}
            >
              <CardContent className='p-4 text-center'>
                <div className='bg-white/20 rounded-full w-8 h-8 flex items-center justify-center mx-auto mb-2'>
                  {attendancePercentage >= 75 && <Check className='h-4 w-4' />}
                </div>
                <div className='text-2xl font-bold'>
                  {attendancePercentage}%
                </div>
                <div className='text-white/80 text-sm'>Attendance Rate</div>
              </CardContent>
            </Card>
          </div>

          {/* P1.5.4 - Engagement Summary */}
          {hasEngagementData && (
            <Card className='border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20'>
              <CardContent className='p-4'>
                <div className='flex items-center gap-2 mb-3'>
                  <Sparkles className='h-5 w-5 text-amber-600 dark:text-amber-400' />
                  <h3 className='font-semibold text-amber-800 dark:text-amber-200'>
                    Engagement Summary
                    {isEngagementRequired && (
                      <span className='ml-2 text-xs font-normal text-amber-600 dark:text-amber-400'>
                        (Required for this period)
                      </span>
                    )}
                  </h3>
                </div>
                <div className='grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3'>
                  <div className='bg-white dark:bg-gray-800 rounded-lg p-3 text-center'>
                    <div className='flex items-center justify-center gap-1 mb-1'>
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star
                          key={star}
                          className={cn(
                            'h-4 w-4',
                            star <= Math.round(averageEngagement)
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-gray-300'
                          )}
                        />
                      ))}
                    </div>
                    <p className='text-lg font-bold text-gray-900 dark:text-gray-100'>
                      {averageEngagement}/5
                    </p>
                    <p className='text-xs text-gray-500'>Avg. Engagement</p>
                  </div>
                  <div className='bg-white dark:bg-gray-800 rounded-lg p-3 text-center'>
                    <p className='text-lg font-bold text-gray-900 dark:text-gray-100'>
                      {engagementScores.length}/{presentCount}
                    </p>
                    <p className='text-xs text-gray-500'>Students Scored</p>
                  </div>
                  <div className='bg-white dark:bg-gray-800 rounded-lg p-3 text-center'>
                    <p className='text-lg font-bold text-gray-900 dark:text-gray-100'>
                      {Object.keys(behaviorCounts).length}
                    </p>
                    <p className='text-xs text-gray-500'>Behaviors Observed</p>
                  </div>
                </div>
                {Object.keys(behaviorCounts).length > 0 && (
                  <div className='flex flex-wrap gap-1.5'>
                    {Object.entries(behaviorCounts)
                      .sort(([, a], [, b]) => b - a)
                      .map(([behavior, count]) => (
                        <Badge
                          key={behavior}
                          variant='secondary'
                          className='text-xs bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700'
                        >
                          {LEARNING_BEHAVIOR_LABELS[behavior as LearningBehavior] || behavior} ({count})
                        </Badge>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Student Lists */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {/* Present Students */}
            <Card className='border-l-4 border-l-green-500'>
              <CardContent className='p-4'>
                <div className='flex items-center gap-2 mb-3'>
                  <UserCheck className='h-5 w-5 text-green-600 dark:text-green-400' />
                  <h3 className='font-semibold text-green-800 dark:text-green-600'>
                    Present Students ({presentCount})
                  </h3>
                </div>
                <div className='space-y-2 max-h-48 overflow-y-auto'>
                  {presentStudents.length === 0 ? (
                    <p className='text-gray-500 text-sm italic'>
                      No students marked as present
                    </p>
                  ) : (
                    presentStudents.map((student) => (
                      <div
                        key={student.id}
                        className='flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded'
                      >
                        <Avatar className='h-6 w-6'>
                          <AvatarImage src={student.avatar_url} />
                          <AvatarFallback className='text-xs bg-green-200 text-green-800'>
                            {student.first_name?.[0]}
                            {student.last_name?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className='flex-1 min-w-0'>
                          <p className='text-sm font-medium truncate'>
                            {student.first_name} {student.last_name}
                          </p>
                          <p className='text-xs text-gray-500 truncate'>
                            Roll: {student.roll_number || 'N/A'}
                          </p>
                        </div>
                        <Check className='h-4 w-4 text-green-600 dark:text-green-400' />
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Absent Students */}
            <Card className='border-l-4 border-l-red-500'>
              <CardContent className='p-4'>
                <div className='flex items-center gap-2 mb-3'>
                  <UserX className='h-5 w-5 text-red-600 dark:text-red-400' />
                  <h3 className='font-semibold text-red-800 dark:text-red-600'>
                    Absent Students ({absentCount})
                  </h3>
                </div>
                <div className='space-y-2 max-h-48 overflow-y-auto'>
                  {absentStudents.length === 0 ? (
                    <p className='text-gray-500 text-sm italic'>
                      No students marked as absent
                    </p>
                  ) : (
                    absentStudents.map((student) => (
                      <div
                        key={student.id}
                        className='flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded'
                      >
                        <Avatar className='h-6 w-6'>
                          <AvatarImage src={student.avatar_url} />
                          <AvatarFallback className='text-xs bg-red-200 text-red-800'>
                            {student.first_name?.[0]}
                            {student.last_name?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className='flex-1 min-w-0'>
                          <p className='text-sm font-medium truncate'>
                            {student.first_name} {student.last_name}
                          </p>
                          <p className='text-xs text-gray-500 truncate'>
                            Roll: {student.roll_number || 'N/A'}
                          </p>
                        </div>
                        <X className='h-4 w-4 text-red-600 dark:text-red-400' />
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Review Again
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className='bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
          >
            {loading ? (
              <>
                <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                {existingAttendance ? 'Updating...' : 'Saving...'}
              </>
            ) : (
              <>
                <Check className='h-4 w-4 mr-2' />
                {existingAttendance ? 'Update Attendance' : 'Save Attendance'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
