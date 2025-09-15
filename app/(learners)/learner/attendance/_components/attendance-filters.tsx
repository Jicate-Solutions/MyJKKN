'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import {
  CalendarIcon,
  Filter,
  X,
  Download,
  RefreshCw,
  FileText,
  FileSpreadsheet,
  Share,
  ChevronDown,
  Mail,
  MessageCircle,
  Link,
  Users
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type {
  LearnerAttendanceFilters,
  LearnerSemesterData,
  CourseAttendanceStats
} from '@/types/learner-attendance';

interface AttendanceFiltersProps {
  filters: LearnerAttendanceFilters;
  onFiltersChange: (filters: Partial<LearnerAttendanceFilters>) => void;
  semesters: LearnerSemesterData[];
  courses: CourseAttendanceStats[];
  onRefresh: () => void;
  onExport: () => void;
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  onExportCSV?: () => void;
  onShare?: () => void;
  onShareEmail?: () => void;
  onShareWhatsApp?: () => void;
  onShareParent?: () => void;
  loading?: boolean;
}

export function AttendanceFilters({
  filters,
  onFiltersChange,
  semesters,
  courses,
  onRefresh,
  onExport,
  onExportPDF,
  onExportExcel,
  onExportCSV,
  onShare,
  onShareEmail,
  onShareWhatsApp,
  onShareParent,
  loading = false
}: AttendanceFiltersProps) {
  const [fromCalendarOpen, setFromCalendarOpen] = useState(false);
  const [toCalendarOpen, setToCalendarOpen] = useState(false);

  const handleDateRangeChange = (type: 'from' | 'to', date: Date | undefined) => {
    if (date) {
      const dateString = format(date, 'yyyy-MM-dd');
      const currentRange = filters.date_range || { from: '', to: '' };

      onFiltersChange({
        date_range: {
          ...currentRange,
          [type]: dateString
        }
      });

      if (type === 'from') {
        setFromCalendarOpen(false);
      } else {
        setToCalendarOpen(false);
      }
    }
  };

  const clearDateRange = () => {
    onFiltersChange({ date_range: undefined });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      semester_id: undefined,
      course_id: undefined,
      date_range: undefined,
      status: 'all',
      period_type: 'all',
      view_mode: 'semester'
    });
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.semester_id) count++;
    if (filters.course_id) count++;
    if (filters.date_range) count++;
    if (filters.status && filters.status !== 'all') count++;
    if (filters.period_type && filters.period_type !== 'all') count++;
    return count;
  };

  // Helper functions to check if quick action buttons are active
  const isThisMonthActive = () => {
    if (!filters.date_range) return false;
    const thisMonthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');
    const todayFormatted = format(new Date(), 'yyyy-MM-dd');
    return filters.date_range.from === thisMonthStart && filters.date_range.to === todayFormatted;
  };

  const isLastMonthActive = () => {
    if (!filters.date_range) return false;
    const lastMonthStart = format(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1), 'yyyy-MM-dd');
    const lastMonthEnd = format(new Date(new Date().getFullYear(), new Date().getMonth(), 0), 'yyyy-MM-dd');
    return filters.date_range.from === lastMonthStart && filters.date_range.to === lastMonthEnd;
  };

  const isShowAbsencesActive = () => {
    return filters.status === 'absent';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <Filter className='h-5 w-5' />
            Filters & Options
            {getActiveFiltersCount() > 0 && (
              <Badge variant='secondary'>
                {getActiveFiltersCount()} active
              </Badge>
            )}
          </div>
          <div className='flex items-center gap-1 md:gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={onRefresh}
              disabled={loading}
              className='text-xs md:text-sm px-2 md:px-3'
            >
              <RefreshCw className={`h-3 w-3 md:h-4 md:w-4 ${loading ? 'animate-spin' : ''} ${loading ? '' : 'mr-1 md:mr-2'}`} />
              <span className='hidden sm:inline'>Refresh</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={loading}
                  className='text-xs md:text-sm px-2 md:px-3'
                >
                  <Download className='h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2' />
                  <span className='hidden sm:inline'>Export</span>
                  <span className='sm:hidden'>Save</span>
                  <ChevronDown className='h-2 w-2 md:h-3 md:w-3 ml-1' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onExportPDF}>
                  <FileText className='h-4 w-4 mr-2' />
                  Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportExcel}>
                  <FileSpreadsheet className='h-4 w-4 mr-2' />
                  Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportCSV}>
                  <FileSpreadsheet className='h-4 w-4 mr-2' />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onShare}>
                  <Link className='h-4 w-4 mr-2' />
                  Copy Link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onShareEmail}>
                  <Mail className='h-4 w-4 mr-2' />
                  Share via Email
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onShareWhatsApp}>
                  <MessageCircle className='h-4 w-4 mr-2' />
                  Share via WhatsApp
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onShareParent}>
                  <Users className='h-4 w-4 mr-2' />
                  Send to Parent
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onExport}>
                  <Download className='h-4 w-4 mr-2' />
                  Quick Export
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-6'>
          {/* View Mode */}
          <div className='space-y-2'>
            <Label>View Mode</Label>
            <Select
              value={filters.view_mode}
              onValueChange={(value: 'daily' | 'weekly' | 'monthly' | 'semester') =>
                onFiltersChange({ view_mode: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='Select view mode' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='daily'>Daily View</SelectItem>
                <SelectItem value='weekly'>Weekly View</SelectItem>
                <SelectItem value='monthly'>Monthly View</SelectItem>
                <SelectItem value='semester'>Semester View</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4'>
            {/* Semester Filter */}
            <div className='space-y-2'>
              <Label>Semester</Label>
              <Select
                value={filters.semester_id || 'all'}
                onValueChange={(value) =>
                  onFiltersChange({
                    semester_id: value === 'all' ? undefined : value
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='All Semesters' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Semesters</SelectItem>
                  {semesters.map((semester) => (
                    <SelectItem key={semester.semester_id} value={semester.semester_id}>
                      {semester.semester_name}
                      {semester.is_current && (
                        <Badge variant='secondary' className='ml-2 text-xs'>
                          Current
                        </Badge>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Course Filter */}
            <div className='space-y-2'>
              <Label>Course</Label>
              <Select
                value={filters.course_id || 'all'}
                onValueChange={(value) =>
                  onFiltersChange({
                    course_id: value === 'all' ? undefined : value
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='All Courses' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Courses</SelectItem>
                  {courses.map((course) => (
                    <SelectItem key={course.course_id} value={course.course_id}>
                      <div className='flex items-center justify-between w-full'>
                        <span>{course.course_code || course.course_name}</span>
                        <Badge
                          variant={course.percentage >= 75 ? 'default' : 'destructive'}
                          className='ml-2 text-xs'
                        >
                          {course.percentage.toFixed(0)}%
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className='space-y-2'>
              <Label>Attendance Status</Label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(value: 'all' | 'present' | 'absent' | 'late' | 'permission') =>
                  onFiltersChange({ status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='All Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Status</SelectItem>
                  <SelectItem value='present'>Present</SelectItem>
                  <SelectItem value='absent'>Absent</SelectItem>
                  <SelectItem value='late'>Late</SelectItem>
                  <SelectItem value='permission'>Permission</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date Range Filter */}
          <div className='space-y-2'>
            <Label>Date Range</Label>
            <div className='flex flex-col sm:flex-row gap-2 sm:gap-3'>
              {/* From Date */}
              <Popover open={fromCalendarOpen} onOpenChange={setFromCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    className={cn(
                      'flex-1 justify-start text-left font-normal',
                      !filters.date_range?.from && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {filters.date_range?.from ? (
                      format(new Date(filters.date_range.from + 'T00:00:00'), 'PPP')
                    ) : (
                      <span>From date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0' align='start'>
                  <Calendar
                    mode='single'
                    selected={
                      filters.date_range?.from
                        ? new Date(filters.date_range.from + 'T00:00:00')
                        : undefined
                    }
                    onSelect={(date) => handleDateRangeChange('from', date)}
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(23, 59, 59, 999);
                      return date > today;
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {/* To Date */}
              <Popover open={toCalendarOpen} onOpenChange={setToCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    className={cn(
                      'flex-1 justify-start text-left font-normal',
                      !filters.date_range?.to && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {filters.date_range?.to ? (
                      format(new Date(filters.date_range.to + 'T00:00:00'), 'PPP')
                    ) : (
                      <span>To date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0' align='start'>
                  <Calendar
                    mode='single'
                    selected={
                      filters.date_range?.to
                        ? new Date(filters.date_range.to + 'T00:00:00')
                        : undefined
                    }
                    onSelect={(date) => handleDateRangeChange('to', date)}
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(23, 59, 59, 999);
                      return date > today;
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {/* Clear Date Range */}
              {filters.date_range && (
                <Button
                  variant='outline'
                  size='icon'
                  onClick={clearDateRange}
                  title='Clear date range'
                >
                  <X className='h-4 w-4' />
                </Button>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-4 border-t'>
            <div className='flex flex-wrap gap-2'>
              <Button
                variant={isThisMonthActive() ? 'default' : 'outline'}
                size='sm'
                onClick={() => {
                  if (isThisMonthActive()) {
                    // If already active, clear the filter
                    onFiltersChange({ date_range: undefined });
                  } else {
                    // Apply this month filter
                    onFiltersChange({
                      date_range: {
                        from: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
                        to: format(new Date(), 'yyyy-MM-dd')
                      }
                    });
                  }
                }}
                className={`text-xs md:text-sm px-2 md:px-3 transition-all duration-200 ${
                  isThisMonthActive()
                    ? 'bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-md'
                    : 'hover:bg-green-50 hover:border-green-300'
                }`}
              >
                This Month
              </Button>
              <Button
                variant={isLastMonthActive() ? 'default' : 'outline'}
                size='sm'
                onClick={() => {
                  if (isLastMonthActive()) {
                    // If already active, clear the filter
                    onFiltersChange({ date_range: undefined });
                  } else {
                    // Apply last month filter
                    onFiltersChange({
                      date_range: {
                        from: format(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1), 'yyyy-MM-dd'),
                        to: format(new Date(new Date().getFullYear(), new Date().getMonth(), 0), 'yyyy-MM-dd')
                      }
                    });
                  }
                }}
                className={`text-xs md:text-sm px-2 md:px-3 transition-all duration-200 ${
                  isLastMonthActive()
                    ? 'bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-md'
                    : 'hover:bg-green-50 hover:border-green-300'
                }`}
              >
                Last Month
              </Button>
              <Button
                variant={isShowAbsencesActive() ? 'default' : 'outline'}
                size='sm'
                onClick={() => {
                  if (isShowAbsencesActive()) {
                    // If already active, clear the filter
                    onFiltersChange({ status: 'all' });
                  } else {
                    // Apply absences filter
                    onFiltersChange({ status: 'absent' });
                  }
                }}
                className={`text-xs md:text-sm px-2 md:px-3 transition-all duration-200 ${
                  isShowAbsencesActive()
                    ? 'bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-md'
                    : 'hover:bg-green-50 hover:border-green-300'
                }`}
              >
                <span className='hidden sm:inline'>Show Absences</span>
                <span className='sm:hidden'>Absences</span>
              </Button>
            </div>

            {getActiveFiltersCount() > 0 && (
              <Button
                variant='ghost'
                size='sm'
                onClick={clearAllFilters}
                className='text-muted-foreground hover:text-foreground text-xs md:text-sm self-end sm:self-auto'
              >
                Clear All
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}