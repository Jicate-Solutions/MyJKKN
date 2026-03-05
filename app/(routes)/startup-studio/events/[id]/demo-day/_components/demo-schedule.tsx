'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import {
  AlertCircle,
  Calendar,
  Clock,
  Loader2,
  Play,
  SkipForward,
  CheckCircle2,
  Presentation,
  Wand2,
} from 'lucide-react';
import {
  useSSEvent,
  usePresentationSlots,
  useGenerateSlots,
  useAssignSlot,
  useUpdateSlotStatus,
  useEventRegistrations,
} from '@/hooks/startup-studio';

interface DemoScheduleProps {
  eventId: string;
}

export function DemoSchedule({ eventId }: DemoScheduleProps) {
  const { data: eventRaw } = useSSEvent(eventId);
  const event = eventRaw as any;

  const {
    data: slotsRaw,
    isLoading,
    error,
  } = usePresentationSlots(eventId);
  const { data: registrationsRaw } = useEventRegistrations(eventId);
  const generateSlots = useGenerateSlots();
  const assignSlot = useAssignSlot();
  const updateSlotStatus = useUpdateSlotStatus();

  const [startDate, setStartDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState('5');
  const [slotCount, setSlotCount] = useState('20');
  const [room, setRoom] = useState('');

  const slots = (slotsRaw as any[]) ?? [];
  // API returns { data: teams[], stats, metadata } — extract teams array
  const regResponse = registrationsRaw as any;
  const registrations: any[] = regResponse?.data ?? (Array.isArray(registrationsRaw) ? registrationsRaw : []);

  // Get teams that are registered (for assignment dropdown)
  const availableTeams = useMemo(() => {
    const assignedTeamIds = new Set(
      slots.filter((s: any) => s.team_id).map((s: any) => s.team_id)
    );
    return registrations.filter(
      (r: any) => !assignedTeamIds.has(r.id)
    );
  }, [slots, registrations]);

  const handleGenerateSlots = async () => {
    try {
      // Combine date + time into ISO string
      const isoStartTime = new Date(`${startDate}T${startTime}:00`).toISOString();
      await generateSlots.mutateAsync({
        eventId,
        data: {
          start_time: isoStartTime,
          duration_mins: parseInt(duration),
          count: parseInt(slotCount),
          room: room.trim() || undefined,
        },
      });
    } catch {
      // Error handled by React Query
    }
  };

  const handleAssignTeam = async (slotId: string, teamId: string) => {
    if (!teamId) return;
    try {
      await assignSlot.mutateAsync({
        eventId,
        slotId,
        teamId,
      });
    } catch {
      // Error handled by React Query
    }
  };

  const handleUpdateStatus = async (slotId: string, status: string) => {
    try {
      await updateSlotStatus.mutateAsync({
        eventId,
        slotId,
        status,
      });
    } catch {
      // Error handled by React Query
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'presenting':
        return <Badge className="bg-blue-600 animate-pulse">Presenting</Badge>;
      case 'completed':
        return <Badge className="bg-green-600">Completed</Badge>;
      case 'skipped':
        return <Badge variant="secondary">Skipped</Badge>;
      case 'assigned':
        return <Badge variant="default">Assigned</Badge>;
      default:
        return <Badge variant="outline">{status || 'Empty'}</Badge>;
    }
  };

  // Helper to format slot time
  const formatSlotTime = (slot: any) => {
    if (!slot.slot_time) return '-';
    try {
      return new Date(slot.slot_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return slot.slot_time;
    }
  };

  // Helper to get team name from joined data
  const getTeamName = (slot: any) => slot.team?.name || slot.team_name || '';

  // Find current/next presentation
  const currentSlot = slots.find((s: any) => s.status === 'presenting');
  const nextSlot = slots.find(
    (s: any) => s.team_id && s.status !== 'presenting' && s.status !== 'completed' && s.status !== 'skipped'
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load demo day schedule. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Demo Day Schedule</h1>
        {event?.name && (
          <p className="text-sm text-muted-foreground mt-1">{event.name}</p>
        )}
      </div>

      {/* Current / Next Presentation */}
      {(currentSlot || nextSlot) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {currentSlot && (
            <Card className="border-blue-500 border-2">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <Play className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium text-blue-500">
                    NOW PRESENTING
                  </span>
                </div>
                <p className="text-lg font-bold">
                  {getTeamName(currentSlot) || 'Unknown Team'}
                </p>
                {currentSlot.submission?.app_name && (
                  <p className="text-sm text-muted-foreground">
                    {currentSlot.submission.app_name}
                  </p>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  {formatSlotTime(currentSlot)} - {currentSlot.room || 'Main Hall'}
                </p>
              </CardContent>
            </Card>
          )}
          {nextSlot && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    UP NEXT
                  </span>
                </div>
                <p className="text-lg font-bold">
                  {getTeamName(nextSlot) || 'Unknown Team'}
                </p>
                {nextSlot.submission?.app_name && (
                  <p className="text-sm text-muted-foreground">
                    {nextSlot.submission.app_name}
                  </p>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  {formatSlotTime(nextSlot)} - {nextSlot.room || 'Main Hall'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Generate Slots (Admin) */}
      {slots.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="h-4 w-4" />
              Generate Presentation Slots
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="start-date">Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start-time">Start Time</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Input
                  id="duration"
                  type="number"
                  min="1"
                  max="60"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slot-count">Number of Slots</Label>
                <Input
                  id="slot-count"
                  type="number"
                  min="1"
                  max="100"
                  value={slotCount}
                  onChange={(e) => setSlotCount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="room">Room (optional)</Label>
                <Input
                  id="room"
                  placeholder="e.g., Main Hall"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                />
              </div>
            </div>
            <Button
              onClick={handleGenerateSlots}
              disabled={generateSlots.isPending}
            >
              {generateSlots.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              Generate {slotCount} Slots
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Schedule Table */}
      {slots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Presentation className="h-4 w-4" />
              Schedule ({slots.length} slots)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="hidden md:table-cell">App Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Room</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slots.map((slot: any, index: number) => {
                  const isCurrentSlot = slot.status === 'presenting';
                  return (
                    <TableRow
                      key={slot.id}
                      className={
                        isCurrentSlot ? 'bg-blue-50 dark:bg-blue-950/20' : ''
                      }
                    >
                      <TableCell className="font-mono text-sm">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {formatSlotTime(slot)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {slot.team_id ? (
                          <span className="font-medium">{getTeamName(slot) || 'Assigned'}</span>
                        ) : (
                          <Select
                            onValueChange={(teamId) =>
                              handleAssignTeam(slot.id, teamId)
                            }
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Assign team..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableTeams.map((team: any) => (
                                <SelectItem
                                  key={team.id}
                                  value={team.id}
                                >
                                  {team.name || team.team_name}
                                </SelectItem>
                              ))}
                              {availableTeams.length === 0 && (
                                <SelectItem value="_none" disabled>
                                  No teams available
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {slot.submission?.app_name || '-'}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {slot.room || '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(slot.status)}</TableCell>
                      <TableCell className="text-right">
                        {slot.team_id && (
                          <div className="flex justify-end gap-1">
                            {slot.status !== 'presenting' &&
                              slot.status !== 'completed' &&
                              slot.status !== 'skipped' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleUpdateStatus(slot.id, 'presenting')
                                  }
                                  disabled={updateSlotStatus.isPending}
                                  title="Start Presenting"
                                >
                                  <Play className="h-4 w-4" />
                                </Button>
                              )}
                            {slot.status === 'presenting' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleUpdateStatus(slot.id, 'completed')
                                }
                                disabled={updateSlotStatus.isPending}
                                title="Mark Completed"
                              >
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              </Button>
                            )}
                            {slot.status !== 'completed' &&
                              slot.status !== 'skipped' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleUpdateStatus(slot.id, 'skipped')
                                  }
                                  disabled={updateSlotStatus.isPending}
                                  title="Skip"
                                >
                                  <SkipForward className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {slots.length === 0 && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Schedule Yet</h3>
            <p className="text-sm text-muted-foreground">
              Use the form above to generate presentation time slots.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
