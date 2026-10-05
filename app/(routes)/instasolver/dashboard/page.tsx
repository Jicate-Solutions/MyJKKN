'use client';

// InstaSolver desk — Dashboard, laid out as the standalone InstaSolver
// dashboard (C:\jkkn_instasolver app/(app)/dashboard): a greeting with today's
// date and the Report an issue / Request an item buttons, "Your next step" with
// one-tap actions, every figure group the person's access calls for (Your
// reports, Your work, Across all institutions, Your institution), "Your work
// by status" for maintenance team members, and the latest reports beside the
// report / request tiles (the Principal gets their institution).
//
// Every figure comes from instasolver_get_dashboard_stats() or an RLS-scoped
// count — nothing on this page can render a number the database did not produce.

import Link from 'next/link';
import { PackagePlus, Plus } from 'lucide-react';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { REQUEST_BUTTON_CLASS } from '@/lib/instasolver/constants';
import { Skeleton } from '@/components/ui/skeleton';
import { useInstaSolverAccess, useReporterProfile } from '@/hooks/instasolver/use-instasolver';
import { DashboardSummary } from './_components/dashboard-summary';
import { DashboardStatCards } from './_components/dashboard-stat-cards';
import { MaintenanceReport } from './_components/maintenance-report';
import { DashboardPanels } from './_components/dashboard-panels';
import { dashboardRole } from './_components/role';

/** "Good morning" by the clock in India, not the server's or a traveller's. */
function greetingAt(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(now)
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function InstaSolverDashboardPage() {
  const { data: access, isLoading, error } = useInstaSolverAccess();
  const { data: profile } = useReporterProfile();

  const now = new Date();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const today = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata'
  }).format(now);

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        items={[{ label: 'InstaSolver', href: '/instasolver/dashboard' }, { label: 'Dashboard', isCurrent: true }]}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">
            {greetingAt(now)}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">{today}</p>
        </div>
        {/* The two things anyone comes here to do, always at hand. */}
        {access?.can_report ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/instasolver/issues/new">
                <Plus className="mr-1.5 h-4 w-4" /> Report an issue
              </Link>
            </Button>
            <Button asChild className={REQUEST_BUTTON_CLASS}>
              <Link href="/instasolver/requirements/new">
                <PackagePlus className="mr-1.5 h-4 w-4" /> Request an item
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Your access could not be checked. Refresh the page to try again.
        </p>
      ) : isLoading || !access ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <DashboardSummary role={dashboardRole(access)} access={access} />
          <DashboardStatCards access={access} />
          {/* Maintenance team members: their own work by status. */}
          {access.is_maintenance ? <MaintenanceReport /> : null}
          <DashboardPanels role={dashboardRole(access)} />
        </>
      )}
    </div>
  );
}
