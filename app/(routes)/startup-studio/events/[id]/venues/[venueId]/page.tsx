'use client';

import { use, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  MinusCircle,
  Plus,
  Users,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import {
  useVenue,
  useAssignStaff,
  useRemoveStaff,
  useManualAllocate,
  useRemoveAllocation,
  useStaffList,
  useVenueAttendance,
  useMarkAttendance,
} from '@/hooks/startup-studio/use-event-venues';
import { useEventRegistrations } from '@/hooks/startup-studio/use-event-registrations';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

function useInstitutionsList() {
  return useQuery({
    queryKey: ['institutions-list'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data } = await supabase.from('institutions').select('id, name').eq('is_active', true).order('name');
      return (data || []) as Array<{ id: string; name: string }>;
    },
    staleTime: 60 * 1000,
  });
}

function useDepartmentsList(institutionId: string) {
  return useQuery({
    queryKey: ['departments-list', institutionId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data } = await supabase
        .from('departments')
        .select('id, department_name')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('department_name');
      return (data || []) as Array<{ id: string; department_name: string }>;
    },
    enabled: !!institutionId,
    staleTime: 60 * 1000,
  });
}
import type { AttendanceStatus, DayType, StaffRole } from '@/types/startup-studio';

// ── Constants ─────────────────────────────────────────────────────────────────
const STAFF_ROLES: { value: StaffRole; label: string }[] = [
  { value: 'mentor', label: 'Mentor' },
  { value: 'lead_mentor', label: 'Lead Mentor' },
  { value: 'judge', label: 'Judge' },
  { value: 'panel_chair', label: 'Panel Chair' },
  { value: 'evaluator', label: 'Evaluator' },
];

const STATUS_CONFIG: Record<AttendanceStatus, {
  label: string;
  icon: React.ReactNode;
  activeClass: string;
  badgeClass: string;
  pillClass: string;
}> = {
  present: {
    label: 'Present',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    activeClass: 'bg-green-600 text-white border-green-600 hover:bg-green-700',
    badgeClass: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
    pillClass: 'text-green-600 bg-green-100 dark:bg-green-950/40',
  },
  absent: {
    label: 'Absent',
    icon: <XCircle className="h-3.5 w-3.5" />,
    activeClass: 'bg-red-600 text-white border-red-600 hover:bg-red-700',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
    pillClass: 'text-red-600 bg-red-100 dark:bg-red-950/40',
  },
  late: {
    label: 'Late',
    icon: <Clock className="h-3.5 w-3.5" />,
    activeClass: 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
    pillClass: 'text-amber-600 bg-amber-100 dark:bg-amber-950/40',
  },
  excused: {
    label: 'Excused',
    icon: <MinusCircle className="h-3.5 w-3.5" />,
    activeClass: 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
    pillClass: 'text-blue-600 bg-blue-100 dark:bg-blue-950/40',
  },
};

