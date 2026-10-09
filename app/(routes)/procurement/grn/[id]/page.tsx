'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useGrn,
  useVerifyGrn,
  useCancelGrn,
  useReplacements,
  useReceiveReplacement,
  useUpdateGrnItem,
  useGrnDuplicateInvoice,
  useConfirmDifferentInvoice,
} from '@/hooks/procurement/use-grns';
import { duplicateHold, POSTED_GRN_STATUSES } from '@/lib/services/procurement/invoice-checks';
import { DuplicateInvoiceCompare } from '@/components/procurement/duplicate-invoice-compare';
import { validateLineForVerify } from '@/lib/services/procurement/three-way-match';
import { GRN_STATUS_CONFIG, GRN_MATCH_CONFIG, type ProcurementGrnReplacement } from '@/types/procurement';
import { formatDateDMY, formatDateTimeDMY } from '@/lib/utils/date-format';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import { StatusBadge } from '@/components/procurement/status-badge';
import { ResponsiveList } from '@/components/procurement/responsive-list';
import { DetailHeader } from '@/components/procurement/detail-header';
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
import { EmptyState } from '@/components/empty-state';
import { AlertBox } from '@/components/ui/alert-box';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2, AlertTriangle, PackagePlus } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';
import { DeliveryRatingRow } from '@/components/procurement/delivery-rating-row';

// Same set the rating RPCs accept.
const RATEABLE_GRN_STATUSES: string[] = ['partially_accepted', 'replacement_requested', 'accepted', 'completed'];

