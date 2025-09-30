// app/(routes)/resource-management/maintenance/page.tsx
'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Plus, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { MaintenanceStatsCards } from './_components/maintenance-stats-cards';
import { MaintenanceFilters } from './_components/maintenance-filters';
import { MaintenanceLogCard } from './_components/maintenance-log-card';
import {
  useMaintenanceLogs,
  useMaintenanceStats,
  useCompleteMaintenanceLog,
  useCancelMaintenanceLog
} from '@/hooks/resource-management/use-maintenance';
import { useAuth } from '@/hooks/use-auth';
import { MaintenanceStatus, MaintenanceType } from '@/types/maintenance';
import type { MaintenanceLog } from '@/types/maintenance';

export default function MaintenancePage() {
  const router = useRouter();
  const { profile: user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('all');

  // Fetch data
  const { data: allLogs = [], isLoading } = useMaintenanceLogs();
  const { data: stats, isLoading: statsLoading } = useMaintenanceStats();

  const completeLog = useCompleteMaintenanceLog();
  const cancelLog = useCancelMaintenanceLog();

  // Filter and sort logs
  const filteredLogs = useMemo(() => {
    let filtered = [...allLogs];

    // Tab filter
    if (activeTab !== 'all') {
      filtered = filtered.filter((log) => log.status === activeTab);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (log) =>
          log.title?.toLowerCase().includes(query) ||
          log.description?.toLowerCase().includes(query) ||
          log.resource?.name?.toLowerCase().includes(query)
      );
    }

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter((log) => log.maintenance_type === typeFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((log) => log.status === statusFilter);
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(
        (log) => log.priority === parseInt(priorityFilter)
      );
    }

    return filtered;
  }, [
    allLogs,
    activeTab,
    searchQuery,
    typeFilter,
    statusFilter,
    priorityFilter
  ]);

  // Calculate tab counts
  const counts = useMemo(() => {
    return {
      all: allLogs.length,
      scheduled: allLogs.filter((l) => l.status === MaintenanceStatus.SCHEDULED)
        .length,
      in_progress: allLogs.filter(
        (l) => l.status === MaintenanceStatus.IN_PROGRESS
      ).length,
      completed: allLogs.filter((l) => l.status === MaintenanceStatus.COMPLETED)
        .length,
      overdue: allLogs.filter((l) => {
        const now = new Date();
        const scheduledDate = new Date(l.scheduled_date);
        return (
          scheduledDate < now &&
          (l.status === MaintenanceStatus.SCHEDULED ||
            l.status === MaintenanceStatus.IN_PROGRESS)
        );
      }).length
    };
  }, [allLogs]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setStatusFilter('all');
    setPriorityFilter('all');
  };

  const handleComplete = async (log: MaintenanceLog) => {
    const today = new Date().toISOString().split('T')[0];
    await completeLog.mutateAsync({
      id: log.id,
      data: {
        completed_date: today,
        notes: 'Completed via dashboard'
      }
    });
  };

  const handleCancel = async (log: MaintenanceLog) => {
    await cancelLog.mutateAsync({
      id: log.id,
      reason: 'Cancelled via dashboard'
    });
  };

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
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-3xl font-bold flex items-center gap-2'>
            <Wrench className='h-8 w-8' />
            Maintenance Management
          </h1>
          <p className='text-muted-foreground'>
            Track and manage resource maintenance activities
          </p>
        </div>
        <Button
          onClick={() => router.push('/resource-management/maintenance/new')}
        >
          <Plus className='mr-2 h-4 w-4' />
          New Maintenance
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className='mb-8'>
        <MaintenanceStatsCards stats={stats || null} isLoading={statsLoading} />
      </div>

      {/* Filters */}
      <div className='mb-6'>
        <MaintenanceFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
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
          <TabsTrigger value='all'>
            All <span className='ml-2 text-xs'>({counts.all})</span>
          </TabsTrigger>
          <TabsTrigger value={MaintenanceStatus.SCHEDULED}>
            Scheduled <span className='ml-2 text-xs'>({counts.scheduled})</span>
          </TabsTrigger>
          <TabsTrigger value={MaintenanceStatus.IN_PROGRESS}>
            In Progress{' '}
            <span className='ml-2 text-xs'>({counts.in_progress})</span>
          </TabsTrigger>
          <TabsTrigger value={MaintenanceStatus.COMPLETED}>
            Completed <span className='ml-2 text-xs'>({counts.completed})</span>
          </TabsTrigger>
          <TabsTrigger value='overdue' className='text-red-600'>
            Overdue <span className='ml-2 text-xs'>({counts.overdue})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className='space-y-4'>
          {/* Results Count */}
          <div className='flex items-center justify-between'>
            <p className='text-sm text-muted-foreground'>
              {isLoading ? (
                'Loading maintenance logs...'
              ) : (
                <>
                  <span className='font-semibold'>{filteredLogs.length}</span>{' '}
                  maintenance log
                  {filteredLogs.length !== 1 ? 's' : ''} found
                </>
              )}
            </p>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className='h-[280px]' />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredLogs.length === 0 && (
            <div className='py-12 text-center'>
              <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100'>
                <Wrench className='h-8 w-8 text-gray-600' />
              </div>
              <h3 className='mb-2 text-lg font-semibold'>
                No maintenance logs found
              </h3>
              <p className='text-sm text-muted-foreground mb-4'>
                {searchQuery ||
                typeFilter !== 'all' ||
                statusFilter !== 'all' ||
                priorityFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Get started by creating your first maintenance log'}
              </p>
              <Button
                onClick={() =>
                  router.push('/resource-management/maintenance/new')
                }
              >
                <Plus className='mr-2 h-4 w-4' />
                New Maintenance Log
              </Button>
            </div>
          )}

          {/* Logs Grid */}
          {!isLoading && filteredLogs.length > 0 && (
            <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
              {filteredLogs.map((log) => (
                <MaintenanceLogCard
                  key={log.id}
                  log={log}
                  onComplete={handleComplete}
                  onCancel={handleCancel}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </ContentLayout>
  );
}
