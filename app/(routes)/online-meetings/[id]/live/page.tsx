/**
 * Online Meetings — the live page for a signed-in participant.
 *
 * Route: /online-meetings/[id]/live.
 *
 * Renders the SAME console as the guest page at /join/[token]. The only
 * difference is the transport: this one posts to /api/online-meetings/live
 * with the session cookie, the guest one posts to
 * /api/public/online-meetings/live with a token. Building two consoles would
 * have meant the guest experience quietly falling behind, which is the failure
 * this module exists to fix.
 *
 * The "you are not on the invitation list" case gets a card naming what to do,
 * not a redirect. An unexplained bounce is indistinguishable from a bug.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertCircle, ArrowLeft, UserX } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { LiveConsole } from '@/components/online-meetings/live-console';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  getLiveMeeting,
  resolveParticipantByProfile,
} from '@/lib/services/online-meetings/live-service';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OnlineMeetingLivePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <ContentLayout title="Live meeting">
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <h3 className="text-sm font-medium">You are not signed in</h3>
            <Link href="/auth/login" className="mt-2 inline-flex">
              <Button size="sm">Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const { data: isManager } = await supabase.rpc('user_has_permission', {
    permission_name: 'onlineMeeting:manage.all',
  });
  const { data: meetingRow } = await supabase
    .from('online_meetings')
    .select('host_profile_id')
    .eq('id', id)
    .maybeSingle();
  const isHost = meetingRow?.host_profile_id === user.id || isManager === true;

  const who = await resolveParticipantByProfile(supabase, id, user.id);

  if (!who.ok) {
    return (
      <ContentLayout title="Live meeting">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <UserX className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-medium">You are not on the invitation list</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Only invited participants can open a meeting&rsquo;s live page. Ask
              the host to add you, and your attendance will be recorded from the
              moment you join.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-1 gap-1.5">
              <Link href="/online-meetings">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Back to meetings
              </Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const live = await getLiveMeeting(supabase, who.data);
  if (!live.ok) notFound();

  return (
    <ContentLayout title={live.data.meeting.title}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Online Meetings', href: '/online-meetings' },
          { label: live.data.meeting.title, href: `/online-meetings/${id}` },
          { label: 'Live' },
        ]}
      />
      <div className="mt-4">
        <LiveConsole
          initial={live.data}
          transport={{ base: '/api/online-meetings/live' }}
          isHost={isHost}
        />
      </div>
    </ContentLayout>
  );
}
