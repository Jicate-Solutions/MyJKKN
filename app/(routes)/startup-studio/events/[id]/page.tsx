'use client';
nexport const dynamic = 'force-dynamic';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useEvent, useEventStats } from '@/hooks/startup-studio/use-events';
import { useMyRegistration, useMyAcceptedMembership } from '@/hooks/startup-studio/use-event-registrations';
import { useIsEventEvaluator } from '@/hooks/startup-studio/use-appathon-verifications';
import { useAuth } from '@/hooks/use-auth';
import { EventStatusBadge } from '../_components/event-status-badge';
import { EditEventDialog } from './_components/edit-event-dialog';
import { PendingInvitationsCard } from '../_components/pending-invitations-card';
import {
  ArrowLeft,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Laptop,
  LayoutDashboard,
  Loader2,
  MapPin,
  Pencil,
  Presentation,
  Rocket,
  Trophy,
  UserCheck,
  Users,
  Building2,
  ArrowRight,
  Info,
  Layers,
  Wrench,
  Vote
} from 'lucide-react';
import { cn } from '@/lib/utils';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'TBD';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  });
}

function getDaysUntil(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  // Compare calendar dates in local timezone (strip time component)
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((targetDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return null;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return `${diffDays} days left`;
}

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: event, isPending: eventPending, isError, refetch } = useEvent(id);
  const { data: stats } = useEventStats(id);
  const { data: myRegistration } = useMyRegistration(id);
  const { data: myMembership } = useMyAcceptedMembership(id);
  const isInATeam = !!myRegistration || !!myMembership;
  const { profile, isLoading: authLoading } = useAuth();
  const { data: isEventEvaluator } = useIsEventEvaluator(id, profile?.id);
  const [editOpen, setEditOpen] = useState(false);
  // Use isPending (not isLoading) — covers both disabled queries (auth loading) AND
  // in-flight queries. Prevents "Event not found" flash during the transition.
  const isLoading = (authLoading && !profile) || eventPending;

  if (isLoading) {
    return (
      <ContentLayout title="Event">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  if (isError) {
    return (
      <ContentLayout title="Event">
        <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
          <p>Failed to load event. Please check your connection and try again.</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="Event">
        <div className="text-center py-20 text-muted-foreground">Event not found.</div>
      </ContentLayout>
    );
  }

  const isRegistrationOpen = event.status === 'registration_open' &&
    event.registration_deadline &&
    new Date(event.registration_deadline) > new Date();

  const isAdmin = profile?.is_super_admin || profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'administrator';
  const isSuperAdmin = !!(profile?.is_super_admin || profile?.role === 'super_admin');
  const isFacultyRole = !isAdmin && ['faculty', 'hod', 'principal', 'staff', 'lecturer'].includes(profile?.role ?? '');
  // Only students and super admins can register teams
  const canRegister = profile?.role === 'student' || isSuperAdmin;
  const config = event.config;
  // Individual-registration events (e.g. Sarvam Galatta) don't use team pages
  const isIndividualEvent = config?.registration_type === 'individual' || config?.registration_type === 'sarvam_galatta';
  const deadlineCountdown = getDaysUntil(event.registration_deadline);
  const isActive = ['registration_open', 'build_day', 'demo_day'].includes(event.status);

  return (
    <ContentLayout title={event.name}>
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event.name },
      ]} />

      <div className="space-y-8 mt-6 mx-auto pb-10">

        {/* Top Bar: Back + Edit */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => router.push('/startup-studio/events')}>
            <ArrowLeft className="h-4 w-4" /> Back to Events
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit Event
            </Button>
          )}
        </div>

        {/* Edit Dialog */}
        {isAdmin && (
          <EditEventDialog event={event} open={editOpen} onOpenChange={setEditOpen} />
        )}

        {/* Hero Header */}
        <div className="relative overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className={`absolute top-0 left-0 w-1.5 h-full ${isActive ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
          <div className="p-6 md:p-8 pl-8 md:pl-10">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div className="space-y-4 flex-1">
                <div className="space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <EventStatusBadge status={event.status} />
                    {event.host_institution && (
                      <Badge variant="outline" className="gap-1.5 font-normal">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        {event.host_institution.name}
                      </Badge>
                    )}
                  </div>
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">{event.name}</h1>
                </div>
                
                {event.description && (
                  <p className="text-muted-foreground text-lg leading-relaxed max-w-3xl border-l-2 pl-4 border-muted">
                    {event.description}
                  </p>
                )}
              </div>

              {/* Quick Action Buttons */}
              <div className="shrink-0 flex flex-col gap-3 min-w-[200px]">
                {canRegister && isRegistrationOpen && !isInATeam && (
                  <Link href={`/startup-studio/events/${id}/register`} className="w-full">
                    <Button size="lg" className="w-full gap-2 shadow-md hover:shadow-lg transition-all bg-primary hover:bg-primary/90">
                      <Rocket className="h-4 w-4" /> {isIndividualEvent ? 'Register Project' : 'Register Team'}
                    </Button>
                  </Link>
                )}
                {isInATeam && (
                  <Link
                    href={isIndividualEvent
                      ? `/startup-studio/events/${id}/my-registration`
                      : `/startup-studio/events/${id}/my-team`}
                    className="w-full"
                  >
                    <Button variant="outline" size="lg" className="w-full gap-2 border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary">
                      <Users className="h-4 w-4" /> {isIndividualEvent ? 'View My Registration' : 'View My Team'}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Pending Invitations — student only */}
        {!isAdmin && <PendingInvitationsCard />}

        {/* Stats Grid */}
        {stats && (
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
              label={isIndividualEvent ? 'Registered Projects' : 'Registered Teams'}
              value={stats.total_teams}
              color="blue"
            />
            <StatCard
              icon={<UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
              label="Total Participants"
              value={stats.total_members}
              color="emerald"
            />
            <StatCard
              icon={<Building2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />}
              label="Participating Colleges"
              value={stats.institutions}
              color="purple"
            />
            <StatCard
              icon={<Laptop className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
              label="Laptops Available"
              value={stats.members_with_laptops}
              color="amber"
            />
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-12 items-start">
          
          {/* Left Column: Timeline & Schedule */}
          <div className="lg:col-span-7 space-y-6">
            <Card className="h-full shadow-sm border-muted/60">
              <CardHeader className="pb-4 border-b bg-muted/30">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CalendarClock className="h-5 w-5 text-primary" />
                  Event Timeline
                </CardTitle>
                <CardDescription>Key dates and deadlines you shouldn't miss</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <TimelineItem
                  icon={<CalendarCheck className="h-5 w-5 text-blue-500" />}
                  label="Registration Deadline"
                  date={formatDate(event.registration_deadline)}
                  time={formatTime(event.registration_deadline)}
                  countdown={deadlineCountdown}
                  isNext={!!deadlineCountdown}
                />
                <div className="pl-2.5">
                  <div className="h-6 w-0.5 bg-muted" />
                </div>
                <TimelineItem
                  icon={<Calendar className="h-5 w-5 text-emerald-500" />}
                  label="Build Day Starts"
                  date={formatDate(event.start_date)}
                  time={formatTime(event.start_date)}
                  countdown={getDaysUntil(event.start_date)}
                  comingSoon={!event.start_date}
                />
                {event.submission_deadline && (
                  <>
                    <div className="pl-2.5">
                      <div className="h-6 w-0.5 bg-muted" />
                    </div>
                    <TimelineItem
                      icon={<FileText className="h-5 w-5 text-orange-500" />}
                      label="Project Submission Deadline"
                      date={formatDate(event.submission_deadline)}
                      time={formatTime(event.submission_deadline)}
                      countdown={getDaysUntil(event.submission_deadline)}
                      isNext={!!getDaysUntil(event.submission_deadline)}
                    />
                  </>
                )}
                <div className="pl-2.5">
                  <div className="h-6 w-0.5 bg-muted" />
                </div>
                <TimelineItem
                  icon={<Presentation className="h-5 w-5 text-purple-500" />}
                  label="Demo Day & Presentations"
                  date={formatDate(event.demo_date)}
                  time={formatTime(event.demo_date)}
                  countdown={getDaysUntil(event.demo_date)}
                  comingSoon={!event.demo_date}
                />
                {event.end_date && event.end_date !== event.demo_date && (
                  <>
                    <div className="pl-2.5">
                      <div className="h-6 w-0.5 bg-muted" />
                    </div>
                    <TimelineItem
                      icon={<CheckCircle2 className="h-5 w-5 text-muted-foreground" />}
                      label="Event Conclusion"
                      date={formatDate(event.end_date)}
                      time={formatTime(event.end_date)}
                      countdown={null}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Details & Config */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="h-full shadow-sm border-muted/60">
              <CardHeader className="pb-4 border-b bg-muted/30">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5 text-primary" />
                  Event Details
                </CardTitle>
                <CardDescription>Rules and configuration for this event</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <DetailRow
                  icon={<Users className="h-4 w-4" />}
                  label={isIndividualEvent ? 'Participation' : 'Team Size'}
                  value={isIndividualEvent ? 'Individual Registration' : `Max ${config?.team_max_size || 5} members`}
                />
                <Separator />
                <DetailRow 
                  icon={<Trophy className="h-4 w-4" />}
                  label="Scoring System" 
                  value={config?.scoring_type || 'Standard'} 
                />
                
                {config?.tools && config.tools.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Wrench className="h-4 w-4" />
                        <span>Required Tools</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {config.tools.map((tool: string) => (
                          <Badge key={tool} variant="secondary" className="px-2.5 py-0.5 text-xs font-medium bg-secondary/50 hover:bg-secondary/70 border-secondary-foreground/10">
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {config?.categories && config.categories.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Layers className="h-4 w-4" />
                        <span>Categories</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {config.categories.map((cat: string) => (
                          <Badge key={cat} variant="outline" className="px-2.5 py-0.5 text-xs font-medium">
                            {cat}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Action Banners */}
        <div className="grid gap-6">
          {/* Registration CTA */}
          {canRegister && isRegistrationOpen && !isInATeam && (
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-100 dark:border-emerald-900/50 p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0 shadow-sm">
                    <Rocket className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-emerald-950 dark:text-emerald-50">Ready to build something amazing?</h2>
                    <p className="text-emerald-800/80 dark:text-emerald-200/80 max-w-xl">
                      Register your team now and join the innovation journey. 
                      {deadlineCountdown && <span className="font-semibold ml-1">Registration closes in {deadlineCountdown}.</span>}
                    </p>
                  </div>
                </div>
                <Link href={`/startup-studio/events/${id}/register`}>
                  <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md gap-2">
                    Register Now <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
              {/* Decorative background elements */}
              <div className="absolute right-0 top-0 h-32 w-32 bg-emerald-200/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            </div>
          )}

          {/* Registered Banner — shown for team leader AND accepted members */}
          {isInATeam && (() => {
            const m = myMembership as any;
            const teamName = myRegistration?.team_name || m?.team_name;
            const isLeader = !!myRegistration;
            const memberCount = myRegistration?.team_members?.length || 0;
            return (
              <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-100 dark:border-blue-900/50 p-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-blue-950 dark:text-blue-50">Registration Confirmed</h3>
                      <p className="text-sm text-blue-800/80 dark:text-blue-200/80">
                        {isIndividualEvent
                          ? <>You are registered as <span className="font-semibold">{teamName}</span>.</>
                          : <>You are participating as <span className="font-semibold">{teamName}</span>{isLeader && ` with ${memberCount} members`}.</>
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 shrink-0 flex-wrap">
                    {isIndividualEvent ? (
                      <Link href={`/startup-studio/events/${id}/my-registration`}>
                        <Button variant="outline" className="bg-white/50 hover:bg-white/80 dark:bg-black/20 dark:hover:bg-black/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 gap-2">
                          <FileText className="h-4 w-4" /> View Registration
                        </Button>
                      </Link>
                    ) : (
                      <>
                        <Link href={`/startup-studio/events/${id}/my-team`}>
                          <Button variant="outline" className="bg-white/50 hover:bg-white/80 dark:bg-black/20 dark:hover:bg-black/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 gap-2">
                            <Users className="h-4 w-4" /> {isLeader ? 'Manage Team' : 'View My Team'}
                          </Button>
                        </Link>
                        {event.voting_opened_at && (
                          <Link href={`/startup-studio/events/${id}/vote`}>
                            <Button variant="outline" className="bg-white/50 hover:bg-white/80 dark:bg-black/20 dark:hover:bg-black/40 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 gap-2">
                              <Vote className="h-4 w-4" /> {event.voting_closed_at ? 'View Votes' : 'Vote Now'}
                            </Button>
                          </Link>
                        )}
                        <Link href={`/startup-studio/events/${id}/submit`}>
                          <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm gap-2">
                            <FileText className="h-4 w-4" /> {isLeader ? 'Submit Project' : 'View Submission'}
                          </Button>
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Voting Banner — visible to everyone when voting is open */}
        {event.voting_opened_at && !event.voting_closed_at && (
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30 border border-purple-100 dark:border-purple-900/50 p-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center shrink-0">
                  <Vote className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-purple-950 dark:text-purple-50">Audience Voting is Live!</h3>
                  <p className="text-sm text-purple-800/80 dark:text-purple-200/80">
                    Rate and vote for your favourite teams. Every vote counts!
                  </p>
                </div>
              </div>
              <Link href={`/startup-studio/events/${id}/vote`}>
                <Button className="bg-purple-600 hover:bg-purple-700 text-white shadow-md gap-2">
                  <Vote className="h-4 w-4" /> Vote Now <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="absolute right-0 top-0 h-32 w-32 bg-purple-200/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          </div>
        )}

        {/* Results Published Banner — visible to ALL roles */}
        {event.is_results_published && (
          <div className="relative overflow-hidden rounded-xl border border-yellow-200 dark:border-yellow-800/50 shadow-sm">
            {/* Gradient background */}
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-50 via-amber-50 to-orange-50 dark:from-yellow-950/40 dark:via-amber-950/30 dark:to-orange-950/20" />
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_25%,rgba(255,215,0,0.1)_50%,transparent_75%)] bg-[length:250%_100%] animate-shimmer" />

            <div className="relative z-10 p-6 md:p-8">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shrink-0 shadow-lg shadow-yellow-200/50 dark:shadow-yellow-900/30">
                    <Trophy className="h-7 w-7 text-white" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl sm:text-2xl font-bold text-amber-950 dark:text-amber-50">
                      Results are Live!
                    </h2>
                    <p className="text-sm text-amber-800/80 dark:text-amber-200/70">
                      The final leaderboard has been published. See how teams ranked!
                    </p>
                  </div>
                </div>
                <Link href={`/startup-studio/events/${id}/leaderboard`}>
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-white shadow-lg shadow-amber-200/50 dark:shadow-amber-900/30 gap-2 font-semibold px-6 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Trophy className="h-4 w-4" />
                    View Results
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Evaluator Panel — shown to judges/evaluators/panel_chairs who are not admins */}
        {!isAdmin && isEventEvaluator && (
          <Card className="border-dashed border-2 shadow-none bg-muted/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                <ClipboardCheck className="h-4 w-4" />
                Evaluator Controls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
                <AdminLink href={`/startup-studio/events/${id}/evaluate`} icon={<ClipboardCheck className="h-5 w-5" />} label="Evaluate Teams" />
                <AdminLink href={`/startup-studio/events/${id}/leaderboard`} icon={<Trophy className="h-5 w-5" />} label="Leaderboard" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Staff / Mentor Panel — shown to faculty, hod, principal, staff, lecturer who are not admins */}
        {isFacultyRole && !isAdmin && (
          <Card className="border-dashed border-2 shadow-none bg-muted/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                Mentor Controls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
                <AdminLink href={`/startup-studio/events/${id}/my-assignment`} icon={<ClipboardList className="h-5 w-5" />} label="My Assignment" />
                <AdminLink href={`/startup-studio/events/${id}/venues`} icon={<MapPin className="h-5 w-5" />} label="Venues & Mentors" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Admin Panel */}
        {isAdmin && (
          <Card className="border-dashed border-2 shadow-none bg-muted/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                <LayoutDashboard className="h-4 w-4" />
                Admin Controls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
                <AdminLink href={`/startup-studio/events/${id}/registrations`} icon={<ClipboardList className="h-5 w-5" />} label="Registrations" count={stats?.total_teams} />
                <AdminLink href={`/startup-studio/events/${id}/venues`} icon={<MapPin className="h-5 w-5" />} label="Venues" />
                <AdminLink href={`/startup-studio/events/${id}/demo-day`} icon={<Presentation className="h-5 w-5" />} label="Demo Day" />
                <AdminLink href={`/startup-studio/events/${id}/evaluate`} icon={<ClipboardCheck className="h-5 w-5" />} label="Evaluate" />
                <AdminLink href={`/startup-studio/events/${id}/leaderboard`} icon={<Trophy className="h-5 w-5" />} label="Leaderboard" />
                <AdminLink href={`/startup-studio/events/${id}/checklists`} icon={<CheckCircle2 className="h-5 w-5" />} label="Checklists" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}

/* ─── Sub-components ──────────────────────────── */

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: 'blue' | 'emerald' | 'purple' | 'amber' }) {
  const colorStyles = {
    blue: 'border-l-blue-500 bg-blue-50/30 dark:bg-blue-900/10',
    emerald: 'border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-900/10',
    purple: 'border-l-purple-500 bg-purple-50/30 dark:bg-purple-900/10',
    amber: 'border-l-amber-500 bg-amber-50/30 dark:bg-amber-900/10',
  };

  return (
    <Card className={cn("border-l-4 shadow-sm hover:shadow-md transition-shadow", colorStyles[color])}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="p-2 rounded-lg bg-background shadow-sm">
            {icon}
          </div>
          <span className="text-3xl font-bold tracking-tight">{value}</span>
        </div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      </CardContent>
    </Card>
  );
}

function TimelineItem({ icon, label, date, time, countdown, isNext, comingSoon }: {
  icon: React.ReactNode; label: string; date: string; time: string; countdown: string | null; isNext?: boolean; comingSoon?: boolean;
}) {
  return (
    <div className={cn("flex gap-4 group", isNext && "bg-muted/30 -mx-4 px-4 py-3 rounded-lg border border-muted/50")}>
      <div className={cn("mt-1 p-2 rounded-full shrink-0 h-10 w-10 flex items-center justify-center", comingSoon ? "bg-muted/30" : isNext ? "bg-background shadow-sm" : "bg-muted/50")}>
        {icon}
      </div>
      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className={cn("font-medium", comingSoon ? "text-sm text-muted-foreground/70" : isNext ? "text-base text-foreground" : "text-sm text-foreground/80")}>{label}</p>
          {countdown && (
            <Badge variant={isNext ? "default" : "secondary"} className="shrink-0">
              {countdown}
            </Badge>
          )}
        </div>
        {comingSoon ? (
          <Badge variant="outline" className="gap-1.5 text-xs text-muted-foreground border-dashed">
            <CalendarClock className="h-3 w-3" /> Coming Soon
          </Badge>
        ) : (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>{date}</span>
            </div>
            {time && (
              <div className="flex items-center gap-1.5 border-l pl-3 border-muted-foreground/30">
                <CalendarClock className="h-3.5 w-3.5" />
                <span>{time}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2.5 text-muted-foreground">
        {icon || <Info className="h-4 w-4" />}
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function AdminLink({ href, icon, label, count }: { href: string; icon: React.ReactNode; label: string; count?: number }) {
  return (
    <Link href={href} className="block group">
      <div className="flex flex-col items-center justify-center gap-3 p-4 rounded-xl border bg-card hover:bg-accent hover:text-accent-foreground transition-all text-center h-full">
        <div className="p-2 rounded-full bg-muted group-hover:bg-background transition-colors">
          {icon}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold">{label}</p>
          {count !== undefined && (
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
              {count} items
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}
