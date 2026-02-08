'use client';

// ============================================================================
// Alumni Dashboard
// Overview of alumni outcomes with summary statistics
// Phase P4.1 - Accountability
// ============================================================================

import Link from 'next/link';
import { Users, Briefcase, GraduationCap, Lightbulb, Target, TrendingUp, CheckCircle, Clock } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useAlumniDashboardStats } from '@/hooks/alumni';
import { OUTCOME_TYPE_LABELS, SALARY_RANGE_LABELS } from '@/types/alumni';
import type { OutcomeType, SalaryRange } from '@/types/alumni';

const OUTCOME_ICONS: Record<OutcomeType, React.ReactNode> = {
  employed: <Briefcase className="h-4 w-4" />,
  self_employed: <Target className="h-4 w-4" />,
  entrepreneur: <Lightbulb className="h-4 w-4" />,
  higher_studies: <GraduationCap className="h-4 w-4" />,
  competitive_exams: <GraduationCap className="h-4 w-4" />,
  family_business: <Briefcase className="h-4 w-4" />,
  gap_year: <Clock className="h-4 w-4" />,
  seeking: <Clock className="h-4 w-4" />,
  unknown: <Users className="h-4 w-4" />
};

const OUTCOME_COLORS: Record<OutcomeType, string> = {
  employed: 'bg-green-100 text-green-800',
  self_employed: 'bg-amber-100 text-amber-800',
  entrepreneur: 'bg-purple-100 text-purple-800',
  higher_studies: 'bg-blue-100 text-blue-800',
  competitive_exams: 'bg-cyan-100 text-cyan-800',
  family_business: 'bg-orange-100 text-orange-800',
  gap_year: 'bg-slate-100 text-slate-800',
  seeking: 'bg-red-100 text-red-800',
  unknown: 'bg-gray-100 text-gray-800'
};

export default function AlumniDashboardPage() {
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const {
    data: stats,
    isLoading: statsLoading
  } = useAlumniDashboardStats(institutionId);

  if (permissionsLoading || institutionsLoading) {
    return (
      <ContentLayout title="Alumni Outcomes">
        <div className="flex items-center justify-center min-h-[400px]">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Alumni Outcomes">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Accountability', href: '/alumni' },
          { label: 'Alumni Dashboard', href: '/alumni' }
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Alumni Outcomes</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Track graduate outcomes and program accountability
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" asChild>
              <Link href="/alumni/effectiveness">
                <TrendingUp className="mr-2 h-4 w-4" />
                Program Effectiveness
              </Link>
            </Button>
            <Button asChild>
              <Link href="/alumni/outcomes/new">
                <Users className="mr-2 h-4 w-4" />
                Record Outcome
              </Link>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {statsLoading ? (
          <div className="flex justify-center items-center p-8">
            <BeatLoader color="#00e902" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Alumni Tracked
                  </CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.total_tracked || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {stats?.verified_count || 0} verified, {stats?.pending_count || 0} pending
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Employment Rate
                  </CardTitle>
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {stats?.employment_percentage || 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Employed + Self-Employed
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Program Relevance
                  </CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {stats?.avg_relevance_percentage || 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Working in their field of study
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Avg Satisfaction
                  </CardTitle>
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats?.average_satisfaction || 0}/10
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Alumni satisfaction score
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Outcome Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Outcome Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {stats?.by_outcome_type && Object.entries(stats.by_outcome_type).map(([type, count]) => (
                    <div
                      key={type}
                      className="flex flex-col items-center p-4 rounded-lg border"
                    >
                      <div className={`p-2 rounded-full ${OUTCOME_COLORS[type as OutcomeType]} mb-2`}>
                        {OUTCOME_ICONS[type as OutcomeType]}
                      </div>
                      <span className="text-2xl font-bold">{count}</span>
                      <span className="text-xs text-muted-foreground text-center">
                        {OUTCOME_TYPE_LABELS[type as OutcomeType]}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Salary Distribution */}
            {stats?.by_salary_range && Object.keys(stats.by_salary_range).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Salary Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(stats.by_salary_range).map(([range, count]) => {
                      const pct = stats.total_tracked > 0
                        ? Math.round((count / stats.total_tracked) * 100)
                        : 0;
                      return (
                        <div key={range} className="flex items-center gap-4">
                          <div className="w-28 text-sm font-medium">
                            {SALARY_RANGE_LABELS[range as SalaryRange] || range}
                          </div>
                          <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                          </div>
                          <div className="w-16 text-sm text-right text-muted-foreground">
                            {count} ({pct}%)
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="hover:shadow-md transition-shadow">
                <Link href="/alumni/outcomes">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-100 rounded-lg">
                        <Users className="h-6 w-6 text-blue-700" />
                      </div>
                      <div>
                        <h3 className="font-semibold">View All Outcomes</h3>
                        <p className="text-sm text-muted-foreground">
                          Browse and filter individual alumni outcomes
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Link>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <Link href="/alumni/effectiveness">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-green-100 rounded-lg">
                        <TrendingUp className="h-6 w-6 text-green-700" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Program Effectiveness</h3>
                        <p className="text-sm text-muted-foreground">
                          Analyze program outcomes and effectiveness scores
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            </div>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
