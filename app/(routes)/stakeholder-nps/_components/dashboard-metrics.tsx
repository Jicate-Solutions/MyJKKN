'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NPSScoreDisplay, NPSDistributionBar } from './nps-score-display';
import { StakeholderTypeBadge, getStakeholderLabel } from './stakeholder-type-badge';
import type { NPSDashboardData, StakeholderType } from '@/types/stakeholder-nps';
import {
  Users,
  MessageSquare,
  TrendingUp,
  BarChart3
} from 'lucide-react';

interface DashboardMetricsProps {
  dashboard: NPSDashboardData;
  loading?: boolean;
}

export function DashboardMetrics({ dashboard, loading }: DashboardMetricsProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-8 bg-muted rounded w-3/4" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Calculate totals from stakeholder data
  const totalPromotes = Object.values(dashboard.by_stakeholder).reduce(
    (sum, s) => sum + (s?.promoters || 0),
    0
  );
  const totalPassives = Object.values(dashboard.by_stakeholder).reduce(
    (sum, s) => sum + (s?.passives || 0),
    0
  );
  const totalDetractors = Object.values(dashboard.by_stakeholder).reduce(
    (sum, s) => sum + (s?.detractors || 0),
    0
  );

  const stakeholderTypes: StakeholderType[] = ['student', 'learner', 'parent', 'alumni', 'staff', 'industry', 'employer', 'community'];

  return (
    <div className="space-y-6">
      {/* Top metrics row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overall NPS</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <NPSScoreDisplay score={dashboard.overall_nps} size="md" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Responses</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{dashboard.total_responses}</div>
            <p className="text-xs text-muted-foreground mt-1">
              From all stakeholder surveys
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Promoters</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{totalPromotes}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Score 9-10
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Detractors</CardTitle>
            <Users className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{totalDetractors}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Score 0-6
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Distribution bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Response Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <NPSDistributionBar
            promoters={totalPromotes}
            passives={totalPassives}
            detractors={totalDetractors}
          />
        </CardContent>
      </Card>

      {/* By stakeholder type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">NPS by Stakeholder Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {stakeholderTypes.map((type) => {
              const data = dashboard.by_stakeholder[type] || {
                score: 0,
                responses: 0,
                promoters: 0,
                passives: 0,
                detractors: 0
              };

              return (
                <div key={type} className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <StakeholderTypeBadge type={type} showIcon={false} />
                    <span className="text-sm text-muted-foreground">
                      {data.responses} responses
                    </span>
                  </div>
                  <NPSScoreDisplay score={data.score} size="sm" />
                  <NPSDistributionBar
                    promoters={data.promoters}
                    passives={data.passives}
                    detractors={data.detractors}
                    className="mt-2"
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent feedback */}
      {dashboard.recent_feedback && dashboard.recent_feedback.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dashboard.recent_feedback.map((fb) => (
                <div key={fb.id} className="flex gap-4 p-4 border rounded-lg">
                  <div className="flex-shrink-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                        fb.score >= 9
                          ? 'bg-green-500'
                          : fb.score >= 7
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                    >
                      {fb.score}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{fb.feedback}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <StakeholderTypeBadge type={fb.stakeholder_type} />
                      <span>
                        {new Date(fb.submitted_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
