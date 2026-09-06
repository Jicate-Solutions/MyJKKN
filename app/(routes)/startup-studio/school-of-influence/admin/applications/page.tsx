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
// The programme event comes from the URL, or — since 2026-08-13 — is RESOLVED
// when the URL does not carry one. There is still deliberately no hardcoded
// event id: this screen serves any School of Influence programme, and the
// resolution is done by asking the database which programmes THIS caller may
// review (lib/services/school-of-influence/programme-resolver.ts).

import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { listReviewableSoiProgrammes } from '@/lib/services/school-of-influence/programme-resolver';

import { ApplicationsWorkspace } from './_components/applications-workspace';

// The route manifest and the Ctrl+K palette read this. Without it the review
// queue is listed under its folder name alone — "Applications", which is not
// what anybody searching for this programme would type (BUG-005799 /
// BUG-005800).
export const navMeta = {
  label: 'School of Influencer Applications',
  icon: 'ClipboardList',
} as const;

export const metadata: Metadata = {
  title: 'School of Influencer — Applications',
  description:
    'Review who has applied to a School of Influencer programme, accept them into a batch, or turn an application down with a reason the applicant can read.',
};

interface PageProps {
  searchParams: Promise<{ event?: string }>;
}

export default async function SoiApplicationsPage({ searchParams }: PageProps) {
  const { event } = await searchParams;

  // No `?event=` used to mean a dead end with an instruction to hand-type a
  // uuid. Resolve it instead: the platform knows which programmes this caller
  // may review, so it should not be asking them (BUG-005799 / BUG-005800).
  // One programme opens; several are offered BY NAME; none says so plainly.
  // Never hardcoded — the list comes from the batches and the caller's own
  // fn_soi_review_context verdict.
  const choices = event ? [] : await listReviewableSoiProgrammes();
  const eventId = event ?? (choices.length === 1 ? choices[0].eventId : null);

  return (
    <ContentLayout title="School of Influencer">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'School of Influencer' },
          { label: 'Applications' },
        ]}
      />
      {eventId ? (
        <Suspense fallback={<Skeleton className="mt-4 h-64 w-full rounded-xl" />}>
          <ApplicationsWorkspace eventId={eventId} />
        </Suspense>
      ) : choices.length > 1 ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Which programme?</CardTitle>
            <CardDescription>
              You can review applications for more than one School of Influencer
              programme. Pick the one you want to work through.
            </CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-2 px-6 pb-6">
            {choices.map((c) => (
              <Link
                key={c.eventId}
                href={`/startup-studio/school-of-influence/admin/applications?event=${c.eventId}`}
                className="rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </Card>
      ) : (
        // Explicit, never a redirect and never an empty queue (rule 27).
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">
              There is no programme here for you to review
            </CardTitle>
            <CardDescription>
              Reviewing applications is done by a School of Influencer coordinator.
              If you have just been made one, sign out and back in so the change
              takes effect. Otherwise ask a coordinator, or a MyJKKN
              administrator, to appoint you on the Coordinators screen.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </ContentLayout>
  );
}
