'use client';

import type * as React from 'react';
import {
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnResizeMode
} from '@tanstack/react-table';
import { useEffect, useCallback, useMemo, useRef, useState } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

import { DataTablePagination } from './pagination';
import { DataTableToolbar } from './toolbar';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Database, GraduationCap, Loader2 } from 'lucide-react';
import { useTableConfig, type TableConfig } from './utils/table-config';
import type { CaseFormatConfig } from './utils/case-utils';
import type {
  DataTransformFunction,
  ExportableData,
  PdfExportOptions
} from './utils/export-utils';
import { useTableColumnResize } from './hooks/use-table-column-resize';
import { DataTableResizer } from './data-table-resizer';

// Import core utilities
import { preprocessSearch } from './utils/search';
import {
  createSortingHandler,
  createColumnFiltersHandler,
  createColumnVisibilityHandler,
  createPaginationHandler,
  createColumnSizingHandler,
  createSortingState
} from './utils/table-state-handlers';
import { createKeyboardNavigationHandler } from './utils/keyboard-navigation';
import { createConditionalStateHook } from './utils/conditional-state';
import {
  initializeColumnSizes,
  trackColumnResizing,
  cleanupColumnResizing
} from './utils/column-sizing';
import { Badge } from '../ui/badge';

// Define types for the data fetching function params and result
export interface DataFetchParams {
  page: number;
  limit: number;
  search: string;
  from_date: string;
  to_date: string;
  sort_by: string;
  sort_order: string;
}

export interface DataFetchResult<TData> {
  success: boolean;
  data: TData[];
  pagination: {
    page: number;
    limit: number;
    total_pages: number;
    total_items: number;
  };
}

// Types for table handlers
type PaginationUpdater<TData> = (prev: {
  pageIndex: number;
  pageSize: number;
}) => { pageIndex: number; pageSize: number };
type SortingUpdater = (
  prev: { id: string; desc: boolean }[]
) => { id: string; desc: boolean }[];
type ColumnOrderUpdater = (prev: string[]) => string[];
type RowSelectionUpdater = (
  prev: Record<string, boolean>
) => Record<string, boolean>;

interface DataTableProps<TData extends ExportableData, TValue> {
  // Allow overriding the table configuration
  config?: Partial<TableConfig>;

  // Column definitions generator
  getColumns: (
    handleRowDeselection: ((rowId: string) => void) | null | undefined
  ) => ColumnDef<TData, TValue>[];

  // Optional mobile card renderer — when provided, renders a card list on
  // screens narrower than md (768 px) and hides the table. The table is still
  // rendered (but hidden) so TanStack Table's pagination state is shared.
  renderMobileRow?: (item: TData) => React.ReactNode;

  // Data fetching function
  fetchDataFn:
    | ((params: DataFetchParams) => Promise<DataFetchResult<TData>>)
    | ((
        page: number,
        pageSize: number,
        search: string,
        dateRange: { from_date: string; to_date: string },
        sortBy: string,
        sortOrder: string,
        caseConfig?: CaseFormatConfig
      ) => unknown);

  // Function to fetch specific items by their IDs
  fetchByIdsFn?: (ids: number[] | string[]) => Promise<TData[]>;

  // Optional: fetch ALL items matching the current server-side filters (every
  // page, not just the visible one). Powers the "Select all N across pages"
  // banner + cross-page selection. When omitted, selection stays page-scoped
  // and the banner never renders — so existing tables are unaffected. The
  // `page`/`limit` on the passed params are advisory; the implementation is
  // expected to return the full matching set (optionally capped).
  fetchAllItemsFn?: (params: DataFetchParams) => Promise<TData[]>;

  // Export configuration (optional)
  exportConfig?: {
    entityName: string;
    columnMapping: Record<string, string>;
    columnWidths: Array<{ wch: number }>;
    headers: string[];
    caseConfig?: CaseFormatConfig;
    transformFunction?: DataTransformFunction<TData>;
    // Opt in to PDF export. Omit and the Export menu keeps only CSV/XLS.
    // A PDF page fits far fewer columns than a spreadsheet, so tables with a
    // wide export schema should pass `pdf.headers` with a printable subset.
    pdf?: PdfExportOptions;
  };

  // ID field in TData for tracking selected items
  idField: keyof TData;

  // Custom page size options
  pageSizeOptions?: number[];

