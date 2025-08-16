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
  Legend
} from 'recharts';
import {
  GraduationCap,
  PieChart as PieChartIcon,
  BarChart3,
  Trophy,
  Users,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import {
  useStudentAttendanceStats,
  type AnalyticsFilters
} from '@/hooks/academic/use-attendance-analytics';
import { StudentDataTable } from './student-data-table';
import { Badge } from '@/components/ui/badge';

interface StudentAnalyticsWidgetProps {
  filters: AnalyticsFilters;
  enabled: boolean;
}

export function StudentAnalyticsWidget({
  filters,
  enabled
}: StudentAnalyticsWidgetProps) {
  const {
    data: studentStats,
    isLoading,
    error
  } = useStudentAttendanceStats(filters, enabled);

  // Prepare chart data for attendance distribution
  const distributionData = useMemo(() => {
    if (!studentStats) return [];

    const ranges = [
      { name: 'Excellent (90-100%)', min: 90, max: 100, color: '#22c55e' },
      { name: 'Good (75-89%)', min: 75, max: 89, color: '#eab308' },
      { name: 'Average (50-74%)', min: 50, max: 74, color: '#f97316' },
      { name: 'Poor (0-49%)', min: 0, max: 49, color: '#ef4444' }
    ];

    return ranges.map((range) => ({
      name: range.name,
      count: studentStats.filter((s) => {
        const safePercentage =
          isNaN(s.attendance_percentage) || s.attendance_percentage == null
            ? 0
            : s.attendance_percentage;
        return safePercentage >= range.min && safePercentage <= range.max;
      }).length,
      color: range.color
    }));
  }, [studentStats]);

  // Prepare chart data for top/bottom performers
  const topPerformers = useMemo(() => {
    if (!studentStats) return [];

    return studentStats
      .sort((a, b) => {
        const safeA = isNaN(a.attendance_percentage)
          ? 0
          : a.attendance_percentage;
        const safeB = isNaN(b.attendance_percentage)
          ? 0
          : b.attendance_percentage;
        return safeB - safeA;
      })
      .slice(0, 10)
      .map((student) => ({
        name: student.student_roll_number || student.student_name.slice(0, 15),
        fullName: student.student_name,
        rollNumber: student.student_roll_number,
        percentage: isNaN(student.attendance_percentage)
          ? 0
          : student.attendance_percentage,
        present: student.present_periods,
        total: student.total_periods
      }));
  }, [studentStats]);

  const bottomPerformers = useMemo(() => {
    if (!studentStats) return [];

    return studentStats
      .sort((a, b) => {
        const safeA = isNaN(a.attendance_percentage)
          ? 0
          : a.attendance_percentage;
        const safeB = isNaN(b.attendance_percentage)
          ? 0
          : b.attendance_percentage;
        return safeA - safeB;
      })
      .slice(0, 10);
  }, [studentStats]);

  // Color based on attendance percentage
  const getColor = (percentage: number) => {
    if (percentage >= 90) return '#22c55e'; // Green
    if (percentage >= 75) return '#eab308'; // Yellow
    if (percentage >= 50) return '#f97316'; // Orange
    return '#ef4444'; // Red
  };

  const averageAttendance = useMemo(() => {
    if (!studentStats || studentStats.length === 0) return 0;
    const sum = studentStats.reduce(
      (acc, s) => acc + s.attendance_percentage,
      0
    );
    return Math.round(sum / studentStats.length);
  }, [studentStats]);

  const attendanceComparison = useMemo(() => {
    if (!studentStats || studentStats.length === 0)
      return { above75: 0, below75: 0 };

    const above75 = studentStats.filter(
      (s) => s.attendance_percentage >= 75
    ).length;
    const below75 = studentStats.length - above75;

    return { above75, below75 };
  }, [studentStats]);

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Student-wise Attendance</CardTitle>
          <CardDescription>
            Attendance statistics and distribution by students
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-64 text-muted-foreground'>
            <p>Select institution and date range to view student analytics</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Student-wise Attendance</CardTitle>
          <CardDescription>
            Attendance statistics and distribution by students
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
            <Skeleton className='h-64 w-full' />
            <Skeleton className='h-64 w-full' />
          </div>
          <div className='space-y-2'>
            {Array.from({ length: 8 }).map((_, i) => (
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
          <CardTitle>Student-wise Attendance</CardTitle>
          <CardDescription>
            Attendance statistics and distribution by students
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-64 text-muted-foreground'>
            <p>Error loading student analytics. Please try again.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!studentStats || studentStats.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Student-wise Attendance</CardTitle>
          <CardDescription>
            Attendance statistics and distribution by students
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-64 text-muted-foreground'>
            <p>No student attendance data found for the selected filters.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Summary Cards */}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <Card className='bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium flex items-center gap-2'>
              <Users className='h-4 w-4 text-orange-600' />
              Total Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-orange-600'>
              {studentStats.length}
            </div>
            <p className='text-xs text-muted-foreground'>
              Active in selected period
            </p>
          </CardContent>
        </Card>

        <Card className='bg-gradient-to-br from-green-50 to-emerald-50 border-green-200'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium flex items-center gap-2'>
              <TrendingUp className='h-4 w-4 text-green-600' />
              Average Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>
              {averageAttendance}%
            </div>
            <p className='text-xs text-muted-foreground'>Across all students</p>
          </CardContent>
        </Card>

        <Card className='bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium flex items-center gap-2'>
              <Trophy className='h-4 w-4 text-blue-600' />
              Above 75%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-blue-600'>
              {attendanceComparison.above75}
            </div>
            <p className='text-xs text-muted-foreground'>
              Students with good attendance
            </p>
          </CardContent>
        </Card>

        <Card className='bg-gradient-to-br from-red-50 to-rose-50 border-red-200'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium flex items-center gap-2'>
              <TrendingDown className='h-4 w-4 text-red-600' />
              Below 75%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>
              {attendanceComparison.below75}
            </div>
            <p className='text-xs text-muted-foreground'>Need attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Card with Charts and Table */}
      <Card className='bg-gradient-to-br from-orange-50 via-white to-amber-50 border-orange-200'>
        <CardHeader>
          <CardTitle className='text-2xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent flex items-center gap-2'>
            <GraduationCap className='h-6 w-6' />
            Student-wise Attendance Analytics
          </CardTitle>
          <CardDescription className='text-gray-600'>
            Comprehensive attendance statistics and distribution for{' '}
            {studentStats.length} students
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          {/* Charts Row */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {/* Attendance Distribution Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle className='text-sm font-medium flex items-center gap-2'>
                  <PieChartIcon className='h-4 w-4 text-orange-600' />
                  Attendance Distribution
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
                                    Students: {data.count}
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

            {/* Top Performers Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle className='text-sm font-medium flex items-center gap-2'>
                  <Trophy className='h-4 w-4 text-amber-600' />
                  Top 10 Performers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='h-64'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={topPerformers} layout='horizontal'>
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
                                    {data.rollNumber}
                                  </div>
                                  <div className='grid gap-1 text-sm'>
                                    <div>Attendance: {data.percentage}%</div>
                                    <div>
                                      Present: {data.present}/{data.total}{' '}
                                      periods
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey='percentage' radius={[0, 4, 4, 0]}>
                        {topPerformers.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={getColor(entry.percentage)}
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
                Student Attendance Details
              </h3>
              <Badge variant='outline' className='text-sm'>
                {studentStats.length} Total Students
              </Badge>
            </div>

            <StudentDataTable filters={filters} enabled={enabled} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
