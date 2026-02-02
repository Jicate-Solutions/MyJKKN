'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, AlertCircle } from 'lucide-react';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useNPSSurveys } from '@/hooks/stakeholder-nps';
import { SurveyList } from '../_components/survey-list';
import { SurveyFilters } from '../_components/survey-filters';
import type { StakeholderType, SurveyStatus } from '@/types/stakeholder-nps';

function SurveysContent() {
  const searchParams = useSearchParams();
  const { selectedInstitutionId: institutionId } = useUserInstitutionAccess();

  const filters = {
    institution_id: institutionId || '',
    search: searchParams.get('search') || undefined,
    stakeholder_type: (searchParams.get('stakeholder_type') as StakeholderType) || undefined,
    status: (searchParams.get('status') as SurveyStatus) || undefined,
    page: parseInt(searchParams.get('page') || '1', 10),
    limit: 10,
  };

  const { data, isLoading, error } = useNPSSurveys(filters);

  if (!institutionId) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            You need to be assigned to an institution to view surveys.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center space-x-4">
              <Skeleton className="h-12 w-12 rounded" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <p className="text-destructive font-medium">Failed to load surveys</p>
          <p className="text-muted-foreground text-sm mt-1">
            {error.message || 'An unexpected error occurred'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return <SurveyList surveys={data?.data || []} />;
}

export default function SurveysPage() {
  return (
    <ContentLayout title="NPS Surveys">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Stakeholder NPS', href: '/stakeholder-nps' },
          { label: 'Surveys', href: '/stakeholder-nps/surveys' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold">NPS Surveys</h1>
            <p className="text-muted-foreground">
              Manage your Net Promoter Score surveys
            </p>
          </div>
          <Button asChild>
            <Link href="/stakeholder-nps/surveys/new">
              <Plus className="mr-2 h-4 w-4" />
              New Survey
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <SurveyFilters />
          </CardContent>
        </Card>

        {/* Survey List */}
        <Suspense
          fallback={
            <Card>
              <CardContent className="p-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-12 w-12 rounded" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-[250px]" />
                      <Skeleton className="h-4 w-[200px]" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          }
        >
          <SurveysContent />
        </Suspense>
      </div>
    </ContentLayout>
  );
}