  // Custom toolbar content render function
  renderToolbarContent?: (props: {
    selectedRows: TData[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => React.ReactNode;

  // Optional refetch trigger - increment this value to force a data refetch
  refetchKey?: number;
}

export function DataTable<TData extends ExportableData, TValue>({
  config = {},
  getColumns,
  fetchDataFn,
  fetchByIdsFn,
  fetchAllItemsFn,
  exportConfig,
  idField = 'id' as keyof TData,
  pageSizeOptions,
  renderToolbarContent,
  renderMobileRow,
  refetchKey = 0
}: DataTableProps<TData, TValue>) {
  // Load table configuration with any overrides
  const tableConfig = useTableConfig(config);

  // Table ID for localStorage storage - generate a default if not provided
  const tableId = tableConfig.columnResizingTableId || 'data-table-default';

  // Use our custom hook for column resizing
  const { columnSizing, setColumnSizing, resetColumnSizing } =
    useTableColumnResize(tableId, tableConfig.enableColumnResizing);

  // Create conditional URL state hook based on config
  const useConditionalUrlState = createConditionalStateHook(
    tableConfig.enableUrlState
  );

  // States for API parameters using conditional URL state
  const [page, setPage] = useConditionalUrlState('page', 1);
  const [pageSize, setPageSize] = useConditionalUrlState('pageSize', 10);
  const [search, setSearch] = useConditionalUrlState('search', '');
  const [dateRange, setDateRange] = useConditionalUrlState<{
    from_date: string;
    to_date: string;
  }>('dateRange', { from_date: '', to_date: '' });
  const [sortBy, setSortBy] = useConditionalUrlState('sortBy', 'created_at');
  const [sortOrder, setSortOrder] = useConditionalUrlState<'asc' | 'desc'>(
    'sortOrder',
    'desc'
  );
  const [columnVisibility, setColumnVisibility] = useConditionalUrlState<
    Record<string, boolean>
  >('columnVisibility', {});
  const [columnFilters, setColumnFilters] = useConditionalUrlState<
    Array<{ id: string; value: unknown }>
  >('columnFilters', []);

  // Internal states
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<{
    data: TData[];
    pagination: {
      page: number;
      limit: number;
      total_pages: number;
      total_items: number;
    };
  } | null>(null);

  // Column order state (managed separately from URL state as it's persisted in localStorage)
  const [columnOrder, setColumnOrder] = useState<string[]>([]);

  // PERFORMANCE FIX: Use only one selection state as the source of truth
  const [selectedItemIds, setSelectedItemIds] = useState<
    Record<string | number, boolean>
  >({});

  // Full-row cache for items selected via "select all across pages" — rows that
  // may live on other pages and so aren't in `dataItems`. `selectedItemIds`
  // stays the source of truth for WHAT is selected; this only supplies row DATA
  // for off-page selections to the toolbar/bulk actions. Empty for any table
  // that doesn't use select-all, so it changes nothing for them.
  const [selectedItemsCache, setSelectedItemsCache] = useState<
    Record<string, TData>
  >({});
  const [isSelectingAll, setIsSelectingAll] = useState(false);

  // Convert the sorting from URL to the format TanStack Table expects
  const sorting = useMemo(
    () => createSortingState(sortBy, sortOrder),
    [sortBy, sortOrder]
  );

  // Get current data items - memoize to avoid recalculations
  const dataItems = useMemo(() => data?.data || [], [data?.data]);

  // PERFORMANCE FIX: Derive rowSelection from selectedItemIds using memoization
  const rowSelection = useMemo(() => {
    if (!dataItems.length) return {};

    // Map selectedItemIds to row indices for the table
    const selection: Record<string, boolean> = {};

    dataItems.forEach((item, index) => {
      const itemId = String(item[idField]);
      if (selectedItemIds[itemId]) {
        selection[String(index)] = true;
      }
    });

    return selection;
  }, [dataItems, selectedItemIds, idField]);

  // Calculate total selected items - memoize to avoid recalculation
  const totalSelectedItems = useMemo(
    () => Object.keys(selectedItemIds).length,
    [selectedItemIds]
  );

  // All selected rows WITH their data: current-page selected rows (in page
  // order), then any off-page rows selected via "select all" (from the cache).
  // When nothing was selected across pages the cache is empty, so this is
  // byte-identical to the old current-page-only `selectedRows` — no behaviour
  // change for tables that don't opt into fetchAllItemsFn.
  const selectedFullRows = useMemo(() => {
    const onPage = dataItems.filter(
      (item) => selectedItemIds[String(item[idField])]
    );
    const onPageIds = new Set(onPage.map((i) => String(i[idField])));
    const offPage: TData[] = [];
    for (const id of Object.keys(selectedItemIds)) {
      if (!onPageIds.has(id) && selectedItemsCache[id]) {
        offPage.push(selectedItemsCache[id]);
      }
    }
    return [...onPage, ...offPage];
  }, [dataItems, selectedItemIds, selectedItemsCache, idField]);

  // PERFORMANCE FIX: Optimized row deselection handler
  const handleRowDeselection = useCallback(
    (rowId: string) => {
      if (!dataItems.length) return;

      const rowIndex = Number.parseInt(rowId, 10);
      const item = dataItems[rowIndex];

      if (item) {
        const itemId = String(item[idField]);
        setSelectedItemIds((prev) => {
          // Remove this item ID from selection
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      }
    },
    [dataItems, idField]
  );

  // Clear all selections
  const clearAllSelections = useCallback(() => {
    setSelectedItemIds({});
    setSelectedItemsCache({});
  }, []);

  // Select EVERY row matching the current server-side filters (all pages), not
  // just the visible page. Fetches the full matching set via fetchAllItemsFn,
  // marks them all selected, and caches their data so bulk actions/modals have
  // the off-page rows to work with.
  const selectAllMatching = useCallback(async () => {
    if (!fetchAllItemsFn) return;
    setIsSelectingAll(true);
    try {
      const allItems = await fetchAllItemsFn({
        page: 1,
        limit: 0,
        search: preprocessSearch(search),
        from_date: dateRange.from_date,
        to_date: dateRange.to_date,
        sort_by: sortBy,
        sort_order: sortOrder
      });
      const ids: Record<string, boolean> = {};
      const cache: Record<string, TData> = {};
      for (const item of allItems) {
        const id = String(item[idField]);
        ids[id] = true;
        cache[id] = item;
      }
      setSelectedItemIds(ids);
      setSelectedItemsCache(cache);
    } catch (err) {
      console.error('Error selecting all matching items:', err);
    } finally {
      setIsSelectingAll(false);
    }
  }, [
    fetchAllItemsFn,
    search,
    dateRange.from_date,
    dateRange.to_date,
    sortBy,
    sortOrder,
    idField
  ]);

  // PERFORMANCE FIX: Optimized row selection handler
  const handleRowSelectionChange = useCallback(
    (updaterOrValue: RowSelectionUpdater | Record<string, boolean>) => {
      // Determine the new row selection value
      const newRowSelection =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(rowSelection)
          : updaterOrValue;

      // Batch update selectedItemIds based on the new row selection
      setSelectedItemIds((prev) => {
        const next = { ...prev };

        // Process changes for current page
        if (dataItems.length) {
          // First handle explicit selections in newRowSelection
          for (const [rowId, isSelected] of Object.entries(newRowSelection)) {
            const rowIndex = Number.parseInt(rowId, 10);
            if (rowIndex >= 0 && rowIndex < dataItems.length) {
              const item = dataItems[rowIndex];
              const itemId = String(item[idField]);

              if (isSelected) {
                next[itemId] = true;
              } else {
                delete next[itemId];
              }
            }
          }

          // Then handle implicit deselection (rows that were selected but aren't in newRowSelection)
          dataItems.forEach((item, index) => {
            const itemId = String(item[idField]);
            const rowId = String(index);

            // If item was selected but isn't in new selection, deselect it
            if (prev[itemId] && newRowSelection[rowId] === undefined) {
              delete next[itemId];
            }
          });
        }

        return next;
      });
    },
    [dataItems, rowSelection, idField]
  );

  // Get selected items data (used by the export-selected path). Resolves each
  // selected id from the current page first, then the select-all cache; only
  // genuinely-missing ids (selected on another page with no cache) fall back to
  // fetchByIdsFn. NOTE: ids are kept as strings — the previous version did
  // Number.parseInt() on them, which produced NaN for UUID-keyed tables.
  const getSelectedItems = useCallback(async () => {
    if (totalSelectedItems === 0) {
      return [];
    }

    // Data we already have: current page + cross-page select-all cache.
    const byId = new Map<string, TData>();
    for (const item of dataItems) {
      byId.set(String(item[idField]), item);
    }
    for (const [id, item] of Object.entries(selectedItemsCache)) {
      byId.set(id, item);
    }

    const resolved: TData[] = [];
    const missingIds: string[] = [];
    for (const id of Object.keys(selectedItemIds)) {
      const row = byId.get(id);
      if (row) {
        resolved.push(row);
      } else {
        missingIds.push(id);
      }
    }

    // If everything is resolved, or we have no way to fetch the stragglers.
    if (missingIds.length === 0 || !fetchByIdsFn) {
      return resolved;
    }

    try {
      const fetchedItems = await fetchByIdsFn(missingIds);
      return [...resolved, ...fetchedItems];
    } catch (error) {
      console.error('Error fetching selected items:', error);
      return resolved;
    }
  }, [
    dataItems,
    selectedItemsCache,
    selectedItemIds,
    totalSelectedItems,
    fetchByIdsFn,
    idField
  ]);

  // Fetch EVERY row matching the current filters (all pages) — used by the
  // "Export All Pages" action. Prefers fetchAllItemsFn (a single capped query,
  // same path as select-all); otherwise pages through fetchDataFn until the
  // full set is collected. Query-hook tables can't be driven imperatively from
  // here, so they fall back to the visible page (unchanged behaviour).
  const getAllItems = useCallback(async (): Promise<TData[]> => {
    const baseParams = {
      search: preprocessSearch(search),
      from_date: dateRange.from_date,
      to_date: dateRange.to_date,
      sort_by: sortBy,
      sort_order: sortOrder
    };

    if (fetchAllItemsFn) {
      return await fetchAllItemsFn({ page: 1, limit: 0, ...baseParams });
    }

    const isQueryHook =
      (fetchDataFn as { isQueryHook?: boolean }).isQueryHook === true;
    if (isQueryHook) {
      return dataItems;
    }

    const fn = fetchDataFn as (
      params: DataFetchParams
    ) => Promise<DataFetchResult<TData>>;
    const first = await fn({ page: 1, limit: pageSize, ...baseParams });
    const all: TData[] = [...(first.data ?? [])];
    const totalPages = first.pagination?.total_pages ?? 1;
    for (let p = 2; p <= totalPages; p++) {
      const next = await fn({ page: p, limit: pageSize, ...baseParams });
      all.push(...(next.data ?? []));
    }
    return all;
  }, [
    fetchAllItemsFn,
    fetchDataFn,
    search,
    dateRange.from_date,
    dateRange.to_date,
    sortBy,
    sortOrder,
    pageSize,
    dataItems
  ]);

  // Fetch data
  useEffect(() => {
    // Check if the fetchDataFn is a query hook
    const isQueryHook =
      (fetchDataFn as { isQueryHook?: boolean }).isQueryHook === true;

    if (!isQueryHook) {
      // Create refs to capture the current sort values at the time of fetching
      const currentSortBy = sortBy;
      const currentSortOrder = sortOrder;

      const fetchData = async () => {
        try {
          setIsLoading(true);

          const result = await (
            fetchDataFn as (
              params: DataFetchParams
            ) => Promise<DataFetchResult<TData>>
          )({
            page,
            limit: pageSize,
            search: preprocessSearch(search),
            from_date: dateRange.from_date,
            to_date: dateRange.to_date,
            sort_by: currentSortBy,
            sort_order: currentSortOrder
          });
          setData(result);
          setIsError(false);
          setError(null);
        } catch (err) {
          setIsError(true);
          setError(err instanceof Error ? err : new Error('Unknown error'));
          console.error('Error fetching data:', err);
        } finally {
          setIsLoading(false);
        }
      };

      fetchData();
    }
  }, [page, pageSize, search, dateRange, sortBy, sortOrder, fetchDataFn, refetchKey]);

  // If fetchDataFn is a React Query hook, call it directly with parameters
  const queryResult =
    (fetchDataFn as { isQueryHook?: boolean }).isQueryHook === true
      ? (
          fetchDataFn as (
            page: number,
            pageSize: number,
            search: string,
            dateRange: { from_date: string; to_date: string },
            sortBy: string,
            sortOrder: string,
            caseConfig?: CaseFormatConfig
          ) => {
            isLoading: boolean;
            isSuccess: boolean;
            isError: boolean;
            data?: DataFetchResult<TData>;
            error?: Error;
          }
        )(
          page,
          pageSize,
          search,
          dateRange,
          sortBy,
          sortOrder,
          exportConfig?.caseConfig
        )
      : null;

  // If using React Query, update state based on query result
  useEffect(() => {
    if (queryResult) {
      setIsLoading(queryResult.isLoading);
      if (queryResult.isSuccess && queryResult.data) {
        setData(queryResult.data);
        setIsError(false);
        setError(null);
      }
      if (queryResult.isError) {
        setIsError(true);
        setError(
          queryResult.error instanceof Error
            ? queryResult.error
            : new Error('Unknown error')
        );
      }
    }
  }, [queryResult]);

  // Memoized pagination state
  const pagination = useMemo(
    () => ({
      pageIndex: page - 1,
      pageSize
    }),
    [page, pageSize]
  );

  // Ref for the table container for keyboard navigation
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Get columns with the deselection handler (memoize to avoid recreation on render)
  const columns = useMemo(() => {
    // Only pass deselection handler if row selection is enabled
    return getColumns(
      tableConfig.enableRowSelection ? handleRowDeselection : null
    );
  }, [getColumns, handleRowDeselection, tableConfig.enableRowSelection]);

  // Create event handlers using utility functions
  const handleSortingChange = useCallback(
    (updaterOrValue: SortingUpdater | { id: string; desc: boolean }[]) => {
      // Extract the new sorting state
      const newSorting =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(sorting)
          : updaterOrValue;

      if (newSorting.length > 0) {
        const columnId = newSorting[0].id;
        const direction = newSorting[0].desc ? 'desc' : 'asc';
        // Use Promise.all for batch updates to ensure they're applied together
        Promise.all([setSortBy(columnId), setSortOrder(direction)]).catch(
          (err) => {
            console.error('Failed to update URL sorting params:', err);
          }
        );
      }
    },
    [setSortBy, setSortOrder, sorting]
  );

  // Inline column filters handler to avoid dependency issues
  const handleColumnFiltersChange = useCallback(
    (updaterOrValue: any) => {
      setColumnFilters(updaterOrValue);
    },
    [setColumnFilters]
  );

  // Inline column visibility handler to avoid dependency issues
  const handleColumnVisibilityChange = useCallback(
    (updaterOrValue: any) => {
      setColumnVisibility(updaterOrValue);
    },
    [setColumnVisibility]
  );

  const handlePaginationChange = useCallback(
    (
      updaterOrValue:
        | PaginationUpdater<TData>
        | { pageIndex: number; pageSize: number }
    ) => {
      // Extract the new pagination state
      const newPagination =
        typeof updaterOrValue === 'function'
          ? updaterOrValue({ pageIndex: page - 1, pageSize })
          : updaterOrValue;

      // Special handling: When page size changes, always reset to page 1
      if (newPagination.pageSize !== pageSize) {
        // Let the URL state system handle the URL updates through batch processing
        // This prevents conflicts and ensures proper synchronization
        setPageSize(newPagination.pageSize);
        setPage(1);
        return;
      }

      // Only update page if it's changed - this handles normal page navigation
      if (newPagination.pageIndex + 1 !== page) {
        const setPagePromise = setPage(newPagination.pageIndex + 1);
        if (setPagePromise && typeof setPagePromise.catch === 'function') {
          setPagePromise.catch((err) => {
            console.error('Failed to update page param:', err);
          });
        }
      }
    },
    [page, pageSize, setPage, setPageSize]
  );

  const handleColumnSizingChange = useCallback(
    (
      updaterOrValue:
        | ColumnSizingState
        | ((prev: ColumnSizingState) => ColumnSizingState)
    ) => {
      if (typeof updaterOrValue === 'function') {
        setColumnSizing((current) => updaterOrValue(current));
      } else {
        setColumnSizing(updaterOrValue);
      }
    },
    [setColumnSizing]
  );

  // Column order change handler
  const handleColumnOrderChange = useCallback(
    (updaterOrValue: ColumnOrderUpdater | string[]) => {
      const newColumnOrder =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(columnOrder)
          : updaterOrValue;

      setColumnOrder(newColumnOrder);

      // Persist column order to localStorage
      try {
        localStorage.setItem(
          'data-table-column-order',
          JSON.stringify(newColumnOrder)
        );
      } catch (error) {
        console.error('Failed to save column order to localStorage:', error);
      }
    },
    [columnOrder]
  );

  // Load column order from localStorage on initial render
  useEffect(() => {
    try {
      const savedOrder = localStorage.getItem('data-table-column-order');
      if (savedOrder) {
        const parsedOrder = JSON.parse(savedOrder);
        setColumnOrder(parsedOrder);
      }
    } catch (error) {
      console.error('Error loading column order:', error);
    }
  }, []);

  // Memoize table configuration to prevent unnecessary re-renders
  const tableOptions = useMemo(
    () => ({
      data: dataItems,
      columns,
      state: {
        sorting,
        columnVisibility,
        rowSelection,
        columnFilters,
        pagination,
        columnSizing,
        columnOrder
      },
      columnResizeMode: 'onChange' as ColumnResizeMode,
      onColumnSizingChange: handleColumnSizingChange,
      onColumnOrderChange: handleColumnOrderChange,
      pageCount: data?.pagination.total_pages || 0,
      enableRowSelection: tableConfig.enableRowSelection,
      enableMultiRowSelection: true, // Explicitly enable multi-row selection
      enableColumnResizing: tableConfig.enableColumnResizing,
      manualPagination: true,
      manualSorting: true,
      manualFiltering: true,
      onRowSelectionChange: handleRowSelectionChange,
      onSortingChange: handleSortingChange,
      onColumnFiltersChange: handleColumnFiltersChange,
      onColumnVisibilityChange: handleColumnVisibilityChange,
      onPaginationChange: handlePaginationChange,
      getCoreRowModel: getCoreRowModel<TData>(),
      getFilteredRowModel: getFilteredRowModel<TData>(),
      getPaginationRowModel: getPaginationRowModel<TData>(),
      getSortedRowModel: getSortedRowModel<TData>(),
      getFacetedRowModel: getFacetedRowModel<TData>(),
      getFacetedUniqueValues: getFacetedUniqueValues<TData>()
    }),
    [
      dataItems,
      columns,
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination,
      columnSizing,
      columnOrder,
      handleColumnSizingChange,
      handleColumnOrderChange,
      data?.pagination.total_pages,
      tableConfig.enableRowSelection,
      tableConfig.enableColumnResizing,
      handleRowSelectionChange,
      handleSortingChange,
      handleColumnFiltersChange,
      handleColumnVisibilityChange,
      handlePaginationChange
    ]
  );

  // Set up the table with memoized configuration
  const table = useReactTable<TData>(tableOptions);

  // Create keyboard navigation handler - inline to avoid dependency issues
  const handleKeyDown = createKeyboardNavigationHandler(table, (row, rowIndex) => {
    // Example action on keyboard activation
  });

  // Add an effect to validate page number when page size changes
  useEffect(() => {
    // This effect ensures page is valid after page size changes
    const totalPages = data?.pagination.total_pages || 0;

    if (totalPages > 0 && page > totalPages) {
      setPage(1);
    }
  }, [data?.pagination?.total_pages, page, setPage]);

  // Initialize default column sizes when columns are available and no saved sizes exist
  useEffect(() => {
    initializeColumnSizes(columns, tableId, setColumnSizing);
  }, [columns, tableId, setColumnSizing]);

  // Handle column resizing
  useEffect(() => {
    const isResizingAny = table
      .getHeaderGroups()
      .some((headerGroup) =>
        headerGroup.headers.some((header) => header.column.getIsResizing())
      );

    trackColumnResizing(isResizingAny);

    // Cleanup on unmount
    return () => {
      cleanupColumnResizing();
    };
  }, [table]);

  // Reset column order
  const resetColumnOrder = useCallback(() => {
    // Reset to empty array (which resets to default order)
    table.setColumnOrder([]);
    setColumnOrder([]);

    // Remove from localStorage
    try {
      localStorage.removeItem('data-table-column-order');
    } catch (error) {
      console.error('Failed to remove column order from localStorage:', error);
    }
  }, [table]);

  // Add synchronization effect to ensure URL is the source of truth
  useEffect(() => {
    // Force the table's sorting state to match URL parameters
    table.setSorting(sorting);
  }, [table, sorting]);

  // Keep pagination in sync with URL parameters
  useEffect(() => {
    // Make sure table pagination state matches URL state
    const tableState = table.getState().pagination;
    if (tableState.pageIndex !== page - 1 || tableState.pageSize !== pageSize) {
      // Avoid unnecessary updates that might cause infinite loops
      if (
        tableState.pageSize !== pageSize ||
        Math.abs(tableState.pageIndex - (page - 1)) > 0
      ) {
        table.setPagination({
          pageIndex: page - 1,
          pageSize: pageSize
        });
      }
    }
  }, [table, page, pageSize]);

  // Handle error state
  if (isError) {
    return (
      <Alert variant='destructive' className='my-4'>
        <AlertCircle className='h-4 w-4' />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load data:{' '}
          {error instanceof Error ? error.message : 'Unknown error'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Data Summary */}
      {tableConfig.enableDataSummary && (
        <div className='rounded-lg border bg-card p-4 text-sm'>
          <div className='flex flex-wrap items-center justify-between gap-4'>
            <div className='flex flex-wrap items-center gap-6'>
              <div className='flex items-center gap-2'>
                <Database className='h-4 w-4 text-muted-foreground' />
                <span className='font-medium'>
                  Showing {dataItems.length} of{' '}
                </span>
                <span className='font-medium'>
                  <span className='text-primary font-bold'>
                    {(data?.pagination.total_items || 0).toLocaleString()}{' '}
                  </span>
                  {exportConfig?.entityName || 'items'}
                </span>
              </div>

              <div className='flex items-center gap-2 text-muted-foreground text-sm'>
                <span className='font-medium'>Page:</span>
                <span className='font-medium'>
                  {page} of {data?.pagination.total_pages || 1}
                </span>
              </div>

              <div className='flex items-center gap-2'>
                <Badge variant='secondary' className='ml-2'>
                  {data?.pagination.total_items &&
                    data.pagination.total_items > 0 && (
                      <span className='ml-2 text-black font-medium'>
                        {Math.round(
                          (Math.min(
                            page * pageSize,
                            data.pagination.total_items
                          ) /
                            data.pagination.total_items) *
                            100
                        )}
                        % of total
                      </span>
                    )}
                </Badge>
              </div>

              {totalSelectedItems > 0 && (
                <div className='flex items-center gap-2'>
                  <span className='font-medium text-blue-600'>Selected:</span>
                  <span className='text-blue-600 font-medium'>
                    {totalSelectedItems.toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            <div className='flex items-center gap-4 text-xs text-muted-foreground'>
              {(search || dateRange.from_date || dateRange.to_date) && (
                <span className='rounded-md bg-blue-50 px-2 py-1 text-blue-600'>
                  Filtered
                </span>
              )}

              {isLoading && (
                <span className='rounded-md px-2 py-1 text-primary flex items-center gap-2'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {tableConfig.enableToolbar && (
        <DataTableToolbar
          table={table}
          setSearch={setSearch}
          setDateRange={setDateRange}
          totalSelectedItems={totalSelectedItems}
          deleteSelection={clearAllSelections}
          getSelectedItems={getSelectedItems}
          getAllItems={getAllItems}
          config={tableConfig}
          resetColumnSizing={() => {
            resetColumnSizing();
            // Force a small delay and then refresh the UI
            setTimeout(() => {
              window.dispatchEvent(new Event('resize'));
            }, 100);
          }}
          resetColumnOrder={resetColumnOrder}
          entityName={exportConfig?.entityName || 'items'}
          columnMapping={exportConfig?.columnMapping || {}}
          columnWidths={exportConfig?.columnWidths || []}
          headers={exportConfig?.headers || []}
          transformFunction={exportConfig?.transformFunction}
          pdfOptions={exportConfig?.pdf}
          customToolbarComponent={renderToolbarContent?.({
            selectedRows: selectedFullRows,
            allSelectedIds: Object.keys(selectedItemIds),
            totalSelectedCount: totalSelectedItems,
            resetSelection: clearAllSelections
          })}
        />
      )}

      {/* Mobile card list — visible on < md screens when renderMobileRow is provided */}
      {renderMobileRow && (
        <div className='md:hidden space-y-3'>
          {isLoading ? (
            Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
              <div key={i} className='rounded-lg border bg-card p-4 space-y-2.5'>
                <div className='flex items-start justify-between gap-2'>
                  <Skeleton className='h-4 w-1/2' />
                  <Skeleton className='h-5 w-16 rounded-full' />
                </div>
                <Skeleton className='h-3.5 w-1/3' />
                <Skeleton className='h-3.5 w-2/3' />
                <div className='flex gap-1.5 pt-0.5'>
                  <Skeleton className='h-5 w-20 rounded-full' />
                  <Skeleton className='h-5 w-16 rounded-full' />
                </div>
                <div className='flex justify-between pt-1 border-t'>
                  <Skeleton className='h-3.5 w-24' />
                  <Skeleton className='h-3.5 w-20' />
                </div>
              </div>
            ))
          ) : dataItems.length > 0 ? (
            dataItems.map((item) => (
              <div key={String(item[idField])}>
                {renderMobileRow(item)}
              </div>
            ))
          ) : (
            <div className='rounded-md border py-8 text-center text-sm text-muted-foreground'>
              No results.
            </div>
          )}
        </div>
      )}

      {/* Cross-page "select all" banner. Only rendered when the table opts in
          by providing fetchAllItemsFn. Appears once the current page is fully
          selected (or select-all is active) and more matching rows exist on
          other pages — mirrors the Gmail "Select all N" pattern. */}
      {tableConfig.enableRowSelection &&
        fetchAllItemsFn &&
        (() => {
          const total = data?.pagination.total_items ?? 0;
          const pageRowCount = table.getRowModel().rows.length;
          const allMatchingSelected =
            total > 0 && totalSelectedItems >= total;
          const allPageSelected =
            pageRowCount > 0 && table.getIsAllPageRowsSelected();
          // Nothing extra to offer when everything fits on one page, or the
          // page isn't fully selected yet (and we're not already in all-mode).
          if (total <= pageRowCount) return null;
          if (!allPageSelected && !allMatchingSelected) return null;
          const entity = exportConfig?.entityName || 'items';
          return (
            <div className='flex flex-wrap items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800'>
              {allMatchingSelected ? (
                <>
                  <span>
                    All <strong>{total.toLocaleString()}</strong> {entity}{' '}
                    matching the current filters are selected.
                  </span>
                  <button
                    type='button'
                    onClick={clearAllSelections}
                    className='font-medium underline underline-offset-2 hover:text-blue-900'
                  >
                    Clear selection
                  </button>
                </>
              ) : (
                <>
                  <span>
                    All <strong>{totalSelectedItems}</strong> on this page are
                    selected.
                  </span>
                  <button
                    type='button'
                    onClick={selectAllMatching}
                    disabled={isSelectingAll}
                    className='font-medium underline underline-offset-2 hover:text-blue-900 disabled:opacity-60'
                  >
                    {isSelectingAll
                      ? 'Selecting…'
                      : `Select all ${total.toLocaleString()}`}
                  </button>
                </>
              )}
            </div>
          );
        })()}

      <div
        ref={tableContainerRef}
        className={`overflow-x-auto overflow-y-auto rounded-md border table-container${renderMobileRow ? ' hidden md:block' : ''}`}
        aria-label='Data table'
        onKeyDown={
          tableConfig.enableKeyboardNavigation ? handleKeyDown : undefined
        }
      >
        <Table
          className={tableConfig.enableColumnResizing ? 'resizable-table' : ''}
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className='px-4 py-2 relative text-left group/th'
                    key={header.id}
                    colSpan={header.colSpan}
                    scope='col'
                    tabIndex={-1}
                    style={{
                      width: header.getSize()
                    }}
                    data-column-resizing={
                      header.column.getIsResizing() ? 'true' : undefined
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    {tableConfig.enableColumnResizing &&
                      header.column.getCanResize() && (
                        <DataTableResizer header={header} table={table} />
                      )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {isLoading ? (
              // Loading state
              Array.from({ length: pageSize }).map((_, i) => (
                <TableRow
                  key={`loading-row-${crypto.randomUUID()}`}
                  tabIndex={-1}
                >
                  {Array.from({ length: columns.length }).map((_, j, array) => (
                    <TableCell
                      key={`skeleton-cell-${crypto.randomUUID()}`}
                      className='px-4 py-2 truncate max-w-0 text-left'
                      tabIndex={-1}
                    >
                      <Skeleton className='h-6 w-full' />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              // Data rows
              table.getRowModel().rows.map((row, rowIndex) => (
                <TableRow
                  key={row.id}
                  id={`row-${rowIndex}`}
                  data-row-index={rowIndex}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  tabIndex={0}
                  aria-selected={row.getIsSelected()}
                  onClick={
                    tableConfig.enableClickRowSelect
                      ? () => row.toggleSelected()
                      : undefined
                  }
                  onFocus={(e) => {
                    // Add a data attribute to the currently focused row
                    for (const el of document.querySelectorAll(
                      '[data-focused="true"]'
                    )) {
                      el.removeAttribute('data-focused');
                    }
                    e.currentTarget.setAttribute('data-focused', 'true');
                  }}
                >
                  {row.getVisibleCells().map((cell, cellIndex) => (
                    <TableCell
                      className='px-4 py-2 truncate max-w-0 text-left'
                      key={cell.id}
                      id={`cell-${rowIndex}-${cellIndex}`}
                      data-cell-index={cellIndex}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              // No results
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-24 text-left truncate'
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {tableConfig.enablePagination && (
        <DataTablePagination
          table={table}
          totalItems={data?.pagination.total_items || 0}
          totalSelectedItems={totalSelectedItems}
          pageSizeOptions={pageSizeOptions || [10, 25, 50, 100, 200]}
          size={tableConfig.size}
        />
      )}
    </div>
  );
}
