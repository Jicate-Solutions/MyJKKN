'use client';

import { use, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Check, X, Trash2, Users, DoorOpen, BedDouble, Building2, Eye, FileDown } from 'lucide-react';
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
import { toast } from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useAllocationBatch,
  useAllocationBatchActions,
} from '@/hooks/campus-living/use-allocation-batches';
import type { ProposedAllocation } from '@/types/allocation-batch';
import { AllocationDetailDialog } from './_components/allocation-detail-dialog';

export const navMeta = { invokedFrom: '/campus-living/allocations/batches' } as const;

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending_approval: 'secondary',
  approved: 'default',
  rejected: 'destructive',
};

export default function AllocationBatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, isSuperAdmin } = usePermissions();
  const { data, isLoading, refetch } = useAllocationBatch(id);
  const { approve, reject, reset, removeAllocations } = useAllocationBatchActions();
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [detail, setDetail] = useState<ProposedAllocation | null>(null);
  const [exporting, setExporting] = useState(false);
  const [filterCleared, setFilterCleared] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmRemoveSelected, setConfirmRemoveSelected] = useState(false);
  const [removingSelected, setRemovingSelected] = useState(false);

  const batch = data?.batch ?? null;
  const allocations = data?.allocations ?? [];
  // A batch spans every room category its block-wide run touched (see the
  // Batches list page), so "Deluxe Room" / "Premium Room" rows there both
  // link to this same batch. This carries the category the operator clicked
  // through as a view-only filter on the table below — it does not scope
  // Approve/Reject/Reset/Export, which always act on the whole batch.
  const categoryFilter = filterCleared ? null : searchParams.get('category');
  const filteredAllocations = categoryFilter
    ? allocations.filter((a) => a.room_category === categoryFilter)
    : allocations;
  const canApprove = isSuperAdmin || can('campus_living.allocations.approve');
  const isPending = batch?.status === 'pending_approval';

  const doApprove = async () => {
    setActing('approve');
    try {
      await approve(id);
      toast.success('Batch approved — learners allocated and beds occupied');
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to approve');
    } finally {
      setActing(null);
    }
  };
  const doReject = async () => {
    setActing('reject');
    try {
      await reject(id);
      toast.success('Batch rejected — proposed allocations discarded');
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reject');
    } finally {
      setActing(null);
    }
  };
  const doReset = async () => {
    setResetting(true);
    try {
      await reset(id);
      toast.success('Batch removed');
      router.push('/campus-living/allocations/batches');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset');
      setResetting(false);
    }
  };

  const doRemoveSelected = async () => {
    setRemovingSelected(true);
    try {
      const ids = [...selectedIds];
      await removeAllocations(id, ids);
      toast.success(`Removed ${ids.length} allocation${ids.length === 1 ? '' : 's'}`);
      setSelectedIds(new Set());
      setConfirmRemoveSelected(false);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove selected allocations');
    } finally {
      setRemovingSelected(false);
    }
  };

  // Export the batch's allocated details to a PDF. Available to any viewer
  // (not gated on approve). jsPDF is dynamically imported to stay out of the
  // page bundle until the operator actually exports.
  const handleExportPdf = async () => {
    if (!batch || allocations.length === 0) {
      toast.error('No allocations to export');
      return;
    }
    try {
      setExporting(true);
      const { exportBatchAllocationsPdf } = await import('./_components/batch-allocations-pdf');
      await exportBatchAllocationsPdf(batch, allocations);
      toast.success(
        `Exported ${allocations.length} allocation${allocations.length === 1 ? '' : 's'} to PDF`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  if (isLoading || !batch) {
    return (
      <ContentLayout title="Allocation Batch">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  // Summary stats for this batch. Driven by filteredAllocations so the cards
  // stay in sync with the category filter/badge on the table below — picking
  // "Deluxe Room" from the Batches list shows Deluxe-only numbers here too,
  // not the whole batch's combined totals.
  const studentsAllocated = filteredAllocations.length;
  const roomsUsed = new Set(
    filteredAllocations.map((a) => a.room_number).filter(Boolean)
  ).size;
  const bedsAllocated = filteredAllocations.filter((a) => a.bed_number).length;
  const blockCapacity = batch.block_total_capacity;
  const blockOccupancy = batch.block_current_occupancy;

  // Per-room-category breakdown — a batch can span multiple room categories
  // (Classic/Deluxe/Premium) at once, so a single combined total hides how
  // many of each this batch actually used. Only rendered when a batch spans
  // more than one category; single-category batches (and a filtered view,
  // which is always single-category) keep the plain total.
  const categoryStatsMap = new Map<string, { students: number; rooms: Set<string>; beds: number }>();
  for (const a of filteredAllocations) {
    const cat = a.room_category ?? 'Uncategorized';
    const entry = categoryStatsMap.get(cat) ?? { students: 0, rooms: new Set<string>(), beds: 0 };
    entry.students += 1;
    if (a.room_number) entry.rooms.add(a.room_number);
    if (a.bed_number) entry.beds += 1;
    categoryStatsMap.set(cat, entry);
  }
  const categoryStats = [...categoryStatsMap.entries()].map(([category, s]) => ({
    category,
    students: s.students,
    rooms: s.rooms.size,
    beds: s.beds,
  }));
  const hasMultipleCategories = categoryStats.length > 1;

  return (
    <ContentLayout title="Allocation Batch">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations', href: '/campus-living/allocations' },
          { label: 'Batches', href: '/campus-living/allocations/batches' },
          { label: batch.category_name ?? 'Batch' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{batch.category_name ?? 'Batch'}</h1>
              <Badge variant={STATUS_VARIANT[batch.status] ?? 'outline'}>
                {batch.status.replace('_', ' ')}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {batch.block_name ?? '—'} · {batch.allocated_count} proposed
              {batch.skipped_count > 0 ? ` · ${batch.skipped_count} skipped` : ''}
            </p>
            {batch.notes && (
              <p className="text-xs text-muted-foreground mt-1">{batch.notes}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleExportPdf}
              disabled={exporting || allocations.length === 0}
            >
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
              Export PDF
            </Button>
            {canApprove && (
              <>
                {isPending && (
                  <>
                    <Button variant="outline" onClick={doReject} disabled={!!acting || resetting}>
                      {acting === 'reject' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                      Reject
                    </Button>
                    <Button onClick={doApprove} disabled={!!acting || resetting}>
                      {acting === 'approve' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                      Approve &amp; allocate
                    </Button>
                  </>
                )}
                <Button variant="destructive" onClick={() => setConfirmReset(true)} disabled={!!acting || resetting}>
                  {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Reset
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span className="text-xs">Students Allocated</span>
              </div>
              {hasMultipleCategories ? (
                <div className="mt-1 space-y-0.5">
                  {categoryStats.map((c) => (
                    <div key={c.category} className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-muted-foreground truncate">{c.category}</span>
                      <span className="text-sm font-semibold">{c.students}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-2xl font-bold mt-1">{studentsAllocated}</p>
              )}
              {!categoryFilter && batch.skipped_count > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {batch.skipped_count} skipped
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DoorOpen className="h-4 w-4" />
                <span className="text-xs">Rooms Used</span>
              </div>
              {hasMultipleCategories ? (
                <div className="mt-1 space-y-0.5">
                  {categoryStats.map((c) => (
                    <div key={c.category} className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-muted-foreground truncate">{c.category}</span>
                      <span className="text-sm font-semibold">{c.rooms}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-2xl font-bold mt-1">{roomsUsed}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <BedDouble className="h-4 w-4" />
                <span className="text-xs">Beds Allocated</span>
              </div>
              {hasMultipleCategories ? (
                <div className="mt-1 space-y-0.5">
                  {categoryStats.map((c) => (
                    <div key={c.category} className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-muted-foreground truncate">{c.category}</span>
                      <span className="text-sm font-semibold">{c.beds}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-2xl font-bold mt-1">{bedsAllocated}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span className="text-xs">Block Capacity</span>
              </div>
              <p className="text-2xl font-bold mt-1">{blockCapacity ?? '—'}</p>
              {blockCapacity != null && blockOccupancy != null && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {blockOccupancy} occupied · {Math.max(blockCapacity - blockOccupancy, 0)} free
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">
                  Proposed mapping ({filteredAllocations.length}
                  {categoryFilter ? ` of ${allocations.length}` : ''})
                </CardTitle>
                {categoryFilter && (
                  <Badge variant="secondary" className="gap-1.5">
                    {categoryFilter}
                    <button
                      type="button"
                      onClick={() => setFilterCleared(true)}
                      aria-label="Clear category filter"
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
              </div>
              {canApprove && selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmRemoveSelected(true)}
                  disabled={removingSelected}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Remove selected ({selectedIds.size})
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {allocations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No allocations in this batch.
              </p>
            ) : filteredAllocations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No allocations in the {categoryFilter} category for this batch.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {canApprove && (
                        <TableHead className="w-10">
                          <Checkbox
                            aria-label="Select all visible rows"
                            checked={
                              filteredAllocations.length > 0 &&
                              filteredAllocations.every((a) => selectedIds.has(a.id))
                            }
                            onCheckedChange={(checked) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (checked) {
                                  filteredAllocations.forEach((a) => next.add(a.id));
                                } else {
                                  filteredAllocations.forEach((a) => next.delete(a.id));
                                }
                                return next;
                              });
                            }}
                          />
                        </TableHead>
                      )}
                      <TableHead>Learner</TableHead>
                      <TableHead>Institution</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Semester</TableHead>
                      <TableHead>Block</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead>Floor</TableHead>
                      <TableHead>Room Category</TableHead>
                      <TableHead>Mess Category</TableHead>
                      <TableHead>Bed</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAllocations.map((a) => (
                      <TableRow key={a.id}>
                        {canApprove && (
                          <TableCell>
                            <Checkbox
                              aria-label={`Select ${a.learner_name}`}
                              checked={selectedIds.has(a.id)}
                              onCheckedChange={(checked) => {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(a.id);
                                  else next.delete(a.id);
                                  return next;
                                });
                              }}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-medium">{a.learner_name}</TableCell>
                        <TableCell>{a.learner_institution ?? '—'}</TableCell>
                        <TableCell>{a.learner_program ?? '—'}</TableCell>
                        <TableCell>{a.learner_semester ?? '—'}</TableCell>
                        <TableCell>{a.block_name ?? '—'}</TableCell>
                        <TableCell>{a.room_number ?? '—'}</TableCell>
                        <TableCell>{a.room_floor ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{a.room_category ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{a.mess_category ?? '—'}</TableCell>
                        <TableCell>{a.bed_number ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {a.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setDetail(a)}>
                            <Eye className="mr-1.5 h-4 w-4" /> Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={confirmReset} onOpenChange={(o) => { if (!resetting) setConfirmReset(o); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset this batch?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the batch and all {allocations.length} of its
                allocations
                {batch.status === 'approved' ? ', and frees the beds they occupy' : ''}.
                This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  doReset();
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

        <AlertDialog
          open={confirmRemoveSelected}
          onOpenChange={(o) => { if (!removingSelected) setConfirmRemoveSelected(o); }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {selectedIds.size} selected allocation{selectedIds.size === 1 ? '' : 's'}?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes just the selected learner{selectedIds.size === 1 ? '' : 's'} from
                this batch{batch.status === 'approved' ? ' and frees the bed(s) they occupy' : ''}.
                The rest of the batch is unaffected. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removingSelected}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  doRemoveSelected();
                }}
                disabled={removingSelected}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {removingSelected ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Removing…
                  </>
                ) : (
                  'Remove selected'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AllocationDetailDialog
          open={!!detail}
          onOpenChange={(o) => {
            if (!o) setDetail(null);
          }}
          allocationId={detail?.id ?? null}
          learnerName={detail?.learner_name ?? ''}
        />
      </div>
    </ContentLayout>
  );
}
