/**
 * Responses List Page
 */

'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useNPSResponses, useExportResponses } from '@/hooks/stakeholder-nps';
import { ResponseList } from '../_components/response-list';
import { ResponseFilters } from '../_components/response-filters';
import type { StakeholderType, NPSSegment } from '@/types/stakeholder-nps';

function ResponsesContent() {
  const searchParams = useSearchParams();
  const { selectedInstitutionId: institutionId } = useUserInstitutionAccess();
  const { exportResponses, loading: exporting } = useExportResponses();

  const filters = {
    institution_id: institutionId || '',
    stakeholder_type: (searchParams.get('stakeholder_type') as StakeholderType) || undefined,
    sentiment: (searchParams.get('sentiment') as NPSSegment) || undefined,
    survey_id: searchParams.get('survey_id') || undefined,
    page: parseInt(searchParams.get('page') || '1', 10),
    limit: 50,
  };

  const { data, isLoading, error } = useNPSResponses(filters);

  const handleExport = async () => {
    if (!data?.data || data.data.length === 0) return;

    try {
      await exportResponses(
        filters.survey_id || 'all-surveys',
        `responses-${new Date().toISOString().split('T')[0]}`
      );
    } catch (error) {
      console.error('[ResponsesPage] Export failed:', error);
    }
  };

  if (!institutionId) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            You need to be assigned to an institution to view responses.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center space-x-4">
              <Skeleton className="h-12 w-12 rounded" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-[300px]" />
                <Skeleton className="h-4 w-[250px]" />
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
          <p className="text-destructive font-medium">Failed to load responses</p>
          <p className="text-muted-foreground text-sm mt-1">
            {error.message || 'An unexpected error occurred'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const hasResponses = data?.data && data.data.length > 0;

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      {data?.metadata && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Responses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.metadata.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Current Page
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data.metadata.page} / {data.metadata.totalPages}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={!hasResponses || exporting}
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Response List */}
      <ResponseList responses={data?.data || []} />
    </div>
  );
}

export default function ResponsesPage() {
  return (
    <ContentLayout title="NPS Responses">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Stakeholder NPS', href: '/stakeholder-nps' },
          { label: 'Responses', href: '/stakeholder-nps/responses' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold">NPS Responses</h1>
            <p className="text-muted-foreground">
              View and analyze stakeholder feedback
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponseFilters />
          </CardContent>
        </Card>

        {/* Content */}
        <Suspense
          fallback={
            <Card>
              <CardContent className="p-6 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-12 w-12 rounded" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-[300px]" />
                      <Skeleton className="h-4 w-[250px]" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          }
        >
          <ResponsesContent />
        </Suspense>
      </div>
    </ContentLayout>
  );
}
