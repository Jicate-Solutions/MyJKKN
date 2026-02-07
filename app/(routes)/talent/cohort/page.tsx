'use client';

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
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useCohortProfile,
  useDashboardStats,
  useLevelProgress,
  useUpcomingSessions,
} from '@/hooks/solutions/use-cohort-portal';

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

export default function CohortPortalHomePage() {
  const { profile, isLoading: authLoading } = useAuth();

  // Get cohort member profile
  const {
    data: cohortProfile,
    isLoading: profileLoading,
    error: profileError,
  } = useCohortProfile(profile?.id || '');

  const memberId = cohortProfile?.id;

  // Get dashboard stats
  const { data: stats, isLoading: statsLoading } = useDashboardStats(memberId || '');

  // Get level progress
  const { data: levelProgress, isLoading: levelLoading } = useLevelProgress(memberId || '');

  // Get upcoming sessions
  const { data: upcomingSessions, isLoading: sessionsLoading } = useUpcomingSessions(memberId || '');

  const isLoading = authLoading || profileLoading || statsLoading || levelLoading || sessionsLoading;

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

  if (profileError || !cohortProfile) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border bg-yellow-50 p-6 dark:bg-yellow-900/20">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-yellow-600" />
            <div>
              <h2 className="text-lg font-semibold">Cohort Profile Not Found</h2>
              <p className="text-muted-foreground mt-1">
                Your cohort member profile has not been set up yet.
                Please contact the training council to get registered.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentLevel = stats?.level || 0;
  const nextSession = upcomingSessions && upcomingSessions.length > 0 ? upcomingSessions[0] : null;

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
              {levelProgress && levelProgress.sessionsNeeded > 0
                ? `${levelProgress.currentSessions}/${levelProgress.sessionsNeeded} to next level`
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
            <div className="text-2xl font-bold">{stats?.upcomingSessions || 0}</div>
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
            <div className="text-2xl font-bold">{stats?.totalSessions || 0}</div>
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
              {formatCurrency(stats?.totalEarnings)}
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
                    {nextSession.session?.title || 'Training Session'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(nextSession.session?.session_date || null)}
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
            {levelProgress && levelProgress.sessionsNeeded > 0 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress to {levelProgress.nextLevelTitle}</span>
                    <span className="font-medium">
                      {levelProgress.currentSessions} / {levelProgress.sessionsNeeded}
                    </span>
                  </div>
                  <Progress value={levelProgress.progress} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {levelProgress.levelDescription}
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
