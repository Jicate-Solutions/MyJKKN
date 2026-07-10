'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  usePurchaseRequest,
  useSubmitPurchaseRequest,
  useApprovePurchaseRequest,
  useRejectPurchaseRequest,
  useCancelPurchaseRequest,
} from '@/hooks/procurement/use-purchase-requests';
import { PR_STATUS_CONFIG } from '@/types/procurement';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, Send, Check, X } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';

export default function PurchaseRequestDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();

  const { data: pr, isLoading } = usePurchaseRequest(id);
  const submitPR = useSubmitPurchaseRequest();
  const approvePR = useApprovePurchaseRequest();
  const rejectPR = useRejectPurchaseRequest();
  const cancelPR = useCancelPurchaseRequest();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const canApprove = isSuperAdmin || canAccess('procurement', 'request_approve');
  const isOwner = pr?.requested_by === profile?.id;

  if (isLoading) {
    return (
      <ContentLayout title="Purchase Request">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }
  if (!pr) {
    return (
      <ContentLayout title="Purchase Request">
        <p className="text-muted-foreground py-12 text-center">Request not found.</p>
      </ContentLayout>
    );
  }

  const statusConfig = PR_STATUS_CONFIG[pr.status];
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };

  return (
    <ContentLayout title={pr.request_number}>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/procurement/requests')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{pr.request_number}</h2>
              <p className="text-muted-foreground capitalize">
                {pr.request_type.replace('_', ' ')} · requested by{' '}
                {pr.requested_by_profile?.full_name || '—'}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-sm">
            {statusConfig.label}
          </Badge>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {pr.status === 'draft' && isOwner && (
            <Button onClick={() => run(() => submitPR.mutateAsync(id), 'Submitted for approval')}>
              <Send className="mr-2 h-4 w-4" />
              Submit for approval
            </Button>
          )}
          {pr.status === 'submitted' && canApprove && (
            <>
              <Button
                onClick={() =>
                  run(
                    () => approvePR.mutateAsync({ id, userId: profile!.id }),
                    'Request approved'
                  )
                }
              >
                <Check className="mr-2 h-4 w-4" />
                Approve
              </Button>
              <Button variant="outline" onClick={() => setRejectOpen(true)}>
                <X className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </>
          )}
          {(pr.status === 'draft' || pr.status === 'submitted') && isOwner && (
            <Button
              variant="ghost"
              onClick={() => run(() => cancelPR.mutateAsync(id), 'Request cancelled')}
            >
              Cancel request
            </Button>
          )}
        </div>

        {pr.status === 'rejected' && pr.rejection_reason && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <p className="text-sm">
                <span className="font-medium text-destructive">Rejected: </span>
                {pr.rejection_reason}
              </p>
            </CardContent>
          </Card>
        )}

        {pr.notes && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{pr.notes}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Specification</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  {pr.request_type === 'new_item' && <TableHead>Reason</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pr.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.item_name}</TableCell>
                    <TableCell>{it.item_spec || '—'}</TableCell>
                    <TableCell className="text-right">{it.required_quantity}</TableCell>
                    <TableCell>{it.unit_label || '—'}</TableCell>
                    {pr.request_type === 'new_item' && (
                      <TableCell className="max-w-[240px] truncate">{it.reason || '—'}</TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject purchase request</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (required)</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this request is being rejected..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim()}
              onClick={async () => {
                await run(
                  () =>
                    rejectPR.mutateAsync({ id, userId: profile!.id, reason: rejectReason }),
                  'Request rejected'
                );
                setRejectOpen(false);
                setRejectReason('');
              }}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
