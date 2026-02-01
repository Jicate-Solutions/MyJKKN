'use client';

import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus, Target, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { MaturityDashboardData, MaturityStage } from '@/types/maturity-assessment';
import { MATURITY_STAGE_NAMES, MATURITY_DIMENSIONS } from '@/types/maturity-assessment';
import { MaturityScoreCircle, MaturityStageIndicator } from './maturity-stage-badge';

interface DashboardCardsProps {
  data: MaturityDashboardData;
}

export function DashboardCards({ data }: DashboardCardsProps) {
  const progressPercentage =
    data.improvement_items.total > 0
      ? (data.improvement_items.completed / data.improvement_items.total) * 100
      : 0;

  // Calculate trend
  const trendDirection =
    data.trend.length >= 2
      ? data.trend[data.trend.length - 1].stage - data.trend[0].stage
      : 0;

  return (
    <div className="space-y-6">
      {/* Top row: Overall metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Overall Stage Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Overall Maturity Stage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold">
                  Stage {data.institution_overall}
                </div>
                <p className="text-sm text-muted-foreground">
                  {MATURITY_STAGE_NAMES[data.institution_overall]}
                </p>
              </div>
              <MaturityScoreCircle stage={data.institution_overall} size="lg" />
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm">
              {trendDirection > 0 ? (
                <>
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-green-600">Improving</span>
                </>
              ) : trendDirection < 0 ? (
                <>
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  <span className="text-red-600">Declining</span>
                </>
              ) : (
                <>
                  <Minus className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-500">Stable</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Improvement Progress Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Improvement Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl font-bold">
                {data.improvement_items.completed}/{data.improvement_items.total}
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <Progress value={progressPercentage} className="h-2" />
            <p className="text-sm text-muted-foreground mt-2">
              {Math.round(progressPercentage)}% actions completed
            </p>
            {data.improvement_items.overdue > 0 && (
              <div className="flex items-center gap-1 mt-2 text-red-600 text-sm">
                <AlertTriangle className="h-4 w-4" />
                {data.improvement_items.overdue} overdue
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full" size="sm">
              <Link href="/maturity-assessment/new">
                <Target className="h-4 w-4 mr-2" />
                New Assessment
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full" size="sm">
              <Link href="/maturity-assessment?status=submitted">
                Review Pending ({data.latest_assessments.filter((a) => a.status === 'submitted').length})
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Second row: Dimension breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dimension Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {MATURITY_DIMENSIONS.map((dimension) => {
              const score = data.by_dimension[dimension] || 1;
              const roundedScore = Math.round(score) as MaturityStage;

              return (
                <div
                  key={dimension}
                  className="text-center p-4 rounded-lg bg-muted/30"
                >
                  <MaturityScoreCircle stage={roundedScore} size="md" />
                  <p className="mt-2 font-medium text-sm">{dimension}</p>
                  <p className="text-xs text-muted-foreground">
                    Avg: {score.toFixed(1)}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Third row: Department breakdown */}
      {Object.keys(data.by_department).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Department Maturity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(data.by_department).map(([name, stage]) => (
                <div
                  key={name}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div>
                    <p className="font-medium">{name}</p>
                    <p className="text-sm text-muted-foreground">
                      {MATURITY_STAGE_NAMES[stage]}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <MaturityStageIndicator stage={stage} />
                    <MaturityScoreCircle stage={stage} size="sm" />
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
