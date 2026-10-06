'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import {
  usePurchaseOrders,
  usePurchaseOrder,
  usePoRevisions,
  useDecidePoRevision,
  useWithdrawPoRevision,
  useMarkPoSent,
} from '@/hooks/procurement/use-purchase-orders';
import { downloadPurchaseOrderPdf } from '@/lib/procurement/purchase-order-pdf';
import { gstPercentOf, missingPoFields, poGstTotal, PO_REQUIRED_FIELDS } from '@/lib/procurement/po-document-model';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RecordDeliverySheet } from '@/components/procurement/grn-form';
import { RenegotiateSheet } from '@/components/procurement/renegotiate-sheet';
import { errorMessage } from '@/lib/utils/supabase-error';
import { toast } from 'sonner';
import type { ProcurementPoRevision } from '@/types/procurement';
import type { RequestJourney } from '@/lib/services/procurement/journey-service';
import { formatDateDMY } from '@/lib/utils/date-format';
import { FileText, PackageCheck, ClipboardCheck, Handshake, Check, X } from 'lucide-react';
import { packOrUnit } from '@/lib/procurement/pack-size';

/**
 * Orders and deliveries for one purchase, on the purchase page itself. One card per
 * vendor order, laid out like the approval receipt: what was ordered, each amount in
 * one right-hand column, the total, then Order PDF / Record delivery. Deliveries are
 * recorded in a side sheet, so nobody leaves the purchase.
 *
 * The PO number stays visible, small — the vendor quotes it on their invoice.
 *
 * Renegotiate: before anything is delivered, the store can bring the vendor's revised
 * quotation (RenegotiateSheet). The new prices wait on this card for the Super Admin;
 * once approved the same order shows "Rev N" and the new amounts. Deliveries wait
 * while new prices are pending.
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const RECEIVABLE = ['approved', 'sent', 'partially_received'];

/** The order's state in the words the store uses. */
const ORDER_STATE: Record<string, { label: string; cls: string }> = {
  approved: { label: 'Not sent to vendor yet', cls: 'bg-secondary/20 text-foreground' },
  sent: { label: 'Sent · not delivered', cls: 'bg-primary/10 text-primary' },
  partially_received: { label: 'Part delivered', cls: 'bg-secondary/20 text-foreground' },
  completed: { label: 'Delivered', cls: 'bg-primary/10 text-primary' },
  closed: { label: 'Closed', cls: 'bg-muted text-muted-foreground' },
};

