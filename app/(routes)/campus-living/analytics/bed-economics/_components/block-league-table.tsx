'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Users } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useBedEconBlockGrid } from '@/hooks/campus-living/use-bed-economics';
import type { BedEconBlockRow } from '@/types/bed-economics';
import { formatInt, formatPct, formatRupeesPlain } from './format';

/**
 * Per-block league table (spec §8 item 4). Sortable on every numeric column.
 * Cost / ROI columns render an "enter costs →" link to settings/block-economics
 * when the row's has_opex / has_capex flags are unset. Shared blocks (a block
 * owned by >1 institution, §6) get a "Shared" badge and their per-institution
 * bed counts are labelled rather than silently summed.
 */

type Props = {
  hostelYearId: string | undefined;
  institutionId: string | undefined;
};

type SortKey = keyof Pick<
  BedEconBlockRow,
  'block_name' | 'sellable_beds' | 'occupied_beds' | 'bed_occupancy_pct' | 'billed' | 'collected' | 'rev_pab' | 'vacancy_loss' | 'margin_per_bed'
>;

export function BlockLeagueTable({ hostelYearId, institutionId }: Props) {
  const { data, isLoading, error } = useBedEconBlockGrid(hostelYearId, institutionId);
  // Default sort: sellable_beds desc. billed is 0 for every block during the
  // pre-billing launch window, so a billed-default would be arbitrary order;
  // bed count is stable and meaningful before any bills exist.
  const [sortKey, setSortKey] = useState<SortKey>('sellable_beds');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => {
    const list = [...(data ?? [])];
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // String column (block_name).
      if (typeof av === 'string' || typeof bv === 'string') {
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
        return sortDir === 'asc' ? cmp : -cmp;
      }
      // Numeric / null — nulls always sort LAST in both directions. We can't
      // fold null into ±Infinity (that pins it to one end and flips with
      // direction), so handle nulls explicitly before the numeric compare.
      const aNull = av === null || av === undefined;
      const bNull = bv === null || bv === undefined;
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      const an = av as number;
      const bn = bv as number;
      return sortDir === 'asc' ? an - bn : bn - an;
    });
    return list;
  }, [data, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'block_name' ? 'asc' : 'desc');
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Block league table</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load block league table</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Block league table</CardTitle>
        <CardDescription>
          Per-block utilisation, revenue, and return. Click a column to sort.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed bg-muted/40 text-sm text-muted-foreground">
            No blocks found for this scope.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Block" col="block_name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left" />
                  <TableHead className="min-w-[140px]">Institutions</TableHead>
                  <SortableHead label="Beds" col="sellable_beds" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="Occ %" col="bed_occupancy_pct" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="Billed ₹" col="billed" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="Collected ₹" col="collected" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="RevPAB ₹" col="rev_pab" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="Vacancy ₹" col="vacancy_loss" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="Margin/bed" col="margin_per_bed" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.block_id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/campus-living/blocks/${r.block_id}`}
                        className="cursor-pointer hover:underline"
                      >
                        {r.block_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">{r.institution_names}</span>
                        {r.is_shared && (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <Users className="h-3 w-3" />
                            Shared
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInt(r.sellable_beds)}
                      {r.is_shared && (
                        <span className="ml-1 text-[10px] text-amber-600" title="Shared block — per-institution bed count is not additive across institutions.">
                          *
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPct(r.bed_occupancy_pct)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRupeesPlain(r.billed)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRupeesPlain(r.collected)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRupeesPlain(r.rev_pab)}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-700">{formatRupeesPlain(r.vacancy_loss)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.has_opex ? (
                        formatRupeesPlain(r.margin_per_bed)
                      ) : (
                        <Link
                          href="/campus-living/settings/block-economics"
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          enter costs →
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {rows.some((r) => r.is_shared) && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            * Shared block — bed counts shown under each institution are not additive across institutions (counted once at network level).
          </p>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          Per-block revenue attributes a bill to the block of the learner&apos;s current allocation; bills without a current allocation count in the network total but no block row.
        </p>
      </CardContent>
    </Card>
  );
}

function SortableHead({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = 'right',
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sortKey === col;
  return (
    <TableHead className={align === 'right' ? 'text-right' : ''}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 text-xs font-medium hover:text-foreground ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${active ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {label}
        {active ? (
          sortDir === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}
