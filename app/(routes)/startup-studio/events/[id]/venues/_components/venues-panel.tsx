'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Building2, MapPin, Plus, Trash2, UserPlus, Users, Wand2, X } from 'lucide-react';
import {
  useEventVenues,
  useAddVenue,
  useRemoveVenue,
  useAssignStaff,
  useRemoveStaff,
  useAutoAllocateTeams,
  useRemoveAllocation,
  useStaffList,
} from '@/hooks/startup-studio/use-event-venues';
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
  const [dayType, setDayType] = useState<DayType>('build_day');

  return (
    <Tabs value={dayType} onValueChange={(v) => setDayType(v as DayType)} className="space-y-4">
      <TabsList>
        <TabsTrigger value="build_day">Build Day</TabsTrigger>
        <TabsTrigger value="demo_day">Demo Day</TabsTrigger>
      </TabsList>

      <TabsContent value="build_day">
        <VenuesDayPanel eventId={eventId} dayType="build_day" />
      </TabsContent>
      <TabsContent value="demo_day">
        <VenuesDayPanel eventId={eventId} dayType="demo_day" />
      </TabsContent>
    </Tabs>
  );
}

function VenuesDayPanel({ eventId, dayType }: { eventId: string; dayType: DayType }) {
  const { data: venues = [], isLoading } = useEventVenues(eventId, dayType);
  const autoAllocate = useAutoAllocateTeams();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {dayType === 'build_day' ? 'Build Day' : 'Demo Day'} Venues
        </h3>
        <Button
          variant="outline"
          onClick={() => autoAllocate.mutate({ eventId, dayType })}
          disabled={autoAllocate.isPending}
        >
          <Wand2 className="mr-2 h-4 w-4" />
          {autoAllocate.isPending ? 'Allocating...' : 'Auto-Allocate Teams'}
        </Button>
      </div>

      <AddVenueForm eventId={eventId} dayType={dayType} />

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading venues...</div>
      ) : venues.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No venues configured. Add a venue above.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {venues.map((venue) => (
            <VenueCard key={venue.id} venue={venue} eventId={eventId} dayType={dayType} />
          ))}
        </div>
      )}
    </div>
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
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Venue
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Input placeholder="Venue name *" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Building" value={building} onChange={(e) => setBuilding(e.target.value)} />
          <Input placeholder="Room" value={room} onChange={(e) => setRoom(e.target.value)} />
          <Input type="number" placeholder="Capacity" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          <Select value={institutionId} onValueChange={setInstitutionId}>
            <SelectTrigger>
              <SelectValue placeholder="Institution *" />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button className="mt-3" size="sm" onClick={handleSubmit} disabled={!name || !institutionId || addVenue.isPending}>
          {addVenue.isPending ? 'Adding...' : 'Add Venue'}
        </Button>
      </CardContent>
    </Card>
  );
}

function VenueCard({ venue, eventId, dayType }: { venue: EventVenueAssignment; eventId: string; dayType: DayType }) {
  const removeVenue = useRemoveVenue();
  const removeAllocation = useRemoveAllocation();
  const allocatedCount = venue.team_allocations?.length || 0;
  const capacity = venue.capacity_override || 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {venue.manual_name || venue.resource?.resource_name || 'Unnamed'}
            </CardTitle>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              {venue.manual_building && <span>{venue.manual_building}</span>}
              {venue.manual_room && <span>Room {venue.manual_room}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={venue.institution?.name ? 'secondary' : 'outline'}>
              {venue.institution?.name || 'Unknown'}
            </Badge>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
              onClick={() => removeVenue.mutate(venue.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            Capacity: {allocatedCount} / {capacity || '\u221e'}
          </span>
        </div>

        {/* Staff Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-1">
              <Users className="h-3 w-3" /> Staff ({venue.staff_assignments?.length || 0})
            </span>
            <AddStaffDialog eventId={eventId} venueId={venue.id} dayType={dayType} />
          </div>
          <div className="flex flex-wrap gap-1">
            {(venue.staff_assignments || []).map((sa: any) => (
              <StaffBadge key={sa.id} assignment={sa} />
            ))}
          </div>
        </div>

        {/* Teams Section */}
        <div>
          <span className="text-sm font-medium flex items-center gap-1 mb-2">
            <Users className="h-3 w-3" /> Teams ({allocatedCount})
          </span>
          <div className="space-y-1">
            {(venue.team_allocations || []).map((alloc: any) => (
              <div key={alloc.id} className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1">
                <span>{alloc.registration?.team_name || 'Unknown'}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6"
                  onClick={() => removeAllocation.mutate(alloc.id)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StaffBadge({ assignment }: { assignment: any }) {
  const removeStaff = useRemoveStaff();
  const staffName = assignment.staff
    ? `${assignment.staff.first_name} ${assignment.staff.last_name}`
    : 'Unknown';

  return (
    <Badge variant="outline" className="gap-1">
      {staffName}
      <span className="text-xs text-muted-foreground">({assignment.role})</span>
      <button className="ml-1 hover:text-destructive" onClick={() => removeStaff.mutate(assignment.id)}>
        <X className="h-3 w-3" />
      </button>
    </Badge>
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
        <Button variant="outline" size="sm" className="h-7">
          <UserPlus className="mr-1 h-3 w-3" /> Add
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Staff</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={selectedStaff} onValueChange={setSelectedStaff}>
            <SelectTrigger>
              <SelectValue placeholder="Select staff member" />
            </SelectTrigger>
            <SelectContent>
              {staffList.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.first_name} {s.last_name} ({s.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as StaffRole)}>
            <SelectTrigger>
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              {STAFF_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleAssign} disabled={!selectedStaff || assignStaff.isPending} className="w-full">
            {assignStaff.isPending ? 'Assigning...' : 'Assign Staff'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
