'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { Rocket, ClipboardList, UserCheck, Target } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { AdminPermissionGuard } from '@/components/auth/admin-permission-guard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SYSTEM_ROLES } from '@/types/auth';
import { useEvent, useEventStats } from '@/hooks/startup-studio/use-events';
import { SOLVE100_WEEKS } from '@/lib/constants/startup-studio/solve100';
import { SummaryCards } from './_components/summary-cards';
import { TeamsTable } from './_components/teams-table';
import { FiltersBar, INITIAL_FILTERS, type FiltersState } from './_components/filters-bar';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Roles allowed on the Solve for 100 hub page.
 * Super admins and administrators always. Event coordinators need access too.
 */
const ALLOWED_ROLES = [
  SYSTEM_ROLES.SUPER_ADMIN,
  SYSTEM_ROLES.ADMINISTRATOR,
  // Event coordinator role — if not in SYSTEM_ROLES, fallback to raw string.
  // AdminPermissionGuard does a string compare on profile.role.
  'event_coordinator',
];

/**
 * Program started April 1, 2026 (per spec).
 * Anchor used to compute the current week number (1..SOLVE100_WEEKS).
 */
const PROGRAM_START_DATE = new Date('2026-04-01T00:00:00+05:30');

function computeCurrentWeek(start: Date = PROGRAM_START_DATE): number {
  const now = Date.now();
  const diffMs = now - start.getTime();
  if (diffMs < 0) return 0;
  const week = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.min(Math.max(1, week), SOLVE100_WEEKS);
}

function phaseLabel(week: number): string {
  if (week <= 0) return 'Program starts soon';
  if (week <= 4) return 'Traction Sprint — get your first 25 paid users';
  if (week <= 20) return 'Scale Phase — 100+ active users and automation';
  if (week <= SOLVE100_WEEKS) return 'Business Phase — unit economics matter';
  return 'Post-program';
}

export default function Solve100HubPage({ params }: Props) {
  const { id: eventId } = use(params);

  return (
    <AdminPermissionGuard
      adminRoles={ALLOWED_ROLES}
      fallback={
        <ContentLayout title="Solve for 100">
          <Alert variant="destructive" className="mt-8">
            <AlertDescription>
              This page is only accessible to super admins, administrators, and event
              coordinators.
            </AlertDescription>
          </Alert>
        </ContentLayout>
      }
    >
      <HubContent eventId={eventId} />
    </AdminPermissionGuard>
  );
}

function HubContent({ eventId }: { eventId: string }) {
  const { data: event } = useEvent(eventId);
  const { data: eventStats } = useEventStats(eventId);
  const [filters, setFilters] = useState<FiltersState>(INITIAL_FILTERS);

  const currentWeek = useMemo(() => computeCurrentWeek(), []);
  const eventBase = `/startup-studio/events/${eventId}`;

  return (
    <ContentLayout title="Solve for 100">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio Events', href: '/startup-studio/events' },
          { label: event?.name ?? 'Event', href: eventBase },
          { label: 'Solve for 100' },
        ]}
      />

      <div className="space-y-6 mt-4 pb-10">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30">
              <Rocket className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Solve for 100
                {event?.name ? (
                  <span className="text-muted-foreground font-normal text-xl ml-2">
                    — {event.name}
                  </span>
                ) : null}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Week {currentWeek} of {SOLVE100_WEEKS} · {phaseLabel(currentWeek)}
              </p>
            </div>
          </div>

          {/* Quick nav to sub-pages */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link href={`${eventBase}/solve-for-100/weekly`}>
                <ClipboardList className="h-4 w-4" />
                Weekly Check-in
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link href={`${eventBase}/solve-for-100/icp`}>
                <Target className="h-4 w-4" />
                ICP Builder
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link href={`${eventBase}/solve-for-100/mentor`}>
                <UserCheck className="h-4 w-4" />
                Mentor Review
              </Link>
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <SummaryCards
          eventId={eventId}
          totalAllTeams={eventStats?.total_teams}
          currentWeek={currentWeek}
        />

        {/* Filters */}
        <FiltersBar value={filters} onChange={setFilters} />

        {/* Teams table */}
        <TeamsTable eventId={eventId} currentWeek={currentWeek} filters={filters} />
      </div>
    </ContentLayout>
  );
}
