'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Building2,
  ClipboardList,
  ListChecks,
  Loader2,
  MapPin,
  UserCheck,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStaffVenues, useAllVenuesForFaculty, useVenueAttendance } from '@/hooks/startup-studio/use-event-venues';
import { EventChecklistService } from '@/lib/services/startup-studio/event-checklist-service';
import { useAuth } from '@/hooks/use-auth';
import type { DayType, ChecklistPhase, EventVenueAssignment, AttendanceStatus, StaffRole } from '@/types/startup-studio';

const ROLE_LABELS: Record<StaffRole, string> = {
  mentor: 'Mentor',
  lead_mentor: 'Lead Mentor',
  judge: 'Judge',
  panel_chair: 'Panel Chair',
  evaluator: 'Evaluator',
};

// ── Root component ────────────────────────────────────────────────────────────
interface StaffVenueViewProps {
  eventId: string;
  staffEmail: string;
  /** When true, shows ALL venues (faculty mode) instead of only assigned venues */
  showAll?: boolean;
  /** Initial day tab — defaults to build_day. Pass event.status-derived value to auto-select the active day. */
  defaultDayType?: DayType;
}

export function StaffVenueView({ eventId, staffEmail, showAll = false, defaultDayType = 'build_day' }: StaffVenueViewProps) {
  const [dayType, setDayType] = useState<DayType>(defaultDayType);

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/20">
        <ClipboardList className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
            {showAll ? 'Faculty View' : 'Staff View'}
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
            {showAll
              ? 'You can see all venues and mark attendance for any team.'
              : 'You can see only venues you are assigned to. Mark attendance for your allocated teams.'}
          </p>
        </div>
      </div>

      <Tabs value={dayType} onValueChange={(v) => setDayType(v as DayType)} className="space-y-5">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="build_day">Build Day</TabsTrigger>
          <TabsTrigger value="demo_day">Demo Day</TabsTrigger>
        </TabsList>

        <TabsContent value="build_day">
          <StaffDayPanel eventId={eventId} staffEmail={staffEmail} dayType="build_day" showAll={showAll} />
        </TabsContent>
        <TabsContent value="demo_day">
          <StaffDayPanel eventId={eventId} staffEmail={staffEmail} dayType="demo_day" showAll={showAll} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Day panel ────────────────────────────────────────────────────────────────
function StaffDayPanel({ eventId, staffEmail, dayType, showAll }: {
  eventId: string;
  staffEmail: string;
  dayType: DayType;
  showAll: boolean;
}) {
  const router = useRouter();
  const assignedVenues = useStaffVenues(eventId, staffEmail, dayType);
  const allVenues     = useAllVenuesForFaculty(eventId, dayType);

  const { data: venues = [], isLoading } = showAll ? allVenues : assignedVenues;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (venues.length === 0) {
    return (
      <div className="text-center py-14">
        <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          {showAll
            ? 'No venues have been set up for this event yet.'
            : 'You are not assigned to any venues'}
        </p>
        {!showAll && (
          <p className="text-xs text-muted-foreground mt-1">
            for {dayType === 'build_day' ? 'Build Day' : 'Demo Day'}.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {venues.map((venue) => (
        <StaffVenueCard
          key={venue.id}
          venue={venue}
          eventId={eventId}
          dayType={dayType}
          staffEmail={staffEmail}
          onMarkAttendance={() =>
            router.push(
              `/startup-studio/events/${eventId}/venues/${venue.id}?day=${dayType}&tab=attendance`
            )
          }
        />
      ))}
    </div>
  );
}

// ── Individual venue card for staff ──────────────────────────────────────────
function StaffVenueCard({ venue, eventId, dayType, staffEmail, onMarkAttendance }: {
  venue: EventVenueAssignment;
  eventId: string;
  dayType: DayType;
  staffEmail: string;
  onMarkAttendance: () => void;
}) {
  const [checklistTeam, setChecklistTeam] = useState<{ registrationId: string; teamName: string } | null>(null);
  const { data: attendanceRecords = [] } = useVenueAttendance(eventId, venue.id, dayType);

  const teams = venue.team_allocations || [];
  const allocatedCount = teams.length;
  const capacity = venue.capacity_override || 0;

  // Attendance counts
  const attMap = Object.fromEntries(attendanceRecords.map((a) => [a.registration_id, a.status]));
  const presentCount = attendanceRecords.filter((a) => a.status === 'present').length;
  const absentCount = attendanceRecords.filter((a) => a.status === 'absent').length;
  const lateCount = attendanceRecords.filter((a) => a.status === 'late').length;
  const excusedCount = attendanceRecords.filter((a) => a.status === 'excused').length;
  const unmarkedCount = allocatedCount - attendanceRecords.length;
  const markedCount = attendanceRecords.length;

  // Staff member's own role(s) at this venue
  const myAssignments = (venue.staff_assignments || []).filter(
    (sa: any) => sa.staff?.email === staffEmail
  );

  // All staff assigned to this venue for the current day type
  const venueStaff = (venue.staff_assignments || []).filter(
    (sa: any) => sa.day_type === dayType
  );

  // Attendance progress %
  const pct = allocatedCount > 0 ? Math.round((markedCount / allocatedCount) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate">{venue.manual_name || venue.resource?.name || 'Unnamed'}</span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {venue.institution?.name && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {venue.institution.name}
                </Badge>
              )}
              {(venue.manual_building || venue.manual_room) && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {[venue.manual_building, venue.manual_room ? `Room ${venue.manual_room}` : null]
                    .filter(Boolean).join(' · ')}
                </span>
              )}
              {/* Role badges */}
              {myAssignments.map((sa: any) => (
                <Badge key={sa.id} variant="outline" className="text-xs border-primary/30 text-primary">
                  {ROLE_LABELS[sa.role as StaffRole] || sa.role}
                </Badge>
              ))}
            </div>
          </div>

          <Button
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={onMarkAttendance}
          >
            <ClipboardList className="h-4 w-4" />
            Mark Attendance
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <p className="text-xl font-bold text-green-600">{presentCount}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Present</p>
          </div>
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <p className="text-xl font-bold text-red-600">{absentCount}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Absent</p>
          </div>
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <p className={cn('text-xl font-bold', unmarkedCount > 0 ? 'text-amber-600' : 'text-muted-foreground')}>
              {unmarkedCount}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Not Marked</p>
          </div>
        </div>

        {/* Attendance progress bar */}
        {allocatedCount > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">Attendance progress</span>
              <span className="text-xs font-medium tabular-nums">{markedCount}/{allocatedCount} marked ({pct}%)</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={cn(
                  'h-2 rounded-full transition-all duration-300',
                  pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-primary'
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        <Separator />

        {/* Team list preview — top 5 with status */}
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Allocated Teams
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-1">{allocatedCount}</Badge>
          </div>
          {allocatedCount === 0 ? (
            <p className="text-xs text-muted-foreground">No teams allocated to this venue.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {teams.map((alloc: any, idx: number) => {
                const status = attMap[alloc.registration_id] as AttendanceStatus | undefined;
                const teamName = alloc.registration?.team_name || 'Unknown';
                return (
                  <div key={alloc.id} className="flex items-center gap-2 text-xs rounded-md px-2.5 py-1.5 bg-muted/30">
                    <span className="text-muted-foreground tabular-nums w-5 shrink-0">{idx + 1}.</span>
                    <span className="flex-1 font-medium truncate">{teamName}</span>
                    <AttendancePill status={status} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-primary"
                      title="Open checklist for this team"
                      onClick={() => setChecklistTeam({ registrationId: alloc.registration_id, teamName })}
                    >
                      <ListChecks className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Assigned staff for this venue */}
        {venueStaff.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5" />
                Assigned Staff
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-1">{venueStaff.length}</Badge>
              </div>
              <div className="space-y-1">
                {venueStaff.map((sa: any) => {
                  const name = [sa.staff?.first_name, sa.staff?.last_name].filter(Boolean).join(' ') || sa.staff?.email || 'Unknown';
                  const isMe = sa.staff?.email === staffEmail;
                  return (
                    <div key={sa.id} className={cn(
                      'flex items-center gap-2 text-xs rounded-md px-2.5 py-1.5',
                      isMe ? 'bg-primary/5 border border-primary/20' : 'bg-muted/30'
                    )}>
                      <span className="flex-1 font-medium truncate">
                        {name}
                        {isMe && <span className="text-primary ml-1 font-normal">(You)</span>}
                      </span>
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
                        {ROLE_LABELS[sa.role as StaffRole] || sa.role}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>

      {/* Team-wise checklist sheet */}
      {checklistTeam && (
        <TeamChecklistSheet
          eventId={eventId}
          registrationId={checklistTeam.registrationId}
          teamName={checklistTeam.teamName}
          dayType={dayType}
          open={!!checklistTeam}
          onOpenChange={(open) => { if (!open) setChecklistTeam(null); }}
        />
      )}
    </Card>
  );
}

// ── Per-team checklist sheet ──────────────────────────────────────────────────
function TeamChecklistSheet({ eventId, registrationId, teamName, dayType, open, onOpenChange }: {
  eventId: string;
  registrationId: string;
  teamName: string;
  dayType: DayType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const phase = dayType as ChecklistPhase;
  const queryKey = ['team-checklist', eventId, registrationId, phase];

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => EventChecklistService.getTeamChecklists(eventId, registrationId, phase),
    enabled: open && !!registrationId,
    staleTime: 10_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const completeItem = useMutation({
    mutationFn: (itemId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventChecklistService.completeItem(itemId, profile.id, registrationId);
    },
    onSuccess: () => { invalidate(); toast.success('Checked'); },
    onError: () => toast.error('Failed to check item'),
  });

  const uncompleteItem = useMutation({
    mutationFn: (completionId: string) => EventChecklistService.uncompleteItem(completionId),
    onSuccess: () => { invalidate(); toast.success('Unchecked'); },
    onError: () => toast.error('Failed to uncheck item'),
  });

  const doneCount = items.filter((i) => !!i.completion).length;
  const pct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader className="mb-4 shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            {teamName}
          </SheetTitle>
          <p className="text-sm text-muted-foreground capitalize">
            {dayType === 'build_day' ? 'Build Day' : 'Demo Day'} Checklist
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ListChecks className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No checklist items for {dayType === 'build_day' ? 'Build Day' : 'Demo Day'}.</p>
              <p className="text-xs mt-1">Ask admin to add items in the Checklists page.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Progress */}
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Progress</span>
                  <span className="font-medium tabular-nums">{doneCount}/{items.length} ({pct}%)</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={cn('h-2 rounded-full transition-all duration-300', pct === 100 ? 'bg-green-500' : 'bg-primary')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <Separator />

              {/* Items */}
              <div className="divide-y">
                {items.map((item) => {
                  const isCompleted = !!item.completion;
                  const isPending = completeItem.isPending || uncompleteItem.isPending;
                  return (
                    <div key={item.id} className="flex items-start gap-3 py-3">
                      <Checkbox
                        checked={isCompleted}
                        disabled={isPending}
                        onCheckedChange={(checked) => {
                          if (checked) completeItem.mutate(item.id);
                          else if (item.completion) uncompleteItem.mutate(item.completion.id);
                        }}
                        className={cn('mt-0.5', isCompleted && 'data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500')}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm', isCompleted && 'line-through text-muted-foreground')}>
                          {item.title}
                          {item.is_required && <span className="text-red-500 ml-1">*</span>}
                        </p>
                        {item.description && !isCompleted && (
                          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                        )}
                        {isCompleted && item.completion?.completed_at && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(item.completion.completed_at).toLocaleString('en-IN', {
                              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Small status pill for team list ──────────────────────────────────────────
function AttendancePill({ status }: { status?: AttendanceStatus }) {
  if (!status) {
    return <span className="text-[10px] text-muted-foreground italic">—</span>;
  }
  const colorMap: Record<AttendanceStatus, string> = {
    present: 'text-green-600',
    absent: 'text-red-600',
    late: 'text-amber-600',
    excused: 'text-blue-600',
  };
  const labelMap: Record<AttendanceStatus, string> = {
    present: '✓ Present',
    absent: '✗ Absent',
    late: '⏱ Late',
    excused: '— Excused',
  };
  return (
    <span className={cn('text-[10px] font-medium', colorMap[status])}>
      {labelMap[status]}
    </span>
  );
}
