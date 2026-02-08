'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Plus, Users, TrendingUp, Award, Briefcase, Clock } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { useFacilitatorDevelopmentStats } from '@/hooks/facilitator';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  STAGE_LABELS,
  STAGE_COLORS,
  type DevelopmentStage
} from '@/types/facilitator-development';

export default function FacilitatorDevelopmentDashboard() {
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const canView = isSuperAdmin || canAccess('facilitator_development', 'view');

  const {
    data: stats,
    isLoading: statsLoading
  } = useFacilitatorDevelopmentStats(institutionId);

  if (permissionsLoading || institutionsLoading) {
    return (
      <ContentLayout title='Facilitator Development'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canView) {
    return (
      <ContentLayout title='Facilitator Development'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view facilitator development.
          </p>
        </div>
      </ContentLayout>
    );
  }

  const totalRecords = stats?.total_records || 0;
  const activeCount = stats?.active_count || 0;
  const avgScore = stats?.avg_outcome_score || 0;
  const totalImmersions = stats?.total_immersions || 0;
  const totalHours = stats?.total_industry_hours || 0;

  // Stage distribution data for display
  const stageEntries = stats?.by_stage
    ? (Object.entries(stats.by_stage) as [DevelopmentStage, number][])
    : [];
  // Ensure totalForPercentage is never 0 to avoid division by zero
  const totalForPercentage = Math.max(1, stageEntries.reduce((sum, [, count]) => sum + count, 0));

  return (
    <ContentLayout title='Facilitator Development'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Facilitator Development', href: '/facilitator-development' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Facilitator Development</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Track staff development journey from teacher to facilitator
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            <Button variant='outline' asChild>
              <Link href='/facilitator-development/immersions'>
                <Briefcase className='mr-2 h-4 w-4' />
                All Immersions
              </Link>
            </Button>
            <Button asChild>
              <Link href='/facilitator-development/records/new'>
                <Plus className='mr-2 h-4 w-4' />
                New Development Plan
              </Link>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Plans</CardTitle>
              <Users className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {statsLoading ? <BeatLoader size={8} color='#00e902' /> : totalRecords}
              </div>
              <p className='text-xs text-muted-foreground'>
                {activeCount} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Avg Score</CardTitle>
              <TrendingUp className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {statsLoading ? <BeatLoader size={8} color='#00e902' /> : avgScore > 0 ? avgScore.toFixed(1) : '0'}
              </div>
              <p className='text-xs text-muted-foreground'>
                Outcome score /100
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Immersions</CardTitle>
              <Briefcase className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {statsLoading ? <BeatLoader size={8} color='#00e902' /> : totalImmersions}
              </div>
              <p className='text-xs text-muted-foreground'>
                Industry placements
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Industry Hours</CardTitle>
              <Clock className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {statsLoading ? <BeatLoader size={8} color='#00e902' /> : totalHours}
              </div>
              <p className='text-xs text-muted-foreground'>
                Total exposure
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Workshops</CardTitle>
              <Award className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {statsLoading ? <BeatLoader size={8} color='#00e902' /> : stats?.avg_workshops_attended?.toFixed(1) || '0'}
              </div>
              <p className='text-xs text-muted-foreground'>
                Avg per facilitator
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Stage Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className='text-lg'>Stage Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className='flex justify-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <div className='space-y-4'>
                {stageEntries.map(([stage, count]) => {
                  const percentage = Math.round((count / totalForPercentage) * 100);
                  return (
                    <div key={stage} className='space-y-2'>
                      <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-2'>
                          <Badge className={STAGE_COLORS[stage]}>
                            {STAGE_LABELS[stage]}
                          </Badge>
                          <span className='text-sm text-muted-foreground'>
                            {count} {count === 1 ? 'person' : 'people'}
                          </span>
                        </div>
                        <span className='text-sm font-medium'>{percentage}%</span>
                      </div>
                      <div className='w-full bg-gray-200 rounded-full h-2'>
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            stage === 'teacher' ? 'bg-gray-500' :
                            stage === 'transitioning' ? 'bg-amber-500' :
                            stage === 'facilitator' ? 'bg-blue-500' :
                            'bg-emerald-500'
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {stageEntries.length === 0 && (
                  <div className='text-center py-8 text-muted-foreground'>
                    <p>No development records yet.</p>
                    <Button asChild className='mt-4'>
                      <Link href='/facilitator-development/records/new'>
                        Create First Development Plan
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <Card className='hover:shadow-md transition-shadow cursor-pointer'>
            <Link href='/facilitator-development/records'>
              <CardContent className='p-6'>
                <div className='flex items-center gap-4'>
                  <div className='p-3 bg-blue-100 rounded-lg'>
                    <Users className='h-6 w-6 text-blue-700' />
                  </div>
                  <div>
                    <h3 className='font-semibold'>All Development Records</h3>
                    <p className='text-sm text-muted-foreground'>
                      View and manage all facilitator development plans
                    </p>
                  </div>
                </div>
              </CardContent>
            </Link>
          </Card>

          <Card className='hover:shadow-md transition-shadow cursor-pointer'>
            <Link href='/facilitator-development/immersions'>
              <CardContent className='p-6'>
                <div className='flex items-center gap-4'>
                  <div className='p-3 bg-emerald-100 rounded-lg'>
                    <Briefcase className='h-6 w-6 text-emerald-700' />
                  </div>
                  <div>
                    <h3 className='font-semibold'>Industry Immersions</h3>
                    <p className='text-sm text-muted-foreground'>
                      Track industry placements and learnings
                    </p>
                  </div>
                </div>
              </CardContent>
            </Link>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
