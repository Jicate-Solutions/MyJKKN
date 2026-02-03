import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Calendar, Clock, MapPin, Users } from 'lucide-react';
import { format } from 'date-fns';

export const metadata: Metadata = {
  title: 'Training Sessions | Solutions Hub',
  description: 'Manage training sessions calendar',
};

export default function SessionsPage() {
  // Placeholder data
  const sessions = [
    {
      id: '1',
      title: 'AI Fundamentals - Day 1',
      program: { title: 'AI Workshop Series' },
      date: '2026-02-10',
      start_time: '10:00',
      end_time: '13:00',
      location: 'Seminar Hall A',
      status: 'scheduled',
      cohort_count: 3,
      attendance: null,
    },
    {
      id: '2',
      title: 'AI Fundamentals - Day 2',
      program: { title: 'AI Workshop Series' },
      date: '2026-02-11',
      start_time: '10:00',
      end_time: '13:00',
      location: 'Seminar Hall A',
      status: 'scheduled',
      cohort_count: 3,
      attendance: null,
    },
    {
      id: '3',
      title: 'Web Dev Bootcamp - Week 2',
      program: { title: 'Full Stack Bootcamp' },
      date: '2026-02-12',
      start_time: '09:00',
      end_time: '17:00',
      location: 'Computer Lab 3',
      status: 'scheduled',
      cohort_count: 2,
      attendance: null,
    },
    {
      id: '4',
      title: 'Intro to Python',
      program: { title: 'Data Science Certification' },
      date: '2026-02-05',
      start_time: '14:00',
      end_time: '17:00',
      location: 'Virtual',
      status: 'completed',
      cohort_count: 4,
      attendance: 18,
    },
  ];

  const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    scheduled: { label: 'Scheduled', variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'secondary' },
    completed: { label: 'Completed', variant: 'outline' },
    cancelled: { label: 'Cancelled', variant: 'outline' },
  };

  return (
    <ContentLayout title="Training Sessions">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Training', href: '/solutions/training' },
          { label: 'Sessions' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Training Sessions</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Schedule and track training sessions
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Schedule Session
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sessions.map((session) => {
                const status = statusConfig[session.status];
                return (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{session.title}</p>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{session.program.title}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(session.date), 'EEE, dd MMM yyyy')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {session.start_time} - {session.end_time}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {session.location}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary">
                          <Users className="mr-1 h-3 w-3" />
                          {session.cohort_count} cohort
                        </Badge>
                      </div>
                      {session.attendance !== null && (
                        <p className="text-sm text-muted-foreground">
                          {session.attendance} attended
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
