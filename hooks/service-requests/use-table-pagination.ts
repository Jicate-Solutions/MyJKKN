'use client';

import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '@/lib/services/service-requests/pagination';

/** Shape the shared DataTable expects for its `serverSidePagination` prop. */
export interface ServerSidePaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  isLoading?: boolean;
}

interface Metadata {
  total?: number;
  totalPages?: number;
}

/**
 * Paging + search state for a server-paginated service-requests table.
 *
 * Each table in this module used to render whatever a single unparameterised
 * fetch returned, which pinned it to the API's default page size. This holds
 * the `{ page, limit, search }` a list hook needs and builds the matching
 * `serverSidePagination` prop from the response metadata, so every table pages
 * through the full result set the same way.
 */
export function useTablePagination(initialPageSize: number = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [search, setSearch] = useState('');

  // Both narrow the result set, so page 12 of the old set is meaningless.
  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  const queryParams = useMemo(
    () => ({ page, limit: pageSize, search: search || undefined }),
    [page, pageSize, search]
  );

  const buildPaginationProps = useCallback(
    (metadata: Metadata | undefined, isLoading?: boolean): ServerSidePaginationProps => {
      const totalPages = metadata?.totalPages ?? 0;
      return {
        currentPage: page,
        totalPages,
        pageSize,
        totalItems: metadata?.total ?? 0,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        onPageChange: setPage,
        onPageSizeChange: handlePageSizeChange,
        isLoading,
      };
    },
    [page, pageSize, handlePageSizeChange]
  );

  return {
    page,
    pageSize,
    search,
    queryParams,
    setPage,
    handleSearch,
    handlePageSizeChange,
    buildPaginationProps,
  };
}
