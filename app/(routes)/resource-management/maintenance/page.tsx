'use client';
// app/(routes)/resource-management/maintenance/page.tsx

import { Suspense, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Wrench } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MaintenanceStatsCards } from './_components/maintenance-stats-cards';
import { MaintenanceFilters } from './_components/maintenance-filters';
import { MaintenanceDataTable } from './_components/maintenance-data-table';
import { useMaintenanceStats } from '@/hooks/resource-management/use-maintenance';
import { MaintenanceStatus } from '@/types/maintenance';
import { useTabParam } from '@/hooks/use-tab-param';

const MAINTENANCE_TABS = [
  'all',
  MaintenanceStatus.SCHEDULED,
  MaintenanceStatus.IN_PROGRESS,
  MaintenanceStatus.COMPLETED,
  MaintenanceStatus.CANCELLED
] as const;

function MaintenancePageInner() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useTabParam('all', MAINTENANCE_TABS);

  const { data: stats, isLoading: statsLoading } = useMaintenanceStats();

  const handleClearFilters = () => {
    setTypeFilter('all');
    setStatusFilter('all');
    setPriorityFilter('all');
  };

  // Determine effective status filter based on active tab
  const effectiveStatusFilter = activeTab !== 'all' ? activeTab : statusFilter;

  return (
    <ContentLayout title='Maintenance Management'>
      <Breadcrumb className='mb-6'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/resource-management'>
              Resource Management
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Maintenance</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className='mb-6'>
        <h1 className='text-3xl font-bold flex items-center gap-2'>
          <Wrench className='h-8 w-8' />
          Maintenance Management
        </h1>
        <p className='text-muted-foreground'>
          Track and manage resource maintenance activities
        </p>
      </div>

      {/* Statistics Cards */}
      <div className='mb-8'>
        <MaintenanceStatsCards stats={stats || null} isLoading={statsLoading} />
      </div>

      {/* Filters (search is provided by the DataTable below) */}
      <div className='mb-6'>
        <MaintenanceFilters
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          priorityFilter={priorityFilter}
          onPriorityChange={setPriorityFilter}
          onClearFilters={handleClearFilters}
        />
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className='space-y-4'
      >
        <TabsList className='flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0'>
          <TabsTrigger value='all'>All</TabsTrigger>
          <TabsTrigger value={MaintenanceStatus.SCHEDULED}>
            Scheduled
          </TabsTrigger>
          <TabsTrigger value={MaintenanceStatus.IN_PROGRESS}>
            In Progress
          </TabsTrigger>
          <TabsTrigger value={MaintenanceStatus.COMPLETED}>
            Completed
          </TabsTrigger>
          <TabsTrigger value={MaintenanceStatus.CANCELLED}>
            Cancelled
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className='space-y-4'>
          <MaintenanceDataTable
            statusFilter={effectiveStatusFilter}
            typeFilter={typeFilter}
            priorityFilter={priorityFilter}
          />
        </TabsContent>
      </Tabs>
    </ContentLayout>
  );
}

export default function MaintenancePage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <MaintenancePageInner />
    </Suspense>
  );
}
