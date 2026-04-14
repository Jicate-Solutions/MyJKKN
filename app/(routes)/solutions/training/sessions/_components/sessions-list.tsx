'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Clock, MapPin, Users, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import {
  useTrainingSessions,
  SESSION_STATUS_INFO,
} from '@/hooks/solutions/use-training';
import type { SessionStatus } from '@/hooks/solutions/use-training';

export function SessionsList() {
  const { data: sessionsData, isLoading, error } = useTrainingSessions({ limit: 50 });

  const sessions = sessionsData?.data || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>All Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load training sessions. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Training Sessions Yet</h3>
          <p className="text-sm text-muted-foreground">
            Sessions will appear here once they are scheduled for training programs.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Sessions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sessions.map((session) => {
            const statusInfo = SESSION_STATUS_INFO[session.status as SessionStatus] || {
              label: session.status,
              color: 'bg-gray-100 text-gray-800',
            };
            const programSolution = (session.program as any)?.solution;
            const assignmentCount = (session as any).assignments?.length || 0;

            return (
              <div
                key={session.id}
                className="flex items-center justify-between p-4 rounded-lg border"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium">
                      {session.title || `Session ${session.session_number}`}
                    </p>
                    <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {programSolution?.title || 'Training Program'}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    {session.session_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(session.session_date + 'T00:00:00'), 'EEE, dd MMM yyyy')}
                      </span>
                    )}
                    {session.start_time && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {session.start_time.slice(0, 5)}
                        {session.end_time ? ` - ${session.end_time.slice(0, 5)}` : ''}
                      </span>
                    )}
                    {session.duration_minutes && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {session.duration_minutes} min
                      </span>
                    )}
                    {session.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {session.location}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary">
                      <Users className="mr-1 h-3 w-3" />
                      {assignmentCount} cohort
                    </Badge>
                  </div>
                  {session.attendance_count !== null && session.attendance_count !== undefined && (
                    <p className="text-sm text-muted-foreground">
                      {session.attendance_count} attended
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
