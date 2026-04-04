'use client';


import { use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, Building2, Calendar, ClipboardList, Info,
  Loader2, MapPin, Briefcase, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';

const ASSIGNMENT_SELECT = `
  id, role, day_type,
  staff:staff(id, first_name, last_name, email),
  venue_assignment:event_venue_assignments(
    id, manual_name, manual_building, manual_room, day_type, capacity_override,
    institution:institutions(id, name),
    team_allocations:event_team_venue_allocations(
      id,
      registration:event_registrations(id, team_name, problem_idea)
    )
  )
`;

function useStaffAssignments(eventId: string, isAdmin: boolean, email: string | undefined) {
  return useQuery({
    queryKey: ['staff-assignments', eventId, isAdmin, email],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();

      // Admin: fetch ALL staff assignments for the event
      // Note: cast to any — event_staff_assignments is not in generated Supabase types
      if (isAdmin) {
        const { data, error } = await (supabase.from as any)('event_staff_assignments')
          .select(ASSIGNMENT_SELECT)
          .eq('event_id', eventId);

        if (error) {
          console.error('[startup/my-assignment] getAllAssignments failed:', error);
          throw error;
        }
        return (data as any[]) || [];
      }

      // Non-admin: look up by staff email
      if (!email) return [];

      const { data: staffRecord } = await supabase
        .from('staff')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (!staffRecord) return [];

      const { data, error } = await (supabase.from as any)('event_staff_assignments')
        .select(ASSIGNMENT_SELECT)
        .eq('event_id', eventId)
        .eq('staff_id', staffRecord.id);

      if (error) {
        console.error('[startup/my-assignment] getMyAssignments failed:', error);
        throw error;
      }
      return (data as any[]) || [];
    },
    enabled: !!eventId && (isAdmin || !!email),
    staleTime: 30 * 1000,
  });
}

const ROLE_COLORS: Record<string, string> = {
  mentor: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  lead_mentor: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
  judge: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
  panel_chair: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  evaluator: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
};

const ROLE_ACCENT: Record<string, string> = {
  mentor: 'border-l-blue-500',
  lead_mentor: 'border-l-purple-500',
  judge: 'border-l-orange-500',
  panel_chair: 'border-l-red-500',
  evaluator: 'border-l-green-500',
};

const ROLE_LABELS: Record<string, string> = {
  mentor: 'Mentor',
  lead_mentor: 'Lead Mentor',
  judge: 'Judge',
  panel_chair: 'Panel Chair',
  evaluator: 'Evaluator',
};

const DAY_LABELS: Record<string, string> = {
  build_day: 'Build Day',
  demo_day: 'Demo Day',
};

