'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useRunnerDetail } from '@/hooks/events/marathon/use-marathon-live-ops';
import { Loader2, MapPin, Timer, Footprints, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

interface LiveRunnerDetailProps {
  eventId: string;
  bib: string | null;
  onClose: () => void;
}

function formatElapsed(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatPace(paceSeconds: number): string {
  if (!paceSeconds || paceSeconds <= 0) return '--:--';
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.round(paceSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function LiveRunnerDetail({ eventId, bib, onClose }: LiveRunnerDetailProps) {
  const { data, isLoading } = useRunnerDetail(eventId, bib ?? '');

  return (
    <Sheet open={!!bib} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono">BIB {bib}</span>
          </SheetTitle>
          <SheetDescription>Runner details and checkpoint history</SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && data && (
          <div className="space-y-6 mt-6">
            {/* Registration info */}
            {data.registration && (
              <Card>
                <CardContent className="pt-4 pb-3">
                  <h3 className="text-sm font-medium mb-2">Registration</h3>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name</span>
                      <span className="font-medium">{data.registration.participant_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phone</span>
                      <span>{data.registration.participant_phone ?? '-'}</span>
                    </div>
                    {data.registration.category && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Category</span>
                        <Badge variant="outline" className="text-xs">
                          {data.registration.category.code ?? data.registration.category.name}
                        </Badge>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Institution</span>
                      <span className="text-right max-w-[180px] truncate">
                        {data.registration.institution_name ?? 'External'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant="secondary" className="text-xs">
                        {data.registration.status}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Current position */}
            {data.position ? (
              <Card>
                <CardContent className="pt-4 pb-3">
                  <h3 className="text-sm font-medium mb-3">Current Position</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <Footprints className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-lg font-bold">
                        {data.position.distance_km.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">km covered</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <Timer className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-lg font-bold font-mono">
                        {formatPace(data.position.pace_per_km)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">pace /km</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <Timer className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-lg font-bold font-mono">
                        {formatElapsed(data.position.elapsed_seconds)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">elapsed</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <MapPin className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-xs font-mono">
                        {data.position.lat.toFixed(4)}, {data.position.lng.toFixed(4)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">coordinates</div>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2 text-right">
                    Last update: {format(new Date(data.position.updated_at), 'HH:mm:ss')}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-4 pb-3 text-center text-muted-foreground text-sm">
                  No GPS data available for this runner
                </CardContent>
              </Card>
            )}

            {/* Checkpoint history */}
            <Card>
              <CardContent className="pt-4 pb-3">
                <h3 className="text-sm font-medium mb-3">Checkpoint History</h3>
                {data.checkpoints.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No checkpoints scanned yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.checkpoints.map((scan) => (
                      <div
                        key={scan.id}
                        className="flex items-center gap-3 border-l-2 border-green-500 pl-3 py-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {scan.checkpoint?.name ?? 'Checkpoint'}
                          </p>
                          {scan.checkpoint && (
                            <p className="text-[10px] text-muted-foreground">
                              {scan.checkpoint.type} - {scan.checkpoint.distance_from_start_km?.toFixed(1) ?? '?'} km
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground font-mono shrink-0">
                          {format(new Date(scan.scanned_at), 'HH:mm:ss')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {!isLoading && !data && (
          <div className="text-center py-12 text-muted-foreground">
            No data found for this runner.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
