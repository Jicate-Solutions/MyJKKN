'use client';

import Link from 'next/link';
import { Clock, Target, TrendingUp, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { LearningPath } from '@/types/learning-path';
import {
  PATH_STATUS_LABELS,
  PATH_STATUS_COLORS,
} from '@/types/learning-path';

interface LearningPathCardProps {
  path: LearningPath;
}

export function LearningPathCard({ path }: LearningPathCardProps) {
  const statusLabel = PATH_STATUS_LABELS[path.status] || path.status;
  const statusColor = PATH_STATUS_COLORS[path.status] || 'bg-slate-100 text-slate-800';

  return (
    <Link href={`/learning-paths/${path.id}`}>
      <Card className='hover:shadow-md transition-shadow cursor-pointer'>
        <CardHeader className='pb-3'>
          <div className='flex items-start justify-between'>
            <CardTitle className='text-base font-semibold line-clamp-1'>
              {path.title}
            </CardTitle>
            <Badge className={`${statusColor} text-xs shrink-0 ml-2`} variant='outline'>
              {statusLabel}
            </Badge>
          </div>
          {path.description && (
            <p className='text-sm text-muted-foreground line-clamp-2 mt-1'>
              {path.description}
            </p>
          )}
        </CardHeader>
        <CardContent className='pt-0 space-y-3'>
          {/* Progress */}
          <div className='space-y-1'>
            <div className='flex items-center justify-between text-sm'>
              <span className='text-muted-foreground'>Progress</span>
              <span className='font-medium'>{Number(path.current_progress).toFixed(0)}%</span>
            </div>
            <Progress value={Number(path.current_progress)} className='h-2' />
          </div>

          {/* Meta info */}
          <div className='flex flex-wrap gap-3 text-xs text-muted-foreground'>
            {path.target_role && (
              <div className='flex items-center gap-1'>
                <Target className='h-3 w-3' />
                <span>{path.target_role}</span>
              </div>
            )}
            {path.estimated_duration_weeks && (
              <div className='flex items-center gap-1'>
                <Clock className='h-3 w-3' />
                <span>{path.estimated_duration_weeks}w</span>
              </div>
            )}
            {path.target_completion_date && (
              <div className='flex items-center gap-1'>
                <Calendar className='h-3 w-3' />
                <span>
                  {new Date(path.target_completion_date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
            )}
          </div>

          {/* Competency tags */}
          {path.target_competencies && path.target_competencies.length > 0 && (
            <div className='flex flex-wrap gap-1'>
              {path.target_competencies.slice(0, 3).map((comp: string) => (
                <Badge
                  key={comp}
                  variant='secondary'
                  className='text-xs'
                >
                  {comp}
                </Badge>
              ))}
              {path.target_competencies.length > 3 && (
                <Badge variant='secondary' className='text-xs'>
                  +{path.target_competencies.length - 3}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
