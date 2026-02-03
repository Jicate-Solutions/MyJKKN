'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Clock, MapPin, CalendarCheck } from 'lucide-react';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';

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

interface ScheduledSession {
  id: string;
  role: string;
  session?: {
    id: string;
    title: string;
    session_date: string;
    start_time: string;
    location: string | null;
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
}

export default function MySchedulePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [assignments, setAssignments] = useState<ScheduledSession[]>([]);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: member } = await supabase
        .from('sh_cohort_members')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!member) {
        setIsLoading(false);
        return;
      }

      const { data } = await supabase
        .from('sh_cohort_assignments')
        .select(`
          id, role,
          session:sh_training_sessions(
            id, title, session_date, start_time, location, status,
            program:sh_training_programs(
              title,
              solution:sh_solutions(
                title,
                client:sh_clients(name)
              )
            )
          )
        `)
        .eq('cohort_member_id', member.id)
        .order('created_at', { ascending: false });

      setAssignments((data as ScheduledSession[]) || []);
      setIsLoading(false);
    }

    fetchData();
  }, []);

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

  const upcomingSessions = assignments.filter(a => a.session?.status === 'scheduled');
  const pastSessions = assignments.filter(a => a.session?.status === 'completed');

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
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {assignment.session?.start_time || 'TBD'}
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
