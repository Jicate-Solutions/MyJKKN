'use client';

import { use, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useEvent } from '@/hooks/startup-studio/use-events';
import {
  useMyRegistration,
  useMyAcceptedMembership,
  useMyTeamMembers,
  useRemoveTeamMember,
  useRespondToInvitation,
  useMyPendingInvitations,
  useUpdateProblemIdea,
  useUpdateTeamName,
  useUpdateMemberLaptop,
  useDeleteOwnTeam,
} from '@/hooks/startup-studio/use-event-registrations';
import { useAuth } from '@/hooks/use-auth';
import { useTeamSubmission } from '@/hooks/startup-studio/use-event-submissions';
import { useRegistrationVenueAllocations } from '@/hooks/startup-studio/use-event-venues';
import { useMyRoleCard, useTeamRoleCards } from '@/hooks/startup-studio/use-role-cards';
import { Progress } from '@/components/ui/progress';
import { TeamRoleCardsOverview } from '../submit/_components/role-card-section';
import { StudentSearchDialog } from './_components/student-search-dialog';
import {
  CheckCircle2, Clock, Laptop, MapPin, User, Users, Loader2,
  UserPlus, XCircle, Hash, Bell, Shield, GraduationCap, Building2, Mail, Pencil,
  Send, ExternalLink, Github, Link2, Video, FileText, Lightbulb,
  Copy, Check, AlertCircle, Trophy, Calendar, Trash2, Star,
} from 'lucide-react';
import type { EventTeamMember, PendingInvitation } from '@/types/startup-studio';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

