'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
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
import { Loader2, Check, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import {
  usePendingRequests,
  useSelfAllocationActions,
} from '@/hooks/campus-living/use-self-allocation';

export default function PendingApprovalsPage() {
  const { data: pending, isLoading } = usePendingRequests();
  const { approve, reject } = useSelfAllocationActions();
  const { can, isSuperAdmin } = usePermissions();
  const [acting, setActing] = useState<string | null>(null);
  const canApprove = isSuperAdmin || can('campus_living.allocations.approve');

  const act = async (id: string, kind: 'approve' | 'reject') => {
    setActing(id + kind);
    try {
      if (kind === 'approve') {
        await approve(id);
        toast.success('Request approved — learner allocated');
      } else {
        await reject(id);
        toast.success('Request rejected');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(null);
    }
  };

  return (
    <ContentLayout title="Pending Approvals">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations', href: '/campus-living/allocations' },
          { label: 'Pending Approvals' },
        ]}
      />
      <div className="space-y-4 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Pending Approvals</h1>
          <p className="text-sm text-muted-foreground">
            Learner self-selected room requests awaiting your approval (scoped to your block).
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : !pending || pending.length === 0 ? (
          <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
            No pending room requests.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Learner</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Bed</TableHead>
                  {canApprove && <TableHead className="text-right">Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.learner_name}</TableCell>
                    <TableCell>{a.block_name ?? '—'}</TableCell>
                    <TableCell>{a.room_number ?? '—'}</TableCell>
                    <TableCell>{a.bed_number ?? '—'}</TableCell>
                    {canApprove && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => act(a.id, 'reject')}
                            disabled={!!acting}
                          >
                            {acting === a.id + 'reject' ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => act(a.id, 'approve')}
                            disabled={!!acting}
                          >
                            {acting === a.id + 'approve' ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="h-4 w-4 mr-1" /> Approve
                              </>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
