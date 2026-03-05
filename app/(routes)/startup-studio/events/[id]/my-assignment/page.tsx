'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, MapPin, Users } from 'lucide-react';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';

function useMyStaffAssignments(eventId: string, email: string | undefined) {
  return useQuery({
    queryKey: ['my-staff-assignments', eventId, email],
    queryFn: async () => {
      if (!email) return [];
      const supabase = createClientSupabaseClient();

      // First find staff record by email
      const { data: staffRecord } = await supabase
        .from('staff')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (!staffRecord) return [];

      const { data, error } = await supabase
        .from('event_staff_assignments')
        .select(`
          id, role, day_type,
          venue_assignment:event_venue_assignments(
            id, manual_name, manual_building, manual_room, day_type, capacity_override,
            institution:institutions(id, name),
            team_allocations:event_team_venue_allocations(
              id,
              registration:event_registrations(id, team_name, problem_idea)
            )
          )
        `)
        .eq('event_id', eventId)
        .eq('staff_id', staffRecord.id);

      if (error) {
        console.error('[startup/my-assignment] getMyAssignments failed:', error);
        throw error;
      }
      return data || [];
    },
    enabled: !!eventId && !!email,
    staleTime: 30 * 1000,
  });
}

const ROLE_COLORS: Record<string, string> = {
  mentor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  lead_mentor: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  judge: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  panel_chair: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  evaluator: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const ROLE_LABELS: Record<string, string> = {
  mentor: 'Mentor',
  lead_mentor: 'Lead Mentor',
  judge: 'Judge',
  panel_chair: 'Panel Chair',
  evaluator: 'Evaluator',
};

export default function MyAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: event } = useEvent(id);
  const { profile } = useAuth();
  const { data: assignments = [], isLoading } = useMyStaffAssignments(id, profile?.email);

  return (
    <ContentLayout>
      <PageBreadcrumb
        items={[
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
          { label: 'My Assignment' },
        ]}
      />

      <div className="space-y-6 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold">My Assignment</h2>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading assignments...</div>
        ) : assignments.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              You have not been assigned to any venue for this event.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {assignments.map((assignment: any) => {
              const venue = assignment.venue_assignment;
              const teams = venue?.team_allocations || [];

              return (
                <Card key={assignment.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        {venue?.manual_name || 'Unnamed Venue'}
                      </CardTitle>
                      <div className="flex gap-2">
                        <Badge className={ROLE_COLORS[assignment.role] || ''}>
                          {ROLE_LABELS[assignment.role] || assignment.role}
                        </Badge>
                        <Badge variant="outline">
                          {assignment.day_type === 'build_day' ? 'Build Day' : 'Demo Day'}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {venue?.manual_building && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {venue.manual_building}
                          {venue.manual_room && `, Room ${venue.manual_room}`}
                        </span>
                      )}
                      {venue?.institution?.name && (
                        <Badge variant="secondary">{venue.institution.name}</Badge>
                      )}
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold flex items-center gap-1 mb-2">
                        <Users className="h-4 w-4" />
                        Assigned Teams ({teams.length})
                      </h4>
                      {teams.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No teams allocated yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {teams.map((alloc: any, index: number) => (
                            <div key={alloc.id} className="bg-muted/50 rounded-lg p-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-muted-foreground">
                                  #{index + 1}
                                </span>
                                <span className="font-medium">
                                  {alloc.registration?.team_name || 'Unknown Team'}
                                </span>
                              </div>
                              {alloc.registration?.problem_idea && (
                                <p className="text-sm text-muted-foreground mt-1 ml-6">
                                  {alloc.registration.problem_idea}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
