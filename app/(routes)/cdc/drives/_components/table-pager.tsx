'use client';

/**
 * One pager for every CDC drive table: rows-per-page (10 … 500, All),
 * "1–50 of 150", Previous / Next. Client-side over an already filtered list —
 * exports and bulk actions keep working on the WHOLE filtered list, not the page.
 */

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const PAGER_SIZES = [10, 20, 50, 100, 250, 500] as const;

export interface Pager<T> {
  pageRows: T[];
  pageStart: number;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number | 'all';
  setPage: (n: number) => void;
  setPageSize: (n: number | 'all') => void;
}

export function usePager<T>(items: T[], initialSize: number | 'all' = 50): Pager<T> {
  const [pageSize, setPageSizeState] = useState<number | 'all'>(initialSize);
  const [page, setPage] = useState(1);
  const pageCount = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(items.length / pageSize));
  // Filters can shrink the list under the current page — clamp instead of showing an empty page.
  const safePage = Math.min(page, pageCount);
  const pageStart = pageSize === 'all' ? 0 : (safePage - 1) * pageSize;
  return {
    pageRows: pageSize === 'all' ? items : items.slice(pageStart, pageStart + pageSize),
    pageStart,
    total: items.length,
    page: safePage,
    pageCount,
    pageSize,
    setPage,
    setPageSize: (n) => {
      setPageSizeState(n);
      setPage(1);
    },
  };
}

export function TablePager<T>({ pager }: { pager: Pager<T> }) {
  if (pager.total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Rows per page</span>
        <Select value={String(pager.pageSize)} onValueChange={(v) => pager.setPageSize(v === 'all' ? 'all' : parseInt(v, 10))}>
          <SelectTrigger className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGER_SIZES.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">
          {pager.pageStart + 1}–{Math.min(pager.pageStart + pager.pageRows.length, pager.total)} of {pager.total}
        </span>
        <Button variant="outline" size="sm" disabled={pager.page <= 1} onClick={() => pager.setPage(pager.page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-muted-foreground">
          Page {pager.page} / {pager.pageCount}
        </span>
        <Button variant="outline" size="sm" disabled={pager.page >= pager.pageCount} onClick={() => pager.setPage(pager.page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
