// School of Influence — inactivity dry-run list (spec §5, §7 S7).
// Spec: specs/school-of-influence-batches-2026-07-30.md
//
// "Who the engine would nudge, pause or remove tomorrow" — spec §5 point 3. It
// is a READING screen: there is no button here that acts on anybody, because the
// engine has no action step to trigger.
//
// A thin server shell, the same shape as the attendance page. Everything that
// talks to the database lives in the client workspace below, because
// SoiLifecycleService and SoiBatchService hold the BROWSER Supabase client so the
// caller's session travels with each call and the SECURITY DEFINER RPC
// authorises the real user. Reading them from a Server Component would run as
// `anon` and return nothing
// (ref feedback_browser_supabase_client_serverside_returns_empty).
//
// Route access is enforced by the subtree's RoutePermissionGuard (layout.tsx),
// and the preview RPC re-checks cohort.manage for the specific batch — so a
// member who may enter the module still cannot read another batch's verdicts.
// A refusal renders an explicit access panel, never a silent redirect
// (CLAUDE.md rule 27).
//
// Both ids come from the URL, as on the attendance screen: no programme or event
// id is hardcoded.

import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Skeleton } from '@/components/ui/skeleton';

import { LifecycleWorkspace } from './_components/lifecycle-workspace';

// The route manifest and the Ctrl+K palette read this. Without it the page is
// listed under its folder name alone — "Lifecycle", a word that describes
// nothing anybody would search for (BUG-005799 / BUG-005800).
export const navMeta = {
  label: 'School of Influencer Inactivity Dry Run',
  icon: 'Activity',
} as const;

export const metadata: Metadata = {
  title: 'School of Influencer — Inactivity dry run',
  description:
    'See who the inactivity engine would remind, pause or remove — before it is ever switched on.',
};

interface PageProps {
  searchParams: Promise<{ event?: string; batch?: string }>;
}

export default async function SoiLifecyclePage({ searchParams }: PageProps) {
  const { event, batch } = await searchParams;

  return (
    <ContentLayout title="School of Influencer">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'School of Influencer' },
          { label: 'Inactivity dry run' },
        ]}
      />
      <Suspense fallback={<Skeleton className="mt-4 h-64 w-full rounded-xl" />}>
        <LifecycleWorkspace eventId={event ?? null} initialCohortId={batch ?? null} />
      </Suspense>
    </ContentLayout>
  );
}
