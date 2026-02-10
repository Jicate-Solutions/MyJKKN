'use client';

import { motion } from 'framer-motion';
import {
  Users,
  BookOpen,
  GraduationCap,
  Building2,
  Link2,
  Percent,
  BarChart3,
  Layers
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { FacilitatorImpactOverview } from '@/types/facilitator-impact';

interface ImpactOverviewProps {
  data?: FacilitatorImpactOverview;
  isLoading: boolean;
}

const StatCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  delay = 0,
  badge
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: any;
  color: string;
  delay?: number;
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
        </div>
      </CardContent>
    </Card>
  </motion.div>
);

export function ImpactOverviewStats({ data, isLoading }: ImpactOverviewProps) {
  if (isLoading) {
    return (
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={`loading-${i}`}>
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
      title: 'Total Facilitators',
      value: data.totalFacilitators.toLocaleString(),
      subtitle: 'Active facilitators across all institutions',
      icon: Users,
      color: 'bg-blue-500',
      delay: 0
    },
    {
      title: 'With Course Assignments',
      value: data.facilitatorsWithCourses.toLocaleString(),
      subtitle: 'Facilitators assigned to at least 1 course',
      icon: Link2,
      color: 'bg-green-500',
      delay: 0.1,
      badge:
        data.totalFacilitators > 0
          ? `${data.courseAssignmentRate}%`
          : undefined
    },
    {
      title: 'Total Assignments',
      value: data.totalCourseAssignments.toLocaleString(),
      subtitle: 'Course-facilitator links in the system',
      icon: BookOpen,
      color: 'bg-purple-500',
      delay: 0.2
    },
    {
      title: 'Avg Courses/Facilitator',
      value: data.avgCoursesPerFacilitator.toString(),
      subtitle: 'Among those with assignments',
      icon: BarChart3,
      color: 'bg-orange-500',
      delay: 0.3
    },
    {
      title: 'Learners Reached',
      value: data.totalLearnersReached.toLocaleString(),
      subtitle: 'Active students in the system',
      icon: GraduationCap,
      color: 'bg-teal-500',
      delay: 0.4
    },
    {
      title: 'Unique Courses',
      value: data.uniqueCoursesAssigned.toLocaleString(),
      subtitle: 'Courses with facilitator assignments',
      icon: Layers,
      color: 'bg-indigo-500',
      delay: 0.5
    },
    {
      title: 'Departments Active',
      value: data.departmentsWithAssignments.toLocaleString(),
      subtitle: 'Departments with course plans',
      icon: Building2,
      color: 'bg-pink-500',
      delay: 0.6
    },
    {
      title: 'Assignment Rate',
      value: `${data.courseAssignmentRate}%`,
      subtitle: 'Facilitators linked to courses',
      icon: Percent,
      color:
        data.courseAssignmentRate >= 80
          ? 'bg-green-500'
          : data.courseAssignmentRate >= 50
            ? 'bg-amber-500'
            : 'bg-red-500',
      delay: 0.7
    }
  ];

  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
      {stats.map((stat, index) => (
        <StatCard key={`impact-stat-${stat.title}-${index}`} {...stat} />
      ))}
    </div>
  );
}
