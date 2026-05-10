'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Hourglass,
  Inbox,
  TrendingUp,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';

import {
  LeadDistributionService,
  type CounselorDistribution,
} from '@/lib/services/admission/lead-distribution-service';
import type { LeadSourceEnum } from '@/lib/services/admission/source-master-service';
import { DistributePanel } from './distribute/distribute-panel';

const ROLE_LABEL: Record<string, string> = {
  admission_counselor: 'Admission',
  expo_counselor: 'Expo',
  learner_counselor: 'Learner',
  staff_counselor: 'Staff',
};

const ROLE_BADGE: Record<string, string> = {
  admission_counselor: 'bg-blue-100 text-blue-700 border-blue-200',
  expo_counselor: 'bg-purple-100 text-purple-700 border-purple-200',
  learner_counselor: 'bg-amber-100 text-amber-700 border-amber-200',
  staff_counselor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
] as const;

interface DistributionTabProps {
  sourceId: string;
  sourceEnum: LeadSourceEnum;
  institutionId?: string | null;
}

export function DistributionTab({
  sourceId,
  sourceEnum,
  institutionId,
}: DistributionTabProps) {
  const [range, setRange] = useState<{ from: Date; to: Date }>(() => {
    // Default to 30 days. Many sources (expos, fairs, term-start campaigns)
    // produce leads in monthly bursts, so 7 days frequently shows 0 even when
    // the source has hundreds of unassigned/assigned leads — confusing for
    // admins who came here to check their work. 30 days is a better default
    // for the typical admission lead lifecycle.
    const to = new Date();
    const from = subDays(to, 30);
    return { from, to };
  });

  const { data, isLoading, error } = useQuery({
    queryKey: [
      'lead-distribution',
      sourceEnum,
      range.from.toISOString().slice(0, 10),
      range.to.toISOString().slice(0, 10),
      institutionId ?? 'all',
    ],
    queryFn: () =>
      LeadDistributionService.get({
        sourceEnum,
        fromDate: range.from,
        toDate: range.to,
        institutionId,
      }),
  });

  const chartData = useMemo(() => {
    if (!data) return [];
    // Top 10 by total leads, dropping the unassigned bucket from the chart
    return data.perCounselor
      .filter((c) => c.user_id !== null && c.totalLeads > 0)
      .slice(0, 10)
      .map((c) => ({
        name: c.name.length > 16 ? c.name.slice(0, 14) + '…' : c.name,
        fullName: c.name,
        new: c.newLeads,
        progressed: c.progressedLeads,
        conversions: c.conversions,
        lost: c.lostLeads,
      }));
  }, [data]);

  const setPreset = (days: number) => {
    const to = new Date();
    const from = subDays(to, days);
    setRange({ from, to });
  };

  return (
    <div className="space-y-4">
      {/* Distribute Unassigned Leads — placed at the TOP for visibility.
          Styled with a danger accent when there are unassigned leads so it
          reads as "needs attention" the moment the tab opens. The panel
          self-hides into an informational empty state at zero unassigned. */}
      <DistributePanel
        sourceId={sourceId}
        sourceEnum={sourceEnum}
        institutionId={institutionId}
      />

      {/* Date range controls */}
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm font-medium">Window:</div>
            <DatePickerWithRange
              value={{ from: range.from, to: range.to }}
              onChange={(r) =>
                r?.from && r?.to ? setRange({ from: r.from, to: r.to }) : undefined
              }
            />
            <div className="flex items-center gap-1 ml-auto">
              {PRESETS.map((p) => (
                <Button
                  key={p.days}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setPreset(p.days)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            KPIs and the per-counselor breakdown below filter by lead <strong>creation</strong> date in this window.
            The <strong>Distribute Unassigned Leads</strong> panel above this card shows lifetime unassigned counts (not date-filtered) — it can show leads even when the KPIs below show 0 (they were created outside this window).
          </p>
        </CardContent>
      </Card>

      {/* Summary KPIs — six cards in two semantic groups:
            ROW 1 (Lead Status):  Total | Assigned | Unassigned (with action signal)
            ROW 2 (Capacity + Outcomes): Counselors | Progression | Conversion
          Each card has icon, value, sub-stat (denominator/% where useful),
          and a status pill that encodes the "needs action" signal. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatusKpiCard
          icon={<Inbox className="h-4 w-4" />}
          tone="info"
          label="Total leads"
          value={data?.summary.totalLeads ?? 0}
          subStat="in selected window"
          loading={isLoading}
        />
        <StatusKpiCard
          icon={<UserCheck className="h-4 w-4" />}
          tone="success"
          label="Assigned"
          value={data?.summary.totalAssigned ?? 0}
          subStat={(() => {
            const total = data?.summary.totalLeads ?? 0;
            const assigned = data?.summary.totalAssigned ?? 0;
            if (total === 0) return '—';
            return `${Math.round((assigned / total) * 100)}% of total`;
          })()}
          progressPct={(() => {
            const total = data?.summary.totalLeads ?? 0;
            const assigned = data?.summary.totalAssigned ?? 0;
            return total > 0 ? Math.round((assigned / total) * 100) : 0;
          })()}
          status={
            (data?.summary.totalLeads ?? 0) > 0 &&
            (data?.summary.totalAssigned ?? 0) === (data?.summary.totalLeads ?? 0)
              ? { label: 'Fully covered', kind: 'success' }
              : null
          }
          loading={isLoading}
        />
        <StatusKpiCard
          icon={<UserX className="h-4 w-4" />}
          tone={(data?.summary.totalUnassigned ?? 0) > 0 ? 'danger' : 'muted'}
          label="Unassigned"
          value={data?.summary.totalUnassigned ?? 0}
          subStat={(() => {
            const total = data?.summary.totalLeads ?? 0;
            const unassigned = data?.summary.totalUnassigned ?? 0;
            if (total === 0) return '—';
            return `${Math.round((unassigned / total) * 100)}% of total`;
          })()}
          status={
            (data?.summary.totalUnassigned ?? 0) > 0
              ? { label: 'Needs action', kind: 'danger' }
              : { label: 'All clear', kind: 'success' }
          }
          loading={isLoading}
        />
        <StatusKpiCard
          icon={<Users className="h-4 w-4" />}
          tone="info"
          label="Counselors"
          value={data?.summary.uniqueCounselors ?? 0}
          subStat="active on this source"
          loading={isLoading}
        />
        <StatusKpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          tone="info"
          label="Progression rate"
          value={`${(data?.summary.progressionRate ?? 0).toFixed(1)}%`}
          subStat="moving past 'new'"
          progressPct={data?.summary.progressionRate ?? 0}
          loading={isLoading}
        />
        <StatusKpiCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="success"
          label="Conversion rate"
          value={`${(data?.summary.conversionRate ?? 0).toFixed(1)}%`}
          subStat="leads → enrolled / confirmed"
          progressPct={data?.summary.conversionRate ?? 0}
          loading={isLoading}
        />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Top counselors by lead volume
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-64 w-full" />}
          {error && (
            <div className="text-sm text-destructive">
              Failed to load distribution. {(error as Error).message}
            </div>
          )}
          {!isLoading && chartData.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Activity className="mx-auto mb-2 h-6 w-6 opacity-40" />
              No leads from this source in the selected window.
            </div>
          )}
          {!isLoading && chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                  labelFormatter={(label, payload) => {
                    const item = payload?.[0]?.payload as { fullName?: string };
                    return item?.fullName ?? label;
                  }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="conversions" stackId="a" name="Converted" fill="#16a34a" />
                <Bar dataKey="progressed" stackId="a" name="In progress" fill="#2563eb" />
                <Bar dataKey="new" stackId="a" name="New" fill="#94a3b8" />
                <Bar dataKey="lost" stackId="a" name="Lost" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Per-counselor table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Per-counselor breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}

          {!isLoading && (data?.perCounselor.length ?? 0) === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No leads to break down.
            </div>
          )}

          {!isLoading && (data?.perCounselor.length ?? 0) > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Counselor</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right hidden md:table-cell">New</TableHead>
                    <TableHead className="text-right hidden md:table-cell">In progress</TableHead>
                    <TableHead className="text-right">Converted</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Lost</TableHead>
                    <TableHead className="text-right">Progression</TableHead>
                    <TableHead className="text-right">Last assigned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.perCounselor ?? []).map((c) => (
                    <CounselorRow key={c.user_id ?? 'unassigned'} c={c} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

type KpiTone = 'info' | 'success' | 'danger' | 'muted';

const TONE_CLASSES: Record<
  KpiTone,
  { card: string; icon: string; value: string; progress: string; iconBg: string }
> = {
  info:    { card: 'border-blue-200/60',    icon: 'text-blue-600',    value: 'text-blue-900',    progress: 'bg-blue-500',    iconBg: 'bg-blue-100' },
  success: { card: 'border-green-200/60',   icon: 'text-green-600',   value: 'text-green-900',   progress: 'bg-green-500',   iconBg: 'bg-green-100' },
  danger:  { card: 'border-red-300 bg-red-50/40 ring-1 ring-red-200/60', icon: 'text-red-600', value: 'text-red-900', progress: 'bg-red-500', iconBg: 'bg-red-100' },
  muted:   { card: 'border-muted',          icon: 'text-muted-foreground', value: 'text-foreground/80', progress: 'bg-muted-foreground/40', iconBg: 'bg-muted' },
};

function StatusKpiCard({
  icon,
  tone,
  label,
  value,
  subStat,
  progressPct,
  status,
  loading,
}: {
  icon: React.ReactNode;
  tone: KpiTone;
  label: string;
  value: number | string;
  subStat?: string;
  /** 0-100. When provided, renders a thin progress bar at the bottom of the card. */
  progressPct?: number;
  /** Optional status pill in the top-right (e.g., "Needs action"). */
  status?: { label: string; kind: 'success' | 'danger' | 'info' } | null;
  loading?: boolean;
}) {
  const tw = TONE_CLASSES[tone];
  const statusKindClass: Record<'success' | 'danger' | 'info', string> = {
    success: 'bg-green-100 text-green-700 border-green-200',
    danger: 'bg-red-100 text-red-700 border-red-200',
    info: 'bg-blue-100 text-blue-700 border-blue-200',
  };
  return (
    <Card className={tw.card}>
      <CardContent className="px-4 pt-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tw.iconBg} ${tw.icon}`}
            >
              {icon}
            </span>
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
          </div>
          {status && (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${statusKindClass[status.kind]}`}
            >
              {status.kind === 'danger' && <AlertCircle className="h-2.5 w-2.5" />}
              {status.kind === 'success' && <CheckCircle2 className="h-2.5 w-2.5" />}
              {status.label}
            </span>
          )}
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-24" />
        ) : (
          <div className={`mt-1.5 text-2xl font-bold leading-none tabular-nums ${tw.value}`}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
        )}
        {subStat && !loading && (
          <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
            {subStat}
          </div>
        )}
        {typeof progressPct === 'number' && !loading && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${tw.progress}`}
              style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CounselorRow({ c }: { c: CounselorDistribution }) {
  const isUnassigned = !c.user_id;
  return (
    <TableRow className={isUnassigned ? 'bg-orange-50/40' : ''}>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{c.name}</span>
          {c.email && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {c.designation ? `${c.designation} · ` : ''}
              {c.email}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        {isUnassigned ? (
          <Badge variant="outline" className="text-orange-700 border-orange-200">
            Unassigned
          </Badge>
        ) : c.role_key ? (
          <Badge
            variant="outline"
            className={`text-[10px] ${ROLE_BADGE[c.role_key] ?? ''}`}
          >
            {ROLE_LABEL[c.role_key] ?? c.role_key}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {c.totalLeads.toLocaleString()}
      </TableCell>
      <TableCell className="text-right tabular-nums hidden md:table-cell">
        {c.newLeads.toLocaleString()}
      </TableCell>
      <TableCell className="text-right tabular-nums text-blue-700 hidden md:table-cell">
        {c.progressedLeads.toLocaleString()}
      </TableCell>
      <TableCell className="text-right tabular-nums text-green-700">
        {c.conversions.toLocaleString()}
      </TableCell>
      <TableCell className="text-right tabular-nums text-red-700 hidden md:table-cell">
        {c.lostLeads.toLocaleString()}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {c.progressionRate.toFixed(1)}%
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">
        {c.lastAssignedAt ? format(new Date(c.lastAssignedAt), 'MMM d, HH:mm') : '—'}
      </TableCell>
    </TableRow>
  );
}