// ── Page ──────────────────────────────────────────────────────────────────────
export default function VenueDetailPage({
  params,
}: {
  params: Promise<{ id: string; venueId: string }>;
}) {
  const { id: eventId, venueId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const dayParam = searchParams.get('day') as DayType | null;
  const tabParam = searchParams.get('tab');

  const [dayType, setDayType] = useState<DayType>(
    dayParam === 'demo_day' ? 'demo_day' : 'build_day'
  );
  const [activeTab, setActiveTab] = useState(tabParam === 'attendance' ? 'attendance' : 'staff');

  const { data: event } = useEvent(eventId);
  const { data: venue, isLoading } = useVenue(venueId);
  const { profile, isLoading: authLoading } = useAuth();

  const isAdmin =
    profile?.is_super_admin === true ||
    profile?.role === 'admin' ||
    profile?.role === 'administrator' ||
    profile?.role === 'super_admin';

  const venueName = venue?.manual_name || venue?.resource?.name || 'Venue';

  return (
    <ContentLayout title={venueName}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event?.name || 'Event', href: `/startup-studio/events/${eventId}` },
          { label: 'Venues & Mentors', href: `/startup-studio/events/${eventId}/venues` },
          { label: venueName },
        ]}
      />

      <div className="space-y-6 mt-4 pb-10">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/startup-studio/events/${eventId}/venues`)}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Venues
        </Button>

        {isLoading || authLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !venue ? (
          <div className="text-center py-20 text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Venue not found.</p>
          </div>
        ) : (
          <>
            {/* Venue info header */}
            <VenueInfoCard venue={venue} />

            {/* Day type tabs */}
            <Tabs
              value={dayType}
              onValueChange={(v) => setDayType(v as DayType)}
              className="space-y-5"
            >
              <TabsList className="grid w-full max-w-xs grid-cols-2">
                <TabsTrigger value="build_day">Build Day</TabsTrigger>
                <TabsTrigger value="demo_day">Demo Day</TabsTrigger>
              </TabsList>

              {(['build_day', 'demo_day'] as DayType[]).map((day) => (
                <TabsContent key={day} value={day}>
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
                    <TabsList>
                      <TabsTrigger value="staff" className="gap-1.5">
                        <UserPlus className="h-3.5 w-3.5" />
                        In-Charge Orchestrators
                        <Badge variant="outline" className="text-[10px] h-4 px-1 ml-0.5">
                          {(venue.staff_assignments || []).filter((sa: any) => sa.day_type === day).length}
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger value="attendance" className="gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        Teams & Attendance
                        <Badge variant="outline" className="text-[10px] h-4 px-1 ml-0.5">
                          {venue.team_allocations?.length || 0}
                        </Badge>
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="staff">
                      <StaffSection
                        venue={venue}
                        eventId={eventId}
                        dayType={day}
                        isAdmin={isAdmin}
                      />
                    </TabsContent>

                    <TabsContent value="attendance">
                      <AttendanceSection
                        venue={venue}
                        eventId={eventId}
                        dayType={day}
                        isAdmin={isAdmin}
                      />
                    </TabsContent>
                  </Tabs>
                </TabsContent>
              ))}
            </Tabs>
          </>
        )}
      </div>
    </ContentLayout>
  );
}

// ── Venue info header card ────────────────────────────────────────────────────
function VenueInfoCard({ venue }: { venue: any }) {
  const allocated = venue.team_allocations?.length || 0;
  const capacity = venue.capacity_override || 0;
  const fillPct = capacity > 0 ? Math.round((allocated / capacity) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary shrink-0" />
              {venue.manual_name || venue.resource?.name || 'Unnamed Venue'}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {venue.institution?.name && (
                <Badge variant="secondary" className="text-xs">
                  {venue.institution.name}
                </Badge>
              )}
              {(venue.manual_building || venue.manual_room) && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {[venue.manual_building, venue.manual_room ? `Room ${venue.manual_room}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums">
              {allocated}
              {capacity > 0 && (
                <span className="text-base font-normal text-muted-foreground"> / {capacity}</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {capacity > 0 ? `teams · ${fillPct}% full` : 'teams allocated'}
            </p>
          </div>
        </div>
      </CardHeader>
      {capacity > 0 && (
        <CardContent className="pt-0 pb-4">
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                fillPct >= 100 ? 'bg-green-500' : fillPct >= 75 ? 'bg-amber-500' : 'bg-primary'
              )}
              style={{ width: `${Math.min(fillPct, 100)}%` }}
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Staff section ─────────────────────────────────────────────────────────────
function StaffSection({
  venue,
  eventId,
  dayType,
  isAdmin,
}: {
  venue: any;
  eventId: string;
  dayType: DayType;
  isAdmin: boolean;
}) {
  const removeStaff = useRemoveStaff();
  const [addOpen, setAddOpen] = useState(false);

  const staffForDay = (venue.staff_assignments || []).filter(
    (sa: any) => sa.day_type === dayType
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            In-Charge Orchestrators
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
              {staffForDay.length}
            </Badge>
          </CardTitle>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-3 w-3" /> Add Orchestrator
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {staffForDay.length === 0 ? (
          <div className="text-center py-8 border rounded-md bg-muted/20">
            <UserPlus className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No orchestrators assigned for this day.</p>
            {isAdmin && (
              <p className="text-xs text-muted-foreground mt-1">
                Click &ldquo;Add Orchestrator&rdquo; to assign someone.
              </p>
            )}
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 py-2.5 text-xs">Name</TableHead>
                  <TableHead className="px-4 py-2.5 text-xs hidden sm:table-cell">Email</TableHead>
                  <TableHead className="px-4 py-2.5 text-xs">Role</TableHead>
                  {isAdmin && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffForDay.map((sa: any) => {
                  const staffName = sa.staff
                    ? `${sa.staff.first_name} ${sa.staff.last_name}`
                    : 'Unknown';
                  const roleLabel =
                    STAFF_ROLES.find((r) => r.value === sa.role)?.label || sa.role;
                  return (
                    <TableRow key={sa.id} className="border-b last:border-0">
                      <TableCell className="px-4 py-3 text-sm font-medium">{staffName}</TableCell>
                      <TableCell className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                        {sa.staff?.email || '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant="secondary" className="text-xs">{roleLabel}</Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="px-2 py-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeStaff.mutate(sa.id)}
                            disabled={removeStaff.isPending}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {isAdmin && (
        <AddStaffDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          eventId={eventId}
          venueId={venue.id}
          dayType={dayType}
        />
      )}
    </Card>
  );
}

// ── Attendance section ────────────────────────────────────────────────────────
function AttendanceSection({
  venue,
  eventId,
  dayType,
  isAdmin,
}: {
  venue: any;
  eventId: string;
  dayType: DayType;
  isAdmin: boolean;
}) {
  const removeAllocation = useRemoveAllocation();
  const [assignOpen, setAssignOpen] = useState(false);

  const { data: attendanceRecords = [], isLoading } = useVenueAttendance(
    eventId,
    venue.id,
    dayType
  );
  const markAttendance = useMarkAttendance();
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});

  const teams = venue.team_allocations || [];
  const attendanceByReg = Object.fromEntries(
    attendanceRecords.map((a) => [a.registration_id, a])
  );

  const counts = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
  for (const team of teams) {
    const rec = attendanceByReg[(team as any).registration_id];
    if (rec) counts[rec.status as AttendanceStatus]++;
    else counts.unmarked++;
  }

  const handleMark = (registrationId: string, status: AttendanceStatus) => {
    markAttendance.mutate({
      event_id: eventId,
      registration_id: registrationId,
      venue_assignment_id: venue.id,
      day_type: dayType,
      status,
      notes: notesMap[registrationId] || undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap gap-2">
        <Badge className="text-xs px-2.5 py-1 bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">
          {counts.present} Present
        </Badge>
        <Badge className="text-xs px-2.5 py-1 bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {counts.absent} Absent
        </Badge>
        <Badge className="text-xs px-2.5 py-1 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          {counts.late} Late
        </Badge>
        <Badge className="text-xs px-2.5 py-1 bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
          {counts.excused} Excused
        </Badge>
        {counts.unmarked > 0 && (
          <Badge className="text-xs px-2.5 py-1 bg-muted text-muted-foreground">
            {counts.unmarked} Not marked
          </Badge>
        )}
      </div>

      {counts.unmarked > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {counts.unmarked} team{counts.unmarked !== 1 ? 's' : ''} not yet marked.
        </div>
      )}

      {/* Teams list header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Team Allocations
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
                {teams.length}
              </Badge>
            </CardTitle>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => setAssignOpen(true)}
              >
                <Plus className="h-3 w-3" /> Assign Team
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center py-8 border rounded-md bg-muted/20">
              <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No teams allocated to this venue.</p>
              {isAdmin && (
                <p className="text-xs text-muted-foreground mt-1">
                  Click &ldquo;Assign Team&rdquo; to add one.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {teams.map((alloc: any, idx: number) => {
                const regId = alloc.registration_id;
                const teamName = alloc.registration?.team_name || 'Unknown';
                const rec = attendanceByReg[regId];
                const currentStatus: AttendanceStatus | null = rec?.status ?? null;

                return (
                  <div
                    key={alloc.id}
                    className={cn(
                      'rounded-lg border p-3 transition-colors',
                      currentStatus === 'present' &&
                        'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/10',
                      currentStatus === 'absent' &&
                        'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/10',
                      currentStatus === 'late' &&
                        'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/10',
                      currentStatus === 'excused' &&
                        'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/10',
                      !currentStatus && 'border-border bg-muted/20'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Team info */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground tabular-nums w-5 shrink-0">
                            {idx + 1}.
                          </span>
                          <p className="text-sm font-medium truncate">{teamName}</p>
                          {currentStatus && (
                            <Badge
                              className={cn(
                                'text-[10px] h-5 px-1.5 shrink-0',
                                STATUS_CONFIG[currentStatus].badgeClass
                              )}
                            >
                              {STATUS_CONFIG[currentStatus].icon}
                              <span className="ml-1">{STATUS_CONFIG[currentStatus].label}</span>
                            </Badge>
                          )}
                        </div>
                        {rec && (
                          <p className="text-[10px] text-muted-foreground mt-1 ml-7">
                            Marked by{' '}
                            {rec.marker?.full_name || rec.marker?.email || 'unknown'}
                            {rec.marked_at
                              ? ` · ${format(new Date(rec.marked_at), 'h:mm a')}`
                              : ''}
                          </p>
                        )}
                      </div>

                      {/* Right side: attendance + remove */}
                      <div className="flex items-start gap-2 shrink-0">
                        {/* Status buttons */}
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((s) => (
                            <Button
                              key={s}
                              size="sm"
                              variant="outline"
                              disabled={markAttendance.isPending}
                              onClick={() => handleMark(regId, s)}
                              className={cn(
                                'h-7 px-2 text-xs gap-1',
                                currentStatus === s && STATUS_CONFIG[s].activeClass
                              )}
                            >
                              {STATUS_CONFIG[s].icon}
                              <span className="hidden sm:inline">{STATUS_CONFIG[s].label}</span>
                            </Button>
                          ))}
                        </div>
                        {/* Remove allocation (admin only) */}
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => removeAllocation.mutate(alloc.id)}
                            disabled={removeAllocation.isPending}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="mt-2 ml-7">
                      <Textarea
                        placeholder="Add a note (optional)..."
                        value={notesMap[regId] ?? rec?.notes ?? ''}
                        onChange={(e) =>
                          setNotesMap((prev) => ({ ...prev, [regId]: e.target.value }))
                        }
                        className="h-8 min-h-0 text-xs resize-none py-1.5"
                        rows={1}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <AssignTeamDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          eventId={eventId}
          venueId={venue.id}
          dayType={dayType}
        />
      )}
    </div>
  );
}

// ── Add Staff dialog (controlled) ─────────────────────────────────────────────
function AddStaffDialog({
  open,
  onOpenChange,
  eventId,
  venueId,
  dayType,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  venueId: string;
  dayType: DayType;
}) {
  const [instFilter, setInstFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedRole, setSelectedRole] = useState<StaffRole>('mentor');

  const { data: institutions = [] } = useInstitutionsList();
  const { data: departments = [] } = useDepartmentsList(instFilter);
  const { data: staffList = [] } = useStaffList(instFilter || undefined, deptFilter || undefined);

  const assignStaff = useAssignStaff();

  const handleInstChange = (val: string) => {
    setInstFilter(val === 'all' ? '' : val);
    setDeptFilter('');
    setSelectedStaff('');
  };

  const handleDeptChange = (val: string) => {
    setDeptFilter(val === 'all' ? '' : val);
    setSelectedStaff('');
  };

  const handleAssign = () => {
    if (!selectedStaff) return;
    assignStaff.mutate(
      { eventId, venueAssignmentId: venueId, staffId: selectedStaff, role: selectedRole, dayType },
      {
        onSuccess: () => {
          onOpenChange(false);
          setInstFilter('');
          setDeptFilter('');
          setSelectedStaff('');
          setSelectedRole('mentor');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign In-Charge Orchestrator</DialogTitle>
          <DialogDescription>
            Filter by institution and department, then select an orchestrator and role.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">

          {/* Institution filter */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Institution</Label>
            <Select value={instFilter || 'all'} onValueChange={handleInstChange}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All Institutions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Institutions</SelectItem>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Department filter */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Department</Label>
            <Select
              value={deptFilter || 'all'}
              disabled={!instFilter}
              onValueChange={handleDeptChange}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={instFilter ? 'All Departments' : 'Select institution first'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.department_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Staff member */}
          <div className="space-y-1.5">
            <Label htmlFor="staff-member" className="text-sm font-medium">
              Orchestrator <span className="text-red-500">*</span>
            </Label>
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger id="staff-member">
                <SelectValue placeholder="Select orchestrator..." />
              </SelectTrigger>
              <SelectContent>
                {staffList.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    No active orchestrators found
                  </SelectItem>
                ) : (
                  staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                      <span className="text-muted-foreground ml-1 text-xs">({s.email})</span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {staffList.length > 0 && (
              <p className="text-xs text-muted-foreground">{staffList.length} orchestrator{staffList.length !== 1 ? 's' : ''} found</p>
            )}
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label htmlFor="staff-role" className="text-sm font-medium">
              Role <span className="text-red-500">*</span>
            </Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as StaffRole)}>
              <SelectTrigger id="staff-role">
                <SelectValue placeholder="Select role..." />
              </SelectTrigger>
              <SelectContent>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleAssign}
            disabled={!selectedStaff || assignStaff.isPending}
            className="w-full gap-1.5"
          >
            {assignStaff.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {assignStaff.isPending ? 'Assigning...' : 'Assign Orchestrator'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Assign Team dialog (controlled) ──────────────────────────────────────────
function AssignTeamDialog({
  open,
  onOpenChange,
  eventId,
  venueId,
  dayType,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  venueId: string;
  dayType: DayType;
}) {
  const { data: registrations = [] } = useEventRegistrations({ event_id: eventId });
  const { data: venue } = useVenue(venueId);
  const manualAllocate = useManualAllocate();
  const [selectedTeam, setSelectedTeam] = useState('');

  const allocatedRegIds = new Set(
    (venue?.team_allocations || []).map((a: any) => a.registration_id)
  );
  const unallocatedTeams = registrations.filter((r) => !allocatedRegIds.has(r.id));

  const handleAssign = () => {
    if (!selectedTeam) return;
    manualAllocate.mutate(
      { eventId, registrationId: selectedTeam, venueAssignmentId: venueId, dayType },
      {
        onSuccess: () => {
          onOpenChange(false);
          setSelectedTeam('');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Team to Venue</DialogTitle>
          <DialogDescription>
            Select a team for {dayType === 'build_day' ? 'Build Day' : 'Demo Day'}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="team-select" className="text-sm font-medium">
              Team <span className="text-red-500">*</span>
            </Label>
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger id="team-select">
                <SelectValue placeholder="Select a team..." />
              </SelectTrigger>
              <SelectContent>
                {unallocatedTeams.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    All teams are already allocated
                  </SelectItem>
                ) : (
                  unallocatedTeams.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.team_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {unallocatedTeams.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {unallocatedTeams.length} unallocated team
                {unallocatedTeams.length !== 1 ? 's' : ''} available
              </p>
            )}
          </div>
          <Button
            onClick={handleAssign}
            disabled={!selectedTeam || manualAllocate.isPending}
            className="w-full gap-1.5"
          >
            {manualAllocate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {manualAllocate.isPending ? 'Assigning...' : 'Assign Team'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
