'use client';

/**
 * Coverage cards above the payer queue.
 *
 * The queue alone only ever shows what is MISSING, so on its own it cannot say
 * whether 103 outstanding is most of the workforce or a rounding error. These
 * four cards supply that denominator.
 *
 * `total` is derived as recorded + awaiting rather than counted separately.
 * The two inputs come from different sources — an RPC that applies
 * role_has_institution_access, and a count through an !inner embed that applies
 * hr_staff_payroll's own RLS — so a third independent headcount could disagree
 * with their sum and render cards that visibly do not add up. Deriving it makes
 * the arithmetic true by construction.
 */

import { Users, UserCheck, UserX, PieChart } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface PayrollOrgStatsProps {
  /** Active staff with a recorded payer. */
  recorded: number;
  /** Active staff still in the queue. */
  awaiting: number;
  /** Organisations flagged is_payroll_entity — the pickable payers. */
  payingOrganizations: number;
  isLoading: boolean;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = 'default',
  children,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  tone?: 'default' | 'success' | 'warning';
  children?: React.ReactNode;
}) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
  }[tone];

  return (
    <Card>
      <CardContent className='p-4'>
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0'>
            <p className='truncate text-xs font-medium text-muted-foreground'>
              {title}
            </p>
            <p className={cn('mt-1 text-2xl font-semibold tabular-nums', toneClass)}>
              {value}
            </p>
          </div>
          <Icon className={cn('h-4 w-4 shrink-0', toneClass)} aria-hidden />
        </div>
        {subtitle && (
          <p className='mt-1 text-xs text-muted-foreground'>{subtitle}</p>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

export function PayrollOrgStats({
  recorded,
  awaiting,
  payingOrganizations,
  isLoading,
}: PayrollOrgStatsProps) {
  if (isLoading) {
    return (
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className='p-4'>
              <Skeleton className='h-3 w-24' />
              <Skeleton className='mt-2 h-7 w-16' />
              <Skeleton className='mt-2 h-3 w-32' />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const total = recorded + awaiting;
  // Guard the divide: an HR user scoped to an institution with no active staff
  // would otherwise see NaN%.
  const coverage = total > 0 ? Math.round((recorded / total) * 100) : 0;

  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
      <StatCard
        title='Active team members'
        value={total}
        subtitle='In the organisations you can see'
        icon={Users}
      />
      <StatCard
        title='Payer recorded'
        value={recorded}
        subtitle='Included in their payer&rsquo;s payroll run'
        icon={UserCheck}
        tone='success'
      />
      <StatCard
        title='Awaiting a payer'
        value={awaiting}
        subtitle={
          awaiting > 0
            ? 'Left out of every payroll run until recorded'
            : 'Nothing outstanding'
        }
        icon={UserX}
        tone={awaiting > 0 ? 'warning' : 'default'}
      />
      <StatCard
        title='Coverage'
        value={`${coverage}%`}
        icon={PieChart}
        tone={coverage === 100 ? 'success' : 'default'}
      >
        <Progress value={coverage} className='mt-2 h-1.5' />
        <p className='mt-1.5 text-xs text-muted-foreground'>
          {payingOrganizations}{' '}
          {payingOrganizations === 1 ? 'organisation runs' : 'organisations run'} a
          payroll
        </p>
      </StatCard>
    </div>
  );
}
