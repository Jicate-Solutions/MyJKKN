// app/(routes)/billing/reports/accountant/_components/report-primitives.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { LucideIcon } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { formatINRCompact, num, chartToken } from './_utils';

const TONE: Record<'default' | 'success' | 'warning' | 'danger', string> = {
  default: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40',
  success: 'text-green-600 bg-green-50 dark:bg-green-950/40',
  warning: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40',
  danger: 'text-red-600 bg-red-50 dark:bg-red-950/40',
};

export interface Kpi {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone?: keyof typeof TONE;
  title?: string;
}

// Match the large-screen column count to the number of cards so a 2-KPI grid
// (e.g. the Cleared tab) doesn't leave two empty columns. Static class strings
// so Tailwind's JIT keeps them.
const LG_COLS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
};
function kpiGridCols(count: number) {
  return `grid grid-cols-1 gap-4 sm:grid-cols-2 ${LG_COLS[count] ?? 'lg:grid-cols-4'}`;
}

export function ReportKpiGrid({ items, loading }: { items: Kpi[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className={kpiGridCols(items.length || 4)}>
        {Array.from({ length: items.length || 4 }).map((_, i) => (
          <Skeleton key={i} className='h-[92px] w-full' />
        ))}
      </div>
    );
  }
  return (
    <div className={kpiGridCols(items.length)}>
      {items.map((k) => (
        <Card key={k.label}>
          <CardContent className='flex items-start justify-between gap-3 p-4'>
            <div className='min-w-0'>
              <p className='text-muted-foreground text-xs font-medium'>{k.label}</p>
              <p className='mt-1 truncate text-2xl font-bold' title={k.title}>{k.value}</p>
              {k.sub && <p className='text-muted-foreground mt-0.5 text-xs'>{k.sub}</p>}
            </div>
            <span className={`rounded-md p-2 ${TONE[k.tone ?? 'default']}`}>
              <k.icon className='h-5 w-5' />
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ReportSection({
  title, action, children,
}: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className='h-full'>
      <CardHeader className='flex flex-row items-center justify-between gap-2 pb-2'>
        <CardTitle className='text-base'>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ChartState({
  loading, empty, children,
}: { loading?: boolean; empty: boolean; children: React.ReactNode }) {
  if (loading) return <Skeleton className='h-[300px] w-full' />;
  if (empty)
    return <p className='text-muted-foreground py-24 text-center text-sm'>No data for the selected filters.</p>;
  return <>{children}</>;
}

interface CurrencyBarProps {
  data: Array<Record<string, unknown>>;
  categoryKey: string;
  valueKey: string;
  loading?: boolean;
  horizontal?: boolean;
}
export function ReportBarChart({ data, categoryKey, valueKey, loading, horizontal }: CurrencyBarProps) {
  const rows = (data ?? []).map((d) => ({ ...d, [valueKey]: num(d[valueKey]) }));
  return (
    <ChartState loading={loading} empty={rows.length === 0}>
      <ResponsiveContainer width='100%' height={320}>
        <BarChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ left: horizontal ? 8 : 4, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray='3 3' vertical={!horizontal} horizontal={horizontal} />
          {horizontal ? (
            <>
              <XAxis type='number' tick={{ fontSize: 11 }} tickFormatter={(v) => formatINRCompact(v)} />
              <YAxis type='category' dataKey={categoryKey} width={130} tick={{ fontSize: 11 }} />
            </>
          ) : (
            <>
              <XAxis dataKey={categoryKey} tick={{ fontSize: 11 }} minTickGap={16} />
              <YAxis width={62} tick={{ fontSize: 11 }} tickFormatter={(v) => formatINRCompact(v)} />
            </>
          )}
          <Tooltip formatter={(v: number) => formatINRCompact(v)} />
          <Bar dataKey={valueKey} radius={[3, 3, 0, 0]} maxBarSize={42} fill={chartToken(0)} />
        </BarChart>
      </ResponsiveContainer>
    </ChartState>
  );
}

interface LineProps {
  data: Array<Record<string, unknown>>;
  categoryKey: string;
  valueKey: string;
  loading?: boolean;
}
export function ReportLineChart({ data, categoryKey, valueKey, loading }: LineProps) {
  const rows = (data ?? []).map((d) => ({ ...d, [valueKey]: num(d[valueKey]) }));
  return (
    <ChartState loading={loading} empty={rows.length === 0}>
      <ResponsiveContainer width='100%' height={320}>
        <LineChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray='3 3' vertical={false} />
          <XAxis dataKey={categoryKey} tick={{ fontSize: 11 }} minTickGap={20} />
          <YAxis width={62} tick={{ fontSize: 11 }} tickFormatter={(v) => formatINRCompact(v)} />
          <Tooltip formatter={(v: number) => formatINRCompact(v)} />
          <Line dataKey={valueKey} stroke={chartToken(1)} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartState>
  );
}

interface DonutProps {
  data: Array<{ label: string; value: number }>;
  loading?: boolean;
}
export function ReportDonutChart({ data, loading }: DonutProps) {
  const rows = (data ?? []).map((d) => ({ label: d.label, value: num(d.value) })).filter((d) => d.value > 0);
  return (
    <ChartState loading={loading} empty={rows.length === 0}>
      <ResponsiveContainer width='100%' height={320}>
        <PieChart>
          <Pie data={rows} dataKey='value' nameKey='label' innerRadius={70} outerRadius={110} paddingAngle={2}>
            {rows.map((_, i) => (<Cell key={i} fill={chartToken(i)} />))}
          </Pie>
          <Tooltip formatter={(v: number) => formatINRCompact(v)} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartState>
  );
}

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: 'left' | 'right';
  /** Native tooltip on the header cell — use to clarify a metric's definition. */
  headerTitle?: string;
}
export function ReportTable<T>({
  columns, rows, loading, empty = 'No rows.',
}: { columns: Column<T>[]; rows: T[]; loading?: boolean; empty?: string }) {
  if (loading) return <Skeleton className='h-64 w-full' />;
  if (!rows.length)
    return <p className='text-muted-foreground py-12 text-center text-sm'>{empty}</p>;
  return (
    <div className='overflow-x-auto'>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c, i) => (
              <TableHead key={i} title={c.headerTitle}
                className={`${c.align === 'right' ? 'text-right' : ''}${c.headerTitle ? ' cursor-help underline decoration-dotted underline-offset-4' : ''}`}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, ri) => (
            <TableRow key={ri}>
              {columns.map((c, ci) => (
                <TableCell key={ci} className={c.align === 'right' ? 'text-right tabular-nums' : ''}>{c.cell(r)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
