'use client';

import Link from 'next/link';
import { PackagePlus, Plus } from 'lucide-react';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardStats, useInstaSolverAccess } from '@/hooks/instasolver/use-instasolver';
import { NextStepPanel } from './_components/next-step';
import { StatTile, TileGroup } from './_components/stat-tile';

export default function InstaSolverDashboardPage() {
  const { data: access, isLoading: accessLoading } = useInstaSolverAccess();
  const { data: stats, isLoading: statsLoading, error } = useDashboardStats();
  const loading = accessLoading || statsLoading;

  const reportActions = access?.can_report ? (
    <>
      <Button asChild>
        <Link href="/instasolver/issues/new">
          <Plus className="mr-1.5 h-4 w-4" /> Report an issue
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/instasolver/requirements/new">
          <PackagePlus className="mr-1.5 h-4 w-4" /> Request an item
        </Link>
      </Button>
    </>
  ) : undefined;

  return (
    <div className="space-y-6">
      <PageBreadcrumb items={[{ label: 'InstaSolver', href: '/instasolver/dashboard' }, { label: 'Dashboard', isCurrent: true }]} />
      <PageHeader
        title="InstaSolver"
        description="Faults to fix and items to request, and where each one stands"
        actions={reportActions}
      />

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            The figures could not be loaded. Refresh the page to try again.
          </CardContent>
        </Card>
      )}

      {access && stats && <NextStepPanel access={access} stats={stats} />}

      <TileGroup title="Your reports" description="Everything you have raised">
        <StatTile
          label="Issues still open"
          value={stats?.own.issues_open}
          loading={loading}
          href="/instasolver/issues?scope=mine"
        />
        <StatTile
          label="Awaiting your confirmation"
          value={stats?.own.awaiting_confirmation}
          loading={loading}
          tone="warning"
          href="/instasolver/issues?scope=mine&status=completed"
        />
        <StatTile
          label="Requirements open"
          value={stats?.own.requirements_open}
          loading={loading}
          href="/instasolver/requirements?mine=1"
        />
      </TileGroup>

      {access?.is_maintenance && (
        <TileGroup title="Your work" description="Jobs given to you or your team">
          <StatTile label="Assigned to me" value={stats?.mine.assigned_to_me} loading={loading} href="/instasolver/work" />
          <StatTile
            label="To claim"
            value={stats?.mine.to_claim}
            loading={loading}
            tone="warning"
            href="/instasolver/work?tab=to_claim"
          />
          <StatTile
            label="In progress"
            value={stats?.mine.in_progress}
            loading={loading}
            href="/instasolver/work?tab=in_progress"
          />
          <StatTile
            label="Completed today"
            value={stats?.mine.completed_today}
            loading={loading}
            tone="success"
            href="/instasolver/work?tab=completed"
          />
        </TileGroup>
      )}

      {access?.is_manager && (
        <TileGroup title="Across all institutions" description="What needs the CAO">
          <StatTile
            label="Awaiting triage"
            value={stats?.issues.pending}
            loading={loading}
            tone="warning"
            href="/instasolver/triage"
          />
          <StatTile
            label="Unassigned"
            value={stats?.issues.unassigned}
            loading={loading}
            href="/instasolver/issues?unassigned=1"
          />
          <StatTile
            label="Fix disputed"
            value={stats?.issues.disputed}
            loading={loading}
            tone="danger"
            href="/instasolver/issues?disputed=1"
          />
          <StatTile
            label="Critical and open"
            value={stats?.issues.critical_open}
            loading={loading}
            tone="danger"
            href="/instasolver/issues?severity=critical&status=pending,assigned,in_progress"
          />
          <StatTile
            label="In progress"
            value={stats?.issues.in_progress}
            loading={loading}
            href="/instasolver/issues?status=in_progress"
          />
          <StatTile
            label="Completed today"
            value={stats?.issues.completed_today}
            loading={loading}
            tone="success"
            href="/instasolver/issues?status=completed"
          />
          <StatTile
            label="Requirements awaiting review"
            value={stats?.requirements.pending}
            loading={loading}
            tone="warning"
            href="/instasolver/requirements?status=pending"
          />
        </TileGroup>
      )}

      {access?.is_principal && !access.is_manager && (
        <TileGroup title="Your institution" description="Issues raised at the institutions you lead">
          <StatTile label="All issues" value={stats?.issues.total} loading={loading} href="/instasolver/issues" />
          <StatTile
            label="Awaiting triage"
            value={stats?.issues.pending}
            loading={loading}
            tone="warning"
            href="/instasolver/issues?status=pending"
          />
          <StatTile
            label="Assigned"
            value={stats?.issues.assigned}
            loading={loading}
            href="/instasolver/issues?status=assigned"
          />
          <StatTile
            label="In progress"
            value={stats?.issues.in_progress}
            loading={loading}
            href="/instasolver/issues?status=in_progress"
          />
          <StatTile
            label="Completed"
            value={stats?.issues.completed}
            loading={loading}
            tone="success"
            href="/instasolver/issues?status=completed"
          />
          <StatTile
            label="Critical and open"
            value={stats?.issues.critical_open}
            loading={loading}
            tone="danger"
            href="/instasolver/issues?severity=critical&status=pending,assigned,in_progress"
          />
        </TileGroup>
      )}
    </div>
  );
}
