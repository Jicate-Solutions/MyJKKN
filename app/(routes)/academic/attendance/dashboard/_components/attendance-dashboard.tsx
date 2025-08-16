'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Search,
  BarChart3,
  Users,
  BookOpen,
  GraduationCap,
  Target,
  Calendar,
  TrendingUp,
  Activity
} from 'lucide-react';
import { AttendanceDashboardFilters } from './attendance-dashboard-filters';

import {
  useOverallAttendanceSummary,
  type AnalyticsFilters
} from '@/hooks/academic/use-attendance-analytics';
import { FacultyAnalyticsWidget } from './faculty-analytics-widget';
import { CourseAnalyticsWidget } from './course-analytics-widget';
import { StudentAnalyticsWidget } from './student-analytics-widget';

export function AttendanceDashboard() {
  // Set default date range to last 30 days
  const getDefaultDates = () => {
    const end = new Date();
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return {
      start_date: start.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0]
    };
  };

  const [filters, setFilters] = useState<AnalyticsFilters>({
    institution_id: '',
    ...getDefaultDates()
  });

  const [showAnalytics, setShowAnalytics] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const handleFilterChange = (newFilters: Partial<AnalyticsFilters>) => {
    // Update filters normally - allow date changes
    setFilters((prev: AnalyticsFilters) => ({
      ...prev,
      ...newFilters
    }));
    // Reset analytics view when filters change
    setShowAnalytics(false);
  };

  const handleSearch = async () => {
    if (!filters.institution_id) {
      return;
    }

    setIsSearching(true);
    // Simulate search delay for smooth UX
    await new Promise((resolve) => setTimeout(resolve, 500));
    setShowAnalytics(true);
    setIsSearching(false);
  };

  // Fetch overall attendance summary only when analytics are shown
  const { data: summary, isLoading: summaryLoading } =
    useOverallAttendanceSummary(
      filters,
      showAnalytics && !!filters.institution_id
    );

  const canShowAnalytics = showAnalytics && Boolean(filters.institution_id);

  const isFormValid = Boolean(filters.institution_id);

  return (
    <div className='space-y-6'>
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Target className='h-5 w-5 text-blue-600' />
            Analytics Filters
          </CardTitle>
          <CardDescription>
            Filter attendance data by date range and academic hierarchy. Date
            range shows periods scheduled for those specific dates in
            timetables.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <AttendanceDashboardFilters
            filters={filters}
            onFilterChange={handleFilterChange}
          />

          {/* Search Button */}
          <div className='flex justify-center pt-4 border-t'>
            <Button
              onClick={handleSearch}
              disabled={!isFormValid || isSearching}
              size='lg'
              className='min-w-[200px] bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
            >
              {isSearching ? (
                <>
                  <Activity className='mr-2 h-4 w-4 animate-spin' />
                  Analyzing Data...
                </>
              ) : (
                <>
                  <Search className='mr-2 h-4 w-4' />
                  Generate Analytics
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Content - Only show when search is performed */}
      {canShowAnalytics && (
        <>
          {/* Summary Stats */}
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium flex items-center gap-2'>
                  <TrendingUp className='h-4 w-4 text-blue-600' />
                  Overall Attendance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>
                  {summaryLoading
                    ? '--'
                    : summary
                    ? `${summary.overall_attendance_percentage}%`
                    : '--'}
                </div>
                <p className='text-xs text-muted-foreground'>
                  {summary
                    ? `Avg student: ${summary.avg_student_attendance}%`
                    : 'Loading...'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium flex items-center gap-2'>
                  <Calendar className='h-4 w-4 text-indigo-600' />
                  Total Periods
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>
                  {summaryLoading
                    ? '--'
                    : summary
                    ? summary.total_scheduled_periods.toLocaleString()
                    : '--'}
                </div>
                <p className='text-xs text-muted-foreground'>
                  {summary
                    ? `For ${summary.total_students} students`
                    : 'Loading...'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium flex items-center gap-2'>
                  <Activity className='h-4 w-4 text-green-600' />
                  Attendance Taken
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>
                  {summaryLoading
                    ? '--'
                    : summary
                    ? summary.total_attendance_taken.toLocaleString()
                    : '--'}
                </div>
                <p className='text-xs text-muted-foreground'>Periods marked</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium flex items-center gap-2'>
                  <Target className='h-4 w-4 text-amber-600' />
                  Pending
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>
                  {summaryLoading
                    ? '--'
                    : summary
                    ? summary.total_attendance_pending.toLocaleString()
                    : '--'}
                </div>
                <p className='text-xs text-muted-foreground'>Not yet marked</p>
              </CardContent>
            </Card>
          </div>

          {/* Analytics Tabs */}
          <Tabs defaultValue='overview' className='space-y-6'>
            <TabsList className='grid w-full grid-cols-4 bg-gradient-to-r from-blue-50 to-purple-50 p-1 rounded-lg'>
              <TabsTrigger
                value='overview'
                className='data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white font-medium flex items-center gap-2'
              >
                <BarChart3 className='h-4 w-4' />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value='faculty'
                className='data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-green-600 data-[state=active]:text-white font-medium flex items-center gap-2'
              >
                <Users className='h-4 w-4' />
                Faculty
              </TabsTrigger>
              <TabsTrigger
                value='courses'
                className='data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-purple-600 data-[state=active]:text-white font-medium flex items-center gap-2'
              >
                <BookOpen className='h-4 w-4' />
                Courses
              </TabsTrigger>
              <TabsTrigger
                value='students'
                className='data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-orange-600 data-[state=active]:text-white font-medium flex items-center gap-2'
              >
                <GraduationCap className='h-4 w-4' />
                Students
              </TabsTrigger>
            </TabsList>

            <TabsContent value='overview' className='space-y-6'>
              <Card className='bg-gradient-to-br from-blue-50 via-white to-purple-50 border-blue-200'>
                <CardHeader>
                  <CardTitle className='text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2'>
                    <BarChart3 className='h-6 w-6' />
                    Attendance Overview
                  </CardTitle>
                  <CardDescription className='text-gray-600'>
                    Comprehensive overview of attendance statistics across all
                    categories
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className='grid gap-6 md:grid-cols-2'>
                    <div className='space-y-4'>
                      <h3 className='text-lg font-semibold text-gray-800 flex items-center gap-2'>
                        <Target className='h-5 w-5 text-blue-600' />
                        Key Metrics
                      </h3>
                      <div className='grid gap-3'>
                        <div className='flex justify-between items-center p-3 bg-gradient-to-r from-blue-100 to-blue-50 rounded-lg'>
                          <span className='text-sm font-medium text-gray-700'>
                            Overall Attendance
                          </span>
                          <span className='text-lg font-bold text-blue-600'>
                            {summaryLoading
                              ? '--'
                              : summary
                              ? `${summary.overall_attendance_percentage}%`
                              : '--'}
                          </span>
                        </div>
                        <div className='flex justify-between items-center p-3 bg-gradient-to-r from-green-100 to-green-50 rounded-lg'>
                          <span className='text-sm font-medium text-gray-700'>
                            Avg Student Attendance
                          </span>
                          <span className='text-lg font-bold text-green-600'>
                            {summaryLoading
                              ? '--'
                              : summary
                              ? `${summary.avg_student_attendance}%`
                              : '--'}
                          </span>
                        </div>
                        <div className='flex justify-between items-center p-3 bg-gradient-to-r from-purple-100 to-purple-50 rounded-lg'>
                          <span className='text-sm font-medium text-gray-700'>
                            Total Students
                          </span>
                          <span className='text-lg font-bold text-purple-600'>
                            {summaryLoading
                              ? '--'
                              : summary
                              ? summary.total_students.toLocaleString()
                              : '--'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className='space-y-4'>
                      <h3 className='text-lg font-semibold text-gray-800 flex items-center gap-2'>
                        <Calendar className='h-5 w-5 text-indigo-600' />
                        Period Statistics
                      </h3>
                      <div className='grid gap-3'>
                        <div className='flex justify-between items-center p-3 bg-gradient-to-r from-indigo-100 to-indigo-50 rounded-lg'>
                          <span className='text-sm font-medium text-gray-700'>
                            Total Periods
                          </span>
                          <span className='text-lg font-bold text-indigo-600'>
                            {summaryLoading
                              ? '--'
                              : summary
                              ? summary.total_scheduled_periods.toLocaleString()
                              : '--'}
                          </span>
                        </div>
                        <div className='flex justify-between items-center p-3 bg-gradient-to-r from-emerald-100 to-emerald-50 rounded-lg'>
                          <span className='text-sm font-medium text-gray-700'>
                            Attendance Taken
                          </span>
                          <span className='text-lg font-bold text-emerald-600'>
                            {summaryLoading
                              ? '--'
                              : summary
                              ? summary.total_attendance_taken.toLocaleString()
                              : '--'}
                          </span>
                        </div>
                        <div className='flex justify-between items-center p-3 bg-gradient-to-r from-amber-100 to-amber-50 rounded-lg'>
                          <span className='text-sm font-medium text-gray-700'>
                            Pending
                          </span>
                          <span className='text-lg font-bold text-amber-600'>
                            {summaryLoading
                              ? '--'
                              : summary
                              ? summary.total_attendance_pending.toLocaleString()
                              : '--'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value='faculty'>
              <FacultyAnalyticsWidget
                filters={filters}
                enabled={canShowAnalytics}
              />
            </TabsContent>

            <TabsContent value='courses'>
              <CourseAnalyticsWidget
                filters={filters}
                enabled={canShowAnalytics}
              />
            </TabsContent>

            <TabsContent value='students'>
              <StudentAnalyticsWidget
                filters={filters}
                enabled={canShowAnalytics}
              />
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Show message when no search performed */}
      {!canShowAnalytics && !isSearching && (
        <Card className='border-dashed border-2 border-gray-300'>
          <CardContent className='flex flex-col items-center justify-center h-64 text-center space-y-4'>
            <BarChart3 className='h-16 w-16 text-gray-400' />
            <div className='space-y-2'>
              <h3 className='text-lg font-semibold text-gray-600'>
                Ready to Generate Analytics
              </h3>
              <p className='text-sm text-gray-500 max-w-md'>
                Configure your filters above and click &quot;Generate
                Analytics&quot; to view comprehensive attendance statistics and
                insights.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
