'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEvent } from '@/hooks/startup-studio/use-events';
import {
  useMyRegistration,
  useRemoveTeamMember,
  useRespondToInvitation,
  useMyPendingInvitations,
} from '@/hooks/startup-studio/use-event-registrations';
import { useAuth } from '@/hooks/use-auth';
import { StudentSearchDialog } from './_components/student-search-dialog';
import {
  CheckCircle2, Clock, Laptop, MapPin, User, Users, Loader2,
  UserPlus, XCircle, Hash, Bell, Shield,
} from 'lucide-react';
import type { EventTeamMember, PendingInvitation } from '@/types/startup-studio';

export default function MyTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile } = useAuth();
  const { data: event } = useEvent(id);
  const { data: registration, isLoading } = useMyRegistration(id);
  const { data: pendingInvitations = [] } = useMyPendingInvitations();
  const removeMember = useRemoveTeamMember();
  const respondToInvitation = useRespondToInvitation();
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);

  const isLeader = registration?.owner_id === profile?.id;
  const acceptedMembers = (registration?.team_members || []).filter(
    (m: EventTeamMember) => m.status === 'accepted'
  );
  const pendingOutgoing = (registration?.team_members || []).filter(
    (m: EventTeamMember) => m.status === 'pending'
  );
  const declinedMembers = (registration?.team_members || []).filter(
    (m: EventTeamMember) => m.status === 'declined'
  );

  const myInvitationsForThisEvent = (pendingInvitations as PendingInvitation[]).filter(
    (inv) => inv.event_id === id
  );

  if (isLoading) {
    return (
      <ContentLayout title="My Team">
        <PageBreadcrumb items={[
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
          { label: 'My Team' },
        ]} />
        <Card className="max-w-5xl mx-auto mt-8">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-12 w-12 text-muted-foreground mx-auto animate-spin" />
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (!registration) {
    return (
      <ContentLayout title="My Team">
        <PageBreadcrumb items={[
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
          { label: 'My Team' },
        ]} />
        <div className="max-w-5xl mt-4 space-y-6">
          {myInvitationsForThisEvent.length > 0 && (
            <PendingInvitationsCard
              invitations={myInvitationsForThisEvent}
              onRespond={(memberId, accept) => respondToInvitation.mutate({ memberId, accept })}
              isPending={respondToInvitation.isPending}
            />
          )}
          <Card>
            <CardContent className="pt-6 text-center space-y-3">
              <p className="text-muted-foreground">
                You haven&apos;t registered a team for this event yet.
              </p>
              {myInvitationsForThisEvent.length === 0 && (
                <Link href={`/startup-studio/events/${id}/register`}>
                  <Button>Register a Team</Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const buildDayVenue = registration.venue_allocations?.find((v: any) => v.day_type === 'build_day');
  const demoDayVenue  = registration.venue_allocations?.find((v: any) => v.day_type === 'demo_day');

  return (
    <ContentLayout title="My Team">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
        { label: 'My Team' },
      ]} />

      <div className="space-y-6 mt-4 max-w-5xl py-4">

        {/* Team Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-xl">{registration.team_name}</CardTitle>
                {registration.team_code && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-mono text-muted-foreground font-medium">
                      {registration.team_code}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isLeader && (
                  <Badge variant="outline" className="gap-1">
                    <Shield className="h-3 w-3" /> Team Leader
                  </Badge>
                )}
                <Badge variant={registration.checked_in ? 'default' : 'secondary'}>
                  {registration.checked_in ? 'Checked In' : registration.status}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">{registration.problem_idea}</p>
            {registration.lovable_verified && (
              <div className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" /> Lovable Verified
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team Members ({acceptedMembers.length})
                </CardTitle>
                <CardDescription>
                  {pendingOutgoing.length > 0
                    ? `${pendingOutgoing.length} pending invitation${pendingOutgoing.length > 1 ? 's' : ''}`
                    : 'All accepted members'}
                </CardDescription>
              </div>
              {isLeader && event?.status === 'registration_open' && (
                <Button size="sm" onClick={() => setSearchDialogOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-1" /> Invite Member
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {acceptedMembers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No accepted members yet. Invite your teammates!
              </p>
            )}
            {acceptedMembers.map((member: EventTeamMember) => (
              <MemberRow
                key={member.id}
                member={member}
                canRemove={isLeader && !member.is_leader}
                onRemove={() => removeMember.mutate(member.id)}
                isRemoving={removeMember.isPending}
              />
            ))}

            {/* Pending outgoing invitations — visible to leader */}
            {isLeader && pendingOutgoing.length > 0 && (
              <div className="pt-4 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                  Pending Invitations
                </p>
                {pendingOutgoing.map((member: EventTeamMember) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 border rounded-lg border-dashed bg-muted/30 mb-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{member.full_name || member.email}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs gap-1">
                        <Clock className="h-3 w-3" /> Pending
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMember.mutate(member.id)}
                        disabled={removeMember.isPending}
                      >
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Declined count — visible to leader only */}
            {isLeader && declinedMembers.length > 0 && (
              <p className="text-xs text-muted-foreground pt-2">
                {declinedMembers.length} invitation{declinedMembers.length > 1 ? 's' : ''} declined
              </p>
            )}
          </CardContent>
        </Card>

        {/* Venue Assignments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" /> Venue Assignments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {buildDayVenue ? (
              <div className="p-3 border rounded-lg">
                <p className="text-sm font-medium">Build Day</p>
                <p className="text-sm text-muted-foreground">
                  {buildDayVenue.venue_assignment?.resource?.name ||
                    buildDayVenue.venue_assignment?.manual_name || 'Venue assigned'}
                  {buildDayVenue.venue_assignment?.manual_building &&
                    ` - ${buildDayVenue.venue_assignment.manual_building}`}
                  {buildDayVenue.venue_assignment?.manual_room &&
                    `, Room ${buildDayVenue.venue_assignment.manual_room}`}
                </p>
              </div>
            ) : (
              <div className="p-3 border rounded-lg border-dashed">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-4 w-4" /> Build Day venue coming soon
                </p>
              </div>
            )}
            {demoDayVenue ? (
              <div className="p-3 border rounded-lg">
                <p className="text-sm font-medium">Demo Day</p>
                <p className="text-sm text-muted-foreground">
                  {demoDayVenue.venue_assignment?.resource?.name ||
                    demoDayVenue.venue_assignment?.manual_name || 'Venue assigned'}
                </p>
              </div>
            ) : (
              <div className="p-3 border rounded-lg border-dashed">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-4 w-4" /> Demo Day venue coming soon
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {event && ['build_day', 'demo_day'].includes(event.status) && (
          <Link href={`/startup-studio/events/${id}/submit`}>
            <Button className="w-full" size="lg">Submit Your Project</Button>
          </Link>
        )}
      </div>

      <StudentSearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
        registrationId={registration.id}
        eventId={id}
        defaultInstitutionId={registration.institution_id}
      />
    </ContentLayout>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function MemberRow({
  member,
  canRemove,
  onRemove,
  isRemoving,
}: {
  member: EventTeamMember;
  canRemove: boolean;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <User className="h-4 w-4 text-muted-foreground shrink-0" />
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium">{member.full_name || member.email}</p>
            {member.is_leader && (
              <Badge variant="outline" className="text-xs py-0 px-1.5">Leader</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{member.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {member.student_id && (
          <Badge variant="outline" className="text-xs">{member.student_id}</Badge>
        )}
        {member.has_laptop && (
          <Badge variant="secondary" className="text-xs">
            <Laptop className="h-3 w-3 mr-1" /> Laptop
          </Badge>
        )}
        {canRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove} disabled={isRemoving}>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>
    </div>
  );
}

function PendingInvitationsCard({
  invitations,
  onRespond,
  isPending,
}: {
  invitations: PendingInvitation[];
  onRespond: (memberId: string, accept: boolean) => void;
  isPending: boolean;
}) {
  return (
    <Card className="border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" />
          Team Invitations ({invitations.length})
        </CardTitle>
        <CardDescription>
          You have been invited to join a team. Accept to join or decline to pass.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {invitations.map((inv) => (
          <div
            key={inv.member_id}
            className="flex items-center justify-between p-3 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20"
          >
            <div>
              <p className="text-sm font-medium">{inv.team_name}</p>
              <p className="text-xs text-muted-foreground">
                {inv.event_name}
                {inv.team_code && (
                  <span className="ml-2 font-mono">#{inv.team_code}</span>
                )}
              </p>
              {inv.invited_by_name && (
                <p className="text-xs text-muted-foreground">Invited by {inv.invited_by_name}</p>
              )}
            </div>
            <div className="flex items-center gap-2 ml-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRespond(inv.member_id, false)}
                disabled={isPending}
              >
                Decline
              </Button>
              <Button
                size="sm"
                onClick={() => onRespond(inv.member_id, true)}
                disabled={isPending}
              >
                Accept
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
