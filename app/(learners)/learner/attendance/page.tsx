'use client';

import LearnerLayout from '@/components/layout/learner-layout';
import { LearnerPageHeader } from '@/components/layout/learner-page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3,
  Calendar,
  TrendingUp,
  AlertTriangle,
  Clock,
  BookOpen,
  Target,
  Info,
  Sparkles,
  Activity,
  Award,
  ChevronDown,
  RotateCcw,
  User
} from 'lucide-react';

// Import our new components
import { AttendanceOverviewCards } from './_components/attendance-overview-cards';
import { AttendanceCharts } from './_components/attendance-charts';
import { AttendanceCalendar } from './_components/attendance-calendar';
import { AttendanceFilters } from './_components/attendance-filters';
import { AttendanceAlerts } from './_components/attendance-alerts';
import { RecentAttendance } from './_components/recent-attendance';
import { StudentAvatar } from './_components/student-avatar';
import {
  AttendanceErrorBoundary,
  AttendanceFallback,
  AttendanceLoadingFallback
} from './_components/attendance-error-boundary';

// Import the hook and services
import { useLearnerAttendance } from '@/hooks/learner/use-learner-attendance';
import { LearnerAttendanceExportService } from '@/lib/services/learner/learner-attendance-export-service';
import { LearnerAttendanceShareService } from '@/lib/services/learner/learner-attendance-share-service';

