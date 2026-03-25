'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ChecklistProgress } from '@/lib/services/startup-studio/event-analytics-service';

const PHASE_LABELS: Record<string, string> = {
  pre_event: 'Pre Event',
  on_day: 'On Day',
  build_day: 'Build Day',
  demo_day: 'Demo Day',
  post_event: 'Post Event',
};

const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444'];

interface Props {
  institutionBreakdown: Array<{
    institution_name?: string;
    participated?: number;
    total?: number;
  }>;
  checklistProgress: ChecklistProgress[];
  eventStatus: string;
  startDate: string | null;
  endDate: string | null;
  demoDate: string | null;
}

export function OverviewTab({
  institutionBreakdown,
  checklistProgress,
  eventStatus,
  startDate,
  endDate,
  demoDate,
}: Props) {
  const pieData = (institutionBreakdown ?? [])
    .filter((i) => (i.participated ?? 0) > 0)
    .map((i) => ({ name: i.institution_name ?? 'Unknown', value: i.participated ?? 0 }))
    .slice(0, 10);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-IN', { dateStyle: 'medium' });
  };

  return (
    <div className="space-y-6">
      {/* Event Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event Timeline</CardTitle>
          <CardDescription>Key dates and current status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Badge variant="outline" className="capitalize">
                {eventStatus.replace(/_/g, ' ')}
              </Badge>
            </div>
            {startDate && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Start:</span>
                <span className="text-sm font-medium">{formatDate(startDate)}</span>
              </div>
            )}
            {endDate && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">End:</span>
                <span className="text-sm font-medium">{formatDate(endDate)}</span>
              </div>
            )}
            {demoDate && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Demo Day:</span>
                <span className="text-sm font-medium">{formatDate(demoDate)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Teams by Institution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Teams by Institution</CardTitle>
            <CardDescription>Participation distribution across colleges</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                No participation data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [value, name]}
                  />
                  <Legend
                    formatter={(value) =>
                      value.length > 20 ? `${value.slice(0, 20)}…` : value
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Checklist Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Checklist Progress</CardTitle>
            <CardDescription>Event preparation completion by phase</CardDescription>
          </CardHeader>
          <CardContent>
            {checklistProgress.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                No checklists created yet
              </div>
            ) : (
              <div className="space-y-4">
                {checklistProgress.map((phase) => (
                  <div key={phase.phase} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {PHASE_LABELS[phase.phase] ?? phase.phase}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {phase.completed}/{phase.total} ({phase.percentage}%)
                      </span>
                    </div>
                    <Progress value={phase.percentage} className="h-2" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
