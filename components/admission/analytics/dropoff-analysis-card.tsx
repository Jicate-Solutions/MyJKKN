'use client';

// components/admission/analytics/dropoff-analysis-card.tsx
// Visualises WHERE prospects drop off in the admission funnel.
// Shows a vertical funnel with progressively narrowing bars, percentages,
// drop-off rates, and highlights the biggest bottleneck in red.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingDown, Users, AlertTriangle, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDropoffAnalysis } from '@/hooks/admission/use-dropoff-analysis';
import type { DropoffStage } from '@/hooks/admission/use-dropoff-analysis';

// ────────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────────

interface DropoffAnalysisCardProps {
  institutionId?: string;
  className?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Colour helpers — green at top, red at bottom
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns a Tailwind background class that blends from green → amber → red
 * based on how far down the funnel (0 = top/green, 1 = bottom/red).
 */
function getBarColor(position: number, isBiggestBottleneck: boolean): string {
  if (isBiggestBottleneck) return 'bg-red-500';
  if (position < 0.25) return 'bg-emerald-500';
  if (position < 0.5) return 'bg-green-400';
  if (position < 0.7) return 'bg-amber-400';
  if (position < 0.85) return 'bg-orange-400';
  return 'bg-red-400';
}

function getTextColor(position: number, isBiggestBottleneck: boolean): string {
  if (isBiggestBottleneck) return 'text-red-700';
  if (position < 0.5) return 'text-emerald-700';
  if (position < 0.7) return 'text-amber-700';
  return 'text-orange-700';
}

// ────────────────────────────────────────────────────────────────────────────
// Skeleton loading state
// ────────────────────────────────────────────────────────────────────────────

function DropoffSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[100, 85, 70, 55, 40, 30, 20, 14, 10].map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-28 flex-shrink-0" />
              <Skeleton className={`h-8 rounded`} style={{ width: `${w}%` }} />
              <Skeleton className="h-4 w-12 flex-shrink-0" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Single funnel stage row
// ────────────────────────────────────────────────────────────────────────────

interface StageRowProps {
  stage: DropoffStage;
  position: number;           // 0..1 (how far down the funnel)
  isBiggestBottleneck: boolean;
  isFirst: boolean;
}

function StageRow({ stage, position, isBiggestBottleneck, isFirst }: StageRowProps) {
  const barColor = getBarColor(position, isBiggestBottleneck);
  const textColor = getTextColor(position, isBiggestBottleneck);

  return (
    <div className="group">
      {/* Connector chevron between stages */}
      {!isFirst && (
        <div className="flex justify-center my-0.5">
          <div className="w-0 h-0
            border-l-[8px] border-l-transparent
            border-r-[8px] border-r-transparent
            border-t-[6px] border-t-muted-foreground/20"
          />
        </div>
      )}

      <div
        className={cn(
          'flex items-center gap-3 px-2 py-1.5 rounded-lg transition-colors',
          isBiggestBottleneck && 'bg-red-50 border border-red-200',
          !isBiggestBottleneck && 'hover:bg-muted/40',
        )}
      >
        {/* Stage label — fixed width */}
        <div className="w-36 flex-shrink-0">
          <p className={cn(
            'text-xs font-medium leading-tight',
            isBiggestBottleneck ? 'text-red-700' : 'text-foreground',
          )}>
            {stage.label}
          </p>
          {isBiggestBottleneck && (
            <Badge
              variant="outline"
              className="text-[10px] px-1 py-0 mt-0.5 border-red-300 text-red-600 bg-red-50"
            >
              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
              Biggest bottleneck
            </Badge>
          )}
        </div>

        {/* Bar — width proportional to pct */}
        <div className="flex-1 min-w-0">
          <div
            className={cn('h-7 rounded transition-all duration-300', barColor)}
            style={{ width: `${Math.max(stage.pct, 2)}%` }}
          />
        </div>

        {/* Count + pct */}
        <div className="w-24 flex-shrink-0 text-right">
          <p className="text-sm font-semibold text-foreground">
            {stage.count.toLocaleString()}
          </p>
          <p className={cn('text-[10px] font-medium', textColor)}>
            {stage.pct}% of total
          </p>
        </div>

        {/* Drop-off badge */}
        <div className="w-20 flex-shrink-0 text-right">
          {stage.dropoff !== null ? (
            <div className={cn(
              'inline-flex items-center gap-0.5 text-[11px] font-medium',
              stage.dropoff > 30 ? 'text-red-600' :
              stage.dropoff > 15 ? 'text-amber-600' :
              'text-muted-foreground',
            )}>
              <TrendingDown className="h-3 w-3" />
              -{stage.dropoff}%
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main card
// ────────────────────────────────────────────────────────────────────────────

export function DropoffAnalysisCard({ institutionId, className }: DropoffAnalysisCardProps) {
  const { stages, totalActive, biggestBottleneckStage, isLoading, error } =
    useDropoffAnalysis(institutionId);

  if (isLoading) return <DropoffSkeleton />;

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-400" />
          <p className="text-sm">Failed to load drop-off data</p>
          <p className="text-xs mt-1">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  if (stages.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-5 w-5 text-blue-500" />
            Drop-off Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p>No funnel data available yet</p>
          <p className="text-sm mt-1">Add leads to see where prospects drop off</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-5 w-5 text-blue-500" />
            Drop-off Analysis
          </CardTitle>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-shrink-0">
            <Users className="h-4 w-4" />
            <span className="font-medium text-foreground">
              {totalActive.toLocaleString()}
            </span>
            <span>active leads</span>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-3 px-2 mt-3 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          <div className="w-36 flex-shrink-0">Stage</div>
          <div className="flex-1" />
          <div className="w-24 flex-shrink-0 text-right">Count</div>
          <div className="w-20 flex-shrink-0 text-right">Drop-off</div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div>
          {stages.map((stage, i) => (
            <StageRow
              key={stage.stage}
              stage={stage}
              position={i / Math.max(stages.length - 1, 1)}
              isBiggestBottleneck={stage.stage === biggestBottleneckStage}
              isFirst={i === 0}
            />
          ))}
        </div>

        {/* Footer legend */}
        <div className="mt-4 pt-3 border-t flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            Strong conversion
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />
            Moderate drop-off
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" />
            Biggest bottleneck
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
