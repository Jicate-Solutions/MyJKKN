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
import { cn } from '@/lib/utils';

interface AttendanceReportHeaderProps {
  report?: AttendanceReportDetails;
  isLoading: boolean;
}

interface StaffInfo {
  id: string;
  name: string;
  email: string;
  isPrimary?: boolean;
}

export function AttendanceReportHeader({
  report,
  isLoading
}: AttendanceReportHeaderProps) {
  const [staffList, setStaffList] = useState<StaffInfo[]>([]);
  const [fetchingStaff, setFetchingStaff] = useState(false);
  const [timetableName, setTimetableName] = useState<string>('N/A');

  // Fetch staff information and timetable name when report is available
  useEffect(() => {
    const getStaffInfoAndTimetable = async () => {
      if (!report) return;

      setFetchingStaff(true);

      try {
        const supabase = createClientSupabaseClient();

        // We need to get timetable_id from the attendance record first
        const { data: attendanceRecord } = await supabase
          .from('student_attendance')
          .select('timetable_id')
          .eq('id', report.id)
          .single();

        if (!attendanceRecord?.timetable_id) {
          console.warn('No timetable_id found for attendance record');
          return;
        }

        // Fetch timetable information to get staff IDs and timetable name
        const { data: timetableData } = await supabase
          .from('timetables')
          .select('timetable_name, timetable_data')
          .eq('id', attendanceRecord.timetable_id)
          .single();

        if (timetableData) {
          setTimetableName(timetableData.timetable_name || 'N/A');

          // Find the specific period slot in timetable data
          const timetableDataObj = timetableData.timetable_data || {};
          let periodSlot = null;

          // Search through days and periods to find the matching period_id
          const periodIdToFind = report.period_data?.period_id;
          if (periodIdToFind) {
            for (const dayData of Object.values(timetableDataObj)) {
              if (typeof dayData === 'object' && dayData !== null) {
                for (const [slotKey, slotData] of Object.entries(dayData)) {
                  if (
                    typeof slotData === 'object' &&
                    slotData !== null &&
                    'slot_id' in slotData &&
                    slotData.slot_id === periodIdToFind
                  ) {
                    periodSlot = slotData;
                    break;
                  }
                }
                if (periodSlot) break;
              }
            }
          }

          if (
            periodSlot &&
            'staff_ids' in periodSlot &&
            Array.isArray(periodSlot.staff_ids)
          ) {
            const staffIds = periodSlot.staff_ids;
            const primaryStaffId =
              'primary_staff_id' in periodSlot
                ? periodSlot.primary_staff_id
                : null;

            if (staffIds.length > 0) {
              // Fetch staff information for all assigned staff
              const { data: staffData } = await supabase
                .from('staff')
                .select('id, first_name, last_name, email, institution_email')
                .in('id', staffIds)
                .eq('is_active', true);

              if (staffData && staffData.length > 0) {
                const staffInfoList: StaffInfo[] = staffData.map((staff) => ({
                  id: staff.id,
                  name:
                    `${staff.first_name || ''} ${
                      staff.last_name || ''
                    }`.trim() || 'Unknown Faculty',
                  email: staff.email || staff.institution_email || 'N/A',
                  isPrimary: staff.id === primaryStaffId
                }));

                // Sort to put primary staff first
                staffInfoList.sort(
                  (a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)
                );
                setStaffList(staffInfoList);
                return;
              }
            }
          }
        }

        // Fallback: Use attendance data faculty info if available
        if (report.faculty_name && report.faculty_name !== 'Unknown Faculty') {
          setStaffList([
            {
              id: 'attendance-data',
              name: report.faculty_name,
              email: report.faculty_email || 'N/A',
              isPrimary: true
            }
          ]);
          return;
        }

        // Final fallback: Use marked_by information
        if (typeof report.marked_by === 'object' && report.marked_by) {
          setStaffList([
            {
              id: 'marked-by',
              name: report.marked_by.full_name || 'Unknown Faculty',
              email: report.marked_by.email || 'N/A',
              isPrimary: true
            }
          ]);
        } else if (
          typeof report.marked_by === 'string' &&
          report.marked_by.includes('-')
        ) {
          // Fetch profile information for marked_by UUID
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', report.marked_by)
            .single();

          if (profile) {
            setStaffList([
              {
                id: report.marked_by,
                name: profile.full_name || 'Unknown Faculty',
                email: profile.email || 'N/A',
                isPrimary: true
              }
            ]);
          }
        }
      } catch (error) {
        console.error('Error fetching staff information:', error);
        // Set default staff info
        setStaffList([
          {
            id: 'default',
            name: 'Unknown Faculty',
            email: 'N/A',
            isPrimary: true
          }
        ]);
      } finally {
        setFetchingStaff(false);
      }
    };

    getStaffInfoAndTimetable();
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
        <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'>
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
      <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'>
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
              {fetchingStaff ? (
                <div className='space-y-3'>
                  <Skeleton className='h-5 w-32' />
                  <Skeleton className='h-4 w-40' />
                </div>
              ) : (
                <div className='space-y-3'>
                  {staffList.map((staff, index) => (
                    <div
                      key={staff.id}
                      className={cn(
                        'p-3 rounded-lg border',
                        staff.isPrimary
                          ? 'bg-purple-50 border-purple-200 dark:bg-purple-900/10 dark:border-purple-800'
                          : 'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700'
                      )}
                    >
                      <div className='flex items-start justify-between mb-2'>
                        <p className='font-medium text-gray-900 dark:text-gray-100 text-sm'>
                          {staff.name}
                        </p>
                        {staff.isPrimary && (
                          <Badge
                            variant='outline'
                            className='text-xs border-purple-300 text-purple-700 dark:border-purple-600 dark:text-purple-300'
                          >
                            Primary
                          </Badge>
                        )}
                      </div>
                      <div className='flex items-center gap-1'>
                        <Mail className='h-3 w-3 text-gray-400' />
                        <p className='text-xs text-gray-600 dark:text-gray-400 break-all'>
                          {staff.email}
                        </p>
                      </div>
                    </div>
                  ))}
                  {staffList.length === 0 && (
                    <p className='text-sm text-gray-500 dark:text-gray-400'>
                      No staff information available
                    </p>
                  )}
                </div>
              )}
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
              <div>
                <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>
                  Institution
                </p>
                <p className='font-medium text-gray-900 dark:text-gray-100 text-sm'>
                  {report.institution_name}
                </p>
              </div>
              <Separator />
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>
                    Section
                  </p>
                  <div className='flex items-center gap-2'>
                    <p className='font-medium text-gray-900 dark:text-gray-100 text-sm'>
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
                  <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>
                    Semester
                  </p>
                  <Badge
                    variant='secondary'
                    className='bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs'
                  >
                    <CalendarIcon className='h-3 w-3 mr-1' />
                    {report.semester_name}
                  </Badge>
                </div>
              </div>
              <Separator />
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>
                    Program
                  </p>
                  <p className='font-medium text-gray-900 dark:text-gray-100 text-sm'>
                    {report.program_name}
                  </p>
                </div>
                <div>
                  <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>
                    Department
                  </p>
                  <p className='font-medium text-gray-900 dark:text-gray-100 text-sm'>
                    {report.department_name || 'N/A'}
                  </p>
                </div>
              </div>
              <div>
                <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>
                  Degree
                </p>
                <p className='font-medium text-gray-900 dark:text-gray-100 text-sm'>
                  {report.degree_name || 'N/A'}
                </p>
              </div>
              <Separator />
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

        {/* Timetable & Schedule Information Card */}
        <Card className='hover:shadow-lg transition-shadow duration-200'>
          <CardContent className='p-6'>
            <div className='flex items-center gap-3 mb-4'>
              <div className='p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/20'>
                <FileText className='h-5 w-5 text-indigo-600 dark:text-indigo-400' />
              </div>
              <h3 className='font-semibold text-gray-900 dark:text-gray-100'>
                Timetable & Schedule
              </h3>
            </div>
            <div className='space-y-3'>
              <div>
                <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>
                  Timetable
                </p>
                <p className='font-medium text-gray-900 dark:text-gray-100 text-sm'>
                  {timetableName}
                </p>
              </div>
              <div>
                <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>
                  Academic Year
                </p>
                <p className='font-medium text-gray-900 dark:text-gray-100 text-sm'>
                  {report.academic_year_name || '2025-2026'}
                </p>
              </div>
              <div>
                <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>
                  Class Schedule
                </p>
                <div className='flex items-center gap-2'>
                  <p className='font-medium text-gray-900 dark:text-gray-100 text-sm'>
                    Period {report.period_name}
                  </p>
                  <Badge variant='outline' className='text-xs'>
                    {formatTimeRange(report.start_time, report.end_time)}
                  </Badge>
                </div>
              </div>
              <Separator />
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-1'>
                  <Target className='h-4 w-4 text-gray-400' />
                  <p className='text-sm text-gray-500 dark:text-gray-400'>
                    Attendance Summary
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