export default function AttendancePage() {
  const {
    attendanceData,
    loading,
    error,
    filters,
    updateFilters,
    refetch,
    getAttendanceChartData
  } = useLearnerAttendance();

  // Debug logging for student photo
  console.log('Attendance Page - attendanceData:', attendanceData);
  console.log(
    'Attendance Page - student_photo_url:',
    attendanceData?.student_photo_url
  );

  const handleExport = async () => {
    if (!attendanceData) return;

    try {
      await LearnerAttendanceExportService.exportToPDF(attendanceData, {
        includeOverview: true,
        includeCourseStats: true,
        includeDetailedRecords: true,
        dateRange: filters.date_range
      });
    } catch (error) {
      console.error('Error exporting data:', error);
    }
  };

  const handleExportPDF = async () => {
    if (!attendanceData) return;

    try {
      await LearnerAttendanceExportService.exportToPDF(attendanceData, {
        includeOverview: true,
        includeCourseStats: true,
        includeDetailedRecords: true,
        dateRange: filters.date_range
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
    }
  };

  const handleExportExcel = async () => {
    if (!attendanceData) return;

    try {
      await LearnerAttendanceExportService.exportToExcel(attendanceData, {
        includeOverview: true,
        includeCourseStats: true,
        includeDetailedRecords: true,
        includeMonthlyBreakdown: true,
        dateRange: filters.date_range
      });
    } catch (error) {
      console.error('Error exporting Excel:', error);
    }
  };

  const handleExportCSV = async () => {
    if (!attendanceData) return;

    try {
      await LearnerAttendanceExportService.exportToCSV(attendanceData);
    } catch (error) {
      console.error('Error exporting CSV:', error);
    }
  };

  const handleShare = async () => {
    if (!attendanceData) return;

    try {
      await LearnerAttendanceShareService.shareAttendanceLink(attendanceData, {
        platform: 'generic',
        includeStats: true
      });
    } catch (error) {
      console.log('Share completed or link copied to clipboard');
    }
  };

  const handleShareEmail = async () => {
    if (!attendanceData) return;

    try {
      await LearnerAttendanceShareService.shareViaEmail(attendanceData, {
        shareMethod: 'email',
        includeOverview: true,
        includeCourseStats: true,
        includeDetailedRecords: false,
        dateRange: filters.date_range
      });
    } catch (error) {
      console.error('Error sharing via email:', error);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!attendanceData) return;

    try {
      await LearnerAttendanceShareService.shareAttendanceLink(attendanceData, {
        platform: 'whatsapp',
        includeStats: true
      });
    } catch (error) {
      console.log('WhatsApp sharing completed');
    }
  };

  const handleShareParent = async () => {
    if (!attendanceData) return;

    // This would typically open a dialog to enter parent contact
    // For now, we'll use WhatsApp sharing with a parent-specific message
    try {
      await LearnerAttendanceShareService.shareWithParent(
        attendanceData,
        '', // Parent contact would be entered in a dialog
        'whatsapp'
      );
    } catch (error) {
      console.log('Parent sharing initiated');
    }
  };

  const handleViewDetails = (date: string) => {
    // TODO: Implement detailed view
    console.log('View details for:', date);
  };

  if (error) {
    return (
      <LearnerLayout>
        <LearnerPageHeader
          title='Attendance'
          subtitle='Track your class attendance records and performance.'
        />
        <div className='p-3 sm:p-4 md:p-6 animate-in fade-in-0 duration-500'>
          <Alert
            variant='destructive'
            className='border-red-200 bg-gradient-to-r from-red-50 to-pink-50 shadow-lg'
          >
            <div className='flex items-start gap-3'>
              <div className='relative'>
                <AlertTriangle className='h-5 w-5 text-red-600 animate-pulse' />
                <div className='absolute -top-1 -right-1 w-2 h-2 bg-red-400 rounded-full animate-ping'></div>
              </div>
              <div className='flex-1'>
                <AlertDescription className='text-red-800 text-sm sm:text-base leading-relaxed'>
                  <strong className='block sm:inline'>Error:</strong>
                  <span className='block sm:inline sm:ml-2'>
                    {error}. Please try refreshing the page or contact support
                    if the problem persists.
                  </span>
                </AlertDescription>
                <div className='mt-3 flex flex-col sm:flex-row gap-2'>
                  <button
                    onClick={() => window.location.reload()}
                    className='flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors'
                  >
                    <RotateCcw className='h-4 w-4' />
                    Refresh Page
                  </button>
                </div>
              </div>
            </div>
          </Alert>
        </div>
      </LearnerLayout>
    );
  }

  return (
    <LearnerLayout>
      <LearnerPageHeader
        title='My Attendance'
        subtitle='Track your class attendance records, statistics, and performance analytics.'
      />
      <AttendanceErrorBoundary>
        <div className='p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 animate-in fade-in-0 duration-300'>
          {/* Quick Info Banner with Animation */}
          <Alert className='border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-sm animate-in slide-in-from-top-2 duration-500 hover:shadow-md transition-shadow'>
            <div className='flex items-start sm:items-center gap-2 sm:gap-3'>
              <div className='relative'>
                <Info className='h-4 w-4 sm:h-5 sm:w-5 text-blue-600 animate-pulse' />
                <div className='absolute -top-1 -right-1 w-2 h-2 bg-blue-400 rounded-full animate-ping opacity-75'></div>
              </div>
              <AlertDescription className='text-blue-800 text-sm sm:text-base leading-relaxed'>
                <strong className='block sm:inline'>
                  Attendance Requirement:
                </strong>
                <span className='block sm:inline sm:ml-2'>
                  You must maintain at least 75% attendance in each course to be
                  eligible for examinations. Monitor your progress regularly.
                </span>
              </AlertDescription>
            </div>
          </Alert>

          {/* Overview Cards */}
          <AttendanceErrorBoundary
            fallback={
              <AttendanceFallback
                title='Unable to load overview'
                onRetry={refetch}
              />
            }
          >
            {loading ? (
              <AttendanceLoadingFallback title='Loading attendance overview...' />
            ) : (
              <AttendanceOverviewCards
                stats={
                  attendanceData?.attendance_stats || {
                    total_days: 0,
                    present_days: 0,
                    absent_days: 0,
                    late_days: 0,
                    permission_days: 0,
                    overall_percentage: 0,
                    total_periods: 0,
                    attended_periods: 0,
                    missed_periods: 0,
                    period_percentage: 0,
                    monthly_breakdown: [],
                    course_wise_stats: [],
                    recent_trend: [],
                    alerts: []
                  }
                }
                loading={loading}
              />
            )}
          </AttendanceErrorBoundary>

          {/* Alerts Section */}
          {attendanceData?.attendance_stats?.alerts &&
            attendanceData.attendance_stats.alerts.length > 0 && (
              <AttendanceErrorBoundary
                fallback={
                  <AttendanceFallback
                    title='Unable to load alerts'
                    showRetry={false}
                  />
                }
              >
                <AttendanceAlerts
                  alerts={attendanceData.attendance_stats?.alerts || []}
                  loading={loading}
                />
              </AttendanceErrorBoundary>
            )}

          {/* Main Content Tabs */}
          <Tabs defaultValue='overview' className='space-y-6'>
            <div className='overflow-x-auto pb-2'>
              <TabsList className='grid w-full min-w-[500px] sm:min-w-0 grid-cols-5 gap-1 bg-gradient-to-r from-gray-50 to-gray-100 p-1.5 rounded-lg shadow-inner'>
                <TabsTrigger
                  value='overview'
                  className='flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-2 sm:py-2.5 rounded-md transition-all duration-200 hover:scale-105 data-[state=active]:shadow-md data-[state=active]:bg-white'
                >
                  <div className='relative'>
                    <TrendingUp className='h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform duration-200 hover:scale-110' />
                    <Sparkles className='absolute -top-0.5 -right-0.5 h-2 w-2 text-yellow-400 opacity-0 data-[state=active]:opacity-100 transition-opacity' />
                  </div>
                  <span className='hidden xs:inline text-xs sm:text-sm font-medium'>
                    Overview
                  </span>
                  <span className='xs:hidden text-xs'>Home</span>
                </TabsTrigger>
                <TabsTrigger
                  value='analytics'
                  className='flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-2 sm:py-2.5 rounded-md transition-all duration-200 hover:scale-105 data-[state=active]:shadow-md data-[state=active]:bg-white'
                >
                  <div className='relative'>
                    <BarChart3 className='h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform duration-200 hover:scale-110' />
                    <Activity className='absolute -top-0.5 -right-0.5 h-2 w-2 text-green-400 opacity-0 data-[state=active]:opacity-100 transition-opacity animate-pulse' />
                  </div>
                  <span className='hidden xs:inline text-xs sm:text-sm font-medium'>
                    Analytics
                  </span>
                  <span className='xs:hidden text-xs'>Charts</span>
                </TabsTrigger>
                <TabsTrigger
                  value='calendar'
                  className='flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-2 sm:py-2.5 rounded-md transition-all duration-200 hover:scale-105 data-[state=active]:shadow-md data-[state=active]:bg-white'
                >
                  <div className='relative'>
                    <Calendar className='h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform duration-200 hover:scale-110' />
                  </div>
                  <span className='hidden xs:inline text-xs sm:text-sm font-medium'>
                    Calendar
                  </span>
                  <span className='xs:hidden text-xs'>Cal</span>
                </TabsTrigger>
                <TabsTrigger
                  value='recent'
                  className='flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-2 sm:py-2.5 rounded-md transition-all duration-200 hover:scale-105 data-[state=active]:shadow-md data-[state=active]:bg-white'
                >
                  <div className='relative'>
                    <Clock className='h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform duration-200 hover:scale-110' />
                  </div>
                  <span className='hidden xs:inline text-xs sm:text-sm font-medium'>
                    Recent
                  </span>
                  <span className='xs:hidden text-xs'>List</span>
                </TabsTrigger>
                <TabsTrigger
                  value='courses'
                  className='flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-2 sm:py-2.5 rounded-md transition-all duration-200 hover:scale-105 data-[state=active]:shadow-md data-[state=active]:bg-white'
                >
                  <div className='relative'>
                    <BookOpen className='h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform duration-200 hover:scale-110' />
                    <Award className='absolute -top-0.5 -right-0.5 h-2 w-2 text-purple-400 opacity-0 data-[state=active]:opacity-100 transition-opacity' />
                  </div>
                  <span className='hidden xs:inline text-xs sm:text-sm font-medium'>
                    Courses
                  </span>
                  <span className='xs:hidden text-xs'>Subjects</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Overview Tab */}
            <TabsContent
              value='overview'
              className='space-y-4 sm:space-y-6 animate-in fade-in-0 duration-500'
            >
              <div className='grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6'>
                {/* Recent Attendance */}
                <div className='lg:col-span-2 order-2 lg:order-1'>
                  <RecentAttendance
                    recentAttendance={attendanceData?.recent_attendance || []}
                    onViewDetails={handleViewDetails}
                    loading={loading}
                  />
                </div>

                {/* Quick Stats & Info */}
                <div className='space-y-4 sm:space-y-6 order-1 lg:order-2'>
                  {/* Student Info Card with Enhanced Mobile Design */}
                  <Card className='group hover:shadow-lg transition-all duration-300 border-0 shadow-md bg-gradient-to-br from-white to-gray-50'>
                    <CardContent className='p-4 sm:p-6'>
                      <div className='space-y-4'>
                        <div className='text-center relative'>
                          <div className='relative inline-block'>
                            <StudentAvatar
                              photoUrl={attendanceData?.student_photo_url}
                              studentName={
                                attendanceData?.student_name || 'Student'
                              }
                              size='lg'
                              className='mx-auto mb-3 hover:scale-105 transition-transform duration-300'
                            />
                            <div className='absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 border-2 border-white rounded-full flex items-center justify-center shadow-sm animate-pulse'>
                              <div className='w-2 h-2 bg-white rounded-full'></div>
                            </div>
                          </div>
                          <div className='space-y-1'>
                            <h3 className='font-bold text-lg sm:text-xl text-gray-800 animate-in slide-in-from-bottom-2 duration-700'>
                              {attendanceData?.student_name}
                            </h3>
                            {attendanceData?.roll_number && (
                              <p className='text-sm text-gray-600 font-medium bg-gray-100 px-3 py-1 rounded-full inline-block'>
                                {attendanceData.roll_number}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className='space-y-3 bg-white rounded-lg p-3 sm:p-4 shadow-inner'>
                          <div className='grid grid-cols-1 gap-3 text-sm'>
                            <div className='flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2 p-2 rounded-md hover:bg-blue-50 transition-colors'>
                              <span className='text-gray-600 font-medium flex items-center gap-2'>
                                <div className='w-2 h-2 bg-blue-400 rounded-full'></div>
                                Program:
                              </span>
                              <span className='font-semibold text-gray-800 sm:text-right'>
                                {attendanceData?.program_name}
                              </span>
                            </div>
                            <div className='flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2 p-2 rounded-md hover:bg-purple-50 transition-colors'>
                              <span className='text-gray-600 font-medium flex items-center gap-2'>
                                <div className='w-2 h-2 bg-purple-400 rounded-full'></div>
                                Department:
                              </span>
                              <span className='font-semibold text-gray-800 sm:text-right'>
                                {attendanceData?.department_name}
                              </span>
                            </div>
                            <div className='flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2 p-2 rounded-md hover:bg-green-50 transition-colors'>
                              <span className='text-gray-600 font-medium flex items-center gap-2'>
                                <div className='w-2 h-2 bg-green-400 rounded-full'></div>
                                Semester:
                              </span>
                              <span className='font-semibold text-gray-800 sm:text-right'>
                                {attendanceData?.semester_name}
                              </span>
                            </div>
                            <div className='flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2 p-2 rounded-md hover:bg-orange-50 transition-colors'>
                              <span className='text-gray-600 font-medium flex items-center gap-2'>
                                <div className='w-2 h-2 bg-orange-400 rounded-full'></div>
                                Section:
                              </span>
                              <span className='font-semibold text-gray-800 sm:text-right'>
                                {attendanceData?.section_name}
                              </span>
                            </div>
                          </div>
                        </div>

                        {attendanceData?.current_semester && (
                          <div className='bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200'>
                            <div className='flex items-center justify-between'>
                              <div className='flex items-center gap-2'>
                                <Award className='h-4 w-4 text-blue-600 animate-bounce' />
                                <span className='text-sm font-medium text-blue-800'>
                                  Current Semester:
                                </span>
                              </div>
                              <Badge
                                variant={
                                  (attendanceData.current_semester
                                    ?.attendance_percentage || 0) >= 75
                                    ? 'default'
                                    : 'destructive'
                                }
                                className='text-sm font-bold shadow-sm animate-pulse'
                              >
                                {(
                                  attendanceData.current_semester
                                    ?.attendance_percentage || 0
                                ).toFixed(1)}
                                %
                              </Badge>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Course Performance with Enhanced Design */}
                  <Card className='group hover:shadow-lg transition-all duration-300 border-0 shadow-md bg-gradient-to-br from-white to-gray-50'>
                    <CardContent className='p-4 sm:p-6'>
                      <div className='flex items-center gap-3 mb-4 sm:mb-6'>
                        <div className='relative'>
                          <BookOpen className='h-5 w-5 sm:h-6 sm:w-6 text-indigo-600 hover:scale-110 transition-transform duration-300' />
                          <div className='absolute -top-1 -right-1 w-3 h-3 bg-indigo-400 rounded-full animate-ping opacity-60'></div>
                        </div>
                        <h4 className='font-bold text-lg text-gray-800'>
                          Course Performance
                        </h4>
                      </div>
                      <div className='space-y-4'>
                        {attendanceData?.attendance_stats?.course_wise_stats
                          ?.slice(0, 5)
                          ?.map((course, index) => (
                            <div
                              key={course.course_id}
                              className='group/item p-3 rounded-lg bg-white shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 hover:border-indigo-200'
                            >
                              <div className='flex items-center justify-between gap-3'>
                                <div className='flex-1 min-w-0'>
                                  <div className='flex items-center gap-2 mb-1'>
                                    <div
                                      className={`w-3 h-3 rounded-full ${
                                        course.percentage >= 75
                                          ? 'bg-green-400'
                                          : 'bg-red-400'
                                      } animate-pulse`}
                                    ></div>
                                    <p className='text-sm font-semibold text-gray-800 truncate hover:text-indigo-600 transition-colors'>
                                      {course.course_code || course.course_name}
                                    </p>
                                  </div>
                                  <div className='flex items-center gap-2 text-xs text-gray-600'>
                                    <Activity className='h-3 w-3' />
                                    <span>
                                      {course.attended_periods}/
                                      {course.total_periods} periods
                                    </span>
                                    <div className='flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden'>
                                      <div
                                        className={`h-full transition-all duration-1000 ${
                                          course.percentage >= 75
                                            ? 'bg-green-500'
                                            : 'bg-red-500'
                                        }`}
                                        style={{
                                          width: `${course.percentage}%`
                                        }}
                                      ></div>
                                    </div>
                                  </div>
                                </div>
                                <Badge
                                  variant={
                                    course.percentage >= 75
                                      ? 'default'
                                      : 'destructive'
                                  }
                                  className='text-xs font-bold shadow-sm hover:scale-105 transition-transform'
                                >
                                  {course.percentage.toFixed(1)}%
                                </Badge>
                              </div>
                            </div>
                          ))}
                      </div>
                      {(attendanceData?.attendance_stats?.course_wise_stats
                        ?.length || 0) > 5 && (
                        <div className='mt-4 text-center'>
                          <button className='text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 mx-auto transition-colors'>
                            <span>View All Courses</span>
                            <ChevronDown className='h-3 w-3' />
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Analytics Tab */}
            <TabsContent value='analytics' className='space-y-6'>
              <AttendanceErrorBoundary
                fallback={
                  <AttendanceFallback
                    title='Unable to load charts'
                    onRetry={refetch}
                  />
                }
              >
                <AttendanceCharts
                  getChartData={getAttendanceChartData}
                  loading={loading}
                />
              </AttendanceErrorBoundary>
            </TabsContent>

            {/* Calendar Tab */}
            <TabsContent value='calendar' className='space-y-6'>
              <AttendanceErrorBoundary
                fallback={
                  <AttendanceFallback
                    title='Unable to load calendar'
                    onRetry={refetch}
                  />
                }
              >
                <AttendanceCalendar
                  calendarData={attendanceData?.attendance_calendar || []}
                  loading={loading}
                />
              </AttendanceErrorBoundary>
            </TabsContent>

            {/* Recent Tab */}
            <TabsContent value='recent' className='space-y-6'>
              <AttendanceErrorBoundary
                fallback={
                  <AttendanceFallback
                    title='Unable to load recent attendance'
                    onRetry={refetch}
                  />
                }
              >
                <RecentAttendance
                  recentAttendance={attendanceData?.recent_attendance || []}
                  onViewDetails={handleViewDetails}
                  loading={loading}
                />
              </AttendanceErrorBoundary>
            </TabsContent>

            {/* Courses Tab with Enhanced Mobile Design */}
            <TabsContent
              value='courses'
              className='space-y-4 sm:space-y-6 animate-in fade-in-0 duration-500'
            >
              <AttendanceErrorBoundary
                fallback={
                  <AttendanceFallback
                    title='Unable to load course details'
                    onRetry={refetch}
                  />
                }
              >
                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6'>
                  {attendanceData?.attendance_stats?.course_wise_stats?.map(
                    (course, index) => (
                      <Card
                        key={course.course_id}
                        className='group hover:shadow-xl transition-all duration-300 border-0 shadow-md bg-gradient-to-br from-white to-gray-50 hover:scale-105'
                      >
                        <CardContent className='p-4 sm:p-6'>
                          <div className='space-y-4'>
                            <div className='flex items-start justify-between gap-3'>
                              <div className='flex-1 min-w-0'>
                                <div className='flex items-center gap-2 mb-2'>
                                  <div
                                    className={`w-3 h-3 rounded-full ${
                                      course.percentage >= 75
                                        ? 'bg-green-500'
                                        : 'bg-red-500'
                                    } animate-pulse shadow-sm`}
                                  ></div>
                                  <h4 className='font-bold text-gray-800 hover:text-indigo-600 transition-colors text-sm sm:text-base truncate'>
                                    {course.course_name}
                                  </h4>
                                </div>
                                {course.course_code && (
                                  <p className='text-xs sm:text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded-full inline-block font-medium'>
                                    {course.course_code}
                                  </p>
                                )}
                              </div>
                              <Badge
                                variant={
                                  course.percentage >= 75
                                    ? 'default'
                                    : 'destructive'
                                }
                                className='text-xs sm:text-sm font-bold shadow-md hover:scale-110 transition-transform'
                              >
                                {course.percentage.toFixed(1)}%
                              </Badge>
                            </div>

                            {/* Progress Bar */}
                            <div className='w-full bg-gray-200 rounded-full h-2 overflow-hidden shadow-inner'>
                              <div
                                className={`h-full transition-all duration-1000 ease-out ${
                                  course.percentage >= 75
                                    ? 'bg-gradient-to-r from-green-400 to-green-600'
                                    : 'bg-gradient-to-r from-red-400 to-red-600'
                                }`}
                                style={{ width: `${course.percentage}%` }}
                              ></div>
                            </div>

                            <div className='grid grid-cols-1 gap-3 bg-white rounded-lg p-3 shadow-inner'>
                              <div className='flex justify-between items-center text-xs sm:text-sm p-2 rounded-md hover:bg-green-50 transition-colors'>
                                <span className='flex items-center gap-2 text-gray-600 font-medium'>
                                  <div className='w-2 h-2 bg-green-400 rounded-full'></div>
                                  Attended:
                                </span>
                                <span className='font-bold text-green-700'>
                                  {course.attended_periods} periods
                                </span>
                              </div>
                              <div className='flex justify-between items-center text-xs sm:text-sm p-2 rounded-md hover:bg-blue-50 transition-colors'>
                                <span className='flex items-center gap-2 text-gray-600 font-medium'>
                                  <div className='w-2 h-2 bg-blue-400 rounded-full'></div>
                                  Total:
                                </span>
                                <span className='font-bold text-blue-700'>
                                  {course.total_periods} periods
                                </span>
                              </div>
                              <div className='flex justify-between items-center text-xs sm:text-sm p-2 rounded-md hover:bg-red-50 transition-colors'>
                                <span className='flex items-center gap-2 text-gray-600 font-medium'>
                                  <div className='w-2 h-2 bg-red-400 rounded-full animate-pulse'></div>
                                  Missed:
                                </span>
                                <span className='font-bold text-red-700'>
                                  {course.total_periods -
                                    course.attended_periods}{' '}
                                  periods
                                </span>
                              </div>
                            </div>

                            {course.faculty_name && (
                              <div className='bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-3 border border-purple-200'>
                                <div className='flex items-center gap-2'>
                                  <User className='h-3 w-3 text-purple-600' />
                                  <p className='text-xs sm:text-sm text-purple-800 font-medium'>
                                    Faculty: {course.faculty_name}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  )}
                </div>
              </AttendanceErrorBoundary>
            </TabsContent>
          </Tabs>

          {/* Filters Panel */}
          <AttendanceFilters
            filters={filters}
            onFiltersChange={updateFilters}
            semesters={attendanceData?.all_semesters || []}
            courses={attendanceData?.attendance_stats?.course_wise_stats || []}
            onRefresh={refetch}
            onExport={handleExport}
            onExportPDF={handleExportPDF}
            onExportExcel={handleExportExcel}
            onExportCSV={handleExportCSV}
            onShare={handleShare}
            onShareEmail={handleShareEmail}
            onShareWhatsApp={handleShareWhatsApp}
            onShareParent={handleShareParent}
            loading={loading}
          />
        </div>
      </AttendanceErrorBoundary>
    </LearnerLayout>
  );
}
