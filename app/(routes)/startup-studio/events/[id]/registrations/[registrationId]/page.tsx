'use client';


import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
  Hash,
  Laptop,
  Lightbulb,
  Loader2,
  MapPin,
  Shield,
  ShieldCheck,
  ShieldX,
  Users,
  UserCheck,
  Github,
  Globe,
  Calendar,
  Trophy,
  Star,
  Zap,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { useRegistration, useToggleCheckIn, useUpdateRegistrationStatus } from '@/hooks/startup-studio/use-event-registrations';
import type { EventTeamMember, TeamMemberStatus } from '@/types/startup-studio';

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TeamDetailPage({
  params,
}: {
  params: Promise<{ id: string; registrationId: string }>;
}) {
  const { id: eventId, registrationId } = use(params);
  const router = useRouter();

  const { data: event } = useEvent(eventId);
  const { data: reg, isLoading: regLoading } = useRegistration(registrationId);
  const { profile, isLoading: authLoading } = useAuth();
  const isLoading = authLoading || regLoading;

  const isAdmin =
    profile?.is_super_admin === true ||
    profile?.role === 'admin' ||
    profile?.role === 'administrator' ||
    profile?.role === 'super_admin';

  const toggleCheckIn = useToggleCheckIn();
  const updateStatus = useUpdateRegistrationStatus();

  const teamName = reg?.team_name || 'Team Details';
  const acceptedMembers = (reg?.team_members || []).filter((m) => m.status === 'accepted');
  const laptopCount = acceptedMembers.filter((m) => m.has_laptop).length;

  return (
    <ContentLayout title={teamName}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event?.name || 'Event', href: `/startup-studio/events/${eventId}` },
          { label: 'Registrations', href: `/startup-studio/events/${eventId}/registrations` },
          { label: teamName },
        ]}
      />

      <div className="space-y-6 mt-4 pb-12">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
          onClick={() => router.push(`/startup-studio/events/${eventId}/registrations`)}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Registrations
        </Button>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading team details...</p>
          </div>
        ) : !reg ? (
          <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground">
            <Users className="h-12 w-12 opacity-20" />
            <p className="text-sm font-medium">Team not found</p>
            <p className="text-xs">This registration may have been removed.</p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* ── Hero Header ── */}
            <div className="rounded-xl border bg-gradient-to-br from-background to-muted/40 overflow-hidden">
              {/* Coloured accent strip */}
              <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500" />

              <div className="p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">

                  {/* Team identity */}
                  <div className="space-y-3 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{reg.team_name}</h1>
                      <StatusBadge status={reg.status} checkedIn={reg.checked_in} />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      {reg.team_code && (
                        <span className="inline-flex items-center gap-1.5 font-mono bg-background border rounded-md px-2.5 py-1 text-xs font-medium shadow-sm">
                          <Hash className="h-3 w-3 text-muted-foreground" />
                          {reg.team_code}
                        </span>
                      )}
                      {reg.institution?.name && (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <Building2 className="h-3.5 w-3.5" />
                          {reg.institution.name}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(reg.created_at), 'dd MMM yyyy, h:mm a')}
                      </span>
                    </div>

                    {/* Team leader */}
                    {(reg.owner?.full_name || reg.owner?.email) && (
                      <div className="inline-flex items-center gap-2 rounded-lg bg-background border px-3 py-2 shadow-sm">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                          {getInitials(reg.owner?.full_name || reg.owner?.email || '')}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground leading-none mb-0.5">Team Leader</p>
                          <p className="text-sm font-medium truncate">{reg.owner?.full_name || reg.owner?.email}</p>
                        </div>
                        <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </div>
                    )}
                  </div>

                  {/* Admin actions */}
                  {isAdmin && (
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
                      <Button
                        size="sm"
                        variant={reg.checked_in ? 'default' : 'outline'}
                        className={cn(
                          'gap-1.5',
                          reg.checked_in && 'bg-green-600 hover:bg-green-700 text-white border-green-600'
                        )}
                        onClick={() =>
                          toggleCheckIn.mutate({ registrationId: reg.id, checked_in: !reg.checked_in })
                        }
                        disabled={toggleCheckIn.isPending}
                      >
                        {toggleCheckIn.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserCheck className="h-3.5 w-3.5" />
                        )}
                        {reg.checked_in ? 'Checked In' : 'Check In'}
                      </Button>
                      {reg.status === 'disqualified' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-950/20"
                          onClick={() => updateStatus.mutate({ registrationId: reg.id, status: 'registered' })}
                          disabled={updateStatus.isPending}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" /> Reinstate
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                          onClick={() => updateStatus.mutate({ registrationId: reg.id, status: 'disqualified' })}
                          disabled={updateStatus.isPending}
                        >
                          <ShieldX className="h-3.5 w-3.5" /> Disqualify
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Quick stat strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t">
                  <QuickStat
                    icon={<Users className="h-4 w-4 text-blue-500" />}
                    label="Members"
                    value={`${acceptedMembers.length}`}
                    sub="accepted"
                    color="text-blue-600"
                  />
                  <QuickStat
                    icon={<Laptop className="h-4 w-4 text-amber-500" />}
                    label="Laptops"
                    value={`${laptopCount}`}
                    sub={`of ${acceptedMembers.length}`}
                    color="text-amber-600"
                  />
                  <QuickStat
                    icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
                    label="Check-in"
                    value={reg.checked_in ? 'Checked In' : 'Not yet'}
                    sub={reg.checked_in && reg.checked_in_at ? format(new Date(reg.checked_in_at), 'h:mm a') : undefined}
                    color={reg.checked_in ? 'text-green-600' : 'text-muted-foreground'}
                  />
                </div>
              </div>
            </div>

            {/* ── Main grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Left column (wider) */}
              <div className="lg:col-span-2 space-y-6">

                {/* Team Members */}
                <Card>
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        Team Members
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {(reg.team_members || []).length} total
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {(reg.team_members || []).length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">No members yet</p>
                      </div>
                    ) : (
                      (reg.team_members || []).map((member) => (
                        <MemberCard key={member.id} member={member} />
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* Problem / Idea */}
                {reg.problem_idea && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-amber-500" />
                        Problem / Idea
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap bg-muted/30 rounded-lg p-4 border">
                        {reg.problem_idea}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Submission */}
                {reg.submission && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          Submission
                          {reg.submission.app_name && (
                            <span className="font-semibold text-foreground">{reg.submission.app_name}</span>
                          )}
                        </CardTitle>
                        {reg.submission.tier_level > 0 && (
                          <Badge className="gap-1 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200">
                            <Trophy className="h-3 w-3" />
                            Tier {reg.submission.tier_level}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {/* Links */}
                      <div className="flex flex-wrap gap-2">
                        {reg.submission.github_url && (
                          <SubmissionLink href={reg.submission.github_url} icon={<Github className="h-3.5 w-3.5" />} label="GitHub" />
                        )}
                        {reg.submission.live_app_url && (
                          <SubmissionLink href={reg.submission.live_app_url} icon={<Globe className="h-3.5 w-3.5" />} label="Live App" />
                        )}
                        {reg.submission.lovable_url && (
                          <SubmissionLink href={reg.submission.lovable_url} icon={<Zap className="h-3.5 w-3.5" />} label="Lovable" />
                        )}
                        {reg.submission.demo_video_url && (
                          <SubmissionLink href={reg.submission.demo_video_url} icon={<ExternalLink className="h-3.5 w-3.5" />} label="Demo Video" />
                        )}
                      </div>

                      <Separator />

                      {/* Score + metrics grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border border-green-100 dark:border-green-900/30 p-3 text-center">
                          <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                            ${(reg.submission.mrr_amount || 0).toLocaleString()}
                          </p>
                          <p className="text-xs text-green-600/80 dark:text-green-500 mt-0.5">Monthly Revenue</p>
                        </div>
                        <div className="rounded-lg bg-muted/40 border p-3 text-center">
                          <p className="text-2xl font-bold">{(reg.submission.user_count || 0).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Total Users</p>
                        </div>
                        <div className="rounded-lg bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-100 dark:border-amber-900/30 p-3 text-center">
                          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                            {(reg.submission.paying_users_count || 0).toLocaleString()}
                          </p>
                          <p className="text-xs text-amber-600/80 dark:text-amber-500 mt-0.5">Paying Users</p>
                        </div>
                        <div className="rounded-lg bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 border border-violet-100 dark:border-violet-900/30 p-3 text-center">
                          <p className="text-2xl font-bold text-violet-700 dark:text-violet-400">
                            {reg.submission.total_score || 0}
                          </p>
                          <p className="text-xs text-violet-600/80 dark:text-violet-500 mt-0.5 flex items-center justify-center gap-0.5">
                            <Star className="h-3 w-3" /> Total Score
                          </p>
                        </div>
                      </div>

                      {/* Description */}
                      {reg.submission.description && (
                        <>
                          <Separator />
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                              Description
                            </p>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {reg.submission.description}
                            </p>
                          </div>
                        </>
                      )}

                      {/* Submission meta */}
                      {reg.submission.submitted_at && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          Submitted {format(new Date(reg.submission.submitted_at), 'dd MMM yyyy, h:mm a')}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right column (sidebar) */}
              <div className="space-y-6">

                {/* Event Info */}
                {event && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        Event
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm font-semibold">{event.name}</p>
                      {event.start_date && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          <span>{format(new Date(event.start_date), 'dd MMM yyyy')}</span>
                        </div>
                      )}
                      <Badge
                        variant="outline"
                        className="text-xs capitalize"
                      >
                        {event.status?.replace(/_/g, ' ')}
                      </Badge>
                    </CardContent>
                  </Card>
                )}

                {/* Venue Allocations */}
                {(reg.venue_allocations || []).length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5" /> Venue Allocations
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(reg.venue_allocations || []).map((alloc: any) => {
                        const va = alloc.venue_assignment;
                        const venueName = va?.manual_name || va?.resource?.name || 'Unnamed Venue';
                        const location = [
                          va?.manual_building || va?.resource?.building_number,
                          va?.manual_room
                            ? `Room ${va.manual_room}`
                            : va?.resource?.room_number
                            ? `Room ${va.resource.room_number}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ');

                        return (
                          <div key={alloc.id} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <MapPin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                                <p className="text-sm font-medium truncate">{venueName}</p>
                              </div>
                              <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">
                                {alloc.day_type === 'build_day' ? 'Build Day' : 'Demo Day'}
                              </Badge>
                            </div>
                            {location && (
                              <p className="text-xs text-muted-foreground pl-5">{location}</p>
                            )}
                            {va?.institution?.name && (
                              <p className="text-xs text-muted-foreground pl-5">{va.institution.name}</p>
                            )}
                            {(va?.staff_assignments || []).length > 0 && (
                              <div className="pl-5 flex flex-wrap gap-1.5 pt-1">
                                {(va.staff_assignments as any[]).map((sa: any) => (
                                  <Badge key={sa.id} variant="secondary" className="text-[10px] px-1.5">
                                    {sa.staff ? `${sa.staff.first_name} ${sa.staff.last_name}` : 'Staff'}
                                    <span className="text-muted-foreground ml-1 capitalize">
                                      ({sa.role?.replace(/_/g, ' ')})
                                    </span>
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* Registration meta */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Registration Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Registration ID</span>
                      <span className="font-mono text-foreground">{reg.id.slice(0, 8)}…</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span>Registered</span>
                      <span className="text-foreground">{format(new Date(reg.created_at), 'dd MMM yyyy')}</span>
                    </div>
                    {reg.checked_in_at && (
                      <>
                        <Separator />
                        <div className="flex justify-between">
                          <span>Checked in at</span>
                          <span className="text-green-600">{format(new Date(reg.checked_in_at), 'h:mm a, dd MMM')}</span>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Avatar color based on name hash for visual variety
function getAvatarColor(name: string): string {
  const colors = [
    'from-violet-400 to-indigo-500',
    'from-pink-400 to-rose-500',
    'from-amber-400 to-orange-500',
    'from-teal-400 to-cyan-500',
    'from-green-400 to-emerald-500',
    'from-blue-400 to-sky-500',
  ];
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function MemberCard({ member }: { member: EventTeamMember }) {
  const memberStatusConfig: Record<TeamMemberStatus, { label: string; class: string }> = {
    accepted: { label: 'Accepted', class: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' },
    pending:  { label: 'Pending',  class: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
    declined: { label: 'Declined', class: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' },
    removed:  { label: 'Removed',  class: 'bg-muted text-muted-foreground' },
  };
  const sc = memberStatusConfig[member.status] || memberStatusConfig.removed;
  const displayName = member.full_name || member.email;
  const avatarColor = getAvatarColor(displayName);

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors',
      member.status === 'accepted' ? 'bg-background hover:bg-muted/30' : 'bg-muted/20 opacity-75'
    )}>
      {/* Avatar */}
      <div className={cn(
        'h-9 w-9 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0',
        avatarColor
      )}>
        {getInitials(displayName)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium truncate">{member.full_name || '—'}</span>
          {member.is_leader && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-violet-300 text-violet-600 dark:text-violet-400 dark:border-violet-700">
              Leader
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{member.email}</p>
        {member.student_id && (
          <p className="text-[10px] font-mono text-muted-foreground/70 mt-0.5">{member.student_id}</p>
        )}
      </div>

      {/* Right side: laptop + status */}
      <div className="flex items-center gap-2 shrink-0">
        {member.has_laptop ? (
          <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-md px-2 py-1">
            <Laptop className="h-3 w-3" />
            <span className="hidden sm:inline">Laptop</span>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground/50 hidden sm:block">No laptop</div>
        )}
        <Badge className={cn('text-[10px] px-2 h-5', sc.class)}>
          {sc.label}
        </Badge>
      </div>
    </div>
  );
}

function QuickStat({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-background border flex items-center justify-center shrink-0 shadow-sm">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium leading-none mb-1">{label}</p>
        <p className={cn('text-sm font-semibold leading-none', color)}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status, checkedIn }: { status: string; checkedIn: boolean }) {
  if (checkedIn) {
    return (
      <Badge className="gap-1 bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 border-green-200">
        <CheckCircle2 className="h-3 w-3" /> Checked In
      </Badge>
    );
  }
  if (status === 'disqualified') {
    return <Badge variant="destructive" className="gap-1"><ShieldX className="h-3 w-3" /> Disqualified</Badge>;
  }
  return <Badge variant="secondary">Registered</Badge>;
}

function SubmissionLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs border rounded-md px-3 py-1.5 hover:bg-muted hover:border-foreground/20 transition-colors font-medium"
    >
      {icon}
      {label}
      <ExternalLink className="h-2.5 w-2.5 text-muted-foreground ml-0.5" />
    </a>
  );
}
