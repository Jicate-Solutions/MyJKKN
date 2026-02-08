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
import type { OutcomeCorrelationFilters, OutcomeProgramCorrelation } from '@/types/alumni';

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
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const [academicYear, setAcademicYear] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  // Generate academic year options
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 10 }, (_, i) => {
    const y = currentYear - i;
    return `${y - 1}-${String(y).slice(-2)}`;
  });

  const filters: OutcomeCorrelationFilters = useMemo(() => ({
    institution_id: institutionId,
    academic_year: academicYear,
    page,
    limit: 20
  }), [institutionId, academicYear, page]);

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
              value={academicYear || 'all'}
              onValueChange={(v) => { setAcademicYear(v === 'all' ? undefined : v); setPage(1); }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Academic Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={year}>{year}</SelectItem>
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
  const placementPct = c.total_graduates > 0
    ? Math.round(((c.employed_count ?? 0) / c.total_graduates) * 100)
    : 0;
  const higherStudiesPct = c.total_graduates > 0
    ? Math.round((c.higher_studies_count / c.total_graduates) * 100)
    : 0;
  const entrepreneurPct = c.total_graduates > 0
    ? Math.round((c.entrepreneur_count / c.total_graduates) * 100)
    : 0;

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
                  {c.academic_year} &middot; {c.total_graduates} graduates
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
                <p className="text-xs text-muted-foreground">{c.placed_count} of {c.total_graduates}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <GraduationCap className="h-3 w-3" />
                  Higher Studies
                </div>
                <p className="text-xl font-bold text-blue-600">{higherStudiesPct}%</p>
                <p className="text-xs text-muted-foreground">{c.higher_studies_count} of {c.total_graduates}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Target className="h-3 w-3" />
                  Core Domain
                </div>
                <p className="text-xl font-bold text-purple-600">
                  {c.core_domain_percentage !== null ? `${c.core_domain_percentage}%` : '--'}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  Avg Salary
                </div>
                <p className="text-xl font-bold">
                  {c.average_salary_lpa !== null ? `${c.average_salary_lpa} LPA` : '--'}
                </p>
                {c.median_salary_lpa !== null && (
                  <p className="text-xs text-muted-foreground">Median: {c.median_salary_lpa} LPA</p>
                )}
              </div>
            </div>

            {/* Additional stats */}
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
              {c.average_time_to_placement_days !== null && (
                <span>Avg placement time: {c.average_time_to_placement_days} days</span>
              )}
              {c.satisfaction_average !== null && (
                <span>Satisfaction: {c.satisfaction_average}/10</span>
              )}
              {c.entrepreneur_count > 0 && (
                <span>Entrepreneurs: {c.entrepreneur_count}</span>
              )}
            </div>

            {/* Top Recruiters */}
            {c.top_recruiters && c.top_recruiters.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-1">Top Recruiters</p>
                <div className="flex flex-wrap gap-1">
                  {c.top_recruiters.slice(0, 5).map((r) => (
                    <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                  ))}
                  {c.top_recruiters.length > 5 && (
                    <Badge variant="outline" className="text-xs">
                      +{c.top_recruiters.length - 5} more
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Top Competencies */}
            {c.top_competencies && c.top_competencies.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-1">Key Competencies</p>
                <div className="flex flex-wrap gap-1">
                  {c.top_competencies.slice(0, 5).map((comp) => (
                    <Badge key={comp} variant="outline" className="text-xs">{comp}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Effectiveness Score */}
          <div className="flex flex-col items-center justify-center lg:border-l lg:pl-6 min-w-[140px]">
            <p className="text-xs text-muted-foreground mb-2">Effectiveness Score</p>
            <div className={`text-4xl font-bold ${getEffectivenessColor(c.effectiveness_score ? Number(c.effectiveness_score) : null)}`}>
              {c.effectiveness_score !== null ? Number(c.effectiveness_score).toFixed(0) : '--'}
            </div>
            <p className="text-xs mt-1">
              <Badge
                variant="outline"
                className={getEffectivenessColor(c.effectiveness_score ? Number(c.effectiveness_score) : null)}
              >
                {getEffectivenessLabel(c.effectiveness_score ? Number(c.effectiveness_score) : null)}
              </Badge>
            </p>
            {c.effectiveness_score !== null && (
              <div className="w-full mt-3">
                <Progress value={Number(c.effectiveness_score)} className="h-2" />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
