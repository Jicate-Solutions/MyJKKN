'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
} from 'recharts';
import {
  HEALTH_GRADE_CONFIG,
  DORMANT_CONFIG,
  type InstitutionComparison,
  type HealthGrade,
  type DormantStatus,
} from '@/types/usage-analytics';
import { AlertTriangle, Building2 } from 'lucide-react';

interface InstitutionComparisonTabProps {
  comparisons: InstitutionComparison[];
  loading: boolean;
}

const RADAR_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function InstitutionComparisonTab({
  comparisons,
  loading,
}: InstitutionComparisonTabProps) {
  const [selectedInstitutions, setSelectedInstitutions] = useState<string[]>([]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (comparisons.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-60 text-muted-foreground">
          No institution data available
        </CardContent>
      </Card>
    );
  }

  // Dormant institutions (amber, orange, red)
  const dormantInstitutions = comparisons.filter(
    (c) => c.status !== 'active'
  );

  // Toggle institution for radar chart (max 5)
  const toggleInstitution = (id: string) => {
    setSelectedInstitutions((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  // Grouped bar chart data
  const barData = comparisons
    .sort((a, b) => b.health_score - a.health_score)
    .map((c) => ({
      name: c.institution_name.length > 20
        ? c.institution_name.slice(0, 18) + '...'
        : c.institution_name,
      health_score: c.health_score,
      active_users: c.active_users,
      actions: Math.min(c.actions_30d, 1000), // cap for chart readability
    }));

  const barConfig: ChartConfig = {
    health_score: { label: 'Health Score', color: 'hsl(var(--chart-1))' },
    active_users: { label: 'Active Users', color: 'hsl(var(--chart-2))' },
    actions: { label: 'Actions (30d)', color: 'hsl(var(--chart-3))' },
  };

  // Radar chart data
  const radarInstitutions = selectedInstitutions.length > 0
    ? comparisons.filter((c) => selectedInstitutions.includes(c.institution_id))
    : comparisons.slice(0, 3);

  const radarDimensions = ['Health Score', 'Users', 'Actions', 'Modules'];
  const maxUsers = Math.max(...comparisons.map((c) => c.active_users), 1);
  const maxActions = Math.max(...comparisons.map((c) => c.actions_30d), 1);

  const radarData = radarDimensions.map((dim) => {
    const entry: Record<string, string | number> = { dimension: dim };
    radarInstitutions.forEach((inst) => {
      const shortName = inst.institution_name.length > 15
        ? inst.institution_name.slice(0, 13) + '...'
        : inst.institution_name;
      switch (dim) {
        case 'Health Score':
          entry[shortName] = inst.health_score;
          break;
        case 'Users':
          entry[shortName] = (inst.active_users / maxUsers) * 100;
          break;
        case 'Actions':
          entry[shortName] = (inst.actions_30d / maxActions) * 100;
          break;
        case 'Modules':
          entry[shortName] = inst.top_module ? 50 : 0;
          break;
      }
    });
    return entry;
  });

  const radarConfig: ChartConfig = {};
  radarInstitutions.forEach((inst, idx) => {
    const shortName = inst.institution_name.length > 15
      ? inst.institution_name.slice(0, 13) + '...'
      : inst.institution_name;
    radarConfig[shortName] = {
      label: inst.institution_name,
      color: RADAR_COLORS[idx % RADAR_COLORS.length],
    };
  });

  return (
    <div className="space-y-4">
      {/* Dormant Institution Alerts */}
      {dormantInstitutions.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Dormant Institution Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dormantInstitutions.map((inst) => {
                const dormConfig = DORMANT_CONFIG[inst.status as DormantStatus];
                return (
                  <div
                    key={inst.institution_id}
                    className={`flex items-center justify-between p-2 rounded-md border ${dormConfig.borderColor} ${dormConfig.bgColor}`}
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {inst.institution_name}
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={`${dormConfig.color} border-current`}
                    >
                      {inst.dormant_days && inst.dormant_days < 999
                        ? `${inst.dormant_days}d inactive`
                        : 'No activity'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Institution DataTable */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Institution Health Scores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4 font-medium">Institution</th>
                  <th className="py-2 pr-4 font-medium">Health Score</th>
                  <th className="py-2 pr-4 font-medium">Grade</th>
                  <th className="py-2 pr-4 font-medium text-right">Active Users</th>
                  <th className="py-2 pr-4 font-medium text-right">Actions (30d)</th>
                  <th className="py-2 pr-4 font-medium">Top Module</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium w-8">Radar</th>
                </tr>
              </thead>
              <tbody>
                {comparisons
                  .sort((a, b) => b.health_score - a.health_score)
                  .map((inst) => {
                    const gradeConfig =
                      HEALTH_GRADE_CONFIG[inst.health_grade as HealthGrade] ||
                      HEALTH_GRADE_CONFIG.F;
                    const dormConfig =
                      DORMANT_CONFIG[inst.status as DormantStatus] ||
                      DORMANT_CONFIG.active;
                    const isSelected = selectedInstitutions.includes(
                      inst.institution_id
                    );

                    return (
                      <tr
                        key={inst.institution_id}
                        className="border-b last:border-0 hover:bg-muted/50"
                      >
                        <td className="py-2.5 pr-4 font-medium">
                          {inst.institution_name}
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <Progress
                              value={inst.health_score}
                              className="h-2 flex-1"
                            />
                            <span className="text-xs tabular-nums w-8 text-right">
                              {inst.health_score.toFixed(0)}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4">
                          <Badge
                            variant="secondary"
                            className={`${gradeConfig.color} ${gradeConfig.bgColor}`}
                          >
                            {inst.health_grade}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">
                          {inst.active_users}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">
                          {inst.actions_30d.toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-4 text-muted-foreground">
                          {inst.top_module_label || '—'}
                        </td>
                        <td className="py-2.5">
                          <Badge
                            variant="outline"
                            className={`${dormConfig.color} border-current text-xs`}
                          >
                            {dormConfig.label}
                          </Badge>
                        </td>
                        <td className="py-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() =>
                              toggleInstitution(inst.institution_id)
                            }
                            disabled={
                              !isSelected && selectedInstitutions.length >= 5
                            }
                            className="h-3.5 w-3.5 rounded border-gray-300"
                          />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Grouped Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Institution Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={barConfig} className="h-72 w-full">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  fontSize={10}
                  angle={-30}
                  textAnchor="end"
                  height={60}
                />
                <YAxis fontSize={12} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="health_score"
                  fill="var(--color-health_score)"
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="active_users"
                  fill="var(--color-active_users)"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Radar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Radar Comparison
              <span className="text-xs text-muted-foreground font-normal ml-2">
                (select up to 5 from table)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={radarConfig} className="h-72 w-full">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="dimension" fontSize={11} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} />
                {radarInstitutions.map((inst, idx) => {
                  const shortName = inst.institution_name.length > 15
                    ? inst.institution_name.slice(0, 13) + '...'
                    : inst.institution_name;
                  return (
                    <Radar
                      key={inst.institution_id}
                      name={shortName}
                      dataKey={shortName}
                      stroke={RADAR_COLORS[idx % RADAR_COLORS.length]}
                      fill={RADAR_COLORS[idx % RADAR_COLORS.length]}
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  );
                })}
                <ChartTooltip content={<ChartTooltipContent />} />
              </RadarChart>
            </ChartContainer>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {radarInstitutions.map((inst, idx) => (
                <div
                  key={inst.institution_id}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        RADAR_COLORS[idx % RADAR_COLORS.length],
                    }}
                  />
                  <span>{inst.institution_name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
