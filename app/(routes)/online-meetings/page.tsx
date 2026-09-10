/**
 * Online Meetings — the list.
 *
 * Server Component: it fetches and authorizes, and hands a plain array to one
 * small client island for the interactive bits. Route: /online-meetings.
 *
 * What a viewer sees is decided by RLS, not by a branch here — meetings they
 * host, meetings they were invited to, and (with onlineMeeting:manage.all)
 * everything in their institutions. Writing those three cases as three WHERE
 * clauses is how they drift apart.
 *
 * An access failure gets an explicit card naming the permission to ask for,
 * never a silent redirect. A bounce to /dashboard is indistinguishable from a
 * broken link to the person it happens to.
 */

import Link from 'next/link';
import { AlertCircle, CalendarPlus, Video } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BaseService } from '@/lib/services/base-service';
import { OnlineMeetingService } from '@/lib/services/online-meetings/meeting-service';
import { createClient } from '@/lib/supabase/server';

import { MeetingList } from './_components/meeting-list';

export const dynamic = 'force-dynamic';

export const navMeta = { label: 'Online Meetings', icon: 'Video' };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ContentLayout title="Online Meetings">
      <PageBreadcrumb
        items={[{ label: 'Home', href: '/' }, { label: 'Online Meetings' }]}
      />
      <div className="mt-4 space-y-4">{children}</div>
    </ContentLayout>
  );
}

export default async function OnlineMeetingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <h3 className="text-sm font-medium">You are not signed in</h3>
            <p className="text-xs text-muted-foreground">
              Sign in to MyJKKN to see the meetings you host or were invited to.
            </p>
            <Link href="/auth/login" className="mt-2 inline-flex">
              <Button size="sm">Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const [{ data: canCreate }, listed] = await Promise.all([
    supabase.rpc('user_has_permission', { permission_name: 'onlineMeeting:create' }),
    BaseService.runWithClient(supabase, () =>
      OnlineMeetingService.list({ window: 'all' }, user.id),
    ),
  ]);

  if (!listed.ok) {
    return (
      <Shell>
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Video className="h-8 w-8 text-destructive/60" aria-hidden />
            <h3 className="text-sm font-medium">Could not load your meetings</h3>
            <p className="max-w-md text-xs text-muted-foreground">{listed.error}</p>
            <p className="text-[11px] text-muted-foreground">
              If you should have access, ask your MyJKKN administrator for the
              &ldquo;View Online Meetings module&rdquo; permission.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Online Meetings"
          description="Team meetings you can schedule for any date, invite colleagues and outside guests to, and measure the way AI Pulse measures its Thursday session."
        />
        {canCreate === true && (
          <Button asChild className="gap-2">
            <Link href="/online-meetings/new">
              <CalendarPlus className="h-4 w-4" aria-hidden />
              Schedule a meeting
            </Link>
          </Button>
        )}
      </div>

      <MeetingList meetings={listed.data} canCreate={canCreate === true} />
    </Shell>
  );
}
