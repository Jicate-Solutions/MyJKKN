'use client';

// components/events/shared/analytics-board.tsx
// Shared analytics board for ANY event type (Events Platform Promotion PR8).
// Surfaces the format-agnostic core metrics: registration KPIs, payment + ops progress, and
// category / institution / gender / source breakdowns. Per-format packs (e.g. marathon race
// analytics) live on their own pages; this is the common shell.

import {
  BarChart3,
  CheckCircle2,
  CreditCard,
  Loader2,
  Package,
  ShieldCheck,
  Ticket,
  Users,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useEventCoreMetrics } from '@/hooks/events/shared/use-event-analytics';
import type { EventBreakdownRow } from '@/lib/services/events/shared/event-analytics-service';

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        <div className="rounded-md bg-muted p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-xl font-semibold leading-none">{value}</div>
          <div className="truncate text-xs text-muted-foreground">{label}</div>
          {sub && <div className="truncate text-[10px] text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function Breakdown({ title, rows }: { title: string; rows: EventBreakdownRow[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <Card>
      <CardContent className="space-y-2 py-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        {rows.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">No data yet.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.label} className="space-y-0.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{r.label}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {r.count} · {r.percentage}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: max > 0 ? `${Math.round((r.count / max) * 100)}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AnalyticsBoard({
  eventId,
  // canManage is accepted for a consistent board signature; analytics is read-only for everyone.
  canManage: _canManage = true,
}: {
  eventId: string;
  canManage?: boolean;
}) {
  const { data, isLoading } = useEventCoreMetrics(eventId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const m = data;
  if (!m) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No analytics available.</p>;
  }

  const paymentSub =
    m.payment_pending > 0 ? `${m.payment_pending} pending` : m.free > 0 ? `${m.free} free` : undefined;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Event Analytics
        </h3>
        <p className="text-sm text-muted-foreground">
          Registrations, payments and on-the-day progress.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi icon={Users} label="Registrations" value={m.total_registrations} />
        <Kpi icon={CreditCard} label="Paid" value={m.paid} sub={paymentSub} />
        <Kpi icon={CheckCircle2} label="Checked in" value={m.checked_in} />
        <Kpi icon={Package} label="Kit collected" value={m.kit_collected} />
        <Kpi icon={ShieldCheck} label="Certificates" value={m.certificates_issued} />
        <Kpi
          icon={Ticket}
          label="Latest day"
          value={m.registrations_over_time.at(-1)?.count ?? 0}
          sub={m.registrations_over_time.at(-1)?.date}
        />
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Breakdown title="By category" rows={m.by_category} />
        <Breakdown title="By gender" rows={m.by_gender} />
        <Breakdown title="By institution (top 20)" rows={m.by_institution} />
        <Breakdown title="By source" rows={m.by_source} />
      </div>
    </div>
  );
}
