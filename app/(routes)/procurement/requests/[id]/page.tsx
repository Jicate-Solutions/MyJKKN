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
  useApproveWithModifications,
  useRejectPurchaseRequest,
  useCancelPurchaseRequest,
} from '@/hooks/procurement/use-purchase-requests';
import { PR_STATUS_CONFIG } from '@/types/procurement';
import { StatusBadge } from '@/components/procurement/status-badge';
import { formatDateDMY } from '@/lib/utils/date-format';
import { AlertBox } from '@/components/ui/alert-box';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { ArrowLeft, Send, Check, X, Pencil } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';

export default function PurchaseRequestDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();

  const { data: pr, isLoading, isError } = usePurchaseRequest(id);
  const submitPR = useSubmitPurchaseRequest();
  const approvePR = useApprovePurchaseRequest();
  const approveWithMods = useApproveWithModifications();
  const rejectPR = useRejectPurchaseRequest();
  const cancelPR = useCancelPurchaseRequest();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [editingQty, setEditingQty] = useState(false);
  const [qtyEdits, setQtyEdits] = useState<Record<string, string>>({});

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
  if (isError) {
    return (
      <ContentLayout title="Purchase Request">
        <div className="py-12">
          <AlertBox type="error" message="Failed to load this purchase request. Please try again." />
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

  // Show the Reason column whenever any line is a new item, regardless of the
  // header's request_type summary (a 'mixed' request still has reasons to show).
  const hasNewItemLine = pr.items.some((it) => !it.domain_item_id);

  // "Draft" tells you the state but not that the request is inert until submitted,
  // nor where it goes next. Rejection already has its own card, so it is skipped.
  const STATUS_HINT: Record<string, string> = {
    draft: 'Only you can see this. Submitting sends it to a Super Admin for approval.',
    submitted: 'Waiting for a Super Admin. They may reduce quantities when approving.',
    approved: 'Approved. The next step is an RFQ to collect vendor quotations.',
    converted: 'Rolled into an RFQ — vendor quotations are being collected.',
    cancelled: 'Cancelled. This request will not go any further.',
  };
  const statusHint = STATUS_HINT[pr.status];
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e, 'Action failed'));
    }
  };

  return (
    <ContentLayout title={pr.request_number}>
      <div className="space-y-6 max-w-5xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Back to requests"
              onClick={() => router.push('/procurement/requests')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{pr.request_number}</h2>
              <p className="text-muted-foreground">
                <span className="capitalize">{pr.request_type.replace('_', ' ')}</span>
                {' · requested by '}
                {pr.requested_by_profile?.full_name || '—'}
                {pr.created_at ? ` · raised ${formatDateDMY(pr.created_at)}` : ''}
              </p>
            </div>
          </div>
          <StatusBadge status={pr.status} config={PR_STATUS_CONFIG} className="text-sm" />
        </div>

        {statusHint && (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {statusHint}
          </p>
        )}

        {/* Actions — affirmative on the left, declining or abandoning on the right,
            so Reject never sits shoulder-to-shoulder with Approve. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            {pr.status === 'draft' && isOwner && (
              <Button onClick={() => run(() => submitPR.mutateAsync(id), 'Submitted for approval')}>
                <Send className="mr-2 h-4 w-4" />
                Submit for approval
              </Button>
            )}
            {editingQty && (
              <Button
                disabled={pr.items.some((it) => !(Number(qtyEdits[it.id]) > 0))}
                onClick={() =>
                  run(async () => {
                    const itemUpdates = pr.items
                      .filter((it) => Number(qtyEdits[it.id]) !== Number(it.required_quantity))
                      .map((it) => ({ itemId: it.id, required_quantity: Number(qtyEdits[it.id]) }));
                    await approveWithMods.mutateAsync({ id, userId: profile!.id, itemUpdates });
                    setEditingQty(false);
                  }, 'Request approved with updated quantities')
                }
              >
                <Check className="mr-2 h-4 w-4" />
                Save &amp; Approve
              </Button>
            )}
            {!editingQty && pr.status === 'submitted' && canApprove && (
              <>
                <Button
                  onClick={() =>
                    run(() => approvePR.mutateAsync({ id, userId: profile!.id }), 'Request approved')
                  }
                >
                  <Check className="mr-2 h-4 w-4" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setQtyEdits(
                      Object.fromEntries(
                        pr.items.map((it) => [it.id, String(Number(it.required_quantity))])
                      )
                    );
                    setEditingQty(true);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Modify &amp; Approve
                </Button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {editingQty && (
              <Button variant="ghost" onClick={() => setEditingQty(false)}>
                Cancel edit
              </Button>
            )}
            {!editingQty && pr.status === 'submitted' && canApprove && (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setRejectOpen(true)}
              >
                <X className="mr-2 h-4 w-4" />
                Reject
              </Button>
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
            <CardHeader>
              <CardTitle className="text-base">Notes for the approver</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{pr.notes}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items ({pr.items.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Specification</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  {hasNewItemLine && <TableHead>Reason</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pr.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.item_name}</TableCell>
                    <TableCell>{it.item_spec || '—'}</TableCell>
                    <TableCell className="text-right">
                      {editingQty ? (
                        <>
                          <Input
                            type="number"
                            min={0.01}
                            step="any"
                            value={qtyEdits[it.id] ?? ''}
                            onChange={(e) =>
                              setQtyEdits((p) => ({ ...p, [it.id]: e.target.value }))
                            }
                            className="h-8 w-24 ml-auto text-right"
                          />
                          {Number(qtyEdits[it.id]) !== Number(it.required_quantity) && (
                            <span className="block text-[11px] text-muted-foreground">
                              was {it.required_quantity}
                            </span>
                          )}
                        </>
                      ) : it.original_quantity != null &&
                        it.original_quantity !== it.required_quantity ? (
                        <>
                          {it.required_quantity}
                          <span className="block text-[11px] text-muted-foreground">
                            was {it.original_quantity}
                          </span>
                        </>
                      ) : (
                        it.required_quantity
                      )}
                    </TableCell>
                    <TableCell>{it.unit_label || '—'}</TableCell>
                    {hasNewItemLine && (
                      <TableCell className="max-w-[240px] truncate">
                        {it.domain_item_id ? '—' : it.reason || '—'}
                      </TableCell>
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
