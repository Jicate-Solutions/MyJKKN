'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  AlertCircle,
  MapPin,
  Users,
  Clock,
  Laptop,
  Building,
  Star,
  Presentation,
} from 'lucide-react';
import { useMyAssignment } from '@/hooks/startup-studio';

interface AssignmentViewProps {
  eventId: string;
}

function roleBadgeVariant(role: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (role) {
    case 'lead_mentor':
    case 'panel_chair':
      return 'default';
    case 'mentor':
      return 'secondary';
    case 'judge':
      return 'destructive';
    default:
      return 'outline';
  }
}

function formatRoleName(role: string): string {
  return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatSlotTime(isoTime: string): string {
  const date = new Date(isoTime);
  return date.toLocaleString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function VenueAssignment({ assignment, eventId }: { assignment: any; eventId: string }) {
  const venue = assignment.venue;
  const resource = venue.resource;

  return (
    <div className="space-y-4">
      {/* Venue Info Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" />
              {venue.venue_name}
            </CardTitle>
            <Badge variant={roleBadgeVariant(assignment.role)}>
              {formatRoleName(assignment.role)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-3 text-sm">
            {resource?.building_number && (
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-muted-foreground" />
                <span>Building: {resource.building_number}</span>
              </div>
            )}
            {resource?.room_number && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>Room: {resource.room_number}</span>
              </div>
            )}
            {venue.capacity && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>Capacity: {venue.capacity}</span>
              </div>
            )}
          </div>
          {venue.location_info && (
            <p className="text-sm text-muted-foreground mt-2">{venue.location_info}</p>
          )}
        </CardContent>
      </Card>

      {/* Teams List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Teams ({assignment.team_count})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {assignment.teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teams assigned to this venue yet.</p>
          ) : (
            <div className="divide-y">
              {assignment.teams.map((team: any) => (
                <div key={team.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm truncate">{team.name}</p>
                        {team.institution?.name && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            {team.institution.name}
                          </Badge>
                        )}
                      </div>
                      {team.problem_idea && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {team.problem_idea}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {team.member_count || team.members?.length || 0} members
                        </span>
                        <span className="flex items-center gap-1">
                          <Laptop className="h-3 w-3" />
                          {team.laptop_count || 0} laptops
                        </span>
                        {team.presentation_slot && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatSlotTime(team.presentation_slot.slot_time)}
                            {team.presentation_slot.room && ` - ${team.presentation_slot.room}`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Judge: Score button */}
                    {(assignment.role === 'judge' || assignment.role === 'panel_chair') && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/startup-studio/events/${eventId}/demo-day?team=${team.id}`}>
                          <Star className="mr-1 h-3 w-3" />
                          Score
                        </Link>
                      </Button>
                    )}
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

export function AssignmentView({ eventId }: AssignmentViewProps) {
  const { data, isLoading, error } = useMyAssignment(eventId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load your assignment details. Please try again.
          </AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link href={`/startup-studio/events/${eventId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Event
          </Link>
        </Button>
      </div>
    );
  }

  const assignments = data?.assignments || [];

  // No assignments
  if (assignments.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/startup-studio/events/${eventId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">My Assignment</h1>
        </div>

        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <Presentation className="mx-auto h-12 w-12 text-muted-foreground" />
            <div>
              <p className="text-lg font-medium">
                No venue assignments found
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                You have not been assigned as a mentor or judge for any venue in this event.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Group assignments by day type
  const buildDayAssignments = assignments.filter((a: any) => a.venue.day_type === 'build_day');
  const demoDayAssignments = assignments.filter((a: any) => a.venue.day_type === 'demo_day');

  const hasBothDays = buildDayAssignments.length > 0 && demoDayAssignments.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/startup-studio/events/${eventId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">My Assignment</h1>
      </div>

      {hasBothDays ? (
        <Tabs defaultValue="build_day">
          <TabsList>
            <TabsTrigger value="build_day">
              Build Day ({buildDayAssignments.length})
            </TabsTrigger>
            <TabsTrigger value="demo_day">
              Demo Day ({demoDayAssignments.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="build_day" className="space-y-4 mt-4">
            {buildDayAssignments.map((assignment: any) => (
              <VenueAssignment
                key={assignment.staff_id}
                assignment={assignment}
                eventId={eventId}
              />
            ))}
          </TabsContent>
          <TabsContent value="demo_day" className="space-y-4 mt-4">
            {demoDayAssignments.map((assignment: any) => (
              <VenueAssignment
                key={assignment.staff_id}
                assignment={assignment}
                eventId={eventId}
              />
            ))}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment: any) => (
            <VenueAssignment
              key={assignment.staff_id}
              assignment={assignment}
              eventId={eventId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
