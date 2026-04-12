'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Rocket,
  RefreshCw,
  CheckCircle,
  Lightbulb,
  Award,
  Users,
  AlertCircle,
  ListChecks,
  BarChart3,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  useDashboardStats,
  useProblemThemeDistribution,
  useNifStageAnalytics,
  useImpactSummary,
  useStepCompletionRates,
} from '@/hooks/startup-studio';

const STEP_LABELS: Record<number, string> = {
  1: 'Problem',
  2: 'Context',
  3: 'Value Assessment',
  4: 'Workflow',
  5: 'Prompt',
  6: 'Build',
  7: 'Impact',
  8: 'Review',
};

const THEME_COLORS: Record<string, string> = {
  healthcare: 'bg-red-100 text-red-800',
  education: 'bg-blue-100 text-blue-800',
  agriculture: 'bg-green-100 text-green-800',
  environment: 'bg-emerald-100 text-emerald-800',
  community: 'bg-pink-100 text-pink-800',
  operations: 'bg-amber-100 text-amber-800',
  productivity: 'bg-purple-100 text-purple-800',
  other: 'bg-gray-100 text-gray-800',
};

const STAGE_COLORS: Record<string, string> = {
  identified: 'bg-gray-100 text-gray-800',
  screened: 'bg-blue-100 text-blue-800',
  shortlisted: 'bg-amber-100 text-amber-800',
  incubating: 'bg-purple-100 text-purple-800',
  graduated: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

export function SSAnalytics() {
  const { data: statsRaw, isLoading: statsLoading, error: statsError } = useDashboardStats();
  const { data: themesRaw, isLoading: themesLoading } = useProblemThemeDistribution();
  const { data: nifRaw, isLoading: nifLoading } = useNifStageAnalytics();
  const { data: impactRaw, isLoading: impactLoading } = useImpactSummary();
  const { data: stepsRaw, isLoading: stepsLoading } = useStepCompletionRates();

  const stats = statsRaw as any;
  const themes = themesRaw as any;
  const nifStages = nifRaw as any;
  const impact = impactRaw as any;
  const stepRates = stepsRaw as any;

  if (statsError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load analytics. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dashboard Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cycles</CardTitle>
            <Rocket className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.totalCycles ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <RefreshCw className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.activeCycles ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.completedCycles ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Finished</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Problems</CardTitle>
            <Lightbulb className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.totalProblems ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Discovered</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">NIF Candidates</CardTitle>
            <Award className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.nifCandidates ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">In pipeline</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users Reached</CardTitle>
            <Users className="h-4 w-4 text-teal-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.totalUsersReached ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Impact</p>
          </CardContent>
        </Card>
      </div>

      {/* Two-column: Theme Distribution + NIF Stage Funnel */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Problem Theme Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-purple-600" />
              Problem Theme Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {themesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : themes && (Array.isArray(themes) || typeof themes === 'object') ? (
              <div className="space-y-3">
                {(Array.isArray(themes) ? themes : Object.entries(themes).map(([theme, count]) => ({ theme, count }))).map(
                  (item: any) => {
                    const themeName = item.theme ?? item.name ?? 'unknown';
                    const count = item.count ?? item.value ?? 0;
                    const colorClass = THEME_COLORS[themeName] ?? 'bg-gray-100 text-gray-800';

                    return (
                      <div
                        key={themeName}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <Badge variant="outline" className={colorClass}>
                          {themeName}
                        </Badge>
                        <span className="text-lg font-semibold">{count}</span>
                      </div>
                    );
                  }
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No theme data available</p>
            )}
          </CardContent>
        </Card>

        {/* NIF Stage Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-amber-600" />
              NIF Stage Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nifLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : nifStages && (Array.isArray(nifStages) || typeof nifStages === 'object') ? (
              <div className="space-y-3">
                {(Array.isArray(nifStages)
                  ? nifStages
                  : Object.entries(nifStages).map(([stage, count]) => ({ stage, count }))
                ).map((item: any) => {
                  const stageName = item.stage ?? item.name ?? 'unknown';
                  const count = item.count ?? item.value ?? 0;
                  const colorClass = STAGE_COLORS[stageName] ?? 'bg-gray-100 text-gray-800';

                  return (
                    <div
                      key={stageName}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <Badge variant="outline" className={colorClass}>
                        {stageName}
                      </Badge>
                      <span className="text-lg font-semibold">{count}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No NIF stage data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Two-column: Impact Summary + Step Completion */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Impact Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Impact Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {impactLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : impact && typeof impact === 'object' ? (
              <div className="space-y-3">
                {Object.entries(impact).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <span className="text-sm text-muted-foreground capitalize">
                      {key.replace(/_/g, ' ')}
                    </span>
                    <span className="text-lg font-semibold">
                      {typeof value === 'number'
                        ? value.toLocaleString()
                        : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No impact data available</p>
            )}
          </CardContent>
        </Card>

        {/* Step Completion Rates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-blue-600" />
              Step Completion Rates
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stepsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : stepRates && (Array.isArray(stepRates) || typeof stepRates === 'object') ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((step) => {
                  const rate = Array.isArray(stepRates)
                    ? stepRates.find((r: any) => r.step === step)?.percentage ?? 0
                    : (stepRates as any)[step] ?? (stepRates as any)[`step_${step}`] ?? 0;
                  const percentage =
                    typeof rate === 'number' ? Math.round(rate * 100) / 100 : 0;

                  return (
                    <div key={step} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          <span className="font-medium text-foreground mr-1">
                            {step}.
                          </span>
                          {STEP_LABELS[step]}
                        </span>
                        <span className="font-medium">{percentage}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No step data available</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
