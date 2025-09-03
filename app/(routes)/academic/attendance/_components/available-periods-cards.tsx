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
  Loader2,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { AttendancePeriodOption } from '@/types/attendance';
import { cn } from '@/lib/utils';

interface AvailablePeriodsCardsProps {
  periods: AttendancePeriodOption[];
  onPeriodSelect: (period: AttendancePeriodOption) => void;
  loading: boolean;
  selectedDate?: string;
  attendancePermissions: Map<string, boolean>;
  isSuperAdmin: boolean;
}

export function AvailablePeriodsCards({
  periods,
  onPeriodSelect,
  loading,
  selectedDate,
  attendancePermissions,
  isSuperAdmin
}: AvailablePeriodsCardsProps) {
  const [markedPeriods, setMarkedPeriods] = useState<Set<string>>(new Set());

  const targetDate = selectedDate || format(new Date(), 'yyyy-MM-dd');
  const displayDate = format(
    new Date(targetDate + 'T00:00:00'),
    'EEEE, MMMM d, yyyy'
  );

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

  const handlePeriodClick = (period: AttendancePeriodOption) => {
    onPeriodSelect(period);
  };

  // Filter periods based on permissions
  const filteredPeriods = periods.filter(
    (period: AttendancePeriodOption) =>
      isSuperAdmin ||
      attendancePermissions.get(period.timetable_slot_id) === true
  );

  if (loading) {
    return (
      <Card>
        <CardContent className='flex items-center justify-center py-12'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
          <span className='ml-2'>Loading available periods...</span>
        </CardContent>
      </Card>
    );
  }

  if (filteredPeriods.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Calendar className='h-5 w-5' />
            Available Periods - {displayDate}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className='h-4 w-4' />
            <AlertDescription>
              {periods.length === 0
                ? 'No periods found for the selected criteria. Please adjust your search filters and try again.'
                : 'No periods available - You are not assigned to teach any periods for this class on the selected date.'}
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
              Available Periods
            </CardTitle>
            <p className='text-sm text-muted-foreground mt-1'>{displayDate}</p>
          </div>
          <Badge variant='secondary' className='ml-auto'>
            {filteredPeriods.length}{' '}
            {filteredPeriods.length === 1 ? 'Period' : 'Periods'} Found
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className='grid gap-4'>
          {filteredPeriods.map((period) => {
            const timeStatus = getTimeStatus(period.start_time);
            const isMarked = markedPeriods.has(period.timetable_slot_id);

            return (
              <Card
                key={period.timetable_slot_id}
                className={cn(
                  'border-2 transition-all duration-200',
                  timeStatus === 'past' && !isMarked && 'opacity-75',
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
                      {period.degree_name && <span>{period.degree_name}</span>}
                      {period.program_name && (
                        <span>{period.program_name}</span>
                      )}
                      {period.semester_name && (
                        <span>{period.semester_name}</span>
                      )}
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
                        disabled={isMarked && timeStatus === 'past'}
                        size='sm'
                        className='min-w-[140px]'
                      >
                        {isMarked ? (
                          <>
                            <CheckCircle className='h-4 w-4 mr-2' />
                            View Attendance
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
            <strong>Search Results:</strong> Click the "Mark Attendance" button
            for any period to record student attendance. These periods match
            your search criteria and permission levels.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
