'use client';

import { use, useMemo, useState } from 'react';
import { Clock, Plus, UserMinus, UserPlus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useEventVenues } from '@/hooks/startup-studio/use-event-venues';
import { useEventRegistrations } from '@/hooks/startup-studio/use-event-registrations';
import {
  useDemoSlots,
  useGenerateDemoSlots,
  useAssignTeamToSlot,
  useUnassignSlot,
} from '@/hooks/startup-studio/use-event-leaderboard';

export default function DemoDayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: event } = useEvent(id);
  const { data: venues = [] } = useEventVenues(id);
  const { data: slots = [], isLoading: slotsLoading } = useDemoSlots(id);
  const { data: registrations = [] } = useEventRegistrations({ event_id: id });
  const generateMutation = useGenerateDemoSlots();
  const assignMutation = useAssignTeamToSlot();
  const unassignMutation = useUnassignSlot();

  const [venueId, setVenueId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState('15');
  const [roomLabel, setRoomLabel] = useState('');
  const [slotCount, setSlotCount] = useState('10');
  const [assigningSlotId, setAssigningSlotId] = useState<string | null>(null);
  const [selectedRegId, setSelectedRegId] = useState('');

  const assignedRegIds = useMemo(
    () => new Set(slots.filter((s) => s.registration_id).map((s) => s.registration_id)),
    [slots]
  );

  const unassignedTeams = useMemo(
    () => (registrations as any[]).filter((r: any) => !assignedRegIds.has(r.id)),
    [registrations, assignedRegIds]
  );

  const handleGenerate = () => {
    if (!venueId || !startTime || !duration || !roomLabel || !slotCount) return;
    generateMutation.mutate({
      eventId: id,
      venueAssignmentId: venueId,
      startTime,
      durationMinutes: parseInt(duration, 10),
      roomLabel,
      count: parseInt(slotCount, 10),
    });
  };

  const handleAssign = (slotId: string) => {
    if (!selectedRegId) return;
    assignMutation.mutate(
      { slotId, registrationId: selectedRegId },
      {
        onSuccess: () => {
          setAssigningSlotId(null);
          setSelectedRegId('');
        },
      }
    );
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <ContentLayout>
      <PageBreadcrumb
        items={[
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
          { label: 'Demo Day' },
        ]}
      />

      <div className="space-y-6">
        {/* Generate Slots Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Generate Demo Slots
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
              <div className="space-y-2">
                <Label>Venue</Label>
                <Select value={venueId} onValueChange={setVenueId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select venue" />
                  </SelectTrigger>
                  <SelectContent>
                    {venues.map((v: any) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.manual_name || v.institution?.name || v.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Duration (min)</Label>
                <Input
                  type="number"
                  min="5"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Room Label</Label>
                <Input
                  placeholder="e.g. Room A"
                  value={roomLabel}
                  onChange={(e) => setRoomLabel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Number of Slots</Label>
                <Input
                  type="number"
                  min="1"
                  value={slotCount}
                  onChange={(e) => setSlotCount(e.target.value)}
                />
              </div>
              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending || !venueId || !startTime}
              >
                <Clock className="mr-2 h-4 w-4" />
                Generate
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Slots Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Demo Slots ({slots.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {slotsLoading ? (
              <p className="text-center text-muted-foreground py-8">Loading slots...</p>
            ) : slots.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No demo slots generated yet. Use the form above to create slots.
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Order</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slots.map((slot) => (
                      <TableRow key={slot.id}>
                        <TableCell className="font-mono">{slot.slot_order ?? '-'}</TableCell>
                        <TableCell>{formatTime(slot.start_time)}</TableCell>
                        <TableCell>{slot.room_label || '-'}</TableCell>
                        <TableCell>
                          {slot.registration ? (
                            <Badge variant="secondary">{slot.registration.team_name}</Badge>
                          ) : (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {assigningSlotId === slot.id ? (
                            <div className="flex items-center gap-2 justify-end">
                              <Select value={selectedRegId} onValueChange={setSelectedRegId}>
                                <SelectTrigger className="w-[200px]">
                                  <SelectValue placeholder="Select team" />
                                </SelectTrigger>
                                <SelectContent>
                                  {unassignedTeams.map((t: any) => (
                                    <SelectItem key={t.id} value={t.id}>
                                      {t.team_name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                onClick={() => handleAssign(slot.id)}
                                disabled={!selectedRegId || assignMutation.isPending}
                              >
                                Assign
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setAssigningSlotId(null);
                                  setSelectedRegId('');
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : slot.registration_id ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => unassignMutation.mutate(slot.id)}
                              disabled={unassignMutation.isPending}
                            >
                              <UserMinus className="mr-1 h-4 w-4" />
                              Unassign
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setAssigningSlotId(slot.id);
                                setSelectedRegId('');
                              }}
                            >
                              <UserPlus className="mr-1 h-4 w-4" />
                              Assign
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
