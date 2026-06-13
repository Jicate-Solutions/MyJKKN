'use client';

// Page-level KPI status strip for the Source detail page. Visible regardless
// of which tab is active. Uses LIFETIME stats (no date filter) so it stays
// stable even when the Distribution tab's date window changes.

import { useQuery } from '@tanstack/react-query';
import {
  Inbox,
  UserCheck,
  UserX,
  Users,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LeadDistributionService } from '@/lib/services/admission/lead-distribution-service';
import type { LeadSourceEnum } from '@/lib/services/admission/source-master-service';

interface SourceStatusCardsProps {
  sourceEnum: LeadSourceEnum;
  institutionId?: string | null;
}

export function SourceStatusCards({
  sourceEnum,
  institutionId,
}: SourceStatusCardsProps) {
  const { data, isLoading } = useQuery({
    queryKey: [
      'lead-distribution',
      sourceEnum,
      'lifetime',
      institutionId ?? 'all',
    ],
    queryFn: () =>
      LeadDistributionService.get({
        sourceEnum,
        fromDate: null,
        toDate: null,
        institutionId,
      }),
  });

  const totalLeads = data?.summary.totalLeads ?? 0;
  const totalAssigned = data?.summary.totalAssigned ?? 0;
  const totalUnassigned = data?.summary.totalUnassigned ?? 0;
  const uniqueCounselors = data?.summary.uniqueCounselors ?? 0;
  const progressionRate = data?.summary.progressionRate ?? 0;
  const conversionRate = data?.summary.conversionRate ?? 0;

  const assignedPct =
    totalLeads > 0 ? Math.round((totalAssigned / totalLeads) * 100) : 0;
  const unassignedPct =
    totalLeads > 0 ? Math.round((totalUnassigned / totalLeads) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatusKpiCard
        icon={<Inbox className="h-4 w-4" />}
        tone="info"
        label="Total leads"
        value={totalLeads}
        subStat="lifetime from this source"
        loading={isLoading}
      />
      <StatusKpiCard
        icon={<UserCheck className="h-4 w-4" />}
        tone="success"
        label="Assigned"
        value={totalAssigned}
        subStat={totalLeads > 0 ? `${assignedPct}% of total` : '—'}
        progressPct={assignedPct}
        status={
          totalLeads > 0 && totalAssigned === totalLeads
            ? { label: 'Fully covered', kind: 'success' }
            : null
        }
        loading={isLoading}
      />
      <StatusKpiCard
        icon={<UserX className="h-4 w-4" />}
        tone={totalUnassigned > 0 ? 'danger' : 'muted'}
        label="Unassigned"
        value={totalUnassigned}
        subStat={totalLeads > 0 ? `${unassignedPct}% of total` : '—'}
        status={
          totalUnassigned > 0
            ? { label: 'Needs action', kind: 'danger' }
            : { label: 'All clear', kind: 'success' }
        }
        loading={isLoading}
      />
      <StatusKpiCard
        icon={<Users className="h-4 w-4" />}
        tone="info"
        label="Counselors"
        value={uniqueCounselors}
        subStat="active on this source"
        loading={isLoading}
      />
      <StatusKpiCard
        icon={<TrendingUp className="h-4 w-4" />}
        tone="info"
        label="Progression rate"
        value={`${progressionRate.toFixed(1)}%`}
        subStat="moving past 'new'"
        progressPct={progressionRate}
        loading={isLoading}
      />
      <StatusKpiCard
        icon={<CheckCircle2 className="h-4 w-4" />}
        tone="success"
        label="Conversion rate"
        value={`${conversionRate.toFixed(1)}%`}
        subStat="leads → enrolled / confirmed"
        progressPct={conversionRate}
        loading={isLoading}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// StatusKpiCard — generic per-KPI tile with tone + optional progress + pill.
// Lives here (rather than in distribution-tab.tsx) because the source page
// header is now its primary consumer.
// ----------------------------------------------------------------------------
type KpiTone = 'info' | 'success' | 'danger' | 'muted';

const TONE_CLASSES: Record<
  KpiTone,
  { card: string; icon: string; value: string; progress: string; iconBg: string }
> = {
  info: {
    card: 'border-blue-200/60',
    icon: 'text-blue-600',
    value: 'text-blue-900',
    progress: 'bg-blue-500',
    iconBg: 'bg-blue-100',
  },
  success: {
    card: 'border-green-200/60',
    icon: 'text-green-600',
    value: 'text-green-900',
    progress: 'bg-green-500',
    iconBg: 'bg-green-100',
  },
  danger: {
    card: 'border-red-300 bg-red-50/40 ring-1 ring-red-200/60',
    icon: 'text-red-600',
    value: 'text-red-900',
    progress: 'bg-red-500',
    iconBg: 'bg-red-100',
  },
  muted: {
    card: 'border-muted',
    icon: 'text-muted-foreground',
    value: 'text-foreground/80',
    progress: 'bg-muted-foreground/40',
    iconBg: 'bg-muted',
  },
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
  progressPct?: number;
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
