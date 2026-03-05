'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
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

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, UserPlus, Wand2, X } from 'lucide-react';

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
      return data || [];
    },
    staleTime: 60 * 1000,
  });
}

interface AddStaffDialogProps {
  eventId: string;
  venueAssignmentId: string;
  dayType: DayType;
}

function AddStaffDialog({ eventId, venueAssignmentId, dayType }: AddStaffDialogProps) {
  const [open, setOpen] = useState(false);
  const [staffId, setStaffId] = useState('');
  const [role, setRole] = useState<StaffRole>('mentor');
  const { data: staffList, isLoading: staffLoading } = useStaffList();
  const assignStaff = useAssignStaff();

  const handleAssign = () => {
    if (!staffId) return;
    assignStaff.mutate(
      { eventId, venueAssignmentId, staffId, role, dayType },
      {
        onSuccess: () => {
          setStaffId('');
          setRole('mentor');
          setOpen(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="h-4 w-4 mr-1" />
          Add Staff
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Staff to Venue</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium mb-1 block">Staff Member</label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger>
                <SelectValue placeholder={staffLoading ? 'Loading...' : 'Select staff'} />
              </SelectTrigger>
              <SelectContent>
                {(staffList || []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.first_name} {s.last_name} ({s.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Role</label>
            <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleAssign}
            disabled={!staffId || assignStaff.isPending}
            className="w-full"
          >
            {assignStaff.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Assign Staff
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface VenueCardProps {
  venue: EventVenueAssignment;
  eventId: string;
  dayType: DayType;
}

function VenueCard({ venue, eventId, dayType }: VenueCardProps) {
  const removeVenue = useRemoveVenue();
  const removeStaff = useRemoveStaff();
  const removeAllocation = useRemoveAllocation();

  const venueName = venue.manual_name || venue.resource?.resource_name || 'Unnamed Venue';
  const building = venue.manual_building || venue.resource?.location || '';
  const room = venue.manual_room || '';
  const allocatedCount = venue.team_allocations?.length || 0;
  const capacity = venue.capacity_override || 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{venueName}</CardTitle>
            {(building || room) && (
              <p className="text-sm text-muted-foreground mt-1">
                {[building, room].filter(Boolean).join(' - ')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {venue.institution?.name && (
              <Badge variant="secondary">{venue.institution.name}</Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={() => removeVenue.mutate(venue.id)}
              disabled={removeVenue.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="text-sm font-medium">
          Capacity: {allocatedCount} / {capacity}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Staff Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold">Staff</h4>
            <AddStaffDialog
              eventId={eventId}
              venueAssignmentId={venue.id}
              dayType={dayType}
            />
          </div>
          {venue.staff_assignments && venue.staff_assignments.length > 0 ? (
            <div className="space-y-1">
              {venue.staff_assignments.map((sa) => (
                <div
                  key={sa.id}
                  className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/50"
                >
                  <span>
                    {sa.staff?.first_name} {sa.staff?.last_name}
                    <Badge variant="outline" className="ml-2 text-xs">
                      {sa.role.replace('_', ' ')}
                    </Badge>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeStaff.mutate(sa.id)}
                    disabled={removeStaff.isPending}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No staff assigned</p>
          )}
        </div>

        {/* Teams Section */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Allocated Teams</h4>
          {venue.team_allocations && venue.team_allocations.length > 0 ? (
            <div className="space-y-1">
              {venue.team_allocations.map((ta) => (
                <div
                  key={ta.id}
                  className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/50"
                >
                  <span>{ta.registration?.team_name || ta.registration_id}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeAllocation.mutate(ta.id)}
                    disabled={removeAllocation.isPending}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No teams allocated</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface VenuesPanelProps {
  eventId: string;
}

export function VenuesPanel({ eventId }: VenuesPanelProps) {
  const [dayType, setDayType] = useState<DayType>('build_day');
  const { data: venues, isLoading } = useEventVenues(eventId, dayType);
  const { data: institutions } = useInstitutions();
  const addVenue = useAddVenue();
  const autoAllocate = useAutoAllocateTeams();

  // Add venue form state
  const [manualName, setManualName] = useState('');
  const [manualBuilding, setManualBuilding] = useState('');
  const [manualRoom, setManualRoom] = useState('');
  const [capacityOverride, setCapacityOverride] = useState('');
  const [institutionId, setInstitutionId] = useState('');

  const handleAddVenue = () => {
    if (!institutionId || !manualName) return;
    addVenue.mutate(
      {
        event_id: eventId,
        day_type: dayType,
        institution_id: institutionId,
        manual_name: manualName || undefined,
        manual_building: manualBuilding || undefined,
        manual_room: manualRoom || undefined,
        capacity_override: capacityOverride ? Number(capacityOverride) : undefined,
      },
      {
        onSuccess: () => {
          setManualName('');
          setManualBuilding('');
          setManualRoom('');
          setCapacityOverride('');
          setInstitutionId('');
        },
      }
    );
  };

  const handleAutoAllocate = () => {
    autoAllocate.mutate({ eventId, dayType });
  };

  return (
    <div className="space-y-6">
      <Tabs value={dayType} onValueChange={(v) => setDayType(v as DayType)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="build_day">Build Day</TabsTrigger>
            <TabsTrigger value="demo_day">Demo Day</TabsTrigger>
          </TabsList>
          <Button onClick={handleAutoAllocate} disabled={autoAllocate.isPending} variant="outline">
            {autoAllocate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Wand2 className="h-4 w-4 mr-2" />
            )}
            Auto-Allocate Teams
          </Button>
        </div>

        <TabsContent value="build_day" className="mt-4">
          <VenuesContent
            venues={venues}
            isLoading={isLoading}
            eventId={eventId}
            dayType="build_day"
          />
        </TabsContent>
        <TabsContent value="demo_day" className="mt-4">
          <VenuesContent
            venues={venues}
            isLoading={isLoading}
            eventId={eventId}
            dayType="demo_day"
          />
        </TabsContent>
      </Tabs>

      {/* Add Venue Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Venue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Input
              placeholder="Venue name"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
            />
            <Input
              placeholder="Building"
              value={manualBuilding}
              onChange={(e) => setManualBuilding(e.target.value)}
            />
            <Input
              placeholder="Room"
              value={manualRoom}
              onChange={(e) => setManualRoom(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Capacity"
              value={capacityOverride}
              onChange={(e) => setCapacityOverride(e.target.value)}
            />
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger>
                <SelectValue placeholder="Institution" />
              </SelectTrigger>
              <SelectContent>
                {(institutions || []).map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleAddVenue}
            disabled={!institutionId || !manualName || addVenue.isPending}
            className="mt-3"
          >
            {addVenue.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Add Venue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function VenuesContent({
  venues,
  isLoading,
  eventId,
  dayType,
}: {
  venues: EventVenueAssignment[] | undefined;
  isLoading: boolean;
  eventId: string;
  dayType: DayType;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!venues || venues.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No venues added for this day type yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {venues.map((venue) => (
        <VenueCard key={venue.id} venue={venue} eventId={eventId} dayType={dayType} />
      ))}
    </div>
  );
}
