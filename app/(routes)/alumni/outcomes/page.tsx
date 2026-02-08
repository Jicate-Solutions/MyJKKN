'use client';

// ============================================================================
// Alumni Outcomes List
// Browse and filter individual alumni outcomes
// Phase P4.1 - Accountability
// ============================================================================

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Users, Search, Filter, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { useAlumniOutcomes } from '@/hooks/alumni';
import { OUTCOME_TYPE_LABELS, SALARY_RANGE_LABELS } from '@/types/alumni';
import type { OutcomeType, AlumniOutcomeFilters, SalaryRange } from '@/types/alumni';

const OUTCOME_BADGE_COLORS: Record<OutcomeType, string> = {
  employed: 'bg-green-100 text-green-800',
  self_employed: 'bg-amber-100 text-amber-800',
  higher_studies: 'bg-blue-100 text-blue-800',
  entrepreneur: 'bg-purple-100 text-purple-800',
  competitive_exams: 'bg-cyan-100 text-cyan-800',
  family_business: 'bg-orange-100 text-orange-800',
  gap_year: 'bg-yellow-100 text-yellow-800',
  seeking: 'bg-red-100 text-red-800',
  unknown: 'bg-gray-100 text-gray-800'
};

export default function AlumniOutcomesPage() {
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  // Filter state
  const [search, setSearch] = useState('');
  const [outcomeType, setOutcomeType] = useState<OutcomeType | undefined>(undefined);
  const [graduationYear, setGraduationYear] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);

  const filters: AlumniOutcomeFilters = useMemo(() => ({
    institution_id: institutionId,
    search: search || undefined,
    outcome_type: outcomeType,
    graduation_year: graduationYear,
    page,
    limit: 10,
    sort_by: 'created_at' as const,
    sort_order: 'desc' as const
  }), [institutionId, search, outcomeType, graduationYear, page]);

  const {
    data,
    isLoading: outcomesLoading,
    error,
    refetch
  } = useAlumniOutcomes(filters);

  const outcomes = data?.data || [];
  const metadata = data?.metadata || { total: 0, page: 1, limit: 10, totalPages: 1 };
  const loading = outcomesLoading || institutionsLoading;

  // Generate year options (last 10 years)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - i);

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
          { label: 'Alumni Outcomes', href: '/alumni/outcomes' }
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Alumni Outcomes</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Individual alumni outcome records
            </p>
          </div>
          <Button asChild>
            <Link href="/alumni/outcomes/new">
              <Plus className="mr-2 h-4 w-4" />
              Record New Outcome
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by company, designation, industry..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-10"
                />
              </div>
              <Select
                value={outcomeType || 'all'}
                onValueChange={(v) => { setOutcomeType(v === 'all' ? undefined : v as OutcomeType); setPage(1); }}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Outcome Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(OUTCOME_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={graduationYear?.toString() || 'all'}
                onValueChange={(v) => { setGraduationYear(v === 'all' ? undefined : parseInt(v, 10)); setPage(1); }}
              >
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Grad Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardContent className="p-6">
            {loading ? (
              <div className="flex justify-center items-center p-8">
                <BeatLoader color="#00e902" />
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-destructive">{error.message}</p>
                <Button variant="outline" onClick={() => refetch()} className="mt-4">
                  Try Again
                </Button>
              </div>
            ) : outcomes.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Outcomes Found</h3>
                <p className="text-muted-foreground mb-4">
                  {search || outcomeType || graduationYear
                    ? 'No matching outcomes. Try different filters.'
                    : 'Start tracking alumni outcomes by recording the first one.'}
                </p>
                <Button asChild>
                  <Link href="/alumni/outcomes/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Record Outcome
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {outcomes.map((outcome) => {
                    const displayName = outcome.learner
                      ? `${outcome.learner.first_name || ''} ${outcome.learner.last_name || ''}`.trim() || 'Unknown Alumni'
                      : 'Unknown Alumni';
                    const isVerified = outcome.verification_status !== 'pending'
                      && outcome.verification_status !== 'rejected';

                    return (
                      <Link
                        key={outcome.id}
                        href={`/alumni/outcomes/${outcome.id}`}
                        className="block"
                      >
                        <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium truncate">{displayName}</span>
                              {isVerified ? (
                                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                              ) : (
                                <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                              <span>Class of {outcome.graduation_year}</span>
                              {outcome.program?.program_name && (
                                <>
                                  <span className="text-muted-foreground/50">|</span>
                                  <span className="truncate">{outcome.program.program_name}</span>
                                </>
                              )}
                              {outcome.company_name && (
                                <>
                                  <span className="text-muted-foreground/50">|</span>
                                  <span className="truncate">{outcome.company_name}</span>
                                </>
                              )}
                              {outcome.designation && (
                                <>
                                  <span className="text-muted-foreground/50">-</span>
                                  <span className="truncate">{outcome.designation}</span>
                                </>
                              )}
                              {outcome.institution_name && (
                                <>
                                  <span className="text-muted-foreground/50">|</span>
                                  <span className="truncate">{outcome.institution_name}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4 shrink-0">
                            {outcome.salary_range && (
                              <Badge variant="outline" className="text-xs">
                                {SALARY_RANGE_LABELS[outcome.salary_range as SalaryRange] || outcome.salary_range}
                              </Badge>
                            )}
                            <Badge className={OUTCOME_BADGE_COLORS[outcome.outcome_type as OutcomeType] || 'bg-gray-100 text-gray-800'}>
                              {OUTCOME_TYPE_LABELS[outcome.outcome_type as OutcomeType] || outcome.outcome_type}
                            </Badge>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* Pagination */}
                {metadata.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-4 border-t">
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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