export default function MyAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  // Guard against Next.js DRP placeholder tokens (%%drp:...) in route params
  const isValidId = !!id && !id.includes('%%drp:') && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isValidId) {
    return (
      <ContentLayout title="My Assignment">
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  const { data: event } = useEvent(id);
  const { profile, isLoading: authLoading } = useAuth();
  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'administrator' || (profile as any)?.is_super_admin;
  const { data: assignments = [], isLoading: assignmentsLoading } = useStaffAssignments(id, !!isAdmin, profile?.email);
  const isLoading = authLoading || assignmentsLoading;

  // Group assignments by day type
  const grouped = useMemo(() => {
    const groups: Record<string, typeof assignments> = {};
    assignments.forEach((a: any) => {
      const key = a.day_type || 'other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    return groups;
  }, [assignments]);

  const totalTeams = assignments.reduce((s: number, a: any) => s + (a.venue_assignment?.team_allocations?.length || 0), 0);
  const uniqueRoles = [...new Set(assignments.map((a: any) => a.role))];
  const uniqueStaff = isAdmin ? [...new Set(assignments.map((a: any) => a.staff?.id).filter(Boolean))].length : 0;

  const pageTitle = isAdmin ? 'Staff Assignments' : 'My Assignment';

  return (
    <ContentLayout title={pageTitle}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
          { label: pageTitle },
        ]}
      />

      <div className="space-y-6 mt-4 pb-10">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/startup-studio/events/${id}`)}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Event
        </Button>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            {pageTitle}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{event?.name || 'Event'}</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : assignments.length === 0 ? (
          /* Empty State */
          <Card>
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium">No Assignments Yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  You have not been assigned to any venue for this event. An event administrator
                  can assign you through the <strong>Venues & Mentors</strong> page.
                </p>
              </div>
              <div className="flex items-start gap-3 bg-muted/50 rounded-lg p-4 max-w-md mx-auto text-left">
                <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>How assignments work:</strong></p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Admin adds venues for Build Day / Demo Day</li>
                    <li>Admin assigns staff (mentors, judges, etc.) to venues</li>
                    <li>Teams are allocated to venues</li>
                    <li>Your assignments and teams appear here</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats Cards */}
            <div className={cn('grid gap-4', isAdmin ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4')}>
              {isAdmin && (
                <StatCard
                  icon={<Users className="h-4 w-4" />}
                  label="Staff Members"
                  value={uniqueStaff}
                  color="text-indigo-600"
                />
              )}
              <StatCard
                icon={<Building2 className="h-4 w-4" />}
                label="Assignments"
                value={assignments.length}
              />
              <StatCard
                icon={<Users className="h-4 w-4" />}
                label="Total Teams"
                value={totalTeams}
                color="text-green-600"
              />
              <StatCard
                icon={<Briefcase className="h-4 w-4" />}
                label="Role(s)"
                value={uniqueRoles.length}
                color="text-blue-600"
              />
              <StatCard
                icon={<Calendar className="h-4 w-4" />}
                label="Day Types"
                value={Object.keys(grouped).length}
                color="text-purple-600"
              />
            </div>

            {/* Roles Summary */}
            <div className="flex flex-wrap gap-2">
              {uniqueRoles.map((role) => (
                <Badge key={role} className={cn('text-xs', ROLE_COLORS[role] || '')}>
                  {ROLE_LABELS[role] || role}
                </Badge>
              ))}
            </div>

            {/* Assignments grouped by day type */}
            {Object.entries(grouped).map(([dayType, dayAssignments]) => (
              <div key={dayType} className="space-y-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">{DAY_LABELS[dayType] || dayType}</h2>
                  <Badge variant="outline" className="text-xs">
                    {dayAssignments.length} venue{dayAssignments.length !== 1 ? 's' : ''}
                  </Badge>
                </div>

                <div className="grid gap-4">
                  {dayAssignments.map((assignment: any) => {
                    const venue = assignment.venue_assignment;
                    const teams = venue?.team_allocations || [];
                    const capacity = venue?.capacity_override || 0;

                    return (
                      <Card key={assignment.id} className={cn('border-l-4 overflow-hidden', ROLE_ACCENT[assignment.role] || 'border-l-primary')}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-base flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-primary shrink-0" />
                                {venue?.manual_name || 'Unnamed Venue'}
                              </CardTitle>
                              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-muted-foreground">
                                {(venue?.manual_building || venue?.manual_room) && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {[venue.manual_building, venue.manual_room && `Room ${venue.manual_room}`].filter(Boolean).join(', ')}
                                  </span>
                                )}
                                {venue?.institution?.name && (
                                  <Badge variant="secondary" className="text-xs">
                                    {venue.institution.name}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              <Badge className={cn('text-xs', ROLE_COLORS[assignment.role] || '')}>
                                {ROLE_LABELS[assignment.role] || assignment.role}
                              </Badge>
                              {isAdmin && assignment.staff && (
                                <span className="text-xs text-muted-foreground">
                                  {assignment.staff.first_name} {assignment.staff.last_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-4">
                          {/* Capacity indicator */}
                          {capacity > 0 && (
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-medium text-muted-foreground">Team Capacity</span>
                                <span className="text-xs font-medium">{teams.length} / {capacity}</span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-1.5">
                                <div
                                  className={cn(
                                    'h-1.5 rounded-full transition-all duration-300',
                                    teams.length >= capacity ? 'bg-green-500' : teams.length >= capacity * 0.75 ? 'bg-amber-500' : 'bg-primary'
                                  )}
                                  style={{ width: `${Math.min(Math.round((teams.length / capacity) * 100), 100)}%` }}
                                />
                              </div>
                            </div>
                          )}

                          <Separator />

                          {/* Teams List */}
                          <div>
                            <h4 className="text-sm font-medium flex items-center gap-1.5 mb-3">
                              <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                              Assigned Teams
                              <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-1">
                                {teams.length}
                              </Badge>
                            </h4>
                            {teams.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2">
                                No teams allocated to this venue yet.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {teams.map((alloc: any, index: number) => (
                                  <div key={alloc.id} className="flex items-start gap-3 bg-muted/40 rounded-lg p-3">
                                    <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                                      {index + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium">
                                        {alloc.registration?.team_name || 'Unknown Team'}
                                      </p>
                                      {alloc.registration?.problem_idea && (
                                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                          {alloc.registration.problem_idea}
                                        </p>
                                      )}
                                    </div>
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
              </div>
            ))}
          </>
        )}
      </div>
    </ContentLayout>
  );
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number; color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p className={cn('text-2xl font-bold', color)}>{value}</p>
      </CardContent>
    </Card>
  );
}
