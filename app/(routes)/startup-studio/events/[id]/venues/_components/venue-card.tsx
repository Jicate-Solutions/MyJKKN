'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  MapPin,
  Users,
  Building2,
  UserPlus,
  ChevronDown,
  ChevronRight,
  Trash2,
  Edit,
  Clock,
  Loader2,
} from 'lucide-react';
import { useRemoveEventVenue } from '@/hooks/startup-studio';
import { toast } from 'sonner';
import { AssignStaffSheet } from './assign-staff-sheet';
import { AllocateTeamsSheet } from './allocate-teams-sheet';

interface VenueCardProps {
  venue: any;
  eventId: string;
  dayType: 'build_day' | 'demo_day';
}

function getRoleBadge(role: string, dayType: 'build_day' | 'demo_day') {
  if (dayType === 'build_day') {
    if (role === 'lead_mentor')
      return (
        <Badge className="bg-purple-600 text-white text-[10px] px-1.5 py-0">
          Lead Mentor
        </Badge>
      );
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
        Mentor
      </Badge>
    );
  } else {
    if (role === 'panel_chair')
      return (
        <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0">
          Panel Chair
        </Badge>
      );
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
        Judge
      </Badge>
    );
  }
}

function getCapacityColor(teamCount: number, capacity: number) {
  if (capacity === 0) return 'bg-gray-400';
  const pct = (teamCount / capacity) * 100;
  if (pct >= 100) return 'bg-red-500';
  if (pct >= 75) return 'bg-amber-500';
  return 'bg-green-500';
}

function calcFinishTime(teamCount: number, minPerTeam = 3): string {
  // Demo day starts at 9:00 AM
  const startMinutes = 9 * 60;
  const totalMinutes = startMinutes + teamCount * minPerTeam;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

export function VenueCard({ venue, eventId, dayType }: VenueCardProps) {
  const [teamsExpanded, setTeamsExpanded] = useState(false);
  const [assignStaffOpen, setAssignStaffOpen] = useState(false);
  const [allocateTeamsOpen, setAllocateTeamsOpen] = useState(false);

  const removeVenue = useRemoveEventVenue();

  const teams: any[] = venue.teams ?? [];
  const staff: any[] = venue.staff ?? [];
  const capacity: number = venue.capacity ?? 0;
  const teamCount = teams.length;

  const capacityPct = capacity > 0 ? Math.min((teamCount / capacity) * 100, 100) : 0;
  const colorClass = getCapacityColor(teamCount, capacity);

  const handleRemove = async () => {
    try {
      await removeVenue.mutateAsync({ eventId, venueId: venue.id });
      toast.success(`Venue "${venue.venue_name}" removed`);
    } catch {
      toast.error('Failed to remove venue');
    }
  };

  return (
    <>
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base truncate">{venue.venue_name}</CardTitle>
              {venue.institution?.name && (
                <Badge variant="secondary" className="mt-1 text-[10px]">
                  {venue.institution.name}
                </Badge>
              )}
              {venue.location_info && (
                <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{venue.location_info}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    disabled={removeVenue.isPending}
                  >
                    {removeVenue.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove Venue</AlertDialogTitle>
                    <AlertDialogDescription>
                      Remove &ldquo;{venue.venue_name}&rdquo;? This will also
                      unassign all teams and staff from this venue.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRemove}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 space-y-4">
          {/* Capacity Bar */}
          {capacity > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Capacity</span>
                <span className="font-medium">
                  {teamCount}/{capacity} teams
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${colorClass}`}
                  style={{ width: `${capacityPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Demo Day Time Math */}
          {dayType === 'demo_day' && teamCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>
                {teamCount} teams &times; 3 min = {teamCount * 3} min &rarr;{' '}
                finish by <strong>{calcFinishTime(teamCount)}</strong>
              </span>
            </div>
          )}

          {/* Staff Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">
                  {dayType === 'build_day' ? 'Mentors' : 'Judges'} ({staff.length})
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => setAssignStaffOpen(true)}
              >
                <UserPlus className="mr-1 h-3 w-3" />
                Assign
              </Button>
            </div>
            {staff.length > 0 ? (
              <div className="space-y-1">
                {staff.slice(0, 3).map((s: any) => (
                  <div
                    key={s.id || s.user_id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-xs truncate">
                      {s.user?.full_name || s.name || s.user_id}
                    </span>
                    {getRoleBadge(s.role, dayType)}
                  </div>
                ))}
                {staff.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    +{staff.length - 3} more
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No staff assigned</p>
            )}
          </div>

          {/* Teams Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                className="flex items-center gap-1.5 text-xs font-medium hover:text-foreground transition-colors"
                onClick={() => setTeamsExpanded(!teamsExpanded)}
              >
                {teamsExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{teamCount} teams allocated</span>
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => setAllocateTeamsOpen(true)}
              >
                <Users className="mr-1 h-3 w-3" />
                Allocate
              </Button>
            </div>
            {teamsExpanded && teams.length > 0 && (
              <div className="space-y-1 pl-5">
                {teams.map((t: any) => (
                  <div
                    key={t.id || t.team_id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate">
                      {t.name || t.team?.name || t.team_id}
                    </span>
                    {t.institution?.name && (
                      <span className="text-muted-foreground shrink-0">
                        {t.institution.name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {teamsExpanded && teams.length === 0 && (
              <p className="text-xs text-muted-foreground pl-5">
                No teams allocated
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sheets */}
      <AssignStaffSheet
        open={assignStaffOpen}
        onClose={() => setAssignStaffOpen(false)}
        eventId={eventId}
        venueId={venue.id}
        dayType={dayType}
        existingStaff={staff}
        venueName={venue.venue_name}
      />

      <AllocateTeamsSheet
        open={allocateTeamsOpen}
        onClose={() => setAllocateTeamsOpen(false)}
        eventId={eventId}
        venueId={venue.id}
        dayType={dayType}
        venueCapacity={capacity}
        currentTeamCount={teamCount}
        venueName={venue.venue_name}
        currentTeamIds={teams.map((t: any) => t.id || t.team_id)}
      />
    </>
  );
}
