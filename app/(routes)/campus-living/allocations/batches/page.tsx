'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, ArrowRight, Wand2, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useAllocationBatches,
  useAllocationBatchActions,
} from '@/hooks/campus-living/use-allocation-batches';
import { hostelAllocationKeys } from '@/hooks/campus-living/use-hostel-allocations';
import { unallocatedCandidatesKeys } from '@/hooks/campus-living/use-unallocated-candidates';
import {
  BatchAdvancedFilters,
  BATCH_STATUS_LABEL,
  BATCH_STATUS_VARIANT,
  EMPTY_BATCH_FILTERS,
  batchRowMatchesFilters,
  countActiveBatchFilters,
  explodeBatchRows,
} from './_components/batch-filters';

export default function AllocationBatchesPage() {
  const { data: batches, isLoading } = useAllocationBatches();
  const { can, isSuperAdmin } = usePermissions();
  const { resetMany } = useAllocationBatchActions();
  const qc = useQueryClient();

  // Same gate as the Reset button on the batch detail page.
  const canApprove = isSuperAdmin || can('campus_living.allocations.approve');

  // Selection is keyed by BATCH id, never by table row. A batch renders one row
  // per room category, but fn_reset_allocation_batch always destroys the whole
  // batch — so ticking any of a batch's category rows ticks them all and counts
  // as a single selection. Anything row-keyed would fire the same destructive
  // RPC once per category.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [filters, setFilters] = useState(EMPTY_BATCH_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const allRows = useMemo(() => explodeBatchRows(batches ?? []), [batches]);
  const visibleRows = useMemo(
    () => allRows.filter((r) => batchRowMatchesFilters(r, filters)),
    [allRows, filters]
  );
  const activeFilterCount = countActiveBatchFilters(filters);

  // Only VISIBLE batches can be acted on: a filter that hides a row must not
  // leave a still-ticked batch silently in range of Reset. Intersecting here
  // (rather than pruning selectedIds on every filter change) means clearing the
  // filter brings the earlier ticks back instead of losing them, while every
  // count and the reset itself always reflect what's actually on screen.
  const selectedBatches = useMemo(() => {
    const seen = new Set<string>();
    const out = [];
    for (const r of visibleRows) {
      if (!selectedIds.has(r.batch.id) || seen.has(r.batch.id)) continue;
      seen.add(r.batch.id);
      out.push(r.batch);
    }
    return out;
  }, [visibleRows, selectedIds]);

  const visibleBatchIds = useMemo(
    () => [...new Set(visibleRows.map((r) => r.batch.id))],
    [visibleRows]
  );
  const selectedAllocationCount = selectedBatches.reduce(
    (n, b) => n + (b.allocated_count ?? 0),
    0
  );
  const anyApproved = selectedBatches.some((b) => b.status === 'approved');
  // A selected batch whose other room-category rows are filtered out still gets
  // destroyed in full — worth saying out loud on the confirm step.
  const selectionSpansHiddenRows =
    activeFilterCount > 0 &&
    selectedBatches.some(
      (b) =>
        Math.max(1, b.category_breakdown?.length ?? 0) >
        visibleRows.filter((r) => r.batch.id === b.id).length
    );
  const allSelected =
    visibleBatchIds.length > 0 && visibleBatchIds.every((id) => selectedIds.has(id));

  const toggleBatch = (batchId: string, checked: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(batchId);
      else next.delete(batchId);
      return next;
    });

  const doResetSelected = async () => {
    setResetting(true);
    const ids = selectedBatches.map((b) => b.id);
    try {
      const failed = await resetMany(ids);
      const ok = ids.length - failed.length;
      if (ok > 0) {
        toast.success(`${ok} batch${ok === 1 ? '' : 'es'} reset — removed from the list`);
        // A reset frees the beds and returns the learners to Not Allocated, so
        // the allocation feeds and occupancy views are stale too.
        qc.invalidateQueries({ queryKey: hostelAllocationKeys.all });
        qc.invalidateQueries({ queryKey: unallocatedCandidatesKeys.all });
        qc.invalidateQueries({ queryKey: ['hostel-rooms'] });
        qc.invalidateQueries({ queryKey: ['hostel-beds'] });
      }
      if (failed.length > 0) {
        // Usual cause: the batch holds a deposit record, which the RPC refuses
        // to delete. Surface the database's own message rather than a generic one.
        toast.error(
          `${failed.length} batch${failed.length === 1 ? '' : 'es'} not reset — ${failed[0].message}`,
          { duration: 8000 }
        );
      }
      // Keep only the failures ticked so the operator can see what's left over.
      setSelectedIds(new Set(failed.map((f) => f.id)));
      if (failed.length === 0) setConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset selected batches');
    } finally {
      setResetting(false);
    }
  };

  return (
    <ContentLayout title="Allocation Batches">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations', href: '/campus-living/allocations' },
          { label: 'Batches' },
        ]}
      />
      <div className="space-y-4 mt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold py-1">Allocation Batches</h1>
            <p className="text-sm text-muted-foreground">
              Auto-allocation runs awaiting warden review, and their history.
            </p>
          </div>
          <Button asChild>
            <Link href="/campus-living/allocations/auto">
              <Wand2 className="h-4 w-4 mr-2" /> Auto-Allocate
            </Link>
          </Button>
        </div>

        {!isLoading && allRows.length > 0 && (
          <>
            <BatchAdvancedFilters
              rows={allRows}
              value={filters}
              onChange={setFilters}
              open={showFilters}
              onOpenChange={setShowFilters}
            />
            {activeFilterCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Showing {visibleRows.length} of {allRows.length} rows ·{' '}
                {visibleBatchIds.length} of {batches?.length ?? 0} batches. Room category and floor
                describe rows within a run — filtering by them hides the other categories of a
                batch, but Reset still acts on the whole run.
              </p>
            )}
          </>
        )}

        {canApprove && selectedBatches.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <p className="text-sm">
              <span className="font-medium">{selectedBatches.length}</span> batch
              {selectedBatches.length === 1 ? '' : 'es'} selected
              <span className="text-muted-foreground">
                {' '}
                · {selectedAllocationCount} allocation
                {selectedAllocationCount === 1 ? '' : 's'}
              </span>
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                disabled={resetting}
              >
                Clear
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={resetting}
              >
                {resetting ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                Reset selected ({selectedBatches.length})
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : allRows.length === 0 ? (
          <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
            No allocation batches yet. Run Auto-Allocate to create one.
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
            <p>No batches match the current filters.</p>
            <Button variant="link" size="sm" onClick={() => setFilters(EMPTY_BATCH_FILTERS)}>
              Clear all filters
            </Button>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {canApprove && (
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Select all visible batches"
                        checked={allSelected}
                        disabled={resetting}
                        onCheckedChange={(checked) =>
                          // Union / difference against the VISIBLE batches only,
                          // so select-all never reaches a filtered-out batch.
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (checked) visibleBatchIds.forEach((id) => next.add(id));
                            else visibleBatchIds.forEach((id) => next.delete(id));
                            return next;
                          })
                        }
                      />
                    </TableHead>
                  )}
                  <TableHead>Block</TableHead>
                  <TableHead>Floor</TableHead>
                  <TableHead>Room Category</TableHead>
                  <TableHead>Rooms</TableHead>
                  <TableHead>Beds</TableHead>
                  <TableHead>Allocated</TableHead>
                  <TableHead>Not Allocated</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map(({ key, batch: b, category: c }) => {
                  const isSelected = selectedIds.has(b.id);
                  return (
                    <TableRow
                      key={key}
                      data-state={canApprove && isSelected ? 'selected' : undefined}
                    >
                      {canApprove && (
                        <TableCell>
                          <Checkbox
                            aria-label={`Select batch ${b.block_name ?? ''}`.trim()}
                            checked={isSelected}
                            disabled={resetting}
                            onCheckedChange={(checked) => toggleBatch(b.id, checked === true)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{b.block_name ?? '—'}</TableCell>
                      <TableCell>{c?.floors ?? '—'}</TableCell>
                      <TableCell>{c?.category ?? '—'}</TableCell>
                      <TableCell>{c?.rooms ?? '—'}</TableCell>
                      <TableCell>{c?.beds ?? '—'}</TableCell>
                      <TableCell>{b.allocated_count}</TableCell>
                      <TableCell className="text-muted-foreground">{b.skipped_count}</TableCell>
                      <TableCell>
                        <Badge variant={BATCH_STATUS_VARIANT[b.status] ?? 'outline'}>
                          {BATCH_STATUS_LABEL[b.status] ?? b.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            href={
                              c
                                ? `/campus-living/allocations/batches/${b.id}?category=${encodeURIComponent(c.category)}`
                                : `/campus-living/allocations/batches/${b.id}`
                            }
                          >
                            Open <ArrowRight className="h-4 w-4 ml-1" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <AlertDialog
          open={confirmOpen}
          onOpenChange={(o) => {
            if (!resetting) setConfirmOpen(o);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Reset {selectedBatches.length} selected batch
                {selectedBatches.length === 1 ? '' : 'es'}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes {selectedBatches.length === 1 ? 'the batch' : 'the batches'}{' '}
                and all {selectedAllocationCount} of their allocations
                {anyApproved ? ', and frees the beds they occupy' : ''}. Resetting acts on the whole
                run, not just the room-category rows you ticked
                {selectionSpansHiddenRows
                  ? ' — and your filters are currently hiding some of those rows'
                  : ''}
                . A batch holding a deposit record is refused and stays in the list. This cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  doResetSelected();
                }}
                disabled={resetting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {resetting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Removing…
                  </>
                ) : (
                  'Reset & remove'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ContentLayout>
  );
}
