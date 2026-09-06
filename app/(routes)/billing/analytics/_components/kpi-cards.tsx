'use client';

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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatINRCompact, formatCurrency, num } from './_utils';
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
}

const TONE: Record<NonNullable<KpiCardProps['tone']>, string> = {
  default: 'text-blue-600 bg-blue-50',
  success: 'text-green-600 bg-green-50',
  warning: 'text-amber-600 bg-amber-50',
  danger: 'text-red-600 bg-red-50',
};

function KpiCard({ label, value, sub, icon: Icon, tone = 'default', title }: KpiCardProps) {
  return (
    <Card>
      <CardContent className='flex items-start justify-between gap-3 p-4'>
        <div className='min-w-0'>
          <p className='text-muted-foreground text-xs font-medium'>{label}</p>
          <p className='mt-1 truncate text-2xl font-bold' title={title}>
            {value}
          </p>
          {sub && <p className='text-muted-foreground mt-0.5 text-xs'>{sub}</p>}
        </div>
        <span className={`rounded-md p-2 ${TONE[tone]}`}>
          <Icon className='h-5 w-5' />
        </span>
      </CardContent>
    </Card>
  );
}

export function KpiCards({
  data,
  loading,
  split,
}: {
  data?: BillingAnalyticsOverview;
  loading: boolean;
  /** Management / Government / Unallocated breakdown of the Collected figure. */
  split?: BillingCollectionSplit;
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
        />
        <KpiCard
          label='Collected'
          value={formatINRCompact(collected)}
          sub={`${rate.toFixed(1)}% of billed`}
          icon={TrendingUp}
          tone='success'
          title={formatCurrency(collected)}
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
        />
        <KpiCard
          label='Collection Rate'
          value={`${rate.toFixed(1)}%`}
          sub={`${num(data.bills_paid).toLocaleString('en-IN')} bills fully paid`}
          icon={Percent}
          tone={rate >= 60 ? 'success' : rate >= 30 ? 'warning' : 'danger'}
        />
      </div>

      <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
        <KpiCard
          label='Students Billed'
          value={num(data.students_billed).toLocaleString('en-IN')}
          icon={Users}
          tone='default'
        />
        <KpiCard
          label='Net Collected'
          value={formatINRCompact(data.net_collected)}
          sub='after refunds'
          icon={Wallet}
          tone='success'
          title={formatCurrency(num(data.net_collected))}
        />
        <KpiCard
          label='Discounts'
          value={formatINRCompact(data.total_discounts)}
          icon={BadgePercent}
          tone='warning'
          title={formatCurrency(num(data.total_discounts))}
        />
        <KpiCard
          label='Refunds'
          value={formatINRCompact(data.total_refunds)}
          icon={Undo2}
          tone='warning'
          title={formatCurrency(num(data.total_refunds))}
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
          />
          <KpiCard
            label='Government Collection'
            value={formatINRCompact(split.government_collected)}
            sub='collected on behalf of government'
            icon={Landmark}
            tone='warning'
            title={formatCurrency(num(split.government_collected))}
          />
          <KpiCard
            label='Unallocated'
            value={formatINRCompact(split.unallocated_collected)}
            sub='receipts not linked to any bill'
            icon={HelpCircle}
            tone='default'
            title={formatCurrency(num(split.unallocated_collected))}
          />
        </div>
      )}
    </div>
  );
}
