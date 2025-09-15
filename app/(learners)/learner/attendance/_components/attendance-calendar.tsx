'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  getDay
} from 'date-fns';
import type { AttendanceCalendarData } from '@/types/learner-attendance';

interface AttendanceCalendarProps {
  calendarData: AttendanceCalendarData[];
  loading?: boolean;
}

export function AttendanceCalendar({ calendarData, loading = false }: AttendanceCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Add empty cells for proper calendar layout
  const firstDayOfWeek = getDay(monthStart);
  const calendarCells = [
    ...Array(firstDayOfWeek).fill(null),
    ...monthDays
  ];

  const getAttendanceForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return calendarData.find(data => data.date === dateStr);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-100 border-green-300 text-green-800';
      case 'absent':
        return 'bg-red-100 border-red-300 text-red-800';
      case 'partial':
        return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      case 'holiday':
        return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'weekend':
        return 'bg-gray-100 border-gray-300 text-gray-600';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'present':
        return <CheckCircle className='h-3 w-3' />;
      case 'absent':
        return <XCircle className='h-3 w-3' />;
      case 'partial':
        return <AlertCircle className='h-3 w-3' />;
      case 'holiday':
        return <CalendarIcon className='h-3 w-3' />;
      default:
        return <Clock className='h-3 w-3' />;
    }
  };

  const nextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const prevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  if (loading) {
    return (
      <Card className='animate-pulse'>
        <CardHeader>
          <div className='h-6 bg-gray-200 rounded w-1/3'></div>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            <div className='h-8 bg-gray-200 rounded'></div>
            <div className='grid grid-cols-7 gap-2'>
              {[...Array(35)].map((_, i) => (
                <div key={i} className='h-16 bg-gray-200 rounded'></div>
              ))}
            </div>
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
            <CalendarIcon className='h-5 w-5' />
            Attendance Calendar
          </div>
          <div className='flex items-center gap-1 md:gap-2'>
            <Button variant='outline' size='sm' onClick={prevMonth} className='p-1 md:p-2'>
              <ChevronLeft className='h-3 w-3 md:h-4 md:w-4' />
            </Button>
            <span className='text-sm md:text-lg font-semibold min-w-[120px] md:min-w-[150px] text-center'>
              {format(currentMonth, 'MMM yyyy')}
            </span>
            <Button variant='outline' size='sm' onClick={nextMonth} className='p-1 md:p-2'>
              <ChevronRight className='h-3 w-3 md:h-4 md:w-4' />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-4'>
          {/* Calendar Legend */}
          <div className='flex flex-wrap gap-2 md:gap-3 text-xs'>
            <div className='flex items-center gap-1'>
              <div className='w-2 h-2 md:w-3 md:h-3 bg-green-100 border border-green-300 rounded'></div>
              <span className='text-xs'>Present</span>
            </div>
            <div className='flex items-center gap-1'>
              <div className='w-2 h-2 md:w-3 md:h-3 bg-red-100 border border-red-300 rounded'></div>
              <span className='text-xs'>Absent</span>
            </div>
            <div className='flex items-center gap-1'>
              <div className='w-2 h-2 md:w-3 md:h-3 bg-yellow-100 border border-yellow-300 rounded'></div>
              <span className='text-xs'>Partial</span>
            </div>
            <div className='flex items-center gap-1'>
              <div className='w-2 h-2 md:w-3 md:h-3 bg-blue-100 border border-blue-300 rounded'></div>
              <span className='text-xs'>Holiday</span>
            </div>
            <div className='flex items-center gap-1'>
              <div className='w-2 h-2 md:w-3 md:h-3 bg-gray-100 border border-gray-300 rounded'></div>
              <span className='text-xs'>Weekend</span>
            </div>
          </div>

          {/* Days of week header */}
          <div className='grid grid-cols-7 gap-1 md:gap-2'>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className='text-center text-xs md:text-sm font-medium text-gray-600 py-1 md:py-2'>
                <span className='hidden sm:inline'>{day}</span>
                <span className='sm:hidden'>{day.substring(0, 1)}</span>
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className='grid grid-cols-7 gap-1 md:gap-2'>
            {calendarCells.map((date, index) => {
              if (!date) {
                return <div key={index} className='h-12 md:h-16'></div>;
              }

              const attendanceData = getAttendanceForDate(date);
              const isCurrentMonth = isSameMonth(date, currentMonth);
              const isToday = isSameDay(date, new Date());

              let status = 'weekend';
              if (attendanceData) {
                status = attendanceData.status;
              } else if (isCurrentMonth) {
                // Check if it's a past date without data (likely no classes)
                const today = new Date();
                if (date < today) {
                  status = 'holiday';
                }
              }

              return (
                <div
                  key={index}
                  className={`
                    h-12 md:h-16 p-1 border rounded cursor-pointer transition-colors
                    ${isCurrentMonth ? '' : 'opacity-30'}
                    ${isToday ? 'ring-1 md:ring-2 ring-blue-500' : ''}
                    ${attendanceData ? getStatusColor(status) : 'bg-gray-50 border-gray-200'}
                    hover:shadow-sm
                  `}
                  title={attendanceData ?
                    `${format(date, 'MMM dd')}: ${attendanceData.percentage}% (${attendanceData.periods?.present}/${attendanceData.periods?.total})` :
                    format(date, 'MMM dd')
                  }
                >
                  <div className='flex flex-col h-full'>
                    <div className='flex items-center justify-between'>
                      <span className={`text-xs md:text-sm font-medium ${isToday ? 'font-bold' : ''}`}>
                        {format(date, 'd')}
                      </span>
                      {attendanceData && (
                        <div className='flex items-center'>
                          <div className='h-2 w-2 md:h-3 md:w-3'>
                            {getStatusIcon(status)}
                          </div>
                        </div>
                      )}
                    </div>

                    {attendanceData && attendanceData.periods && (
                      <div className='flex-1 flex flex-col justify-center items-center'>
                        <span className='text-xs font-semibold'>
                          {attendanceData.percentage?.toFixed(0)}%
                        </span>
                        <span className='text-xs opacity-75 hidden md:block'>
                          {attendanceData.periods.present}/{attendanceData.periods.total}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Monthly Summary */}
          <div className='pt-4 border-t'>
            <h4 className='text-sm font-medium mb-2'>Monthly Summary</h4>
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm'>
              <div className='flex items-center gap-2'>
                <CheckCircle className='h-4 w-4 text-green-600' />
                <span>
                  {calendarData.filter(d =>
                    d.status === 'present' &&
                    format(parseISO(d.date), 'yyyy-MM') === format(currentMonth, 'yyyy-MM')
                  ).length} Present Days
                </span>
              </div>
              <div className='flex items-center gap-2'>
                <XCircle className='h-4 w-4 text-red-600' />
                <span>
                  {calendarData.filter(d =>
                    d.status === 'absent' &&
                    format(parseISO(d.date), 'yyyy-MM') === format(currentMonth, 'yyyy-MM')
                  ).length} Absent Days
                </span>
              </div>
              <div className='flex items-center gap-2'>
                <AlertCircle className='h-4 w-4 text-yellow-600' />
                <span>
                  {calendarData.filter(d =>
                    d.status === 'partial' &&
                    format(parseISO(d.date), 'yyyy-MM') === format(currentMonth, 'yyyy-MM')
                  ).length} Partial Days
                </span>
              </div>
              <div className='flex items-center gap-2'>
                <CalendarIcon className='h-4 w-4 text-blue-600' />
                <span>
                  {calendarData.filter(d =>
                    d.status === 'holiday' &&
                    format(parseISO(d.date), 'yyyy-MM') === format(currentMonth, 'yyyy-MM')
                  ).length} Holidays
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper function to parse ISO date string
function parseISO(dateString: string): Date {
  return new Date(dateString + 'T00:00:00');
}