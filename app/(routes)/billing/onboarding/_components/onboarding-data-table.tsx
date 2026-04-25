'use client';

import { useState, useCallback, useMemo } from 'react';
import { Receipt, X, Loader2 } from 'lucide-react';
import {
  useOnboardingLearners,
  useBulkGenerateBills,
} from '@/hooks/billing/use-onboarding';
import { getOnboardingColumns } from './columns';
import { DataTable } from '@/components/ui/data-table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  OnboardingFilters,
  PaymentStatus,
} from '@/lib/services/billing/onboarding/onboarding-service';

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { canAccess, isSuperAdmin, isLoading: permsLoading } = usePermissions();

  const filters: OnboardingFilters = {
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    payment_status: activeTab === 'all' ? undefined : activeTab,
  };

  const { data: response, isLoading, isFetching } = useOnboardingLearners(filters);
  const bulkGenerate = useBulkGenerateBills();

  const learners = response?.data ?? [];
  const metadata = response?.metadata;

  const pageRowIds = useMemo(() => learners.map((l) => l.id), [learners]);
  const generatingIds = useMemo(
    () => (bulkGenerate.isPending ? new Set(bulkGenerate.variables ?? []) : new Set<string>()),
    [bulkGenerate.isPending, bulkGenerate.variables]
  );

  const toggleSelected = useCallback((id: string, value: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAllOnPage = useCallback((ids: string[], value: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (value) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const columns = useMemo(
    () =>
      getOnboardingColumns({
        selectedIds,
        toggleSelected,
        toggleAllOnPage,
        pageRowIds,
        generatingIds,
      }),
    [selectedIds, toggleSelected, toggleAllOnPage, pageRowIds, generatingIds]
  );

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

  // Permission for the bulk-generate action — reuses billing.schedule.create
  // (the same permission needed to manually create a bill in /billing/schedule).
  const canGenerateBills =
    !permsLoading && (isSuperAdmin || canAccess('billing.schedule', 'create'));

  // Filter selected to those that don't already have bills, so the count
  // accurately reflects what would actually be created.
  const selectedLearners = learners.filter((l) => selectedIds.has(l.id));
  const selectedWithoutBills = selectedLearners.filter((l) => l.bills.length === 0);
  const selectedAlreadyBilled = selectedLearners.length - selectedWithoutBills.length;

  const handleBulkGenerate = async () => {
    if (selectedIds.size === 0) return;
    try {
      await bulkGenerate.mutateAsync(Array.from(selectedIds));
      clearSelection();
    } catch {
      // toast already shown by hook
    }
  };

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

      {/* Bulk action toolbar — visible only when ≥1 row selected */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-4 py-3">
          <div className="flex flex-col text-sm">
            <span className="font-medium">
              {selectedIds.size} learner{selectedIds.size === 1 ? '' : 's'} selected
            </span>
            {selectedAlreadyBilled > 0 && (
              <span className="text-xs text-muted-foreground">
                {selectedAlreadyBilled} already have bills and will be skipped.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              disabled={bulkGenerate.isPending}
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
            {canGenerateBills && (
              <Button
                size="sm"
                onClick={handleBulkGenerate}
                disabled={bulkGenerate.isPending || selectedWithoutBills.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {bulkGenerate.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Receipt className="h-4 w-4 mr-1" />
                    Generate Bills
                    {selectedWithoutBills.length > 0 && ` (${selectedWithoutBills.length})`}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      <DataTable
        columns={columns as any}
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
