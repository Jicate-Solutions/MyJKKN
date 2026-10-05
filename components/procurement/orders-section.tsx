'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import { usePurchaseOrders } from '@/hooks/procurement/use-purchase-orders';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/procurement/status-badge';
import { RecordDeliverySheet } from '@/components/procurement/grn-form';
import { PO_STATUS_CONFIG, GRN_STATUS_CONFIG } from '@/types/procurement';
import type { RequestJourney } from '@/lib/services/procurement/journey-service';
import { FileText, PackageCheck, ClipboardCheck } from 'lucide-react';

/**
 * Orders and deliveries for one purchase, on the purchase page itself. One card per
 * vendor order (the Super Admin's approval creates one per chosen vendor); the
 * delivery is recorded in a side sheet, so nobody leaves the purchase.
 *
 * The PO number stays visible here, small — the vendor quotes it on their invoice.
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const RECEIVABLE = ['approved', 'sent', 'partially_received'];

export function OrdersSection({
  rfqId,
  receipts,
}: {
  rfqId: string;
  receipts: RequestJourney['receipts'];
}) {
  const queryClient = useQueryClient();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canReceive = isSuperAdmin || canAccess('procurement', 'grn_create');
  const canVerify = isSuperAdmin || canAccess('procurement', 'grn_verify');
  const { data } = usePurchaseOrders({ rfq_id: rfqId, limit: 20 });
  const orders = (data?.data ?? []).filter((o) => o.status !== 'cancelled');
  const [receivingPo, setReceivingPo] = useState<string | null>(null);

  if (!orders.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold">
        Order{orders.length === 1 ? '' : 's'} &amp; delivery
      </h3>
      <div className="grid gap-3 md:grid-cols-2">
        {orders.map((o) => {
          const deliveries = receipts.filter((r) => r.purchase_order_id === o.id);
          return (
            <Card key={o.id}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{o.supplier?.name ?? 'Vendor'}</p>
                    <p className="text-xs text-muted-foreground">Order {o.po_number}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tabular-nums">{rupees(Number(o.total_amount ?? 0))}</p>
                    <StatusBadge status={o.status} config={PO_STATUS_CONFIG} />
                  </div>
                </div>

                {deliveries.length > 0 && (
                  <ul className="space-y-1 border-t pt-2 text-sm">
                    {deliveries.map((d) => {
                      const toCheck = d.status === 'pending_verification' || d.status === 'draft';
                      return (
                        <li key={d.id} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-muted-foreground">Delivery {d.grn_number}</span>
                          {toCheck && canVerify ? (
                            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                              <Link href={`/procurement/grn/${d.id}`}>
                                <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
                                Check &amp; add to stock
                              </Link>
                            </Button>
                          ) : (
                            <StatusBadge status={d.status} config={GRN_STATUS_CONFIG} />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/procurement/purchase-orders/${o.id}`}>
                      <FileText className="mr-1.5 h-4 w-4" />
                      Order PDF
                    </Link>
                  </Button>
                  {canReceive && RECEIVABLE.includes(o.status) && (
                    <Button size="sm" onClick={() => setReceivingPo(o.id)}>
                      <PackageCheck className="mr-1.5 h-4 w-4" />
                      Record delivery
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {receivingPo && (
        <RecordDeliverySheet
          poId={receivingPo}
          open={!!receivingPo}
          onOpenChange={(o) => !o && setReceivingPo(null)}
          onSaved={() => {
            setReceivingPo(null);
            void queryClient.invalidateQueries({ queryKey: ['procurement-journey'] });
            void queryClient.invalidateQueries({ queryKey: ['procurement-purchase-orders'] });
          }}
        />
      )}
    </div>
  );
}
