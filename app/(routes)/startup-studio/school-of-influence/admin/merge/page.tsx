// School of Influence — folding a batch that is too small to run.
// Director decision 2026-08-02.
//
// The screen a coordinator reads BEFORE anything happens. It shows which batches
// are under strength once their intake has closed, where each would go, exactly
// who would move, and who would stay behind. Nothing on it acts until the
// coordinator presses Confirm on one specific fold.
//
// A thin server shell, the same shape as the lifecycle and attendance pages.
// Everything that talks to the database lives in the client workspace below,
// because SoiMergeService and SoiBatchService hold the BROWSER Supabase client so
// the caller's session travels with each call and the SECURITY DEFINER RPCs
// authorise the real user. Reading them from a Server Component would run as
// `anon` and return nothing
// (ref feedback_browser_supabase_client_serverside_returns_empty).
//
// Route access is enforced by the subtree's RoutePermissionGuard (layout.tsx)
// plus this route's own MENU_PERMISSIONS entry (cohort.manage), and every RPC
// re-checks the permission for the specific batches involved — so somebody who
// may enter the module still cannot plan or confirm a fold. A refusal renders an
// explicit access panel, never a silent redirect (CLAUDE.md rule 27).
//
// The programme event id comes from the URL. Nothing is hardcoded.

import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Skeleton } from '@/components/ui/skeleton';

import { MergeWorkspace } from './_components/merge-workspace';

export const metadata: Metadata = {
  title: 'School of Influence — Merge under-strength batches',
  description:
    'See which batches are too small to run once intake closes, and fold one into another with a record everybody can read.',
};

interface PageProps {
  searchParams: Promise<{ event?: string }>;
}

export default async function SoiMergePage({ searchParams }: PageProps) {
  const { event } = await searchParams;

  return (
    <ContentLayout title="School of Influence">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'School of Influence' },
          { label: 'Merge under-strength batches' },
        ]}
      />
      <Suspense fallback={<Skeleton className="mt-4 h-64 w-full rounded-xl" />}>
        <MergeWorkspace eventId={event ?? null} />
      </Suspense>
    </ContentLayout>
  );
}
