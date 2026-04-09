'use client';

// app/(routes)/events/marathon/[id]/dashboard/page.tsx
// Marathon event dashboard — 4-quadrant overview with real-time auto-refresh.
// Created: 2026-04-07

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Users,
  IndianRupee,
  CheckSquare,
  Wallet,
  BarChart2,
  UserCheck,
  Building2,
  Map,
  Trophy,
  Award,
  Settings,
  Star,
  ClipboardList,
  RefreshCw,
} from 'lucide-react';
import { useMarathonDashboard } from '@/hooks/events/marathon/use-marathon-dashboard';
import { useMarathonEvent, useUpdateMarathonStatus } from '@/hooks/events/marathon/use-marathon-events';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EventStatus } from '@/types/events';
import { EVENT_STATUS_TRANSITIONS } from '@/types/events';
import { useMarathonAccess } from '@/hooks/events/marathon/use-marathon-access';

// ============================================================================
// Helpers
// ============================================================================

function formatINR(amount: number): string {
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(1)}L`;
  }
  if (amount >= 1000) {
    return `₹${(amount / 1000).toFixed(1)}K`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Event Status Badge
// ============================================================================

const STATUS_MAP: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  draft: { label: 'Draft', variant: 'outline' },
  planning: { label: 'Planning', variant: 'outline' },
  preparation: { label: 'Preparation', variant: 'secondary' },
  execution: { label: 'Execution', variant: 'default' },
  live: { label: 'Live', variant: 'default' },
  post_event: { label: 'Post Event', variant: 'secondary' },
  archived: { label: 'Archived', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  planning: 'Planning',
  preparation: 'Preparation',
  execution: 'Execution',
  live: 'Live',
  post_event: 'Post Event',
  archived: 'Archived',
  cancelled: 'Cancelled',
};

function EventStatusControl({ eventId, status }: { eventId: string; status: EventStatus }) {
  const updateStatus = useUpdateMarathonStatus();
  const config = STATUS_MAP[status] ?? { label: status, variant: 'outline' as const };
  const allowedTransitions = EVENT_STATUS_TRANSITIONS[status] ?? [];

  if (allowedTransitions.length === 0) {
    // No transitions available — show read-only badge
    return (
      <Badge variant={config.variant} className="text-sm px-3 py-1">
        {config.label}
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant={config.variant} className="text-sm px-3 py-1">
        {config.label}
      </Badge>
      <Select
        onValueChange={(newStatus) => {
          updateStatus.mutate({ id: eventId, status: newStatus as EventStatus });
        }}
        disabled={updateStatus.isPending}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="Change status..." />
        </SelectTrigger>
        <SelectContent>
          {allowedTransitions.map((s) => (
            <SelectItem key={s} value={s}>
              → {STATUS_LABELS[s] ?? s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ============================================================================
// Quadrant: Registrations
// ============================================================================

function RegistrationsQuadrant({
  eventId,
  data,
}: {
  eventId: string;
  data: NonNullable<ReturnType<typeof useMarathonDashboard>['data']>;
}) {
  const total = data.total_registrations;
  const checkedIn = data.checked_in_count;
  const checkInPct = total > 0 ? Math.round((checkedIn / total) * 100) : 0;
  const topCategories = data.registrations_by_category.slice(0, 3);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Registrations
            </CardTitle>
          </div>
          <Link href={`/events/marathon/${eventId}/registrations`}>
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2">
              View all
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-3xl font-bold">{total.toLocaleString('en-IN')}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {data.internal_count} internal · {data.external_count} external
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Checked in</span>
            <span>{checkedIn} / {total} ({checkInPct}%)</span>
          </div>
          <Progress value={checkInPct} className="h-1.5" />
        </div>

        {topCategories.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {topCategories.map((c) => {
              const pct = total > 0 ? Math.round((c.count / total) * 100) : 0;
              return (
                <div key={c.category_name} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-4 shrink-0">{pct}%</span>
                  <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-400 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="truncate max-w-[100px]">{c.category_name}</span>
                  <span className="text-muted-foreground shrink-0">{c.count}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 text-xs text-muted-foreground pt-1 border-t">
          <IndianRupee className="h-3 w-3" />
          <span>
            {formatINR(data.payment_collected)} collected ·{' '}
            {data.payment_pending} pending
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Quadrant: Sponsors
// ============================================================================

function SponsorsQuadrant({
  eventId,
  data,
}: {
  eventId: string;
  data: NonNullable<ReturnType<typeof useMarathonDashboard>['data']>;
}) {
  const collected = data.sponsor_total_received;
  const pledged = data.sponsor_total_pledged;
  const collectedPct = pledged > 0 ? Math.round((collected / pledged) * 100) : 0;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500" />
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Sponsors
            </CardTitle>
          </div>
          <Link href={`/events/marathon/${eventId}/sponsors`}>
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2">
              View all
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-3xl font-bold">{formatINR(pledged)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {data.sponsor_count} sponsor{data.sponsor_count !== 1 ? 's' : ''} committed
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Received</span>
            <span>
              {formatINR(collected)} ({collectedPct}%)
            </span>
          </div>
          <Progress value={collectedPct} className="h-1.5" />
        </div>

        <div className="pt-1 border-t">
          <p className="text-xs text-muted-foreground">
            Outstanding: {formatINR(pledged - collected)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Quadrant: Tasks
// ============================================================================

function TasksQuadrant({
  eventId,
  data,
}: {
  eventId: string;
  data: NonNullable<ReturnType<typeof useMarathonDashboard>['data']>;
}) {
  const completedPct =
    data.tasks_total > 0
      ? Math.round((data.tasks_completed / data.tasks_total) * 100)
      : 0;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-green-500" />
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Tasks
            </CardTitle>
          </div>
          <Link href={`/events/marathon/${eventId}/committees`}>
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2">
              View all
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-3xl font-bold">
            {data.tasks_completed}
            <span className="text-lg text-muted-foreground font-normal">
              {' '}/ {data.tasks_total}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">tasks completed</div>
        </div>

        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Progress</span>
            <span>{completedPct}%</span>
          </div>
          <Progress value={completedPct} className="h-1.5" />
        </div>

        {data.tasks_overdue > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-destructive pt-1 border-t">
            <ClipboardList className="h-3.5 w-3.5" />
            <span>{data.tasks_overdue} task{data.tasks_overdue !== 1 ? 's' : ''} overdue</span>
          </div>
        )}

        {data.tasks_overdue === 0 && (
          <div className="pt-1 border-t text-xs text-muted-foreground">
            No overdue tasks
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Quadrant: Budget
// ============================================================================

function BudgetQuadrant({
  eventId,
  data,
}: {
  eventId: string;
  data: NonNullable<ReturnType<typeof useMarathonDashboard>['data']>;
}) {
  const spentPct =
    data.budget_estimated > 0
      ? Math.min(100, Math.round((data.budget_actual / data.budget_estimated) * 100))
      : 0;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-purple-500" />
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Budget
            </CardTitle>
          </div>
          <Link href={`/events/marathon/${eventId}/budget`}>
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2">
              View all
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-3xl font-bold">{formatINR(data.budget_actual)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            of {formatINR(data.budget_estimated)} budgeted
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Spent</span>
            <span>{spentPct}%</span>
          </div>
          <Progress value={spentPct} className="h-1.5" />
        </div>

        <div className="pt-1 border-t text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Income target</span>
            <span className="text-green-600 font-medium">
              {formatINR(data.payment_collected + data.sponsor_total_received)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Quick Navigation Links
// ============================================================================

function QuickNav({ eventId }: { eventId: string }) {
  const links = [
    { label: 'Registrations', href: `/events/marathon/${eventId}/registrations`, icon: Users },
    { label: 'Sponsors', href: `/events/marathon/${eventId}/sponsors`, icon: Star },
    { label: 'Committees', href: `/events/marathon/${eventId}/committees`, icon: UserCheck },
    { label: 'Budget', href: `/events/marathon/${eventId}/budget`, icon: Wallet },
    { label: 'Live Ops', href: `/events/marathon/${eventId}/live`, icon: Map },
    { label: 'Results', href: `/events/marathon/${eventId}/results`, icon: Trophy },
    { label: 'Certificates', href: `/events/marathon/${eventId}/certificates`, icon: Award },
    { label: 'Analytics', href: `/events/marathon/${eventId}/analytics`, icon: BarChart2 },
    { label: 'Settings', href: `/events/marathon/${eventId}/settings`, icon: Settings },
  ];

  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Quick Navigation
      </h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-9 gap-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-transparent hover:border-border hover:bg-muted/50 transition-colors cursor-pointer group text-center">
              <l.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors leading-tight">
                {l.label}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function MarathonDashboardPage() {
  const params = useParams();
  const eventId = params.id as string;
  const access = useMarathonAccess();

  const { data: event, isLoading: eventLoading } = useMarathonEvent(eventId);
  const { data, isLoading, isError, refetch } = useMarathonDashboard(eventId);

  // Block non-admin users — redirect to registrations
  if (!access.isLoading && !access.canManage) {
    if (typeof window !== 'undefined') {
      window.location.href = `/events/marathon/${eventId}/registrations`;
    }
    return null;
  }

  if (eventLoading) {
    return (
      <ContentLayout title="Dashboard">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`${event?.name ?? 'Event'} — Dashboard`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: event?.name ?? '...' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* ── Event Header ────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{event?.name ?? 'Marathon Event'}</h1>
            {event?.tagline && (
              <p className="text-sm text-muted-foreground mt-0.5">{event.tagline}</p>
            )}
            {event?.event_date && (
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(event.event_date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                {event.venue && ` · ${event.venue}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {event?.status && <EventStatusControl eventId={eventId} status={event.status as EventStatus} />}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => refetch()}
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* ── Error State ─────────────────────────────────────────────── */}
        {isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Failed to load some dashboard data. Partial data may be shown.
          </div>
        )}

        {/* ── 4-Quadrant Grid ─────────────────────────────────────────── */}
        {isLoading && !data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RegistrationsQuadrant eventId={eventId} data={data} />
            <SponsorsQuadrant eventId={eventId} data={data} />
            <TasksQuadrant eventId={eventId} data={data} />
            <BudgetQuadrant eventId={eventId} data={data} />
          </div>
        ) : null}

        {/* ── Registration Statistics ──────────────────────────────── */}
        {data && <RegistrationStatistics data={data} />}

        <Separator />

        {/* ── Quick Navigation ────────────────────────────────────────── */}
        <QuickNav eventId={eventId} />
      </div>
    </ContentLayout>
  );
}

