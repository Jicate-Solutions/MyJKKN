'use client';

import { Loader2, Target, Building2, Award } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useMaturityDashboard } from '@/hooks/maturity-assessment/use-maturity-dashboard';
import { MATURITY_DIMENSIONS, MATURITY_STAGE_NAMES } from '@/types/maturity-assessment';
import type { MaturityStage } from '@/types/maturity-assessment';

export default function MaturityBenchmarksPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;

  const { data: dashboardData, isLoading, error } = useMaturityDashboard(institutionId || undefined);

  if (!institutionId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">
              You need to be assigned to an institution to view benchmarks.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-red-600">Failed to load benchmark data. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = (dashboardData as any)?.data ?? dashboardData;

  // Build dimension benchmarks from real dashboard data
  // Target (Stage 4) = top quartile, Stage 3 = industry average reference
  const benchmarks = MATURITY_DIMENSIONS.map((dim) => {
    const yourScore = data.by_dimension?.[dim] || 0;
    const roundedScore = Math.round(yourScore * 25); // Convert stage (1-4) to percentage (25-100)
    return {
      category: dim,
      yourScore: roundedScore,
      stageValue: yourScore,
      // Industry average baseline: Stage 2 = 50%
      industryAvg: 50,
      // Top quartile: Stage 3.5 = 87%
      topQuartile: 87,
      trend: yourScore >= 2.5 ? 'up' : yourScore >= 1.5 ? 'stable' : 'down',
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold py-1">Dimension Benchmarks</h2>
        <p className="text-sm text-muted-foreground">
          Compare your maturity scores across dimensions against target levels
        </p>
      </div>

      {/* Overall Position */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Current Stage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary">
              Stage {data.institution_overall}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {MATURITY_STAGE_NAMES[data.institution_overall as MaturityStage]}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              Baseline Target
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">Stage 2</div>
            <p className="text-sm text-muted-foreground mt-2">
              {MATURITY_STAGE_NAMES[2]} level
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-yellow-500" />
              Excellence Target
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">Stage 4</div>
            <p className="text-sm text-muted-foreground mt-2">
              {MATURITY_STAGE_NAMES[4]} level
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Category Benchmarks */}
      <Card>
        <CardHeader>
          <CardTitle>Dimension-wise Comparison</CardTitle>
          <CardDescription>
            Your scores compared to baseline (Stage 2) and excellence (Stage 4) targets
          </CardDescription>
        </CardHeader>
        <CardContent>
          {benchmarks.every((b) => b.stageValue === 0) ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No assessment data available yet.</p>
              <p className="text-sm mt-2">
                Complete an assessment to see your dimension benchmarks.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {benchmarks.map((item, i) => {
                const pct = Math.round(item.stageValue * 25);
                return (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.category}</span>
                        <Badge
                          variant={
                            item.trend === 'up' ? 'default' :
                            item.trend === 'down' ? 'destructive' : 'secondary'
                          }
                          className={
                            item.trend === 'up' ? 'bg-green-100 text-green-700' :
                            item.trend === 'down' ? '' : ''
                          }
                        >
                          {item.trend === 'up' ? 'Above baseline' : item.trend === 'down' ? 'Below baseline' : 'At baseline'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-primary font-bold">
                          Stage {item.stageValue.toFixed(1)}
                        </span>
                        <span className="text-muted-foreground">|</span>
                        <span>Baseline: 2.0</span>
                        <span className="text-muted-foreground">|</span>
                        <span>Target: 4.0</span>
                      </div>
                    </div>
                    <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                      {/* Baseline Marker (Stage 2 = 50%) */}
                      <div
                        className="absolute h-full w-0.5 bg-gray-400 z-10"
                        style={{ left: '50%' }}
                      />
                      {/* Excellence Marker (Stage 3.5 = 87.5%) */}
                      <div
                        className="absolute h-full w-0.5 bg-yellow-500 z-10"
                        style={{ left: '87.5%' }}
                      />
                      {/* Your Score */}
                      <div
                        className={`h-full rounded-full transition-all ${
                          pct >= 50
                            ? 'bg-primary'
                            : 'bg-orange-500'
                        }`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-6 mt-6 pt-6 border-t text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span>Your Score</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-gray-400" />
              <span>Baseline (Stage 2)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-yellow-500" />
              <span>Excellence (Stage 3.5)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
