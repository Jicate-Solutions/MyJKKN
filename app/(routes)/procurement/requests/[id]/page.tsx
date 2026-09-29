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
import {
  DocumentHeader,
  type DocAction,
  type DocPrimaryAction,
} from '@/components/procurement/document-header';
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
import { Send, Check, X, Pencil, Ban } from 'lucide-react';
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

  const startQtyEdit = () => {
    setQtyEdits(
      Object.fromEntries(pr.items.map((it) => [it.id, String(Number(it.required_quantity))]))
    );
    setEditingQty(true);
  };
  const saveAndApprove = () =>
    run(async () => {
      const itemUpdates = pr.items
        .filter((it) => Number(qtyEdits[it.id]) !== Number(it.required_quantity))
        .map((it) => ({ itemId: it.id, required_quantity: Number(qtyEdits[it.id]) }));
      await approveWithMods.mutateAsync({ id, userId: profile!.id, itemUpdates });
      setEditingQty(false);
    }, 'Request approved with updated quantities');

  const canDecide = !editingQty && pr.status === 'submitted' && canApprove;
  const canCancel = !editingQty && (pr.status === 'draft' || pr.status === 'submitted') && isOwner;

  let primary: DocPrimaryAction | null = null;
  if (editingQty) {
    primary = {
      key: 'save-approve',
      label: 'Save & Approve',
      icon: Check,
      disabled: pr.items.some((it) => !(Number(qtyEdits[it.id]) > 0)),
      onClick: saveAndApprove,
    };
  } else if (canDecide) {
    primary = {
      key: 'approve',
      label: 'Approve',
      icon: Check,
      onClick: () => run(() => approvePR.mutateAsync({ id, userId: profile!.id }), 'Request approved'),
      menu: [
        {
          key: 'modify',
          label: 'Approve with changes…',
          hint: 'Edit quantities, then approve',
          icon: Pencil,
          onClick: startQtyEdit,
        },
      ],
    };
  } else if (pr.status === 'draft' && isOwner) {
    primary = {
      key: 'submit',
      label: 'Submit for approval',
      icon: Send,
      onClick: () => run(() => submitPR.mutateAsync(id), 'Submitted for approval'),
    };
  }

  const reject: DocAction | null = canDecide
    ? { key: 'reject', label: 'Reject', icon: X, onClick: () => setRejectOpen(true) }
    : null;

  const actions: DocAction[] = [];
  if (editingQty) {
    actions.push({ key: 'discard', label: 'Discard changes', onClick: () => setEditingQty(false) });
  }
  if (canCancel) {
    actions.push({
      key: 'cancel',
      label: 'Cancel request',
      icon: Ban,
      destructive: true,
      confirm: {
        title: `Cancel ${pr.request_number}?`,
        description: 'The request stops here and cannot be reopened.',
        confirmLabel: 'Cancel request',
      },
      onClick: () => run(() => cancelPR.mutateAsync(id), 'Request cancelled'),
    });
  }

  return (
    <ContentLayout title={pr.request_number}>
      <div className="space-y-4 sm:space-y-6">
        <DocumentHeader
          onBack={() => router.push('/procurement/requests')}
          backLabel="Back to requests"
          title={pr.request_number}
          status={<StatusBadge status={pr.status} config={PR_STATUS_CONFIG} />}
          next={
            <>
              {statusHint && <span className="font-medium text-foreground">{statusHint} </span>}
              <span className="capitalize">{pr.request_type.replace('_', ' ')}</span>
              {' · requested by '}
              {pr.requested_by_profile?.full_name || '—'}
              {pr.created_at ? ` · raised ${formatDateDMY(pr.created_at)}` : ''}
            </>
          }
          primary={primary}
          reject={reject}
          actions={actions}
        />

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
          <CardHeader className="p-4 pb-2 sm:px-6 sm:pt-6">
            <CardTitle className="text-base">Items ({pr.items.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4 sm:[&_td:first-child]:pl-6 sm:[&_td:last-child]:pr-6 sm:[&_th:first-child]:pl-6 sm:[&_th:last-child]:pr-6 [&_th]:whitespace-nowrap">
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
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
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
