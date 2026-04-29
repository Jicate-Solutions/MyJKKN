'use client';

// Shared layout for /admission/counselors/team and its 4 sub-routes.
// Owns the duplicated shell (ContentLayout + Breadcrumb + Header + TeamNav)
// so each page.tsx renders only its own <XTab /> body.
//
// Active-tab heading is derived from usePathname() — see TEAM_TAB_META below.
// Visual output is byte-identical to the previous per-page shells.
//
// Pattern reference: feedback_sidebar_nesting_is_wrong_layer.md
// (in-page tab pattern; sidebar stays FLAT).

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AdmissionErrorBoundary } from '@/components/admission';
import { TeamNav } from './_components/team-nav';

// Per-tab page metadata. Order matters: first match wins, so longer prefixes
// must come before the bare /team root.
const TEAM_TAB_META = [
  {
    match: '/admission/counselors/team/roster',
    crumb: 'Roster',
    contentTitle: 'Team — Roster',
    subtitle: '7-day availability schedule for each counselor.',
  },
  {
    match: '/admission/counselors/team/allocation',
    crumb: 'Allocation',
    contentTitle: 'Team — Allocation',
    subtitle: 'Institution and lead-source allocation per counselor.',
  },
  {
    match: '/admission/counselors/team/rules',
    crumb: 'Rules',
    contentTitle: 'Team — Rules',
    subtitle: 'Assignment rules that govern automatic lead routing to counselors.',
  },
  {
    match: '/admission/counselors/team/activity',
    crumb: 'Activity',
    contentTitle: 'Team — Activity',
    subtitle: 'Last 50 lead cascade and reassignment events.',
  },
  // Members (root) — must be last so longer prefixes match first.
  {
    match: '/admission/counselors/team',
    crumb: null,
    contentTitle: 'Team Management',
    subtitle: 'Manage counselor roster, schedules, allocations, assignment rules and activity.',
  },
] as const;

function resolveMeta(pathname: string) {
  return (
    TEAM_TAB_META.find((m) => pathname.startsWith(m.match)) ?? TEAM_TAB_META[TEAM_TAB_META.length - 1]
  );
}

export default function TeamLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const meta = resolveMeta(pathname);

  return (
    <PermissionGuard module="admission" action="view">
      <AdmissionErrorBoundary>
        <ContentLayout title={meta.contentTitle}>
          <div className="space-y-6">
            {/* Breadcrumb */}
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/counselors">Counselors</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                {meta.crumb ? (
                  <>
                    <BreadcrumbItem>
                      <BreadcrumbLink href="/admission/counselors/team">Team</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{meta.crumb}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                ) : (
                  <BreadcrumbItem>
                    <BreadcrumbPage>Team</BreadcrumbPage>
                  </BreadcrumbItem>
                )}
              </BreadcrumbList>
            </Breadcrumb>

            {/* Page header */}
            <div>
              <h1 className="text-2xl font-bold">Team Management</h1>
              <p className="text-muted-foreground mt-1">{meta.subtitle}</p>
            </div>

            {/* In-page tab nav (sidebar stays FLAT — tabs live here) */}
            <TeamNav />

            {/* Active tab body (page.tsx of the matching route) */}
            {children}
          </div>
        </ContentLayout>
      </AdmissionErrorBoundary>
    </PermissionGuard>
  );
}
