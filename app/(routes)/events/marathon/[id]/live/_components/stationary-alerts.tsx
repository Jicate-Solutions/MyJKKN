'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCreateIncident } from '@/hooks/events/marathon/use-marathon-live-ops';
import { AlertCircle, Ambulance } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { MarathonRaceTrack } from '@/types/events-marathon';

interface StationaryAlertsProps {
  eventId: string;
  alerts: MarathonRaceTrack[];
}

export function StationaryAlerts({ eventId, alerts }: StationaryAlertsProps) {
  const createIncident = useCreateIncident();

  const handleSendHelp = (runner: MarathonRaceTrack) => {
    createIncident.mutate({
      event_id: eventId,
      type: 'medical',
      severity: 'high',
      title: `Stationary runner - BIB ${runner.bib}`,
      description: `Runner BIB ${runner.bib} has not sent a GPS update since ${new Date(runner.updated_at).toLocaleTimeString()}. Last known position: ${runner.lat.toFixed(5)}, ${runner.lng.toFixed(5)} at ${runner.distance_km.toFixed(2)} km.`,
      location: `Lat: ${runner.lat.toFixed(5)}, Lng: ${runner.lng.toFixed(5)}`,
      lat: runner.lat,
      lng: runner.lng,
      bib_number: runner.bib,
    });
  };

  return (
    <Card className="h-full border-red-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-500" />
          Stationary Alerts
          {alerts.length > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {alerts.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2 overflow-auto max-h-[400px]">
          {alerts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No stationary alerts - all runners are moving
            </p>
          )}
          {alerts.map((runner) => (
            <div
              key={runner.id}
              className="border border-red-200 bg-red-50/50 rounded-lg p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm text-red-700">
                    BIB {runner.bib}
                  </span>
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    No GPS update
                  </Badge>
                </div>
                <span className="text-[10px] text-red-600 font-medium">
                  {formatDistanceToNow(new Date(runner.updated_at), { addSuffix: true })}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Last pos: {runner.lat.toFixed(5)}, {runner.lng.toFixed(5)}
                </span>
                <span>{runner.distance_km.toFixed(2)} km</span>
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="w-full h-7 text-xs gap-1.5"
                onClick={() => handleSendHelp(runner)}
                disabled={createIncident.isPending}
              >
                <Ambulance className="h-3 w-3" />
                Send Help
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
