// app/(routes)/meetings/polls/[id]/page.tsx
//
// Meeting Poll results + confirm-winner (Universal Booking M5). Shows each
// candidate time with its vote tally and lets the host confirm the winner —
// which closes the poll and creates a confirmed booking. Gated by the
// meetings.polls.view permission.
//
// Explicit not-found state (rule #27 — never a silent redirect): an unknown or
// unauthorised poll renders a clear "not found" panel rather than bouncing.
//
// Pattern: app/(routes)/meetings/manage/page.tsx (server load → client view).

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import { getPollDetailAction } from '../actions';
import { PollResults } from '../_components/poll-results';

export const dynamic = 'force-dynamic';

interface PollDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PollDetailPage({ params }: PollDetailPageProps) {
  const { id } = await params;
  const result = await getPollDetailAction(id);

  return (
    <PermissionGuard
      module="meetings"
      action="polls.view"
      fallback={
        <ContentLayout title="Poll results">
          <div className="mx-auto max-w-md rounded-md border bg-muted/30 px-6 py-10 text-center">
            <p className="text-sm font-medium">You don&apos;t have access to Meeting Polls</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask an administrator to grant you the{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">meetings.polls.view</code>{' '}
              permission in Role Management.
            </p>
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Poll results">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Meetings', href: '/meetings/inbox' },
            { label: 'Polls', href: '/meetings/polls' },
            { label: 'Results', href: `/meetings/polls/${id}` },
          ]}
        />

        <div className="mb-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/meetings/polls">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> All polls
            </Link>
          </Button>
        </div>

        {!result.success || !result.data ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm font-medium">This poll could not be found</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {result.error ??
                  'It may have been deleted, or you may not have access to it.'}
              </p>
              <Button asChild variant="secondary" size="sm" className="mt-4">
                <Link href="/meetings/polls">Back to polls</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <PollResults poll={result.data} />
        )}
      </ContentLayout>
    </PermissionGuard>
  );
}