// ============================================================================
// Registration Statistics Section
// ============================================================================

function RegistrationStatistics({
  data,
}: {
  data: NonNullable<ReturnType<typeof useMarathonDashboard>['data']>;
}) {
  const total = data.total_registrations;
  if (total === 0) return null;

  const genderData = [
    { label: 'Male', count: data.male_count, color: 'bg-blue-500' },
    { label: 'Female', count: data.female_count, color: 'bg-pink-500' },
    {
      label: 'Other',
      count: total - data.male_count - data.female_count,
      color: 'bg-gray-400',
    },
  ].filter((g) => g.count > 0);

  const institutionData = [...data.registrations_by_institution]
    .sort((a, b) => b.count - a.count);

  const categoryData = [...data.registrations_by_category]
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Registration Statistics</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Overview Stats */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-2xl font-bold">{total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-2xl font-bold">{data.checked_in_count}</div>
                <div className="text-xs text-muted-foreground">Checked In</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-2xl font-bold">{data.internal_count}</div>
                <div className="text-xs text-muted-foreground">Internal</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-2xl font-bold">{data.external_count}</div>
                <div className="text-xs text-muted-foreground">External</div>
              </div>
            </div>

            <Separator />

            {/* Payment Summary */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Payment Collected</span>
                <span className="font-semibold text-green-600">{formatINR(data.payment_collected)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pending Payments</span>
                <span className="font-semibold text-orange-500">{data.payment_pending}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Gender Distribution */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Gender Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Visual bar */}
            <div className="flex h-4 w-full rounded-full overflow-hidden">
              {genderData.map((g) => {
                const pct = total > 0 ? (g.count / total) * 100 : 0;
                return (
                  <div
                    key={g.label}
                    className={`${g.color} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${g.label}: ${g.count} (${Math.round(pct)}%)`}
                  />
                );
              })}
            </div>

            {/* Legend */}
            <div className="space-y-2">
              {genderData.map((g) => {
                const pct = total > 0 ? Math.round((g.count / total) * 100) : 0;
                return (
                  <div key={g.label} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${g.color}`} />
                      <span>{g.label}</span>
                    </div>
                    <span className="font-medium">{g.count} <span className="text-muted-foreground text-xs">({pct}%)</span></span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              By Category
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {categoryData.map((c) => {
              const pct = total > 0 ? Math.round((c.count / total) * 100) : 0;
              return (
                <div key={c.category_name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{c.category_name}</span>
                    <span className="font-medium">{c.count} <span className="text-muted-foreground text-xs">({pct}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Institution-wise Registrations */}
      {institutionData.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Institution-wise Registrations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {institutionData.map((inst, index) => {
                const pct = total > 0 ? Math.round((inst.count / total) * 100) : 0;
                return (
                  <div key={inst.institution_name} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
                      {index + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="truncate">{inst.institution_name}</span>
                        <span className="font-medium shrink-0 ml-2">
                          {inst.count} <span className="text-muted-foreground text-xs">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
