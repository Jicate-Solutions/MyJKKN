'use client';

/**
 * Quadrant Card — container for 1 of 4 quadrants.
 *
 * - Per decision #19: partial-failure per quadrant. If `quadrant.error` is set,
 *   render an error tile with a retry hint but keep the other 3 quadrants alive.
 * - Per decision #24: skeleton variant shows 2x2 KPI skeletons during load.
 * - For id='trend', renders a small SVG line chart with null-gap handling
 *   (decision #20 — pre-Sprint-3 months show as "—" on the chart).
 */

import { AlertCircle, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KPICard, KPICardSkeleton } from './kpi-card';
import type { Quadrant } from '@/types/hr-dashboard';

export function QuadrantCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="h-5 w-32 rounded bg-muted animate-pulse" />
      </CardHeader>
      <CardContent className="grid gap-3 grid-cols-2">
        <KPICardSkeleton />
        <KPICardSkeleton />
        <KPICardSkeleton />
        <KPICardSkeleton />
      </CardContent>
    </Card>
  );
}

export function QuadrantCard({ quadrant }: { quadrant: Quadrant }) {
  if (quadrant.error) {
    return (
      <Card className="h-full border-red-200 bg-red-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-red-700">
            <AlertCircle className="h-4 w-4" />
            {quadrant.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-red-700">Could not load this quadrant.</p>
          <p className="text-xs text-red-600/80 font-mono break-all">{quadrant.error}</p>
          <p className="text-xs text-muted-foreground pt-2">
            Other quadrants are unaffected. Auto-retry in 2s — if this persists, click
            Refresh at the top of the page.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{quadrant.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {quadrant.kpis.map((kpi) => (
            <KPICard key={kpi.name} kpi={kpi} />
          ))}
        </div>
        {quadrant.trend_series && <TrendSpark points={quadrant.trend_series} />}
      </CardContent>
    </Card>
  );
}

// =====================================================================================
// Mini trend chart — 12-month rolling spark with null-gap support (decision #20)
// =====================================================================================

function TrendSpark({
  points,
}: {
  points: Array<{ month: string; value: number | null }>;
}) {
  const width = 280;
  const height = 56;
  const padding = 4;

  const nums = points.map((p) => p.value).filter((v): v is number => v !== null);
  const max = nums.length ? Math.max(...nums) : 1;
  const min = nums.length ? Math.min(...nums) : 0;
  const span = Math.max(1, max - min);

  const step = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

  // Build a path that breaks on nulls (pre-Sprint-3 gap)
  let d = '';
  let inPath = false;
  points.forEach((p, i) => {
    const x = padding + i * step;
    if (p.value === null) {
      inPath = false;
      return;
    }
    const y = padding + (height - padding * 2) * (1 - (p.value - min) / span);
    d += inPath ? ` L ${x} ${y}` : `M ${x} ${y}`;
    inPath = true;
  });

  const nullCount = points.filter((p) => p.value === null).length;

  return (
    <div className="pt-1">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
        <TrendingUp className="h-3 w-3" />
        <span>12-month trend</span>
        {nullCount > 0 && (
          <span className="ml-auto text-[10px] italic">
            {nullCount} mo pre-history
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full h-14 text-primary/80"
        aria-label="12-month trend"
        role="img"
      >
        {/* Null-gap markers: a light dashed vertical rule wherever value === null */}
        {points.map((p, i) =>
          p.value === null ? (
            <line
              key={`gap-${i}`}
              x1={padding + i * step}
              x2={padding + i * step}
              y1={padding}
              y2={height - padding}
              stroke="currentColor"
              strokeDasharray="2 2"
              strokeWidth={0.6}
              opacity={0.2}
            />
          ) : null
        )}
        <path d={d} fill="none" stroke="currentColor" strokeWidth={1.6} />
        {/* Terminal dots on non-null points */}
        {points.map((p, i) =>
          p.value === null ? null : (
            <circle
              key={`pt-${i}`}
              cx={padding + i * step}
              cy={padding + (height - padding * 2) * (1 - (p.value - min) / span)}
              r={1.6}
              fill="currentColor"
            />
          )
        )}
      </svg>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{points[0]?.month}</span>
        <span>{points[points.length - 1]?.month}</span>
      </div>
    </div>
  );
}
