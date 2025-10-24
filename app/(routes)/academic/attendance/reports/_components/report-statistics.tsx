'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Users,
  TrendingUp,
  TrendingDown,
  Calendar,
  BookOpen,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  Loader2,
  Clock,
  UserCheck,
  GraduationCap,
  School,
  BarChart3,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import type { AttendanceStatistics } from '@/types/attendance-reports';

interface ReportStatisticsProps {
  statistics: AttendanceStatistics | null;
  loading: boolean;
  userRole: 'super_admin' | 'admin' | 'faculty' | 'hod';
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

// Gradient color combinations for cards
const GRADIENTS = {
  blue: 'bg-gradient-to-br from-blue-500 to-blue-600',
  green: 'bg-gradient-to-br from-green-500 to-green-600',
  purple: 'bg-gradient-to-br from-purple-500 to-purple-600',
  orange: 'bg-gradient-to-br from-orange-500 to-orange-600',
  pink: 'bg-gradient-to-br from-pink-500 to-pink-600',
  cyan: 'bg-gradient-to-br from-cyan-500 to-cyan-600',
  indigo: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
  red: 'bg-gradient-to-br from-red-500 to-red-600'
};

export function ReportStatistics({
  statistics,
  loading,
  userRole
}: ReportStatisticsProps) {
  const [isClient, setIsClient] = useState(false);
  const [currentDate, setCurrentDate] = useState<string>('');

  useEffect(() => {
    setIsClient(true);
    setCurrentDate(new Date().toLocaleDateString('en', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    }));
  }, []);

