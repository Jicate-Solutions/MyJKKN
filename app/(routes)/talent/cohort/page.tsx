'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Calendar,
  CalendarCheck,
  Wallet,
  Award,
  Clock,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';

function formatCurrency(amount: number | null | undefined): string {
  if (!amount) return '0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'Not scheduled';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getLevelBadgeColor(level: number): string {
  const colors: Record<number, string> = {
    0: 'bg-gray-100 text-gray-800',
    1: 'bg-blue-100 text-blue-800',
    2: 'bg-green-100 text-green-800',
    3: 'bg-purple-100 text-purple-800',
  };
  return colors[level] || 'bg-gray-100 text-gray-800';
}

const LEVEL_TITLES: Record<number, string> = {
  0: 'Observer',
  1: 'Co-Lead',
  2: 'Lead',
  3: 'Master Trainer',
};

const LEVEL_REQUIREMENTS: Record<number, { sessions: number; description: string }> = {
  1: { sessions: 5, description: 'Complete 5 sessions as Observer to reach Co-Lead' },
  2: { sessions: 10, description: 'Complete 10 sessions as Co-Lead to reach Lead' },
  3: { sessions: 20, description: 'Complete 20 sessions as Lead to reach Master' },
};

interface CohortStats {
  level: number;
  total_earnings: number;
  completed_sessions: number;
  upcoming_sessions: number;
}

interface NextSession {
  title: string;
  scheduled_at: string;
  role: string;
}

export default function CohortPortalHomePage() {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<CohortStats | null>(null);
  const [nextSession, setNextSession] = useState<NextSession | null>(null);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: member } = await (supabase as any).from('sh_cohort_members')
        .select('id, level, total_earnings')
        .eq('user_id', user.id)
        .single();

      if (!member) {
        setIsLoading(false);
        return;
      }

      setMemberId(member.id);

      // Get session counts
      const [
        { count: completedCount },
        { count: upcomingCount },
        { data: nextSessionData },
      ] = await Promise.all([
        (supabase as any).from('sh_cohort_assignments').select('*', { count: 'exact', head: true })
          .eq('cohort_member_id', member.id),
        (supabase as any).from('sh_training_sessions').select('*', { count: 'exact', head: true })
          .eq('status', 'scheduled')
          .gte('session_date', new Date().toISOString().split('T')[0]),
        (supabase as any).from('sh_cohort_assignments')
          .select(`
            role,
            session:sh_training_sessions(
              title, session_date, start_time
            )
          `)
          .eq('cohort_member_id', member.id)
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      setStats({
        level: member.level || 0,
        total_earnings: member.total_earnings || 0,
        completed_sessions: completedCount || 0,
        upcoming_sessions: upcomingCount || 0,
      });

      if (nextSessionData && nextSessionData.length > 0) {
        const session = nextSessionData[0];
        setNextSession({
          title: (session.session as any)?.title || 'Training Session',
          scheduled_at: (session.session as any)?.session_date || '',
          role: session.role,
        });
      }

      setIsLoading(false);
    }

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const currentLevel = stats?.level || 0;
  const nextLevelReq = LEVEL_REQUIREMENTS[currentLevel + 1];
  const progressToNext = nextLevelReq
    ? Math.min((stats?.completed_sessions || 0) / nextLevelReq.sessions * 100, 100)
    : 100;

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back!</h1>
        <p className="text-muted-foreground">
          Here is your cohort member dashboard overview.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Level Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Your Level</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{currentLevel}</span>
              <Badge className={getLevelBadgeColor(currentLevel)}>
                {LEVEL_TITLES[currentLevel]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {nextLevelReq
                ? `${stats?.completed_sessions || 0}/${nextLevelReq.sessions} to next level`
                : 'Maximum level reached'}
            </p>
          </CardContent>
        </Card>

        {/* Upcoming Sessions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Sessions</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.upcoming_sessions || 0}</div>
            <p className="text-xs text-muted-foreground">
              Sessions scheduled
            </p>
          </CardContent>
        </Card>

        {/* Completed Sessions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.completed_sessions || 0}</div>
            <p className="text-xs text-muted-foreground">
              Sessions completed
            </p>
          </CardContent>
        </Card>

        {/* Total Earnings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats?.total_earnings)}
            </div>
            <p className="text-xs text-muted-foreground">
              All time earnings
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Next Session Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Next Session
            </CardTitle>
            <CardDescription>Your upcoming training session</CardDescription>
          </CardHeader>
          <CardContent>
            {nextSession ? (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg">
                    {nextSession.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(nextSession.scheduled_at)}
                  </p>
                  <Badge className="mt-2" variant="outline">
                    Role: {nextSession.role || 'Not assigned'}
                  </Badge>
                </div>
                <Button asChild className="w-full">
                  <Link href="/talent/cohort/schedule">
                    View Full Schedule
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="text-center py-6">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50" />
                <p className="mt-2 text-muted-foreground">No upcoming sessions</p>
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/talent/cohort/sessions">
                    Browse Available Sessions
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Level Progress Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Level Progress
            </CardTitle>
            <CardDescription>Your progression to the next level</CardDescription>
          </CardHeader>
          <CardContent>
            {nextLevelReq ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress to Level {currentLevel + 1}</span>
                    <span className="font-medium">
                      {stats?.completed_sessions || 0} / {nextLevelReq.sessions}
                    </span>
                  </div>
                  <Progress value={progressToNext} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {nextLevelReq.description}
                </p>
                <Button asChild className="w-full">
                  <Link href="/talent/cohort/level">
                    View Level Details
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="text-center py-6">
                <Award className="h-12 w-12 mx-auto text-purple-500" />
                <p className="mt-2 font-semibold text-lg">Master Trainer</p>
                <p className="text-muted-foreground">
                  You have reached the highest level!
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks for cohort members</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
              <Link href="/talent/cohort/sessions">
                <Calendar className="h-6 w-6" />
                <span>Browse Sessions</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
              <Link href="/talent/cohort/schedule">
                <CalendarCheck className="h-6 w-6" />
                <span>My Schedule</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
              <Link href="/talent/cohort/earnings">
                <Wallet className="h-6 w-6" />
                <span>View Earnings</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
              <Link href="/talent/cohort/level">
                <Award className="h-6 w-6" />
                <span>Level Progress</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