export default function GrnDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canVerify = isSuperAdmin || canAccess('procurement', 'grn_verify');

  const { data: grn, isLoading, isError } = useGrn(id);
  const { data: replacements = [] } = useReplacements(id);
  const verifyGrn = useVerifyGrn();
  const cancelGrn = useCancelGrn();
  // Cancelling asks first, from a link at the bottom (as on the purchase and order pages).
  const [cancelOpen, setCancelOpen] = useState(false);
  const receiveReplacement = useReceiveReplacement(id);
  const updateItem = useUpdateGrnItem(id);
  // I1 held save: a repeated invoice number must be confirmed before verify.
  const { data: dup } = useGrnDuplicateInvoice(grn);
  const confirmDifferent = useConfirmDifferentInvoice();
  const [confirmDupOpen, setConfirmDupOpen] = useState(false);

  // Inline batch/expiry edits (pending GRNs only) — lets the admin satisfy the chemical
  // gate at verify time. Keyed by grn_item id; falls back to the stored value.
  const [edits, setEdits] = useState<Record<string, { batch_number?: string; expiry_date?: string }>>({});
  const effBatch = (it: { id: string; batch_number: string | null }) =>
    edits[it.id]?.batch_number ?? it.batch_number ?? '';
  const effExpiry = (it: { id: string; expiry_date: string | null }) =>
    edits[it.id]?.expiry_date ?? it.expiry_date ?? '';
  const saveField = (grnItemId: string, field: 'batch_number' | 'expiry_date', raw: string, current: string | null) => {
    const value = raw.trim() ? raw.trim() : null;
    if ((current ?? null) === value) return;
    updateItem.mutate({ grnItemId, patch: { [field]: value } });
  };

  // Receive-replacement dialog state.
  const [repTarget, setRepTarget] = useState<ProcurementGrnReplacement | null>(null);
  const [repQty, setRepQty] = useState('');
  const [repBatch, setRepBatch] = useState('');
  const [repExpiry, setRepExpiry] = useState('');
  const [repMfg, setRepMfg] = useState('');
  // Comma-separated — replacement quantities are usually small, so a free-text
  // list is less friction here than the per-unit grid on the main receive form.
  const [repSerials, setRepSerials] = useState('');

  const openReceive = (r: ProcurementGrnReplacement) => {
    setRepTarget(r);
    setRepQty(String(r.rejected_quantity));
    setRepBatch('');
    setRepExpiry('');
    setRepMfg('');
  };

  if (isLoading) {
    return (
      <ContentLayout title="Goods Received">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }
  if (isError) {
    return (
      <ContentLayout title="Goods Received">
        <div className="py-12">
          <AlertBox type="error" message="Failed to load this delivery record. Please try again." />
        </div>
      </ContentLayout>
    );
  }
  if (!grn) {
    return (
      <ContentLayout title="Goods Received">
        <EmptyState title="Delivery record not found" description="This delivery record may have been removed." />
      </ContentLayout>
    );
  }

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e, 'Action failed'));
    }
  };

  const pending = grn.status === 'pending_verification';

  const hasMismatch = grn.items.some((i) => i.mismatch_flag);

  // Chemical lines still missing batch/expiry (using the effective, possibly-edited values)
  // block verification — mirrors the server gate so the button is disabled, not just erroring.
  const chemicalBlocks = grn.items.flatMap((it) =>
    validateLineForVerify({
      item_name: it.item_name,
      is_chemical: it.is_chemical,
      accepted_quantity: Number(it.accepted_quantity),
      batch_number: effBatch(it) || null,
      expiry_date: effExpiry(it) || null,
    })
  );

  const purchase = grn.purchase_request;
  const hold = duplicateHold({
    hasDuplicate: !!dup?.hasDuplicate,
    confirmedBy: grn.duplicate_confirmed_by,
    viewerId: profile?.id,
    receivedBy: grn.received_by,
    viewerCanVerify: canVerify,
  });
  const canVerifyNow = pending && canVerify;
  // Replacement goods are received only against a delivery already checked into stock —
  // never one that is pending (and possibly held under I1). The service and the database
  // refuse it too (review round 2, red team).
  const canReceiveReplacement = canVerify && POSTED_GRN_STATUSES.includes(grn.status);
  const verify = () =>
    run(
      () => verifyGrn.mutateAsync({ id, userId: profile!.id }),
      'Delivery verified — accepted stock added to inventory.'
    );

  return (
    <ContentLayout title={purchase ? displayRequestNumber(purchase.request_number) : grn.grn_number}>
      <div className="w-full space-y-5">
        <DetailHeader
          backLabel={purchase ? 'Back to the purchase' : 'Back to deliveries'}
          onBack={() => router.push(purchase ? `/procurement/requests/${purchase.id}#orders` : '/procurement/grn')}
          title={`Delivery from ${grn.supplier?.name ?? 'vendor'}`}
          badge={<StatusBadge status={grn.status} config={GRN_STATUS_CONFIG} />}
          meta={
            <>
              {grn.grn_number}
              {purchase ? ` · ${displayRequestNumber(purchase.request_number)}` : ''}
              {grn.purchase_order ? ` · Order ${grn.purchase_order.po_number}` : ''}
              {grn.created_at ? ` · ${formatDateDMY(grn.created_at)}` : ''}
              {pending ? ' · not in stock until checked' : ''}
            </>
          }
          actions={
            canVerifyNow && (
              <Button
                className="h-11 px-5 sm:h-9"
                disabled={verifyGrn.isPending || chemicalBlocks.length > 0 || hold.blocksVerify}
                onClick={verify}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Check &amp; add to stock
              </Button>
            )
          }
        />

        {/* Invoice + receipt meta */}
        <section className="grid gap-3 rounded-xl border bg-background px-5 py-4 text-sm shadow sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Invoice #</p>
              <p className="font-medium">{grn.invoice_number || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Invoice date</p>
              <p className="font-medium">
                {formatDateDMY(grn.invoice_date)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Invoice amount</p>
              <p className="font-medium">
                {grn.invoice_amount != null ? `₹${Number(grn.invoice_amount).toLocaleString('en-IN')}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Received by</p>
              <p className="font-medium">{grn.received_by_profile?.full_name || '—'}</p>
            </div>
        </section>

        {/* I1 held save — same invoice number from this supplier as another receipt that
            is already in stock or was recorded earlier. */}
        {pending && hold.held && (
          <section className="space-y-3 rounded-xl border border-destructive/40 bg-background px-5 py-4 shadow">
            <div className="flex items-start gap-1.5 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p className="font-medium">On hold — this invoice number is already recorded</p>
                <p className="text-muted-foreground">
                  {grn.supplier?.name ?? 'This supplier'} has billed invoice “{grn.invoice_number}” on
                  another delivery. Stock cannot be added until a verifier who did not receive these
                  goods compares the two and confirms they are different invoices.
                </p>
              </div>
            </div>
            <DuplicateInvoiceCompare
              earlier={dup?.earlier ?? []}
              hiddenElsewhere={!!dup?.hasDuplicate}
              current={{
                invoice_number: grn.invoice_number,
                invoice_date: grn.invoice_date,
                invoice_amount: grn.invoice_amount,
              }}
            />
            {hold.canConfirm ? (
              <Button
                variant="outline"
                className="h-11 sm:h-9"
                disabled={confirmDifferent.isPending}
                onClick={() => setConfirmDupOpen(true)}
              >
                This is a different invoice
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                {profile?.id === grn.received_by
                  ? 'You received these goods, so a different verifier must confirm this.'
                  : 'Only someone who can verify deliveries can confirm this.'}
              </p>
            )}
          </section>
        )}
        {pending && grn.duplicate_confirmed_by && (
          <p className="text-sm text-muted-foreground">
            Repeated invoice number confirmed as a different invoice
            {grn.duplicate_confirmed_by === profile?.id ? ' by you' : ''}
            {grn.duplicate_confirmed_at ? ` on ${formatDateDMY(grn.duplicate_confirmed_at)}` : ''}.
          </p>
        )}

        {/* Verify warnings */}
        {pending && (hasMismatch || chemicalBlocks.length > 0) && (
          <div className="space-y-2">
            {hasMismatch && (
              <span className="flex items-center gap-1.5 text-sm text-foreground">
                <AlertTriangle className="h-4 w-4" />
                A line has a quantity or price mismatch — review before verifying.
              </span>
            )}
            {chemicalBlocks.length > 0 && (
              <div className="flex items-start gap-1.5 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Verify is blocked until chemical items have a batch number and expiry date.
                  Enter them in the Batch column below.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Three-way match table */}
        <section className="overflow-hidden rounded-xl border bg-background shadow">
          <h2 className="border-b px-5 py-3 text-base font-semibold">
            Matches order and invoice ({grn.items.length} line{grn.items.length === 1 ? '' : 's'})
          </h2>
          <div className="overflow-x-auto">
            <ResponsiveList
              rows={grn.items}
              getRowKey={(it) => it.id}
              columns={[
                {
                  key: 'item',
                  header: 'Item',
                  mobile: 'title',
                  cell: (it) => (
                    <>
                      {it.item_name}
                      {it.is_chemical && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">
                          Chemical
                        </Badge>
                      )}
                      {it.replacement_required && (
                        <span className="block text-xs font-normal text-foreground">Replacement requested</span>
                      )}
                      {Number(it.missing_quantity) > 0 && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          Missing: {Number(it.missing_quantity)}
                        </span>
                      )}
                    </>
                  ),
                },
                {
                  key: 'ordered',
                  header: 'Ordered',
                  className: 'text-right',
                  cell: (it) => Number(it.ordered_quantity),
                },
                {
                  key: 'invoiced',
                  header: 'Invoiced',
                  className: 'text-right',
                  cell: (it) => (it.invoice_quantity != null ? Number(it.invoice_quantity) : '—'),
                },
                {
                  key: 'received',
                  header: 'Received',
                  className: 'text-right',
                  cell: (it) => Number(it.received_quantity),
                },
                {
                  key: 'accepted',
                  header: 'Accepted',
                  className: 'text-right',
                  cell: (it) => Number(it.accepted_quantity),
                },
                {
                  key: 'rejected',
                  header: 'Rejected',
                  className: 'text-right',
                  cell: (it) => Number(it.rejected_quantity),
                },
                {
                  key: 'invoice_price',
                  header: 'Invoice ₹',
                  className: 'text-right text-xs',
                  cell: (it) =>
                    it.invoice_unit_price != null ? `₹${Number(it.invoice_unit_price).toLocaleString('en-IN')}` : '—',
                },
                {
                  key: 'batch',
                  header: 'Batch / Expiry',
                  className: 'text-xs',
                  cell: (it) =>
                    pending ? (
                      <div className="space-y-1 min-w-[150px]">
                        <Input
                          className="h-10 text-xs md:h-9"
                          placeholder="Batch no."
                          value={effBatch(it)}
                          onChange={(e) =>
                            setEdits((p) => ({ ...p, [it.id]: { ...p[it.id], batch_number: e.target.value } }))
                          }
                          onBlur={(e) => saveField(it.id, 'batch_number', e.target.value, it.batch_number)}
                        />
                        <Input
                          type="date"
                          className="h-10 text-xs md:h-9"
                          value={effExpiry(it)}
                          onChange={(e) => {
                            setEdits((p) => ({ ...p, [it.id]: { ...p[it.id], expiry_date: e.target.value } }));
                            saveField(it.id, 'expiry_date', e.target.value, it.expiry_date);
                          }}
                        />
                      </div>
                    ) : (
                      <>
                        {it.batch_number || '—'}
                        {it.expiry_date && (
                          <span className="block text-muted-foreground">
                            exp {formatDateDMY(it.expiry_date)}
                          </span>
                        )}
                      </>
                    ),
                },
                {
                  key: 'match',
                  header: 'Match',
                  mobile: 'badge',
                  cell: (it) => (
                    <>
                      <StatusBadge status={it.match_status} config={GRN_MATCH_CONFIG} />
                      {it.mismatch_remarks && (
                        <span className="block text-[11px] text-muted-foreground max-w-[180px]">
                          {it.mismatch_remarks}
                        </span>
                      )}
                    </>
                  ),
                },
              ]}
            />
          </div>
        </section>

        {/* Replacements — rejected lines awaiting a replacement delivery */}
        {replacements.length > 0 && (
          <section className="overflow-hidden rounded-xl border bg-background shadow">
            <h2 className="border-b px-5 py-3 text-base font-semibold">Replacements</h2>
              <ResponsiveList
                rows={replacements}
                getRowKey={(r) => r.id}
                mobileFooter={(r) =>
                  r.status === 'pending' && canReceiveReplacement ? (
                    <Button variant="outline" className="h-10 sm:h-9" onClick={() => openReceive(r)}>
                      <PackagePlus className="mr-2 h-4 w-4" />
                      Receive
                    </Button>
                  ) : null
                }
                columns={[
                  {
                    key: 'item',
                    header: 'Item',
                    mobile: 'title',
                    className: 'font-medium',
                    cell: (r) => r.grn_item?.item_name || '—',
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    mobile: 'badge',
                    cell: (r) => (
                      <StatusBadge
                        status={r.status === 'received' ? 'received' : 'pending'}
                        config={{
                          received: { label: 'Received', color: 'green' },
                          pending: { label: 'Waiting for replacement', color: 'amber' },
                        }}
                      />
                    ),
                  },
                  {
                    key: 'rejected',
                    header: 'Rejected qty',
                    className: 'text-right',
                    cell: (r) => Number(r.rejected_quantity),
                  },
                  {
                    key: 'reason',
                    header: 'Reason',
                    className: 'text-xs text-muted-foreground max-w-[220px]',
                    cell: (r) => r.reason || '—',
                  },
                  {
                    key: 'action',
                    header: 'Action',
                    mobile: 'hidden',
                    className: 'text-right',
                    cell: (r) =>
                      r.status === 'pending' && canReceiveReplacement && (
                        <Button variant="outline" className="h-10 sm:h-9" onClick={() => openReceive(r)}>
                          <PackagePlus className="mr-2 h-4 w-4" />
                          Receive
                        </Button>
                      ),
                  },
                ]}
              />
          </section>
        )}

        {grn.verified_at && (
          <p className="text-sm text-muted-foreground">
            Verified by {grn.verified_by_profile?.full_name || 'user'} on{' '}
            {formatDateTimeDMY(grn.verified_at)}.
          </p>
        )}

        {/* Store admin's delivery rating — feeds the vendor score */}
        {profile?.id &&
          RATEABLE_GRN_STATUSES.includes(grn.status) &&
          (isSuperAdmin || profile.id === grn.verified_by || profile.id === grn.received_by) && (
            <DeliveryRatingRow grnId={grn.id} userId={profile.id} />
          )}

        {pending && (
          <p className="text-center text-sm text-muted-foreground">
            <button type="button" className="hover:underline" onClick={() => setCancelOpen(true)}>
              Cancel this delivery
            </button>
          </p>
        )}
      </div>

      <AlertDialog open={confirmDupOpen} onOpenChange={setConfirmDupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm this is a different invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Your name and the time are recorded against this delivery. After this, it can be
              checked and added to stock as usual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                run(
                  () => confirmDifferent.mutateAsync({ id, userId: profile!.id }),
                  'Confirmed as a different invoice — the delivery can now be checked.'
                )
              }
            >
              Yes, it is a different invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {grn.grn_number}?</AlertDialogTitle>
            <AlertDialogDescription>Nothing is posted to inventory and this delivery cannot be reopened.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void run(() => cancelGrn.mutateAsync({ id }), 'Delivery cancelled')}
            >
              Cancel delivery
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Receive-replacement dialog */}
      <Dialog open={!!repTarget} onOpenChange={(o) => !o && setRepTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive replacement — {repTarget?.grn_item?.item_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Accepted quantity</Label>
              <Input type="number" value={repQty} onChange={(e) => setRepQty(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Up to {repTarget ? Number(repTarget.rejected_quantity) : 0} awaiting replacement.
              </p>
            </div>
            {repTarget?.grn_item?.is_chemical && (
              <div className="rounded-md bg-secondary/20 p-2 text-xs text-foreground">
                Chemical item — batch number and expiry date are required to post to inventory.
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Batch no.</Label>
                <Input value={repBatch} onChange={(e) => setRepBatch(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expiry date</Label>
                <Input type="date" value={repExpiry} onChange={(e) => setRepExpiry(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mfg date</Label>
                <Input type="date" value={repMfg} onChange={(e) => setRepMfg(e.target.value)} />
              </div>
            </div>
            {grn?.domain === 'resource_mgmt' && (
              <div className="space-y-1">
                <Label className="text-xs">Serial numbers (comma-separated, optional)</Label>
                <Input
                  placeholder="e.g. SN-1001, SN-1002"
                  value={repSerials}
                  onChange={(e) => setRepSerials(e.target.value)}
                />
                <p className="hidden text-[11px] text-muted-foreground sm:block">
                  Only for serialized assets — one per accepted unit above.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setRepTarget(null)}>
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={receiveReplacement.isPending || !(Number(repQty) > 0)}
              onClick={async () => {
                if (!repTarget) return;
                await run(
                  () =>
                    receiveReplacement.mutateAsync({
                      input: {
                        replacement_id: repTarget.id,
                        accepted_quantity: Number(repQty),
                        batch_number: repBatch || null,
                        expiry_date: repExpiry || null,
                        manufacturing_date: repMfg || null,
                        serial_numbers: repSerials.trim()
                          ? repSerials.split(',').map((s) => s.trim()).filter(Boolean)
                          : null,
                      },
                      userId: profile!.id,
                    }),
                  'Replacement received — stock added to inventory.'
                );
                setRepTarget(null);
                setRepSerials('');
              }}
            >
              {receiveReplacement.isPending ? 'Receiving…' : 'Receive & add to stock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
