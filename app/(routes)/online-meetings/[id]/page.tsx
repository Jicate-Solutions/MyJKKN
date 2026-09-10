/**
 * Online Meetings — one meeting.
 *
 * Route: /online-meetings/[id]. Server Component; fetches everything the tabs
 * need in one pass and hands it to client islands.
 *
 * `isHost` decides what the page OFFERS. It never decides what is allowed —
 * that is the RLS policies and the server actions. A UI-only guard on an
 * RLS-writable column is decoration.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertCircle, ArrowLeft, Video } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BaseService } from '@/lib/services/base-service';
import { MeetingAgendaService } from '@/lib/services/online-meetings/agenda-service';
import { OnlineMeetingService } from '@/lib/services/online-meetings/meeting-service';
import { MeetingParticipantService } from '@/lib/services/online-meetings/participant-service';
import { MeetingPollService } from '@/lib/services/online-meetings/poll-service';
import { isTeamsConfigured } from '@/lib/services/online-meetings/meet-provisioner';
import { MeetingReportService } from '@/lib/services/online-meetings/report-service';
import { createClient } from '@/lib/supabase/server';

import { MeetingDetailTabs } from './_components/meeting-detail-tabs';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OnlineMeetingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <ContentLayout title="Online Meeting">
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

  const meetingResult = await BaseService.runWithClient(supabase, () =>
    OnlineMeetingService.getById(id),
  );

  // RLS returns nothing rather than an error for a meeting the viewer may not
  // read, so "not found" and "not yours" are the same shape here — which is
  // the correct answer to give in both cases.
  if (!meetingResult.ok || !meetingResult.data) notFound();
  const meeting = meetingResult.data;

  const { data: isManager } = await supabase.rpc('user_has_permission', {
    permission_name: 'onlineMeeting:manage.all',
  });
  const isHost = meeting.host_profile_id === user.id || isManager === true;

  // Whether a Google Meet link can be generated for this meeting at all.
  // Keyed to the meeting's HOST, not the viewer: the link is created on the
  // host's calendar, so a manager looking at somebody else's meeting must be
  // told about the host's connection rather than their own.
  const { data: googleConnection } = await supabase
    .from('meeting_host_google_connections')
    .select('status')
    .eq('host_profile_id', meeting.host_profile_id)
    .maybeSingle();
  const googleConnected = googleConnection?.status === 'active';

  const [participants, polls, agenda, minutes, actionItems, report] =
    await BaseService.runWithClient(supabase, () =>
      Promise.all([
        MeetingParticipantService.list(id, isHost),
        MeetingPollService.listWithCounts(id),
        MeetingAgendaService.listAgenda(id),
        MeetingAgendaService.getMinutes(id),
        MeetingAgendaService.listActionItems(id),
        MeetingReportService.build(id),
      ]),
    );

  return (
    <ContentLayout title={meeting.title}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Online Meetings', href: '/online-meetings' },
          { label: meeting.title },
        ]}
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/online-meetings">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            All meetings
          </Link>
        </Button>
        <Button asChild size="sm" className="gap-1.5">
          <Link href={`/online-meetings/${id}/live`}>
            <Video className="h-3.5 w-3.5" aria-hidden />
            Open the live page
          </Link>
        </Button>
      </div>

      <div className="mt-4">
        <MeetingDetailTabs
          meeting={meeting}
          isHost={isHost}
          participants={participants.ok ? participants.data : []}
          participantsError={participants.ok ? null : participants.error}
          polls={polls.ok ? polls.data : []}
          agenda={agenda.ok ? agenda.data : []}
          minutes={minutes.ok ? minutes.data : null}
          actionItems={actionItems.ok ? actionItems.data : []}
          report={report.ok ? report.data : null}
          googleConnected={googleConnected}
          teamsConfigured={isTeamsConfigured()}
        />
      </div>
    </ContentLayout>
  );
}
