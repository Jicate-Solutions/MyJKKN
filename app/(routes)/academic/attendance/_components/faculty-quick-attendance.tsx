'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Calendar,
  Clock,
  Users,
  BookOpen,
  Loader2,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { FacultyAttendanceService } from '@/lib/services/academic/faculty-attendance-service';
import { AttendanceService } from '@/lib/services/academic/attendance-service';
import { logger } from '@/lib/utils/enhanced-logger';
import { AttendancePeriodOption } from '@/types/attendance';
import { cn } from '@/lib/utils';

interface FacultyQuickAttendanceProps {
  staffId: string;
  staffName: string;
  onPeriodSelect: (period: AttendancePeriodOption, context: any) => void;
  selectedDate?: string;
}

export function FacultyQuickAttendance({
  staffId,
  staffName,
  onPeriodSelect,
  selectedDate
}: FacultyQuickAttendanceProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<AttendancePeriodOption[]>([]);
  const [searchContext, setSearchContext] = useState<any>({});

  const [markedPeriods, setMarkedPeriods] = useState<Set<string>>(new Set());
  const [periodRecordIds, setPeriodRecordIds] = useState<Map<string, string>>(
    new Map()
  );

  const targetDate = selectedDate || format(new Date(), 'yyyy-MM-dd');
  const displayDate = format(
    new Date(targetDate + 'T00:00:00'),
    'EEEE, MMMM d, yyyy'
  );

  const fetchFacultyPeriods = useCallback(async () => {
    try {
      setLoading(true);
      const result = await FacultyAttendanceService.getFacultyTodayPeriods(
        staffId,
        targetDate
      );

      setPeriods(result.periods);
      setSearchContext(result.searchContext);

      // Check which periods already have attendance marked
      if (result.periods.length > 0) {
        const periodChecks = result.periods
          .map((period) => {
            const sectionId =
              period.sections?.[0]?.id ||
              result.searchContext?.section_id ||
              '';

            // Skip periods without valid section_id
            if (!sectionId || sectionId.trim() === '') {
              logger.warn('academic/attendance', 'Period missing section_id, skipping attendance check', {
                timetable_slot_id: period.timetable_slot_id,
                period_name: period.period_name
              });
              return null;
            }

            return {
              timetable_slot_id: period.timetable_slot_id,
              timetable_id: period.timetable_id,
              section_id: sectionId,
              attendance_date: targetDate
            };
          })
          .filter(
            (check): check is NonNullable<typeof check> => check !== null
          );

        if (periodChecks.length > 0) {
          try {
            const attendanceMap =
              await AttendanceService.checkExistingAttendanceForPeriods(
                periodChecks
              );

            // Update marked periods set and record IDs
            const marked = new Set<string>();
            const recordIds = new Map<string, string>();
            for (const [slotId, attendanceInfo] of attendanceMap) {
              if (attendanceInfo.isMarked) {
                marked.add(slotId);
                if (attendanceInfo.recordId) {
                  recordIds.set(slotId, attendanceInfo.recordId);
                }
              }
            }
            setMarkedPeriods(marked);
            setPeriodRecordIds(recordIds);
          } catch (error) {
            logger.error('academic/attendance', 'Error checking existing attendance', error);
            // Continue without marking any periods as completed
          }
        }
      }
    } catch (error) {
      logger.error('academic/attendance', 'Error fetching faculty periods', error);
    } finally {
      setLoading(false);
    }
  }, [staffId, targetDate]);

  useEffect(() => {
    fetchFacultyPeriods();
  }, [staffId, targetDate, fetchFacultyPeriods]);

  const handlePeriodClick = (period: AttendancePeriodOption) => {
    const isMarked = markedPeriods.has(period.timetable_slot_id);
    const recordId = periodRecordIds.get(period.timetable_slot_id);

    if (isMarked && recordId) {
      // Navigate to attendance report details page
      router.push(`/academic/attendance/reports/${recordId}`);
      return;
    } else {
      // Navigate to separate attendance marking page
      const params = new URLSearchParams({
        periodId: period.timetable_slot_id,
        timetableId: period.timetable_id,
        sectionId: period.sections?.[0]?.id || searchContext.section_id || '',
        date: targetDate,
        periodName: period.period_name,
        courseName: period.course?.course_name || 'Unknown Course',
        startTime: period.start_time,
        endTime: period.end_time
      });

      // Navigate to attendance marking page
      router.push(`/academic/attendance/mark?${params.toString()}`);
    }
  };

  const parseTimeString = (timeStr: string): Date | null => {
    if (!timeStr) return null;
    const parts = timeStr.trim().split(' ');
    if (parts.length < 2) return null;
    const [time, period] = parts;
    const timeParts = time.split(':').map(Number);
    if (timeParts.length < 2) return null;
    const [hours, minutes] = timeParts;
    const date = new Date(targetDate + 'T00:00:00');
    let h = hours;
    if (period?.toUpperCase() === 'PM' && hours !== 12) h += 12;
    if (period?.toUpperCase() === 'AM' && hours === 12) h = 0;
    date.setHours(h, minutes, 0, 0);
    return date;
  };

  const getTimeStatus = (startTime: string, endTime?: string): 'past' | 'current' | 'upcoming' => {
    // Visual indicator only - faculty can still mark attendance for any period
    if (!startTime) return 'current';
    const now = new Date();
    const periodStart = parseTimeString(startTime);
    if (!periodStart) return 'current';

    if (now < periodStart) return 'upcoming';

    if (endTime) {
      const periodEnd = parseTimeString(endTime);
      if (periodEnd && now <= periodEnd) return 'current';
    }

    return 'past';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className='flex items-center justify-center py-12'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
          <span className='ml-2'>Loading your schedule...</span>
        </CardContent>
      </Card>
    );
  }

  if (periods.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Calendar className='h-5 w-5' />
            Your Schedule - {displayDate}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className='h-4 w-4' />
            <AlertDescription>
              No classes scheduled for today. You can use the search criteria
              below to mark attendance for other sections if needed.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col lg:flex-row gap-4 items-start justify-between'>
          <div className='flex flex-col gap-2 flex-1'>
            <CardTitle className='flex items-center gap-2'>
              <Calendar className='h-5 w-5' />
              Your Schedule
            </CardTitle>
            {/* Updated: 2025-10-14 - Prominent date badge for easy identification */}
            <div className='inline-flex items-center gap-2 bg-green-600 dark:bg-green-700 text-white px-4 py-2 rounded-md font-semibold shadow-sm w-fit'>
              <Calendar className='h-4 w-4' />
              <span>{displayDate}</span>
            </div>
          </div>
          <Badge variant='secondary' className='ml-auto'>
            {periods.length} {periods.length === 1 ? 'Class' : 'Classes'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className='grid gap-4'>
          {periods.map((period, index) => {
            const timeStatus = getTimeStatus(period.start_time, period.end_time);
            const isMarked = markedPeriods.has(period.timetable_slot_id);

            return (
              <Card
                key={`${period.timetable_slot_id}-${period.timetable_id}-${index}`}
                className={cn(
                  'border-2 transition-all duration-200',
                  timeStatus === 'past' && !isMarked && 'opacity-75',
                  isMarked && 'border-green-500 dark:border-green-600'
                )}
              >
                <CardContent className='p-3'>
                  <div className='space-y-3'>
                    {/* Time and Period Info - Mobile Responsive */}
                    <div className='flex flex-col gap-3'>
                      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'>
                        <div className='flex items-center justify-between gap-2'>
                          <div className='flex items-center gap-2'>
                            <Clock className='h-4 w-4 text-muted-foreground flex-shrink-0' />
                            <span className='font-medium text-sm'>
                              {period.start_time} - {period.end_time}
                            </span>
                          </div>
                          <Badge
                            variant='default'
                            className='text-xs w-fit self-start xs:self-auto'
                          >
                            {period.period_name}
                          </Badge>
                          {timeStatus === 'past' && !isMarked && (
                            <Badge variant='secondary' className='text-xs w-fit bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'>
                              Ended
                            </Badge>
                          )}
                          {timeStatus === 'upcoming' && !isMarked && (
                            <Badge variant='secondary' className='text-xs w-fit bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'>
                              Upcoming
                            </Badge>
                          )}
                        </div>
                        {isMarked && (
                          <div className='flex items-center gap-2 self-start sm:self-auto'>
                            <CheckCircle className='h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0' />
                            <span className='text-xs text-green-600 dark:text-green-400 font-medium'>
                              Completed
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Course Info */}
                    {period.course && (
                      <div className='flex items-center gap-2 -mt-1'>
                        <BookOpen className='h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0' />
                        <div className='min-w-0 flex-1'>
                          <span className='font-medium text-sm break-words leading-relaxed'>
                            {period.course.course_code}
                          </span>
                          <span className='text-muted-foreground text-sm'>
                            {' '}
                            -{' '}
                          </span>
                          <span className='font-medium text-sm break-words leading-relaxed'>
                            {period.course.course_name}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Class Details - Mobile Responsive Grid */}
                    <div className='grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-muted-foreground'>
                      {period.department_name && (
                        <div className='bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-md text-center font-medium'>
                          {period.department_name}
                        </div>
                      )}

                      {period.semester_name && (
                        <div className='bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-md text-center font-medium'>
                          {period.semester_name}
                        </div>
                      )}
                      {period.section_name && (
                        <div className='bg-blue-50 dark:bg-blue-900/30 px-3 py-2 rounded-md text-center flex items-center justify-center gap-1.5 font-medium text-blue-700 dark:text-blue-300 col-span-1 xs:col-span-2 sm:col-span-1'>
                          <Users className='h-3 w-3 flex-shrink-0' />
                          <span>Section {period.section_name}</span>
                        </div>
                      )}
                    </div>

                    {/* Mark Attendance Button - Mobile Responsive */}
                    <div className='pt-3 border-t border-border/50'>
                      <Button
                        onClick={() => handlePeriodClick(period)}
                        disabled={false}
                        size='sm'
                        className='w-full h-10 font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]'
                      >
                        {isMarked ? (
                          <>
                            <CheckCircle className='h-4 w-4 mr-2 flex-shrink-0' />
                            <span className='text-sm'>View Details</span>
                          </>
                        ) : (
                          <>
                            <Users className='h-4 w-4 mr-2 flex-shrink-0' />
                            <span className='text-sm'>Mark Attendance</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Help Text */}
        <div className='mt-4 p-3 bg-muted/50 rounded-lg'>
          <p className='text-sm text-muted-foreground'>
            <strong>Quick Tip:</strong> Click the &quot;Mark Attendance&quot;
            button for any class to record student attendance. Your schedule is
            automatically loaded based on your timetable assignments.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
