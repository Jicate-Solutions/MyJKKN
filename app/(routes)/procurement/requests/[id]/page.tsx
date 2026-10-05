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
import { useCreateRfqFromPR } from '@/hooks/procurement/use-rfqs';
import { PR_STATUS_CONFIG } from '@/types/procurement';
import { StatusBadge } from '@/components/procurement/status-badge';
import {
  DocumentHeader,
  type DocAction,
  type DocPrimaryAction,
} from '@/components/procurement/document-header';
import { formatDateDMY } from '@/lib/utils/date-format';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import { AlertBox } from '@/components/ui/alert-box';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Send, X, ClipboardList, Check, Ban } from 'lucide-react';
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
  const createRfq = useCreateRfqFromPR();
  const rejectPR = useRejectPurchaseRequest();
  const cancelPR = useCancelPurchaseRequest();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Two sign-offs in the whole flow (docs/procurement/simplified-flow-spec.md):
  // this one — is the need real? — and the Super Admin's approval of the chosen
  // vendors and prices. Quotations can only start once the request is approved.
  const canQuote = isSuperAdmin || canAccess('procurement', 'rfq_manage');
  const canApprove = isSuperAdmin || canAccess('procurement', 'request_approve');
  const isOwner = pr?.requested_by === profile?.id;

  if (isLoading) {
    return (
      <ContentLayout title="Request">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }
  if (isError) {
    return (
      <ContentLayout title="Request">
        <div className="py-12">
          <AlertBox type="error" message="Failed to load this request. Please try again." />
        </div>
      </ContentLayout>
    );
  }
  if (!pr) {
    return (
      <ContentLayout title="Request">
        <p className="text-muted-foreground py-12 text-center">Request not found.</p>
      </ContentLayout>
    );
  }

  // Show the Reason column whenever any line is a new item, regardless of the
  // header's request_type summary (a 'mixed' request still has reasons to show).
  const hasNewItemLine = pr.items.some((it) => !it.domain_item_id);
  // Restock lines carry the stock position captured when the request was raised —
  // it is the approver's justification for the quantity, so show it.
  const hasStockSnapshot = pr.items.some((it) => it.current_stock != null || it.reorder_level != null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e, 'Action failed'));
    }
  };

  const canDecide = pr.status === 'submitted' && canApprove;
  const canCancel = (pr.status === 'draft' || pr.status === 'submitted') && isOwner;

  const startQuotations = async () => {
    try {
      const rfq = await createRfq.mutateAsync({ requestId: id, userId: profile!.id });
      toast.success('Ready for quotations — add vendors and their quotes');
      router.push(`/procurement/rfqs/${rfq.id}/quotations`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not start quotations'));
    }
  };

  let primary: DocPrimaryAction | null = null;
  if (canDecide) {
    primary = {
      key: 'approve',
      label: 'Approve request',
      icon: Check,
      disabled: approvePR.isPending,
      // Approval opens the quotations for this request in the same click — no
      // separate "Start quotations" step and no second number to track. If that
      // part fails, the request is still approved and "Start quotations" appears.
      onClick: async () => {
        try {
          await approvePR.mutateAsync({ id, userId: profile!.id });
        } catch (e) {
          toast.error(errorMessage(e, 'Could not approve'));
          return;
        }
        try {
          await createRfq.mutateAsync({ requestId: id, userId: profile!.id });
          toast.success('Approved — the store can now collect quotations');
        } catch {
          toast.success('Request approved');
        }
      },
    };
  } else if (pr.status === 'draft' && isOwner) {
    primary = {
      key: 'submit',
      label: 'Submit',
      icon: Send,
      onClick: () => run(() => submitPR.mutateAsync(id), 'Request submitted'),
    };
  } else if (pr.status === 'approved' && canQuote) {
    primary = {
      key: 'quote',
      label: createRfq.isPending ? 'Starting…' : 'Start quotations',
      icon: ClipboardList,
      disabled: createRfq.isPending,
      onClick: startQuotations,
    };
  } else if (pr.status === 'converted') {
    // Quotations already exist for this request — take the person there.
    primary = {
      key: 'open-quotes',
      label: createRfq.isPending ? 'Opening…' : 'Open quotations',
      icon: ClipboardList,
      disabled: createRfq.isPending,
      onClick: startQuotations,
    };
  }

  const reject: DocAction | null = canDecide
    ? { key: 'reject', label: 'Reject', icon: X, onClick: () => setRejectOpen(true) }
    : null;

  const actions: DocAction[] = [];
  if (canCancel) {
    actions.push({
      key: 'cancel',
      label: 'Cancel request',
      icon: Ban,
      destructive: true,
      confirm: {
        title: `Cancel ${displayRequestNumber(pr.request_number)}?`,
        description: 'The request stops here and cannot be reopened.',
        confirmLabel: 'Cancel request',
      },
      onClick: () => run(() => cancelPR.mutateAsync(id), 'Request cancelled'),
    });
  }

  return (
    <ContentLayout title={displayRequestNumber(pr.request_number)}>
      <div className="space-y-4">
        <DocumentHeader
          compact
          onBack={() => router.push('/procurement/requests')}
          backLabel="Back to requests"
          title={displayRequestNumber(pr.request_number)}
          status={<StatusBadge status={pr.status} config={PR_STATUS_CONFIG} />}
          next={[
            pr.title,
            `Asked by ${pr.requested_by_profile?.full_name || '—'}`,
            pr.created_at ? formatDateDMY(pr.created_at) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
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
          <CardContent className="p-0 text-sm [&_td]:py-2 [&_th]:h-9 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4 sm:[&_td:first-child]:pl-6 sm:[&_td:last-child]:pr-6 sm:[&_th:first-child]:pl-6 sm:[&_th:last-child]:pr-6 [&_th]:whitespace-nowrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Specification</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  {hasStockSnapshot && (
                    <>
                      <TableHead className="text-right">On hand</TableHead>
                      <TableHead className="text-right">Reorder level</TableHead>
                    </>
                  )}
                  {hasNewItemLine && <TableHead>Why needed</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pr.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">
                      {it.item_name}
                      {!it.domain_item_id && (
                        <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                          New item
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{it.item_spec || '—'}</TableCell>
                    <TableCell className="text-right">
                      {it.original_quantity != null &&
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
                      {it.unit_label ? <span className="text-muted-foreground"> {it.unit_label}</span> : null}
                    </TableCell>
                    {hasStockSnapshot && (
                      <>
                        <TableCell className="text-right tabular-nums">
                          {it.current_stock != null ? Number(it.current_stock) : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {it.reorder_level != null ? Number(it.reorder_level) : '—'}
                        </TableCell>
                      </>
                    )}
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
            <DialogTitle>Reject request</DialogTitle>
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
