// app/(routes)/meetings/adoption/page.tsx
//
// W2-B — Leadership Booking-Page Adoption Scoreboard.
//
// Read-only admin view showing how many principals & HODs across each college
// have a live booking page. Lets the Director track adoption progress and
// chase stragglers who haven't yet claimed a handle or connected Google.
//
// Access gate (rule #27 — explicit 403, never a silent redirect):
//   is_super_admin OR is_admin OR meetings.analytics.view permission.
// Data gate: service-role client reads across ALL institutions (RLS would
//   restrict reads to the caller's own institution, hiding other colleges).
//
// Server component — no client islands needed (purely read-only display).

import { AlertCircle, CheckCircle2, Clock, Link2Off } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { RenameHandleButton } from './_components/rename-handle-button';
import {
  getLeadershipAdoptionData,
  type AdoptionSummary,
  type LeaderStatus,
  type InstitutionRollup,
} from '@/lib/services/meetings/leadership-adoption-service';

export const dynamic = 'force-dynamic';

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Meetings', href: '/meetings/inbox' },
  { label: 'Adoption' },
];

// -----------------------------------------------------------------------
// Status badge helpers
// -----------------------------------------------------------------------

const STATUS_CONFIG = {
  live: {
    label: 'Live',
    icon: CheckCircle2,
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    iconClass: 'text-emerald-600',
  },
  page_not_live: {
    label: 'Page not live',
    icon: Clock,
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    iconClass: 'text-amber-600',
  },
  no_page: {
    label: 'No page',
    icon: Link2Off,
    badgeClass: 'bg-neutral-100 text-neutral-600 border-neutral-200',
    iconClass: 'text-neutral-400',
  },
} as const;

