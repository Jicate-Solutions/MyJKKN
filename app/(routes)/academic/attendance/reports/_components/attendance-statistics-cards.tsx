'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users,
  UserCheck,
  UserX,
  TrendingUp,
  TrendingDown,
  Calendar,
  Award,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttendanceStatistics {
  totalSessions: number;
  totalStudents: number;
  averageAttendance: number;
  presentToday: number;
  absentToday: number;
  excellentAttendance: number; // >= 90%
  poorAttendance: number; // < 50%
  attendanceTrend: 'up' | 'down' | 'stable';
  trendPercentage: number | string; // Can be string from service
}

interface AttendanceStatisticsCardsProps {
  statistics?: AttendanceStatistics;
  loading?: boolean;
}

export function AttendanceStatisticsCards({
  statistics,
  loading = false
}: AttendanceStatisticsCardsProps) {
  // Default statistics if none provided
  const stats: AttendanceStatistics = statistics || {
    totalSessions: 0,
    totalStudents: 0,
    averageAttendance: 0,
    presentToday: 0,
    absentToday: 0,
    excellentAttendance: 0,
    poorAttendance: 0,
    attendanceTrend: 'stable',
    trendPercentage: 0
  };

  const cards = [
    {
      title: 'Total Sessions',
      value: stats.totalSessions.toLocaleString(),
      description: 'Attendance records',
      icon: Calendar,
      gradient: 'from-blue-500 to-blue-600',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600'
    },
    {
      title: 'Total Students',
      value: stats.totalStudents.toLocaleString(),
      description: 'Unique students tracked',
      icon: Users,
      gradient: 'from-purple-500 to-purple-600',
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600'
    },
    {
      title: 'Average Attendance',
      value: `${stats.averageAttendance.toFixed(1)}%`,
      description: (
        <span className='flex items-center gap-1'>
          {stats.attendanceTrend === 'up' ? (
            <>
              <TrendingUp className='h-3 w-3 text-green-600' />
              <span className='text-green-600'>+{String(stats.trendPercentage)}%</span>
            </>
          ) : stats.attendanceTrend === 'down' ? (
            <>
              <TrendingDown className='h-3 w-3 text-red-600' />
              <span className='text-red-600'>-{String(stats.trendPercentage)}%</span>
            </>
          ) : (
            <span className='text-gray-600'>Stable</span>
          )}
          <span className='text-muted-foreground'>vs last week</span>
        </span>
      ),
      icon: TrendingUp,
      gradient: 'from-green-500 to-green-600',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600'
    },
    {
      title: "Today's Present",
      value: stats.presentToday.toLocaleString(),
      description: 'Students present today',
      icon: UserCheck,
      gradient: 'from-emerald-500 to-emerald-600',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600'
    },
    {
      title: "Today's Absent",
      value: stats.absentToday.toLocaleString(),
      description: 'Students absent today',
      icon: UserX,
      gradient: 'from-red-500 to-red-600',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600'
    },
    {
      title: 'Excellent Attendance',
      value: stats.excellentAttendance.toLocaleString(),
      description: 'Students with ≥90% attendance',
      icon: Award,
      gradient: 'from-yellow-500 to-yellow-600',
      iconBg: 'bg-yellow-100',
      iconColor: 'text-yellow-600'
    },
    {
      title: 'Need Attention',
      value: stats.poorAttendance.toLocaleString(),
      description: 'Students with <50% attendance',
      icon: AlertTriangle,
      gradient: 'from-orange-500 to-orange-600',
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600'
    },
    {
      title: 'Attendance Rate',
      value: (() => {
        const total = stats.presentToday + stats.absentToday;
        if (total === 0) return 'N/A';
        const rate = (stats.presentToday / total) * 100;
        return `${rate.toFixed(1)}%`;
      })(),
      description: "Today's attendance percentage",
      icon: TrendingUp,
      gradient: 'from-indigo-500 to-indigo-600',
      iconBg: 'bg-indigo-100',
      iconColor: 'text-indigo-600'
    }
  ];

  if (loading) {
    return (
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        {[...Array(8)].map((_, i) => (
          <Card key={i} className='overflow-hidden'>
            <CardHeader className='pb-2'>
              <div className='h-4 w-24 bg-muted animate-pulse rounded' />
            </CardHeader>
            <CardContent>
              <div className='h-8 w-20 bg-muted animate-pulse rounded mb-2' />
              <div className='h-3 w-32 bg-muted animate-pulse rounded' />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card
            key={index}
            className='overflow-hidden border-0 shadow-sm hover:shadow-md transition-shadow'
          >
            <div className={cn('h-1 bg-gradient-to-r', card.gradient)} />
            <CardHeader className='pb-2'>
              <div className='flex items-center justify-between'>
                <CardTitle className='text-sm font-medium text-muted-foreground'>
                  {card.title}
                </CardTitle>
                <div className={cn('p-2 rounded-lg', card.iconBg)}>
                  <Icon className={cn('h-4 w-4', card.iconColor)} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className='flex flex-col gap-1'>
                <div className='text-2xl font-bold'>{card.value}</div>
                <div className='text-xs text-muted-foreground'>
                  {card.description}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}