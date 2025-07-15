'use client';

import { motion } from 'framer-motion';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  Target,
  Calendar,
  TrendingUp,
  Award
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StaffOverviewStats } from '@/types/staff';

interface OverviewStatsProps {
  data?: StaffOverviewStats;
  isLoading: boolean;
}

const StatCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  delay = 0,
  trend,
  badge
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: any;
  color: string;
  delay?: number;
  trend?: { value: number; isPositive: boolean };
  badge?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, delay }}
  >
    <Card className='relative overflow-hidden'>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className='h-4 w-4 text-white' />
        </div>
      </CardHeader>
      <CardContent>
        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <div className='text-2xl font-bold'>{value}</div>
            {badge && (
              <Badge variant='secondary' className='text-xs'>
                {badge}
              </Badge>
            )}
          </div>
          <p className='text-xs text-muted-foreground'>{subtitle}</p>
          {trend && (
            <div className='flex items-center space-x-1'>
              <TrendingUp
                className={`h-3 w-3 ${
                  trend.isPositive
                    ? 'text-green-500'
                    : 'text-red-500 rotate-180'
                }`}
              />
              <span
                className={`text-xs ${
                  trend.isPositive ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {Math.abs(trend.value)}%
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  </motion.div>
);

export function OverviewStats({ data, isLoading }: OverviewStatsProps) {
  if (isLoading) {
    return (
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={`loading-card-${i}`}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-8 w-8 rounded-lg' />
            </CardHeader>
            <CardContent>
              <Skeleton className='h-8 w-16 mb-2' />
              <Skeleton className='h-3 w-32' />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const stats = [
    {
      title: 'Total Staff',
      value: data.totalStaff.toLocaleString(),
      subtitle: 'All registered staff members',
      icon: Users,
      color: 'bg-blue-500',
      delay: 0
    },
    {
      title: 'Active Staff',
      value: data.activeStaff.toLocaleString(),
      subtitle: 'Currently active staff',
      icon: UserCheck,
      color: 'bg-green-500',
      delay: 0.1
    },
    {
      title: 'New Hires',
      value: data.newHires.toLocaleString(),
      subtitle: 'Joined this month',
      icon: Calendar,
      color: 'bg-purple-500',
      delay: 0.2
    },
    {
      title: 'Profile Completion',
      value: `${data.profileCompletionRate.toFixed(1)}%`,
      subtitle: 'Average profile completion',
      icon: Target,
      color: 'bg-orange-500',
      delay: 0.3
    },
    {
      title: 'Average Tenure',
      value: `${data.averageTenure.toFixed(1)} yrs`,
      subtitle: 'Average years of service',
      icon: Award,
      color: 'bg-indigo-500',
      delay: 0.4
    },
    {
      title: 'With Profiles',
      value: data.staffWithProfiles.toLocaleString(),
      subtitle: 'Have system profiles',
      icon: UserCheck,
      color: 'bg-teal-500',
      delay: 0.5
    },
    {
      title: 'Without Profiles',
      value: data.staffWithoutProfiles.toLocaleString(),
      subtitle: 'Need profile creation',
      icon: UserX,
      color: 'bg-red-500',
      delay: 0.6
    },
    {
      title: 'Inactive Staff',
      value: data.inactiveStaff.toLocaleString(),
      subtitle: 'Currently inactive',
      icon: Clock,
      color: 'bg-gray-500',
      delay: 0.7
    }
  ];

  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
      {stats.map((stat, index) => (
        <StatCard key={`stat-${stat.title}-${index}`} {...stat} />
      ))}
    </div>
  );
}
