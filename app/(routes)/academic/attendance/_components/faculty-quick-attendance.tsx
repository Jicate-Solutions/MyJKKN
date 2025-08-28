'use client';

import { useState, useEffect } from 'react';
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
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { FacultyAttendanceService } from '@/lib/services/academic/faculty-attendance-service';
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
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<AttendancePeriodOption[]>([]);
  const [searchContext, setSearchContext] = useState<any>({});
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [markedPeriods, setMarkedPeriods] = useState<Set<string>>(new Set());

  const targetDate = selectedDate || format(new Date(), 'yyyy-MM-dd');
  const displayDate = format(
    new Date(targetDate + 'T00:00:00'),
    'EEEE, MMMM d, yyyy'
  );

  useEffect(() => {
    fetchFacultyPeriods();
  }, [staffId, targetDate]);

  const fetchFacultyPeriods = async () => {
    try {
      setLoading(true);
      const result = await FacultyAttendanceService.getFacultyTodayPeriods(
        staffId,
        targetDate
      );

      setPeriods(result.periods);
      setSearchContext(result.searchContext);

      // TODO: Check which periods already have attendance marked
      // This would require another service call to check existing attendance
    } catch (error) {
      console.error('Error fetching faculty periods:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodClick = (period: AttendancePeriodOption) => {
    setSelectedPeriodId(period.timetable_slot_id);

    // Pass the period and auto-filled context to parent
    // For faculty, the searchContext should already be properly populated
    // from the faculty service, so we mainly just need to add the date
    const fullContext = {
      ...searchContext,
      attendance_date: targetDate,
      // Use searchContext section_id if available, otherwise try period sections
      ...(searchContext.section_id
        ? {}
        : period.sections?.[0]?.id && {
            section_id: period.sections[0].id
          })
    };

    console.log('Faculty period clicked with context:', fullContext);
    onPeriodSelect(period, fullContext);
  };

  const getTimeStatus = (startTime: string) => {
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
        <div className='grid gap-3'>
          {periods.map((period) => {
            const timeStatus = getTimeStatus(period.start_time);
            const isSelected = selectedPeriodId === period.timetable_slot_id;
            const isMarked = markedPeriods.has(period.timetable_slot_id);

            return (
              <Button
                key={period.timetable_slot_id}
                variant={isSelected ? 'default' : 'outline'}
                className={cn(
                  'h-auto p-4 justify-start text-left relative group',
                  isMarked && 'border-green-500 bg-green-50 hover:bg-green-100',
                  timeStatus === 'past' && !isMarked && 'opacity-75'
                )}
                onClick={() => handlePeriodClick(period)}
              >
                <div className='flex-1 space-y-2'>
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
                        variant={
                          timeStatus === 'current'
                            ? 'default'
                            : timeStatus === 'past'
                            ? 'secondary'
                            : 'outline'
                        }
                        className='text-xs'
                      >
                        {period.period_name}
                      </Badge>
                    </div>
                    {isMarked && (
                      <CheckCircle className='h-5 w-5 text-green-600' />
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

                  {/* Action Indicator */}
                  {!isMarked && (
                    <div className='flex items-center gap-1 text-xs font-medium text-primary'>
                      <span>Click to mark attendance</span>
                      <ChevronRight className='h-3 w-3' />
                    </div>
                  )}
                </div>
              </Button>
            );
          })}
        </div>

        {/* Help Text */}
        <div className='mt-4 p-3 bg-muted/50 rounded-lg'>
          <p className='text-sm text-muted-foreground'>
            <strong>Quick Tip:</strong> Click on any class to quickly mark
            attendance. Your schedule is automatically loaded based on your
            timetable assignments.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