export default function MyTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile, isLoading: authLoading } = useAuth();
  const { data: event } = useEvent(id);
  const { data: registration, isLoading: regLoading, isFetching: regFetching } = useMyRegistration(id);
  const { data: membership, isLoading: memberLoading, isFetching: memberFetching } = useMyAcceptedMembership(id);
  const { data: teamMembers = [] } = useMyTeamMembers(id);
  const { data: pendingInvitations = [] } = useMyPendingInvitations();
  const removeMember = useRemoveTeamMember();
  const respondToInvitation = useRespondToInvitation();
  const updateProblemIdea = useUpdateProblemIdea();
  const updateTeamName = useUpdateTeamName();

  const deleteOwnTeam = useDeleteOwnTeam(id);

  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState(false);
  const [ideaDraft, setIdeaDraft] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Also wait when both queries are still fetching with no resolved data yet
  // (guards against stale-null flash on browser back navigation or slow networks)
  const bothStillFetching = (regFetching && registration == null) && (memberFetching && membership == null);
  const isLoading = authLoading || regLoading || memberLoading || bothStillFetching;

  const membershipAny = membership as any;
  const submissionRegistrationId = registration?.id ?? membershipAny?.registration_id;
  const { data: teamSubmission } = useTeamSubmission(id, submissionRegistrationId);
  const submissionId = teamSubmission?.id;
  const { data: teamRoleCards = [] } = useTeamRoleCards(submissionId);
  const { data: myRoleCard } = useMyRoleCard(submissionId);

  // For team members (non-leaders): fetch venue allocations directly using the
  // registration_id from their membership. Leaders already get this via useMyRegistration.
  const { data: memberVenueAllocations = [] } = useRegistrationVenueAllocations(
    !registration && membership ? membershipAny?.registration_id : null
  );

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
  const laptopCount = acceptedMembers.filter((m: EventTeamMember) => m.has_laptop).length;
  const maxTeamSize = event?.config?.team_max_size || 5;

  const myInvitationsForThisEvent = (pendingInvitations as PendingInvitation[]).filter(
    (inv) => inv.event_id === id
  );

  function copyTeamCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  }

  if (isLoading) {
    return (
      <ContentLayout title="My Team">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 text-green-600 animate-spin" />
        </div>
      </ContentLayout>
    );
  }

  // ── Accepted member (non-owner) view ────────────────────────────────────
  if (!registration && membership) {
    const m = membership as any;
    const memberAccepted = (teamMembers as any[]).filter((tm: any) => tm.status === 'accepted');

    return (
      <ContentLayout title="My Team">
        <PageBreadcrumb items={[
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
          { label: 'My Team' },
        ]} />

        <div className="space-y-5 mt-4 py-4">
          {/* Hero */}
          <div className="rounded-xl border bg-gradient-to-br from-green-50 to-emerald-50/40 dark:from-green-950/20 dark:to-emerald-950/10 p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{m.team_name}</h1>
                {m.team_code && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-mono bg-white dark:bg-black/20 border px-2 py-0.5 rounded text-muted-foreground">
                      {m.team_code}
                    </span>
                  </div>
                )}
              </div>
              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 gap-1.5">
                <User className="h-3 w-3" /> Team Member
              </Badge>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard
              icon={<Users className="h-4 w-4 text-green-600" />}
              iconBg="bg-green-50 dark:bg-green-950/30"
              label="Members"
              value={`${memberAccepted.length}`}
            />
            {m.team_code && (
              <StatCard
                icon={<Hash className="h-4 w-4 text-purple-600" />}
                iconBg="bg-purple-50 dark:bg-purple-950/30"
                label="Team Code"
                value={m.team_code}
                mono
              />
            )}
            <StatCard
              icon={teamSubmission
                ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                : <Clock className="h-4 w-4 text-orange-500" />}
              iconBg={teamSubmission
                ? 'bg-green-50 dark:bg-green-950/30'
                : 'bg-orange-50 dark:bg-orange-950/30'}
              label="Submission"
              value={teamSubmission ? 'Submitted' : 'Pending'}
            />
          </div>

          {/* Team Leader */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <div className="h-6 w-6 rounded-md bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                  <Shield className="h-3.5 w-3.5 text-amber-600" />
                </div>
                Team Leader
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/30">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                  {getInitials(m.leader_name || '?')}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="font-semibold">{m.leader_name || '—'}</p>
                  {m.leader_email && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{m.leader_email}</span>
                    </div>
                  )}
                  {m.leader_institution && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span>{m.leader_institution}</span>
                    </div>
                  )}
                  {(m.leader_degree || m.leader_department) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <GraduationCap className="h-3 w-3 shrink-0" />
                      <span>{[m.leader_degree, m.leader_department].filter(Boolean).join(' · ')}</span>
                    </div>
                  )}
                  {m.leader_semester && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3 shrink-0" />
                      <span>{m.leader_semester}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Team Members */}
          {memberAccepted.length > 0 && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <div className="h-6 w-6 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                    <Users className="h-3.5 w-3.5 text-blue-600" />
                  </div>
                  Team Members ({memberAccepted.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {memberAccepted.map((tm: any) => (
                  <div key={tm.member_id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {getInitials(tm.full_name || tm.email)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium truncate">{tm.full_name || tm.email}</p>
                          {tm.is_leader && (
                            <Badge className="text-xs py-0 px-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 gap-1">
                              <Shield className="h-2.5 w-2.5" /> Leader
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{tm.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {tm.student_id && <Badge variant="outline" className="text-xs">{tm.student_id}</Badge>}
                      {tm.has_laptop && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Laptop className="h-3 w-3" /> Laptop
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Venue Assignments (member view) */}
          {(() => {
            const buildDay = memberVenueAllocations.find((v: any) => v.day_type === 'build_day');
            const demoDay  = memberVenueAllocations.find((v: any) => v.day_type === 'demo_day');
            return (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    <div className="h-6 w-6 rounded-md bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center">
                      <MapPin className="h-3.5 w-3.5 text-rose-500" />
                    </div>
                    Venue Assignments
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <VenueCard dayType="Build Day" venue={buildDay} />
                  <VenueCard dayType="Demo Day" venue={demoDay} />
                </CardContent>
              </Card>
            );
          })()}

          <SubmissionReadOnlyCard submission={teamSubmission} />

          {/* Role Card Completion Status (member view) */}
          {teamSubmission && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Star className="h-4 w-4" />
                  Team Role Cards
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {teamRoleCards.length}/{memberAccepted.length} completed
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress
                  value={memberAccepted.length > 0
                    ? (teamRoleCards.length / memberAccepted.length) * 100
                    : 0
                  }
                  className="h-1.5"
                />

                <div className="space-y-1.5">
                  {memberAccepted.map((tm: any) => {
                    const hasCard = teamRoleCards.some((rc) => rc.profile_id === tm.profile_id)
                    return (
                      <div key={tm.member_id} className="flex items-center justify-between text-sm">
                        <span className="text-sm">
                          {tm.full_name || tm.email}
                          {tm.profile_id === profile?.id && (
                            <span className="text-xs text-muted-foreground ml-1">(you)</span>
                          )}
                        </span>
                        {hasCard ? (
                          <Badge className="bg-green-500 gap-1 text-xs">
                            <CheckCircle2 className="h-3 w-3" /> Done
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <Clock className="h-3 w-3" /> Pending
                          </Badge>
                        )}
                      </div>
                    )
                  })}
                </div>

                {!myRoleCard && (
                  <p className="text-xs text-muted-foreground bg-muted rounded p-2">
                    Help us build the JKKN Skill Bank! Fill in your Role Card — it takes 1 minute.
                  </p>
                )}

                <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
                  <Link href={`/startup-studio/events/${id}/submit`}>
                    <Star className="h-3.5 w-3.5" />
                    {myRoleCard ? 'View Role Card' : 'Fill My Role Card'}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {teamSubmission?.metrics_updated_at && memberAccepted.length > 1 && (
            <TeamRoleCardsOverview
              members={memberAccepted as any}
              cards={teamRoleCards}
              myProfileId={profile?.id ?? ''}
            />
          )}
        </div>
      </ContentLayout>
    );
  }

  // ── Not registered ───────────────────────────────────────────────────────
  if (!registration) {
    return (
      <ContentLayout title="My Team">
        <PageBreadcrumb items={[
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
          { label: 'My Team' },
        ]} />
        <div className="mt-4 space-y-5">
          {myInvitationsForThisEvent.length > 0 && (
            <PendingInvitationsCard
              invitations={myInvitationsForThisEvent}
              onRespond={(memberId, accept) => respondToInvitation.mutate({ memberId, accept })}
              isPending={respondToInvitation.isPending}
            />
          )}
          <Card>
            <CardContent className="py-16 text-center space-y-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto">
                <Users className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No team yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  You haven&apos;t registered a team for this event.
                </p>
              </div>
              {myInvitationsForThisEvent.length === 0 && (
                <Link href={`/startup-studio/events/${id}/register`}>
                  <Button className="gap-2">
                    <UserPlus className="h-4 w-4" /> Register a Team
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  // ── Leader (owner) view ──────────────────────────────────────────────────
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

      <div className="space-y-5 mt-4 py-4">

        {/* ── Hero Card ── */}
        <div className="rounded-xl border bg-gradient-to-br from-green-50 to-emerald-50/40 dark:from-green-950/20 dark:to-emerald-950/10 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="text-xl font-bold h-10 max-w-xs bg-white dark:bg-black/20"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    disabled={updateTeamName.isPending || nameDraft.trim().length < 2}
                    onClick={() => updateTeamName.mutate(
                      { registrationId: registration.id, teamName: nameDraft.trim() },
                      { onSuccess: () => setEditingName(false) }
                    )}
                  >
                    {updateTeamName.isPending
                      ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Saving...</>
                      : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingName(false)} disabled={updateTeamName.isPending}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight truncate">{registration.team_name}</h1>
                  {isLeader && (
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => { setNameDraft(registration.team_name); setEditingName(true); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}

              {registration.team_code && (
                <button
                  onClick={() => copyTeamCode(registration.team_code!)}
                  className="flex items-center gap-1.5 mt-2 group"
                >
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-mono bg-white dark:bg-black/20 border px-2 py-0.5 rounded text-muted-foreground group-hover:border-primary transition-colors">
                    {registration.team_code}
                  </span>
                  {codeCopied
                    ? <Check className="h-3 w-3 text-green-500" />
                    : <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  }
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {isLeader && (
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 gap-1.5">
                  <Shield className="h-3 w-3" /> Leader
                </Badge>
              )}
              <Badge className={registration.checked_in
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 gap-1.5'
                : 'bg-secondary text-secondary-foreground border-0'
              }>
                {registration.checked_in
                  ? <><CheckCircle2 className="h-3 w-3" /> Checked In</>
                  : registration.status
                }
              </Badge>
            </div>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<Users className="h-4 w-4 text-green-600" />}
            iconBg="bg-green-50 dark:bg-green-950/30"
            label="Members"
            value={`${acceptedMembers.length} / ${maxTeamSize}`}
          />
          <StatCard
            icon={<Clock className="h-4 w-4 text-orange-500" />}
            iconBg="bg-orange-50 dark:bg-orange-950/30"
            label="Pending"
            value={`${pendingOutgoing.length}`}
          />
          <StatCard
            icon={<Laptop className="h-4 w-4 text-blue-600" />}
            iconBg="bg-blue-50 dark:bg-blue-950/30"
            label="With Laptop"
            value={`${laptopCount}`}
          />
          <StatCard
            icon={teamSubmission
              ? <Trophy className="h-4 w-4 text-yellow-500" />
              : <Send className="h-4 w-4 text-muted-foreground" />}
            iconBg={teamSubmission ? 'bg-yellow-50 dark:bg-yellow-950/30' : 'bg-muted'}
            label="Submission"
            value={teamSubmission ? 'Submitted' : 'Not yet'}
          />
        </div>

        {/* ── Problem / Idea ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <div className="h-6 w-6 rounded-md bg-yellow-50 dark:bg-yellow-950/30 flex items-center justify-center">
                  <Lightbulb className="h-3.5 w-3.5 text-yellow-500" />
                </div>
                Problem / Idea
              </CardTitle>
              {isLeader && !editingIdea && (
                <Button
                  size="sm" variant="ghost"
                  className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => { setIdeaDraft(registration.problem_idea || ''); setEditingIdea(true); }}
                >
                  <Pencil className="h-3 w-3" />
                  {registration.problem_idea ? 'Edit' : 'Add'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editingIdea ? (
              <div className="space-y-3">
                <Textarea
                  value={ideaDraft}
                  onChange={(e) => setIdeaDraft(e.target.value)}
                  placeholder="Describe the problem your team will solve..."
                  rows={4}
                  className="text-sm resize-none"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={updateProblemIdea.isPending}
                    onClick={() => updateProblemIdea.mutate(
                      { registrationId: registration.id, problemIdea: ideaDraft },
                      { onSuccess: () => setEditingIdea(false) }
                    )}
                  >
                    {updateProblemIdea.isPending
                      ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Saving...</>
                      : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingIdea(false)} disabled={updateProblemIdea.isPending}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : registration.problem_idea ? (
              <p className="text-sm text-muted-foreground leading-relaxed">{registration.problem_idea}</p>
            ) : (
              <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground italic">
                <AlertCircle className="h-4 w-4 shrink-0" />
                No problem / idea added yet.
                {isLeader && (
                  <button
                    className="not-italic text-xs text-primary hover:underline ml-1"
                    onClick={() => { setIdeaDraft(''); setEditingIdea(true); }}
                  >
                    Add one
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Team Members ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <div className="h-6 w-6 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                    <Users className="h-3.5 w-3.5 text-blue-600" />
                  </div>
                  Team Members
                  <span className="text-muted-foreground/60 normal-case font-normal tracking-normal">
                    ({acceptedMembers.length}/{maxTeamSize})
                  </span>
                </CardTitle>
                {pendingOutgoing.length > 0 && (
                  <p className="text-xs text-orange-500 mt-1 ml-8">
                    {pendingOutgoing.length} pending invitation{pendingOutgoing.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>
              {isLeader && event?.status === 'registration_open' && (
                <Button size="sm" className="gap-1.5" onClick={() => setSearchDialogOpen(true)}>
                  <UserPlus className="h-4 w-4" /> Invite Member
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {acceptedMembers.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mx-auto">
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No accepted members yet.</p>
                {isLeader && event?.status === 'registration_open' && (
                  <p className="text-xs text-muted-foreground">Invite teammates using the button above.</p>
                )}
              </div>
            ) : (
              acceptedMembers.map((member: EventTeamMember) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  canRemove={isLeader && !member.is_leader}
                  onRemove={() => removeMember.mutate(member.id)}
                  isRemoving={removeMember.isPending}
                  isLeader={isLeader}
                />
              ))
            )}

            {/* Pending outgoing invitations */}
            {isLeader && pendingOutgoing.length > 0 && (
              <div className="pt-4 border-t space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Pending Invitations
                </p>
                {pendingOutgoing.map((member: EventTeamMember) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-dashed bg-orange-50/50 dark:bg-orange-950/10"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-xs font-bold text-orange-600 shrink-0">
                        {getInitials(member.full_name || member.email)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{member.full_name || member.email}</p>
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs gap-1 text-orange-600 border-orange-200 dark:border-orange-800">
                        <Clock className="h-3 w-3" /> Pending
                      </Badge>
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => removeMember.mutate(member.id)}
                        disabled={removeMember.isPending}
                      >
                        <XCircle className="h-4 w-4 text-muted-foreground hover:text-destructive transition-colors" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isLeader && declinedMembers.length > 0 && (
              <p className="text-xs text-muted-foreground pt-2">
                {declinedMembers.length} invitation{declinedMembers.length > 1 ? 's' : ''} declined
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Role Card Completion Status ── */}
        {teamSubmission && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="h-4 w-4" />
                Team Role Cards
                <Badge variant="secondary" className="ml-auto text-xs">
                  {teamRoleCards.length}/{acceptedMembers.length} completed
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress
                value={acceptedMembers.length > 0
                  ? (teamRoleCards.length / acceptedMembers.length) * 100
                  : 0
                }
                className="h-1.5"
              />

              <div className="space-y-1.5">
                {acceptedMembers.map((member: EventTeamMember) => {
                  const hasCard = teamRoleCards.some((rc) => rc.profile_id === member.profile_id)
                  return (
                    <div key={member.id} className="flex items-center justify-between text-sm">
                      <span className="text-sm">
                        {member.full_name}
                        {member.profile_id === profile?.id && (
                          <span className="text-xs text-muted-foreground ml-1">(you)</span>
                        )}
                      </span>
                      {hasCard ? (
                        <Badge className="bg-green-500 gap-1 text-xs">
                          <CheckCircle2 className="h-3 w-3" /> Done
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Clock className="h-3 w-3" /> Pending
                        </Badge>
                      )}
                    </div>
                  )
                })}
              </div>

              {!myRoleCard && (
                <p className="text-xs text-muted-foreground bg-muted rounded p-2">
                  Help us build the JKKN Skill Bank! Fill in your Role Card — it takes 1 minute.
                </p>
              )}

              <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
                <Link href={`/startup-studio/events/${id}/submit`}>
                  <Star className="h-3.5 w-3.5" />
                  {myRoleCard ? 'View Role Card' : 'Fill My Role Card'}
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Venue Assignments ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <div className="h-6 w-6 rounded-md bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center">
                <MapPin className="h-3.5 w-3.5 text-rose-500" />
              </div>
              Venue Assignments
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <VenueCard dayType="Build Day" venue={buildDayVenue} />
            <VenueCard dayType="Demo Day" venue={demoDayVenue} />
          </CardContent>
        </Card>

        {/* ── Submit CTA ── */}
        {isLeader && (
          <div className="rounded-xl border bg-gradient-to-br from-green-50 to-emerald-50/40 dark:from-green-950/20 dark:to-emerald-950/10 p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Send className="h-4 w-4 text-green-600" />
                  {teamSubmission ? 'Project Submitted' : 'Submit Your Project'}
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {teamSubmission
                    ? `${teamSubmission.app_name} · ${teamSubmission.category || 'No category'}`
                    : 'Share your project details, GitHub repo and live URL.'}
                </p>
              </div>
              <Link href={`/startup-studio/events/${id}/submit`}>
                <Button variant={teamSubmission ? 'outline' : 'default'} className="gap-2">
                  <Send className="h-4 w-4" />
                  {teamSubmission ? 'Update Submission' : 'Submit Project'}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {(teamSubmission || !isLeader) && (
          <SubmissionReadOnlyCard submission={teamSubmission} />
        )}

        {teamSubmission?.metrics_updated_at && acceptedMembers.length > 1 && (
          <TeamRoleCardsOverview
            members={acceptedMembers}
            cards={teamRoleCards as any}
            myProfileId={profile?.id ?? ''}
          />
        )}

        {/* ── Danger Zone ── */}
        {isLeader && !registration.checked_in && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="font-semibold text-destructive flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Delete Team
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Permanently remove your team registration and all member invitations.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="gap-2 shrink-0"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={deleteOwnTeam.isPending}
              >
                {deleteOwnTeam.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Deleting...</>
                  : <><Trash2 className="h-4 w-4" /> Delete Team</>
                }
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Delete Confirmation Dialog ── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team &ldquo;{registration.team_name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your team registration, remove all pending invitations,
              and remove all accepted members. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteOwnTeam.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteOwnTeam.isPending}
              onClick={() => deleteOwnTeam.mutate(registration.id)}
            >
              {deleteOwnTeam.isPending
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Deleting...</>
                : 'Yes, delete team'
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StudentSearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
        registrationId={registration.id}
        eventId={id}
        defaultInstitutionId={registration.institution_id}
        currentActiveCount={acceptedMembers.length + pendingOutgoing.length}
        maxTeamSize={maxTeamSize}
      />
    </ContentLayout>
  );
}

// ── Reusable sub-components ──────────────────────────────────────────────────

function StatCard({
  icon, iconBg, label, value, mono = false,
}: {
  icon: ReactNode;
  iconBg: string;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className={`text-lg font-bold leading-tight truncate ${mono ? 'font-mono text-base' : ''}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function VenueCard({ dayType, venue }: { dayType: string; venue: any }) {
  const venueName = venue?.venue_assignment?.resource?.name
    || venue?.venue_assignment?.manual_name
    || null;
  const building = venue?.venue_assignment?.manual_building;
  const room = venue?.venue_assignment?.manual_room;

  return (
    <div className={`p-4 rounded-lg border ${venue ? 'bg-muted/20' : 'border-dashed'}`}>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{dayType}</p>
      {venue ? (
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{venueName || 'Venue assigned'}</p>
          {(building || room) && (
            <p className="text-xs text-muted-foreground">
              {[building, room ? `Room ${room}` : null].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" /> Coming soon
        </p>
      )}
    </div>
  );
}

function MemberRow({
  member, canRemove, onRemove, isRemoving, isLeader,
}: {
  member: EventTeamMember;
  canRemove: boolean;
  onRemove: () => void;
  isRemoving: boolean;
  isLeader: boolean;
}) {
  const updateLaptop = useUpdateMemberLaptop();

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
          {getInitials(member.full_name || member.email)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-medium truncate">{member.full_name || member.email}</p>
            {member.is_leader && (
              <Badge className="text-xs py-0 px-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 gap-1">
                <Shield className="h-2.5 w-2.5" /> Leader
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
          {member.student_id && (
            <Badge variant="outline" className="text-xs mt-0.5">{member.student_id}</Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {isLeader ? (
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <Checkbox
              checked={member.has_laptop}
              disabled={updateLaptop.isPending}
              onCheckedChange={(checked) =>
                updateLaptop.mutate({ memberId: member.id, hasLaptop: !!checked })
              }
            />
            <Laptop className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground hidden sm:inline">Laptop</span>
          </label>
        ) : (
          member.has_laptop && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Laptop className="h-3 w-3" /> Laptop
            </Badge>
          )
        )}
        {canRemove && (
          <Button
            variant="ghost" size="sm"
            className="h-7 w-7 p-0"
            onClick={onRemove}
            disabled={isRemoving}
          >
            <XCircle className="h-4 w-4 text-muted-foreground hover:text-destructive transition-colors" />
          </Button>
        )}
      </div>
    </div>
  );
}

function SubmissionReadOnlyCard({ submission }: { submission: any }) {
  return (
    <Card className="overflow-hidden">
      {/* Section header */}
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <div className="h-6 w-6 rounded-md bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
            <Send className="h-3.5 w-3.5 text-green-600" />
          </div>
          Project Submission
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        {!submission ? (
          <div className="py-10 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto">
              <Send className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">No project submitted yet</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Your team leader hasn&apos;t submitted a project yet.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-0">

            {/* App name hero */}
            <div className="rounded-lg bg-gradient-to-br from-green-50 to-emerald-50/60 dark:from-green-950/20 dark:to-emerald-950/10 border border-green-100 dark:border-green-900/30 p-4 mb-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-0.5">App Name</p>
                  <p className="text-xl font-bold tracking-tight">{submission.app_name}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {submission.category && (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border-0">
                      {submission.category}
                    </Badge>
                  )}
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border-0 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Submitted
                  </Badge>
                </div>
              </div>
            </div>

            {/* Content blocks */}
            <div className="space-y-4">
              {submission.problem_statement && (
                <div className="rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="h-5 w-5 rounded bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                      <FileText className="h-3 w-3 text-red-500" />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Problem Statement</p>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/80">{submission.problem_statement}</p>
                </div>
              )}

              {submission.solution_summary && (
                <div className="rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="h-5 w-5 rounded bg-yellow-50 dark:bg-yellow-950/30 flex items-center justify-center">
                      <Lightbulb className="h-3 w-3 text-yellow-500" />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Solution Summary</p>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/80">{submission.solution_summary}</p>
                </div>
              )}

              {submission.elevator_pitch && (
                <div className="rounded-lg border-l-4 border-l-blue-400 border border-blue-100 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-950/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-blue-500 dark:text-blue-400 mb-2">
                    Elevator Pitch
                  </p>
                  <p className="text-sm leading-relaxed italic text-foreground/80">&ldquo;{submission.elevator_pitch}&rdquo;</p>
                </div>
              )}
            </div>

            {/* Project Links */}
            {(submission.github_url || submission.live_app_url || submission.lovable_url || submission.demo_video_url) && (
              <div className="pt-5 mt-5 border-t space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Project Links</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {submission.github_url && (
                    <ProjectLink
                      href={submission.github_url}
                      icon={<Github className="h-4 w-4" />}
                      label="GitHub Repository"
                      iconBg="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    />
                  )}
                  {submission.live_app_url && (
                    <ProjectLink
                      href={submission.live_app_url}
                      icon={<ExternalLink className="h-4 w-4" />}
                      label="Live App"
                      iconBg="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                    />
                  )}
                  {submission.lovable_url && (
                    <ProjectLink
                      href={submission.lovable_url}
                      icon={<Link2 className="h-4 w-4" />}
                      label="Lovable Project"
                      iconBg="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                    />
                  )}
                  {submission.demo_video_url && (
                    <ProjectLink
                      href={submission.demo_video_url}
                      icon={<Video className="h-4 w-4" />}
                      label="Demo Video"
                      iconBg="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectLink({
  href, icon, label, iconBg,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  iconBg: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 hover:border-primary/30 transition-all group"
    >
      <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xs font-medium truncate text-primary group-hover:underline">{href}</p>
      </div>
      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

function PendingInvitationsCard({
  invitations, onRespond, isPending,
}: {
  invitations: PendingInvitation[];
  onRespond: (memberId: string, accept: boolean) => void;
  isPending: boolean;
}) {
  return (
    <Card className="border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <div className="h-6 w-6 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
            <Bell className="h-3.5 w-3.5 text-blue-600" />
          </div>
          Team Invitations
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 normal-case text-xs font-medium tracking-normal ml-1">
            {invitations.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {invitations.map((inv) => (
          <div
            key={inv.member_id}
            className="flex items-center justify-between p-4 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 gap-3 flex-wrap"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">{inv.team_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {inv.event_name}
                {inv.team_code && <span className="ml-2 font-mono">#{inv.team_code}</span>}
              </p>
              {inv.invited_by_name && (
                <p className="text-xs text-muted-foreground">Invited by {inv.invited_by_name}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm" variant="outline"
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
