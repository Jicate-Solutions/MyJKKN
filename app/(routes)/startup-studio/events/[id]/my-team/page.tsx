'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useMyRegistration } from '@/hooks/startup-studio/use-event-registrations';
import { CheckCircle2, Clock, Laptop, MapPin, User, Users, Loader2 } from 'lucide-react';

export default function MyTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: event } = useEvent(id);
  const { data: registration, isLoading } = useMyRegistration(id);

  if (isLoading) {
    return (
      <ContentLayout title="My Team">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </ContentLayout>
    );
  }

  if (!registration) {
    return (
      <ContentLayout title="My Team">
        <PageBreadcrumb items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
          { label: 'My Team' },
        ]} />
        <div className="text-center py-20 space-y-4">
          <p className="text-muted-foreground">You haven&apos;t registered a team for this event yet.</p>
          <Link href={`/startup-studio/events/${id}/register`}>
            <Button>Register Now</Button>
          </Link>
        </div>
      </ContentLayout>
    );
  }

  const buildDayVenue = registration.venue_allocations?.find((v: any) => v.day_type === 'build_day');
  const demoDayVenue = registration.venue_allocations?.find((v: any) => v.day_type === 'demo_day');

  return (
    <ContentLayout title="My Team">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
        { label: 'My Team' },
      ]} />

      <div className="space-y-6 mt-4 max-w-3xl">
        {/* Team Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{registration.team_name}</CardTitle>
              <Badge variant={registration.checked_in ? 'default' : 'secondary'}>
                {registration.checked_in ? 'Checked In' : registration.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{registration.problem_idea}</p>
            {registration.lovable_verified && (
              <div className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" /> Lovable Verified
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Team Members ({registration.team_members?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {registration.team_members?.map((member: any) => (
                <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{member.full_name || member.email}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.student_id && (
                      <Badge variant="outline" className="text-xs">{member.student_id}</Badge>
                    )}
                    {member.has_laptop && (
                      <Badge variant="secondary" className="text-xs">
                        <Laptop className="h-3 w-3 mr-1" /> Laptop
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Venue Assignments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" /> Venue Assignments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {buildDayVenue ? (
              <div className="p-3 border rounded-lg">
                <p className="text-sm font-medium">Build Day</p>
                <p className="text-sm text-muted-foreground">
                  {buildDayVenue.venue_assignment?.resource?.resource_name ||
                   buildDayVenue.venue_assignment?.manual_name || 'Venue assigned'}
                  {buildDayVenue.venue_assignment?.manual_building &&
                    ` - ${buildDayVenue.venue_assignment.manual_building}`}
                  {buildDayVenue.venue_assignment?.manual_room &&
                    `, Room ${buildDayVenue.venue_assignment.manual_room}`}
                </p>
              </div>
            ) : (
              <div className="p-3 border rounded-lg border-dashed">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-4 w-4" /> Build Day venue coming soon
                </p>
              </div>
            )}
            {demoDayVenue ? (
              <div className="p-3 border rounded-lg">
                <p className="text-sm font-medium">Demo Day</p>
                <p className="text-sm text-muted-foreground">
                  {demoDayVenue.venue_assignment?.resource?.resource_name ||
                   demoDayVenue.venue_assignment?.manual_name || 'Venue assigned'}
                </p>
              </div>
            ) : (
              <div className="p-3 border rounded-lg border-dashed">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-4 w-4" /> Demo Day venue coming soon
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submit link */}
        {event && ['build_day', 'demo_day'].includes(event.status) && (
          <Link href={`/startup-studio/events/${id}/submit`}>
            <Button className="w-full" size="lg">Submit Your Project</Button>
          </Link>
        )}
      </div>
    </ContentLayout>
  );
}
