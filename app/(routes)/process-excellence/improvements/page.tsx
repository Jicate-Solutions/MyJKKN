/**
 * Process Improvements Page
 *
 * Shows improvement insights derived from real audit data (findings, recommendations,
 * ABCD ratings) and process metrics. There is no dedicated "improvements" table, so
 * this page aggregates data from audits and metrics to surface actionable improvements.
 */

'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useProcessAudits,
  useProcessExcellenceDashboard
} from '@/hooks/process-excellence';
import {
  ABCD_RATING_LABELS,
  ABCD_RATING_COLORS
} from '@/types/process-excellence';
import type { ABCDRating } from '@/types/process-excellence';
import {
  TrendingUp,
  Lightbulb,
  CheckCircle,
  Clock,
  Plus,
  Users,
  FileText
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  finalized: 'bg-green-100 text-green-700',
  in_review: 'bg-blue-100 text-blue-700',
  draft: 'bg-gray-100 text-gray-700',
};

const STATUS_LABELS: Record<string, string> = {
  finalized: 'Finalized',
  in_review: 'In Review',
  draft: 'Draft',
};

export default function ProcessImprovementsPage() {
  const { selectedInstitutionId } = useUserInstitutionAccess();

  // Fetch audits which contain findings and recommendations (improvement data)
  const { data: auditsData, isLoading: auditsLoading, error: auditsError } = useProcessAudits({
    institution_id: selectedInstitutionId || undefined,
    limit: 50,
    sortBy: 'created_at',
    sortDirection: 'desc'
  });

  // Fetch dashboard for summary metrics
  const { data: dashboardData, isLoading: dashboardLoading } =
    useProcessExcellenceDashboard(selectedInstitutionId || '');

  const isLoading = auditsLoading || dashboardLoading;
  const audits = auditsData?.data ?? [];

  // Derive improvement stats from audits
  const finalizedAudits = audits.filter(a => a.status === 'finalized');
  const draftAudits = audits.filter(a => a.status === 'draft');
  const inReviewAudits = audits.filter(a => a.status === 'in_review');
  const auditsWithRecommendations = audits.filter(a => a.recommendations && a.recommendations.trim() !== '');

  // Count audits by ABCD rating
  const ratingCounts = finalizedAudits.reduce((acc, audit) => {
    if (audit.abcd_rating) {
      acc[audit.abcd_rating] = (acc[audit.abcd_rating] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  return (
    <ContentLayout title="Process Improvements">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Process Excellence', href: '/process-excellence' },
          { label: 'Improvements' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Process Improvements</h1>
            <p className="text-sm text-muted-foreground">
              Track and manage continuous improvement initiatives from audit findings
            </p>
          </div>
          <Button asChild>
            <Link href="/process-excellence/audits/new">
              <Plus className="mr-2 h-4 w-4" />
              New Audit
            </Link>
          </Button>
        </div>

        {!selectedInstitutionId ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Please select an institution to view improvements.
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : auditsError ? (
          <Card>
            <CardContent className="py-10 text-center text-destructive">
              Failed to load improvement data. Please try again.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Finalized Audits</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {finalizedAudits.length}
                  </div>
                  <p className="text-xs text-muted-foreground">Completed assessments</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">In Review</CardTitle>
                  <Clock className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {inReviewAudits.length}
                  </div>
                  <p className="text-xs text-muted-foreground">Active reviews</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recommendations</CardTitle>
                  <Lightbulb className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {auditsWithRecommendations.length}
                  </div>
                  <p className="text-xs text-muted-foreground">Audits with actions</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Draft Audits</CardTitle>
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {draftAudits.length}
                  </div>
                  <p className="text-xs text-muted-foreground">Pending completion</p>
                </CardContent>
              </Card>
            </div>

            {/* ABCD Rating Distribution */}
            {Object.keys(ratingCounts).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>ABCD Rating Distribution</CardTitle>
                  <CardDescription>Performance ratings from finalized audits</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 flex-wrap">
                    {(['A', 'B', 'C', 'D'] as ABCDRating[]).map((rating) => (
                      <div key={rating} className="flex items-center gap-2 p-3 border rounded-lg min-w-[120px]">
                        <Badge
                          style={{
                            backgroundColor: ABCD_RATING_COLORS[rating],
                            color: 'white'
                          }}
                          className="text-lg px-3 py-1"
                        >
                          {rating}
                        </Badge>
                        <div>
                          <div className="text-xl font-bold">{ratingCounts[rating] || 0}</div>
                          <div className="text-xs text-muted-foreground">
                            {ABCD_RATING_LABELS[rating]}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Process Improvement Insights from Audits */}
            <Card>
              <CardHeader>
                <CardTitle>Improvement Insights from Audits</CardTitle>
                <CardDescription>
                  Findings and recommendations from process audits drive continuous improvement
                </CardDescription>
              </CardHeader>
              <CardContent>
                {audits.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p>No audits found. Create an audit to generate improvement insights.</p>
                    <Button variant="outline" className="mt-4" asChild>
                      <Link href="/process-excellence/audits/new">
                        <Plus className="mr-2 h-4 w-4" />
                        Create First Audit
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {audits.map((audit) => {
                      const processName = (audit as any).process?.name || 'Unknown Process';
                      const processCategory = (audit as any).process?.category || '';

                      return (
                        <div key={audit.id} className="flex items-start justify-between p-4 rounded-lg border">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link
                                href={`/process-excellence/audits/${audit.id}`}
                                className="font-medium hover:underline"
                              >
                                {processName}
                              </Link>
                              {audit.abcd_rating && (
                                <Badge
                                  style={{
                                    backgroundColor: ABCD_RATING_COLORS[audit.abcd_rating as ABCDRating],
                                    color: 'white'
                                  }}
                                >
                                  {audit.abcd_rating}: {ABCD_RATING_LABELS[audit.abcd_rating as ABCDRating]}
                                </Badge>
                              )}
                              {processCategory && (
                                <Badge variant="outline" className="capitalize">
                                  {processCategory}
                                </Badge>
                              )}
                            </div>

                            {/* Period */}
                            <p className="text-sm text-muted-foreground">
                              {new Date(audit.audit_period_start).toLocaleDateString()} -{' '}
                              {new Date(audit.audit_period_end).toLocaleDateString()}
                              {audit.total_instances > 0 && (
                                <span> | {audit.total_instances} instances reviewed</span>
                              )}
                            </p>

                            {/* Metrics summary */}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                              {audit.sla_compliance_rate != null && (
                                <span>SLA: {audit.sla_compliance_rate.toFixed(1)}%</span>
                              )}
                              {audit.avg_value_add_ratio != null && (
                                <span>Value-Add: {audit.avg_value_add_ratio.toFixed(1)}%</span>
                              )}
                              {audit.avg_cycle_hours != null && (
                                <span>Avg Cycle: {audit.avg_cycle_hours.toFixed(1)}h</span>
                              )}
                            </div>

                            {/* Findings */}
                            {audit.findings && (
                              <div className="mt-2">
                                <span className="text-xs font-medium text-muted-foreground">Findings: </span>
                                <span className="text-sm">{audit.findings.substring(0, 200)}{audit.findings.length > 200 ? '...' : ''}</span>
                              </div>
                            )}

                            {/* Recommendations */}
                            {audit.recommendations && (
                              <div className="mt-1">
                                <span className="text-xs font-medium text-blue-600">Recommendations: </span>
                                <span className="text-sm">{audit.recommendations.substring(0, 200)}{audit.recommendations.length > 200 ? '...' : ''}</span>
                              </div>
                            )}

                            {/* Auditor */}
                            {(audit as any).auditor && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                <Users className="h-3 w-3" />
                                <span>
                                  {(audit as any).auditor.first_name} {(audit as any).auditor.last_name}
                                </span>
                              </div>
                            )}
                          </div>

                          <Badge className={STATUS_COLORS[audit.status] || 'bg-gray-100 text-gray-700'}>
                            {STATUS_LABELS[audit.status] || audit.status}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dashboard metrics context */}
            {dashboardData?.summary && (
              <Card>
                <CardHeader>
                  <CardTitle>Current Performance Context</CardTitle>
                  <CardDescription>
                    Overall metrics that inform improvement priorities
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="p-4 border rounded-lg text-center">
                      <div className="text-2xl font-bold">
                        {(dashboardData.summary.sla_compliance_rate ?? 0).toFixed(1)}%
                      </div>
                      <div className="text-sm text-muted-foreground">SLA Compliance</div>
                    </div>
                    <div className="p-4 border rounded-lg text-center">
                      <div className="text-2xl font-bold">
                        {(dashboardData.summary.avg_value_add_ratio ?? 0).toFixed(1)}%
                      </div>
                      <div className="text-sm text-muted-foreground">Avg Value-Add Ratio</div>
                    </div>
                    <div className="p-4 border rounded-lg text-center">
                      <div className="text-2xl font-bold">
                        {dashboardData.summary.open_waste_incidents}
                      </div>
                      <div className="text-sm text-muted-foreground">Open Waste Incidents</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </ContentLayout>
  );
}
