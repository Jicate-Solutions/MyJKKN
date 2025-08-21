'use client';

import { format } from 'date-fns';
import {
  Calendar,
  Clock,
  MapPin,
  BookOpen,
  Users,
  GraduationCap,
  Building2,
  User,
  Mail,
  Hash,
  CheckCircle2,
  School,
  UserCheck
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { AttendanceReportDetails } from '@/lib/services/academic/attendance-analytics-service';

interface AttendanceReportHeaderProps {
  report?: AttendanceReportDetails;
  isLoading: boolean;
}

export function AttendanceReportHeader({
  report,
  isLoading
}: AttendanceReportHeaderProps) {
  if (isLoading || !report) {
    return (
      <div className='space-y-6'>
        {/* Loading State - Hero Section */}
        <Card className='bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200/50'>
          <CardHeader className='pb-4'>
            <div className='space-y-3'>
              <Skeleton className='h-8 w-3/4' />
              <div className='flex gap-4'>
                <Skeleton className='h-6 w-48' />
                <Skeleton className='h-6 w-36' />
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Loading State - Info Cards */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index}>
              <CardContent className='p-6'>
                <Skeleton className='h-5 w-24 mb-3' />
                <div className='space-y-2'>
                  <Skeleton className='h-4 w-full' />
                  <Skeleton className='h-4 w-3/4' />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Hero Section with Course Info */}
      <Card className='bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200/50 shadow-lg'>
        <CardHeader className='pb-4'>
          <div className='flex flex-col md:flex-row md:items-start md:justify-between gap-4'>
            <div className='space-y-3'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-blue-600 text-white'>
                  <BookOpen className='h-6 w-6' />
                </div>
                <div>
                  <CardTitle className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
                    {report.course_name}
                  </CardTitle>
                  <div className='flex items-center gap-2 mt-1'>
                    <Badge className='bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'>
                      <Hash className='h-3 w-3 mr-1' />
                      {report.course_code}
                    </Badge>
                    <Badge variant='outline' className='border-blue-300'>
                      {report.period_name}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className='flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400'>
                <div className='flex items-center gap-1.5'>
                  <Calendar className='h-4 w-4 text-blue-600' />
                  <span className='font-medium'>
                    {format(new Date(report.attendance_date), 'EEEE, dd MMMM yyyy')}
                  </span>
                </div>
                <div className='flex items-center gap-1.5'>
                  <Clock className='h-4 w-4 text-blue-600' />
                  <span className='font-medium'>
                    {report.start_time} - {report.end_time}
                  </span>
                </div>
              </div>
            </div>

            {/* Attendance Stats Badge */}
            <div className='flex items-center gap-2'>
              <div className='text-center p-3 rounded-lg bg-white dark:bg-gray-800 shadow-sm border'>
                <div className='text-2xl font-bold text-blue-600'>
                  {report.attendance_percentage}%
                </div>
                <div className='text-xs text-gray-500 uppercase tracking-wider mt-1'>
                  Attendance
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Info Cards Grid */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
        {/* Faculty Information Card */}
        <Card className='hover:shadow-lg transition-shadow duration-200'>
          <CardContent className='p-6'>
            <div className='flex items-center gap-3 mb-4'>
              <div className='p-2 rounded-lg bg-purple-100 dark:bg-purple-900/20'>
                <User className='h-5 w-5 text-purple-600 dark:text-purple-400' />
              </div>
              <h3 className='font-semibold text-gray-900 dark:text-gray-100'>
                Faculty Information
              </h3>
            </div>
            <div className='space-y-3'>
              <div>
                <p className='text-sm text-gray-500 dark:text-gray-400'>Name</p>
                <p className='font-medium text-gray-900 dark:text-gray-100'>
                  {report.faculty_name}
                </p>
              </div>
              <div>
                <p className='text-sm text-gray-500 dark:text-gray-400'>Email</p>
                <div className='flex items-center gap-1'>
                  <Mail className='h-3 w-3 text-gray-400' />
                  <p className='text-sm font-medium text-gray-700 dark:text-gray-300 break-all'>
                    {report.faculty_email}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Academic Information Card */}
        <Card className='hover:shadow-lg transition-shadow duration-200'>
          <CardContent className='p-6'>
            <div className='flex items-center gap-3 mb-4'>
              <div className='p-2 rounded-lg bg-green-100 dark:bg-green-900/20'>
                <GraduationCap className='h-5 w-5 text-green-600 dark:text-green-400' />
              </div>
              <h3 className='font-semibold text-gray-900 dark:text-gray-100'>
                Academic Details
              </h3>
            </div>
            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <p className='text-sm text-gray-500 dark:text-gray-400'>Program</p>
                <p className='font-medium text-gray-900 dark:text-gray-100'>
                  {report.program_name}
                </p>
              </div>
              <div className='flex items-center justify-between'>
                <p className='text-sm text-gray-500 dark:text-gray-400'>Department</p>
                <p className='font-medium text-gray-900 dark:text-gray-100'>
                  {report.department_name || 'N/A'}
                </p>
              </div>
              <div className='flex items-center justify-between'>
                <p className='text-sm text-gray-500 dark:text-gray-400'>Semester</p>
                <Badge variant='secondary'>{report.semester_name}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section & Institution Card */}
        <Card className='hover:shadow-lg transition-shadow duration-200'>
          <CardContent className='p-6'>
            <div className='flex items-center gap-3 mb-4'>
              <div className='p-2 rounded-lg bg-orange-100 dark:bg-orange-900/20'>
                <Building2 className='h-5 w-5 text-orange-600 dark:text-orange-400' />
              </div>
              <h3 className='font-semibold text-gray-900 dark:text-gray-100'>
                Section & Institution
              </h3>
            </div>
            <div className='space-y-3'>
              <div>
                <p className='text-sm text-gray-500 dark:text-gray-400'>Section</p>
                <div className='flex items-center gap-2'>
                  <p className='font-medium text-gray-900 dark:text-gray-100'>
                    {report.section_name}
                  </p>
                  {report.section_code && report.section_code !== report.section_name && (
                    <Badge variant='outline' className='text-xs'>
                      {report.section_code}
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <p className='text-sm text-gray-500 dark:text-gray-400'>Institution</p>
                <p className='font-medium text-gray-900 dark:text-gray-100 text-sm'>
                  {report.institution_name}
                </p>
              </div>
              <Separator className='my-2' />
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-1'>
                  <Users className='h-4 w-4 text-gray-400' />
                  <p className='text-sm text-gray-500 dark:text-gray-400'>
                    Total Students
                  </p>
                </div>
                <p className='font-bold text-lg text-gray-900 dark:text-gray-100'>
                  {report.total_students}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Marking Information Bar */}
      <Card className='bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'>
        <CardContent className='p-4'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
            <div className='flex items-center gap-3'>
              <div className='p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700'>
                <UserCheck className='h-4 w-4 text-gray-600 dark:text-gray-400' />
              </div>
              <div>
                <p className='text-sm text-gray-500 dark:text-gray-400'>
                  Attendance Marked By
                </p>
                <p className='font-medium text-gray-900 dark:text-gray-100'>
                  {report.marked_by}
                </p>
              </div>
            </div>
            <div className='flex items-center gap-3'>
              <div className='p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700'>
                <CheckCircle2 className='h-4 w-4 text-gray-600 dark:text-gray-400' />
              </div>
              <div>
                <p className='text-sm text-gray-500 dark:text-gray-400'>
                  Marked On
                </p>
                <p className='font-medium text-gray-900 dark:text-gray-100'>
                  {format(new Date(report.marked_at), 'dd MMM yyyy, HH:mm')}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}