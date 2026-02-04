'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  BookOpen,
  Users,
  Calendar,
  Clock,
  ArrowRight,
  GraduationCap,
  MapPin,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  useTrainingPrograms,
  useUpcomingTrainingSessions,
  useCohortMemberStats,
  useTrainingSessions,
} from '@/hooks/solutions/use-training';

export function TrainingOverview() {
  // Fetch real data from hooks
  const { data: programsData, isLoading: programsLoading, error: programsError } = useTrainingPrograms({ limit: 100 });
  const { data: sessionsData, isLoading: sessionsLoading } = useTrainingSessions({ limit: 100 });
  const { data: upcomingData, isLoading: upcomingLoading } = useUpcomingTrainingSessions();
  const { data: cohortStats, isLoading: cohortLoading } = useCohortMemberStats();

  const isLoading = programsLoading || sessionsLoading || upcomingLoading || cohortLoading;

  // Calculate stats from real data
  const stats = {
    activePrograms: programsData?.count || 0,
    scheduledSessions: sessionsData?.data?.filter(s => s.status === 'scheduled').length || 0,
    cohortMembers: cohortStats?.total || 0,
    completedSessions: sessionsData?.data?.filter(s => s.status === 'completed').length || 0,
  };

  const upcomingSessions = upcomingData?.data?.slice(0, 3) || [];

  return (
    <div className="space-y-6">
      {/* Error State */}
      {programsError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load training data. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Programs</CardTitle>
            <BookOpen className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {programsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats.activePrograms}</div>
            )}
            <p className="text-xs text-muted-foreground">Training programs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Calendar className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats.scheduledSessions}</div>
            )}
            <p className="text-xs text-muted-foreground">Upcoming sessions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cohort Members</CardTitle>
            <Users className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            {cohortLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats.cohortMembers}</div>
            )}
            <p className="text-xs text-muted-foreground">Active trainers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <GraduationCap className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats.completedSessions}</div>
            )}
            <p className="text-xs text-muted-foreground">Sessions delivered</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover:border-primary transition-colors">
          <Link href="/solutions/training/programs">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                All Programs
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>View and manage training programs</CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:border-primary transition-colors">
          <Link href="/solutions/training/sessions">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Sessions Calendar
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>Schedule and track sessions</CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:border-primary transition-colors">
          <Link href="/solutions/training/cohort">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Cohort Management
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>Manage cohort members</CardDescription>
            </CardHeader>
          </Link>
        </Card>
      </div>

      {/* Upcoming Sessions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Upcoming Sessions</CardTitle>
            <CardDescription>Next scheduled training sessions</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/solutions/training/sessions">
              View All <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {upcomingLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : upcomingSessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="mx-auto h-10 w-10 mb-2" />
              <p>No upcoming sessions scheduled</p>
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div className="flex-1">
                    <p className="font-medium">{session.title || `Session ${session.session_number}`}</p>
                    <p className="text-sm text-muted-foreground">
                      {session.program?.solution?.title || 'Training Program'}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      {session.scheduled_at && (
                        <>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(session.scheduled_at), 'dd MMM yyyy')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(session.scheduled_at), 'hh:mm a')}
                          </span>
                        </>
                      )}
                      {session.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {session.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      <Users className="mr-1 h-3 w-3" />
                      {session.cohort_count || 0} cohort
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
