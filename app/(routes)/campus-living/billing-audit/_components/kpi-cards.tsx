'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users,
  BedDouble,
  Receipt,
  UtensilsCrossed,
  ArrowUpCircle,
  IndianRupee,
  Wallet,
  AlertTriangle,
  CalendarClock,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BillingAuditKpis } from '@/types/campus-living-billing-audit';
import { formatInrCompact, formatInt, formatShare } from './format';

interface KpiCardsProps {
  kpis: BillingAuditKpis | undefined;
  isLoading: boolean;
  /** Query string (without '?') that reproduces the current filters on the
   *  learners page, so a card can deep-link into the list it counts. */
  learnersQuery: string;
}

interface KpiDef {
  key: string;
  title: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'warn' | 'bad' | 'good';
  href?: string;
}

const TONE: Record<NonNullable<KpiDef['tone']>, string> = {
  default: '',
  good: 'text-emerald-700 dark:text-emerald-400',
  warn: 'text-amber-700 dark:text-amber-400',
  bad: 'text-red-700 dark:text-red-400'
};

export function KpiCards({ kpis, isLoading, learnersQuery }: KpiCardsProps) {
  if (isLoading || !kpis) {
    return (
      <div className='grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5'>
        {Array.from({ length: 10 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className='pb-2'>
              <Skeleton className='h-4 w-24' />
            </CardHeader>
            <CardContent>
              <Skeleton className='h-7 w-20' />
              <Skeleton className='mt-2 h-3 w-28' />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const q = learnersQuery ? `&${learnersQuery}` : '';
  const link = (finding: string) => `/campus-living/billing-audit/learners?finding=${finding}${q}`;

  const defs: KpiDef[] = [
    {
      key: 'learners',
      title: 'Hostel learners',
      value: formatInt(kpis.hostel_learners),
      sub: `${formatInt(kpis.allocated)} with a bed · ${formatShare(kpis.allocated, kpis.hostel_learners)}`,
      icon: Users,
      href: `/campus-living/billing-audit/learners?finding=all${q}`
    },
    {
      key: 'room',
      title: 'Room bill raised',
      value: formatShare(kpis.room_billed_learners, kpis.hostel_learners),
      sub: `${formatInt(kpis.hostel_learners - kpis.room_billed_learners)} without a room bill`,
      icon: BedDouble,
      tone: kpis.room_billed_learners < kpis.hostel_learners ? 'warn' : 'good',
      href: link('no_room_bill')
    },
    {
      key: 'mess',
      title: 'Mess bill raised',
      value: formatShare(kpis.mess_billed_learners, kpis.hostel_learners),
      sub: `${formatInt(kpis.hostel_learners - kpis.mess_billed_learners)} without a mess bill`,
      icon: UtensilsCrossed,
      tone: kpis.mess_billed_learners < kpis.hostel_learners ? 'warn' : 'good',
      href: link('no_mess_bill')
    },
    {
      key: 'above',
      title: 'Above fee band',
      value: formatInt(kpis.above_band),
      sub: `${formatInt(kpis.upgrade_unbilled)} upgrade not billed · ${formatInrCompact(kpis.upgrade_unbilled_amount)}`,
      icon: ArrowUpCircle,
      tone: kpis.upgrade_unbilled > 0 ? 'bad' : 'default',
      href: link('upgrade_unbilled')
    },
    {
      key: 'billed',
      title: 'Total billed',
      value: formatInrCompact(kpis.total_billed),
      sub: 'Room + mess + upgrade bills, target year',
      icon: Receipt
    },
    {
      key: 'paid',
      title: 'Collected',
      value: formatInrCompact(kpis.total_paid),
      sub: `${formatShare(kpis.total_paid, kpis.total_billed)} of billed`,
      icon: IndianRupee,
      tone: 'good'
    },
    {
      key: 'outstanding',
      title: 'Outstanding',
      value: formatInrCompact(kpis.total_outstanding),
      sub: `${formatInt(kpis.unpaid_learners)} learners owe`,
      icon: Wallet,
      tone: kpis.total_outstanding > 0 ? 'warn' : 'good',
      href: link('unpaid')
    },
    {
      key: 'overdue',
      title: 'Overdue',
      value: formatInrCompact(kpis.overdue_amount),
      sub: `${formatInt(kpis.overdue_learners)} learners past due`,
      icon: CalendarClock,
      tone: kpis.overdue_learners > 0 ? 'bad' : 'good',
      href: link('overdue')
    },
    {
      key: 'mismatch',
      title: 'Amount differs',
      value: formatInt(kpis.amount_mismatch),
      sub: `${formatInt(kpis.no_band)} with no fee band`,
      icon: AlertTriangle,
      tone: kpis.amount_mismatch > 0 ? 'warn' : 'good',
      href: link('amount_mismatch')
    },
    {
      key: 'clean',
      title: 'Clean',
      value: formatInt(kpis.clean),
      sub: `${formatShare(kpis.clean, kpis.hostel_learners)} of hostel learners`,
      icon: CheckCircle2,
      tone: 'good',
      href: link('clean')
    }
  ];

  return (
    <div className='grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5'>
      {defs.map((d) => {
        const Icon = d.icon;
        const body = (
          <Card className={cn('h-full', d.href && 'transition-colors hover:bg-accent/40')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-xs font-medium text-muted-foreground'>{d.title}</CardTitle>
              <Icon className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className={cn('text-2xl font-semibold tracking-tight', TONE[d.tone ?? 'default'])}>
                {d.value}
              </div>
              {d.sub && <p className='mt-1 text-xs text-muted-foreground'>{d.sub}</p>}
            </CardContent>
          </Card>
        );
        return d.href ? (
          <Link key={d.key} href={d.href} className='block'>
            {body}
          </Link>
        ) : (
          <div key={d.key}>{body}</div>
        );
      })}
    </div>
  );
}
