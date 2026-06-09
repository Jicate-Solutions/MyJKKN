'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Check, X, Trash2, Users, DoorOpen, BedDouble, Building2, Eye } from 'lucide-react';
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
  const { can, isSuperAdmin } = usePermissions();
  const { data, isLoading, refetch } = useAllocationBatch(id);
  const { approve, reject, reset } = useAllocationBatchActions();
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [detail, setDetail] = useState<ProposedAllocation | null>(null);

  const batch = data?.batch ?? null;
  const allocations = data?.allocations ?? [];
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

  if (isLoading || !batch) {
    return (
      <ContentLayout title="Allocation Batch">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  // Summary stats for this batch.
  const studentsAllocated = allocations.length;
  const roomsUsed = new Set(
    allocations.map((a) => a.room_number).filter(Boolean)
  ).size;
  const bedsAllocated = allocations.filter((a) => a.bed_number).length;
  const blockCapacity = batch.block_total_capacity;
  const blockOccupancy = batch.block_current_occupancy;

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
          {canApprove && (
            <div className="flex gap-2">
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
            </div>
          )}
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span className="text-xs">Students Allocated</span>
              </div>
              <p className="text-2xl font-bold mt-1">{studentsAllocated}</p>
              {batch.skipped_count > 0 && (
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
              <p className="text-2xl font-bold mt-1">{roomsUsed}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <BedDouble className="h-4 w-4" />
                <span className="text-xs">Beds Allocated</span>
              </div>
              <p className="text-2xl font-bold mt-1">{bedsAllocated}</p>
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
            <CardTitle className="text-base">
              Proposed mapping ({allocations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allocations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No allocations in this batch.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Learner</TableHead>
                      <TableHead>Institution</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Semester</TableHead>
                      <TableHead>Block</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead>Bed</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.learner_name}</TableCell>
                        <TableCell>{a.learner_institution ?? '—'}</TableCell>
                        <TableCell>{a.learner_program ?? '—'}</TableCell>
                        <TableCell>{a.learner_semester ?? '—'}</TableCell>
                        <TableCell>{a.block_name ?? '—'}</TableCell>
                        <TableCell>{a.room_number ?? '—'}</TableCell>
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
