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
  Legend
} from 'recharts';
import {
  Users,
  BarChart3,
  FileText,
  TrendingUp,
  Award,
  CheckCircle,
  AlertCircle,
  Clock,
  PieChart as PieChartIcon
} from 'lucide-react';
import {
  useFacultyAttendanceStats,
  type AnalyticsFilters
} from '@/hooks/academic/use-attendance-analytics';
import { FacultyDataTable } from './faculty-data-table';

interface FacultyAnalyticsWidgetProps {
  filters: AnalyticsFilters;
  enabled: boolean;
}

export function FacultyAnalyticsWidget({
  filters,
  enabled
}: FacultyAnalyticsWidgetProps) {
  const {
    data: facultyStats,
    isLoading,
    error
  } = useFacultyAttendanceStats(filters, enabled);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!facultyStats) return [];

    return facultyStats
      .slice(0, 10) // Top 10 faculty
      .map((faculty) => ({
        name:
          faculty.staff_name.length > 15
            ? faculty.staff_name.slice(0, 15) + '...'
            : faculty.staff_name,
        fullName: faculty.staff_name,
        percentage: faculty.attendance_percentage,
        taken: faculty.attendance_taken,
        total: faculty.total_periods
      }))
      .sort((a, b) => b.percentage - a.percentage);
  }, [facultyStats]);

  // Color based on attendance percentage
  const getColor = (percentage: number) => {
    if (percentage >= 90) return '#22c55e'; // Green
    if (percentage >= 75) return '#eab308'; // Yellow
    if (percentage >= 50) return '#f97316'; // Orange
    return '#ef4444'; // Red
  };

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    if (!facultyStats || facultyStats.length === 0) {
      return {
        averageCompletion: 0,
        excellentCount: 0,
        needsAttentionCount: 0,
        totalPeriods: 0
      };
    }

    const averageCompletion = Math.round(
      facultyStats.reduce((acc, f) => acc + f.attendance_percentage, 0) /
        facultyStats.length
    );
    const excellentCount = facultyStats.filter(
      (f) => f.attendance_percentage >= 90
    ).length;
    const needsAttentionCount = facultyStats.filter(
      (f) => f.attendance_percentage < 75
    ).length;
    const totalPeriods = facultyStats.reduce(
      (acc, f) => acc + f.total_periods,
      0
    );

    return {
      averageCompletion,
      excellentCount,
      needsAttentionCount,
      totalPeriods
    };
  }, [facultyStats]);

  // Prepare distribution data for pie chart
  const distributionData = useMemo(() => {
    if (!facultyStats) return [];

    const ranges = [
      { name: 'Excellent (90-100%)', min: 90, max: 100, color: '#22c55e' },
      { name: 'Good (75-89%)', min: 75, max: 89, color: '#eab308' },
      { name: 'Average (50-74%)', min: 50, max: 74, color: '#f97316' },
      { name: 'Poor (0-49%)', min: 0, max: 49, color: '#ef4444' }
    ];

    return ranges.map((range) => ({
      name: range.name,
      count: facultyStats.filter(
        (f) =>
          f.attendance_percentage >= range.min &&
          f.attendance_percentage <= range.max
      ).length,
      color: range.color
    }));
  }, [facultyStats]);

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Faculty-wise Attendance</CardTitle>
          <CardDescription>
            Attendance statistics by faculty members
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-64 text-muted-foreground'>
            <p>Select institution and date range to view faculty analytics</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Faculty-wise Attendance</CardTitle>
          <CardDescription>
            Attendance statistics by faculty members
          </CardDescription>
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
          <CardTitle>Faculty-wise Attendance</CardTitle>
          <CardDescription>
            Attendance statistics by faculty members
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-64 text-muted-foreground'>
            <p>Error loading faculty analytics. Please try again.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!facultyStats || facultyStats.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Faculty-wise Attendance</CardTitle>
          <CardDescription>
            Attendance statistics by faculty members
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-64 text-muted-foreground'>
            <p>No faculty attendance data found for the selected filters.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Summary Cards */}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <Card className='bg-gradient-to-br from-green-50 to-emerald-50 border-green-200'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium flex items-center gap-2'>
              <Users className='h-4 w-4 text-green-600' />
              Total Faculty
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>
              {facultyStats.length}
            </div>
            <p className='text-xs text-muted-foreground'>
              Active in selected period
            </p>
          </CardContent>
        </Card>

        <Card className='bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium flex items-center gap-2'>
              <TrendingUp className='h-4 w-4 text-blue-600' />
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

        <Card className='bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium flex items-center gap-2'>
              <CheckCircle className='h-4 w-4 text-emerald-600' />
              Excellent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-emerald-600'>
              {summaryStats.excellentCount}
            </div>
            <p className='text-xs text-muted-foreground'>
              Above 90% completion
            </p>
          </CardContent>
        </Card>

        <Card className='bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium flex items-center gap-2'>
              <AlertCircle className='h-4 w-4 text-amber-600' />
              Needs Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-amber-600'>
              {summaryStats.needsAttentionCount}
            </div>
            <p className='text-xs text-muted-foreground'>
              Below 75% completion
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Card with Charts and Table */}
      <Card className='bg-gradient-to-br from-green-50 via-white to-emerald-50 border-green-200'>
        <CardHeader>
          <CardTitle className='text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent flex items-center gap-2'>
            <Users className='h-6 w-6 text-primary' />
            Faculty-wise Attendance Analytics
          </CardTitle>
          <CardDescription className='text-gray-600'>
            Comprehensive attendance completion statistics for{' '}
            {facultyStats.length} faculty members
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          {/* Global Data Table */}
          <div className='space-y-4'>
            <FacultyDataTable filters={filters} enabled={enabled} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
