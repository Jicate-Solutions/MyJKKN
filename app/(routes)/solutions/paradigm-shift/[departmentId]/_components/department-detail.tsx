'use client';

import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ExternalLink, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useParadigmShiftDepartment } from '@/hooks/solutions/use-paradigm-shift';
import { TierBadge } from '../../_components/tier-badge';
import { MetricCard } from '../../_components/metric-card';
import type { DepartmentDetail as DeptDetailType } from '@/lib/services/solutions/paradigm-shift-service';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function DepartmentDetailView() {
  const params = useParams();
  const router = useRouter();
  const departmentId = params.departmentId as string;

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
          </div>
          <p className="text-muted-foreground mt-1">
            {dept.institution_name} &bull; {dept.active_metrics_count}/9 metrics active
          </p>
        </div>
      </div>

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
              <div className="space-y-1">
                {dept.monthly_timeline.map(month => (
                  <div key={month.month} className="flex items-center gap-3 text-sm">
                    <span className="w-16 text-muted-foreground font-mono text-xs">{month.month}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <div
                        className="h-4 bg-blue-200 rounded"
                        style={{ width: `${Math.min(month.solutions * 20, 100)}%`, minWidth: month.solutions > 0 ? 8 : 0 }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {month.solutions} sol, {month.discovery_visits} visits
                        {month.revenue > 0 ? `, ${formatCurrency(month.revenue)}` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
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
                  ['Solutions Built', dept.metrics.solutions_built, dept.institutional_average.solutions_built],
                  ['Clients Engaged', dept.metrics.clients_engaged, dept.institutional_average.clients_engaged],
                  ['Revenue', dept.metrics.revenue_generated, dept.institutional_average.revenue_generated],
                  ['Publications', dept.metrics.publications, dept.institutional_average.publications],
                  ['TRL 4+ Products', dept.metrics.trl4_products, dept.institutional_average.trl4_products],
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
