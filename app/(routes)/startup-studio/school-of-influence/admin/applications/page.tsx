// School of Influence — coordinator review & accept queue (spec §7 S5).
// Spec: specs/school-of-influence-batches-2026-07-30.md
//
// A thin server shell, matching the sibling attendance screen. Everything that
// talks to the database is in the client workspace below, because SoiReviewService
// and SoiBatchService hold the BROWSER Supabase client so the caller's session
// travels with each call and the SECURITY DEFINER RPCs authorise the real user.
// Reading them from a Server Component would run as `anon` and return nothing
// (ref feedback_browser_supabase_client_serverside_returns_empty).
//
// ACCESS IS ENFORCED IN THE DATABASE, NOT BY THIS SHELL. The subtree's
// RoutePermissionGuard admits programme MEMBERS through its fallbackCheck
// (decision 6), so a learner who is in a batch reaches this URL. Every RPC the
// workspace calls therefore re-checks cohort.manage for itself and raises 42501,
// which the workspace renders as an explicit "you do not have access" panel —
// never a silent redirect and never an empty list (CLAUDE.md rule 27). Nothing
// about an application is fetched before that check passes.
//
// The programme event comes from the URL. There is deliberately no hardcoded
// event id: this screen serves any School of Influence programme.

import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Skeleton } from '@/components/ui/skeleton';

import { ApplicationsWorkspace } from './_components/applications-workspace';

export const metadata: Metadata = {
  title: 'School of Influence — Applications',
  description:
    'Review who has applied to a School of Influence programme, accept them into a batch, or turn an application down with a reason the applicant can read.',
};

interface PageProps {
  searchParams: Promise<{ event?: string }>;
}

export default async function SoiApplicationsPage({ searchParams }: PageProps) {
  const { event } = await searchParams;

  return (
    <ContentLayout title="School of Influence">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'School of Influence' },
          { label: 'Applications' },
        ]}
      />
      <Suspense fallback={<Skeleton className="mt-4 h-64 w-full rounded-xl" />}>
        <ApplicationsWorkspace eventId={event ?? null} />
      </Suspense>
    </ContentLayout>
  );
}
