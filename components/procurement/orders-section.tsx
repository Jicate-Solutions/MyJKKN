'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import { usePurchaseOrders, usePurchaseOrder } from '@/hooks/procurement/use-purchase-orders';
import { Button } from '@/components/ui/button';
import { RecordDeliverySheet } from '@/components/procurement/grn-form';
import type { RequestJourney } from '@/lib/services/procurement/journey-service';
import { formatDateDMY } from '@/lib/utils/date-format';
import { FileText, PackageCheck, ClipboardCheck } from 'lucide-react';

/**
 * Orders and deliveries for one purchase, on the purchase page itself. One card per
 * vendor order, laid out like the approval receipt: what was ordered, each amount in
 * one right-hand column, the total, then Order PDF / Record delivery. Deliveries are
 * recorded in a side sheet, so nobody leaves the purchase.
 *
 * The PO number stays visible, small — the vendor quotes it on their invoice.
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const RECEIVABLE = ['approved', 'sent', 'partially_received'];

/** The order's state in the words the store uses. */
const ORDER_STATE: Record<string, { label: string; cls: string }> = {
  approved: { label: 'Not delivered yet', cls: 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300' },
  sent: { label: 'Sent · not delivered', cls: 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300' },
  partially_received: { label: 'Part delivered', cls: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
  completed: { label: 'Delivered', cls: 'bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300' },
  closed: { label: 'Closed', cls: 'bg-muted text-muted-foreground' },
};

function OrderCard({
  poId,
  deliveries,
  canReceive,
  canVerify,
  onRecord,
}: {
  poId: string;
  deliveries: RequestJourney['receipts'];
  canReceive: boolean;
  canVerify: boolean;
  onRecord: () => void;
}) {
  const { data: po } = usePurchaseOrder(poId);
  if (!po) return <div className="h-40 animate-pulse rounded-2xl border bg-card" />;
  const state = ORDER_STATE[po.status] ?? { label: po.status, cls: 'bg-muted text-muted-foreground' };
  const AMT = 'grid grid-cols-[minmax(0,1fr)_7.5rem] items-baseline gap-3';

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 px-6 pb-3 pt-5">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold">Order to {po.supplier?.name ?? 'vendor'}</h3>
          <p className="text-xs text-muted-foreground">
            {po.po_number}
            {po.approved_at ? ` · approved ${formatDateDMY(po.approved_at)}` : ''}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${state.cls}`}>{state.label}</span>
      </div>

      {/* what was ordered — one right-hand column of amounts, ending in the total */}
      <div className="px-6">
        <div className="max-h-72 space-y-1.5 overflow-y-auto border-t py-3">
          {po.items.map((it) => {
            const received = Number(it.received_quantity ?? 0);
            const ordered = Number(it.ordered_quantity);
            return (
              <div key={it.id} className={`${AMT} text-sm`}>
                <span className="min-w-0 truncate">
                  {it.item_name}{' '}
                  <span className="text-muted-foreground">
                    · {ordered} × {rupees(Number(it.unit_price))}
                  </span>
                  {received > 0 && (
                    <span className={received >= ordered ? 'text-green-700' : 'text-amber-700'}>
                      {' '}
                      · {received >= ordered ? 'received' : `${received} of ${ordered} received`}
                    </span>
                  )}
                </span>
                <span className="text-right tabular-nums">{rupees(Number(it.line_total))}</span>
              </div>
            );
          })}
        </div>
        <div className={`${AMT} border-t-2 border-foreground py-3 text-base font-bold`}>
          <span>Total</span>
          <span className="text-right tabular-nums">{rupees(Number(po.total_amount ?? 0))}</span>
        </div>
      </div>

      {deliveries.length > 0 && (
        <ul className="mx-6 mb-4 space-y-1.5 rounded-xl bg-muted/50 px-3 py-2.5 text-sm">
          {deliveries.map((d) => {
            const toCheck = d.status === 'pending_verification' || d.status === 'draft';
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  Delivery {d.grn_number} ·{' '}
                  <span className={toCheck ? 'font-medium text-amber-800 dark:text-amber-300' : 'text-green-700 dark:text-green-400'}>
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

      <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/40 px-6 py-3">
        <Button asChild variant="outline" className="h-10">
          <Link href={`/procurement/purchase-orders/${po.id}`}>
            <FileText className="mr-1.5 h-4 w-4" />
            Order PDF
          </Link>
        </Button>
        {canReceive && RECEIVABLE.includes(po.status) && (
          <Button className="h-10 px-5" onClick={onRecord}>
            <PackageCheck className="mr-1.5 h-4 w-4" />
            Record delivery
          </Button>
        )}
      </div>
    </section>
  );
}

export function OrdersSection({ rfqId, receipts }: { rfqId: string; receipts: RequestJourney['receipts'] }) {
  const queryClient = useQueryClient();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canReceive = isSuperAdmin || canAccess('procurement', 'grn_create');
  const canVerify = isSuperAdmin || canAccess('procurement', 'grn_verify');
  const { data } = usePurchaseOrders({ rfq_id: rfqId, limit: 20 });
  const orders = (data?.data ?? []).filter((o) => o.status !== 'cancelled');
  const [receivingPo, setReceivingPo] = useState<string | null>(null);

  if (!orders.length) return null;

  return (
    <div className="space-y-4">
      {orders.map((o) => (
        <OrderCard
          key={o.id}
          poId={o.id}
          deliveries={receipts.filter((r) => r.purchase_order_id === o.id)}
          canReceive={canReceive}
          canVerify={canVerify}
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
