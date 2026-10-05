'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useCreateRfqFromPR } from '@/hooks/procurement/use-rfqs';
import { StatusBadge } from '@/components/procurement/status-badge';
import { PurchaseProgress, useRequestJourney } from '@/components/procurement/request-journey';
import { QuotesSection } from '@/components/procurement/quotes-section';
import { OrdersSection } from '@/components/procurement/orders-section';
import { formatDateDMY } from '@/lib/utils/date-format';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import { STAGE_CONFIG, stageOf } from '@/lib/procurement/purchase-stage';
import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getRequestLineStock } from '@/lib/services/procurement/request-stock';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { Send, ClipboardList, Check, ChevronLeft } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';

/**
 * One purchase, one page — from "what was asked for" to "delivered".
 *
 *   progress line   Asked → Item approval → Quotes → Final approval → Delivered
 *   items           sign-off 1: the approver approves / rejects right here
 *   quotes          vendors' prices compared and chosen; sign-off 2 (Super Admin)
 *   orders          one card per vendor order; delivery recorded in a side sheet
 *
 * Sections appear as the purchase moves on, so nobody hops between tabs, and the
 * request number is the only number people need ("Purchase no.").
 */

export default function PurchasePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();

  const { data: pr, isLoading, isError } = usePurchaseRequest(id);
  const { data: journey } = useRequestJourney({ requestId: id }, pr?.status);
  const submitPR = useSubmitPurchaseRequest();
  const approvePR = useApprovePurchaseRequest();
  const approveWithMods = useApproveWithModifications();
  const createRfq = useCreateRfqFromPR();
  const rejectPR = useRejectPurchaseRequest();
  const cancelPR = useCancelPurchaseRequest();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [qtyReasonOpen, setQtyReasonOpen] = useState(false);
  const [qtyReason, setQtyReason] = useState('');
  const [qtyEdits, setQtyEdits] = useState<Record<string, string>>({});
  const { data: lineStock } = useQuery({
    queryKey: ['procurement-request-stock', id, pr?.items.length ?? 0],
    queryFn: () => getRequestLineStock(pr!.institution_id, pr!.store_id ?? null, pr!.items),
    enabled: !!pr && pr.items.length > 0,
    staleTime: 60_000,
  });

  const rfqId = journey?.rfq?.id ?? null;
  const hasOrders = (journey?.orders.length ?? 0) > 0;

  // Old links (/rfqs/[id]/quotations, notifications) land here with #quotes or #orders.
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [rfqId, hasOrders]);

  // Two sign-offs in the whole flow: this one — is the need real? — and the Super
  // Admin's final approval of the chosen vendors and prices (in the Quotes section).
  const canQuote = isSuperAdmin || canAccess('procurement', 'rfq_manage');
  const canApprove = isSuperAdmin || canAccess('procurement', 'request_approve');
  const isOwner = pr?.requested_by === profile?.id;
  // The DB refuses self-approval too (fn_procurement_guard_approval); say it upfront.
  const selfApproval = isOwner && !isSuperAdmin;

  const refreshJourney = () => queryClient.invalidateQueries({ queryKey: ['procurement-journey'] });

  if (isLoading) {
    return (
      <ContentLayout title="Purchase">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }
  if (isError) {
    return (
      <ContentLayout title="Purchase">
        <div className="py-12">
          <AlertBox type="error" message="Failed to load this purchase. Please try again." />
        </div>
      </ContentLayout>
    );
  }
  if (!pr) {
    return (
      <ContentLayout title="Purchase">
        <p className="text-muted-foreground py-12 text-center">Purchase not found.</p>
      </ContentLayout>
    );
  }

  const purchaseNo = displayRequestNumber(pr.request_number);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      void refreshJourney();
    } catch (e) {
      toast.error(errorMessage(e, 'Action failed'));
    }
  };

  const canDecide = pr.status === 'submitted' && canApprove && !selfApproval;
  const canCancel = (pr.status === 'draft' || pr.status === 'submitted') && isOwner;

  const startQuotes = async () => {
    try {
      await createRfq.mutateAsync({ requestId: id, userId: profile!.id });
      toast.success('Ready for quotes — upload the vendors’ quotation PDFs below');
      void refreshJourney();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not start quotes'));
    }
  };

  const approveItems = async (qtyReason?: string) => {
    try {
      if (changedQty.length) {
        await approveWithMods.mutateAsync({
          id,
          userId: profile!.id,
          itemUpdates: changedQty.map((it) => ({ itemId: it.id, required_quantity: Number(qtyEdits[it.id]) })),
          reason: qtyReason,
        });
      } else {
        await approvePR.mutateAsync({ id, userId: profile!.id });
      }
      setQtyEdits({});
    } catch (e) {
      toast.error(errorMessage(e, 'Could not approve'));
      return;
    }
    // Approval opens the Quotes section on this page in the same click. If that
    // part fails, the request is still approved and "Start quotes" appears.
    try {
      await createRfq.mutateAsync({ requestId: id, userId: profile!.id });
      toast.success('Items approved — the store can now collect quotes');
    } catch {
      toast.success('Items approved');
    }
    void refreshJourney();
  };

  const stage = stageOf({
    status: pr.status,
    quote_statuses: journey?.rfq ? [journey.rfq.status] : [],
    order_statuses: journey?.orders.map((o) => o.status) ?? [],
  });
  const isOrdered = stage === 'ordered' || stage === 'received';

  // ── Quantities the approver may change before approving (original kept as "asked").
  const qtyOf = (itemId: string, fallback: number) => {
    const raw = qtyEdits[itemId];
    return raw === undefined ? fallback : Number(raw);
  };
  const changedQty = pr.items.filter((it) => {
    const raw = qtyEdits[it.id];
    return raw !== undefined && Number(raw) !== Number(it.required_quantity);
  });
  const badQty = pr.items.some((it) => !(qtyOf(it.id, Number(it.required_quantity)) > 0));
  const approving = approvePR.isPending || approveWithMods.isPending;

  // ── The items card. For the approver it IS the decision: "Your turn — Approve these
  // items?", each item with live stock and an editable quantity, the reason, and the
  // Reject / Approve buttons at the bottom of the same card. Everyone else sees the
  // same card read-only, with a one-line status where the buttons would be.
  const yourTurn =
    canDecide ? 'Approve these items?' : pr.status === 'draft' && isOwner ? 'Submit this request?' : null;
  const decisionButtons = (
    <>
      <Button
        variant="outline"
        className="h-10 w-24 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900 dark:text-red-400"
        onClick={() => setRejectOpen(true)}
      >
        Reject
      </Button>
      <Button
        className="h-10 w-28"
        disabled={approving || badQty}
        // A changed quantity needs a reason first — the requester will see it.
        onClick={() => (changedQty.length ? setQtyReasonOpen(true) : void approveItems())}
      >
        <Check className="mr-1.5 h-4 w-4" />
        {approving ? 'Approving…' : 'Approve'}
      </Button>
    </>
  );
  // One item: item · qty · Reject · Approve on a single row. Several items: Approve /
  // Reject act on the whole request, so they sit once, under the list.
  const inlineDecision = canDecide && pr.items.length === 1;
  let footer: React.ReactNode = null;
  if (canDecide && !inlineDecision) {
    footer = (
      <>
        <span className="mr-auto text-xs text-muted-foreground">
          {badQty ? 'Every quantity must be more than 0.' : changedQty.length ? `${changedQty.length} quantity changed` : ''}
        </span>
        {decisionButtons}
      </>
    );
  } else if (pr.status === 'draft' && isOwner) {
    footer = (
      <Button className="min-h-11 px-6" onClick={() => run(() => submitPR.mutateAsync(id), 'Request submitted')}>
        <Send className="mr-2 h-4 w-4" />
        Send for approval
      </Button>
    );
  } else if (pr.status === 'approved' && !rfqId && canQuote) {
    footer = (
      <Button className="min-h-11 px-6" disabled={createRfq.isPending} onClick={startQuotes}>
        <ClipboardList className="mr-2 h-4 w-4" />
        {createRfq.isPending ? 'Starting…' : 'Start quotes'}
      </Button>
    );
  } else if (pr.status === 'submitted') {
    footer = (
      <span className="mr-auto text-sm text-muted-foreground">
        {selfApproval && canApprove
          ? 'You raised this request, so another approver must approve the items.'
          : 'Waiting for an approver to approve or reject the items.'}
      </span>
    );
  }

  const itemsBlock = (
    <section className="rounded-2xl border bg-card shadow-sm">
      <div className="px-5 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{yourTurn ?? 'Items asked for'}</h2>
          {!yourTurn && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {pr.items.length} item{pr.items.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {pr.status === 'rejected' && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
            Rejected{pr.rejection_reason ? `: ${pr.rejection_reason}` : ''}
          </p>
        )}
      </div>
      <ul className="px-5">
        {pr.items.map((it) => {
          const live = lineStock?.[it.id];
          const asked = Number(it.required_quantity);
          const edited = qtyOf(it.id, asked) !== asked;
          const enough = live != null && live.on_hand >= asked;
          const hint =
            live != null
              ? `${live.on_hand} in stock${live.matched_name ? ' (same name in store)' : ''}`
              : it.current_stock != null
                ? `${Number(it.current_stock)} in stock when asked`
                : !it.domain_item_id
                  ? 'New item'
                  : null;
          return (
            <li key={it.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {it.item_name}
                  {it.item_spec && <span className="font-normal text-muted-foreground"> · {it.item_spec}</span>}
                </p>
                {(hint || it.reorder_level != null) && (
                  <p className={`text-xs ${enough ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                    {[hint, it.reorder_level != null ? `reorder at ${Number(it.reorder_level)}` : null].filter(Boolean).join(' · ')}
                    {enough ? ' — enough already?' : ''}
                  </p>
                )}
                {!it.domain_item_id && it.reason && it.reason.trim() !== (pr.title ?? '').trim() && (
                  <p className="text-xs text-muted-foreground">Why: {it.reason}</p>
                )}
              </div>
              {canDecide ? (
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  Qty
                  <Input
                    type="number"
                    min={1}
                    step="any"
                    inputMode="decimal"
                    aria-label={`Quantity for ${it.item_name}`}
                    className={`h-9 w-16 text-center text-sm tabular-nums text-foreground ${edited ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40' : ''}`}
                    value={qtyEdits[it.id] ?? String(asked)}
                    onChange={(e) => setQtyEdits((m) => ({ ...m, [it.id]: e.target.value }))}
                  />
                  {edited && <span>(asked {asked})</span>}
                </label>
              ) : null}
              {inlineDecision && <div className="flex shrink-0 gap-2">{decisionButtons}</div>}
              {!canDecide && (
                <span className="shrink-0 text-sm tabular-nums">
                  × <b>{it.required_quantity}</b>
                  {it.unit_label ? ` ${it.unit_label}` : ''}
                  {it.original_quantity != null && it.original_quantity !== it.required_quantity && (
                    <span className="block text-right text-xs text-muted-foreground">asked {it.original_quantity}</span>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {pr.notes && (
        <p className="mx-5 mb-1 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">“{pr.notes}”</p>
      )}
      {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/30 px-5 py-3">{footer}</div>}
    </section>
  );

  const quotesBlock = rfqId ? (
    <section id="quotes" className="scroll-mt-4">
      <QuotesSection
        rfqId={rfqId}
        onApproved={() => void refreshJourney()}
        itemApproval={
          journey?.request?.approved_by_name
            ? `${journey.request.approved_by_name}${journey.request.approved_at ? ` on ${formatDateDMY(journey.request.approved_at)}` : ''}`
            : null
        }
      />
    </section>
  ) : null;

  return (
    <ContentLayout title={pr.title || purchaseNo}>
      {/* A reading column — wide enough for 3 vendors' quotes, no wider. */}
      <div className={`mx-auto w-full space-y-5 ${(journey?.rfq?.quotation_count ?? 0) >= 3 ? 'max-w-5xl' : 'max-w-2xl'}`}>
        <Button variant="link" className="h-8 px-0" onClick={() => router.push('/procurement/requests')}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Purchases
        </Button>

        {/* ── Title and where it is: plain text, no box ─────────────────── */}
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{pr.title || pr.items.map((it) => it.item_name).join(', ')}</h1>
            <StatusBadge status={stage} config={STAGE_CONFIG} />
          </div>
          <p className="text-sm text-muted-foreground">
            {purchaseNo}
            {` · ${pr.requested_by_profile?.full_name || '—'}`}
            {pr.created_at ? ` · ${formatDateDMY(pr.created_at)}` : ''}
          </p>
          {journey && <PurchaseProgress journey={journey} />}
        </header>

        {isOrdered && rfqId ? (
          <>
            {/* Once ordered: the order receipts; the quotes stay one quiet link away. */}
            <section id="orders" className="scroll-mt-4">
              <OrdersSection rfqId={rfqId} receipts={journey?.receipts ?? []} />
            </section>
            {quotesBlock}
          </>
        ) : (
          <>
            {/* Once quotes start, the comparison lists the items — no second list. */}
            {!rfqId && itemsBlock}
            {quotesBlock}
            {rfqId && hasOrders && (
              <section id="orders" className="scroll-mt-4">
                <OrdersSection rfqId={rfqId} receipts={journey?.receipts ?? []} />
              </section>
            )}
          </>
        )}

        {canCancel && (
          <p className="text-center text-sm text-muted-foreground">
            <button type="button" className="underline-offset-4 hover:underline" onClick={() => setCancelOpen(true)}>
              Cancel this request
            </button>
          </p>
        )}
      </div>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {purchaseNo}?</AlertDialogTitle>
            <AlertDialogDescription>The purchase stops here and cannot be reopened.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void run(() => cancelPR.mutateAsync(id), 'Request cancelled')}
            >
              Cancel request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Changed quantity → say why before approving */}
      <Dialog open={qtyReasonOpen} onOpenChange={setQtyReasonOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Why change the quantity?</DialogTitle>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            {changedQty.map((it) => (
              <li key={it.id}>
                {it.item_name}: <s className="text-muted-foreground">{Number(it.required_quantity)}</s>{' '}
                → <b>{qtyEdits[it.id]}</b>
              </li>
            ))}
          </ul>
          <div className="space-y-2">
            <Label htmlFor="qty-reason">Reason (the requester sees this)</Label>
            <Textarea
              id="qty-reason"
              value={qtyReason}
              onChange={(e) => setQtyReason(e.target.value)}
              placeholder="e.g. 24 already in stock — 10 is enough for this term"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setQtyReasonOpen(false)}>
              Back
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={!qtyReason.trim() || approving}
              onClick={async () => {
                await approveItems(qtyReason.trim());
                setQtyReasonOpen(false);
                setQtyReason('');
              }}
            >
              <Check className="mr-1.5 h-4 w-4" />
              {approving ? 'Approving…' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject the items</DialogTitle>
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
                await run(() => rejectPR.mutateAsync({ id, userId: profile!.id, reason: rejectReason }), 'Request rejected');
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
