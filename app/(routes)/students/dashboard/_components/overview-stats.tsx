'use client';

import { motion } from 'framer-motion';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  UserMinus,
  GraduationCap,
  TrendingUp,
  TrendingDown,
  CheckCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

interface OverviewStatsProps {
  data?: {
    totalStudents: number;
    activeStudents: number;
    inactiveStudents: number;
    pendingStudents: number;
    exitedStudents: number;
    graduatedStudents: number;
    profileCompletionRate: number;
    completeProfiles: number;
    incompleteProfiles: number;
  };
  isLoading: boolean;
}

export function OverviewStats({ data, isLoading }: OverviewStatsProps) {
  if (isLoading) {
    return (
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-4 w-4' />
            </CardHeader>
            <CardContent>
              <Skeleton className='h-8 w-16 mb-2' />
              <Skeleton className='h-3 w-20' />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const stats = [
    {
      title: 'Total Students',
      value: data.totalStudents,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      description: 'All enrolled students',
      trend: null
    },
    {
      title: 'Active Students',
      value: data.activeStudents,
      icon: UserCheck,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      description: 'Currently active',
      trend:
        data.totalStudents > 0
          ? ((data.activeStudents / data.totalStudents) * 100).toFixed(1) + '%'
          : '0%'
    },
    {
      title: 'Inactive Students',
      value: data.inactiveStudents,
      icon: UserX,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      description: 'Not currently active',
      trend:
        data.totalStudents > 0
          ? ((data.inactiveStudents / data.totalStudents) * 100).toFixed(1) +
            '%'
          : '0%'
    },
    {
      title: 'Pending Students',
      value: data.pendingStudents,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      description: 'Awaiting approval',
      trend:
        data.totalStudents > 0
          ? ((data.pendingStudents / data.totalStudents) * 100).toFixed(1) + '%'
          : '0%'
    },
    {
      title: 'Exited Students',
      value: data.exitedStudents,
      icon: UserMinus,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      description: 'Left the institution',
      trend:
        data.totalStudents > 0
          ? ((data.exitedStudents / data.totalStudents) * 100).toFixed(1) + '%'
          : '0%'
    },
    {
      title: 'Graduated Students',
      value: data.graduatedStudents,
      icon: GraduationCap,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      description: 'Successfully graduated',
      trend:
        data.totalStudents > 0
          ? ((data.graduatedStudents / data.totalStudents) * 100).toFixed(1) +
            '%'
          : '0%'
    },
    {
      title: 'Complete Profiles',
      value: data.completeProfiles,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      description: 'All required fields filled',
      trend: data.profileCompletionRate.toFixed(1) + '%'
    },
    {
      title: 'Incomplete Profiles',
      value: data.incompleteProfiles,
      icon: UserX,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      description: 'Missing required fields',
      trend:
        data.totalStudents > 0
          ? ((data.incompleteProfiles / data.totalStudents) * 100).toFixed(1) +
            '%'
          : '0%'
    }
  ];

  return (
    <div className='space-y-4'>
      {/* Profile Completion Rate Card */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <CheckCircle className='h-5 w-5 text-green-600' />
            Profile Completion Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <span className='text-2xl font-bold'>
                {data.profileCompletionRate.toFixed(1)}%
              </span>
              <Badge
                variant={
                  data.profileCompletionRate > 80 ? 'default' : 'secondary'
                }
              >
                {data.completeProfiles} / {data.totalStudents}
              </Badge>
            </div>
            <Progress value={data.profileCompletionRate} className='h-2' />
            <p className='text-sm text-muted-foreground'>
              {data.completeProfiles} students have complete profiles out of{' '}
              {data.totalStudents} total
            </p>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards Grid */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <Card className='relative overflow-hidden'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-sm font-medium'>
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-full ${stat.bgColor}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className='space-y-1'>
                    <div className='text-2xl font-bold'>
                      {stat.value.toLocaleString()}
                    </div>
                    <div className='flex items-center justify-between'>
                      <p className='text-xs text-muted-foreground'>
                        {stat.description}
                      </p>
                      {stat.trend && (
                        <Badge variant='outline' className='text-xs'>
                          {stat.trend}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
