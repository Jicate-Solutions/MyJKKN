'use client';

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * How a column is placed on the phone card (below `md`):
 * - `title`  — bold first line, left (one column per list)
 * - `badge`  — first line, right (status)
 * - `meta`   — label/value pair in the 2-col grid under the title (default)
 * - `hidden` — desktop table only (e.g. the Actions column when the card is tappable)
 */
export type MobileSlot = 'title' | 'badge' | 'meta' | 'hidden';

export interface ResponsiveColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Applied to both <TableHead> and <TableCell> (alignment, width). */
  className?: string;
  mobile?: MobileSlot;
  /** Label on the card when `header` isn't plain text. */
  mobileLabel?: string;
}

interface ResponsiveListProps<T> {
  rows: T[];
  columns: ResponsiveColumn<T>[];
  getRowKey: (row: T) => string;
  /** Makes the whole card (and table row) tappable. */
  onRowClick?: (row: T) => void;
  /** Accessible name for the tappable card, e.g. `View PO PO-0012`. */
  rowLabel?: (row: T) => string;
  /** Extra content at the bottom of each card (row-level buttons on mobile). */
  mobileFooter?: (row: T) => ReactNode;
  className?: string;
}

/**
 * Table on `md`+ and a stacked card list below it. Every procurement list page
 * renders the same data both ways from one column definition, so the two views
 * can't drift apart.
 */
export function ResponsiveList<T>({
  rows,
  columns,
  getRowKey,
  onRowClick,
  rowLabel,
  mobileFooter,
  className,
}: ResponsiveListProps<T>) {
  const title = columns.find((c) => c.mobile === 'title');
  const badge = columns.find((c) => c.mobile === 'badge');
  const meta = columns.filter((c) => (c.mobile ?? 'meta') === 'meta');

  return (
    <div className={className}>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={cn('whitespace-nowrap', c.className)}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={getRowKey(row)}
                className={cn(onRowClick && 'cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.className}>
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y md:hidden">
        {rows.map((row) => {
          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 break-words font-semibold">
                  {title ? title.cell(row) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {badge ? badge.cell(row) : null}
                  {onRowClick && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>
              {meta.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {meta.map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-xs text-muted-foreground">
                        {c.mobileLabel ?? c.header}
                      </dt>
                      <dd className="break-words">{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          );

          return (
            <li key={getRowKey(row)} className="p-4">
              {onRowClick ? (
                <button
                  type="button"
                  className="block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={rowLabel?.(row)}
                  onClick={() => onRowClick(row)}
                >
                  {body}
                </button>
              ) : (
                body
              )}
              {mobileFooter && (
                <div className="mt-3 flex flex-wrap gap-2">{mobileFooter(row)}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
