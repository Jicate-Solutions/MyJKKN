'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useOrganizationDashboard } from '@/hooks/organization/use-organization-dashboard';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { StatsGrid } from './_components/stats-grid';

import { InstitutionFilter } from './_components/institution-filter';

export default function OrganizationDashboardPage() {
  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(
    null
  );
  const {
    data: stats,
    isLoading,
    error
  } = useOrganizationDashboard(selectedInstitution);

  return (
    <ContentLayout title='Organization Dashboard'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations Dashboard' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
          <div>
            <h1 className='text-2xl font-bold'>Organization Dashboard</h1>
            <p className='text-muted-foreground'>
              An overview of your organization&apos;s structure and entities.
            </p>
          </div>
          <InstitutionFilter
            selectedInstitution={selectedInstitution}
            onInstitutionChange={setSelectedInstitution}
          />
        </div>

        {isLoading && (
          <div className='flex items-center justify-center min-h-[400px]'>
            <Loader2 className='h-8 w-8 animate-spin text-primary' />
          </div>
        )}

        {error && (
          <Alert variant='destructive'>
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error.message || 'Failed to load dashboard data.'}
            </AlertDescription>
          </Alert>
        )}

        {stats && (
          <div className='space-y-8'>
            <StatsGrid stats={stats} />
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
