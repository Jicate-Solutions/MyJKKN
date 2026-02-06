'use client';

// ============================================================================
// Fink's Radar Chart Component
// Visualization showing learner's profile across 6 dimensions of significant learning
// ============================================================================

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
import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { FinksDimensions } from '@/types/competency';

// ============================================================================
// TYPES
// ============================================================================

interface RadarDataPoint {
  dimension: string;
  shortLabel: string;
  current: number;
  previous?: number;
  target?: number;
  isAiProof: boolean;
  fullMark: number;
}

interface FinksRadarChartProps {
  currentDimensions: FinksDimensions;
  previousDimensions?: FinksDimensions;
  targetDimensions?: FinksDimensions;
  title?: string;
  description?: string;
  showLegend?: boolean;
  showComparison?: boolean;
  highlightAiProof?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DIMENSION_CONFIG = [
  {
    key: 'foundational_knowledge' as keyof FinksDimensions,
    label: 'Foundational Knowledge',
    shortLabel: 'Knowledge',
    isAiProof: false,
    color: '#64748b' // slate-500
  },
  {
    key: 'application' as keyof FinksDimensions,
    label: 'Application',
    shortLabel: 'Application',
    isAiProof: false,
    color: '#3b82f6' // blue-500
  },
  {
    key: 'integration' as keyof FinksDimensions,
    label: 'Integration',
    shortLabel: 'Integration',
    isAiProof: false,
    color: '#a855f7' // purple-500
  },
  {
    key: 'human_dimension' as keyof FinksDimensions,
    label: 'Human Dimension',
    shortLabel: 'Human',
    isAiProof: true,
    color: '#10b981' // emerald-500
  },
  {
    key: 'caring' as keyof FinksDimensions,
    label: 'Caring',
    shortLabel: 'Caring',
    isAiProof: true,
    color: '#f43f5e' // rose-500
  },
  {
    key: 'learning_to_learn' as keyof FinksDimensions,
    label: 'Learning How to Learn',
    shortLabel: 'Meta-Learn',
    isAiProof: true,
    color: '#f59e0b' // amber-500
  }
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FinksRadarChart({
  currentDimensions,
  previousDimensions,
  targetDimensions,
  title = "Fink's Taxonomy Profile",
  description = 'Significant learning dimensions - measuring human differentiation in the AI era',
  showLegend = true,
  showComparison = true,
  highlightAiProof = true,
  className,
  size = 'md'
}: FinksRadarChartProps) {
  // Prepare data for the chart
  const data: RadarDataPoint[] = useMemo(() => {
    return DIMENSION_CONFIG.map((config) => ({
      dimension: config.label,
      shortLabel: config.shortLabel,
      current: currentDimensions[config.key],
      previous: previousDimensions?.[config.key],
      target: targetDimensions?.[config.key],
      isAiProof: config.isAiProof,
      fullMark: 10
    }));
  }, [currentDimensions, previousDimensions, targetDimensions]);

  // Calculate average scores
  const currentAvg = useMemo(() => {
    const values = Object.values(currentDimensions);
    return Math.round(values.reduce((sum, val) => sum + val, 0) / values.length);
  }, [currentDimensions]);

  const aiProofAvg = useMemo(() => {
    const aiProofKeys: (keyof FinksDimensions)[] = [
      'human_dimension',
      'caring',
      'learning_to_learn'
    ];
    const values = aiProofKeys.map(key => currentDimensions[key]);
    return Math.round(values.reduce((sum, val) => sum + val, 0) / values.length);
  }, [currentDimensions]);

  // Determine chart height based on size
  const chartHeight = {
    sm: 250,
    md: 350,
    lg: 450
  }[size];

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              {title}
              {highlightAiProof && (
                <Badge variant="default" className="text-xs gap-1">
                  <Sparkles className="h-3 w-3" />
                  AI-Era Framework
                </Badge>
              )}
            </CardTitle>
            {description && (
              <CardDescription className="mt-1">{description}</CardDescription>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">{currentAvg}</div>
            <div className="text-xs text-muted-foreground">Overall</div>
            {highlightAiProof && (
              <>
                <div className="text-lg font-semibold text-emerald-600 mt-1">{aiProofAvg}</div>
                <div className="text-xs text-muted-foreground">AI-Proof Avg</div>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: chartHeight }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
              <PolarGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />

              {/* Axis labels */}
              <PolarAngleAxis
                dataKey="shortLabel"
                tick={({ payload, x, y, cx, cy, ...rest }) => {
                  const config = DIMENSION_CONFIG.find(d => d.shortLabel === payload.value);
                  const isAiProof = config?.isAiProof && highlightAiProof;

                  return (
                    <g>
                      <text
                        {...rest}
                        x={x}
                        y={y}
                        fill={isAiProof ? 'hsl(var(--primary))' : 'hsl(var(--foreground))'}
                        fontSize={12}
                        fontWeight={isAiProof ? 600 : 400}
                        textAnchor={x > cx ? 'start' : x < cx ? 'end' : 'middle'}
                        dominantBaseline="middle"
                      >
                        {payload.value}
                      </text>
                      {isAiProof && (
                        <circle
                          cx={x > cx ? x - 8 : x < cx ? x + 8 : x}
                          cy={y}
                          r={3}
                          fill="hsl(var(--primary))"
                        />
                      )}
                    </g>
                  );
                }}
                tickLine={false}
              />

              {/* Radial axis */}
              <PolarRadiusAxis
                angle={30}
                domain={[0, 10]}
                tickCount={6}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
              />

              {/* Target line (if provided) */}
              {targetDimensions && showComparison && (
                <Radar
                  name="Target"
                  dataKey="target"
                  stroke="hsl(var(--muted-foreground))"
                  fill="transparent"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  dot={false}
                />
              )}

              {/* Previous assessment (if provided) */}
              {previousDimensions && showComparison && (
                <Radar
                  name="Previous"
                  dataKey="previous"
                  stroke="hsl(var(--muted-foreground))"
                  fill="hsl(var(--muted))"
                  fillOpacity={0.2}
                  strokeWidth={1}
                  dot={false}
                />
              )}

              {/* Current assessment - main focus */}
              <Radar
                name="Current"
                dataKey="current"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.3}
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', r: 4 }}
              />

              {/* Tooltip */}
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload as RadarDataPoint;
                  return (
                    <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                      <p className="font-semibold mb-1 flex items-center gap-1">
                        {data.dimension}
                        {data.isAiProof && highlightAiProof && (
                          <Badge variant="default" className="text-xs gap-1">
                            <Sparkles className="h-2 w-2" />
                            AI-Proof
                          </Badge>
                        )}
                      </p>
                      <div className="space-y-1">
                        <p className="text-primary font-semibold">
                          Current: {data.current}/10
                        </p>
                        {data.previous !== undefined && (
                          <p className="text-muted-foreground">
                            Previous: {data.previous}/10
                            {data.current > data.previous && (
                              <span className="text-emerald-600 ml-1">
                                ↑ +{data.current - data.previous}
                              </span>
                            )}
                            {data.current < data.previous && (
                              <span className="text-rose-600 ml-1">
                                ↓ {data.current - data.previous}
                              </span>
                            )}
                          </p>
                        )}
                        {data.target !== undefined && (
                          <p className="text-muted-foreground">
                            Target: {data.target}/10
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }}
              />

              {/* Legend */}
              {showLegend && <Legend wrapperStyle={{ fontSize: '12px' }} />}
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* AI-Proof Dimensions Summary */}
        {highlightAiProof && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              AI-Proof Dimensions (Critical for human differentiation)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DIMENSION_CONFIG.filter(d => d.isAiProof).map((config) => {
                const value = currentDimensions[config.key];
                const prevValue = previousDimensions?.[config.key];
                const change = prevValue !== undefined ? value - prevValue : 0;

                return (
                  <div key={config.key} className="text-center p-2 rounded-lg bg-primary/5">
                    <div className="text-xs text-muted-foreground mb-1">
                      {config.shortLabel}
                    </div>
                    <div className="text-lg font-bold text-primary">
                      {value}
                    </div>
                    {change !== 0 && (
                      <div className={`text-xs ${change > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {change > 0 ? '↑' : '↓'} {Math.abs(change)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// SIMPLIFIED VARIANT (for dashboards/summaries)
// ============================================================================

interface SimplifiedFinksRadarProps {
  dimensions: FinksDimensions;
  size?: number;
  showAiProofHighlight?: boolean;
}

export function SimplifiedFinksRadar({
  dimensions,
  size = 200,
  showAiProofHighlight = true
}: SimplifiedFinksRadarProps) {
  const data = useMemo(() => {
    return DIMENSION_CONFIG.map((config) => ({
      dimension: config.shortLabel,
      score: dimensions[config.key],
      isAiProof: config.isAiProof,
      fullMark: 10
    }));
  }, [dimensions]);

  return (
    <div style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: 9, fill: 'hsl(var(--foreground))' }}
            tickLine={false}
          />
          <Radar
            dataKey="score"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary))"
            fillOpacity={0.3}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// COMPARISON CHART (Side-by-Side)
// ============================================================================

interface FinksComparisonChartProps {
  learnerDimensions: FinksDimensions;
  cohortAverage: FinksDimensions;
  title?: string;
  className?: string;
}

export function FinksComparisonChart({
  learnerDimensions,
  cohortAverage,
  title = 'Learner vs Cohort Average',
  className
}: FinksComparisonChartProps) {
  const data = useMemo(() => {
    return DIMENSION_CONFIG.map((config) => ({
      dimension: config.shortLabel,
      learner: learnerDimensions[config.key],
      cohort: cohortAverage[config.key],
      isAiProof: config.isAiProof,
      fullMark: 10
    }));
  }, [learnerDimensions, cohortAverage]);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
              <PolarGrid strokeDasharray="3 3" />
              <PolarAngleAxis
                dataKey="dimension"
                tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
              />
              <PolarRadiusAxis angle={30} domain={[0, 10]} tickCount={6} />

              <Radar
                name="Cohort Average"
                dataKey="cohort"
                stroke="hsl(var(--muted-foreground))"
                fill="hsl(var(--muted))"
                fillOpacity={0.3}
                strokeWidth={1}
              />

              <Radar
                name="You"
                dataKey="learner"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.3}
                strokeWidth={2}
              />

              <Tooltip />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
