'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useMarathonEvent } from '@/hooks/events/marathon/use-marathon-events';
import { useLiveOpsData } from '@/hooks/events/marathon/use-marathon-live-ops';
import {
  Loader2,
  Radio,
  Clock,
  CheckCircle2,
  ArrowRight,
  ClipboardList,
} from 'lucide-react';

import { RaceControls } from './_components/race-controls';
import { RunnerStatsBar } from './_components/runner-stats-bar';
import { LiveRunnerMap } from './_components/live-runner-map';
import { CheckpointPanel } from './_components/checkpoint-panel';
import { IncidentPanel } from './_components/incident-panel';
import { StationaryAlerts } from './_components/stationary-alerts';
import { VolunteerPanel } from './_components/volunteer-panel';
import { LiveRunnerDetail } from './_components/live-runner-detail';

// ============================================================================
// Pre-Race State
// ============================================================================

function PreRaceView({ eventId, eventName }: { eventId: string; eventName: string }) {
  const { data: liveData } = useLiveOpsData(eventId, false);

  const preRaceChecklist = [
    { label: 'Course route marked and secured', key: 'route' },
    { label: 'Water and medical stations set up', key: 'stations' },
    { label: 'Checkpoint QR codes deployed', key: 'checkpoints' },
    { label: 'Volunteer team checked in', key: 'volunteers' },
    { label: 'Timing system tested', key: 'timing' },
    { label: 'Emergency contacts confirmed', key: 'emergency' },
    { label: 'PA system working', key: 'pa' },
    { label: 'First aid supplies stocked', key: 'firstaid' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
            <Clock className="h-5 w-5 text-yellow-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Race has not started yet</h2>
            <p className="text-sm text-muted-foreground">
              Complete pre-race preparations and start the race when ready.
            </p>
          </div>
        </div>
        <RaceControls eventId={eventId} status="execution" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pre-race checklist */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Pre-Race Checklist
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {preRaceChecklist.map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                >
                  <input type="checkbox" className="h-4 w-4 rounded" />
                  <span className="text-sm">{item.label}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Volunteer check-in */}
        <VolunteerPanel
          eventId={eventId}
          volunteers={liveData?.volunteer_status ?? []}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Live State
// ============================================================================

function LiveView({ eventId, eventName, raceStartedAt }: {
  eventId: string;
  eventName: string;
  raceStartedAt?: string | null;
}) {
  const [selectedBib, setSelectedBib] = useState<string | null>(null);

  const { data: liveData, isLoading } = useLiveOpsData(eventId, true);

  if (isLoading || !liveData) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading live data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-medium text-red-600">LIVE</span>
        </div>
        <RaceControls
          eventId={eventId}
          status="live"
          raceStartedAt={raceStartedAt}
        />
      </div>

      {/* Stats bar */}
      <RunnerStatsBar
        totalTracking={liveData.stats.total_tracking}
        onCourse={liveData.stats.on_course}
        finished={liveData.stats.finished}
        avgPace={liveData.stats.avg_pace}
      />

      {/* Main 2x2 grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top-left: Runner Map/List */}
        <LiveRunnerMap
          runners={liveData.runners}
          onSelectRunner={setSelectedBib}
        />

        {/* Top-right: Checkpoint Panel */}
        <CheckpointPanel
          checkpoints={liveData.checkpoint_throughput}
          totalRunners={liveData.stats.total_tracking}
        />

        {/* Bottom-left: Stationary Alerts */}
        <StationaryAlerts
          eventId={eventId}
          alerts={liveData.stationary_alerts}
        />

        {/* Bottom-right: Incident Panel */}
        <IncidentPanel
          eventId={eventId}
          incidents={liveData.active_incidents}
        />
      </div>

      {/* Volunteer panel at bottom */}
      <VolunteerPanel
        eventId={eventId}
        volunteers={liveData.volunteer_status}
      />

      {/* Runner detail slide-over */}
      <LiveRunnerDetail
        eventId={eventId}
        bib={selectedBib}
        onClose={() => setSelectedBib(null)}
      />
    </div>
  );
}

// ============================================================================
// Post-Race State
// ============================================================================

function PostRaceView({ eventId }: { eventId: string }) {
  const { data: liveData } = useLiveOpsData(eventId, false);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Race Complete</h2>
          <p className="text-sm text-muted-foreground">
            The race has ended. Review the summary below.
          </p>
        </div>
      </div>

      {/* Summary stats */}
      {liveData && (
        <RunnerStatsBar
          totalTracking={liveData.stats.total_tracking}
          onCourse={liveData.stats.on_course}
          finished={liveData.stats.finished}
          avgPace={liveData.stats.avg_pace}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Final incidents report */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Incident Summary</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {liveData?.active_incidents && liveData.active_incidents.length > 0 ? (
              <div className="space-y-2">
                {liveData.active_incidents.map((incident) => (
                  <div key={incident.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{incident.title}</span>
                      <Badge
                        variant={
                          incident.status === 'resolved' ? 'default' : 'destructive'
                        }
                        className="text-[10px]"
                      >
                        {incident.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {incident.type} - {incident.severity}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No incidents reported during the race.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Next steps */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Next Steps</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <Link href={`/events/marathon/${eventId}/results`}>
              <Button variant="outline" className="w-full justify-between">
                Import & Publish Results
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href={`/events/marathon/${eventId}/registrations`}>
              <Button variant="outline" className="w-full justify-between mt-2">
                View Registrations
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function MarathonLiveOpsPage() {
  const params = useParams();
  const eventId = params.id as string;

  const { data: event, isLoading: eventLoading } = useMarathonEvent(eventId);

  if (eventLoading) {
    return (
      <ContentLayout title="Live Ops">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  const status = event?.status ?? 'draft';
  const isPreRace = status === 'execution' || status === 'preparation';
  const isLive = status === 'live';
  const isPostRace = status === 'post_event' || status === 'archived';

  // Extract race start time from event config if available
  const raceStartedAt =
    (event?.config as Record<string, unknown>)?.race_started_at as string | undefined;

  return (
    <ContentLayout title={`${event?.name ?? 'Event'} - Live Ops`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          {
            label: event?.name ?? '...',
            href: `/events/marathon/${eventId}/settings`,
          },
          { label: 'Live Ops' },
        ]}
      />

      <div className="space-y-4 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1 flex items-center gap-3">
              <Radio className="h-5 w-5" />
              Live Ops Command Center
            </h1>
            <p className="text-sm text-muted-foreground">
              Race day operations for {event?.name ?? 'this event'}.
            </p>
          </div>
          <Badge
            variant={isLive ? 'destructive' : isPostRace ? 'default' : 'secondary'}
            className="text-sm px-3 py-1"
          >
            {isLive
              ? 'LIVE'
              : isPostRace
                ? 'COMPLETED'
                : status.toUpperCase().replace('_', ' ')}
          </Badge>
        </div>

        {/* Render state-specific view */}
        {isPreRace && (
          <PreRaceView eventId={eventId} eventName={event?.name ?? ''} />
        )}

        {isLive && (
          <LiveView
            eventId={eventId}
            eventName={event?.name ?? ''}
            raceStartedAt={raceStartedAt}
          />
        )}

        {isPostRace && <PostRaceView eventId={eventId} />}

        {/* Fallback for other statuses */}
        {!isPreRace && !isLive && !isPostRace && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                The Live Ops Command Center is available during the
                Execution, Live, and Post-Event phases.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Current status: <Badge variant="outline">{status}</Badge>
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
