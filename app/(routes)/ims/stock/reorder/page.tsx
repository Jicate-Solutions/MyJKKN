'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, PackageX, Search, Send, Settings2 } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import { useImsStoreReorderList } from '@/hooks/ims/use-ims-stock';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { errorMessage } from '@/lib/utils/supabase-error';
import type { ImsReorderRow, ImsReorderStatus } from '@/types/ims';
import { SendToProcurementDialog } from '../_components/send-to-procurement-dialog';

const PAGE_SIZE = 50;

type Filter = 'all' | ImsReorderStatus;

const STATUS_BADGE: Record<ImsReorderStatus, { label: string; className: string }> = {
  out_of_stock: { label: 'Out of stock', className: 'bg-red-100 text-red-800 border-red-200' },
  low_stock: { label: 'Low stock', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  unset_reorder_level: {
    label: 'No reorder level',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  },
};

/** Rows that "select all" picks up: orderable and not already on an open request. */
const isBulkSelectable = (r: ImsReorderRow) =>
  r.status !== 'unset_reorder_level' && !r.open_request_id;

export default function ReorderPage() {
  const router = useRouter();
  const { storeId, storeName } = useImsStoreContext();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canRequest = isSuperAdmin || canAccess('procurement', 'request_create');

  const { data: rows = [], isLoading, error } = useImsStoreReorderList(storeId || '');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);

  const counts = useMemo(() => {
    const c = { out_of_stock: 0, low_stock: 0, unset_reorder_level: 0, onRequest: 0 };
    for (const r of rows) {
      c[r.status]++;
      if (r.open_request_id) c.onRequest++;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === 'all' || r.status === filter) &&
        (!q ||
          r.item_name.toLowerCase().includes(q) ||
          (r.item_code ?? '').toLowerCase().includes(q) ||
          (r.category_name ?? '').toLowerCase().includes(q))
    );
  }, [rows, search, filter]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Select-all works over everything the filter shows, not just this page.
  const bulkRows = visible.filter(isBulkSelectable);
  const bulkSelected = bulkRows.filter((r) => selectedIds.has(r.item_id)).length;
  const headerState: boolean | 'indeterminate' =
    bulkRows.length > 0 && bulkSelected === bulkRows.length
      ? true
      : bulkSelected > 0
        ? 'indeterminate'
        : false;

  // Selection is kept by id; resolve against the live list so a row that drops off
  // after a refetch cannot be sent.
  const selectedRows = rows.filter(
    (r) => selectedIds.has(r.item_id) && r.status !== 'unset_reorder_level'
  );

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (headerState === true) bulkRows.forEach((r) => next.delete(r.item_id));
      else bulkRows.forEach((r) => next.add(r.item_id));
      return next;
    });

  const changeFilter = (f: Filter) => {
    setFilter(f);
    setPage(1);
  };

  return (
    <ContentLayout title="Reorder">
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reorder list</h1>
          <p className="text-sm text-muted-foreground">
            Everything {storeName ?? 'this store'} carries that is out of stock or at its reorder
            level. Select items and send them to Procurement as one purchase request.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard
            icon={<PackageX className="h-4 w-4 text-red-600" />}
            label="Out of stock"
            value={counts.out_of_stock}
            valueClass="text-red-600"
          />
          <SummaryCard
            icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
            label="Low stock"
            value={counts.low_stock}
            valueClass="text-orange-600"
          />
          <SummaryCard
            icon={<Settings2 className="h-4 w-4 text-muted-foreground" />}
            label="No reorder level set"
            value={counts.unset_reorder_level}
          />
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <Tabs value={filter} onValueChange={(v) => changeFilter(v as Filter)}>
                <TabsList className="flex h-auto flex-wrap">
                  <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
                  <TabsTrigger value="out_of_stock">Out of stock ({counts.out_of_stock})</TabsTrigger>
                  <TabsTrigger value="low_stock">Low stock ({counts.low_stock})</TabsTrigger>
                  <TabsTrigger value="unset_reorder_level">
                    No reorder level ({counts.unset_reorder_level})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="reorder-search"
                  placeholder="Search item, code or category…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-10"
                />
              </div>
            </div>

            {canRequest && (
              <div className="flex flex-col gap-2 rounded-md border bg-muted/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">
                  <span className="font-medium tabular-nums">{selectedRows.length}</span> selected
                  {bulkRows.length > 0 && (
                    <span className="text-muted-foreground">
                      {' '}
                      · {bulkSelected} of {bulkRows.length} available in this view
                    </span>
                  )}
                  {counts.onRequest > 0 && (
                    <span className="text-muted-foreground">
                      {' '}
                      · {counts.onRequest} already on an open request
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  {selectedRows.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                      Clear
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={selectedRows.length === 0 || !storeId}
                    onClick={() => setDialogOpen(true)}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Send {selectedRows.length || ''} to Procurement
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="#6366f1" size={12} />
              </div>
            ) : error ? (
              <div className="py-12 text-center text-sm text-destructive">
                {errorMessage(error, 'Could not load the reorder list.')}
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                Nothing needs reordering — every item this store carries is above its reorder level.
              </div>
            ) : visible.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No items match this filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {canRequest && (
                        <TableHead className="w-[40px]">
                          <Checkbox
                            checked={headerState}
                            disabled={bulkRows.length === 0}
                            onCheckedChange={toggleAll}
                            aria-label="Select every orderable item in this view"
                          />
                        </TableHead>
                      )}
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">On hand</TableHead>
                      <TableHead className="text-right">Reorder level</TableHead>
                      <TableHead className="text-right">Max level</TableHead>
                      <TableHead className="text-right">Suggested</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r) => {
                      const unset = r.status === 'unset_reorder_level';
                      const badge = STATUS_BADGE[r.status];
                      const maxMissing = !unset && r.max_stock_level <= r.reorder_level;
                      return (
                        <TableRow
                          key={r.item_id}
                          data-state={selectedIds.has(r.item_id) ? 'selected' : undefined}
                        >
                          {canRequest && (
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(r.item_id)}
                                disabled={unset}
                                onCheckedChange={() => toggle(r.item_id)}
                                aria-label={`Select ${r.item_name}`}
                              />
                            </TableCell>
                          )}
                          <TableCell>
                            <div className="font-medium">{r.item_name}</div>
                            <div className="text-xs text-muted-foreground">{r.item_code ?? '—'}</div>
                          </TableCell>
                          <TableCell>{r.category_name ?? '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.on_hand}{' '}
                            <span className="text-sm text-muted-foreground">
                              {r.unit_abbreviation ?? ''}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {unset ? '—' : r.reorder_level}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {unset ? '—' : maxMissing ? (
                              <span
                                className="text-muted-foreground"
                                title="Max level is not above the reorder level, so the suggestion tops up to twice the reorder level."
                              >
                                not set
                              </span>
                            ) : (
                              r.max_stock_level
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.suggested_quantity ?? '—'}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className={badge.className}>
                                {badge.label}
                              </Badge>
                              {r.open_request_id && (
                                <Link
                                  href={`/procurement/requests/${r.open_request_id}`}
                                  className="text-xs text-primary underline-offset-2 hover:underline"
                                >
                                  On {r.open_request_number} ({r.open_request_status})
                                </Link>
                              )}
                              {unset && (
                                <Link
                                  href="/ims/inventory/items"
                                  className="text-xs text-primary underline-offset-2 hover:underline"
                                >
                                  Set reorder level
                                </Link>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {pageCount > 1 && (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground tabular-nums">
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, visible.length)} of{' '}
              {visible.length}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {storeId && (
        <SendToProcurementDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          storeId={storeId}
          storeName={storeName ?? null}
          selectedRows={selectedRows}
          onRemove={toggle}
          onSuccess={(request) => {
            setDialogOpen(false);
            setSelectedIds(new Set());
            router.push(`/procurement/requests/${request.id}`);
          }}
        />
      )}
    </ContentLayout>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold tabular-nums ${valueClass ?? ''}`}>{value}</p>
        </div>
        {icon}
      </CardContent>
    </Card>
  );
}
