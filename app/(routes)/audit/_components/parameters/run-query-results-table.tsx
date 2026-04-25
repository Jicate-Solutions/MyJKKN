'use client';

// run-query-results-table.tsx
// Renders rows returned by /api/audit/parameters/[code]/run-query.
//
// Props:
//   rows              → array of records (already server-side paginated)
//   totalCount        → total rows across all pages (from API response)
//   page / pageSize   → current page (1-indexed) + page size
//   onPageChange      → parent updates page → re-runs the mutation
//   isLoading         → show spinner overlay
//   parameterCode     → filename hint for CSV export
//   warning           → optional "more rows available" notice from API
//
// Spec: Thrash T4 → 100 rows/page + Export-to-CSV button.
// Client-side CSV (not server endpoint) keeps this PR self-contained.

import { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { rowsToCsv, downloadCsv } from './rows-to-csv';

interface RunQueryResultsTableProps {
  rows: Array<Record<string, unknown>>;
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  parameterCode: string;
  warning?: string;
}

export function RunQueryResultsTable({
  rows,
  totalCount,
  page,
  pageSize,
  onPageChange,
  isLoading = false,
  parameterCode,
  warning
}: RunQueryResultsTableProps) {
  const columns = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const row of rows) {
      for (const key of Object.keys(row ?? {})) {
        if (!seen.has(key)) {
          seen.add(key);
          ordered.push(key);
        }
      }
    }
    return ordered;
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const handleExportCsv = () => {
    const csv = rowsToCsv(rows);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeCode = parameterCode.replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadCsv(csv, `audit-${safeCode}-page${page}-${timestamp}.csv`);
  };

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(totalCount, page * pageSize);

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='text-sm text-muted-foreground'>
          {totalCount === 0 ? (
            'No rows returned.'
          ) : (
            <>
              Showing <span className='font-medium'>{rangeStart}</span>–
              <span className='font-medium'>{rangeEnd}</span> of{' '}
              <span className='font-medium'>{totalCount.toLocaleString()}</span>{' '}
              rows
            </>
          )}
        </div>
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={handleExportCsv}
          disabled={rows.length === 0 || isLoading}
        >
          <Download className='h-4 w-4 mr-2' />
          Export CSV
        </Button>
      </div>

      {warning && (
        <div className='text-xs p-2 rounded border border-amber-200 bg-amber-50 text-amber-900'>
          {warning}
        </div>
      )}

      <div className='relative border rounded overflow-hidden'>
        {isLoading && (
          <div className='absolute inset-0 bg-background/60 flex items-center justify-center z-10'>
            <Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
          </div>
        )}
        {rows.length === 0 ? (
          <div className='p-6 text-sm text-muted-foreground text-center'>
            No rows to display.
          </div>
        ) : (
          <div className='overflow-x-auto max-h-[500px]'>
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead
                      key={col}
                      className='font-mono text-xs whitespace-nowrap'
                    >
                      {col}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={idx}>
                    {columns.map((col) => (
                      <TableCell
                        key={col}
                        className='font-mono text-xs whitespace-nowrap max-w-[280px] truncate'
                        title={formatCell(row?.[col])}
                      >
                        {formatCell(row?.[col])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className='flex items-center justify-between gap-2'>
          <span className='text-xs text-muted-foreground'>
            Page {page} of {totalPages}
          </span>
          <div className='flex gap-2'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={!hasPrev || isLoading}
            >
              <ChevronLeft className='h-4 w-4' />
              Prev
            </Button>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => onPageChange(page + 1)}
              disabled={!hasNext || isLoading}
            >
              Next
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
