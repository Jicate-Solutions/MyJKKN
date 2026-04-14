'use client';

import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ExternalLink, AlertCircle, TrendingUp, TrendingDown, Minus, FileWarning } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { useParadigmShiftDepartment } from '@/hooks/solutions/use-paradigm-shift';
import { TierBadge } from '../../_components/tier-badge';
import { MetricCard } from '../../_components/metric-card';
import { formatCurrency } from '@/lib/services/solutions';
import type { DepartmentDetail as DeptDetailType } from '@/lib/services/solutions/paradigm-shift-service';

// Annual solutions target per department (can be made configurable later)
const SOLUTIONS_TARGET_PER_FY = 12;

/**
 * Derive previous month's tier from monthly_timeline data.
 * Uses a heuristic: count months with activity as a proxy for active metrics,
 * then compare the trend of solutions output month-over-month.
 */
function deriveTierTrend(
  currentTier: string,
  currentScore: number,
  timeline: Array<{ month: string; solutions: number; revenue: number; discovery_visits: number }>
): 'up' | 'down' | 'same' {
  if (timeline.length < 2) return 'same';

  // Get last two months of data (timeline is ordered chronologically)
  const sorted = [...timeline].sort((a, b) => a.month.localeCompare(b.month));
  const lastMonth = sorted[sorted.length - 1];
  const prevMonth = sorted[sorted.length - 2];

  if (!lastMonth || !prevMonth) return 'same';

  // Compare activity levels: solutions + discovery_visits + revenue presence
  const lastActivity = lastMonth.solutions * 10 + lastMonth.discovery_visits + (lastMonth.revenue > 0 ? 3 : 0);
  const prevActivity = prevMonth.solutions * 10 + prevMonth.discovery_visits + (prevMonth.revenue > 0 ? 3 : 0);

  if (lastActivity > prevActivity) return 'up';
  if (lastActivity < prevActivity) return 'down';
  return 'same';
}

