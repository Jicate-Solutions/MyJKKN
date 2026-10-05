'use client';

// The dashboard's figures, in groups — every group the person's access calls
// for, drawn with the standalone InstaSolver's stat card (icon wash, corner
// glow, arrow). Every value comes from instasolver_get_dashboard_stats(),
// RLS-scoped — never a literal.

import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardList,
  Hand,
  Inbox,
  Loader2,
  Package,
  RotateCcw,
  ThumbsUp,
  UserCheck,
  UserX,
  Wrench
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardStats } from '@/hooks/instasolver/use-instasolver';
import type { InstaSolverAccess } from '@/types/instasolver';
import { StatCard } from './stat-card';

const BASE = '/instasolver';

function Group({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{children}</div>
    </section>
  );
}

export function DashboardStatCards({ access }: { access: InstaSolverAccess }) {
  const { data: s, isLoading, error, refetch } = useDashboardStats();

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-destructive">
          The figures could not be loaded.
          <button type="button" className="underline" onClick={() => void refetch()}>
            Try again
          </button>
        </CardContent>
      </Card>
    );
  }

  const l = isLoading;

  return (
    <div className="space-y-6">
      <Group title="Your reports" description="Everything you have raised">
        <StatCard
          label="Issues still open"
          value={s?.own.issues_open}
          icon={ClipboardList}
          tone="info"
          href={`${BASE}/issues?scope=mine`}
          isLoading={l}
        />
        <StatCard
          label="Awaiting your confirmation"
          value={s?.own.awaiting_confirmation}
          hint="Completed — tell the team if it is fixed"
          icon={ThumbsUp}
          tone="warning"
          href={`${BASE}/issues?scope=mine&status=completed`}
          isLoading={l}
        />
        <StatCard
          label="Requirements open"
          value={s?.own.requirements_open}
          icon={Package}
          tone="neutral"
          href={`${BASE}/requirements?mine=1`}
          isLoading={l}
        />
      </Group>

      {access.is_maintenance && (
        <Group title="Your work" description="Jobs given to you or your team">
          <StatCard
            label="Assigned to me"
            value={s?.mine.assigned_to_me}
            icon={Wrench}
            tone="info"
            href={`${BASE}/work`}
            isLoading={l}
          />
          <StatCard
            label="To claim"
            value={s?.mine.to_claim}
            hint="Given to your team, nobody named yet"
            icon={Hand}
            tone="warning"
            href={`${BASE}/work?tab=to_claim`}
            isLoading={l}
          />
          <StatCard
            label="In progress"
            value={s?.mine.in_progress}
            icon={Loader2}
            tone="progress"
            href={`${BASE}/work?tab=in_progress`}
            isLoading={l}
          />
          <StatCard
            label="Completed today"
            value={s?.mine.completed_today}
            icon={CheckCircle2}
            tone="success"
            href={`${BASE}/work?tab=completed`}
            isLoading={l}
          />
        </Group>
      )}

      {access.is_manager && (
        <Group title="Across all institutions" description="What needs the CAO">
          <StatCard
            label="Awaiting triage"
            value={s?.issues.pending}
            hint="Reported, not yet prioritised or assigned"
            icon={Inbox}
            tone="warning"
            href={`${BASE}/triage`}
            isLoading={l}
          />
          <StatCard
            label="Unassigned"
            value={s?.issues.unassigned}
            icon={UserX}
            tone="neutral"
            href={`${BASE}/issues?unassigned=1`}
            isLoading={l}
          />
          <StatCard
            label="Fix disputed"
            value={s?.issues.disputed}
            hint="The reporter says it is still a problem"
            icon={RotateCcw}
            tone="danger"
            href={`${BASE}/issues?disputed=1`}
            isLoading={l}
          />
          <StatCard
            label="Critical and open"
            value={s?.issues.critical_open}
            icon={AlertTriangle}
            tone="danger"
            href={`${BASE}/issues?severity=critical&status=pending,assigned,in_progress`}
            isLoading={l}
          />
          <StatCard
            label="In progress"
            value={s?.issues.in_progress}
            icon={Loader2}
            tone="progress"
            href={`${BASE}/issues?status=in_progress`}
            isLoading={l}
          />
          <StatCard
            label="Completed today"
            value={s?.issues.completed_today}
            icon={CheckCircle2}
            tone="success"
            href={`${BASE}/issues?status=completed`}
            isLoading={l}
          />
          <StatCard
            label="Requirements awaiting review"
            value={s?.requirements.pending}
            icon={Package}
            tone="warning"
            href={`${BASE}/requirements?status=pending`}
            isLoading={l}
          />
        </Group>
      )}

      {access.is_principal && !access.is_manager && (
        <Group title="Your institution" description="Issues raised at the institution you lead">
          <StatCard
            label="All issues"
            value={s?.issues.total}
            icon={Building2}
            tone="info"
            href={`${BASE}/issues`}
            isLoading={l}
          />
          <StatCard
            label="Awaiting triage"
            value={s?.issues.pending}
            icon={Inbox}
            tone="warning"
            href={`${BASE}/issues?status=pending`}
            isLoading={l}
          />
          <StatCard
            label="Assigned"
            value={s?.issues.assigned}
            icon={UserCheck}
            tone="info"
            href={`${BASE}/issues?status=assigned`}
            isLoading={l}
          />
          <StatCard
            label="In progress"
            value={s?.issues.in_progress}
            icon={Loader2}
            tone="progress"
            href={`${BASE}/issues?status=in_progress`}
            isLoading={l}
          />
          <StatCard
            label="Completed"
            value={s?.issues.completed}
            icon={CheckCircle2}
            tone="success"
            href={`${BASE}/issues?status=completed`}
            isLoading={l}
          />
          <StatCard
            label="Critical and open"
            value={s?.issues.critical_open}
            icon={AlertTriangle}
            tone="danger"
            href={`${BASE}/issues?severity=critical&status=pending,assigned,in_progress`}
            isLoading={l}
          />
          <StatCard
            label="Reopened"
            value={s?.issues.reopened}
            hint="Came back after a fix"
            icon={RotateCcw}
            tone="danger"
            href={`${BASE}/analytics`}
            isLoading={l}
          />
          <StatCard
            label="Requirements fulfilled"
            value={s?.requirements.fulfilled}
            icon={Package}
            tone="success"
            href={`${BASE}/requirements?status=fulfilled`}
            isLoading={l}
          />
        </Group>
      )}
    </div>
  );
}
