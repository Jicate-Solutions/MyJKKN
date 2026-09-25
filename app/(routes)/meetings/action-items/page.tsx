// app/(routes)/meetings/action-items/page.tsx
//
// "My Follow-ups" — every follow-up from recorded meetings that the signed-in
// person hosts or has been named owner of, in one list, closable here.
//
// WHY THIS EXISTS
//   Follow-ups were only ever visible on each booking's own page
//   (/meetings/[uid]), one meeting at a time, and only to the host. A person
//   named as owner could not see the item at all (the table's SELECT policy is
//   host-or-admin), so nothing was ever closed.
//
// ACCESS
//   Resolve the user with the SESSION client, then read through the SERVICE
//   ROLE with an explicit host-or-owner filter (MeetingActionItemService.
//   listForProfile). The filter is required, not a convenience: a super admin's
//   RLS read would return every host's items.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Info, ListChecks } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { MeetingActionItemService } from '@/lib/services/meetings/meeting-action-item-service';

import { FollowUpGroup } from './_components/follow-up-group';

export const dynamic = 'force-dynamic';

const PAGE_TITLE = 'My Follow-ups';
const PAGE_DESCRIPTION =
  'Every follow-up from your recorded meetings in one list — the ones you own and, for meetings you host, everyone else’s too. Tick one off when it is done.';

interface PageProps {
  searchParams: Promise<{ show?: string }>;
}

export default async function MyFollowUpsPage({ searchParams }: PageProps) {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) redirect('/auth/login');

  const { show } = await searchParams;
  const includeDone = show === 'done';

  const result = await MeetingActionItemService.listForProfile(
    createServiceRoleClient(),
    user.id,
    { includeDone },
  );

  const breadcrumb = (
    <PageBreadcrumb
      items={[
        { label: 'Home', href: '/' },
        { label: 'Meetings', href: '/meetings/inbox' },
        { label: PAGE_TITLE },
      ]}
    />
  );

  if (!result.success) {
    return (
      <ContentLayout title={PAGE_TITLE}>
        {breadcrumb}
        <div className="mt-4 space-y-4">
          <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
          <Card className="border-destructive/40">
            <CardContent className="space-y-3 py-10 text-center">
              <Info className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden />
              <div>
                <h3 className="text-sm font-medium">Could not load your follow-ups</h3>
                <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                  Something went wrong reading them. Try again in a moment.
                </p>
              </div>
              <Link href="/meetings/action-items" className="inline-flex">
                <Button variant="outline" size="sm">
                  Try again
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const groups = result.data ?? [];
  const openCount = groups.reduce(
    (n, g) => n + g.items.filter((it) => it.status === 'open').length,
    0,
  );

  return (
    <ContentLayout title={PAGE_TITLE}>
      {breadcrumb}
      <div className="mt-4 space-y-4">
        <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {openCount === 1 ? '1 open follow-up' : `${openCount} open follow-ups`}
            {groups.length > 0
              ? ` from ${groups.length === 1 ? '1 meeting' : `${groups.length} meetings`}`
              : ''}
          </p>
          <Link
            href={includeDone ? '/meetings/action-items' : '/meetings/action-items?show=done'}
            className="inline-flex"
          >
            <Button variant={includeDone ? 'default' : 'outline'} size="sm" className="w-full sm:w-auto">
              {includeDone ? 'Hide done' : 'Show done'}
            </Button>
          </Link>
        </div>

        {groups.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ListChecks className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden />
              <h3 className="mt-3 text-sm font-medium">
                {includeDone ? 'No follow-ups yet' : 'Nothing left to do'}
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                {includeDone
                  ? 'When a meeting you host or are named in has follow-ups written down, they will show up here.'
                  : 'You have no open follow-ups from your meetings. Turn on "Show done" to see the ones already finished.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <FollowUpGroup key={group.booking_id} group={group} />
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
