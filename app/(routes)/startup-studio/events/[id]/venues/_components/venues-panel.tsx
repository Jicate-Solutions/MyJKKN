'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Building2, Hash, Loader2, MapPin, Pencil, Plus, Trash2,
  UserPlus, Users, Wand2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useEventVenues,
  useAddVenue,
  useUpdateVenue,
  useRemoveVenue,
  useAssignStaff,
  useRemoveStaff,
  useAutoAllocateTeams,
  useManualAllocate,
  useRemoveAllocation,
  useStaffList,
} from '@/hooks/startup-studio/use-event-venues';
import { useEventRegistrations } from '@/hooks/startup-studio/use-event-registrations';
import { useAuth } from '@/hooks/use-auth';
import type { DayType, StaffRole, EventVenueAssignment } from '@/types/startup-studio';

const STAFF_ROLES: { value: StaffRole; label: string }[] = [
  { value: 'mentor', label: 'Mentor' },
  { value: 'lead_mentor', label: 'Lead Mentor' },
  { value: 'judge', label: 'Judge' },
  { value: 'panel_chair', label: 'Panel Chair' },
  { value: 'evaluator', label: 'Evaluator' },
];

function useInstitutions() {
  return useQuery({
    queryKey: ['institutions-list'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('institutions')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
    staleTime: 60 * 1000,
  });
}

interface VenuesPanelProps {
  eventId: string;
}

export function VenuesPanel({ eventId }: VenuesPanelProps) {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.is_super_admin === true;
  const [dayType, setDayType] = useState<DayType>('build_day');

  return (
    <Tabs value={dayType} onValueChange={(v) => setDayType(v as DayType)} className="space-y-5">
      <TabsList className="grid w-full max-w-xs grid-cols-2">
        <TabsTrigger value="build_day">Build Day</TabsTrigger>
        <TabsTrigger value="demo_day">Demo Day</TabsTrigger>
      </TabsList>

      <TabsContent value="build_day">
        <VenuesDayPanel eventId={eventId} dayType="build_day" isSuperAdmin={isSuperAdmin} />
      </TabsContent>
      <TabsContent value="demo_day">
        <VenuesDayPanel eventId={eventId} dayType="demo_day" isSuperAdmin={isSuperAdmin} />
      </TabsContent>
    </Tabs>
  );
}

function VenuesDayPanel({ eventId, dayType, isSuperAdmin }: { eventId: string; dayType: DayType; isSuperAdmin: boolean }) {
  const { data: venues = [], isLoading } = useEventVenues(eventId, dayType);
  const autoAllocate = useAutoAllocateTeams();

  const totalCapacity = venues.reduce((s, v) => s + (v.capacity_override || 0), 0);
  const totalAllocated = venues.reduce((s, v) => s + (v.team_allocations?.length || 0), 0);
  const totalStaff = venues.reduce((s, v) => s + (v.staff_assignments?.length || 0), 0);

  return (
    <div className="space-y-5">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MiniStat icon={<Building2 className="h-4 w-4" />} label="Venues" value={venues.length} />
        <MiniStat icon={<Users className="h-4 w-4" />} label="Teams Allocated" value={totalAllocated} color="text-green-600" />
        <MiniStat icon={<Hash className="h-4 w-4" />} label="Total Capacity" value={totalCapacity || '∞'} />
        <MiniStat icon={<UserPlus className="h-4 w-4" />} label="Staff Assigned" value={totalStaff} color="text-blue-600" />
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => autoAllocate.mutate({ eventId, dayType })}
          disabled={autoAllocate.isPending}
          className="gap-1.5"
        >
          {autoAllocate.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          {autoAllocate.isPending ? 'Allocating...' : 'Auto-Allocate Teams'}
        </Button>
      </div>

      {/* Add Venue Form */}
      <AddVenueForm eventId={eventId} dayType={dayType} />

      {/* Venue Cards */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : venues.length === 0 ? (
        <div className="text-center py-12">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No venues configured yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Use the form above to add a venue.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {venues.map((venue) => (
            <VenueCard key={venue.id} venue={venue} eventId={eventId} dayType={dayType} isSuperAdmin={isSuperAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number | string; color?: string;
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

function AddVenueForm({ eventId, dayType }: { eventId: string; dayType: DayType }) {
  const { data: institutions = [] } = useInstitutions();
  const addVenue = useAddVenue();
  const [name, setName] = useState('');
  const [building, setBuilding] = useState('');
  const [room, setRoom] = useState('');
  const [capacity, setCapacity] = useState('');
  const [institutionId, setInstitutionId] = useState('');

  const handleSubmit = () => {
    if (!name || !institutionId) return;
    addVenue.mutate({
      event_id: eventId,
      day_type: dayType,
      institution_id: institutionId,
      manual_name: name,
      manual_building: building || undefined,
      manual_room: room || undefined,
      capacity_override: capacity ? parseInt(capacity) : undefined,
    }, {
      onSuccess: () => {
        setName('');
        setBuilding('');
        setRoom('');
        setCapacity('');
      },
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Venue
        </CardTitle>
        <CardDescription>
          Add a new venue for {dayType === 'build_day' ? 'build day' : 'demo day'} activities.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Row 1: Name & Institution */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="venue-name" className="text-sm font-medium flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              Venue Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="venue-name"
              placeholder="e.g., Main Auditorium"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="institution" className="text-sm font-medium flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              Institution <span className="text-red-500">*</span>
            </Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger id="institution">
                <SelectValue placeholder="Select institution..." />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 2: Building, Room, Capacity */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="building" className="text-sm font-medium">Building</Label>
            <Input
              id="building"
              placeholder="e.g., Block A"
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="room" className="text-sm font-medium">Room</Label>
            <Input
              id="room"
              placeholder="e.g., 101"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="capacity" className="text-sm font-medium flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              Capacity
            </Label>
            <Input
              id="capacity"
              type="number"
              placeholder="e.g., 30"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              min={1}
            />
          </div>
        </div>

        <Separator />

        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={!name || !institutionId || addVenue.isPending}
            className="gap-1.5"
          >
            {addVenue.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {addVenue.isPending ? 'Adding...' : 'Add Venue'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function VenueCard({ venue, eventId, dayType, isSuperAdmin }: {
  venue: EventVenueAssignment; eventId: string; dayType: DayType; isSuperAdmin: boolean;
}) {
  const removeVenue = useRemoveVenue();
  const removeAllocation = useRemoveAllocation();
  const allocatedCount = venue.team_allocations?.length || 0;
  const capacity = venue.capacity_override || 0;
  const fillPercent = capacity > 0 ? Math.round((allocatedCount / capacity) * 100) : 0;

  return (
    <Card className="overflow-hidden">
      <div className={cn(
        'h-1',
        allocatedCount >= capacity && capacity > 0 ? 'bg-green-500' : 'bg-primary/60'
      )} />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              {venue.manual_name || venue.resource?.name || 'Unnamed'}
            </CardTitle>
            <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground">
              {venue.manual_building && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {venue.manual_building}
                </span>
              )}
              {venue.manual_room && <span>Room {venue.manual_room}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-xs">
              {venue.institution?.name || 'Unknown'}
            </Badge>
            {/* Edit — super admin only */}
            {isSuperAdmin && (
              <EditVenueDialog venue={venue} />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => removeVenue.mutate(venue.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Capacity Bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground">Capacity</span>
            <span className="text-xs font-medium">
              {allocatedCount} / {capacity || '∞'}
              {capacity > 0 && ` (${fillPercent}%)`}
            </span>
          </div>
          {capacity > 0 && (
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  fillPercent >= 100 ? 'bg-green-500' : fillPercent >= 75 ? 'bg-amber-500' : 'bg-primary'
                )}
                style={{ width: `${Math.min(fillPercent, 100)}%` }}
              />
            </div>
          )}
        </div>

        <Separator />

        {/* Staff Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              Staff
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-1">
                {venue.staff_assignments?.length || 0}
              </Badge>
            </span>
            <AddStaffDialog eventId={eventId} venueId={venue.id} dayType={dayType} />
          </div>
          {(venue.staff_assignments?.length || 0) > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {(venue.staff_assignments || []).map((sa: any) => (
                <StaffBadge key={sa.id} assignment={sa} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No staff assigned yet.</p>
          )}
        </div>

        <Separator />

        {/* Teams Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              Teams
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-1">
                {allocatedCount}
              </Badge>
            </span>
            <AssignTeamDialog eventId={eventId} venueId={venue.id} dayType={dayType} />
          </div>
          {allocatedCount > 0 ? (
            <div className="space-y-1">
              {(venue.team_allocations || []).map((alloc: any) => (
                <div key={alloc.id} className="flex items-center justify-between text-sm bg-muted/50 rounded-md px-3 py-1.5 group">
                  <span className="font-medium text-xs">{alloc.registration?.team_name || 'Unknown'}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={() => removeAllocation.mutate(alloc.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No teams allocated yet. Use the button above to assign teams.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EditVenueDialog({ venue }: { venue: EventVenueAssignment }) {
  const { data: institutions = [] } = useInstitutions();
  const updateVenue = useUpdateVenue();
  const [open, setOpen] = useState(false);

  // Form state pre-filled from venue
  const [name, setName] = useState(venue.manual_name || '');
  const [building, setBuilding] = useState(venue.manual_building || '');
  const [room, setRoom] = useState(venue.manual_room || '');
  const [capacity, setCapacity] = useState(venue.capacity_override ? String(venue.capacity_override) : '');
  const [institutionId, setInstitutionId] = useState((venue.institution as any)?.id || '');

  const handleOpen = (val: boolean) => {
    if (val) {
      // Reset to current venue values each time the dialog opens
      setName(venue.manual_name || '');
      setBuilding(venue.manual_building || '');
      setRoom(venue.manual_room || '');
      setCapacity(venue.capacity_override ? String(venue.capacity_override) : '');
      setInstitutionId((venue.institution as any)?.id || '');
    }
    setOpen(val);
  };

  const handleSave = () => {
    if (!name || !institutionId) return;
    updateVenue.mutate(
      {
        venueId: venue.id,
        dto: {
          institution_id: institutionId,
          manual_name: name,
          manual_building: building || undefined,
          manual_room: room || undefined,
          capacity_override: capacity ? parseInt(capacity) : null,
        },
      },
      { onSuccess: () => setOpen(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Venue</DialogTitle>
          <DialogDescription>Update venue details. Only super admins can edit venues.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Name */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              Venue Name <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="e.g., Main Auditorium"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Institution */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              Institution <span className="text-red-500">*</span>
            </Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger>
                <SelectValue placeholder="Select institution..." />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Building & Room */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Building</Label>
              <Input
                placeholder="e.g., Block A"
                value={building}
                onChange={(e) => setBuilding(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Room</Label>
              <Input
                placeholder="e.g., 101"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
              />
            </div>
          </div>

          {/* Capacity */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              Capacity
            </Label>
            <Input
              type="number"
              placeholder="e.g., 30 (leave blank for unlimited)"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              min={1}
            />
          </div>

          <Separator />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={!name || !institutionId || updateVenue.isPending}
              className="gap-1.5"
            >
              {updateVenue.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {updateVenue.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StaffBadge({ assignment }: { assignment: any }) {
  const removeStaff = useRemoveStaff();
  const staffName = assignment.staff
    ? `${assignment.staff.first_name} ${assignment.staff.last_name}`
    : 'Unknown';
  const roleLabel = STAFF_ROLES.find((r) => r.value === assignment.role)?.label || assignment.role;

  return (
    <Badge variant="outline" className="gap-1.5 pr-1">
      <span className="font-medium">{staffName}</span>
      <span className="text-[10px] text-muted-foreground">({roleLabel})</span>
      <button
        className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/10 hover:text-destructive transition-colors"
        onClick={() => removeStaff.mutate(assignment.id)}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

function AssignTeamDialog({ eventId, venueId, dayType }: { eventId: string; venueId: string; dayType: DayType }) {
  const { data: registrations = [] } = useEventRegistrations({ event_id: eventId });
  const { data: venues = [] } = useEventVenues(eventId, dayType);
  const manualAllocate = useManualAllocate();
  const [open, setOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState('');

  // Find teams not yet allocated to ANY venue for this day type
  const allocatedRegIds = new Set(
    venues.flatMap((v) => (v.team_allocations || []).map((a: any) => a.registration_id))
  );
  const unallocatedTeams = registrations.filter((r) => !allocatedRegIds.has(r.id));

  const handleAssign = () => {
    if (!selectedTeam) return;
    manualAllocate.mutate(
      { eventId, registrationId: selectedTeam, venueAssignmentId: venueId, dayType },
      {
        onSuccess: () => {
          setOpen(false);
          setSelectedTeam('');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
          <Plus className="h-3 w-3" /> Assign Team
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Team to Venue</DialogTitle>
          <DialogDescription>Select a team to assign to this venue for {dayType === 'build_day' ? 'Build Day' : 'Demo Day'}.</DialogDescription>
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
                  <SelectItem value="_none" disabled>All teams are already allocated</SelectItem>
                ) : (
                  unallocatedTeams.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.team_name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {unallocatedTeams.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {unallocatedTeams.length} unallocated team{unallocatedTeams.length !== 1 ? 's' : ''} available
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

function AddStaffDialog({ eventId, venueId, dayType }: { eventId: string; venueId: string; dayType: DayType }) {
  const { data: staffList = [] } = useStaffList();
  const assignStaff = useAssignStaff();
  const [open, setOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedRole, setSelectedRole] = useState<StaffRole>('mentor');

  const handleAssign = () => {
    if (!selectedStaff) return;
    assignStaff.mutate(
      { eventId, venueAssignmentId: venueId, staffId: selectedStaff, role: selectedRole, dayType },
      {
        onSuccess: () => {
          setOpen(false);
          setSelectedStaff('');
          setSelectedRole('mentor');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
          <UserPlus className="h-3 w-3" /> Add Staff
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Staff</DialogTitle>
          <DialogDescription>Select a staff member and their role for this venue.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="staff-member" className="text-sm font-medium">
              Staff Member <span className="text-red-500">*</span>
            </Label>
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger id="staff-member">
                <SelectValue placeholder="Select staff member..." />
              </SelectTrigger>
              <SelectContent>
                {staffList.length === 0 ? (
                  <SelectItem value="_none" disabled>No staff available</SelectItem>
                ) : (
                  staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} ({s.email})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
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
            {assignStaff.isPending ? 'Assigning...' : 'Assign Staff'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
