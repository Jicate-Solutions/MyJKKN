'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChevronRight } from 'lucide-react';
import type { ModuleBreakdown } from '@/types/usage-analytics';

interface ModuleUsageTabProps {
  moduleBreakdown: ModuleBreakdown[];
  loading: boolean;
  onModuleDrillDown?: (module: string) => void;
}

const ROLE_COLORS: Record<string, string> = {
  student: 'hsl(var(--chart-1))',
  faculty: 'hsl(var(--chart-2))',
  admin: 'hsl(var(--chart-3))',
  hod: 'hsl(var(--chart-4))',
  principal: 'hsl(var(--chart-5))',
  accounts: 'hsl(200, 60%, 50%)',
  counselor: 'hsl(30, 60%, 50%)',
};

function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  const max = Math.max(...data, 1);
  const height = 20;
  const width = 56;
  const step = width / (data.length - 1 || 1);

  const points = data
    .map((v, i) => `${i * step},${height - (v / max) * height}`)
    .join(' ');

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke="hsl(var(--chart-1))"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function ModuleUsageTab({
  moduleBreakdown,
  loading,
  onModuleDrillDown,
}: ModuleUsageTabProps) {
  const [sortBy, setSortBy] = useState<'weighted_score' | 'event_count' | 'unique_users'>('weighted_score');

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  // Sort modules
  const sorted = [...moduleBreakdown].sort((a, b) => b[sortBy] - a[sortBy]);

  // Prepare stacked bar chart data (top 10 modules)
  const allRoles = new Set<string>();
  moduleBreakdown.forEach((m) => {
    Object.keys(m.by_role).forEach((r) => allRoles.add(r));
  });
  const roleList = Array.from(allRoles);

  const stackedData = moduleBreakdown.slice(0, 10).map((m) => {
    const entry: Record<string, string | number> = {
      name: m.module_label,
    };
    roleList.forEach((role) => {
      entry[role] = m.by_role[role] || 0;
    });
    return entry;
  });

  const stackedConfig: ChartConfig = {};
  roleList.forEach((role, idx) => {
    stackedConfig[role] = {
      label: role.charAt(0).toUpperCase() + role.slice(1),
      color: ROLE_COLORS[role] || `hsl(${idx * 50}, 60%, 55%)`,
    };
  });

  return (
    <div className="space-y-4">
      {/* Module Data Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Module Breakdown</CardTitle>
          <div className="flex gap-1">
            {(['weighted_score', 'event_count', 'unique_users'] as const).map(
              (key) => (
                <Button
                  key={key}
                  variant={sortBy === key ? 'default' : 'ghost'}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setSortBy(key)}
                >
                  {key === 'weighted_score'
                    ? 'Score'
                    : key === 'event_count'
                    ? 'Events'
                    : 'Users'}
                </Button>
              )
            )}
          </div>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              No module usage data available
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">CRUD</TableHead>
                    <TableHead className="text-right">Exports</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Users</TableHead>
                    <TableHead className="text-center">Trend</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((m) => (
                    <TableRow
                      key={m.module}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onModuleDrillDown?.(m.module)}
                    >
                      <TableCell className="font-medium">
                        {m.module_label}
                        {m.last_used && (
                          <span className="block text-[10px] text-muted-foreground">
                            Last used:{' '}
                            {new Date(m.last_used).toLocaleDateString('en-IN')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.visit_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.crud_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.export_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {m.weighted_score.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="text-xs">
                          {m.unique_users}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Sparkline data={m.trend} />
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role Stacked Bar Chart */}
      {stackedData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Module Usage by Role
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={stackedConfig} className="h-72 w-full">
              <BarChart data={stackedData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} angle={-20} textAnchor="end" height={60} />
                <YAxis fontSize={12} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {roleList.map((role) => (
                  <Bar
                    key={role}
                    dataKey={role}
                    stackId="roles"
                    fill={`var(--color-${role})`}
                    radius={[0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ChartContainer>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {roleList.map((role) => (
                <div
                  key={role}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        ROLE_COLORS[role] || 'hsl(var(--chart-1))',
                    }}
                  />
                  <span className="capitalize">{role}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
