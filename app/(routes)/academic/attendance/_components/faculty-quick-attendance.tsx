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
import { AttendancePeriodOption } from '@/types/attendance';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
              console.warn(
                'Period missing section_id, skipping attendance check:',
                {
                  timetable_slot_id: period.timetable_slot_id,
                  period_name: period.period_name
                }
              );
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
            console.error('Error checking existing attendance:', error);
            // Continue without marking any periods as completed
          }
        }
      }
    } catch (error) {
      console.error('Error fetching faculty periods:', error);
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
      // TODO: Navigate to new reports module when rebuilt
      toast.info('Report viewing will be available in the new reports module');
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

  const getTimeStatus = (startTime: string) => {
    // TEMPORARY: Remove time-based restrictions - faculty can mark attendance anytime
    // TODO: Implement proper time restriction logic in future
    // For now, always allow attendance marking regardless of time
    return 'current';

    /* COMMENTED OUT - Original time-based logic for future implementation
    if (!startTime) return 'upcoming';

    const now = new Date();
    const [time, period] = startTime.split(' ');
    const [hours, minutes] = time.split(':').map(Number);

    const periodTime = new Date();
    periodTime.setHours(
      period === 'PM' && hours !== 12 ? hours + 12 : hours,
      minutes,
      0,
      0
    );

    if (now < periodTime) return 'upcoming';
    if (now > periodTime) return 'past';
    return 'current';
    */
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
        <div className='flex items-start justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <Calendar className='h-5 w-5' />
              Your Schedule
            </CardTitle>
            <p className='text-sm text-muted-foreground mt-1'>{displayDate}</p>
          </div>
          <Badge variant='secondary' className='ml-auto'>
            {periods.length} {periods.length === 1 ? 'Class' : 'Classes'} Today
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className='grid gap-4'>
          {periods.map((period, index) => {
            const timeStatus = getTimeStatus(period.start_time);
            const isMarked = markedPeriods.has(period.timetable_slot_id);

            return (
              <Card
                key={`${period.timetable_slot_id}-${period.timetable_id}-${index}`}
                className={cn(
                  'border-2 transition-all duration-200',
                  // timeStatus === 'past' && !isMarked && 'opacity-75', // TEMPORARY: Removed past period styling
                  isMarked && 'border-green-500'
                )}
              >
                <CardContent className='p-4'>
                  <div className='space-y-3'>
                    {/* Time and Period Info */}
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-3'>
                        <div className='flex items-center gap-2'>
                          <Clock className='h-4 w-4 text-muted-foreground' />
                          <span className='font-medium'>
                            {period.start_time} - {period.end_time}
                          </span>
                        </div>
                        <Badge
                          variant='default' // TEMPORARY: Always use default variant
                          // variant={timeStatus === 'current' ? 'default' : timeStatus === 'past' ? 'secondary' : 'outline'} // TODO: Re-enable time-based styling
                          className='text-xs'
                        >
                          {period.period_name}
                        </Badge>
                      </div>
                      {isMarked && (
                        <div className='flex items-center gap-2'>
                          <CheckCircle className='h-5 w-5 text-green-600' />
                          <span className='text-sm text-green-600 font-medium'>
                            Completed
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Course Info */}
                    {period.course && (
                      <div className='flex items-center gap-2'>
                        <BookOpen className='h-4 w-4 text-muted-foreground' />
                        <span className='font-medium'>
                          {period.course.course_code} -{' '}
                          {period.course.course_name}
                        </span>
                      </div>
                    )}

                    {/* Class Details */}
                    <div className='flex flex-wrap gap-4 text-sm text-muted-foreground'>
                      <span>{period.degree_name}</span>
                      <span>{period.program_name}</span>
                      <span>{period.semester_name}</span>
                      {period.section_name && (
                        <div className='flex items-center gap-1'>
                          <Users className='h-3 w-3' />
                          <span>Section {period.section_name}</span>
                        </div>
                      )}
                    </div>

                    {/* Mark Attendance Button */}
                    <div className='flex justify-end pt-2'>
                      <Button
                        onClick={() => handlePeriodClick(period)}
                        disabled={false} // TEMPORARY: Allow marking attendance anytime
                        // disabled={!isMarked && timeStatus === 'past'} // TODO: Re-enable time restrictions later
                        size='sm'
                        className='min-w-[140px]'
                      >
                        {isMarked ? (
                          <>
                            <CheckCircle className='h-4 w-4 mr-2' />
                            View Details
                          </>
                        ) : (
                          <>
                            <Users className='h-4 w-4 mr-2' />
                            Mark Attendance
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
