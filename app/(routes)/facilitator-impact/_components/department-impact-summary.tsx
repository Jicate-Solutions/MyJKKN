'use client';

import { motion } from 'framer-motion';
import { Building2, Users, BookOpen, TrendingUp } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { DepartmentImpactSummary } from '@/types/facilitator-impact';

interface DepartmentImpactProps {
  data?: DepartmentImpactSummary[];
  isLoading: boolean;
  totalFacilitators?: number;
}

export function DepartmentImpactView({
  data,
  isLoading,
  totalFacilitators = 0
}: DepartmentImpactProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-48' />
          <Skeleton className='h-4 w-64' />
        </CardHeader>
        <CardContent className='space-y-3'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={`dept-sk-${i}`} className='h-20 w-full' />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Building2 className='h-5 w-5' />
            Department Impact
          </CardTitle>
          <CardDescription>
            No department data available yet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground text-center py-8'>
            Department summaries will appear once facilitators are assigned to
            courses via Staff Planning.
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxFacilitators = Math.max(...data.map((d) => d.facilitatorCount), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
    >
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle className='flex items-center gap-2'>
                <Building2 className='h-5 w-5' />
                Department Impact Summary
              </CardTitle>
              <CardDescription>
                {data.length} departments with active facilitators
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {data.map((dept, index) => {
              const fillPercent = Math.round(
                (dept.facilitatorCount / maxFacilitators) * 100
              );

              return (
                <motion.div
                  key={dept.departmentId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + index * 0.05 }}
                  className='rounded-lg border p-4 hover:bg-muted/30 transition-colors'
                >
                  <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2'>
                    <div>
                      <h4 className='font-medium text-sm'>
                        {dept.departmentName}
                      </h4>
                      <p className='text-xs text-muted-foreground'>
                        {dept.institutionName}
                      </p>
                    </div>
                    <div className='flex items-center gap-3'>
                      <div className='flex items-center gap-1'>
                        <Users className='h-3.5 w-3.5 text-muted-foreground' />
                        <span className='text-sm font-medium'>
                          {dept.facilitatorCount}
                        </span>
                      </div>
                      <div className='flex items-center gap-1'>
                        <BookOpen className='h-3.5 w-3.5 text-muted-foreground' />
                        <span className='text-sm font-medium'>
                          {dept.courseCount}
                        </span>
                      </div>
                      <Badge variant='outline' className='text-xs'>
                        {dept.avgCoursesPerFacilitator} avg
                      </Badge>
                    </div>
                  </div>
                  <Progress
                    value={fillPercent}
                    className='h-1.5'
                    indicatorClassName='bg-primary'
                  />
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