/** New prices waiting for the Super Admin: old -> new per changed line, Approve / Reject. */
function PendingRevision({ poId, rev, isSuperAdmin }: { poId: string; rev: ProcurementPoRevision; isSuperAdmin: boolean }) {
  const { profile } = useAuth();
  const decide = useDecidePoRevision();
  const withdraw = useWithdrawPoRevision();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const changed = rev.lines.filter((l) => Number(l.new_unit_price) !== Number(l.old_unit_price));
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e, 'Action failed'));
    }
  };
  const saving = Number(rev.old_total) - Number(rev.new_total);

  return (
    <div className="mx-6 mb-4 space-y-2.5 rounded-xl bg-secondary/20 px-4 py-3 ring-1 ring-secondary">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold">New prices waiting for the Super Admin</p>
        <p className="text-sm tabular-nums">
          <span className="text-muted-foreground line-through">{rupees(Number(rev.old_total))}</span>{' '}
          <b>{rupees(Number(rev.new_total))}</b>{' '}
          <span className={saving >= 0 ? 'text-primary' : 'text-destructive'}>
            ({saving >= 0 ? '−' : '+'}
            {rupees(Math.abs(saving))})
          </span>
        </p>
      </div>
      {changed.length > 0 && (
        <ul className="space-y-0.5 text-sm">
          {changed.map((l) => (
            <li key={l.po_item_id} className="flex flex-wrap justify-between gap-2">
              <span className="min-w-0 truncate">{l.item_name}</span>
              <span className="tabular-nums">
                <span className="text-muted-foreground line-through">{rupees(Number(l.old_unit_price))}</span> →{' '}
                <b>{rupees(Number(l.new_unit_price))}</b>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        &ldquo;{rev.reason}&rdquo;{rev.requester?.full_name ? ` — ${rev.requester.full_name}` : ''}
        {rev.vendor_quote_number ? ` · quotation ${rev.vendor_quote_number}` : ''}
        {rev.delivery_time_days != null ? ` · delivery ${rev.delivery_time_days} days` : ''}
        {rev.payment_terms ? ` · ${rev.payment_terms}` : ''}
      </p>
      {rejecting ? (
        <div className="space-y-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why are these prices rejected?" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-9" onClick={() => setRejecting(false)}>
              Back
            </Button>
            <Button
              variant="destructive"
              className="h-9"
              disabled={!note.trim() || decide.isPending}
              onClick={() => void act(() => decide.mutateAsync({ poId, revisionId: rev.id, approve: false, note }), 'New prices rejected')}
            >
              Reject
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          {rev.requested_by === profile?.id && (
            <Button
              variant="ghost"
              className="h-9"
              disabled={withdraw.isPending}
              onClick={() => void act(() => withdraw.mutateAsync({ poId, revisionId: rev.id }), 'Withdrawn')}
            >
              Withdraw
            </Button>
          )}
          {isSuperAdmin && (
            <>
              <Button variant="outline" className="h-9" onClick={() => setRejecting(true)}>
                <X className="mr-1.5 h-4 w-4" />
                Reject
              </Button>
              <Button
                className="h-9"
                disabled={decide.isPending}
                onClick={() =>
                  void act(
                    () => decide.mutateAsync({ poId, revisionId: rev.id, approve: true }),
                    'New prices approved — send the revised order PDF to the vendor'
                  )
                }
              >
                <Check className="mr-1.5 h-4 w-4" />
                Approve new prices
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OrderCard({
  poId,
  deliveries,
  canReceive,
  canVerify,
  canRenegotiate,
  isSuperAdmin,
  onRecord,
}: {
  poId: string;
  deliveries: RequestJourney['receipts'];
  canReceive: boolean;
  canVerify: boolean;
  canRenegotiate: boolean;
  isSuperAdmin: boolean;
  onRecord: () => void;
}) {
  const { data: po } = usePurchaseOrder(poId);
  const { data: revisions = [] } = usePoRevisions(poId);
  const [renegotiating, setRenegotiating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const markSent = useMarkPoSent();
  const router = useRouter();
  if (!po) return <div className="h-40 animate-pulse rounded-2xl border bg-card" />;
  const pending = revisions.find((r) => r.status === 'pending');
  const lastDecided = revisions.find((r) => r.status === 'approved' || r.status === 'rejected');
  // Receipts copy the order's price, so only an undelivered order can be repriced.
  const renegotiable =
    canRenegotiate && (po.status === 'approved' || po.status === 'sent') && deliveries.length === 0 && !pending;
  const state = ORDER_STATE[po.status] ?? { label: po.status, cls: 'bg-muted text-muted-foreground' };
  const AMT = 'grid grid-cols-[minmax(0,1fr)_7.5rem] items-baseline gap-3';
  // GST from the vendor's quotation, added on top of the amounts.
  const gstTotal = Math.round(poGstTotal(po) * 100) / 100;

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 px-6 pb-3 pt-5">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold">Order to {po.supplier?.name ?? 'vendor'}</h3>
          <p className="text-xs text-muted-foreground">
            {po.po_number}
            {po.revision_no ? (
              <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">Rev {po.revision_no}</span>
            ) : null}
            {po.approved_at ? ` · approved ${formatDateDMY(po.approved_at)}` : ''}
            {po.revised_at ? ` · prices revised ${formatDateDMY(po.revised_at)}` : ''}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${state.cls}`}>{state.label}</span>
      </div>

      {/* What was ordered: a table — item · qty · rate · amount — ending in the total.
          Long orders scroll inside a tall box with the header kept in view. */}
      <div className="px-6">
        <div className="max-h-[28rem] overflow-y-auto rounded-xl border">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="w-10 px-3 py-2 font-semibold">#</th>
                <th scope="col" className="px-3 py-2 font-semibold">Item</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Qty</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Rate</th>
                {gstTotal > 0 && <th scope="col" className="px-3 py-2 text-right font-semibold">GST</th>}
                <th scope="col" className="px-3 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((it, i) => {
                const received = Number(it.received_quantity ?? 0);
                const ordered = Number(it.ordered_quantity);
                return (
                  <tr key={it.id} className="border-t tabular-nums odd:bg-background even:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{it.item_name}</span>
                      {received > 0 && (
                        <span className={`ml-2 text-xs ${received >= ordered ? 'text-primary' : 'text-foreground'}`}>
                          {received >= ordered ? 'received' : `${received} of ${ordered} received`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {ordered}
                      {packOrUnit(it) ? <span className="text-muted-foreground"> {packOrUnit(it)}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right">{rupees(Number(it.unit_price))}</td>
                    {gstTotal > 0 && (
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {gstPercentOf(it) !== null ? `${gstPercentOf(it)}%` : '—'}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right font-semibold">{rupees(Number(it.line_total))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {gstTotal > 0 && (
          <div className="space-y-1 pt-3 text-sm tabular-nums">
            <div className={AMT}>
              <span className="text-muted-foreground">Amount</span>
              <span className="text-right">{rupees(Number(po.total_amount ?? 0))}</span>
            </div>
            <div className={AMT}>
              <span className="text-muted-foreground">GST</span>
              <span className="text-right">{rupees(gstTotal)}</span>
            </div>
          </div>
        )}
        <div className={`${AMT} py-3 text-base font-bold`}>
          <span>
            Total <span className="text-sm font-normal text-muted-foreground">· {po.items.length} items</span>
          </span>
          <span className="text-right tabular-nums">{rupees(Number(po.total_amount ?? 0) + gstTotal)}</span>
        </div>
      </div>

      {pending && <PendingRevision poId={po.id} rev={pending} isSuperAdmin={isSuperAdmin} />}
      {!pending && lastDecided?.status === 'rejected' && (
        <p className="mx-6 mb-4 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Last renegotiation was rejected{lastDecided.decision_note ? `: ${lastDecided.decision_note}` : ''} — the order
          keeps its prices.
        </p>
      )}

      {deliveries.length > 0 && (
        <ul className="mx-6 mb-4 space-y-1.5 rounded-xl bg-muted/50 px-3 py-2.5 text-sm">
          {deliveries.map((d) => {
            const toCheck = d.status === 'pending_verification' || d.status === 'draft';
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  Delivery {d.grn_number} ·{' '}
                  <span className={toCheck ? 'font-medium text-foreground' : 'text-primary'}>
                    {toCheck ? 'waiting to be checked' : 'added to stock'}
                  </span>
                </span>
                {toCheck && canVerify && (
                  <Button asChild size="sm" className="h-8">
                    <Link href={`/procurement/grn/${d.id}`}>
                      <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
                      Check &amp; add to stock
                    </Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Right after ordering, the job is getting the order PDF to the vendor — that is
          the main button. Goods take days to arrive, so recording the delivery is a
          quiet secondary action until then. */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/40 px-6 py-3">
        {renegotiable && (
          <Button variant="outline" className="h-10" onClick={() => setRenegotiating(true)}>
            <Handshake className="mr-1.5 h-4 w-4" />
            Renegotiate
          </Button>
        )}
        {po.status === 'approved' && (
          <span className="mr-auto text-xs text-muted-foreground">
            Send the PDF to the vendor first
          </span>
        )}
        {canReceive && RECEIVABLE.includes(po.status) && po.status !== 'approved' && !pending && (
          <Button variant="outline" className="h-10" onClick={onRecord}>
            <PackageCheck className="mr-1.5 h-4 w-4" />
            Goods arrived? Record delivery
          </Button>
        )}
        <Button
          className="h-10 px-5"
          disabled={downloading}
          onClick={async () => {
            // A required blank the quotation didn't give: open the order with it highlighted.
            // The store fills a missing blank first; anyone else just gets the PDF.
            const missing = canRenegotiate ? missingPoFields(po) : [];
            if (missing.length) {
              toast.info(`Fill ${missing.map((k) => PO_REQUIRED_FIELDS[k]).join(', ')} on the order first`);
              router.push(`/procurement/purchase-orders/${po.id}`);
              return;
            }
            setDownloading(true);
            try {
              await downloadPurchaseOrderPdf(po);
              // Downloaded by the store to send to the vendor: the order is now "sent".
              if (canRenegotiate && po.status === 'approved') {
                markSent.mutate(po.id, {
                  onError: (e) => toast.error(errorMessage(e, 'Could not mark the order as sent')),
                });
              }
            } catch (e) {
              toast.error(errorMessage(e, 'Could not make the PDF'));
            } finally {
              setDownloading(false);
            }
          }}
        >
          <FileText className="mr-1.5 h-4 w-4" />
          {downloading ? 'Preparing…' : 'Order PDF'}
        </Button>
        <Button asChild variant="ghost" className="h-10">
          <Link href={`/procurement/purchase-orders/${po.id}`}>Edit order</Link>
        </Button>
      </div>
      {renegotiating && <RenegotiateSheet po={po} open={renegotiating} onOpenChange={setRenegotiating} />}
    </section>
  );
}

export function OrdersSection({ rfqId, receipts }: { rfqId: string; receipts: RequestJourney['receipts'] }) {
  const queryClient = useQueryClient();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canReceive = isSuperAdmin || canAccess('procurement', 'grn_create');
  const canVerify = isSuperAdmin || canAccess('procurement', 'grn_verify');
  // Same people who collect quotes bring the revised one.
  const canRenegotiate =
    isSuperAdmin || canAccess('procurement', 'rfq_manage') || canAccess('procurement', 'quotation_manage');
  const { data } = usePurchaseOrders({ rfq_id: rfqId, limit: 20 });
  const orders = (data?.data ?? []).filter((o) => o.status !== 'cancelled');
  const [receivingPo, setReceivingPo] = useState<string | null>(null);
  // Several vendors: one order at a time, picked from a toggle (was a long stack).
  const [openPo, setOpenPo] = useState<string | null>(null);

  if (!orders.length) return null;
  const shownId = orders.find((o) => o.id === openPo)?.id ?? orders[0].id;
  const grand = orders.reduce((n, o) => n + Number(o.total_amount ?? 0), 0);

  return (
    <div className="space-y-4">
      {orders.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Orders by vendor" className="flex flex-wrap gap-2">
            {orders.map((o) => {
              const on = o.id === shownId;
              const delivered = o.status === 'completed' || o.status === 'closed';
              return (
                <button
                  key={o.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setOpenPo(o.id)}
                  className={`flex min-w-0 max-w-full flex-col items-start rounded-xl border px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    on ? 'border-primary bg-primary/10 shadow-sm' : 'bg-card hover:bg-muted/60'
                  }`}
                >
                  <span className="max-w-[16rem] truncate text-sm font-semibold">{o.supplier?.name ?? 'Vendor'}</span>
                  <span className="text-xs text-muted-foreground">
                    <b className="tabular-nums text-foreground">{rupees(Number(o.total_amount ?? 0))}</b>
                    {o.item_count ? ` · ${o.item_count} items` : ''}
                    {' · '}
                    <span className={delivered ? 'text-primary' : ''}>{delivered ? 'delivered' : 'not delivered'}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <span className="ml-auto text-sm">
            Total <b className="tabular-nums">{rupees(grand)}</b>
          </span>
        </div>
      )}
      {orders
        .filter((o) => o.id === shownId)
        .map((o) => (
        <OrderCard
          key={o.id}
          poId={o.id}
          deliveries={receipts.filter((r) => r.purchase_order_id === o.id)}
          canReceive={canReceive}
          canVerify={canVerify}
          canRenegotiate={canRenegotiate}
          isSuperAdmin={isSuperAdmin}
          onRecord={() => setReceivingPo(o.id)}
        />
      ))}

      {receivingPo && (
        <RecordDeliverySheet
          poId={receivingPo}
          open={!!receivingPo}
          onOpenChange={(o) => !o && setReceivingPo(null)}
          onSaved={() => {
            setReceivingPo(null);
            void queryClient.invalidateQueries({ queryKey: ['procurement-journey'] });
            void queryClient.invalidateQueries({ queryKey: ['procurement-purchase-orders'] });
            void queryClient.invalidateQueries({ queryKey: ['procurement-purchase-order'] });
          }}
        />
      )}
    </div>
  );
}
