'use client';

// app/(routes)/events/marathon/[id]/analytics/_components/race-replay.tsx
// Race replay placeholder — animated GPS trace visualization.
// Created: 2026-04-07

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, MapPin, Loader2 } from 'lucide-react';
import { useRaceReplayData } from '@/hooks/events/marathon/use-marathon-analytics';

// ============================================================================
// Component
// ============================================================================

interface RaceReplayProps {
  eventId: string;
}

export function RaceReplay({ eventId }: RaceReplayProps) {
  const [loadRequested, setLoadRequested] = useState(false);
  const { data, isLoading } = useRaceReplayData(eventId, loadRequested);

  const totalRunners = data?.length ?? 0;
  const totalPoints = data?.reduce((sum, r) => sum + r.points.length, 0) ?? 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold">Race Replay</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Animated GPS trace replay of all race participants
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 flex flex-col items-center justify-center gap-4 py-14 px-6 text-center">
          {/* Icon */}
          <div className="rounded-full bg-primary/10 p-4">
            <Play className="h-8 w-8 text-primary" />
          </div>

          {/* Status message */}
          <div>
            <p className="font-medium text-base">Race Replay Visualization Coming Soon</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              An animated GPS trace showing every runner's journey from start to finish will be
              available here after the race.
            </p>
          </div>

          {/* GPS data summary if available */}
          {!loadRequested && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLoadRequested(true)}
              className="mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Loading GPS data...
                </>
              ) : (
                <>
                  <MapPin className="h-3.5 w-3.5 mr-1.5" />
                  Check GPS Data Availability
                </>
              )}
            </Button>
          )}

          {loadRequested && !isLoading && (
            <div className="mt-2 rounded-md bg-background border px-4 py-3 text-sm">
              {totalRunners > 0 ? (
                <div className="flex items-center gap-3 text-green-600 dark:text-green-400">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-semibold">{totalRunners} runners</span> tracked with{' '}
                    <span className="font-semibold">{totalPoints.toLocaleString('en-IN')}</span> GPS
                    points recorded
                  </span>
                </div>
              ) : (
                <p className="text-muted-foreground">No GPS track data recorded for this event.</p>
              )}
            </div>
          )}

          {loadRequested && isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading GPS track data...
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
