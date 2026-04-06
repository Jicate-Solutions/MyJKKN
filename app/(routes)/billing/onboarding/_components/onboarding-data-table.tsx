'use client';

import { useState, useCallback } from 'react';
import { useOnboardingLearners } from '@/hooks/billing/use-onboarding';
import { onboardingColumns } from './columns';
import { DataTable } from '@/components/ui/data-table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import type { OnboardingFilters, PaymentStatus } from '@/lib/services/billing/onboarding/onboarding-service';

const PAGE_SIZE = 20;

type TabValue = 'all' | PaymentStatus;

const TABS: { value: TabValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'fully_paid', label: 'Fully Paid' },
];

export function OnboardingDataTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabValue>('all');

  const filters: OnboardingFilters = {
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    payment_status: activeTab === 'all' ? undefined : activeTab,
  };

  const { data: response, isLoading, isFetching } = useOnboardingLearners(filters);

  const learners = response?.data ?? [];
  const metadata = response?.metadata;

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setPage(1);
  }, []);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as TabValue);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DataTable
        columns={onboardingColumns as any}
        data={learners}
        searchPlaceholder="Search by name, email, or phone..."
        onSearch={handleSearch}
        serverSidePagination={
          metadata
            ? {
                currentPage: metadata.page,
                totalPages: metadata.total_pages,
                pageSize: metadata.limit,
                totalItems: metadata.total,
                hasNextPage: metadata.page < metadata.total_pages,
                hasPreviousPage: metadata.page > 1,
                onPageChange: handlePageChange,
                isLoading: isFetching,
              }
            : undefined
        }
        showRefresh={false}
      />
    </div>
  );
}
