'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Calendar,
  Clock,
  TrendingUp,
  TrendingDown,
  Users,
  BookOpen,
  AlertTriangle,
  CheckCircle,
  Target,
  Award,
  Activity
} from 'lucide-react';
import type { LearnerAttendanceStats } from '@/types/learner-attendance';

interface AttendanceOverviewCardsProps {
  stats: LearnerAttendanceStats;
  loading?: boolean;
}

export function AttendanceOverviewCards({ stats, loading = false }: AttendanceOverviewCardsProps) {
  if (loading) {
    return (
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6'>
        {[...Array(4)].map((_, i) => (
          <Card key={i} className='animate-pulse  border-0 shadow-md'>
            <CardHeader className='pb-2 p-4 sm:p-6'>
              <div className='h-4 bg-gray-200 rounded w-3/4 '></div>
            </CardHeader>
            <CardContent className='p-4 sm:p-6 pt-0'>
              <div className='space-y-3'>
                <div className='h-8 bg-gray-200 rounded w-1/2 '></div>
                <div className='h-2 bg-gray-200 rounded '></div>
                <div className='h-3 bg-gray-200 rounded w-2/3 '></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const getAttendanceColor = (percentage: number) => {
    if (percentage >= 85) return 'text-green-600';
    if (percentage >= 75) return 'text-blue-600';
    if (percentage >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getAttendanceColorBg = (percentage: number) => {
    if (percentage >= 85) return 'bg-green-100 border-green-200';
    if (percentage >= 75) return 'bg-blue-100 border-blue-200';
    if (percentage >= 60) return 'bg-yellow-100 border-yellow-200';
    return 'bg-red-100 border-red-200';
  };

  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6'>
      {/* Overall Attendance with Enhanced Mobile Design */}
      <Card className={`group border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-white to-gray-50 ${getAttendanceColorBg(stats.overall_percentage)} hover:scale-105 `}>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6'>
          <CardTitle className='text-xs sm:text-sm font-semibold text-gray-700 flex items-center gap-2'>
            <div className='w-2 h-2 bg-blue-500 rounded-full animate-pulse'></div>
            Overall Attendance
          </CardTitle>
          <div className='relative'>
            <Calendar className='h-4 w-4 sm:h-5 sm:w-5 text-blue-600 group-hover:scale-110 transition-transform duration-300' />
            <Target className='absolute -top-1 -right-1 h-2 w-2 text-blue-400 animate-ping' />
          </div>
        </CardHeader>
        <CardContent className='p-4 sm:p-6 pt-0'>
          <div className='text-xl sm:text-2xl font-bold mb-3'>
            <span className={`${getAttendanceColor(stats.overall_percentage)} animate-pulse`}>
              {stats.overall_percentage.toFixed(1)}%
            </span>
          </div>
          <Progress
            value={stats.overall_percentage}
            className='mt-2 h-2 sm:h-3 '
          />
          <p className='text-xs sm:text-sm text-gray-600 mt-3 font-medium'>
            <Activity className='inline h-3 w-3 mr-1' />
            {stats.present_days} of {stats.total_days} days attended
          </p>
          <div className='flex items-center mt-3 p-2 rounded-lg bg-white shadow-inner'>
            {stats.overall_percentage >= 75 ? (
              <CheckCircle className='h-4 w-4 text-green-500 mr-2 animate-bounce' />
            ) : (
              <AlertTriangle className='h-4 w-4 text-red-500 mr-2 animate-pulse' />
            )}
            <span className='text-xs sm:text-sm font-medium'>
              {stats.overall_percentage >= 75 ? 'Meeting requirement' : 'Below 75% requirement'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Period-wise Attendance with Enhanced Mobile Design */}
      <Card className={`group border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-white to-gray-50 ${getAttendanceColorBg(stats.period_percentage)} hover:scale-105 `}>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6'>
          <CardTitle className='text-xs sm:text-sm font-semibold text-gray-700 flex items-center gap-2'>
            <div className='w-2 h-2 bg-purple-500 rounded-full animate-pulse'></div>
            Period Attendance
          </CardTitle>
          <div className='relative'>
            <Clock className='h-4 w-4 sm:h-5 sm:w-5 text-purple-600 group-hover:scale-110 transition-transform duration-300' />
            <div className='absolute -top-1 -right-1 w-2 h-2 bg-purple-400 rounded-full animate-ping'></div>
          </div>
        </CardHeader>
        <CardContent className='p-4 sm:p-6 pt-0'>
          <div className='text-xl sm:text-2xl font-bold mb-3'>
            <span className={`${getAttendanceColor(stats.period_percentage)} animate-pulse`}>
              {stats.period_percentage.toFixed(1)}%
            </span>
          </div>
          <Progress
            value={stats.period_percentage}
            className='mt-2 h-2 sm:h-3 '
          />
          <div className='mt-3 space-y-2'>
            <p className='text-xs sm:text-sm text-gray-600 font-medium bg-white p-2 rounded-md shadow-inner'>
              <Activity className='inline h-3 w-3 mr-1 text-green-500' />
              {stats.attended_periods} of {stats.total_periods} periods attended
            </p>
            <p className='text-xs sm:text-sm text-red-600 font-medium bg-red-50 p-2 rounded-md border border-red-200'>
              <AlertTriangle className='inline h-3 w-3 mr-1 animate-pulse' />
              {stats.missed_periods} periods missed
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Active Courses with Enhanced Mobile Design */}
      <Card className='group border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-white to-gray-50 hover:scale-105 '>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6'>
          <CardTitle className='text-xs sm:text-sm font-semibold text-gray-700 flex items-center gap-2'>
            <div className='w-2 h-2 bg-green-500 rounded-full animate-pulse'></div>
            Active Courses
          </CardTitle>
          <div className='relative'>
            <BookOpen className='h-4 w-4 sm:h-5 sm:w-5 text-green-600 group-hover:scale-110 transition-transform duration-300' />
            <Award className='absolute -top-1 -right-1 h-2 w-2 text-green-400 animate-ping' />
          </div>
        </CardHeader>
        <CardContent className='p-4 sm:p-6 pt-0'>
          <div className='text-xl sm:text-2xl font-bold mb-3 text-green-700 animate-pulse'>
            {stats.course_wise_stats.length}
          </div>
          <div className='space-y-3'>
            {stats.course_wise_stats.slice(0, 2).map((course, index) => (
              <div
                key={course.course_id}
                className='flex justify-between items-center p-2 rounded-lg bg-white shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100'
              >
                <span className='text-xs sm:text-sm text-gray-700 font-medium truncate flex items-center gap-2'>
                  <div className={`w-2 h-2 rounded-full ${
                    course.percentage >= 75 ? 'bg-green-400' : 'bg-red-400'
                  } animate-pulse`}></div>
                  {course.course_code || course.course_name}
                </span>
                <Badge
                  variant={course.percentage >= 75 ? 'default' : 'destructive'}
                  className='text-xs font-bold  hover:scale-105 transition-transform'
                >
                  {course.percentage.toFixed(0)}%
                </Badge>
              </div>
            ))}
          </div>
          {stats.course_wise_stats.length > 2 && (
            <p className='text-xs sm:text-sm text-gray-600 mt-3 p-2 bg-gray-100 rounded-md text-center font-medium'>
              +{stats.course_wise_stats.length - 2} more courses
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent Trend with Enhanced Mobile Design */}
      <Card className='group border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-white to-gray-50 hover:scale-105 '>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6'>
          <CardTitle className='text-xs sm:text-sm font-semibold text-gray-700 flex items-center gap-2'>
            <div className='w-2 h-2 bg-orange-500 rounded-full animate-pulse'></div>
            Recent Trend
          </CardTitle>
          <div className='relative'>
            {stats.recent_trend.length > 0 && (
              stats.recent_trend[stats.recent_trend.length - 1]?.percentage >=
              stats.recent_trend[0]?.percentage ? (
                <TrendingUp className='h-4 w-4 sm:h-5 sm:w-5 text-green-500 group-hover:scale-110 transition-transform duration-300 animate-bounce' />
              ) : (
                <TrendingDown className='h-4 w-4 sm:h-5 sm:w-5 text-red-500 group-hover:scale-110 transition-transform duration-300 animate-bounce' />
              )
            )}
          </div>
        </CardHeader>
        <CardContent className='p-4 sm:p-6 pt-0'>
          <div className='text-xl sm:text-2xl font-bold mb-3'>
            {stats.recent_trend.length > 0 && (
              <span className={`${getAttendanceColor(
                stats.recent_trend[stats.recent_trend.length - 1]?.percentage || 0
              )} animate-pulse`}>
                {(stats.recent_trend[stats.recent_trend.length - 1]?.percentage || 0).toFixed(1)}%
              </span>
            )}
          </div>
          <p className='text-xs sm:text-sm text-gray-600 mt-3 bg-white p-2 rounded-md shadow-inner font-medium'>
            <Activity className='inline h-3 w-3 mr-1 text-orange-500' />
            Last week performance
          </p>
          {stats.alerts.length > 0 && (
            <div className='mt-3'>
              <Badge
                variant='destructive'
                className='text-xs font-bold  animate-pulse shadow-md'
              >
                <AlertTriangle className='h-3 w-3 mr-1' />
                {stats.alerts.length} Alert{stats.alerts.length > 1 ? 's' : ''}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}