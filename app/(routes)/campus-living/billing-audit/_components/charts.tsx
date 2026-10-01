'use client';

import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BILL_CLASS_LABELS,
  FINDING_LABELS,
  type BillingAuditSummary
} from '@/types/campus-living-billing-audit';
import { formatInr, formatInrCompact, formatInt } from './format';

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 6,
  color: 'hsl(var(--popover-foreground))',
  fontSize: 12
} as const;

const COLORS = {
  paid: '#10b981',
  partial: '#f59e0b',
  unpaid: '#ef4444',
  primary: 'hsl(var(--primary))',
  muted: 'hsl(var(--muted-foreground))'
} as const;

function ChartShell({
  title,
  description,
  isLoading,
  empty,
  children,
  height = 260
}: {
  title: string;
  description?: string;
  isLoading: boolean;
  empty: boolean;
  children: React.ReactNode;
  height?: number;
}) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base'>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton style={{ height }} className='w-full' />
        ) : empty ? (
          <div
            style={{ height }}
            className='flex items-center justify-center text-sm text-muted-foreground'
          >
            Nothing in this scope.
          </div>
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

/** Findings as a horizontal bar per finding. Each bar links to the learner
 *  list pre-filtered to that finding. */
export function FindingsBreakdown({
  data,
  isLoading,
  learnersQuery
}: {
  data: BillingAuditSummary['by_finding'] | undefined;
  isLoading: boolean;
  learnersQuery: string;
}) {
  const rows = (data ?? []).map((d) => ({
    ...d,
    label: FINDING_LABELS[d.finding] ?? d.finding
  }));
  const q = learnersQuery ? `&${learnersQuery}` : '';
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base'>Findings</CardTitle>
        <CardDescription>
          Learners per finding (one learner can carry several). Click a row to open the list.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className='h-64 w-full' />
        ) : rows.length === 0 ? (
          <div className='flex h-64 items-center justify-center text-sm text-muted-foreground'>
            No findings — every hostel learner in scope is clean.
          </div>
        ) : (
          <ul className='space-y-2'>
            {rows.map((r) => {
              const max = Math.max(...rows.map((x) => x.learners), 1);
              return (
                <li key={r.finding}>
                  <Link
                    href={`/campus-living/billing-audit/learners?finding=${r.finding}${q}`}
                    className='group block rounded-md px-2 py-1.5 hover:bg-accent/50'
                  >
                    <div className='flex items-center justify-between text-sm'>
                      <span className='font-medium group-hover:underline'>{r.label}</span>
                      <span className='tabular-nums text-muted-foreground'>
                        {formatInt(r.learners)} · {formatInrCompact(r.outstanding)} outstanding
                      </span>
                    </div>
                    <div className='mt-1 h-2 w-full rounded bg-muted'>
                      <div
                        className='h-2 rounded bg-primary/70'
                        style={{ width: `${Math.max(2, (r.learners / max) * 100)}%` }}
                      />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ByInstitutionChart({
  data,
  isLoading
}: {
  data: BillingAuditSummary['by_institution'] | undefined;
  isLoading: boolean;
}) {
  const rows = (data ?? []).map((d) => ({
    name: (d.name ?? 'Unknown').replace(/^JKKN /, ''),
    Collected: d.paid,
    Outstanding: Math.max(d.outstanding - d.overdue, 0),
    Overdue: d.overdue
  }));
  return (
    <ChartShell
      title='Billed by institution'
      description='Collected vs outstanding vs overdue on hostel-kind bills, target year.'
      isLoading={isLoading}
      empty={rows.length === 0}
      height={300}
    >
      <ResponsiveContainer width='100%' height='100%'>
        <BarChart data={rows} layout='vertical' margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray='3 3' stroke='hsl(var(--border))' />
          <XAxis type='number' tickFormatter={(v) => formatInrCompact(v)} fontSize={11} />
          <YAxis type='category' dataKey='name' width={170} fontSize={11} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number) => formatInr(v)}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey='Collected' stackId='a' fill={COLORS.paid} />
          <Bar dataKey='Outstanding' stackId='a' fill={COLORS.partial} />
          <Bar dataKey='Overdue' stackId='a' fill={COLORS.unpaid} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function BillStatusDonut({
  data,
  isLoading
}: {
  data: BillingAuditSummary['by_bill_status'] | undefined;
  isLoading: boolean;
}) {
  const label: Record<string, string> = { paid: 'Paid', partially_paid: 'Partly paid', unpaid: 'Unpaid' };
  const color: Record<string, string> = {
    paid: COLORS.paid,
    partially_paid: COLORS.partial,
    unpaid: COLORS.unpaid
  };
  const rows = (data ?? []).map((d) => ({
    name: label[d.status] ?? d.status,
    key: d.status,
    value: d.bills,
    amount: d.amount
  }));
  return (
    <ChartShell
      title='Bills by status'
      description='Every live hostel-kind bill in scope.'
      isLoading={isLoading}
      empty={rows.length === 0}
    >
      <ResponsiveContainer width='100%' height='100%'>
        <PieChart>
          <Pie data={rows} dataKey='value' nameKey='name' innerRadius={55} outerRadius={90} paddingAngle={2}>
            {rows.map((r) => (
              <Cell key={r.key} fill={color[r.key] ?? COLORS.muted} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number, _n, item) => [
              `${formatInt(v)} bills · ${formatInr((item?.payload as { amount?: number })?.amount ?? 0)}`,
              (item?.payload as { name?: string })?.name ?? ''
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function BillClassChart({
  data,
  isLoading
}: {
  data: BillingAuditSummary['by_bill_class'] | undefined;
  isLoading: boolean;
}) {
  const order = ['room', 'mess', 'room_upgrade', 'mess_upgrade'] as const;
  const rows = order
    .map((k) => (data ?? []).find((d) => d.class === k))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .map((d) => ({ name: BILL_CLASS_LABELS[d.class], Collected: d.paid, Pending: d.pending }));
  return (
    <ChartShell
      title='By bill type'
      description='Room, mess and upgrade lanes — collected vs pending.'
      isLoading={isLoading}
      empty={rows.length === 0}
    >
      <ResponsiveContainer width='100%' height='100%'>
        <BarChart data={rows} margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray='3 3' stroke='hsl(var(--border))' />
          <XAxis dataKey='name' fontSize={11} />
          <YAxis tickFormatter={(v) => formatInrCompact(v)} fontSize={11} width={70} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatInr(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey='Collected' stackId='a' fill={COLORS.paid} />
          <Bar dataKey='Pending' stackId='a' fill={COLORS.partial} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function OverdueAgingChart({
  aging,
  dueSoon,
  isLoading
}: {
  aging: BillingAuditSummary['overdue_aging'] | undefined;
  dueSoon: BillingAuditSummary['due_soon'] | undefined;
  isLoading: boolean;
}) {
  const buckets: Array<{ key: string; name: string; source: 'due' | 'overdue' }> = [
    { key: 'this_week', name: 'Due ≤ 7 days', source: 'due' },
    { key: 'this_month', name: 'Due ≤ 30 days', source: 'due' },
    { key: '1-30', name: 'Overdue 1–30 d', source: 'overdue' },
    { key: '31-60', name: 'Overdue 31–60 d', source: 'overdue' },
    { key: '61-90', name: 'Overdue 61–90 d', source: 'overdue' },
    { key: '90+', name: 'Overdue 90+ d', source: 'overdue' }
  ];
  const rows = buckets.map((b) => {
    const src = b.source === 'due' ? dueSoon : aging;
    const hit = (src ?? []).find((x) => x.bucket === b.key);
    return { name: b.name, amount: hit?.amount ?? 0, bills: hit?.bills ?? 0, source: b.source };
  });
  const empty = rows.every((r) => r.bills === 0);
  return (
    <ChartShell
      title='Due & overdue timeline'
      description='Pending balances by how soon they fall due, or how long they have been overdue.'
      isLoading={isLoading}
      empty={empty}
    >
      <ResponsiveContainer width='100%' height='100%'>
        <BarChart data={rows} margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray='3 3' stroke='hsl(var(--border))' />
          <XAxis dataKey='name' fontSize={10} interval={0} />
          <YAxis tickFormatter={(v) => formatInrCompact(v)} fontSize={11} width={70} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number, _n, item) => [
              `${formatInr(v)} · ${formatInt((item?.payload as { bills?: number })?.bills ?? 0)} bills`,
              'Pending'
            ]}
          />
          <Bar dataKey='amount'>
            {rows.map((r, i) => (
              <Cell key={i} fill={r.source === 'due' ? COLORS.partial : COLORS.unpaid} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