  if (loading) {
    return (
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className='p-6'>
              <div className='flex items-center justify-center'>
                <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!statistics) {
    return null;
  }

  // Prepare data for pie chart
  const attendanceDistribution = [
    { name: 'Present', value: statistics.presentToday, color: '#10b981' },
    { name: 'Absent', value: statistics.absentToday, color: '#ef4444' }
  ];

  // Calculate additional metrics
  const attendanceRate = statistics.averageAttendance;
  const isGoodAttendance = attendanceRate >= 75;
  const attendanceStatus = isGoodAttendance ? 'Good' : 'Needs Improvement';
  const attendanceColor = isGoodAttendance ? 'text-green-600' : 'text-red-600';

  // Helper function to format comparison
  const formatComparison = (value: number) => {
    if (value > 0)
      return {
        icon: ArrowUp,
        text: `+${value.toFixed(1)}%`,
        color: 'text-green-500 dark:text-green-400'
      };
    if (value < 0)
      return {
        icon: ArrowDown,
        text: `${value.toFixed(1)}%`,
        color: 'text-red-500 dark:text-red-400'
      };
    return { icon: Minus, text: '0%', color: 'text-gray-500 dark:text-gray-400' };
  };

  const weeklyComp = formatComparison(statistics.weeklyComparison || 0);

  return (
    <div className='space-y-6'>
      {/* Today's Overview Section */}
      <div className='mb-6'>
        <h3 className='text-lg font-semibold mb-4 flex items-center gap-2'>
          <Calendar className='h-5 w-5 text-primary' />
          Today&apos;s Overview
          {isClient && (
            <Badge variant='outline' className='ml-2'>
              {currentDate}
            </Badge>
          )}
        </h3>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
          {/* Today's Classes Card */}
          <Card className='relative overflow-hidden border-0 shadow-lg'>
            <div className={`absolute inset-0 ${GRADIENTS.blue} opacity-10`} />
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 relative'>
              <CardTitle className='text-sm font-medium'>
                Today&apos;s Attendance
              </CardTitle>
              <div className='h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center'>
                <School className='h-5 w-5 text-blue-600' />
              </div>
            </CardHeader>
            <CardContent className='relative'>
              <div className='flex items-baseline gap-2'>
                <span className='text-3xl font-bold text-blue-600'>
                  {statistics.todayClasses || 0}
                </span>
                <span className='text-sm text-muted-foreground'>marked</span>
              </div>
              <div className='flex items-center gap-2 mt-2'>
                <Badge variant='secondary' className='text-xs'>
                  <Clock className='h-3 w-3 mr-1' />
                  {statistics.todayPeriods || 0} periods
                </Badge>
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                Attendance marked for {statistics.todayTotalCapacity || 0}{' '}
                students
              </p>
            </CardContent>
          </Card>

          {/* Today's Present Card */}
          <Card className='relative overflow-hidden border-0 shadow-lg'>
            <div className={`absolute inset-0 ${GRADIENTS.green} opacity-10`} />
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 relative'>
              <CardTitle className='text-sm font-medium'>
                Present Today
              </CardTitle>
              <div className='h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center'>
                <UserCheck className='h-5 w-5 text-green-600' />
              </div>
            </CardHeader>
            <CardContent className='relative'>
              <div className='flex items-baseline gap-2'>
                <span className='text-3xl font-bold text-green-600'>
                  {statistics.presentToday}
                </span>
                <span className='text-sm text-muted-foreground'>students</span>
              </div>
              <div className='mt-2'>
                <div className='flex items-center justify-between text-xs mb-1'>
                  <span>Attendance Rate</span>
                  <span className='font-medium text-green-600'>
                    {statistics.todayAttendanceRate?.toFixed(1) || 0}%
                  </span>
                </div>
                <Progress
                  value={statistics.todayAttendanceRate || 0}
                  className='h-1.5'
                />
              </div>
              <div className='flex items-center gap-1 mt-2'>
                <weeklyComp.icon className={`h-3 w-3 ${weeklyComp.color}`} />
                <span className={`text-xs font-medium ${weeklyComp.color}`}>
                  {weeklyComp.text}
                </span>
                <span className='text-xs text-muted-foreground'>
                  vs last week
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Today's Absent Card */}
          <Card className='relative overflow-hidden border-0 shadow-lg'>
            <div className={`absolute inset-0 ${GRADIENTS.red} opacity-10`} />
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 relative'>
              <CardTitle className='text-sm font-medium'>
                Absent Today
              </CardTitle>
              <div className='h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center'>
                <XCircle className='h-5 w-5 text-red-600' />
              </div>
            </CardHeader>
            <CardContent className='relative'>
              <div className='flex items-baseline gap-2'>
                <span className='text-3xl font-bold text-red-600'>
                  {statistics.absentToday}
                </span>
                <span className='text-sm text-muted-foreground'>students</span>
              </div>
              <div className='mt-2'>
                <div className='flex items-center justify-between text-xs mb-1'>
                  <span>Absence Rate</span>
                  <span className='font-medium text-red-600'>
                    {(
                      (statistics.absentToday /
                        (statistics.presentToday + statistics.absentToday ||
                          1)) *
                      100
                    ).toFixed(1)}
                    %
                  </span>
                </div>
                <Progress
                  value={
                    (statistics.absentToday /
                      (statistics.presentToday + statistics.absentToday || 1)) *
                    100
                  }
                  className='h-1.5'
                />
              </div>
              {statistics.absentToday > statistics.presentToday * 0.25 && (
                <Badge variant='destructive' className='text-xs mt-2'>
                  <AlertTriangle className='h-3 w-3 mr-1' />
                  High Absence Rate
                </Badge>
              )}
            </CardContent>
          </Card>

          {/* Overall Performance Card */}
          <Card className='relative overflow-hidden border-0 shadow-lg'>
            <div
              className={`absolute inset-0 ${GRADIENTS.purple} opacity-10`}
            />
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 relative'>
              <CardTitle className='text-sm font-medium'>Performance</CardTitle>
              <div className='h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center'>
                <BarChart3 className='h-5 w-5 text-purple-600' />
              </div>
            </CardHeader>
            <CardContent className='relative'>
              <div className='flex items-baseline gap-2'>
                <span className='text-3xl font-bold text-purple-600'>
                  {attendanceRate >= 75
                    ? 'Good'
                    : attendanceRate >= 60
                    ? 'Fair'
                    : 'Poor'}
                </span>
              </div>
              <div className='space-y-2 mt-2'>
                <div className='flex items-center justify-between text-xs'>
                  <span className='text-muted-foreground'>Target</span>
                  <span className='font-medium'>75%</span>
                </div>
                <div className='flex items-center justify-between text-xs'>
                  <span className='text-muted-foreground'>Current</span>
                  <span
                    className={`font-medium ${
                      attendanceRate >= 75 ? 'text-green-600' : 'text-amber-600'
                    }`}
                  >
                    {attendanceRate.toFixed(1)}%
                  </span>
                </div>
              </div>
              {attendanceRate >= 75 && (
                <Badge variant='success' className='text-xs mt-2'>
                  <CheckCircle className='h-3 w-3 mr-1' />
                  Meeting Target
                </Badge>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Overall Statistics Section */}
      <div>
        <h3 className='text-lg font-semibold mb-4 flex items-center gap-2'>
          <Activity className='h-5 w-5 text-primary' />
          Overall Statistics
        </h3>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
          {/* Total Classes */}
          <Card className='relative overflow-hidden border-0 shadow-lg'>
            <div
              className={`absolute inset-0 ${GRADIENTS.indigo} opacity-10`}
            />
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 relative'>
              <CardTitle className='text-sm font-medium'>
                Attendance Records
              </CardTitle>
              <div className='h-10 w-10 rounded-full bg-indigo-500/20 flex items-center justify-center'>
                <BookOpen className='h-5 w-5 text-indigo-600' />
              </div>
            </CardHeader>
            <CardContent className='relative'>
              <div className='flex items-baseline gap-2'>
                <span className='text-3xl font-bold text-indigo-600'>
                  {statistics.totalClasses}
                </span>
                <span className='text-sm text-muted-foreground'>periods</span>
              </div>
              <p className='text-xs text-muted-foreground mt-2'>
                Periods with marked attendance
              </p>
            </CardContent>
          </Card>

          {/* Average Attendance */}
          <Card className='relative overflow-hidden border-0 shadow-lg'>
            <div className={`absolute inset-0 ${GRADIENTS.cyan} opacity-10`} />
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 relative'>
              <CardTitle className='text-sm font-medium'>
                Average Attendance
              </CardTitle>
              <div
                className={`h-10 w-10 rounded-full ${
                  isGoodAttendance ? 'bg-cyan-500/20' : 'bg-amber-500/20'
                } flex items-center justify-center`}
              >
                {isGoodAttendance ? (
                  <TrendingUp className='h-5 w-5 text-cyan-600' />
                ) : (
                  <TrendingDown className='h-5 w-5 text-amber-600' />
                )}
              </div>
            </CardHeader>
            <CardContent className='relative'>
              <div className='flex items-baseline gap-2'>
                <span
                  className={`text-3xl font-bold ${
                    isGoodAttendance ? 'text-cyan-600' : 'text-amber-600'
                  }`}
                >
                  {attendanceRate.toFixed(1)}%
                </span>
              </div>
              <div className='mt-3'>
                <Progress value={attendanceRate} className='h-2' />
              </div>
              <div className='text-xs mt-2'>
                Status:{' '}
                <Badge
                  variant={isGoodAttendance ? 'success' : 'secondary'}
                  className='text-xs'
                >
                  {attendanceStatus}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Total Students */}
          <Card className='relative overflow-hidden border-0 shadow-lg'>
            <div
              className={`absolute inset-0 ${GRADIENTS.orange} opacity-10`}
            />
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 relative'>
              <CardTitle className='text-sm font-medium'>
                Total Students
              </CardTitle>
              <div className='h-10 w-10 rounded-full bg-orange-500/20 flex items-center justify-center'>
                <GraduationCap className='h-5 w-5 text-orange-600' />
              </div>
            </CardHeader>
            <CardContent className='relative'>
              <div className='flex items-baseline gap-2'>
                <span className='text-3xl font-bold text-orange-600'>
                  {statistics.totalStudents}
                </span>
                <span className='text-sm text-muted-foreground'>enrolled</span>
              </div>
              <p className='text-xs text-muted-foreground mt-2'>
                Active students in system
              </p>
            </CardContent>
          </Card>

          {/* Total Faculty */}
          <Card className='relative overflow-hidden border-0 shadow-lg'>
            <div className={`absolute inset-0 ${GRADIENTS.pink} opacity-10`} />
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 relative'>
              <CardTitle className='text-sm font-medium'>
                Total Faculty
              </CardTitle>
              <div className='h-10 w-10 rounded-full bg-pink-500/20 flex items-center justify-center'>
                <Users className='h-5 w-5 text-pink-600' />
              </div>
            </CardHeader>
            <CardContent className='relative'>
              <div className='flex items-baseline gap-2'>
                <span className='text-3xl font-bold text-pink-600'>
                  {statistics.totalFaculty}
                </span>
                <span className='text-sm text-muted-foreground'>
                  instructors
                </span>
              </div>
              <p className='text-xs text-muted-foreground mt-2'>
                Active teaching staff
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Charts Row */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {/* Attendance Trend Chart */}
        <Card className='border-0 shadow-lg'>
          <CardHeader className='bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20'>
            <CardTitle className='flex items-center justify-between dark:text-gray-100'>
              <span className='flex items-center gap-2'>
                <TrendingUp className='h-5 w-5 text-blue-600 dark:text-blue-400' />
                Attendance Trend
              </span>
              <Badge variant='outline' className='bg-white dark:bg-gray-800'>
                Last 7 Days
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width='100%' height={250}>
              <LineChart data={statistics.attendanceTrend.slice(-7)}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis
                  dataKey='date'
                  tickFormatter={(date) =>
                    isClient
                      ? new Date(date).toLocaleDateString('en', {
                          weekday: 'short'
                        })
                      : date
                  }
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(date) =>
                    isClient ? new Date(date).toLocaleDateString() : date
                  }
                  formatter={(value: number) => `${value.toFixed(1)}%`}
                />
                <Legend />
                <Line
                  type='monotone'
                  dataKey='percentage'
                  stroke='#3b82f6'
                  strokeWidth={2}
                  name='Attendance %'
                  dot={{ fill: '#3b82f6' }}
                />
                <Line
                  type='monotone'
                  dataKey='present'
                  stroke='#10b981'
                  strokeWidth={2}
                  name='Present'
                  dot={{ fill: '#10b981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Today's Distribution */}
        <Card className='border-0 shadow-lg'>
          <CardHeader className='bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20'>
            <CardTitle className='flex items-center justify-between dark:text-gray-100'>
              <span className='flex items-center gap-2'>
                <BarChart3 className='h-5 w-5 text-green-600 dark:text-green-400' />
                Today&apos;s Attendance
              </span>
              <Badge variant='outline' className='bg-white dark:bg-gray-800'>
                Distribution
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width='100%' height={250}>
              <PieChart>
                <Pie
                  data={attendanceDistribution}
                  cx='50%'
                  cy='50%'
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name}: ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={80}
                  fill='#8884d8'
                  dataKey='value'
                >
                  {attendanceDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
