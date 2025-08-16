'use client';

import { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
  LineChart,
  Line
} from 'recharts';
import {
  BookOpen,
  BarChart3,
  FileText,
  TrendingUp,
  Award,
  Users,
  Activity,
  AlertTriangle,
  PieChart as PieChartIcon
} from 'lucide-react';
import {
  useCourseAttendanceStats,
  type AnalyticsFilters
} from '@/hooks/academic/use-attendance-analytics';
import { CourseDataTable } from './course-data-table';

interface CourseAnalyticsWidgetProps {
  filters: AnalyticsFilters;
  enabled: boolean;
}

export function CourseAnalyticsWidget({
  filters,
  enabled
}: CourseAnalyticsWidgetProps) {
  const {
    data: courseStats,
    isLoading,
    error
  } = useCourseAttendanceStats(filters, enabled);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!courseStats) return [];

    return courseStats
      .slice(0, 10) // Top 10 courses
      .map((course) => ({
        name: course.course_code || course.course_name.slice(0, 10),
        fullName: course.course_name,
        code: course.course_code,
        attendance_percentage: isNaN(course.attendance_percentage)
          ? 0
          : course.attendance_percentage,
        student_attendance: isNaN(course.avg_student_attendance)
          ? 0
          : course.avg_student_attendance,
        taken: course.attendance_taken,
        total: course.total_periods
      }))
      .sort((a, b) => {
        const safeA = isNaN(a.attendance_percentage)
          ? 0
          : a.attendance_percentage;
        const safeB = isNaN(b.attendance_percentage)
          ? 0
          : b.attendance_percentage;
        return safeB - safeA;
      });
  }, [courseStats]);

  // Color based on attendance percentage
  const getColor = (percentage: number) => {
    const safePercentage = isNaN(percentage) ? 0 : percentage;
    if (safePercentage >= 90) return '#22c55e'; // Green
    if (safePercentage >= 75) return '#eab308'; // Yellow
    if (safePercentage >= 50) return '#f97316'; // Orange
    return '#ef4444'; // Red
  };

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    if (!courseStats || courseStats.length === 0) {
      return {
        averageCompletion: 0,
        averageStudentAttendance: 0,
        excellentCount: 0,
        criticalCount: 0
      };
    }

    const averageCompletion = Math.round(
      courseStats.reduce(
        (acc, c) =>
          acc + (isNaN(c.attendance_percentage) ? 0 : c.attendance_percentage),
        0
      ) / courseStats.length
    );
    const averageStudentAttendance = Math.round(
      courseStats.reduce(
        (acc, c) =>
          acc +
          (isNaN(c.avg_student_attendance) ? 0 : c.avg_student_attendance),
        0
      ) / courseStats.length
    );
    const excellentCount = courseStats.filter((c) => {
      const safePercentage = isNaN(c.attendance_percentage)
        ? 0
        : c.attendance_percentage;
      return safePercentage >= 90;
    }).length;
    const criticalCount = courseStats.filter((c) => {
      const safeStudentAttendance = isNaN(c.avg_student_attendance)
        ? 0
        : c.avg_student_attendance;
      return safeStudentAttendance < 60;
    }).length;

    return {
      averageCompletion,
      averageStudentAttendance,
      excellentCount,
      criticalCount
    };
  }, [courseStats]);

  // Prepare distribution data for pie chart
  const distributionData = useMemo(() => {
    if (!courseStats) return [];

    const ranges = [
      { name: 'Excellent (90-100%)', min: 90, max: 100, color: '#22c55e' },
      { name: 'Good (75-89%)', min: 75, max: 89, color: '#eab308' },
      { name: 'Average (50-74%)', min: 50, max: 74, color: '#f97316' },
      { name: 'Poor (0-49%)', min: 0, max: 49, color: '#ef4444' }
    ];

    return ranges.map((range) => ({
      name: range.name,
      count: courseStats.filter((c) => {
        const safePercentage = isNaN(c.attendance_percentage)
          ? 0
          : c.attendance_percentage;
        return safePercentage >= range.min && safePercentage <= range.max;
      }).length,
      color: range.color
    }));
  }, [courseStats]);

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Course-wise Attendance</CardTitle>
          <CardDescription>Attendance statistics by courses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-64 text-muted-foreground'>
            <p>Select institution and date range to view course analytics</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Course-wise Attendance</CardTitle>
          <CardDescription>Attendance statistics by courses</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <Skeleton className='h-64 w-full' />
          <div className='space-y-2'>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className='flex items-center space-x-4'>
                <Skeleton className='h-4 w-32' />
                <Skeleton className='h-4 w-16' />
                <Skeleton className='h-4 w-20' />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Course-wise Attendance</CardTitle>
          <CardDescription>Attendance statistics by courses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-64 text-muted-foreground'>
            <p>Error loading course analytics. Please try again.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!courseStats || courseStats.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Course-wise Attendance</CardTitle>
          <CardDescription>Attendance statistics by courses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-64 text-muted-foreground'>
            <p>No course attendance data found for the selected filters.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Summary Cards */}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <Card className='bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium flex items-center gap-2'>
              <BookOpen className='h-4 w-4 text-purple-600' />
              Total Courses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-purple-600'>
              {courseStats.length}
            </div>
            <p className='text-xs text-muted-foreground'>
              Active in selected period
            </p>
          </CardContent>
        </Card>

        <Card className='bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium flex items-center gap-2'>
              <Activity className='h-4 w-4 text-blue-600' />
              Avg Completion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-blue-600'>
              {summaryStats.averageCompletion}%
            </div>
            <p className='text-xs text-muted-foreground'>
              Attendance taken rate
            </p>
          </CardContent>
        </Card>

        <Card className='bg-gradient-to-br from-teal-50 to-green-50 border-teal-200'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium flex items-center gap-2'>
              <Users className='h-4 w-4 text-teal-600' />
              Avg Student
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-teal-600'>
              {summaryStats.averageStudentAttendance}%
            </div>
            <p className='text-xs text-muted-foreground'>
              Student attendance avg
            </p>
          </CardContent>
        </Card>

        <Card className='bg-gradient-to-br from-red-50 to-rose-50 border-red-200'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium flex items-center gap-2'>
              <AlertTriangle className='h-4 w-4 text-red-600' />
              Critical
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>
              {summaryStats.criticalCount}
            </div>
            <p className='text-xs text-muted-foreground'>
              Below 60% student avg
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Card with Charts and Table */}
      <Card className='bg-gradient-to-br from-purple-50 via-white to-indigo-50 border-purple-200'>
        <CardHeader>
          <CardTitle className='text-2xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-2'>
            <BookOpen className='h-6 w-6' />
            Course-wise Attendance Analytics
          </CardTitle>
          <CardDescription className='text-gray-600'>
            Comprehensive attendance statistics for {courseStats.length} courses
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          {/* Charts Row */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {/* Distribution Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle className='text-sm font-medium flex items-center gap-2'>
                  <PieChartIcon className='h-4 w-4 text-purple-600' />
                  Completion Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='h-64'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <PieChart>
                      <Pie
                        data={distributionData}
                        cx='50%'
                        cy='50%'
                        outerRadius={80}
                        dataKey='count'
                        label={({ name, count, percent }) => {
                          const safePercent = isNaN(percent) ? 0 : percent;
                          return `${count} (${(safePercent * 100).toFixed(
                            0
                          )}%)`;
                        }}
                      >
                        {distributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className='rounded-lg border bg-background p-2 shadow-sm'>
                                <div className='grid gap-1'>
                                  <div className='font-medium'>{data.name}</div>
                                  <div className='text-sm'>
                                    Courses: {data.count}
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Top Courses Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle className='text-sm font-medium flex items-center gap-2'>
                  <Award className='h-4 w-4 text-indigo-600' />
                  Top 10 Course Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='h-64'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={chartData} layout='horizontal'>
                      <CartesianGrid strokeDasharray='3 3' />
                      <XAxis type='number' domain={[0, 100]} fontSize={12} />
                      <YAxis
                        dataKey='name'
                        type='category'
                        width={80}
                        fontSize={10}
                      />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className='rounded-lg border bg-background p-2 shadow-sm'>
                                <div className='grid gap-2'>
                                  <div className='font-medium'>
                                    {data.fullName}
                                  </div>
                                  <div className='text-sm text-muted-foreground'>
                                    {data.code}
                                  </div>
                                  <div className='grid gap-1 text-sm'>
                                    <div>
                                      Completion: {data.attendance_percentage}%
                                    </div>
                                    <div>
                                      Student Avg: {data.student_attendance}%
                                    </div>
                                    <div>
                                      Taken: {data.taken}/{data.total} periods
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar
                        dataKey='attendance_percentage'
                        radius={[0, 4, 4, 0]}
                      >
                        {chartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={getColor(entry.attendance_percentage)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Global Data Table */}
          <div className='space-y-4'>
            <div className='flex items-center justify-between'>
              <h3 className='text-lg font-semibold'>
                Course Attendance Details
              </h3>
              <Badge variant='outline' className='text-sm'>
                {courseStats.length} Total Courses
              </Badge>
            </div>

            <CourseDataTable filters={filters} enabled={enabled} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
