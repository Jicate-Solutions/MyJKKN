'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Milestone } from 'lucide-react';
import type { CheckpointThroughput } from '@/lib/services/events/marathon/marathon-live-ops-service';

interface CheckpointPanelProps {
  checkpoints: CheckpointThroughput[];
  totalRunners: number;
}

const TYPE_COLORS: Record<string, string> = {
  start: 'bg-green-100 text-green-700',
  finish: 'bg-purple-100 text-purple-700',
  water: 'bg-blue-100 text-blue-700',
  medical: 'bg-red-100 text-red-700',
  waypoint: 'bg-gray-100 text-gray-700',
  km_marker: 'bg-yellow-100 text-yellow-700',
};

export function CheckpointPanel({ checkpoints, totalRunners }: CheckpointPanelProps) {
  const maxScans = Math.max(...checkpoints.map((c) => c.scan_count), 1);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Milestone className="h-4 w-4" />
          Checkpoint Throughput
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3 overflow-auto max-h-[400px]">
          {checkpoints.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No checkpoints configured
            </p>
          )}
          {checkpoints.map((cp) => {
            const pct = totalRunners > 0
              ? Math.round((cp.scan_count / totalRunners) * 100)
              : 0;

            return (
              <div key={cp.checkpoint_id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate max-w-[140px]">
                      {cp.checkpoint_name}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] px-1.5 py-0 ${TYPE_COLORS[cp.checkpoint_type] ?? ''}`}
                    >
                      {cp.checkpoint_type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {cp.distance_km.toFixed(1)} km
                    </span>
                    <span className="text-sm font-mono font-medium">
                      {cp.scan_count}
                    </span>
                  </div>
                </div>
                <Progress value={pct} className="h-2" />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
