'use client';

import { use, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Plus, X } from 'lucide-react';
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
  const { data: venues = [] } = useEventVenues(id, 'demo_day');
  const { data: registrations = [] } = useEventRegistrations({ event_id: id });
  const { data: slots = [], isLoading } = useDemoSlots(id);
  const generateSlots = useGenerateDemoSlots();
  const assignTeam = useAssignTeamToSlot();
  const unassignSlot = useUnassignSlot();

  const [venueId, setVenueId] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState('10');
  const [roomLabel, setRoomLabel] = useState('');
  const [slotCount, setSlotCount] = useState('10');

  const assignedRegIds = new Set(slots.filter((s: any) => s.registration_id).map((s: any) => s.registration_id));
  const unassignedTeams = registrations.filter((r) => !assignedRegIds.has(r.id));

  const handleGenerate = () => {
    if (!venueId || !startTime) return;
    const eventDate = event?.demo_date || event?.start_date || new Date().toISOString();
    const dateStr = eventDate.split('T')[0];
    generateSlots.mutate({
      eventId: id,
      venueAssignmentId: venueId,
      startTime: `${dateStr}T${startTime}:00`,
      durationMinutes: parseInt(duration) || 10,
      roomLabel: roomLabel || 'Main',
      count: parseInt(slotCount) || 10,
    });
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return '\u2014';
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <ContentLayout>
      <PageBreadcrumb items={[
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
        { label: 'Demo Day' },
      ]} />

      <div className="space-y-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="h-6 w-6" />
          Demo Day Management
        </h2>

        {/* Generate Slots Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Generate Demo Slots
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Select value={venueId} onValueChange={setVenueId}>
                <SelectTrigger>
                  <SelectValue placeholder="Venue *" />
                </SelectTrigger>
                <SelectContent>
                  {venues.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.manual_name || 'Unnamed'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              <Input type="number" placeholder="Duration (min)" value={duration} onChange={(e) => setDuration(e.target.value)} min={1} />
              <Input placeholder="Room label" value={roomLabel} onChange={(e) => setRoomLabel(e.target.value)} />
              <Input type="number" placeholder="Count" value={slotCount} onChange={(e) => setSlotCount(e.target.value)} min={1} />
            </div>
            <Button className="mt-3" size="sm" onClick={handleGenerate} disabled={!venueId || generateSlots.isPending}>
              {generateSlots.isPending ? 'Generating...' : 'Generate Slots'}
            </Button>
          </CardContent>
        </Card>

        {/* Slots Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Demo Slots ({slots.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading slots...</div>
            ) : slots.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No slots generated yet. Use the form above to create demo slots.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slots.map((slot: any) => (
                    <TableRow key={slot.id}>
                      <TableCell className="font-mono">{slot.slot_order}</TableCell>
                      <TableCell>{formatTime(slot.start_time)}</TableCell>
                      <TableCell>{slot.room_label || '\u2014'}</TableCell>
                      <TableCell>
                        {slot.registration ? (
                          <Badge>{slot.registration.team_name}</Badge>
                        ) : (
                          <Select
                            onValueChange={(regId) => assignTeam.mutate({ slotId: slot.id, registrationId: regId })}
                          >
                            <SelectTrigger className="w-[200px] h-8">
                              <SelectValue placeholder="Assign team..." />
                            </SelectTrigger>
                            <SelectContent>
                              {unassignedTeams.map((r) => (
                                <SelectItem key={r.id} value={r.id}>{r.team_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {slot.registration_id && (
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => unassignSlot.mutate(slot.id)}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
