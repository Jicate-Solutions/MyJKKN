/**
 * Learners Council Dashboard
 * Shows overview stats, live data sections, and role-specific content
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Crown,
  Users,
  Megaphone,
  CalendarCheck,
  ClipboardSignature,
  Vote,
  Bell,
  TrendingUp,
  Clock,
  AlertTriangle,
  BarChart3,
  ArrowRight
} from 'lucide-react';
import Link from 'next/link';

async function getDashboardStats(userId: string, institutionId: string | null, scopeAll: boolean) {
  const supabase = await createClient();

  // Build institution-scoped queries when not viewing LC-wide
  const applyScope = (query: any) => {
    if (!scopeAll && institutionId) {
      return query.eq('institution_id', institutionId);
    }
    return query;
  };

  const [
    { count: lcMemberCount },
    { count: announcementCount },
    { count: upcomingEvents },
    { count: pendingODCount },
    { count: activePolls },
    { count: unreadNotifications },
    { data: activeTerm }
  ] = await Promise.all([
    applyScope(supabase.from('lc_members').select('*', { count: 'exact', head: true }).eq('status', 'active')),
    supabase.from('lc_announcements').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    applyScope(supabase.from('lc_events').select('*', { count: 'exact', head: true }).in('status', ['approved', 'published'])),
    supabase.from('lc_od_requests').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
    supabase.from('lc_polls').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('lc_notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false),
    supabase.from('lc_terms').select('*').eq('status', 'active').maybeSingle()
  ]);

  return {
    lcMemberCount: lcMemberCount || 0,
    announcementCount: announcementCount || 0,
    upcomingEvents: upcomingEvents || 0,
    pendingODCount: pendingODCount || 0,
    activePolls: activePolls || 0,
    unreadNotifications: unreadNotifications || 0,
    activeTerm
  };
}

async function getLiveData(userId: string, role: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const [
    { data: recentAnnouncements },
    { data: activePolls },
    { data: upcomingEvents },
    { count: myPendingOD },
    { count: myAssignedIssues },
    { count: awaitingApprovalOD },
    { count: awaitingApprovalEvents }
  ] = await Promise.all([
    // Recent announcements
    supabase
      .from('lc_announcements')
      .select('id, title, urgency, published_at, created_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(5),
    // Active polls
    supabase
      .from('lc_polls')
      .select('id, title, total_votes, ends_at')
      .eq('status', 'active')
      .order('ends_at', { ascending: true })
      .limit(5),
    // Upcoming events
    supabase
      .from('lc_events')
      .select('id, title, starts_at, venue_name')
      .in('status', ['approved', 'published'])
      .gte('starts_at', now)
      .order('starts_at', { ascending: true })
      .limit(5),
    // My pending OD requests
    supabase
      .from('lc_od_requests')
      .select('*', { count: 'exact', head: true })
      .eq('requester_id', userId)
      .in('status', ['submitted', 'in_review']),
    // My assigned issues
    supabase
      .from('lc_issues')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .in('status', ['open', 'in_progress']),
    // Awaiting my OD approval (for staff)
    supabase
      .from('lc_od_approvals')
      .select('*', { count: 'exact', head: true })
      .eq('approver_id', userId)
      .is('acted_at', null),
    // Awaiting my event approval (for staff)
    supabase
      .from('lc_event_approvals')
      .select('*', { count: 'exact', head: true })
      .eq('approver_id', userId)
      .is('acted_at', null)
  ]);

  return {
    recentAnnouncements: recentAnnouncements || [],
    activePolls: activePolls || [],
    upcomingEvents: upcomingEvents || [],
    myPendingOD: myPendingOD || 0,
    myAssignedIssues: myAssignedIssues || 0,
    awaitingApprovalOD: awaitingApprovalOD || 0,
    awaitingApprovalEvents: awaitingApprovalEvents || 0
  };
}

const urgencyColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  normal: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700'
};

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default async function LearnersCouncilDashboard({
  searchParams
}: {
  searchParams?: Promise<{ scope?: string }>;
}) {
  const { profile } = await getEnhancedUserProfile();

  if (!profile) {
    redirect('/');
  }

  const supabase = await createClient();

  // Check LC membership from DB
  const { data: lcMembership } = await supabase
    .from('lc_members')
    .select('id, position_id, status')
    .eq('user_id', profile.id)
    .eq('status', 'active')
    .maybeSingle();
  const isLCMember = !!lcMembership;

  const isStaffOrAdmin = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(profile.role || '');
  const isMD = profile.role === 'super_admin';

  // Resolve scope: MD/super_admin defaults to lc_wide, others default to institution
  const params = searchParams ? await searchParams : {};
  const scopeParam = params.scope;
  const scopeAll = isMD ? (scopeParam !== 'institution') : (scopeParam === 'lc_wide');

  const stats = await getDashboardStats(profile.id, profile.institution_id || null, scopeAll);
  const liveData = await getLiveData(profile.id, profile.role || '');

  const dashboardCards = [
    {
      title: 'LC Members',
      value: stats.lcMemberCount,
      icon: Users,
      href: '/learners-council/structure/members',
      color: 'text-blue-600',
      bg: 'bg-blue-50'
    },
    {
      title: 'Announcements',
      value: stats.announcementCount,
      icon: Megaphone,
      href: '/learners-council/communication',
      color: 'text-purple-600',
      bg: 'bg-purple-50'
    },
    {
      title: 'Upcoming Events',
      value: stats.upcomingEvents,
      icon: CalendarCheck,
      href: '/learners-council/events',
      color: 'text-green-600',
      bg: 'bg-green-50'
    },
    {
      title: 'Pending OD',
      value: stats.pendingODCount,
      icon: ClipboardSignature,
      href: '/learners-council/od',
      color: 'text-orange-600',
      bg: 'bg-orange-50'
    },
    {
      title: 'Active Polls',
      value: stats.activePolls,
      icon: Vote,
      href: '/learners-council/communication/polls',
      color: 'text-indigo-600',
      bg: 'bg-indigo-50'
    },
    {
      title: 'Unread Notifications',
      value: stats.unreadNotifications,
      icon: Bell,
      href: '/learners-council/settings',
      color: 'text-red-600',
      bg: 'bg-red-50'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Active Term Banner */}
      {stats.activeTerm && (
        <div className="rounded-lg border bg-gradient-to-r from-amber-50 to-yellow-50 p-4">
          <div className="flex items-center gap-3">
            <Crown className="h-6 w-6 text-amber-600" />
            <div>
              <h2 className="font-semibold text-lg">{stats.activeTerm.name}</h2>
              <p className="text-sm text-muted-foreground">
                {new Date(stats.activeTerm.start_date).toLocaleDateString()} — {new Date(stats.activeTerm.end_date).toLocaleDateString()}
              </p>
            </div>
            <Badge variant="default" className="ml-auto bg-amber-600">Active Term</Badge>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {dashboardCards.map((card) => (
          <Link key={card.title} href={card.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className={`inline-flex p-2 rounded-lg ${card.bg} mb-2`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <p className="text-2xl font-bold">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.title}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Role-Specific Pending Items */}
      {isStaffOrAdmin && (liveData.awaitingApprovalOD > 0 || liveData.awaitingApprovalEvents > 0) && (
        <Card className="border-orange-200 bg-orange-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-5 w-5" />
              Awaiting Your Approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {liveData.awaitingApprovalOD > 0 && (
                <Link href="/learners-council/od/approvals">
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-white hover:bg-orange-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <ClipboardSignature className="h-4 w-4 text-orange-600" />
                      <span className="text-sm font-medium">OD Requests</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-orange-100 text-orange-700">{liveData.awaitingApprovalOD}</Badge>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              )}
              {liveData.awaitingApprovalEvents > 0 && (
                <Link href="/learners-council/events/proposals">
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-white hover:bg-orange-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <CalendarCheck className="h-4 w-4 text-orange-600" />
                      <span className="text-sm font-medium">Event Proposals</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-orange-100 text-orange-700">{liveData.awaitingApprovalEvents}</Badge>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* My Pending Items (for learners) */}
      {isLCMember && (liveData.myPendingOD > 0 || liveData.myAssignedIssues > 0) && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <Clock className="h-5 w-5" />
              My Pending Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {liveData.myPendingOD > 0 && (
                <Link href="/learners-council/od">
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-white hover:bg-blue-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <ClipboardSignature className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">My OD Requests</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-blue-100 text-blue-700">{liveData.myPendingOD}</Badge>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              )}
              {liveData.myAssignedIssues > 0 && (
                <Link href="/learners-council/issues">
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-white hover:bg-blue-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">Assigned Issues</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-blue-100 text-blue-700">{liveData.myAssignedIssues}</Badge>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live Data Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Announcements */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-base">
                <Megaphone className="h-4 w-4 text-purple-600" />
                Recent Announcements
              </span>
              <Link href="/learners-council/communication" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {liveData.recentAnnouncements.length > 0 ? (
              <div className="space-y-3">
                {liveData.recentAnnouncements.map((a: any) => (
                  <Link key={a.id} href="/learners-council/communication" className="block">
                    <div className="flex items-start justify-between gap-2 p-2 rounded-lg hover:bg-accent transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{a.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(a.published_at || a.created_at)}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-xs shrink-0 ${urgencyColors[a.urgency] || urgencyColors.normal}`}>
                        {a.urgency}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No announcements yet</p>
            )}
          </CardContent>
        </Card>

        {/* Active Polls */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-base">
                <Vote className="h-4 w-4 text-indigo-600" />
                Active Polls
              </span>
              <Link href="/learners-council/communication/polls" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {liveData.activePolls.length > 0 ? (
              <div className="space-y-3">
                {liveData.activePolls.map((p: any) => (
                  <Link key={p.id} href="/learners-council/communication/polls" className="block">
                    <div className="flex items-start justify-between gap-2 p-2 rounded-lg hover:bg-accent transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{p.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.total_votes} votes · Ends {new Date(p.ends_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 shrink-0">
                        Vote
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No active polls</p>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Events */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-base">
                <CalendarCheck className="h-4 w-4 text-green-600" />
                Upcoming Events
              </span>
              <Link href="/learners-council/events" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {liveData.upcomingEvents.length > 0 ? (
              <div className="space-y-3">
                {liveData.upcomingEvents.map((e: any) => (
                  <Link key={e.id} href="/learners-council/events" className="block">
                    <div className="flex items-start justify-between gap-2 p-2 rounded-lg hover:bg-accent transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{e.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(e.starts_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {e.venue_name && ` · ${e.venue_name}`}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 shrink-0">
                        {new Date(e.starts_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No upcoming events</p>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/learners-council/communication" className="flex items-center gap-2 p-3 rounded-lg border hover:bg-accent transition-colors">
                <Megaphone className="h-4 w-4 text-purple-600" />
                <span className="text-sm">New Announcement</span>
              </Link>
              <Link href="/learners-council/events/proposals" className="flex items-center gap-2 p-3 rounded-lg border hover:bg-accent transition-colors">
                <CalendarCheck className="h-4 w-4 text-green-600" />
                <span className="text-sm">Propose Event</span>
              </Link>
              <Link href="/learners-council/od" className="flex items-center gap-2 p-3 rounded-lg border hover:bg-accent transition-colors">
                <ClipboardSignature className="h-4 w-4 text-orange-600" />
                <span className="text-sm">Request OD</span>
              </Link>
              <Link href="/learners-council/issues" className="flex items-center gap-2 p-3 rounded-lg border hover:bg-accent transition-colors">
                <BarChart3 className="h-4 w-4 text-red-600" />
                <span className="text-sm">Report Issue</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
