'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Rocket,
  RefreshCw,
  CheckCircle,
  Lightbulb,
  Award,
  Users,
  Plus,
  ArrowRight,
  AlertCircle,
  ListChecks,
  Calendar,
} from 'lucide-react';
import {
  useDashboardStats,
  useCycleStatusDistribution,
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

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  abandoned: { label: 'Abandoned', color: 'bg-gray-100 text-gray-800' },
};

export function SSDashboard() {
  const { data: statsRaw, isLoading: statsLoading, error: statsError } = useDashboardStats();
  const { data: statusDistRaw, isLoading: statusLoading } = useCycleStatusDistribution();
  const { data: stepRatesRaw, isLoading: stepsLoading } = useStepCompletionRates();

  const stats = statsRaw as any;
  const statusDist = statusDistRaw as any;
  const stepRates = stepRatesRaw as any;

  const isLoading = statsLoading || statusLoading || stepsLoading;

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/startup-studio/cycles/new">
            <Plus className="mr-2 h-4 w-4" />
            New Cycle
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/startup-studio/cycles">
            <ListChecks className="mr-2 h-4 w-4" />
            All Cycles
          </Link>
        </Button>
      </div>

      {/* Error State */}
      {statsError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load dashboard stats. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
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
              <div className="text-2xl font-bold">
                {stats?.total_cycles ?? 0}
              </div>
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
              <div className="text-2xl font-bold">
                {stats?.active_cycles ?? 0}
              </div>
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
              <div className="text-2xl font-bold">
                {stats?.completed_cycles ?? 0}
              </div>
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
              <div className="text-2xl font-bold">
                {stats?.total_problems ?? 0}
              </div>
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
              <div className="text-2xl font-bold">
                {stats?.nif_candidates ?? 0}
              </div>
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
              <div className="text-2xl font-bold">
                {stats?.total_users_reached ?? 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Impact</p>
          </CardContent>
        </Card>
      </div>

      {/* Two-column: Status Distribution + Step Completion */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Cycle Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-blue-600" />
              Cycle Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : statusDist && Array.isArray(statusDist) ? (
              <div className="space-y-3">
                {statusDist.map((item: any) => {
                  const config = STATUS_CONFIG[item.status] || {
                    label: item.status,
                    color: 'bg-gray-100 text-gray-800',
                  };
                  return (
                    <div
                      key={item.status}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-2 py-1 rounded-md text-xs font-medium ${config.color}`}
                        >
                          {config.label}
                        </span>
                      </div>
                      <span className="text-lg font-semibold">{item.count ?? 0}</span>
                    </div>
                  );
                })}
              </div>
            ) : statusDist && typeof statusDist === 'object' ? (
              <div className="space-y-3">
                {Object.entries(statusDist).map(([status, count]) => {
                  const config = STATUS_CONFIG[status] || {
                    label: status,
                    color: 'bg-gray-100 text-gray-800',
                  };
                  return (
                    <div
                      key={status}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <span
                        className={`px-2 py-1 rounded-md text-xs font-medium ${config.color}`}
                      >
                        {config.label}
                      </span>
                      <span className="text-lg font-semibold">{count as number}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No cycle data available</p>
            )}
          </CardContent>
        </Card>

        {/* Step Completion Rates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-green-600" />
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
                    ? stepRates.find((r: any) => r.step === step)?.completion_rate ?? 0
                    : (stepRates as any)[step] ?? (stepRates as any)[`step_${step}`] ?? 0;
                  const percentage = typeof rate === 'number' ? Math.round(rate * 100) / 100 : 0;

                  return (
                    <div key={step} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          <span className="font-medium text-foreground mr-1">{step}.</span>
                          {STEP_LABELS[step]}
                        </span>
                        <span className="font-medium">{percentage}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full transition-all"
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

      {/* Quick Links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
          <Link href="/startup-studio/cycles">
            <CardContent className="flex items-center gap-3 py-4">
              <Rocket className="h-8 w-8 text-blue-600" />
              <div>
                <p className="font-medium">Innovation Cycles</p>
                <p className="text-sm text-muted-foreground">View all cycles</p>
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
          <Link href="/startup-studio/cycles/new">
            <CardContent className="flex items-center gap-3 py-4">
              <Plus className="h-8 w-8 text-green-600" />
              <div>
                <p className="font-medium">Start New Cycle</p>
                <p className="text-sm text-muted-foreground">Begin a new innovation cycle</p>
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
          <Link href="/startup-studio/cycles?status=active">
            <CardContent className="flex items-center gap-3 py-4">
              <Calendar className="h-8 w-8 text-amber-600" />
              <div>
                <p className="font-medium">Active Cycles</p>
                <p className="text-sm text-muted-foreground">Cycles currently in progress</p>
              </div>
            </CardContent>
          </Link>
        </Card>
      </div>
    </div>
  );
}
