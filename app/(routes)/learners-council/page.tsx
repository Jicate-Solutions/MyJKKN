/**
 * Learners Council Dashboard
 * Shows overview stats and quick actions for LC members
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
  Kanban,
  TrendingUp
} from 'lucide-react';
import Link from 'next/link';

async function getDashboardStats(userId: string) {
  const supabase = await createClient();

  const [
    { count: lcMemberCount },
    { count: announcementCount },
    { count: upcomingEvents },
    { count: pendingODCount },
    { count: activePolls },
    { count: openIssues },
    { data: activeTerm }
  ] = await Promise.all([
    supabase.from('lc_members').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('lc_announcements').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('lc_events').select('*', { count: 'exact', head: true }).in('status', ['approved', 'published']),
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
    openIssues: openIssues || 0,
    activeTerm
  };
}

export default async function LearnersCouncilDashboard() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile) {
    redirect('/');
  }

  const stats = await getDashboardStats(profile.id);

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
      value: stats.openIssues,
      icon: Kanban,
      href: '/learners-council/issues',
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

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
              <Kanban className="h-4 w-4 text-red-600" />
              <span className="text-sm">Report Issue</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
