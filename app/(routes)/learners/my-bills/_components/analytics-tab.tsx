'use client';

/**
 * Analytics tab for /learners/my-bills.
 *
 * Chart colors were validated with the dataviz palette checker (CVD separation,
 * lightness band, chroma, 3:1 surface contrast — light AND dark):
 *   Paid        #2a78d6 (dark #3987e5)   blue
 *   Outstanding #d03b3b (both modes)     red
 * Blue↔red was chosen over green↔red: deutan ΔE 75.7 vs 12.4 — colorblind-safe
 * without leaning on secondary encoding. Values are exposed as CSS custom
 * properties so both themes swap in one place.
 */

import { CheckCircle2, IndianRupee, ReceiptText, Wallet } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { BillingCategoryKind, MyBill, MyReceipt } from '@/types/billing';
import { FEE_HEAD_LABELS, inr, inrCompact } from './shared';

interface MyBillsAnalyticsProps {
  bills: MyBill[];
  receipts: MyReceipt[];
  totalDue: number;
  totalBilled: number;
  totalPaid: number;
}

const axisTick = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
  color: 'hsl(var(--foreground))',
};

export function MyBillsAnalytics({
  bills,
  receipts,
  totalDue,
  totalBilled,
  totalPaid,
}: MyBillsAnalyticsProps) {
  if (bills.length === 0 && receipts.length === 0) {
    return (
      <Card>
        <CardContent className='py-16 text-center text-sm text-muted-foreground'>
          No billing activity yet — analytics will appear once bills are raised.
        </CardContent>
      </Card>
    );
  }

  // ── Per academic year: paid vs outstanding ─────────────────────────────
  const yearMap = new Map<string, { year: string; paid: number; due: number }>();
  for (const bill of bills) {
    const entry = yearMap.get(bill.academicYear) ?? { year: bill.academicYear, paid: 0, due: 0 };
    entry.paid += bill.paidAmount;
    entry.due += Math.max(0, bill.balanceAmount);
    yearMap.set(bill.academicYear, entry);
  }
  const startYear = (label: string) => {
    const match = /^(\d{4})/.exec(label);
    return match ? Number(match[1]) : Infinity; // "Other" sorts to the end
  };
  const byYear = [...yearMap.values()].sort((a, b) => startYear(a.year) - startYear(b.year));

  // ── Payments by month (net of refunds), most recent 12 buckets ─────────
  const monthMap = new Map<string, { key: string; label: string; amount: number }>();
  for (const receipt of receipts) {
    if (!receipt.paidDate) continue;
    const d = new Date(receipt.paidDate);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const entry = monthMap.get(key) ?? {
      key,
      label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      amount: 0,
    };
    entry.amount += receipt.amount - receipt.refundedAmount;
    monthMap.set(key, entry);
  }
  const byMonth = [...monthMap.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-12);

  // ── Outstanding by fee head ────────────────────────────────────────────
  const headMap = new Map<string, number>();
  for (const bill of bills) {
    if (bill.balanceAmount <= 0) continue;
    const label = bill.kind
      ? FEE_HEAD_LABELS[bill.kind as BillingCategoryKind] ?? bill.kind
      : bill.categoryName ?? 'Other';
    headMap.set(label, (headMap.get(label) ?? 0) + bill.balanceAmount);
  }
  const byHead = [...headMap.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
  const maxHead = byHead[0]?.amount ?? 0;

  const clearedBills = bills.filter((b) => b.balanceAmount <= 0).length;

  return (
    <div className='space-y-4 [--viz-paid:#2a78d6] [--viz-due:#d03b3b] dark:[--viz-paid:#3987e5]'>
      {/* ── Stat tiles ─────────────────────────────────────────────────── */}
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4'>
        <StatTile
          icon={<IndianRupee className='h-4 w-4' />}
          label='Total billed'
          value={inr(totalBilled)}
          sub={`${bills.length} ${bills.length === 1 ? 'bill' : 'bills'}`}
        />
        <StatTile
          icon={<ReceiptText className='h-4 w-4' />}
          label='Total paid'
          value={inr(totalPaid)}
          sub={`${receipts.length} ${receipts.length === 1 ? 'receipt' : 'receipts'}`}
        />
        <StatTile
          icon={<Wallet className='h-4 w-4' />}
          label='Outstanding'
          value={inr(totalDue)}
          valueClassName={totalDue > 0 ? 'text-destructive' : undefined}
          sub={totalDue > 0 ? 'balance remaining' : 'all settled'}
        />
        <StatTile
          icon={<CheckCircle2 className='h-4 w-4' />}
          label='Bills cleared'
          value={`${clearedBills}/${bills.length}`}
          sub='fully paid bills'
        />
      </div>

      {/* ── Paid vs outstanding per academic year ──────────────────────── */}
      <Card>
        <CardHeader className='pb-2'>
          <CardTitle className='text-base'>Fees by academic year</CardTitle>
        </CardHeader>
        <CardContent>
          {byYear.length === 0 ? (
            <ChartEmpty />
          ) : (
            <ResponsiveContainer width='100%' height={280}>
              <BarChart data={byYear} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray='3 3' vertical={false} stroke='hsl(var(--border))' />
                <XAxis dataKey='year' tick={axisTick} tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} />
                <YAxis
                  width={58}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => inrCompact(v)}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                  contentStyle={tooltipStyle}
                  formatter={(value: number) => inr(value)}
                />
                <Legend iconType='circle' iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey='paid' name='Paid' stackId='fees' fill='var(--viz-paid)' maxBarSize={48} />
                <Bar
                  dataKey='due'
                  name='Outstanding'
                  stackId='fees'
                  fill='var(--viz-due)'
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className='grid gap-4 lg:grid-cols-2'>
        {/* ── Payment history by month ─────────────────────────────────── */}
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base'>Payments by month</CardTitle>
          </CardHeader>
          <CardContent>
            {byMonth.length === 0 ? (
              <ChartEmpty message='No payments recorded yet.' />
            ) : (
              <ResponsiveContainer width='100%' height={240}>
                <BarChart data={byMonth} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray='3 3' vertical={false} stroke='hsl(var(--border))' />
                  <XAxis dataKey='label' tick={axisTick} tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} minTickGap={16} />
                  <YAxis
                    width={58}
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => inrCompact(v)}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [inr(value), 'Paid']}
                  />
                  <Bar dataKey='amount' name='Paid' fill='var(--viz-paid)' radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── Outstanding by fee head (direct-labeled bar list) ────────── */}
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base'>Outstanding by fee head</CardTitle>
          </CardHeader>
          <CardContent>
            {byHead.length === 0 ? (
              <ChartEmpty message='Nothing outstanding — all fee heads settled.' />
            ) : (
              <ul className='space-y-3'>
                {byHead.map((head) => (
                  <li key={head.label} className='space-y-1'>
                    <div className='flex items-baseline justify-between gap-3 text-sm'>
                      <span className='min-w-0 truncate'>{head.label}</span>
                      <span className='shrink-0 font-medium tabular-nums'>{inr(head.amount)}</span>
                    </div>
                    <div className='h-2 w-full overflow-hidden rounded-full bg-muted'>
                      <div
                        className='h-full rounded-full bg-[var(--viz-due)]'
                        style={{ width: `${maxHead > 0 ? Math.max(2, (head.amount / maxHead) * 100) : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
  valueClassName = '',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardContent className='space-y-1 p-4'>
        <div className='flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground'>
          {icon}
          {label}
        </div>
        <div className={`text-xl font-bold tabular-nums sm:text-2xl ${valueClassName}`}>{value}</div>
        {sub && <div className='text-xs text-muted-foreground'>{sub}</div>}
      </CardContent>
    </Card>
  );
}

function ChartEmpty({ message = 'No data to chart yet.' }: { message?: string }) {
  return <p className='py-16 text-center text-sm text-muted-foreground'>{message}</p>;
}
