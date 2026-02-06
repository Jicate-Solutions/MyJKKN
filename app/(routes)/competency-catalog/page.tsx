'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Award, TrendingUp, BookOpen, Shield } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import { CompetencyList } from './_components/competency-list';
import { CompetencyFilters } from './_components/competency-filters';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { useCompetencies, useCompetencyStats } from '@/hooks/competency';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import type { CompetencyType, CompetencyFilters as CompetencyFiltersType } from '@/types/competency';

export default function CompetencyCatalogPage() {
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  // Filter state
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<CompetencyType | undefined>(undefined);
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState(1);

  const canViewCatalog =
    isSuperAdmin || canAccess('competency.catalog', 'view');
  const canCreateCatalog =
    isSuperAdmin || canAccess('competency.catalog', 'create');

  // Build filters object for the hook
  const filters: CompetencyFiltersType = useMemo(() => ({
    institution_id: institutionId,
    search: search || undefined,
    competency_type: typeFilter,
    is_active: activeFilter,
    page,
    limit: 10,
    sort_by: 'competency_name',
    sort_order: 'asc' as const
  }), [institutionId, search, typeFilter, activeFilter, page]);

  // Fetch data
  const {
    data,
    isLoading: competenciesLoading,
    error,
    refetch
  } = useCompetencies(filters);

  const {
    data: stats,
    isLoading: statsLoading
  } = useCompetencyStats(institutionId);

  const competencies = data?.data || [];
  const metadata = data?.metadata || { total: 0, page: 1, limit: 10, totalPages: 1 };
  const loading = competenciesLoading || institutionsLoading;

  // Filter handlers
  const updateFilters = (updates: {
    search?: string;
    competency_type?: CompetencyType | undefined;
    is_active?: boolean | undefined;
  }) => {
    if (updates.search !== undefined) setSearch(updates.search);
    if ('competency_type' in updates) setTypeFilter(updates.competency_type);
    if ('is_active' in updates) setActiveFilter(updates.is_active);
    setPage(1);
  };

  const changePage = (newPage: number) => {
    setPage(newPage);
  };

  // Show loading state while permissions are loading
  if (permissionsLoading || institutionsLoading) {
    return (
      <ContentLayout title='Competency Catalog'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewCatalog) {
    return (
      <ContentLayout title='Competency Catalog'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view the competency catalog.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Competency Catalog'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error.message}</p>
          <Button
            variant='outline'
            onClick={() => refetch()}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Calculate summary statistics
  const totalCompetencies = stats?.total_competencies || 0;
  const activeCount = stats?.active_count || 0;
  const avgAiResistance = stats?.average_ai_resistance || 0;
  const programsMapped = stats?.programs_mapped || 0;

  return (
    <ContentLayout title='Competency Catalog'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Academic', href: '/academic' },
          { label: 'Competency Catalog', href: '/competency-catalog' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Competency Catalog</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage competencies, skill definitions, and learning outcomes
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {canCreateCatalog ? (
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/competency-catalog/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Create Competency
                </Link>
              </Button>
            ) : (
              <Button
                className='w-full sm:w-auto opacity-50'
                disabled
                variant='outline'
              >
                <Plus className='mr-2 h-4 w-4' />
                Create Competency
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Total Competencies
              </CardTitle>
              <Award className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{totalCompetencies}</div>
              <p className='text-xs text-muted-foreground'>
                All defined competencies
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                By Type
              </CardTitle>
              <BookOpen className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='flex flex-wrap gap-1'>
                {stats?.by_type && Object.entries(stats.by_type).map(([type, count]) => (
                  count > 0 && (
                    <Badge
                      key={type}
                      variant='outline'
                      className='text-xs'
                    >
                      {type.replace('_', ' ')}: {count}
                    </Badge>
                  )
                ))}
                {!stats?.by_type && <span className='text-sm text-muted-foreground'>--</span>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Active
              </CardTitle>
              <TrendingUp className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-green-600'>
                {activeCount}
              </div>
              <p className='text-xs text-muted-foreground'>
                {stats?.inactive_count || 0} archived
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Avg AI Resistance
              </CardTitle>
              <Shield className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {avgAiResistance > 0 ? avgAiResistance.toFixed(1) : '0'}/10
              </div>
              <p className='text-xs text-muted-foreground'>
                {programsMapped} mapped to programs
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className='p-6'>
            <CompetencyFilters
              filters={{
                search,
                competency_type: typeFilter,
                is_active: activeFilter
              }}
              onFilterChange={updateFilters}
            />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <CompetencyList
                competencies={competencies}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={() => refetch()}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