function StatusBadge({ status }: { status: LeaderStatus['status'] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.badgeClass}`}
    >
      <Icon className={`h-3 w-3 ${cfg.iconClass}`} aria-hidden />
      {cfg.label}
    </span>
  );
}

// -----------------------------------------------------------------------
// Progress bar
// -----------------------------------------------------------------------

function AdoptionBar({ live, total }: { live: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((live / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {live}/{total}
      </span>
    </div>
  );
}

// -----------------------------------------------------------------------
// Overall summary strip
// -----------------------------------------------------------------------

function SummaryStrip({ data }: { data: AdoptionSummary }) {
  const livePercent =
    data.totalLeaders === 0 ? 0 : Math.round((data.live / data.totalLeaders) * 100);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card className="rounded-2xl border-neutral-200 shadow-sm">
        <CardContent className="flex flex-col gap-0.5 p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total leaders</p>
          <p className="text-2xl font-bold tabular-nums">{data.totalLeaders}</p>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-emerald-200 shadow-sm bg-emerald-50/40">
        <CardContent className="flex flex-col gap-0.5 p-4">
          <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide">Live</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-700">
            {data.live}
            <span className="ml-1 text-sm font-normal text-emerald-600">({livePercent}%)</span>
          </p>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-amber-200 shadow-sm bg-amber-50/40">
        <CardContent className="flex flex-col gap-0.5 p-4">
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Page not live</p>
          <p className="text-2xl font-bold tabular-nums text-amber-700">{data.pageNotLive}</p>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-neutral-200 shadow-sm">
        <CardContent className="flex flex-col gap-0.5 p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">No page yet</p>
          <p className="text-2xl font-bold tabular-nums">{data.noPage}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------
// Per-institution card
// -----------------------------------------------------------------------

function InstitutionCard({
  inst,
  canRename,
}: {
  inst: InstitutionRollup;
  /** True only for super_admin / admin. Someone holding merely
   *  meetings.analytics.view can read this scoreboard but must not be offered a
   *  write control — viewing adoption and changing somebody's public address are
   *  different powers, and the server action refuses them either way. */
  canRename: boolean;
}) {
  const total = inst.totalPrincipals + inst.totalHods;

  // Sort: live first, then page_not_live, then no_page, then alpha
  const sortedLeaders = [...inst.leaders].sort((a, b) => {
    const order = { live: 0, page_not_live: 1, no_page: 2 };
    const diff = order[a.status] - order[b.status];
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });

  return (
    <Card className="rounded-2xl border-neutral-200 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-tight">
            {inst.institutionName}
          </CardTitle>
          <div className="flex shrink-0 gap-1">
            <Badge variant="secondary" className="rounded-full px-2 text-xs">
              {inst.totalPrincipals}P / {inst.totalHods}H
            </Badge>
          </div>
        </div>
        <AdoptionBar live={inst.live} total={total} />
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            {inst.live} live
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-amber-600" />
            {inst.pageNotLive} not live
          </span>
          <span className="flex items-center gap-1">
            <Link2Off className="h-3 w-3 text-neutral-400" />
            {inst.noPage} no page
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-neutral-100">
          {sortedLeaders.map((leader) => (
            <div
              key={leader.id}
              className="flex items-center justify-between gap-2 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate font-medium">{leader.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground capitalize">
                  {leader.role}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {leader.handle && (
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    @{leader.handle}
                  </span>
                )}
                {canRename && leader.handle && (
                  <RenameHandleButton
                    hostProfileId={leader.id}
                    currentHandle={leader.handle}
                    personName={leader.name}
                  />
                )}
                <StatusBadge status={leader.status} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------
// Access-denied card (rule #27 — explicit message, no redirect)
// -----------------------------------------------------------------------

function AccessDenied() {
  return (
    <ContentLayout title="Meetings Adoption">
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="mt-8 flex justify-center">
        <Card className="w-full max-w-md rounded-2xl border-neutral-200 shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <h3 className="text-sm font-medium">You don&apos;t have access to this page</h3>
            <p className="text-xs text-muted-foreground">
              Contact an administrator to request the{' '}
              <code className="rounded bg-muted px-1">meetings.analytics.view</code> permission.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

// -----------------------------------------------------------------------
// Page — server component
// -----------------------------------------------------------------------

export default async function MeetingsAdoptionPage() {
  // 1. Session check — get the authenticated user's client for RPC permission calls.
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    // Not signed in — let the middleware handle the redirect to /auth/login.
    // (proxy.ts already does this; falling through to render an empty page
    // would be confusing, so we render the same denial card for clarity.)
    return <AccessDenied />;
  }

  // 2. Permission gate: allow super_admin OR admin OR meetings.analytics.view.
  const [{ data: isSuperAdmin }, { data: isAdmin }, { data: hasPerm }] = await Promise.all([
    sessionClient.rpc('is_super_admin'),
    sessionClient.rpc('is_admin'),
    sessionClient.rpc('user_has_permission', {
      permission_name: 'meetings.analytics.view',
    }),
  ]);

  if (!isSuperAdmin && !isAdmin && !hasPerm) {
    return <AccessDenied />;
  }

  // 3. Data fetch — service-role client reads ALL institutions.
  const serviceClient = createServiceRoleClient();
  const data = await getLeadershipAdoptionData(serviceClient);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <ContentLayout title="Meetings Adoption">
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="space-y-6 mt-4">
        <PageHeader
          title="Leadership Adoption Scoreboard"
          description="Booking-page status for principals &amp; HODs across all colleges — live = handle claimed + Google Calendar connected."
        />

        {/* Overall summary strip */}
        <SummaryStrip data={data} />

        {/* Status key */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            <strong>Live</strong> — handle set, page public, Google Calendar active
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-amber-600" />
            <strong>Page not live</strong> — page created but missing a step (public/Google)
          </span>
          <span className="flex items-center gap-1">
            <Link2Off className="h-3 w-3 text-neutral-400" />
            <strong>No page</strong> — handle not yet claimed
          </span>
        </div>

        {/* Per-institution cards */}
        {data.institutions.length === 0 ? (
          <Card className="rounded-2xl border-neutral-200 shadow-sm">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No principals or HODs found in the system.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
            {data.institutions.map((inst) => (
              <InstitutionCard
                key={inst.institutionId}
                inst={inst}
                canRename={!!isSuperAdmin || !!isAdmin}
              />
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
