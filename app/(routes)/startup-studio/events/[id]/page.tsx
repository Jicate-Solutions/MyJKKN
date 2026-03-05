'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useEvent, useEventStats } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { EventStatusBadge } from '../_components/event-status-badge';
import { Calendar, Clock, MapPin, Users, Loader2 } from 'lucide-react';

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'TBD';
  return new Date(dateStr).toLocaleString('en-IN', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: event, isLoading } = useEvent(id);
  const { data: stats } = useEventStats(id);
  const { profile } = useAuth();

  if (isLoading) {
    return (
      <ContentLayout title="Event">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
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

  const isAdmin = profile?.is_super_admin || profile?.role === 'admin' || profile?.role === 'administrator';
  const config = event.config;

  return (
    <ContentLayout title={event.name}>
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event.name },
      ]} />

      <div className="space-y-6 mt-4">
        {/* Event Header */}
        <Card>
          <CardContent className="p-6 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold">{event.name}</h1>
                {event.description && (
                  <p className="text-muted-foreground mt-1">{event.description}</p>
                )}
              </div>
              <EventStatusBadge status={event.status} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Build Day</p>
                  <p className="text-muted-foreground">{formatDateTime(event.start_date)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Demo Day</p>
                  <p className="text-muted-foreground">{formatDateTime(event.demo_date)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Registration Deadline</p>
                  <p className="text-muted-foreground">{formatDateTime(event.registration_deadline)}</p>
                </div>
              </div>
              {stats && (
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{stats.total_teams} Teams</p>
                    <p className="text-muted-foreground">{stats.total_members} members across {stats.institutions} colleges</p>
                  </div>
                </div>
              )}
            </div>

            {config?.categories && config.categories.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Categories</p>
                <div className="flex flex-wrap gap-1">
                  {config.categories.map((cat: string) => (
                    <Badge key={cat} variant="outline" className="text-xs">{cat}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Student: Register CTA */}
        {isRegistrationOpen && (
          <Card>
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Register Your Team</h2>
                <p className="text-sm text-muted-foreground">
                  Team size: up to {config?.team_max_size || 5} members
                </p>
              </div>
              <Link href={`/startup-studio/events/${id}/register`}>
                <Button>Register Now</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Admin quick links */}
        {isAdmin && (
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4">Admin Panel</h2>
              <div className="flex flex-wrap gap-2">
                <Link href={`/startup-studio/events/${id}/registrations`}>
                  <Button variant="outline" size="sm">Registrations</Button>
                </Link>
                <Link href={`/startup-studio/events/${id}/venues`}>
                  <Button variant="outline" size="sm">Venues & Mentors</Button>
                </Link>
                <Link href={`/startup-studio/events/${id}/demo-day`}>
                  <Button variant="outline" size="sm">Demo Day</Button>
                </Link>
                <Link href={`/startup-studio/events/${id}/leaderboard`}>
                  <Button variant="outline" size="sm">Leaderboard</Button>
                </Link>
                <Link href={`/startup-studio/events/${id}/checklists`}>
                  <Button variant="outline" size="sm">Checklists</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
