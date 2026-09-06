'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ReceiptIndianRupee, X, Loader2 } from 'lucide-react';
import {
  useOnboardingLearners,
  useBulkGenerateBills,
} from '@/hooks/billing/use-onboarding';
import { getOnboardingColumns } from './columns';
import {
  OnboardingFilters as OnboardingFiltersUI,
  type OnboardingHierarchyFilters,
  type OnboardingFilterKey,
} from './onboarding-filters';
import { DataTable } from '@/components/ui/data-table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  OnboardingFilters,
  PaymentStatus,
} from '@/lib/services/billing/onboarding/onboarding-service';

const DEFAULT_PAGE_SIZE = 20;
const FILTER_STORAGE_KEY = 'billing-onboarding-filters';

type TabValue = 'all' | PaymentStatus;

const TABS: { value: TabValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'fully_paid', label: 'Fully Paid' },
];

const HIERARCHY_KEYS: OnboardingFilterKey[] = [
  'institution_id',
  'degree_id',
  'department_id',
  'program_id',
  'bill_status',
  'lifecycle_status',
];


export function OnboardingDataTable() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Derive state from URL search params so filters survive navigation
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10);
  const search = searchParams.get('search') || '';
  const activeTab = (searchParams.get('payment_status') || 'all') as TabValue;

  const hierarchyFilters = useMemo<OnboardingHierarchyFilters>(() => {
    const f: OnboardingHierarchyFilters = {};
    for (const key of HIERARCHY_KEYS) {
      const v = searchParams.get(key);
      if (v) (f as any)[key] = v;
    }
    return f;
  }, [searchParams]);

  // Selection state is intentionally local — should not survive navigation
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { canAccess, isSuperAdmin, isLoading: permsLoading } = usePermissions();

  // Helper: update URL params (preserving unrelated ones)
  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.replace(`/billing/onboarding${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Persist filter params to sessionStorage so they survive sidebar navigation.
  // Page/pageSize are intentionally excluded — always start fresh at page 1.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    params.delete('pageSize');
    const qs = params.toString();
    if (qs) {
      sessionStorage.setItem(FILTER_STORAGE_KEY, qs);
    } else {
      sessionStorage.removeItem(FILTER_STORAGE_KEY);
    }
  }, [searchParams]);

  // On mount: if the URL has no filter params (e.g. user arrived via sidebar),
  // restore the last-used filters from sessionStorage.
  const didRestoreRef = useRef(false);
  useEffect(() => {
    if (didRestoreRef.current) return;
    didRestoreRef.current = true;
    if (!searchParams.toString()) {
      const saved = sessionStorage.getItem(FILTER_STORAGE_KEY);
      if (saved) {
        router.replace(`/billing/onboarding?${saved}`, { scroll: false });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally mount-only

  const filters: OnboardingFilters = {
    page,
    limit: pageSize,
    search: search || undefined,
    payment_status: activeTab === 'all' ? undefined : activeTab,
    ...hierarchyFilters,
  };

  const handleFilterChange = useCallback(
    (updates: Partial<Record<OnboardingFilterKey, string | undefined>>) => {
      updateParams({ ...updates, page: '1' });
    },
    [updateParams]
  );

  const handleClearFilters = useCallback(() => {
    const clear: Record<string, undefined> = { page: undefined };
    for (const key of HIERARCHY_KEYS) clear[key] = undefined;
    updateParams(clear);
  }, [updateParams]);

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

  // Build the URL the user is currently on (with all active filters) so that
  // any navigation away from this page (View Bills, student name click) can
  // carry a returnTo param — enabling a redirect back here after billing.
  const returnToUrl = `/billing/onboarding${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  const columns = useMemo(
    () =>
      getOnboardingColumns({
        selectedIds,
        toggleSelected,
        toggleAllOnPage,
        pageRowIds,
        generatingIds,
        returnToUrl,
      }),
    [selectedIds, toggleSelected, toggleAllOnPage, pageRowIds, generatingIds, returnToUrl]
  );

  // Ref to guard against the DataTable's spurious mount-time onSearch call
  const searchRef = useRef(search);
  searchRef.current = search;

  const handleSearch = useCallback((query: string) => {
    if (query !== searchRef.current) {
      updateParams({ search: query || undefined, page: '1' });
    }
  }, [updateParams]);

  const handleTabChange = useCallback((value: string) => {
    updateParams({
      payment_status: value === 'all' ? undefined : value,
      page: '1',
    });
  }, [updateParams]);

  const handlePageChange = useCallback((newPage: number) => {
    updateParams({ page: String(newPage) });
  }, [updateParams]);

  const handlePageSizeChange = useCallback((newSize: number) => {
    updateParams({ pageSize: String(newSize), page: '1' });
  }, [updateParams]);

  // Permission for the bulk-generate action — reuses billing.schedule.create
  // (the same permission needed to manually create a bill in /billing/schedule).
  const canGenerateBills =
    !permsLoading && (isSuperAdmin || canAccess('billing.schedule', 'create'));

  // Filter selected to those that don't already have bills AND are in 'account'
  // status. Admitted/reserved learners are visible for tracking but must go
  // through account transition before bills can be generated.
  const selectedLearners = learners.filter((l) => selectedIds.has(l.id));
  const selectedEligible = selectedLearners.filter(
    (l) => l.bills.length === 0 && l.lifecycle_status === 'account'
  );
  const selectedWithoutBills = selectedEligible;
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
        <TabsList className='flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0'>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Advanced hierarchy + bill-status filters */}
      <OnboardingFiltersUI
        filters={hierarchyFilters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
      />

      {/* Bulk action toolbar — visible only when ≥1 row selected */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 px-4 py-3">
          <div className="flex flex-col text-sm min-w-0">
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
                    <ReceiptIndianRupee className="h-4 w-4 mr-1" />
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
        initialSearch={search}
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
                onPageSizeChange: handlePageSizeChange,
                isLoading: isFetching,
              }
            : undefined
        }
        showRefresh={false}
      />
    </div>
  );
}
