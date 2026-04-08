'use client';

// components/admission/analytics/time-to-convert-card.tsx
// Shows how long each admission funnel stage transition takes.
// Color-coded: green (<24h), yellow (1–3 days), red (>3 days).
// Highlights the slowest transition as a bottleneck.

import { Clock, AlertTriangle, TrendingUp, ArrowRight, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useTimeToConvert,
  formatHours,
  getSpeedColor,
  formatStageName,
} from '@/hooks/admission/use-time-to-convert';
import type { StageTransition } from '@/hooks/admission/use-time-to-convert';

// ── Color config ──────────────────────────────────────────────────────────────

const COLOR_CONFIG = {
  green: {
    badge: 'bg-green-50 text-green-700 border-green-200',
    bar: 'bg-green-400',
    label: 'Fast',
  },
  yellow: {
    badge: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    bar: 'bg-yellow-400',
    label: 'Moderate',
  },
  red: {
    badge: 'bg-red-50 text-red-700 border-red-200',
    bar: 'bg-red-400',
    label: 'Slow',
  },
} as const;

// ── Sub-components ────────────────────────────────────────────────────────────

function StageRow({
  stage,
  maxHours,
  isBottleneck,
}: {
  stage: StageTransition;
  maxHours: number;
  isBottleneck: boolean;
}) {
  const color = getSpeedColor(stage.avg_hours);
  const config = COLOR_CONFIG[color];
  const barWidth = maxHours > 0 ? (stage.avg_hours / maxHours) * 100 : 0;

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 p-3 rounded-lg border transition-colors',
        isBottleneck
          ? 'bg-red-50/60 border-red-200'
          : 'bg-muted/30 border-border/50'
      )}
    >
      {/* Stage label row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm font-medium min-w-0">
          <span className="truncate text-muted-foreground">
            {formatStageName(stage.from)}
          </span>
          <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <span className="truncate">{formatStageName(stage.to)}</span>
          {isBottleneck && (
            <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
          )}
        </div>

        {/* Time badges */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            {stage.count} lead{stage.count !== 1 ? 's' : ''}
          </span>
          <Badge
            variant="outline"
            className={cn('text-xs font-semibold', config.badge)}
          >
            <Clock className="h-3 w-3 mr-1" />
            avg {formatHours(stage.avg_hours)}
          </Badge>
        </div>
      </div>

      {/* Progress bar (avg) */}
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', config.bar)}
          style={{ width: `${Math.max(barWidth, 2)}%` }}
        />
      </div>

      {/* Median row */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className={cn('font-medium', config.badge.split(' ')[1])}>
          {config.label}
        </span>
        <span>median {formatHours(stage.median_hours)}</span>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
      <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">
        No stage transition data yet.
      </p>
      <p className="text-xs text-muted-foreground/70">
        Data appears once leads start moving through the funnel.
      </p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface TimeToConvertCardProps {
  institutionId?: string;
  className?: string;
}

export function TimeToConvertCard({
  institutionId,
  className,
}: TimeToConvertCardProps) {
  const { stages, bottleneck, isLoading, error, refetch } =
    useTimeToConvert(institutionId);

  // Find max avg_hours for bar scaling
  const maxHours = stages.reduce(
    (max, s) => Math.max(max, s.avg_hours),
    0
  );

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Time to Convert</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => refetch()}
            disabled={isLoading}
            aria-label="Refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>

        {/* Bottleneck summary */}
        {bottleneck && (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-2.5">
            <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">
              <span className="font-semibold">Bottleneck detected: </span>
              {formatStageName(bottleneck.from)} → {formatStageName(bottleneck.to)} takes an
              average of{' '}
              <span className="font-semibold">{formatHours(bottleneck.avg_hours)}</span>
              {' '}across {bottleneck.count} leads.
            </p>
          </div>
        )}

        {/* Legend */}
        {!isLoading && stages.length > 0 && (
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
              &lt;24h
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" />
              1–3 days
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
              &gt;3 days
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="py-6 text-center">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load data'}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => refetch()}
            >
              Retry
            </Button>
          </div>
        ) : stages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {stages.map((stage) => (
              <StageRow
                key={`${stage.from}__${stage.to}`}
                stage={stage}
                maxHours={maxHours}
                isBottleneck={
                  bottleneck !== null &&
                  stage.from === bottleneck.from &&
                  stage.to === bottleneck.to
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
