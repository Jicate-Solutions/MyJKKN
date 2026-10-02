// ============================================================================
// ORGANIZATIONS — College Leadership.
// Created: 2026-08-04. Reworked: 2026-09-30.
//
// Asks the question about the COLLEGE instead of the person. Leadership is
// stored on people (user_roles, committee rows, institution_leadership) and was
// never asked about per college, so gaps were invisible. Every unfilled post
// renders as an explicit "Vacant" / "Not assigned" — blank space is what hid the
// problem, and this page must never produce any.
//
// 2026-09-30: this page is the four SENIOR posts only (Principal, Vice
// Principal, IQAC Chairman, IQAC Coordinator). Departments / Heads of Department
// were removed — they duplicated /organizations/departments/hod-assignment,
// which remains the single place to assign a HoD.
//
// Reads: fn_leadership_overview (all colleges, one call) and
// fn_get_college_leadership (one college, in the drawer). Both SECURITY DEFINER:
// user_roles / committee tables are not readable by a college officer and RLS
// denial is SILENT, so a direct read would print "Vacant" over filled posts.
// ALL WRITES go through fn_set_college_leadership (see college-drawer.tsx).
// Migrations: 20260809101500_college_leadership.sql,
//   20260809102100_institution_leadership_posts.sql,
//   20260809103500_leadership_appointment_basis.sql,
//   20260930110000_leadership_overview.sql
// ============================================================================

'use client';

import { useMemo, useState } from 'react';
import { Eye, RefreshCw } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useGroupLeadership, useLeadershipCanEdit, useLeadershipOverview } from '@/hooks/use-leadership';
import { computeLeadershipStats, groupCoverage } from '@/lib/organizations/leadership-stats';
import { CollegeDrawer } from './_components/college-drawer';
import { AddPostDialog } from './_components/add-post-dialog';
import { GroupLeadership } from './_components/group-leadership';
import { InstitutionSections } from './_components/institution-sections';
import {
  BasisBreakdownPanel,
  CoverageByPost,
  KpiRow,
  MultiCollegePanel,
} from './_components/overview-panels';

function LeadershipPageBody() {
  const [openId, setOpenId] = useState<string | null>(null);
  const overview = useLeadershipOverview();
  const all = useMemo(() => overview.data ?? [], [overview.data]);
  // Hidden institutions (super admins only ever receive them) stay out of the
  // cards, the statistics, the Add post list and the analytics.
  const rows = useMemo(() => all.filter((r) => !r.hidden), [all]);
  const hiddenRows = useMemo(() => all.filter((r) => r.hidden), [all]);
  const stats = useMemo(() => computeLeadershipStats(rows), [rows]);
  const canEdit = useLeadershipCanEdit().data === true;
  const groupPosts = useGroupLeadership().data?.posts ?? [];

  if (overview.error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm">
        <p className="font-medium text-destructive">Could not load leadership.</p>
        <p className="mt-2 text-muted-foreground">{(overview.error as Error).message}</p>
        <p className="mt-2 text-muted-foreground">
          If this says you do not have access, ask a super admin to grant you the{' '}
          <code className="rounded bg-muted px-1 py-0.5">organizations.leadership.manage</code>{' '}
          permission in Role Management.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void overview.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    );
  }

  if (overview.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        No colleges are in scope for your role, so there is nothing to show here. Ask a super admin
        to widen your institution access.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Group posts such as Managing Director are appointed once. Each institution or school then
          shows only its own posts.{' '}
          {canEdit
            ? 'Use Manage on an institution to assign people or change its posts.'
            : 'You have view-only access; a super admin makes the changes.'}{' '}
          Heads of Department are assigned under Departments → HoD Assignment.
        </p>
        {canEdit ? (
          <AddPostDialog institutions={rows} />
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            <Eye className="h-3.5 w-3.5" aria-hidden />
            View only
          </span>
        )}
      </div>

      <KpiRow stats={stats} group={groupCoverage(groupPosts)} />

      <GroupLeadership />

      <InstitutionSections rows={rows} hiddenRows={hiddenRows} canEdit={canEdit} onOpen={setOpenId} />

      <details className="group rounded-2xl border border-border bg-card shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold marker:hidden">
          Analytics
          <span className="text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
          <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Hide</span>
        </summary>
        <div className="space-y-4 border-t border-border p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <CoverageByPost stats={stats} />
            </div>
            <BasisBreakdownPanel stats={stats} />
          </div>
          <MultiCollegePanel stats={stats} />
        </div>
      </details>

      <CollegeDrawer institutionId={openId} canEdit={canEdit} onClose={() => setOpenId(null)} />
    </div>
  );
}

// A denial must say so out loud and name who can fix it — never a silent
// redirect that leaves the user clicking the same link forever.
const DENIED = (
  <div className="rounded-md border border-border bg-muted/30 p-6 text-sm">
    <p className="font-medium">You do not have access to College Leadership.</p>
    <p className="mt-2 text-muted-foreground">
      This page assigns Principals, Vice Principals and IQAC office bearers. Ask a super admin to
      grant you the{' '}
      <code className="rounded bg-muted px-1 py-0.5">organizations.leadership.manage</code>{' '}
      permission in Users → Role Management.
    </p>
  </div>
);

export default function CollegeLeadershipPage() {
  return (
    <PermissionGuard
      module="organizations.leadership"
      action="manage"
      fallback={<ContentLayout title="College Leadership">{DENIED}</ContentLayout>}
      loading={
        <ContentLayout title="College Leadership">
          <Skeleton className="h-40 w-full" />
        </ContentLayout>
      }
    >
      <ContentLayout title="College Leadership">
        <LeadershipPageBody />
      </ContentLayout>
    </PermissionGuard>
  );
}
