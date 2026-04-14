'use client';

import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Users,
  Clock,
  AlertCircle,
  UserCheck
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { ComplianceOverview as ComplianceOverviewData } from '@/types/compliance';

interface ComplianceOverviewProps {
  data?: ComplianceOverviewData;
  isLoading: boolean;
}

const STAT_CARDS = [
  {
    key: 'totalLearners' as const,
    label: 'Total Graduating Learners',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-950/30'
  },
  {
    key: 'cleared' as const,
    label: 'Cleared',
    icon: ShieldCheck,
    color: 'text-green-600',
    bg: 'bg-green-50 dark:bg-green-950/30'
  },
  {
    key: 'inProgress' as const,
    label: 'In Progress',
    icon: Clock,
    color: 'text-amber-600',
    bg: 'bg-amber-50 dark:bg-amber-950/30'
  },
  {
    key: 'registered' as const,
    label: 'Registered',
    icon: UserCheck,
    color: 'text-gray-600',
    bg: 'bg-gray-50 dark:bg-gray-950/30'
  },
  {
    key: 'notStarted' as const,
    label: 'Not Started',
    icon: AlertCircle,
    color: 'text-red-600',
    bg: 'bg-red-50 dark:bg-red-950/30'
  }
];

export function ComplianceOverview({ data, isLoading }: ComplianceOverviewProps) {
  if (isLoading) {
    return (
      <div className='space-y-6'>
        {/* Stat cards skeleton */}
        <div className='grid grid-cols-2 lg:grid-cols-5 gap-4'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className='pt-6'>
                <Skeleton className='h-4 w-24 mb-2' />
                <Skeleton className='h-8 w-16' />
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Progress ring skeleton */}
        <Card>
          <CardContent className='pt-6 flex items-center justify-center'>
            <Skeleton className='h-48 w-48 rounded-full' />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const rate = data.clearanceRate;

  return (
    <div className='space-y-6'>
      {/* Stat Cards */}
      <div className='grid grid-cols-2 lg:grid-cols-5 gap-4'>
        {STAT_CARDS.map((card, index) => {
          const Icon = card.icon;
          const value = data[card.key];

          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card>
                <CardContent className='pt-6'>
                  <div className='flex items-center gap-2 mb-2'>
                    <div className={`p-1.5 rounded-md ${card.bg}`}>
                      <Icon className={`h-4 w-4 ${card.color}`} />
                    </div>
                    <span className='text-xs text-muted-foreground font-medium'>
                      {card.label}
                    </span>
                  </div>
                  <p className='text-2xl font-bold'>{value}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Clearance Rate Ring */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Clearance Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='flex flex-col md:flex-row items-center gap-8'>
              {/* SVG Progress Ring */}
              <div className='relative'>
                <svg width='180' height='180' viewBox='0 0 180 180'>
                  {/* Background circle */}
                  <circle
                    cx='90'
                    cy='90'
                    r='75'
                    fill='none'
                    stroke='currentColor'
                    className='text-muted/20'
                    strokeWidth='12'
                  />
                  {/* Progress circle */}
                  <motion.circle
                    cx='90'
                    cy='90'
                    r='75'
                    fill='none'
                    stroke='currentColor'
                    className={
                      rate >= 80
                        ? 'text-green-500'
                        : rate >= 50
                          ? 'text-amber-500'
                          : 'text-red-500'
                    }
                    strokeWidth='12'
                    strokeLinecap='round'
                    strokeDasharray={`${2 * Math.PI * 75}`}
                    initial={{ strokeDashoffset: 2 * Math.PI * 75 }}
                    animate={{
                      strokeDashoffset:
                        2 * Math.PI * 75 - (rate / 100) * 2 * Math.PI * 75
                    }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    transform='rotate(-90 90 90)'
                  />
                </svg>
                <div className='absolute inset-0 flex flex-col items-center justify-center'>
                  <span className='text-4xl font-bold'>
                    {rate.toFixed(1)}%
                  </span>
                  <span className='text-xs text-muted-foreground'>Cleared</span>
                </div>
              </div>

              {/* Breakdown bars */}
              <div className='flex-1 space-y-4 w-full'>
                <BreakdownBar
                  label='Cleared'
                  value={data.cleared}
                  total={data.totalLearners}
                  color='bg-green-500'
                />
                <BreakdownBar
                  label='In Progress'
                  value={data.inProgress}
                  total={data.totalLearners}
                  color='bg-amber-500'
                />
                <BreakdownBar
                  label='Registered'
                  value={data.registered}
                  total={data.totalLearners}
                  color='bg-gray-400'
                />
                <BreakdownBar
                  label='Not Started'
                  value={data.notStarted}
                  total={data.totalLearners}
                  color='bg-red-500'
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function BreakdownBar({
  label,
  value,
  total,
  color
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className='space-y-1'>
      <div className='flex justify-between text-sm'>
        <span className='text-muted-foreground'>{label}</span>
        <span className='font-medium'>
          {value} ({pct.toFixed(1)}%)
        </span>
      </div>
      <div className='h-2 bg-muted rounded-full overflow-hidden'>
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
