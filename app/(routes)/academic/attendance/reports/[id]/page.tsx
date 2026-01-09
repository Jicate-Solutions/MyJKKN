'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import {
  FileText,
  Download,
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  UserCheck,
  UserX,
  BookOpen,
  Printer,
  Share2,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  User,
  Mail,
  ChevronRight,
  Search,
  ArrowUpDown
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { AttendanceReportService } from '@/lib/services/academic/attendance-report-service';
import { AttendanceExportService } from '@/lib/services/academic/attendance-export-service';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import type { DetailedAttendanceReport } from '@/types/attendance-reports';

// Color scheme constants - Using primary (blue), success (green), danger (red)
const COLORS = {
  primary: 'blue',
  success: 'green',
  danger: 'red',
  neutral: 'gray'
};

// Helper function to convert 24-hour time to 12-hour format
const convertTo12Hour = (time24: string) => {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minutes} ${ampm}`;
};

export default function AttendanceReportDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();

  const reportId = params.id as string;

  // State
  const [report, setReport] = useState<DetailedAttendanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [periodSearchTerm, setPeriodSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'name' | 'roll' | 'status'>(
    'name'
  );
  const [facultyStaffId, setFacultyStaffId] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  // Determine user role
  const userRole = useMemo(() => {
    if (isSuperAdmin || profile?.is_super_admin) return 'super_admin';
    if (profile?.role === 'admin') return 'admin';
    return 'faculty';
  }, [isSuperAdmin, profile?.role, profile?.is_super_admin]);

  // Fetch staff ID for faculty users
  useEffect(() => {
    const fetchStaffId = async () => {
      if (profile?.role === 'faculty' && profile?.id) {
        setRoleLoading(true);
        const supabase = createClientSupabaseClient();
        const { data, error } = await supabase
          .from('staff')
          .select('id')
          .eq('profile_id', profile.id)
          .single();

        if (data && !error) {
          const staffData = data as { id: string };
          setFacultyStaffId(staffData.id);
        }
        setRoleLoading(false);
      }
    };

    fetchStaffId();
  }, [profile]);

  // Determine if we should delay showing data for faculty users
  const isRegularFaculty =
    userRole === 'faculty' && !isSuperAdmin && profile?.role === 'faculty';
  const shouldWaitForRole =
    isRegularFaculty && profile?.id && !facultyStaffId && roleLoading;

  // Fetch report details
  const fetchReportDetails = useCallback(async () => {
    if (!reportId) return;
    if (shouldWaitForRole) return; // Wait for staff ID to be fetched for faculty users

    try {
      setLoading(true);
      const { data, error } = await AttendanceReportService.getReportDetails(
        reportId,
        userRole,
        profile?.id
      );

      if (error) {
        toast.error('Failed to fetch report details');
        router.push('/academic/attendance/reports');
        return;
      }

      if (!data) {
        toast.error('Report not found');
        router.push('/academic/attendance/reports');
        return;
      }

      const reportData = data as DetailedAttendanceReport;
      setReport(reportData);
      // Default select first period
      if (reportData.period_details && reportData.period_details.length > 0) {
        setSelectedPeriod(reportData.period_details[0].period_id);
      }
    } catch (error) {
      toast.error('An error occurred while fetching the report');
      router.push('/academic/attendance/reports');
    } finally {
      setLoading(false);
    }
  }, [reportId, userRole, profile?.id, router, shouldWaitForRole]);

  useEffect(() => {
    fetchReportDetails();
  }, [fetchReportDetails]);

  // Handle export
  const handleExport = async (format: 'pdf' | 'excel') => {
    if (!report) {
      toast.error('No report data to export');
      return;
    }

    try {
      toast.loading(`Exporting as ${format.toUpperCase()}...`);
      let result;
      if (format === 'excel') {
        result = await AttendanceExportService.exportDetailedToExcel(
          report,
          'attendance-detail'
        );
      } else {
        result = await AttendanceExportService.exportDetailedToPDF(
          report,
          'attendance-detail'
        );
      }

      if (result.success) {
        toast.success(`Successfully exported to ${format.toUpperCase()}`);
      } else {
        toast.error(`Failed to export: ${result.error}`);
      }
    } catch (error) {
      toast.error('An error occurred during export');
    }
  };

  if (loading || shouldWaitForRole) {
    return (
      <ContentLayout title='Loading Report...'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-blue-600 dark:text-blue-400' />
          <span className='ml-2 dark:text-gray-200'>
            {shouldWaitForRole
              ? 'Preparing your data...'
              : 'Loading report details...'}
          </span>
        </div>
      </ContentLayout>
    );
  }

  if (!report) {
    return null;
  }

  const stats = {
    total: report.total_students,
    present: report.total_present,
    absent: report.total_absent,
    percentage: report.average_attendance
  };

  return (
    <ContentLayout title='Attendance Report Details'>
      <Breadcrumb className='print:hidden'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic'>Academic</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic/attendance'>Attendance</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic/attendance/reports'>Reports</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-6'>
        {/* Header Actions */}
        <div className='flex items-center justify-between print:hidden'>
          <Button
            variant='ghost'
            onClick={() => router.push('/academic/attendance/reports')}
          >
            <ArrowLeft className='h-4 w-4 mr-2' />
            Back to Reports
          </Button>
          <div className='flex gap-2'>
            <Button variant='outline' size='sm' onClick={() => window.print()}>
              <Printer className='h-4 w-4 mr-2' />
              Print
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                toast.success('Report link copied to clipboard');
              }}
            >
              <Share2 className='h-4 w-4 mr-2' />
              Share
            </Button>
            {isSuperAdmin && (
              <>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => handleExport('pdf')}
                >
                  <Download className='h-4 w-4 mr-2' />
                  PDF
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => handleExport('excel')}
                >
                  <Download className='h-4 w-4 mr-2' />
                  Excel
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Main Report Header - Clean and Professional */}
        <Card className='border-0 shadow-lg'>
          <CardHeader className='bg-blue-600 text-white p-6'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-4'>
                <div className='p-3 bg-white/20 rounded-lg backdrop-blur'>
                  <FileText className='h-8 w-8 text-white' />
                </div>
                <div>
                  <h1 className='text-2xl font-bold'>Attendance Report</h1>
                  <div className='flex items-center gap-4 mt-2 text-blue-100'>
                    <span className='flex items-center gap-2'>
                      <Calendar className='h-4 w-4' />
                      {format(
                        new Date(report.attendance_date),
                        'EEEE, MMMM do, yyyy'
                      )}
                    </span>
                    <span className='flex items-center gap-2'>
                      <Clock className='h-4 w-4' />
                      {report.period_details.length} Periods
                    </span>
                  </div>
                </div>
              </div>
              <div
                className={`px-6 py-3 rounded-full font-bold text-lg ${
                  report.average_attendance >= 75
                    ? 'bg-green-500'
                    : 'bg-red-500'
                } text-white`}
              >
                {report.average_attendance.toFixed(1)}%
              </div>
            </div>
          </CardHeader>

          {/* Key Statistics - Clean Layout */}
          <CardContent className='p-6'>
            <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
              <div className='bg-gray-50 dark:bg-gray-800 p-4 rounded-lg'>
                <div className='flex items-center gap-3'>
                  <Users className='h-5 w-5 text-blue-600 dark:text-blue-400' />
                  <div>
                    <p className='text-sm text-gray-600 dark:text-gray-400'>Total Students</p>
                    <p className='text-2xl font-bold dark:text-white'>{stats.total}</p>
                  </div>
                </div>
              </div>

              <div className='bg-green-50 dark:bg-green-900/20 p-4 rounded-lg'>
                <div className='flex items-center gap-3'>
                  <UserCheck className='h-5 w-5 text-green-600 dark:text-green-400' />
                  <div>
                    <p className='text-sm text-gray-600 dark:text-gray-400'>Present</p>
                    <p className='text-2xl font-bold text-green-600 dark:text-green-400'>
                      {stats.present}
                    </p>
                  </div>
                </div>
              </div>

              <div className='bg-red-50 dark:bg-red-900/20 p-4 rounded-lg'>
                <div className='flex items-center gap-3'>
                  <UserX className='h-5 w-5 text-red-600 dark:text-red-400' />
                  <div>
                    <p className='text-sm text-gray-600 dark:text-gray-400'>Absent</p>
                    <p className='text-2xl font-bold text-red-600 dark:text-red-400'>
                      {stats.absent}
                    </p>
                  </div>
                </div>
              </div>

              <div className='bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg'>
                <div className='flex items-center gap-3'>
                  <AlertTriangle className='h-5 w-5 text-blue-600 dark:text-blue-400' />
                  <div>
                    <p className='text-sm text-gray-600 dark:text-gray-400'>Attendance Rate</p>
                    <p className='text-2xl font-bold text-blue-600 dark:text-blue-400'>
                      {stats.percentage.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Academic Information - Simplified */}
            <div className='mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg'>
              <div className='grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4'>
                <div>
                  <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>Institution</p>
                  <p className='font-semibold text-sm dark:text-gray-200'>
                    {report.institution_name || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>Department</p>
                  <p className='font-semibold text-sm dark:text-gray-200'>
                    {report.department_name || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>Degree</p>
                  <p className='font-semibold text-sm dark:text-gray-200'>
                    {report.degree_name || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>Program</p>
                  <p className='font-semibold text-sm dark:text-gray-200'>
                    {report.program_name || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>Section</p>
                  <p className='font-semibold text-sm dark:text-gray-200'>
                    {/* Updated: 2025-10-09 - Display all sections for semester-level timetables */}
                    {report.section_names && report.section_names.length > 1
                      ? `Sections ${report.section_names.join(', ')}`
                      : report.section_name || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>Semester</p>
                  <p className='font-semibold text-sm dark:text-gray-200'>
                    {report.semester_name || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>Academic Year</p>
                  <p className='font-semibold text-sm dark:text-gray-200'>
                    {report.academic_year_name || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>Timetable</p>
                  <div className='flex items-center gap-2'>
                    <p className='font-semibold text-sm dark:text-gray-200'>
                      {report.timetable_name ||
                        `TT-${report.timetable_id?.slice(0, 8) || 'N/A'}`}
                    </p>
                    {report.timetable_type && (
                      <Badge
                        variant='outline'
                        className={
                          report.timetable_type === 'semester'
                            ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700 text-xs'
                            : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 text-xs'
                        }
                      >
                        {report.timetable_type === 'semester'
                          ? 'Semester Level'
                          : 'Section Level'}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Period-wise Analysis - New Design */}
        <Card className='border-0 shadow-lg'>
          <CardHeader className='bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700'>
            <CardTitle className='flex items-center gap-2 dark:text-gray-100'>
              <Clock className='h-5 w-5 text-blue-600 dark:text-blue-400' />
              Period-wise Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className='p-6'>
            {/* Period Selection Cards */}
            <div className='mb-6'>
              <h3 className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-3'>
                Select a period to view details:
              </h3>
              <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3'>
                {report.period_details.map((period, index) => {
                  const isSelected = selectedPeriod === period.period_id;
                  return (
                    <Card
                      key={period.period_id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        isSelected
                          ? 'ring-2 ring-blue-500 dark:ring-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-400'
                          : 'hover:border-blue-300 dark:hover:border-blue-600'
                      }`}
                      onClick={() =>
                        setSelectedPeriod(isSelected ? null : period.period_id)
                      }
                    >
                      <CardContent className='p-4'>
                        <div className='flex flex-col items-center text-center space-y-2'>
                          <div className='text-lg font-semibold dark:text-gray-100'>
                            {period.period_name ||
                              `Period ${period.period_number || index + 1}`}
                          </div>
                          <div className='text-xs text-gray-600 dark:text-gray-400'>
                            {convertTo12Hour(period.start_time)} -{' '}
                            {convertTo12Hour(period.end_time)}
                          </div>
                          <div className='w-full space-y-1'>
                            <div
                              className={`text-2xl font-bold ${
                                period.attendance_percentage >= 75
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {period.attendance_percentage.toFixed(1)}%
                            </div>
                            <div className='text-xs text-gray-500 dark:text-gray-400'>
                              {period.present_count}/{period.total_count}{' '}
                              Present
                            </div>
                          </div>
                          {isSelected && (
                            <ChevronRight className='h-4 w-4 text-blue-600 dark:text-blue-400 animate-pulse' />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Selected Period Details */}
            {selectedPeriod &&
              (() => {
                const period = report.period_details.find(
                  (p) => p.period_id === selectedPeriod
                );
                if (!period) return null;
                const periodIndex = report.period_details.findIndex(
                  (p) => p.period_id === selectedPeriod
                );

                return (
                  <div className='space-y-6'>
                    {/* Period Information Card - Redesigned */}
                    <Card className='overflow-hidden border-0 shadow-xl'>
                      <CardHeader className='bg-gradient-to-r from-blue-600 to-blue-700 text-white p-5'>
                        <CardTitle className='flex items-center justify-between text-xl'>
                          <div className='flex items-center gap-3'>
                            <div className='p-2 bg-white/20 rounded-lg'>
                              <Clock className='h-5 w-5' />
                            </div>
                            <span>
                              {period.period_name ||
                                `Period ${
                                  period.period_number || periodIndex + 1
                                }`}
                            </span>
                          </div>
                          <Badge className='bg-white/90 text-blue-700 px-4 py-2 text-sm font-semibold'>
                            {convertTo12Hour(period.start_time)} -{' '}
                            {convertTo12Hour(period.end_time)}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className='p-0'>
                        {/* Top Section - Course & Faculty Info */}
                        <div className='grid grid-cols-1 lg:grid-cols-3 border-b'>
                          {/* Course Information */}
                          <div className='p-6 border-r border-gray-100'>
                            <div className='flex items-start gap-3'>
                              <div className='p-2 bg-blue-100 rounded-lg'>
                                <BookOpen className='h-5 w-5 text-blue-600' />
                              </div>
                              <div className='flex-1'>
                                <h4 className='text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2'>
                                  Course Information
                                </h4>
                                <p className='font-bold text-gray-900 text-lg'>
                                  {period.course_name || 'Not Available'}
                                </p>
                                <p className='text-sm text-gray-600 mt-1'>
                                  Code:{' '}
                                  <span className='font-medium'>
                                    {period.course_code || 'N/A'}
                                  </span>
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Faculty Information */}
                          <div className='p-6 border-r border-gray-100'>
                            <div className='flex items-start gap-3'>
                              <div className='p-2 bg-green-100 rounded-lg'>
                                <User className='h-5 w-5 text-green-600' />
                              </div>
                              <div className='flex-1'>
                                <h4 className='text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2'>
                                  Assigned Faculty
                                </h4>
                                {period.faculty && period.faculty.length > 0 ? (
                                  <div className='space-y-2'>
                                    {period.faculty.map((f, idx) => (
                                      <div key={idx}>
                                        <p className='font-bold text-gray-900'>
                                          {f.faculty_name}
                                        </p>
                                        {f.faculty_email && (
                                          <p className='text-xs text-gray-600 flex items-center gap-1 mt-1'>
                                            <Mail className='h-3 w-3' />
                                            {f.faculty_email}
                                          </p>
                                        )}
                                        {f.is_primary && (
                                          <Badge className='bg-green-100 text-green-700 border-0 text-xs mt-1'>
                                            Primary Faculty
                                          </Badge>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className='text-gray-500'>Not Assigned</p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Marked By Information */}
                          <div className='p-6'>
                            <div className='flex items-start gap-3'>
                              <div className='p-2 bg-purple-100 rounded-lg'>
                                <UserCheck className='h-5 w-5 text-purple-600' />
                              </div>
                              <div className='flex-1'>
                                <h4 className='text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2'>
                                  Marked By
                                </h4>
                                {period.marked_by_details ? (
                                  <div>
                                    <p className='font-bold text-gray-900'>
                                      {period.marked_by_details.marker_name}
                                    </p>
                                    <p className='text-xs text-gray-600 mt-1'>
                                      {period.marked_by_details.marker_role}
                                    </p>
                                    <p className='text-xs text-gray-600 flex items-center gap-1 mt-1'>
                                      <Mail className='h-3 w-3' />
                                      {period.marked_by_details.marker_email}
                                    </p>
                                    {period.marked_by_details.marked_at && (
                                      <p className='text-xs text-gray-600 flex items-center gap-1 mt-1'>
                                        <Clock className='h-3 w-3' />
                                        {format(new Date(period.marked_by_details.marked_at), 'MMM dd, yyyy hh:mm a')}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <p className='text-gray-500'>
                                    Information not available
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Bottom Section - Attendance Statistics */}
                        <div className='bg-gray-50 p-6'>
                          <div className='grid grid-cols-3 gap-4 mb-6'>
                            <div className='bg-white p-4 rounded-xl shadow-sm border border-gray-100'>
                              <div className='flex items-center justify-between'>
                                <div>
                                  <p className='text-3xl font-bold text-gray-900'>
                                    {period.total_count}
                                  </p>
                                  <p className='text-sm text-gray-500 mt-1'>
                                    Total Students
                                  </p>
                                </div>
                                <div className='p-3 bg-blue-100 rounded-full'>
                                  <Users className='h-6 w-6 text-blue-600' />
                                </div>
                              </div>
                            </div>

                            <div className='bg-white p-4 rounded-xl shadow-sm border border-green-200'>
                              <div className='flex items-center justify-between'>
                                <div>
                                  <p className='text-3xl font-bold text-green-600'>
                                    {period.present_count}
                                  </p>
                                  <p className='text-sm text-gray-500 mt-1'>
                                    Present
                                  </p>
                                </div>
                                <div className='p-3 bg-green-100 rounded-full'>
                                  <UserCheck className='h-6 w-6 text-green-600' />
                                </div>
                              </div>
                            </div>

                            <div className='bg-white p-4 rounded-xl shadow-sm border border-red-200'>
                              <div className='flex items-center justify-between'>
                                <div>
                                  <p className='text-3xl font-bold text-red-600'>
                                    {period.absent_count}
                                  </p>
                                  <p className='text-sm text-gray-500 mt-1'>
                                    Absent
                                  </p>
                                </div>
                                <div className='p-3 bg-red-100 rounded-full'>
                                  <UserX className='h-6 w-6 text-red-600' />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Attendance Progress Bar */}
                          <div className='bg-white p-4 rounded-xl shadow-sm border border-gray-100'>
                            <div className='flex items-center justify-between mb-3'>
                              <span className='text-sm font-semibold text-gray-700'>
                                Attendance Rate
                              </span>
                              <span
                                className={`text-2xl font-bold ${
                                  period.attendance_percentage >= 75
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }`}
                              >
                                {period.attendance_percentage.toFixed(1)}%
                              </span>
                            </div>
                            <div className='relative'>
                              <Progress
                                value={period.attendance_percentage}
                                className='h-5'
                              />
                              <div className='absolute inset-0 flex items-center justify-center'>
                                <span className='text-xs font-medium text-white'>
                                  {period.present_count} of {period.total_count}{' '}
                                  students present
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Student Attendance Table */}
                    <Card>
                      <CardHeader className='bg-gray-50 border-b'>
                        <div className='flex items-center justify-between'>
                          <CardTitle className='text-lg flex items-center gap-2'>
                            <Users className='h-5 w-5' />
                            Student Attendance List -{' '}
                            {period.period_name ||
                              `Period ${
                                period.period_number || periodIndex + 1
                              }`}
                          </CardTitle>
                          <div className='flex items-center gap-2'>
                            <div className='relative'>
                              <Search className='absolute left-3 top-2.5 h-4 w-4 text-gray-400' />
                              <input
                                type='text'
                                placeholder='Search students...'
                                className='pl-10 pr-4 py-2 border rounded-lg text-sm w-64'
                                value={periodSearchTerm}
                                onChange={(e) =>
                                  setPeriodSearchTerm(e.target.value)
                                }
                              />
                            </div>
                            <select
                              className='px-4 py-2 border rounded-lg text-sm'
                              value={sortOrder}
                              onChange={(e) =>
                                setSortOrder(e.target.value as any)
                              }
                            >
                              <option value='name'>Sort by Name</option>
                              <option value='roll'>Sort by Roll No</option>
                              <option value='status'>Sort by Status</option>
                            </select>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className='p-0'>
                        <div className='overflow-x-auto px-4'>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className='w-16'>S.No</TableHead>
                                <TableHead>Student Name</TableHead>
                                <TableHead>Roll Number</TableHead>
                                <TableHead>Section</TableHead>
                                <TableHead className='text-center'>
                                  Status
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {period.students && period.students.length > 0 ? (
                                (() => {
                                  // Filter students based on search
                                  let filteredStudents = period.students.filter(
                                    (student) => {
                                      if (!periodSearchTerm) return true;
                                      const searchLower =
                                        periodSearchTerm.toLowerCase();
                                      return (
                                        student.student_name
                                          .toLowerCase()
                                          .includes(searchLower) ||
                                        (student.roll_number &&
                                          student.roll_number
                                            .toLowerCase()
                                            .includes(searchLower))
                                      );
                                    }
                                  );

                                  // Sort students
                                  filteredStudents = [...filteredStudents].sort(
                                    (a, b) => {
                                      switch (sortOrder) {
                                        case 'name':
                                          return a.student_name.localeCompare(
                                            b.student_name
                                          );
                                        case 'roll':
                                          return (
                                            a.roll_number || ''
                                          ).localeCompare(b.roll_number || '');
                                        case 'status':
                                          return (
                                            (b.is_present ? 1 : 0) -
                                            (a.is_present ? 1 : 0)
                                          );
                                        default:
                                          return 0;
                                      }
                                    }
                                  );

                                  return filteredStudents.length > 0 ? (
                                    filteredStudents.map((student, idx) => (
                                      <TableRow
                                        key={student.student_id}
                                        className={
                                          student.is_present
                                            ? 'bg-green-50/50'
                                            : 'bg-red-50/50'
                                        }
                                      >
                                        <TableCell className='font-medium'>
                                          {idx + 1}
                                        </TableCell>
                                        <TableCell>
                                          <div className='flex items-center gap-3'>
                                            <Avatar className='h-8 w-8'>
                                              <AvatarImage
                                                src={student.avatar_url}
                                              />
                                              <AvatarFallback
                                                className={`text-xs ${
                                                  student.is_present
                                                    ? 'bg-green-500'
                                                    : 'bg-red-500'
                                                } text-white`}
                                              >
                                                {student.student_name
                                                  .split(' ')
                                                  .map((n) => n[0])
                                                  .join('')
                                                  .toUpperCase()}
                                              </AvatarFallback>
                                            </Avatar>
                                            <span className='font-medium'>
                                              {student.student_name}
                                            </span>
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          {student.roll_number || 'N/A'}
                                        </TableCell>
                                        <TableCell>
                                          {student.section_name ? `Section ${student.section_name}` : 'N/A'}
                                        </TableCell>
                                        <TableCell className='text-center'>
                                          <Badge
                                            className={`${
                                              student.is_present
                                                ? 'bg-green-100 text-green-700 border-green-300'
                                                : 'bg-red-100 text-red-700 border-red-300'
                                            }`}
                                          >
                                            {student.is_present
                                              ? 'Present'
                                              : 'Absent'}
                                          </Badge>
                                        </TableCell>
                                      </TableRow>
                                    ))
                                  ) : (
                                    <TableRow>
                                      <TableCell
                                        colSpan={5}
                                        className='text-center py-8 text-gray-500'
                                      >
                                        No students found matching &quot;
                                        {periodSearchTerm}&quot;
                                      </TableCell>
                                    </TableRow>
                                  );
                                })()
                              ) : (
                                <TableRow>
                                  <TableCell
                                    colSpan={5}
                                    className='text-center py-8 text-gray-500'
                                  >
                                    No student data available for this period
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}
          </CardContent>
        </Card>

        {/* Attendance Alert - Clean and Simple */}
        {report.average_attendance < 75 && (
          <Card className='border-l-4 border-l-red-500 bg-red-50 dark:bg-red-900/20'>
            <CardContent className='p-4'>
              <div className='flex items-start gap-3'>
                <AlertTriangle className='h-5 w-5 text-red-600 dark:text-red-400 mt-0.5' />
                <div>
                  <h3 className='font-semibold text-red-900 dark:text-red-200'>
                    Low Attendance Alert
                  </h3>
                  <p className='text-sm text-red-700 dark:text-red-300 mt-1'>
                    The overall attendance (
                    {report.average_attendance.toFixed(1)}%) is below the
                    recommended 75% threshold. Consider taking appropriate
                    action.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {report.average_attendance >= 90 && (
          <Card className='border-l-4 border-l-green-500 bg-green-50 dark:bg-green-900/20'>
            <CardContent className='p-4'>
              <div className='flex items-start gap-3'>
                <CheckCircle className='h-5 w-5 text-green-600 dark:text-green-400 mt-0.5' />
                <div>
                  <h3 className='font-semibold text-green-900 dark:text-green-200'>
                    Excellent Attendance
                  </h3>
                  <p className='text-sm text-green-700 dark:text-green-300 mt-1'>
                    Outstanding! This class achieved{' '}
                    {report.average_attendance.toFixed(1)}% attendance,
                    exceeding the excellence threshold of 90%.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
