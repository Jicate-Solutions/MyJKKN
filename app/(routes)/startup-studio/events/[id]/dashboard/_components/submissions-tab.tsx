'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { SubmissionMetrics } from '@/lib/services/startup-studio/event-analytics-service';

interface Props {
  metrics: SubmissionMetrics;
  totalTeams: number;
}

function formatINR(amount: number): string {
  return `\u20B9${amount.toLocaleString('en-IN')}`;
}

export function SubmissionsTab({ metrics, totalTeams }: Props) {
  const tierChartData = metrics.tierDistribution.map((t) => ({
    name: `Tier ${t.tier}`,
    label: t.label,
    count: t.count,
    color: t.color,
  }));

  const submissionRate =
    totalTeams > 0 ? Math.round((metrics.teamsSubmitted / totalTeams) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">Teams Submitted</p>
            <p className="text-2xl font-bold">{metrics.teamsSubmitted}</p>
            <p className="text-xs text-muted-foreground mt-1">{submissionRate}% of all teams</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">Apps Live</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {metrics.teamsWithLiveApp}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.teamsSubmitted > 0
                ? Math.round((metrics.teamsWithLiveApp / metrics.teamsSubmitted) * 100)
                : 0}
              % of submitted
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">Generating Revenue</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {metrics.teamsWithRevenue}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.teamsSubmitted > 0
                ? Math.round((metrics.teamsWithRevenue / metrics.teamsSubmitted) * 100)
                : 0}
              % of submitted
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">Total MRR Claimed</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {formatINR(metrics.totalMrrClaimed)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              avg {formatINR(Math.round(metrics.avgMrrClaimed))} per team
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tier Distribution Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tier Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={tierChartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                formatter={(value: number, _name: string, props: { payload?: { label?: string } }) => [
                  value,
                  props.payload?.label ?? 'Teams',
                ]}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {tierChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Tier Legend */}
          <div className="flex flex-wrap gap-2 mt-4">
            {metrics.tierDistribution.map((t) => (
              <Badge
                key={t.tier}
                variant="outline"
                style={{ borderColor: t.color, color: t.color }}
                className="text-xs"
              >
                Tier {t.tier}: {t.label} ({t.count} teams)
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
