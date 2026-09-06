// School of Influence — the batch roster, and the only screen a member can be
// taken off one from (spec §7, decision A1).
// Spec: specs/school-of-influence-batches-2026-07-30.md
//
// A thin server shell, matching the sibling applications and attendance screens.
// Everything that talks to the database is in the client workspace below,
// because SoiBatchService holds the BROWSER Supabase client so the caller's
// session travels with each call and the SECURITY DEFINER RPCs authorise the
// real user. Reading it from a Server Component would run as `anon` and return
// nothing (ref feedback_browser_supabase_client_serverside_returns_empty).
//
// WHY THIS PAGE EXISTS. fn_soi_remove_member has been in the database since
// 2026-08-23 and SoiBatchService.removeMember has wrapped it since — a rule that
// somebody may only be taken out of a batch WITH a written reason, and no screen
// anywhere that drives it. A rule nobody can reach is not a rule; it is a
// promise the platform keeps to itself.
//
// ACCESS IS ENFORCED IN THE DATABASE, NOT BY THIS SHELL. The subtree's
// RoutePermissionGuard admits programme MEMBERS through its fallbackCheck
// (decision 6), so a learner who is in a batch reaches this URL. The workspace
// therefore asks the database for a verdict BEFORE it reads a single name, and
// renders an explicit "you do not have access" panel when the answer is no —
// never a silent redirect and never a bare empty list (CLAUDE.md rule 27).
//
// The programme event comes from the URL. There is deliberately no hardcoded
// event id: this screen serves any School of Influence programme.

import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Skeleton } from '@/components/ui/skeleton';

import { MembersWorkspace } from './_components/members-workspace';

export const metadata: Metadata = {
  title: 'School of Influencer — Members',
  description:
    'See who holds a place in each School of Influencer batch, and take somebody off a batch with a written reason that stays on their record.',
};

interface PageProps {
  searchParams: Promise<{ event?: string }>;
}

export default async function SoiMembersPage({ searchParams }: PageProps) {
  const { event } = await searchParams;

  return (
    <ContentLayout title="School of Influencer">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'School of Influencer' },
          { label: 'Members' },
        ]}
      />
      <Suspense fallback={<Skeleton className="mt-4 h-64 w-full rounded-xl" />}>
        <MembersWorkspace eventId={event ?? null} />
      </Suspense>
    </ContentLayout>
  );
}
