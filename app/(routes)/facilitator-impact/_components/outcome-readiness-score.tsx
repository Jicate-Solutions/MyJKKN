'use client';

import { motion } from 'framer-motion';
import {
  GraduationCap,
  CalendarCheck,
  Target,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  Circle,
  ArrowRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { OutcomeReadinessScore } from '@/types/facilitator-impact';

const STREAM_ICONS: Record<string, any> = {
  GraduationCap,
  CalendarCheck,
  Target,
  Briefcase
};

const STATUS_CONFIG = {
  active: {
    color: 'text-green-600',
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800',
    icon: CheckCircle2,
    label: 'Active'
  },
  partial: {
    color: 'text-amber-600',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    icon: AlertCircle,
    label: 'Partial'
  },
  empty: {
    color: 'text-muted-foreground',
    bg: 'bg-muted/30',
    border: 'border-muted',
    icon: Circle,
    label: 'Not Started'
  }
};

const LEVEL_CONFIG = {
  not_started: {
    color: 'bg-gray-500',
    text: 'text-gray-700 dark:text-gray-300',
    message: 'No outcome data is flowing yet. Activate your first data stream to begin measuring facilitator impact.'
  },
  beginning: {
    color: 'bg-blue-500',
    text: 'text-blue-700 dark:text-blue-300',
    message: 'You\'ve started! One data stream is providing outcome evidence. Keep going.'
  },
  developing: {
    color: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
    message: 'Good progress. Multiple data streams are feeding outcome evidence.'
  },
  established: {
    color: 'bg-green-500',
    text: 'text-green-700 dark:text-green-300',
    message: 'Strong outcome measurement. Most data streams are active.'
  },
  mature: {
    color: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
    message: 'Full outcome visibility. All 4 data streams are actively measuring facilitator impact.'
  }
};

interface OutcomeReadinessProps {
  data?: OutcomeReadinessScore;
  isLoading: boolean;
}

export function OutcomeReadinessScoreCard({
  data,
  isLoading
}: OutcomeReadinessProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-48' />
          <Skeleton className='h-4 w-72' />
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='flex items-center gap-4'>
            <Skeleton className='h-24 w-24 rounded-full' />
            <div className='space-y-2'>
              <Skeleton className='h-8 w-32' />
              <Skeleton className='h-4 w-56' />
            </div>
          </div>
          <div className='grid gap-3 md:grid-cols-2'>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={`stream-sk-${i}`} className='h-24 rounded-lg' />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const levelConfig = LEVEL_CONFIG[data.level];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <Card className='border-2'>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle className='text-xl'>Outcome Readiness Score</CardTitle>
              <CardDescription>
                How ready is your institution to measure facilitator impact by
                learner outcomes?
              </CardDescription>
            </div>
            <Badge
              variant='outline'
              className={`${levelConfig.text} font-semibold`}
            >
              {data.levelLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className='space-y-6'>
          {/* Score Ring + Message */}
          <div className='flex flex-col sm:flex-row items-start sm:items-center gap-6'>
            {/* Circular Score */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className='relative flex-shrink-0'
            >
              <div className='relative w-28 h-28'>
                {/* Background circle */}
                <svg className='w-28 h-28 -rotate-90' viewBox='0 0 100 100'>
                  <circle
                    cx='50'
                    cy='50'
                    r='40'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='8'
                    className='text-muted/30'
                  />
                  <motion.circle
                    cx='50'
                    cy='50'
                    r='40'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='8'
                    strokeLinecap='round'
                    className={levelConfig.text}
                    strokeDasharray={`${data.percentage * 2.51} 251`}
                    initial={{ strokeDasharray: '0 251' }}
                    animate={{
                      strokeDasharray: `${data.percentage * 2.51} 251`
                    }}
                    transition={{ duration: 1.2, delay: 0.3, ease: 'easeOut' }}
                  />
                </svg>
                {/* Center text */}
                <div className='absolute inset-0 flex flex-col items-center justify-center'>
                  <span className='text-2xl font-bold'>
                    {data.activeStreams}/{data.totalStreams}
                  </span>
                  <span className='text-[10px] text-muted-foreground'>
                    streams
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Message */}
            <div className='space-y-3 flex-1'>
              <p className='text-sm text-muted-foreground leading-relaxed'>
                {levelConfig.message}
              </p>
              <Progress
                value={data.percentage}
                className='h-2'
                indicatorClassName={levelConfig.color}
              />
              <p className='text-xs text-muted-foreground'>
                {data.percentage}% outcome measurement capability
              </p>
            </div>
          </div>

          {/* Data Streams Grid */}
          <div className='grid gap-3 md:grid-cols-2'>
            {data.streams.map((stream, index) => {
              const statusConfig = STATUS_CONFIG[stream.status];
              const StatusIcon = statusConfig.icon;
              const StreamIcon =
                STREAM_ICONS[stream.icon] ?? Target;

              return (
                <motion.div
                  key={stream.key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                  className={`rounded-lg border p-4 ${statusConfig.bg} ${statusConfig.border}`}
                >
                  <div className='flex items-start gap-3'>
                    <div
                      className={`p-2 rounded-md ${
                        stream.status === 'empty'
                          ? 'bg-muted'
                          : stream.status === 'partial'
                            ? 'bg-amber-100 dark:bg-amber-900/40'
                            : 'bg-green-100 dark:bg-green-900/40'
                      }`}
                    >
                      <StreamIcon
                        className={`h-4 w-4 ${statusConfig.color}`}
                      />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center justify-between gap-2'>
                        <h4 className='text-sm font-medium truncate'>
                          {stream.label}
                        </h4>
                        <div className='flex items-center gap-1 flex-shrink-0'>
                          <StatusIcon
                            className={`h-3.5 w-3.5 ${statusConfig.color}`}
                          />
                          <span
                            className={`text-xs font-medium ${statusConfig.color}`}
                          >
                            {statusConfig.label}
                          </span>
                        </div>
                      </div>
                      <p className='text-xs text-muted-foreground mt-1'>
                        {stream.status === 'empty'
                          ? stream.activationHint
                          : stream.description}
                      </p>
                      {stream.recordCount > 0 && (
                        <p className='text-xs font-medium mt-1'>
                          {stream.recordCount.toLocaleString()} records
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Call to Action for empty state */}
          {data.level === 'not_started' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className='rounded-lg bg-primary/5 border border-primary/20 p-4'
            >
              <div className='flex items-start gap-3'>
                <ArrowRight className='h-5 w-5 text-primary mt-0.5 flex-shrink-0' />
                <div>
                  <h4 className='text-sm font-semibold text-primary'>
                    Start with Attendance
                  </h4>
                  <p className='text-xs text-muted-foreground mt-1'>
                    The fastest way to begin measuring facilitator impact is to
                    activate daily attendance marking. This requires zero
                    external integration — just start marking attendance in the
                    Academic module.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
