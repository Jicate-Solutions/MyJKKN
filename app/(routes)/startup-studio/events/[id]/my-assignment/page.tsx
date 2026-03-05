'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Loader2, MapPin, Building, DoorOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function useMyStaffAssignments(eventId: string | undefined, email: string | undefined) {
  return useQuery({
    queryKey: ['my-staff-assignments', eventId, email],
    queryFn: async () => {
      if (!eventId || !email) return [];
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('event_staff_assignments')
        .select(`
          id, role, day_type,
          staff:staff!inner(id, first_name, last_name, email),
          venue_assignment:event_venue_assignments(
            id, manual_name, manual_building, manual_room, day_type, capacity_override,
            resource:resources(id, resource_name, location),
            team_allocations:event_team_venue_allocations(
              id, day_type,
              registration:event_registrations(id, team_name, problem_idea)
            )
          )
        `)
        .eq('event_id', eventId)
        .eq('staff.email', email);

      if (error) {
        console.error('[startup/submissions] useMyStaffAssignments failed:', error);
        throw error;
      }
      return data || [];
    },
    enabled: !!eventId && !!email,
    staleTime: 30 * 1000,
    retry: 3,
  });
}

export default function MyAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const { profile } = useAuth();
  const { data: event, isLoading: eventLoading } = useEvent(eventId);
  const { data: assignments, isLoading: assignmentsLoading } = useMyStaffAssignments(
    eventId,
    profile?.email
  );

  if (eventLoading || assignmentsLoading) {
    return (
      <ContentLayout title="My Assignment">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="My Assignment">
        <div className="text-center py-20 text-muted-foreground">Event not found.</div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`My Assignment - ${event.name}`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event.name, href: `/startup-studio/events/${eventId}` },
          { label: 'My Assignment' },
        ]}
      />

      <div className="space-y-6 mt-4 max-w-3xl">
        {!assignments || assignments.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            You have not been assigned to any venue for this event.
          </div>
        ) : (
          assignments.map((assignment: any) => {
            const venue = assignment.venue_assignment;
            const venueName =
              venue?.manual_name || venue?.resource?.resource_name || 'Unknown Venue';
            const building =
              venue?.manual_building || venue?.resource?.location || null;
            const room = venue?.manual_room || null;
            const teams = venue?.team_allocations || [];

            return (
              <Card key={assignment.id}>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      {venueName}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {assignment.role?.replace('_', ' ')}
                      </Badge>
                      <Badge variant="secondary" className="capitalize">
                        {assignment.day_type?.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {building && (
                      <span className="flex items-center gap-1">
                        <Building className="h-4 w-4" />
                        {building}
                      </span>
                    )}
                    {room && (
                      <span className="flex items-center gap-1">
                        <DoorOpen className="h-4 w-4" />
                        {room}
                      </span>
                    )}
                  </div>

                  {teams.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-medium mb-2">
                        Allocated Teams ({teams.length})
                      </h4>
                      <div className="space-y-2">
                        {teams.map((alloc: any) => (
                          <div
                            key={alloc.id}
                            className="flex items-start justify-between p-3 rounded-lg border"
                          >
                            <div>
                              <p className="font-medium">
                                {alloc.registration?.team_name || 'Unnamed Team'}
                              </p>
                              {alloc.registration?.problem_idea && (
                                <p className="text-sm text-muted-foreground mt-0.5">
                                  {alloc.registration.problem_idea}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No teams allocated to this venue yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </ContentLayout>
  );
}
