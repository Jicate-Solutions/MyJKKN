'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Clock, MapPin, CalendarCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useCohortProfile,
  useMySchedule,
} from '@/hooks/solutions/use-cohort-portal';

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'TBD';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function MySchedulePage() {
  const { profile, isLoading: authLoading } = useAuth();

  // Get cohort member profile
  const { data: cohortProfile, isLoading: profileLoading } = useCohortProfile(profile?.id || '');
  const memberId = cohortProfile?.id;

  // Get schedule
  const { data: assignments, isLoading: scheduleLoading } = useMySchedule(memberId || '');

  const isLoading = authLoading || profileLoading || scheduleLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!cohortProfile) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border bg-yellow-50 p-6 dark:bg-yellow-900/20">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-yellow-600" />
            <div>
              <h2 className="text-lg font-semibold">Cohort Profile Not Found</h2>
              <p className="text-muted-foreground mt-1">
                Your cohort member profile has not been set up yet.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const typedAssignments = (assignments || []) as Array<{
    id: string;
    role: string;
    session?: {
      id: string;
      title: string;
      session_date: string;
      location?: string | null;
      status: string;
      program?: {
        title: string;
        solution?: {
          title: string;
          client?: {
            name: string;
          };
        };
      };
    };
  }>;

  const now = new Date();
  const upcomingSessions = typedAssignments.filter(
    (a) => a.session && new Date(a.session.session_date + 'T00:00:00') > now && a.session.status !== 'completed'
  );
  const pastSessions = typedAssignments.filter(
    (a) => a.session && (new Date(a.session.session_date + 'T00:00:00') <= now || a.session.status === 'completed')
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Schedule</h1>
        <p className="text-muted-foreground">
          Your assigned training sessions
        </p>
      </div>

      {/* Upcoming Sessions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Upcoming Sessions</h2>
        {upcomingSessions.length > 0 ? (
          <div className="space-y-4">
            {upcomingSessions.map((assignment) => (
              <Card key={assignment.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{assignment.session?.title || 'Training Session'}</CardTitle>
                      <CardDescription>
                        {assignment.session?.program?.solution?.title} -
                        {assignment.session?.program?.solution?.client?.name}
                      </CardDescription>
                    </div>
                    <Badge>{assignment.role}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {formatDateTime(assignment.session?.session_date || null)}
                    </div>
                    {assignment.session?.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        {assignment.session.location}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">No upcoming sessions</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Past Sessions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Completed Sessions</h2>
        {pastSessions.length > 0 ? (
          <div className="space-y-4">
            {pastSessions.map((assignment) => (
              <Card key={assignment.id} className="opacity-75">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{assignment.session?.title || 'Training Session'}</CardTitle>
                      <CardDescription>
                        {assignment.session?.program?.solution?.title}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline">{assignment.role}</Badge>
                      <Badge variant="secondary">
                        <CalendarCheck className="h-3 w-3 mr-1" />
                        Completed
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {formatDateTime(assignment.session?.session_date || null)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center">
              <CalendarCheck className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">No completed sessions yet</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
