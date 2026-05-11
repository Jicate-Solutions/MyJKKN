'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { TransferKpiCards } from './TransferKpiCards';
import { ReviewSlideover } from './ReviewSlideover';
import { useImsTransfers, useImsShipments } from '@/hooks/ims/use-ims-transfers';
import { INDENT_STATUS_CONFIG } from '@/types/ims';
import type { ImsIndentRequest, ImsIndentStatus } from '@/types/ims';

interface CentralDispatchViewProps {
  storeId: string;
  institutionId: string;
}

export function CentralDispatchView({ storeId, institutionId: _institutionId }: CentralDispatchViewProps) {
  const [statusFilter, setStatusFilter] = useState<ImsIndentStatus | undefined>('pending_approval');
  const [reviewing, setReviewing] = useState<ImsIndentRequest | null>(null);

  const { data: incomingData, isLoading: loadingIncoming } = useImsTransfers({
    destination_store_id: storeId,
    status: statusFilter,
  });

  const { data: dispatchData } = useImsShipments({
    source_store_id: storeId,
    status: 'preparing',
  });

  const incoming = incomingData?.data ?? [];
  const readyToDispatch = dispatchData?.data ?? [];

  const needsReview = incoming.filter(t => t.status === 'pending_approval').length;
  const packing = readyToDispatch.filter(s => s.status === 'preparing').length;
  const inTransit = incoming.filter(t => t.status === 'shipped').length;
  const fulfilled = incoming.filter(t => t.status === 'received').length;

  const kpiCards = [
    {
      label: 'Needs Review',
      value: needsReview,
      active: statusFilter === 'pending_approval',
      onClick: () => setStatusFilter('pending_approval'),
    },
    {
      label: 'Packing',
      value: packing,
      active: false,
      onClick: () => {},
    },
    {
      label: 'In Transit',
      value: inTransit,
      active: statusFilter === 'shipped',
      onClick: () => setStatusFilter('shipped'),
    },
    {
      label: 'Fulfilled',
      value: fulfilled,
      active: statusFilter === 'received',
      onClick: () => setStatusFilter('received'),
    },
  ];

  return (
    <div className="space-y-4">
      <TransferKpiCards cards={kpiCards} />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Incoming requests */}
        <div>
          <h3 className="font-semibold mb-3 text-sm">Incoming Requests</h3>
          {loadingIncoming ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
            </div>
          ) : incoming.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center border rounded-lg">
              No incoming requests
            </div>
          ) : (
            <div className="border rounded-lg divide-y">
              {incoming.map((t) => {
                const cfg = INDENT_STATUS_CONFIG[t.status];
                return (
                  <div key={t.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{t.indent_number}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.source_store?.name ?? '—'} · {t.purpose}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      <Button size="sm" variant="outline" onClick={() => setReviewing(t)}>
                        Review →
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dispatch queue */}
        <div>
          <h3 className="font-semibold mb-3 text-sm">Dispatch Queue</h3>
          {readyToDispatch.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center border rounded-lg">
              No shipments pending dispatch
            </div>
          ) : (
            <div className="border rounded-lg divide-y">
              {readyToDispatch.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{s.shipment_no}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.destination_institution?.institution_name ?? '—'}
                    </div>
                  </div>
                  <Link href={`/ims/transfers/${s.request_id}`}>
                    <Button size="sm">Mark Dispatched</Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {reviewing && (
        <ReviewSlideover
          transfer={reviewing}
          centralStoreId={storeId}
          onClose={() => setReviewing(null)}
        />
      )}
    </div>
  );
}
