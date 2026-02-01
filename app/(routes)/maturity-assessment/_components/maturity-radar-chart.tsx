'use client';

import { useMemo } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MaturityDimensionName, MaturityStage } from '@/types/maturity-assessment';
import { MATURITY_DIMENSIONS } from '@/types/maturity-assessment';

interface RadarDataPoint {
  dimension: string;
  current: number;
  previous?: number;
  target?: number;
  fullMark: number;
}

interface MaturityRadarChartProps {
  dimensionScores: Record<MaturityDimensionName, MaturityStage>;
  previousScores?: Record<MaturityDimensionName, MaturityStage>;
  targetStage?: MaturityStage | null;
  title?: string;
  showLegend?: boolean;
  className?: string;
}

export function MaturityRadarChart({
  dimensionScores,
  previousScores,
  targetStage,
  title = 'Maturity Assessment',
  showLegend = true,
  className
}: MaturityRadarChartProps) {
  const data: RadarDataPoint[] = useMemo(() => {
    return MATURITY_DIMENSIONS.map((dimension) => ({
      dimension,
      current: dimensionScores[dimension] || 1,
      previous: previousScores?.[dimension],
      target: targetStage || undefined,
      fullMark: 4
    }));
  }, [dimensionScores, previousScores, targetStage]);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} cx="50%" cy="50%" outerRadius="80%">
              <PolarGrid strokeDasharray="3 3" />
              <PolarAngleAxis
                dataKey="dimension"
                tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
                tickLine={false}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 4]}
                tickCount={5}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              />

              {/* Target line (if provided) */}
              {targetStage && (
                <Radar
                  name="Target"
                  dataKey="target"
                  stroke="hsl(var(--muted-foreground))"
                  fill="transparent"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                />
              )}

              {/* Previous assessment (if provided) */}
              {previousScores && (
                <Radar
                  name="Previous"
                  dataKey="previous"
                  stroke="hsl(var(--muted-foreground))"
                  fill="hsl(var(--muted))"
                  fillOpacity={0.3}
                  strokeWidth={1}
                />
              )}

              {/* Current assessment */}
              <Radar
                name="Current"
                dataKey="current"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.4}
                strokeWidth={2}
              />

              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload as RadarDataPoint;
                  return (
                    <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                      <p className="font-semibold mb-1">{data.dimension}</p>
                      <p>Current: Stage {data.current}</p>
                      {data.previous && <p>Previous: Stage {data.previous}</p>}
                      {data.target && <p>Target: Stage {data.target}</p>}
                    </div>
                  );
                }}
              />

              {showLegend && <Legend />}
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

interface SimplifiedRadarProps {
  dimensionScores: Record<MaturityDimensionName, MaturityStage>;
  size?: number;
}

export function SimplifiedRadar({
  dimensionScores,
  size = 200
}: SimplifiedRadarProps) {
  const data = useMemo(() => {
    return MATURITY_DIMENSIONS.map((dimension) => ({
      dimension: dimension.substring(0, 3), // Abbreviate
      score: dimensionScores[dimension] || 1,
      fullMark: 4
    }));
  }, [dimensionScores]);

  return (
    <div style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="80%">
          <PolarGrid strokeDasharray="3 3" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }}
          />
          <Radar
            dataKey="score"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary))"
            fillOpacity={0.4}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
