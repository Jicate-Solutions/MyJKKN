'use client';

export const dynamic = 'force-dynamic';

import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Calendar, CalendarClock, Clock, Download, Eye, Flag,
  Hash, Loader2, Lock, MapPin, Monitor, Plus, Settings, Timer, Users, Vote, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useEventVenues } from '@/hooks/startup-studio/use-event-venues';
import { useEventRegistrations } from '@/hooks/startup-studio/use-event-registrations';
import {
  useDemoSlots,
  useGenerateDemoSlots,
  useAssignTeamToSlot,
  useUnassignSlot,
} from '@/hooks/startup-studio/use-event-leaderboard';
import { useAuth } from '@/hooks/use-auth';
import {
  useFreezeMetrics,
  usePublishVerifiedResults,
  useFlaggedVerifications,
  useAdminUpdateVerification,
  useEvaluatorProgress,
} from '@/hooks/startup-studio/use-appathon-verifications';
import { useOpenVoting, useCloseVoting } from '@/hooks/startup-studio/use-audience-votes';
import { useAutoAssignLevel1 } from '@/hooks/startup-studio/use-progression';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function DemoDayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { isLoading: authLoading, profile } = useAuth();
  const isSuperAdmin = !!(profile?.is_super_admin || profile?.role === 'super_admin');
  const { data: event } = useEvent(id);
  const { data: venues = [] } = useEventVenues(id, 'demo_day');
  const { data: registrations = [] } = useEventRegistrations({ event_id: id });
  const { data: slots = [], isLoading: slotsLoading } = useDemoSlots(id);
  const isLoading = authLoading || slotsLoading;
  const generateSlots = useGenerateDemoSlots();
  const assignTeam = useAssignTeamToSlot();
  const unassignSlot = useUnassignSlot();
  const freezeMetrics = useFreezeMetrics(id);
  const publishResults = usePublishVerifiedResults(id);
  const openVoting = useOpenVoting(id);
  const closeVoting = useCloseVoting(id);
  const autoAssignLevel1 = useAutoAssignLevel1(id);
  const { data: flaggedVerifications } = useFlaggedVerifications(id);
  const adminUpdate = useAdminUpdateVerification(id);
  const { data: evaluatorProgressData } = useEvaluatorProgress(id);

  // Default date from event's demo_date or start_date
  const defaultDate = useMemo(() => {
    const d = event?.demo_date || event?.start_date;
    return d ? d.split('T')[0] : new Date().toISOString().split('T')[0];
  }, [event?.demo_date, event?.start_date]);

  const [venueId, setVenueId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState('10');
  const [roomLabel, setRoomLabel] = useState('');
  const [slotCount, setSlotCount] = useState('10');

  const assignedRegIds = new Set(slots.filter((s: any) => s.registration_id).map((s: any) => s.registration_id));
  const unassignedTeams = registrations.filter((r) => !assignedRegIds.has(r.id));
  const assignedCount = slots.filter((s: any) => s.registration_id).length;

  const handleGenerate = () => {
    if (!venueId || !startTime) return;
    const dateStr = startDate || defaultDate;
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

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Not set';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <ContentLayout title="Demo Day Management">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
        { label: 'Demo Day' },
      ]} />

      <div className="space-y-6 mt-4 pb-10">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/startup-studio/events/${id}`)}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Event
        </Button>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            Demo Day Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{event?.name || 'Event'}</p>
          {event?.demo_date && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Demo Date: {formatDate(event.demo_date)}
            </p>
          )}
        </div>

        {/* ── Demo Day Controls ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4" />
              Demo Day Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Freeze Metrics */}
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <p className="text-sm font-medium">Freeze Metrics</p>
                <p className="text-xs text-muted-foreground">
                  {event?.metrics_frozen_at
                    ? `Frozen at ${new Date(event.metrics_frozen_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Prevents teams from updating metrics. Use at 9:15 AM.'}
                </p>
              </div>
              {event?.metrics_frozen_at ? (
                <Badge className="bg-green-500 gap-1">
                  <Lock className="h-3 w-3" /> Frozen
                </Badge>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" className="gap-1.5" disabled={freezeMetrics.isPending}>
                      <Lock className="h-3.5 w-3.5" /> Freeze Metrics
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Freeze Team Metrics?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This prevents ALL teams from updating their user counts and revenue.
                        This should only be done at 9:15 AM when presentations begin.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive" onClick={() => freezeMetrics.mutate()}>
                        Freeze Now
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            {/* Publish Results */}
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <p className="text-sm font-medium">Publish Results</p>
                <p className="text-xs text-muted-foreground">
                  {event?.is_results_published
                    ? `Published at ${event.results_published_at ? new Date(event.results_published_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '\u2014'}`
                    : 'Makes the verified leaderboard visible to all participants.'}
                </p>
              </div>
              {event?.is_results_published ? (
                <Badge className="bg-blue-500 gap-1">
                  <Eye className="h-3 w-3" /> Published
                </Badge>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={publishResults.isPending || !event?.metrics_frozen_at}>
                      <Eye className="h-3.5 w-3.5" /> Publish Results
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Publish Results?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The verified leaderboard will become visible to all participants.
                        Make sure all teams have been verified or flagged before publishing.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => publishResults.mutate()}>
                        Publish Now
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            {/* Progression Levels */}
            {isSuperAdmin && event?.is_results_published && (
              <div className="border rounded-lg p-4 space-y-2">
                <h3 className="text-sm font-semibold">Progression Levels</h3>
                <p className="text-xs text-muted-foreground">
                  Auto-assign Level 1 (App Builder) to all learners whose team presented with a live app.
                  Safe to run multiple times — uses ON CONFLICT DO NOTHING.
                </p>
                <Button
                  variant="outline"
                  onClick={() => autoAssignLevel1.mutate()}
                  disabled={autoAssignLevel1.isPending}
                  size="sm"
                >
                  {autoAssignLevel1.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Auto-Assign Level 1 (App Builder)
                </Button>
              </div>
            )}

            {/* Audience Voting */}
            {isSuperAdmin && (() => {
              const votingOpen = !!event?.voting_opened_at && !event?.voting_closed_at;
              const votingClosed = !!event?.voting_closed_at;
              return (
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">Audience Voting</p>
                    <p className="text-xs text-muted-foreground">
                      {votingOpen
                        ? `Opened at ${new Date(event!.voting_opened_at!).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                        : votingClosed
                        ? `Closed at ${new Date(event!.voting_closed_at!).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                        : 'Allow audience to vote on startup pitches.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {votingOpen ? (
                      <Badge className="bg-green-500 gap-1">
                        <Vote className="h-3 w-3" /> Voting Open
                      </Badge>
                    ) : votingClosed ? (
                      <Badge variant="secondary" className="gap-1 text-muted-foreground">
                        <Vote className="h-3 w-3" /> Voting Closed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-muted-foreground">
                        <Vote className="h-3 w-3" /> Not Started
                      </Badge>
                    )}
                    {votingOpen ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={closeVoting.isPending}
                        onClick={() => closeVoting.mutate()}
                      >
                        {closeVoting.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Vote className="h-3.5 w-3.5" />
                        )}
                        Close Voting
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={openVoting.isPending}
                        onClick={() => openVoting.mutate()}
                      >
                        {openVoting.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Vote className="h-3.5 w-3.5" />
                        )}
                        Open Voting
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* CSV Export */}
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <p className="text-sm font-medium">Export Results</p>
                <p className="text-xs text-muted-foreground">Download all verification data as CSV</p>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" asChild>
                <a href={`/api/startup-studio/events/${id}/export/verifications`} download>
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Evaluator Progress ── */}
        {(evaluatorProgressData?.length ?? 0) > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Evaluator Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {evaluatorProgressData!.map(ep => (
                <div key={ep.staff_id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{ep.evaluator_name}</span>
                      <span className="text-muted-foreground text-xs ml-2">{ep.venue_name}</span>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {ep.verified_count}/{ep.total_teams}
                    </span>
                  </div>
                  <Progress
                    value={ep.total_teams > 0 ? (ep.verified_count / ep.total_teams) * 100 : 0}
                    className="h-1.5"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Flagged Teams Review ── */}
        {(flaggedVerifications?.length ?? 0) > 0 && (
          <Card className="border-amber-400">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-amber-700">
                <Flag className="h-4 w-4" />
                Flagged Teams ({flaggedVerifications!.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {flaggedVerifications!.map(v => {
                const sub = (v as any).event_submissions;
                const reg = sub?.event_registrations;
                const evaluator = (v as any).profiles;
                return (
                  <div key={v.id} className="border rounded-lg p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{reg?.team_name ?? '\u2014'}</p>
                        <p className="text-xs text-muted-foreground">Flagged by: {evaluator?.full_name ?? '\u2014'}</p>
                        <p className="text-xs text-red-600 mt-1">Reason: {v.flag_reason}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={v.verification_status === 'disqualified' ? 'text-red-600 border-red-400' : 'text-amber-600 border-amber-400'}
                      >
                        {v.verification_status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                      <span>Claimed: {v.claimed_users} users, {v.claimed_active_users} active, ₹{v.claimed_revenue}</span>
                      <span>Verified: {v.verified_users} users, {v.verified_active_users} active, ₹{v.verified_revenue}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm" variant="outline"
                        className="flex-1 text-green-600 border-green-400 hover:bg-green-50 text-xs"
                        onClick={() => adminUpdate.mutate({ id: v.id, dto: { verification_status: 'verified' } })}
                        disabled={adminUpdate.isPending}
                      >
                        Accept as Verified
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className="flex-1 text-red-600 border-red-400 hover:bg-red-50 text-xs"
                        onClick={() => adminUpdate.mutate({ id: v.id, dto: { verification_status: 'disqualified' } })}
                        disabled={adminUpdate.isPending}
                      >
                        Disqualify
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={<Monitor className="h-4 w-4" />} label="Total Slots" value={slots.length} />
          <StatCard icon={<Users className="h-4 w-4" />} label="Assigned" value={assignedCount} color="text-green-600" />
          <StatCard icon={<Clock className="h-4 w-4" />} label="Unassigned" value={slots.length - assignedCount} color="text-amber-600" />
          <StatCard icon={<Users className="h-4 w-4" />} label="Teams Available" value={unassignedTeams.length} color="text-blue-600" />
        </div>

        {/* Generate Slots Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Generate Demo Slots
            </CardTitle>
            <CardDescription>
              Configure and generate time slots for team demos. Each slot is assigned a sequential time based on the start time and duration.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Row 1: Venue & Room */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="venue" className="text-sm font-medium flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  Venue <span className="text-red-500">*</span>
                </Label>
                <Select value={venueId} onValueChange={setVenueId}>
                  <SelectTrigger id="venue">
                    <SelectValue placeholder="Select a venue..." />
                  </SelectTrigger>
                  <SelectContent>
                    {venues.length === 0 ? (
                      <SelectItem value="_none" disabled>No venues configured</SelectItem>
                    ) : (
                      venues.map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.manual_name || 'Unnamed'}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="room-label" className="text-sm font-medium flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  Room Label
                </Label>
                <Input
                  id="room-label"
                  placeholder="e.g., Hall A, Room 101"
                  value={roomLabel}
                  onChange={(e) => setRoomLabel(e.target.value)}
                />
              </div>
            </div>

            <Separator />

            {/* Row 2: Date & Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date" className="text-sm font-medium flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  Start Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate || defaultDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start-time" className="text-sm font-medium flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Start Time <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
            </div>

            {/* Row 3: Duration & Count */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration" className="text-sm font-medium flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                  Slot Duration (minutes)
                </Label>
                <Input
                  id="duration"
                  type="number"
                  placeholder="10"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  min={1}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slot-count" className="text-sm font-medium flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  Number of Slots
                </Label>
                <Input
                  id="slot-count"
                  type="number"
                  placeholder="10"
                  value={slotCount}
                  onChange={(e) => setSlotCount(e.target.value)}
                  min={1}
                />
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                This will create {slotCount || 0} slots starting at {startTime || '—'}, each {duration || '—'} min apart.
              </p>
              <Button
                onClick={handleGenerate}
                disabled={!venueId || generateSlots.isPending}
                className="gap-1.5"
              >
                {generateSlots.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {generateSlots.isPending ? 'Generating...' : 'Generate Slots'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Slots Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Demo Slots
                </CardTitle>
                <CardDescription className="mt-1">
                  {slots.length} total &middot; {assignedCount} assigned &middot; {slots.length - assignedCount} available
                </CardDescription>
              </div>
              {slots.length > 0 && (
                <Badge variant={assignedCount === slots.length ? 'default' : 'secondary'} className={cn(
                  assignedCount === slots.length
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : ''
                )}>
                  {assignedCount === slots.length ? 'All Assigned' : `${Math.round((assignedCount / slots.length) * 100)}% Assigned`}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-12">
                <Monitor className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No slots generated yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Use the form above to create demo slots.</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-16 text-center">#</TableHead>
                      <TableHead className="min-w-[100px]">Time</TableHead>
                      <TableHead className="min-w-[100px]">Room</TableHead>
                      <TableHead className="min-w-[200px]">Assigned Team</TableHead>
                      <TableHead className="text-right w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slots.map((slot: any) => (
                      <TableRow key={slot.id} className="group">
                        <TableCell className="font-mono text-center text-muted-foreground">
                          {slot.slot_order}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">{formatTime(slot.start_time)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{slot.room_label || '\u2014'}</span>
                        </TableCell>
                        <TableCell>
                          {slot.registration ? (
                            <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                              {slot.registration.team_name}
                            </Badge>
                          ) : (
                            <Select
                              onValueChange={(regId) => assignTeam.mutate({ slotId: slot.id, registrationId: regId })}
                            >
                              <SelectTrigger className="w-[200px] h-8 text-xs">
                                <SelectValue placeholder="Assign a team..." />
                              </SelectTrigger>
                              <SelectContent>
                                {unassignedTeams.length === 0 ? (
                                  <SelectItem value="_none" disabled>No teams available</SelectItem>
                                ) : (
                                  unassignedTeams.map((r) => (
                                    <SelectItem key={r.id} value={r.id}>{r.team_name}</SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {slot.registration_id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                              onClick={() => unassignSlot.mutate(slot.id)}
                            >
                              <X className="h-3.5 w-3.5" />
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

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color?: string;
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
