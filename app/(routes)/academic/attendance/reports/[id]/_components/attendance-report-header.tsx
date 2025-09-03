'use client';

import { useState, useEffect } from 'react';
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
  UserCheck,
  Calendar as CalendarIcon,
  FileText,
  Target
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { AttendanceReportDetails } from '@/lib/services/academic/attendance-analytics-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { formatTimeRange } from '@/utils/time-format';

interface AttendanceReportHeaderProps {
  report?: AttendanceReportDetails;
  isLoading: boolean;
}

export function AttendanceReportHeader({
  report,
  isLoading
}: AttendanceReportHeaderProps) {
  const [facultyInfo, setFacultyInfo] = useState({
    name: 'Unknown Faculty',
    email: 'N/A'
  });
  const [fetchingFaculty, setFetchingFaculty] = useState(false);

  // Fetch faculty information when report is available
  useEffect(() => {
    const getFacultyInfo = async () => {
      if (!report) return;

      // If we have proper faculty information from attendance_data, use it
      if (
        report.faculty_name &&
        report.faculty_name !== 'Unknown Faculty' &&
        report.faculty_name.trim()
      ) {
        setFacultyInfo({
          name: report.faculty_name,
          email: report.faculty_email || 'N/A'
        });
        return;
      }

      // Fallback to marked_by information if available
      if (typeof report.marked_by === 'object' && report.marked_by) {
        setFacultyInfo({
          name: report.marked_by.full_name || 'Unknown Faculty',
          email: report.marked_by.email || 'N/A'
        });
        return;
      }

      // If marked_by is a UUID, try to fetch the profile and staff information
      if (
        typeof report.marked_by === 'string' &&
        report.marked_by &&
        report.marked_by.includes('-')
      ) {
        setFetchingFaculty(true);
        try {
          const supabase = createClientSupabaseClient();

          // First try to get profile information
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', report.marked_by)
            .single();

          if (profile) {
            let facultyName = profile.full_name || 'Unknown Faculty';
            let facultyEmail = profile.email || 'N/A';

            // Try to get staff information for better details
            try {
              const { data: staffData } = await supabase
                .from('staff')
                .select('first_name, last_name, email, institution_email')
                .or(
                  `email.eq.${profile.email},institution_email.eq.${profile.email}`
                )
                .eq('is_active', true)
                .single();

              if (staffData) {
                const staffFullName = `${staffData.first_name || ''} ${
                  staffData.last_name || ''
                }`.trim();
                if (staffFullName) {
                  facultyName = staffFullName;
                }
                facultyEmail =
                  staffData.email ||
                  staffData.institution_email ||
                  facultyEmail;
              }
            } catch (staffError) {
              console.warn(
                'Could not fetch staff details, using profile data:',
                staffError
              );
            }

            setFacultyInfo({
              name: facultyName,
              email: facultyEmail
            });
            return;
          }
        } catch (error) {
          console.error('Error fetching faculty information:', error);
        } finally {
          setFetchingFaculty(false);
        }
      }

      // Fallback to marked_by string if it looks like a name (not a UUID)
      if (
        typeof report.marked_by === 'string' &&
        report.marked_by &&
        !report.marked_by.includes('-')
      ) {
        setFacultyInfo({
          name: report.marked_by,
          email: 'N/A'
        });
        return;
      }

      // Final fallback
      setFacultyInfo({
        name: 'Unknown Faculty',
        email: 'N/A'
      });
    };

    getFacultyInfo();
  }, [report]);

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
                    {format(
                      new Date(report.attendance_date),
                      'EEEE, dd MMMM yyyy'
                    )}
                  </span>
                </div>
                <div className='flex items-center gap-1.5'>
                  <Clock className='h-4 w-4 text-blue-600' />
                  <span className='font-medium'>
                    {formatTimeRange(report.start_time, report.end_time)}
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
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
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
                {fetchingFaculty ? (
                  <Skeleton className='h-5 w-32' />
                ) : (
                  <p className='font-medium text-gray-900 dark:text-gray-100'>
                    {facultyInfo.name}
                  </p>
                )}
              </div>
              <div>
                <p className='text-sm text-gray-500 dark:text-gray-400'>
                  Email
                </p>
                {fetchingFaculty ? (
                  <Skeleton className='h-4 w-40' />
                ) : (
                  <div className='flex items-center gap-1'>
                    <Mail className='h-3 w-3 text-gray-400' />
                    <p className='text-sm font-medium text-gray-700 dark:text-gray-300 break-all'>
                      {facultyInfo.email}
                    </p>
                  </div>
                )}
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
                <p className='text-sm text-gray-500 dark:text-gray-400'>
                  Program
                </p>
                <p className='font-medium text-gray-900 dark:text-gray-100'>
                  {report.program_name}
                </p>
              </div>
              <div className='flex items-center justify-between'>
                <p className='text-sm text-gray-500 dark:text-gray-400'>
                  Department
                </p>
                <p className='font-medium text-gray-900 dark:text-gray-100'>
                  {report.department_name || 'N/A'}
                </p>
              </div>
              <div className='flex items-center justify-between'>
                <p className='text-sm text-gray-500 dark:text-gray-400'>
                  Degree
                </p>
                <p className='font-medium text-gray-900 dark:text-gray-100'>
                  {report.degree_name || 'N/A'}
                </p>
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
                <p className='text-sm text-gray-500 dark:text-gray-400'>
                  Section
                </p>
                <div className='flex items-center gap-2'>
                  <p className='font-medium text-gray-900 dark:text-gray-100'>
                    {report.section_name}
                  </p>
                  {report.section_code &&
                    report.section_code !== report.section_name && (
                      <Badge variant='outline' className='text-xs'>
                        {report.section_code}
                      </Badge>
                    )}
                </div>
              </div>
              <div>
                <p className='text-sm text-gray-500 dark:text-gray-400'>
                  Institution
                </p>
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

        {/* Timetable & Semester Information Card */}
        <Card className='hover:shadow-lg transition-shadow duration-200'>
          <CardContent className='p-6'>
            <div className='flex items-center gap-3 mb-4'>
              <div className='p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/20'>
                <FileText className='h-5 w-5 text-indigo-600 dark:text-indigo-400' />
              </div>
              <h3 className='font-semibold text-gray-900 dark:text-gray-100'>
                Timetable & Semester
              </h3>
            </div>
            <div className='space-y-3'>
              <div>
                <p className='text-sm text-gray-500 dark:text-gray-400'>
                  Academic Year
                </p>
                <p className='font-medium text-gray-900 dark:text-gray-100'>
                  {report.academic_year_name || '2025-2026'}
                </p>
              </div>
              <div>
                <p className='text-sm text-gray-500 dark:text-gray-400'>
                  Semester
                </p>
                <Badge variant='secondary' className='bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200'>
                  <CalendarIcon className='h-3 w-3 mr-1' />
                  {report.semester_name}
                </Badge>
              </div>
              <div>
                <p className='text-sm text-gray-500 dark:text-gray-400'>
                  Class Schedule
                </p>
                <p className='font-medium text-gray-900 dark:text-gray-100'>
                  Period {report.period_name}
                </p>
              </div>
              <Separator className='my-2' />
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-1'>
                  <Target className='h-4 w-4 text-gray-400' />
                  <p className='text-sm text-gray-500 dark:text-gray-400'>
                    Attendance
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <span className='text-sm font-medium text-green-600 dark:text-green-400'>
                    {report.present_count} Present
                  </span>
                  <span className='text-sm font-medium text-red-600 dark:text-red-400'>
                    {report.absent_count} Absent
                  </span>
                </div>
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
                  {typeof report.marked_by === 'object' && report.marked_by
                    ? report.marked_by.full_name ||
                      report.marked_by.email ||
                      'Unknown'
                    : report.marked_by || 'Unknown'}
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
                  {format(new Date(report.marked_at), 'dd MMM yyyy, hh:mm a')}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
