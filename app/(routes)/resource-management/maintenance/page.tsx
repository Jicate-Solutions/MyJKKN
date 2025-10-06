// app/(routes)/resource-management/maintenance/page.tsx
'use client';

import { useState } from 'react';
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

export default function MaintenancePage() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('all');

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

      {/* Filters */}
      <div className='mb-6'>
        <MaintenanceFilters
          searchQuery=''
          onSearchChange={() => {}}
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
        <TabsList>
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