export function DepartmentDetailView() {
  const params = useParams();
  const router = useRouter();
  const rawId = params.departmentId;
  const departmentId = Array.isArray(rawId) ? rawId[0] : (rawId as string);

  const { data, isLoading, error } = useParadigmShiftDepartment(departmentId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">Department not found or no data available.</p>
          <Button variant="outline" className="mt-4" onClick={() => router.back()}>
            Go Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  const dept = data as DeptDetailType;

  // Task 3: Tier trend
  const tierTrend = deriveTierTrend(dept.tier, dept.composite_score, dept.monthly_timeline);

  // Task 1: Solutions target progress
  const solutionsBuilt = dept.metrics.solutions_built;
  const solutionsPercent = Math.min(100, Math.round((solutionsBuilt / SOLUTIONS_TARGET_PER_FY) * 100));
  const solutionsColor =
    solutionsBuilt >= SOLUTIONS_TARGET_PER_FY ? 'bg-green-500' :
    solutionsBuilt >= 6 ? 'bg-amber-500' :
    'bg-red-500';

  // Task 2: Unpublished completed solutions
  const completedSolutions = dept.recent_solutions.filter(s => s.status === 'completed');
  // Heuristic: if there are completed solutions and fewer publications than completed solutions
  const unpublishedCount = Math.max(0, completedSolutions.length - dept.recent_publications.length);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{dept.department_name}</h1>
            <TierBadge tier={dept.tier} size="lg" />
            {/* Task 3: Tier trend indicator */}
            {tierTrend === 'up' && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                <TrendingUp className="h-3 w-3" /> Improving
              </span>
            )}
            {tierTrend === 'down' && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                <TrendingDown className="h-3 w-3" /> Declining
              </span>
            )}
            {tierTrend === 'same' && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                <Minus className="h-3 w-3" /> Steady
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            {dept.institution_name} &bull; {dept.active_metrics_count}/9 metrics active
          </p>
        </div>
      </div>

      {/* Task 1: Solutions Target Progress */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Solutions Target (This FY)</span>
            <span className="text-sm font-semibold">
              {solutionsBuilt} of {SOLUTIONS_TARGET_PER_FY}
            </span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${solutionsColor}`}
              style={{ width: `${solutionsPercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {solutionsBuilt >= SOLUTIONS_TARGET_PER_FY
              ? 'Target achieved! Keep building solutions.'
              : `${SOLUTIONS_TARGET_PER_FY - solutionsBuilt} more solution${SOLUTIONS_TARGET_PER_FY - solutionsBuilt === 1 ? '' : 's'} needed to reach the annual target.`}
          </p>
        </CardContent>
      </Card>

      {/* Task 2: Unpublished Solutions Alert */}
      {unpublishedCount > 0 && (
        <Alert variant="default" className="border-amber-200 bg-amber-50">
          <FileWarning className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">Unpublished Solutions</AlertTitle>
          <AlertDescription className="text-amber-700">
            {unpublishedCount} completed solution{unpublishedCount === 1 ? ' has' : 's have'} no publications yet.
            Each solution can generate 3-5 research papers. Convert your solutions work into publications to strengthen your department&apos;s paradigm shift score.
          </AlertDescription>
        </Alert>
      )}

      {/* 9 Metrics Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Metrics (Current Fiscal Year)</h2>
        <MetricCard metrics={dept.metrics} average={dept.institutional_average} />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Timeline + Solutions + Publications */}
        <div className="lg:col-span-3 space-y-6">
          {/* Monthly Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Progress (Last 12 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const maxSolutions = Math.max(1, ...dept.monthly_timeline.map(m => m.solutions));
                return (
                  <div className="space-y-1">
                    {dept.monthly_timeline.map(month => (
                      <div key={month.month} className="flex items-center gap-3 text-sm">
                        <span className="w-16 text-muted-foreground font-mono text-xs">{month.month}</span>
                        <div className="flex-1 flex items-center gap-2">
                          <div
                            className="h-4 bg-blue-200 rounded"
                            style={{ width: `${(month.solutions / maxSolutions) * 100}%`, minWidth: month.solutions > 0 ? 8 : 0 }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {month.solutions} solutions, {month.discovery_visits} visits
                            {month.revenue > 0 ? `, ${formatCurrency(month.revenue)}` : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Recent Solutions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Solutions</CardTitle>
            </CardHeader>
            <CardContent>
              {dept.recent_solutions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No solutions yet. Start by registering a project in the Solutions Hub.</p>
              ) : (
                <div className="space-y-2">
                  {dept.recent_solutions.map(sol => (
                    <Link
                      key={sol.id}
                      href={`/solutions/${sol.id}`}
                      className="flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium">{sol.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {sol.solution_code} {sol.client_name ? `• ${sol.client_name}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{sol.status}</Badge>
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Publications */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Publications</CardTitle>
            </CardHeader>
            <CardContent>
              {dept.recent_publications.length === 0 ? (
                <p className="text-sm text-muted-foreground">No publications yet. Publish research outcomes from your solutions work.</p>
              ) : (
                <div className="space-y-2">
                  {dept.recent_publications.map(pub => (
                    <div key={pub.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                      <div>
                        <p className="text-sm font-medium">{pub.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {pub.publication_code} • {pub.paper_type}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Recommendations + Comparison */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What To Do Next</CardTitle>
            </CardHeader>
            <CardContent>
              {dept.recommendations.length === 0 ? (
                <p className="text-sm text-green-600 font-medium">
                  All 9 metrics are active — your department is a Pioneer!
                </p>
              ) : (
                <ul className="space-y-2">
                  {dept.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Institutional Average Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">vs Institutional Average</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {([
                  ['Problems Identified', dept.metrics.problems_identified, dept.institutional_average.problems_identified],
                  ['Solutions Built', dept.metrics.solutions_built, dept.institutional_average.solutions_built],
                  ['Clients Engaged', dept.metrics.clients_engaged, dept.institutional_average.clients_engaged],
                  ['Revenue', dept.metrics.revenue_generated, dept.institutional_average.revenue_generated],
                  ['Publications', dept.metrics.publications, dept.institutional_average.publications],
                  ['Prototypes', dept.metrics.prototypes_built, dept.institutional_average.prototypes_built],
                  ['IP / Patents', dept.metrics.ip_retained, dept.institutional_average.ip_retained],
                  ['TRL 4+ Products', dept.metrics.trl4_products, dept.institutional_average.trl4_products],
                  ['Training Participants', dept.metrics.training_completed, dept.institutional_average.training_completed],
                ] as [string, number, number][]).map(([label, value, avg]) => {
                  const diff = avg > 0 ? ((value - avg) / avg) * 100 : value > 0 ? 100 : 0;
                  return (
                    <div key={label} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{label === 'Revenue' ? formatCurrency(value) : value}</span>
                        {diff !== 0 && (
                          <span className={`text-xs ${diff > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {diff > 0 ? '+' : ''}{Math.round(diff)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
