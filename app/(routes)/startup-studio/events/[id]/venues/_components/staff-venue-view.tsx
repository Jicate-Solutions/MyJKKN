'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Building2,
  CheckCircle2,
  ClipboardList,
  Hash,
  Loader2,
  MapPin,
  Users,
  XCircle,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStaffVenues, useVenueAttendance } from '@/hooks/startup-studio/use-event-venues';
import type { DayType, EventVenueAssignment, AttendanceStatus, StaffRole } from '@/types/startup-studio';

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
}

export function StaffVenueView({ eventId, staffEmail }: StaffVenueViewProps) {
  const [dayType, setDayType] = useState<DayType>('build_day');

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/20">
        <ClipboardList className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Staff View</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
            You can see only venues you are assigned to. Mark attendance for your allocated teams.
          </p>
        </div>
      </div>

      <Tabs value={dayType} onValueChange={(v) => setDayType(v as DayType)} className="space-y-5">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="build_day">Build Day</TabsTrigger>
          <TabsTrigger value="demo_day">Demo Day</TabsTrigger>
        </TabsList>

        <TabsContent value="build_day">
          <StaffDayPanel eventId={eventId} staffEmail={staffEmail} dayType="build_day" />
        </TabsContent>
        <TabsContent value="demo_day">
          <StaffDayPanel eventId={eventId} staffEmail={staffEmail} dayType="demo_day" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Day panel ────────────────────────────────────────────────────────────────
function StaffDayPanel({ eventId, staffEmail, dayType }: {
  eventId: string;
  staffEmail: string;
  dayType: DayType;
}) {
  const router = useRouter();
  const { data: venues = [], isLoading } = useStaffVenues(eventId, staffEmail, dayType);

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
        <p className="text-sm text-muted-foreground">You are not assigned to any venues</p>
        <p className="text-xs text-muted-foreground mt-1">
          for {dayType === 'build_day' ? 'Build Day' : 'Demo Day'}.
        </p>
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
            <div className="space-y-1">
              {teams.slice(0, 6).map((alloc: any, idx: number) => {
                const status = attMap[alloc.registration_id] as AttendanceStatus | undefined;
                return (
                  <div key={alloc.id} className="flex items-center justify-between text-xs rounded-md px-2.5 py-1.5 bg-muted/30">
                    <span className="text-muted-foreground tabular-nums w-5">{idx + 1}.</span>
                    <span className="flex-1 font-medium truncate">{alloc.registration?.team_name || 'Unknown'}</span>
                    <AttendancePill status={status} />
                  </div>
                );
              })}
              {teams.length > 6 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  +{teams.length - 6} more — click Mark Attendance to see all
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
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
