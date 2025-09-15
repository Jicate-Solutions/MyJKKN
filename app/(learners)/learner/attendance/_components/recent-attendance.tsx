'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Calendar,
  Clock,
  User,
  BookOpen,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertCircle,
  MoreHorizontal
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { LearnerAttendanceDay } from '@/types/learner-attendance';

interface RecentAttendanceProps {
  recentAttendance: LearnerAttendanceDay[];
  onViewDetails?: (date: string) => void;
  loading?: boolean;
}

export function RecentAttendance({
  recentAttendance,
  onViewDetails,
  loading = false
}: RecentAttendanceProps) {
  // Convert 24-hour time to 12-hour format
  const formatTime12Hour = (time: string) => {
    if (!time) return '';

    // Handle time formats like "14:30:00" or "14:30"
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const minute = minutes || '00';

    if (hour === 0) {
      return `12:${minute} AM`;
    } else if (hour < 12) {
      return `${hour}:${minute} AM`;
    } else if (hour === 12) {
      return `12:${minute} PM`;
    } else {
      return `${hour - 12}:${minute} PM`;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Present':
        return <CheckCircle className='h-4 w-4 text-green-600' />;
      case 'Absent':
        return <XCircle className='h-4 w-4 text-red-600' />;
      case 'Late':
        return <AlertCircle className='h-4 w-4 text-yellow-600' />;
      case 'Permission':
        return <AlertCircle className='h-4 w-4 text-blue-600' />;
      default:
        return <MoreHorizontal className='h-4 w-4 text-gray-400' />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Present':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Absent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Late':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Permission':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getAttendanceColor = (percentage: number) => {
    if (percentage >= 85) return 'text-green-600';
    if (percentage >= 75) return 'text-blue-600';
    if (percentage >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <Card className='animate-pulse'>
        <CardHeader>
          <div className='h-6 bg-gray-200 rounded w-1/2'></div>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            {[...Array(5)].map((_, i) => (
              <div key={i} className='space-y-3 p-4 border rounded-lg'>
                <div className='flex justify-between items-start'>
                  <div className='space-y-2'>
                    <div className='h-4 bg-gray-200 rounded w-24'></div>
                    <div className='h-3 bg-gray-200 rounded w-16'></div>
                  </div>
                  <div className='h-6 bg-gray-200 rounded w-16'></div>
                </div>
                <div className='space-y-2'>
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className='h-12 bg-gray-200 rounded'></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (recentAttendance.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Calendar className='h-5 w-5' />
            Recent Attendance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='text-center py-8'>
            <Calendar className='h-12 w-12 text-gray-400 mx-auto mb-4' />
            <p className='text-gray-500'>No recent attendance records found</p>
            <p className='text-sm text-gray-400 mt-1'>
              Your attendance records will appear here once classes begin
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <Calendar className='h-5 w-5' />
            Recent Attendance
            <Badge variant='secondary' className='text-xs'>
              Last 30 days
            </Badge>
          </div>
          <Button variant='outline' size='sm'>
            View All
            <ChevronRight className='h-4 w-4 ml-1' />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-4'>
          {recentAttendance.slice(0, 10).map((day) => (
            <div
              key={day.date}
              className='border rounded-lg p-4 hover:shadow-sm transition-shadow cursor-pointer'
              onClick={() => onViewDetails?.(day.date)}
            >
              {/* Day Header */}
              <div className='flex items-center justify-between mb-3'>
                <div className='flex items-center gap-3'>
                  <div className='text-center'>
                    <div className='text-lg font-bold'>
                      {format(parseISO(day.date), 'd')}
                    </div>
                    <div className='text-xs text-gray-500'>
                      {format(parseISO(day.date), 'MMM')}
                    </div>
                  </div>
                  <div>
                    <h4 className='font-medium'>{day.day_name}</h4>
                    <p className='text-sm text-gray-500'>
                      {format(parseISO(day.date), 'MMM dd, yyyy')}
                    </p>
                  </div>
                </div>

                <div className='text-right'>
                  <div
                    className={`text-lg font-bold ${getAttendanceColor(
                      day.attendance_percentage
                    )}`}
                  >
                    {day.attendance_percentage.toFixed(1)}%
                  </div>
                  <div className='text-xs text-gray-500'>
                    {day.attended_periods}/{day.total_periods} periods
                  </div>
                  <Progress
                    value={day.attendance_percentage}
                    className='w-16 h-1 mt-1'
                  />
                </div>
              </div>

              {/* Periods */}
              <div className='space-y-2'>
                {day.periods.slice(0, 3).map((period) => (
                  <div
                    key={period.id}
                    className='flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg'
                  >
                    <div className='flex items-center gap-3'>
                      {getStatusIcon(period.status)}
                      <div className='flex-1'>
                        <div className='flex items-center gap-2'>
                          <span className='font-medium text-sm'>
                            {period.period_name}
                          </span>
                          <Badge
                            variant='outline'
                            className={`text-xs ${getStatusColor(
                              period.status
                            )}`}
                          >
                            {period.status}
                          </Badge>
                        </div>
                        <div className='flex items-center gap-4 text-xs text-gray-500 mt-1'>
                          <span className='flex items-center gap-1'>
                            <Clock className='h-3 w-3' />
                            {formatTime12Hour(period.start_time)} -{' '}
                            {formatTime12Hour(period.end_time)}
                          </span>
                          <span className='flex items-center gap-1'>
                            <BookOpen className='h-3 w-3' />
                            {period.course_code || period.course_name}
                          </span>
                          {period.faculty_name && (
                            <span className='flex items-center gap-1'>
                              <User className='h-3 w-3' />
                              {period.faculty_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {day.periods.length > 3 && (
                  <div className='text-center'>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='text-xs text-gray-500 hover:text-gray-700'
                    >
                      +{day.periods.length - 3} more periods
                    </Button>
                  </div>
                )}
              </div>

              {/* Day Summary */}
              {day.periods.length > 0 && (
                <div className='mt-3 pt-3 border-t flex items-center justify-between text-xs text-gray-500'>
                  <div className='flex items-center gap-4'>
                    <span className='flex items-center gap-1'>
                      <CheckCircle className='h-3 w-3 text-green-600' />
                      {
                        day.periods.filter((p) => p.status === 'Present').length
                      }{' '}
                      Present
                    </span>
                    <span className='flex items-center gap-1'>
                      <XCircle className='h-3 w-3 text-red-600' />
                      {
                        day.periods.filter((p) => p.status === 'Absent').length
                      }{' '}
                      Absent
                    </span>
                    {day.periods.filter((p) => p.status === 'Late').length >
                      0 && (
                      <span className='flex items-center gap-1'>
                        <AlertCircle className='h-3 w-3 text-yellow-600' />
                        {
                          day.periods.filter((p) => p.status === 'Late').length
                        }{' '}
                        Late
                      </span>
                    )}
                  </div>
                  <span>{format(parseISO(day.date), 'EEEE')}</span>
                </div>
              )}
            </div>
          ))}

          {recentAttendance.length > 10 && (
            <div className='text-center pt-4'>
              <Button variant='outline' onClick={() => onViewDetails?.('all')}>
                View All Recent Records
                <ChevronRight className='h-4 w-4 ml-1' />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
