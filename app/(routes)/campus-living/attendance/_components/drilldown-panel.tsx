'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, Treemap } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { treeFor, type CubeFilter, type TreeNode } from '@/lib/campus-living/attendance-cube';
import type { AttendanceBreakdown } from '@/types/campus-living/attendance-analytics';
import { formatPct, useVizPalette, type VizPalette } from './palette';

/**
 * Drill-down map: institution → department → block. Area = counted marks (how much
 * evidence), colour = rate. Click any box to filter the whole page to it.
 */
export function DrilldownPanel({
  data,
  filter,
  isLoading,
  onPick,
}: {
  data: AttendanceBreakdown | undefined;
  filter: CubeFilter;
  isLoading: boolean;
  onPick: (f: CubeFilter) => void;
}) {
  const viz = useVizPalette();
  const tree = useMemo(() => (data ? treeFor(data, filter) : []), [data, filter]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Where the attendance is — drill down</CardTitle>
        <CardDescription>
          Institution → department → block. Box size = counted marks, colour = rate. Click a box to filter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full sm:h-[380px]" />
        ) : tree.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Nothing marked for this selection.</p>
        ) : (
          <div className="h-[300px] w-full sm:h-[380px]" role="img" aria-label="Attendance drill-down map">
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={tree as unknown as Array<Record<string, unknown>>}
                dataKey="size"
                nameKey="name"
                isAnimationActive={false}
                content={<Node onPick={onPick} viz={viz} />}
              />
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface NodeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  depth?: number;
  name?: string;
  pct?: number | null;
  level?: TreeNode['level'];
  trail?: string;
  filter?: CubeFilter;
  onPick: (f: CubeFilter) => void;
  viz: VizPalette;
}

function Node({ x = 0, y = 0, width = 0, height = 0, depth = 0, name, pct = null, level, trail, filter, onPick, viz }: NodeProps) {
  // depth 0 is the invisible root. Only the leaf (block) boxes are filled and
  // labelled: a parent's label would be painted over by its own children, so each
  // leaf names its path (institution › department) instead, and parents are drawn
  // as thicker outlines that group the leaves.
  if (depth === 0 || width < 2 || height < 2) return null;
  const isLeaf = level === 'block';
  const showLabel = isLeaf && width > 60 && height > 26;
  const showTrail = isLeaf && width > 90 && height > 58 && !!trail;
  const showRate = isLeaf && width > 60 && height > 42;
  const ink = viz.inkOn(pct);
  return (
    <g
      onClick={() => filter && onPick(filter)}
      style={{ cursor: filter ? 'pointer' : 'default' }}
      role="button"
      aria-label={`${name}: ${formatPct(pct)}`}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={isLeaf ? viz.rateFill(pct) : 'transparent'}
        stroke="hsl(var(--background))"
        strokeWidth={level === 'institution' ? 4 : level === 'department' ? 2.5 : 1}
      />
      {showLabel && (
        <text
          x={x + 6}
          y={y + 14}
          fontSize={12}
          fontWeight={600}
          fill={ink}
          style={{ pointerEvents: 'none' }}
        >
          {name && name.length > Math.floor(width / 6.5) ? `${name.slice(0, Math.max(3, Math.floor(width / 6.5) - 1))}…` : name}
        </text>
      )}
      {showRate && (
        <text x={x + 6} y={y + 30} fontSize={11} fill={ink} style={{ pointerEvents: 'none' }}>
          {formatPct(pct)}
        </text>
      )}
      {showTrail && (
        <text x={x + 6} y={y + 46} fontSize={10} fill={ink} fillOpacity={0.85} style={{ pointerEvents: 'none' }}>
          {trail && trail.length > Math.floor(width / 5.6) ? `${trail.slice(0, Math.max(3, Math.floor(width / 5.6) - 1))}…` : trail}
        </text>
      )}
    </g>
  );
}
