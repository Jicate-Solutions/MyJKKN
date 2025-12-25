/**
 * Table Skeleton Component
 *
 * Loading skeleton for data tables while data is being fetched.
 * Mimics the structure of TanStack/DataTable components.
 */

import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

interface TableSkeletonProps {
  /**
   * Number of rows to show in skeleton
   * @default 10
   */
  rows?: number;
  /**
   * Number of columns to show in skeleton
   * @default 5
   */
  columns?: number;
  /**
   * Show table toolbar (filters, search)
   * @default true
   */
  showToolbar?: boolean;
}

export function TableSkeleton({
  rows = 10,
  columns = 5,
  showToolbar = true
}: TableSkeletonProps = {}) {
  return (
    <div className="space-y-4">
      {/* Toolbar skeleton */}
      {showToolbar && (
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
      )}

      {/* Table skeleton */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: columns }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-4 w-full" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: columns }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-64" />
      </div>
    </div>
  );
}

/**
 * Compact Table Skeleton
 *
 * Smaller table skeleton for embedded tables or modals
 */
export function CompactTableSkeleton() {
  return <TableSkeleton rows={5} columns={3} showToolbar={false} />;
}
