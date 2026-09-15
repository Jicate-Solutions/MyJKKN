'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Wallet,
  TrendingUp,
  AlertTriangle,
  Percent,
  Users,
  BadgePercent,
  Undo2,
  FileText,
  Building2,
  Landmark,
  HelpCircle,
  ArrowUpRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  formatINRCompact,
  formatCurrency,
  num,
  drilldown,
  type DrilldownScope,
} from './_utils';
import type {
  BillingAnalyticsOverview,
  BillingCollectionSplit,
} from '@/types/billing-analytics';

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  title?: string;
  /** Where the figure drills down to. Every card links somewhere (BUG-006102). */
  href: string;
}

const TONE: Record<NonNullable<KpiCardProps['tone']>, string> = {
  default: 'text-blue-600 bg-blue-50',
  success: 'text-green-600 bg-green-50',
  warning: 'text-amber-600 bg-amber-50',
  danger: 'text-red-600 bg-red-50',
};

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
  title,
  href,
}: KpiCardProps) {
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}. View details`}
      className='group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
    >
      <Card className='h-full cursor-pointer transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md'>
        <CardContent className='flex items-start justify-between gap-3 p-4'>
          <div className='min-w-0'>
            <p className='text-muted-foreground flex items-center gap-1 text-xs font-medium'>
              {label}
              <ArrowUpRight className='h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100' />
            </p>
            <p className='mt-1 truncate text-2xl font-bold' title={title}>
              {value}
            </p>
            {sub && (
              <p className='text-muted-foreground mt-0.5 text-xs'>{sub}</p>
            )}
          </div>
          <span className={`rounded-md p-2 ${TONE[tone]}`}>
            <Icon className='h-5 w-5' />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

export function KpiCards({
  data,
  loading,
  split,
  scope,
}: {
  data?: BillingAnalyticsOverview;
  loading: boolean;
  /** Management / Government / Unallocated breakdown of the Collected figure. */
  split?: BillingCollectionSplit;
  /** Active institution + date window, carried into every drill-down link. */
  scope: DrilldownScope;
}) {
  if (loading && !data) {
    return (
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className='h-[92px] w-full' />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const billed = num(data.total_billed);
  const collected = num(data.total_collected);
  const outstanding = num(data.total_outstanding);
  const rate = num(data.collection_rate);

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <KpiCard
          label='Total Billed'
          value={formatINRCompact(billed)}
          sub={`${num(data.total_bills).toLocaleString('en-IN')} bills`}
          icon={FileText}
          tone='default'
          title={formatCurrency(billed)}
          href={drilldown.bills(scope)}
        />
        <KpiCard
          label='Collected'
          value={formatINRCompact(collected)}
          sub={`${rate.toFixed(1)}% of billed`}
          icon={TrendingUp}
          tone='success'
          title={formatCurrency(collected)}
          href={drilldown.receipts(scope)}
        />
        <KpiCard
          label='Outstanding (now)'
          value={formatINRCompact(outstanding)}
          sub={`${num(data.bills_unpaid).toLocaleString('en-IN')} unpaid · ${num(
            data.bills_partially_paid
          ).toLocaleString('en-IN')} partial`}
          icon={AlertTriangle}
          tone='danger'
          title={formatCurrency(outstanding)}
          href={drilldown.bills(scope, { status: 'unpaid' })}
        />
        <KpiCard
          label='Collection Rate'
          value={`${rate.toFixed(1)}%`}
          sub={`${num(data.bills_paid).toLocaleString('en-IN')} bills fully paid`}
          icon={Percent}
          tone={rate >= 60 ? 'success' : rate >= 30 ? 'warning' : 'danger'}
          href={drilldown.bills(scope, { status: 'paid' })}
        />
      </div>

      <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
        <KpiCard
          label='Students Billed'
          value={num(data.students_billed).toLocaleString('en-IN')}
          icon={Users}
          tone='default'
          href={drilldown.students(scope)}
        />
        <KpiCard
          label='Net Collected'
          value={formatINRCompact(data.net_collected)}
          sub='after refunds'
          icon={Wallet}
          tone='success'
          title={formatCurrency(num(data.net_collected))}
          href={drilldown.receipts(scope)}
        />
        <KpiCard
          label='Discounts'
          value={formatINRCompact(data.total_discounts)}
          icon={BadgePercent}
          tone='warning'
          title={formatCurrency(num(data.total_discounts))}
          href={drilldown.discounts()}
        />
        <KpiCard
          label='Refunds'
          value={formatINRCompact(data.total_refunds)}
          icon={Undo2}
          tone='warning'
          title={formatCurrency(num(data.total_refunds))}
          href={drilldown.refunds(scope)}
        />
      </div>

      {split && (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
          <KpiCard
            label='Management Collection'
            value={formatINRCompact(split.management_collected)}
            sub={`${formatINRCompact(split.management_net)} net of refunds`}
            icon={Building2}
            tone='success'
            title={formatCurrency(num(split.management_collected))}
            href={drilldown.receipts(scope, { collection_type: 'management' })}
          />
          <KpiCard
            label='Government Collection'
            value={formatINRCompact(split.government_collected)}
            sub='collected on behalf of government'
            icon={Landmark}
            tone='warning'
            title={formatCurrency(num(split.government_collected))}
            href={drilldown.receipts(scope, { collection_type: 'government' })}
          />
          <KpiCard
            label='Unallocated'
            value={formatINRCompact(split.unallocated_collected)}
            sub='receipts not linked to any bill'
            icon={HelpCircle}
            tone='default'
            title={formatCurrency(num(split.unallocated_collected))}
            href={drilldown.receipts(scope)}
          />
        </div>
      )}
    </div>
  );
}
