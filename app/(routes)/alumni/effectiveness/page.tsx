'use client';

// ============================================================================
// Program Effectiveness Dashboard
// Shows program-level outcome correlations and effectiveness scores
// Phase P4.1 - Accountability
// ============================================================================

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, Users, Briefcase, GraduationCap, Target, BarChart3, RefreshCw } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { BeatLoader } from 'react-spinners';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useOutcomeCorrelations } from '@/hooks/alumni';
import { SALARY_RANGE_LABELS } from '@/types/alumni';
import type { OutcomeCorrelationFilters, OutcomeProgramCorrelation, SalaryRange } from '@/types/alumni';

function getEffectivenessColor(score: number | null): string {
  if (!score) return 'text-muted-foreground';
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-blue-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-600';
}

function getEffectivenessLabel(score: number | null): string {
  if (!score) return 'No Data';
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Average';
  return 'Needs Improvement';
}

export default function ProgramEffectivenessPage() {
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';
  const canView = isSuperAdmin || canAccess('alumni.effectiveness', 'view');

  const [cohortYear, setCohortYear] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - i);

  const filters: OutcomeCorrelationFilters = useMemo(() => ({
    institution_id: institutionId,
    cohort_year: cohortYear,
    page,
    limit: 20
  }), [institutionId, cohortYear, page]);

  const {
    data,
    isLoading: correlationsLoading,
    error,
    refetch
  } = useOutcomeCorrelations(filters);

  const correlations = data?.data || [];
  const metadata = data?.metadata || { total: 0, page: 1, limit: 20, totalPages: 1 };
  const loading = correlationsLoading || institutionsLoading;

  if (permissionsLoading || institutionsLoading) {
    return (
      <ContentLayout title="Program Effectiveness">
        <div className="flex items-center justify-center min-h-[400px]">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  if (!canView) {
    return (
      <ContentLayout title="Program Effectiveness">
        <div className="text-center py-8">
          <p className="text-destructive">
            You don&apos;t have permission to view program effectiveness.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Program Effectiveness">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Accountability', href: '/alumni' },
          { label: 'Program Effectiveness', href: '/alumni/effectiveness' }
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/alumni">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold py-1">Program Effectiveness</h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Outcome metrics and effectiveness scores by program
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Select
              value={cohortYear ? String(cohortYear) : 'all'}
              onValueChange={(v) => { setCohortYear(v === 'all' ? undefined : Number(v)); setPage(1); }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Cohort Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center items-center p-8">
            <BeatLoader color="#00e902" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-destructive">{error.message}</p>
              <Button variant="outline" onClick={() => refetch()} className="mt-4">
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : correlations.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Program Data Yet</h3>
              <p className="text-muted-foreground mb-4">
                Program effectiveness data is computed from alumni outcomes.
                Start by recording alumni outcomes first.
              </p>
              <Button asChild>
                <Link href="/alumni/outcomes/new">Record Outcome</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {correlations.map((corr) => (
              <ProgramCard key={corr.id} correlation={corr} />
            ))}

            {/* Pagination */}
            {metadata.totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {((metadata.page - 1) * metadata.limit) + 1}-{Math.min(metadata.page * metadata.limit, metadata.total)} of {metadata.total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= metadata.totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}

// ============================================================================
// Program Card Component
// ============================================================================

function ProgramCard({ correlation }: { correlation: OutcomeProgramCorrelation }) {
  const c = correlation;
  const employedCount = (c.employed_count ?? 0) + (c.self_employed_count ?? 0);
  const placementPct = c.total_graduates > 0
    ? Math.round((employedCount / c.total_graduates) * 100)
    : 0;
  const higherStudiesPct = c.total_graduates > 0
    ? Math.round(((c.higher_studies_count ?? 0) / c.total_graduates) * 100)
    : 0;
  const entrepreneurPct = c.total_graduates > 0
    ? Math.round(((c.entrepreneur_count ?? 0) / c.total_graduates) * 100)
    : 0;

  // Compute a simple effectiveness score from available data
  const effectivenessScore = c.employment_rate ?? (placementPct + higherStudiesPct + entrepreneurPct);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Program Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {c.program?.program_name || 'Unknown Program'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Cohort {c.cohort_year} &middot; {c.total_graduates} graduates
                </p>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Briefcase className="h-3 w-3" />
                  Placed
                </div>
                <p className="text-xl font-bold text-green-600">{placementPct}%</p>
                <p className="text-xs text-muted-foreground">{employedCount} of {c.total_graduates}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <GraduationCap className="h-3 w-3" />
                  Higher Studies
                </div>
                <p className="text-xl font-bold text-blue-600">{higherStudiesPct}%</p>
                <p className="text-xs text-muted-foreground">{c.higher_studies_count ?? 0} of {c.total_graduates}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Target className="h-3 w-3" />
                  Program Relevance
                </div>
                <p className="text-xl font-bold text-purple-600">
                  {c.avg_relevance_percentage !== null ? `${c.avg_relevance_percentage}%` : '--'}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  Avg Salary
                </div>
                <p className="text-xl font-bold">
                  {c.average_salary_range ? SALARY_RANGE_LABELS[c.average_salary_range] : '--'}
                </p>
                {c.median_salary_range && (
                  <p className="text-xs text-muted-foreground">Median: {SALARY_RANGE_LABELS[c.median_salary_range]}</p>
                )}
              </div>
            </div>

            {/* Additional stats */}
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
              {c.avg_days_to_placement !== null && (
                <span>Avg placement time: {c.avg_days_to_placement} days</span>
              )}
              {c.program_satisfaction_avg !== null && (
                <span>Satisfaction: {c.program_satisfaction_avg}/10</span>
              )}
              {(c.entrepreneur_count ?? 0) > 0 && (
                <span>Entrepreneurs: {c.entrepreneur_count}</span>
              )}
            </div>

            {/* Top Employers */}
            {c.top_employers && Array.isArray(c.top_employers) && c.top_employers.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-1">Top Employers</p>
                <div className="flex flex-wrap gap-1">
                  {c.top_employers.slice(0, 5).map((r: any, idx: number) => (
                    <Badge key={`employer-${idx}-${r.company || r}`} variant="secondary" className="text-xs">
                      {r.company || r}
                    </Badge>
                  ))}
                  {c.top_employers.length > 5 && (
                    <Badge variant="outline" className="text-xs">
                      +{c.top_employers.length - 5} more
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Top Roles */}
            {c.top_roles && Array.isArray(c.top_roles) && c.top_roles.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-1">Key Roles</p>
                <div className="flex flex-wrap gap-1">
                  {c.top_roles.slice(0, 5).map((role: any, idx: number) => (
                    <Badge key={`role-${idx}-${role.role || role}`} variant="outline" className="text-xs">
                      {role.role || role}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Effectiveness Score */}
          <div className="flex flex-col items-center justify-center lg:border-l lg:pl-6 min-w-[140px]">
            <p className="text-xs text-muted-foreground mb-2">Effectiveness Score</p>
            <div className={`text-4xl font-bold ${getEffectivenessColor(effectivenessScore)}`}>
              {effectivenessScore > 0 ? effectivenessScore.toFixed(0) : '--'}
            </div>
            <p className="text-xs mt-1">
              <Badge
                variant="outline"
                className={getEffectivenessColor(effectivenessScore > 0 ? effectivenessScore : null)}
              >
                {getEffectivenessLabel(effectivenessScore > 0 ? effectivenessScore : null)}
              </Badge>
            </p>
            {effectivenessScore > 0 && (
              <div className="w-full mt-3">
                <Progress value={Math.min(effectivenessScore, 100)} className="h-2" />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
