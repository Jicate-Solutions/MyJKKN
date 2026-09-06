// School of Influence — session attendance + completion (spec §7 S6).
// Spec: specs/school-of-influence-batches-2026-07-30.md
//
// A thin server shell. Everything that talks to the database is in the client
// workspace below, because the School of Influence services (SoiBatchService and
// SoiAttendanceService) hold the BROWSER Supabase client so the caller's session
// travels with each call and the SECURITY DEFINER RPCs authorise the real user.
// Reading them from a Server Component would run as `anon` and return nothing
// (ref feedback_browser_supabase_client_serverside_returns_empty).
//
// Route access is enforced by the module's RoutePermissionGuard against the
// MENU_PERMISSIONS entry for this path (cohort.manage) — the same key the RPCs
// check, so the page and the database cannot disagree about who may be here.
//
// Both ids come from the URL. There is deliberately no hardcoded programme or
// event id: this screen serves any School of Influence programme, and the live
// one is reached by deep link from the batch admin.

import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Skeleton } from '@/components/ui/skeleton';

import { AttendanceWorkspace } from './_components/attendance-workspace';

// The route manifest and the Ctrl+K palette read this. Without it the page is
// listed under its folder name alone — which is how a programme's screens end up
// searchable only as "Attendance" (BUG-005799 / BUG-005800).
export const navMeta = {
  label: 'School of Influencer Attendance',
  icon: 'CheckSquare',
} as const;

export const metadata: Metadata = {
  title: 'School of Influencer — Attendance',
  description:
    'Tick off who attended each School of Influencer session and see who is short of the attendance bar.',
};

interface PageProps {
  searchParams: Promise<{ event?: string; batch?: string }>;
}

export default async function SoiAttendancePage({ searchParams }: PageProps) {
  const { event, batch } = await searchParams;

  return (
    <ContentLayout title="School of Influencer">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'School of Influencer' },
          { label: 'Attendance' },
        ]}
      />
      <Suspense fallback={<Skeleton className="mt-4 h-64 w-full rounded-xl" />}>
        <AttendanceWorkspace
          eventId={event ?? null}
          initialCohortId={batch ?? null}
        />
      </Suspense>
    </ContentLayout>
  );
}
