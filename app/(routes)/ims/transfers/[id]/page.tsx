'use client';

import { use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { ImsActivityFeed } from '@/components/ims/activity-feed';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useImsIndent } from '@/hooks/ims/use-ims-indents';
import {
  useImsShipmentsForRequest,
  useCreateImsShipment,
  useDispatchImsShipment,
  useConfirmImsShipmentReceipt,
} from '@/hooks/ims/use-ims-transfers';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { useImsStore } from '@/hooks/ims';
import { usePermissions } from '@/hooks/use-permissions';
import { INDENT_STATUS_CONFIG, INDENT_URGENCY_CONFIG } from '@/types/ims';
import { toast } from 'sonner';

export default function TransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { storeId } = useImsStoreContext();
  const { data: currentStore } = useImsStore(storeId ?? '');
  const isCentralStore = currentStore?.is_central_supply_store ?? false;
  const { userProfile } = usePermissions();

  const { data: transfer, isLoading } = useImsIndent(id);
  const { data: shipments } = useImsShipmentsForRequest(id);

  const createShipment = useCreateImsShipment();
  const dispatch = useDispatchImsShipment();
  const confirmReceipt = useConfirmImsShipmentReceipt();

  if (isLoading) {
    return (
      <ContentLayout title="Transfer">
        <div className="animate-pulse h-64 bg-muted rounded" />
      </ContentLayout>
    );
  }

  if (!transfer) {
    return (
      <ContentLayout title="Transfer">
        <p className="text-muted-foreground">Transfer not found.</p>
      </ContentLayout>
    );
  }

  const statusCfg = INDENT_STATUS_CONFIG[transfer.status];
  const urgencyCfg = INDENT_URGENCY_CONFIG[transfer.urgency];
  const preparingShipment = shipments?.find(s => s.status === 'preparing');
  const dispatchedShipment = shipments?.find(s => s.status === 'dispatched');

  const handleCreateShipment = async () => {
    if (!storeId) return;
    try {
      await createShipment.mutateAsync({
        request_id: id,
        source_store_id: storeId,
        destination_institution_id: transfer.destination_institution_id!,
        destination_store_id: transfer.destination_store_id ?? undefined,
        items: transfer.items?.map(i => ({
          item_id: i.item_id,
          request_item_id: i.id,
          dispatched_qty: i.quantity,
        })) ?? [],
      });
      toast.success('Shipment created — ready to pack.');
    } catch {
      toast.error('Failed to create shipment.');
    }
  };

  const handleDispatch = async () => {
    if (!preparingShipment) return;
    try {
      await dispatch.mutateAsync({
        shipmentId: preparingShipment.id,
        dto: { dispatched_by: userProfile?.id ?? '' },
      });
      toast.success('Shipment marked as dispatched. Stock deducted from central store.');
    } catch {
      toast.error('Failed to mark as dispatched.');
    }
  };

  const handleConfirmReceipt = async () => {
    if (!dispatchedShipment) return;
    try {
      await confirmReceipt.mutateAsync({
        shipmentId: dispatchedShipment.id,
        receivedBy: userProfile?.id ?? '',
        notes: '',
        lines: dispatchedShipment.items?.map(i => ({
          shipment_item_id: i.id,
          received_qty: i.dispatched_qty,
        })) ?? [],
      });
      toast.success('Receipt confirmed. Stock added to your store.');
    } catch {
      toast.error('Failed to confirm receipt.');
    }
  };

  return (
    <ContentLayout title={`Transfer ${transfer.indent_number}`}>
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{transfer.indent_number}</h2>
            <p className="text-muted-foreground text-sm">{transfer.purpose}</p>
          </div>
          <div className="flex gap-2">
            <Badge variant={urgencyCfg.variant}>{urgencyCfg.label}</Badge>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>
        </div>

        {/* Transfer Route */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Transfer Route</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">From: </span>
              {transfer.source_store?.name ?? 'Unknown'}
            </div>
            <div>
              <span className="text-muted-foreground">To: </span>
              {transfer.destination_institution?.institution_name ?? '—'}
              {transfer.destination_store ? ` · ${transfer.destination_store.name}` : ''}
            </div>
          </CardContent>
        </Card>

        {/* Requested Items */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Requested Items</CardTitle></CardHeader>
          <CardContent>
            <div className="divide-y">
              {transfer.items?.map(item => (
                <div key={item.id} className="flex justify-between py-2 text-sm">
                  <span>{item.item?.name ?? item.item_id}</span>
                  <span className="text-muted-foreground">
                    {item.quantity} {item.unit?.abbreviation}
                  </span>
                </div>
              ))}
              {(!transfer.items || transfer.items.length === 0) && (
                <p className="text-sm text-muted-foreground py-2">No items found.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Shipments */}
        {shipments && shipments.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Shipments</CardTitle></CardHeader>
            <CardContent>
              <div className="divide-y">
                {shipments.map(s => (
                  <div key={s.id} className="flex justify-between py-2 text-sm">
                    <span>{s.shipment_no}</span>
                    <Badge variant="outline">{s.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Contextual Action Buttons */}
        <div className="flex gap-3">
          {isCentralStore && transfer.status === 'approved' && !preparingShipment && (
            <Button onClick={handleCreateShipment} disabled={createShipment.isPending}>
              {createShipment.isPending ? 'Creating...' : 'Create Shipment'}
            </Button>
          )}
          {isCentralStore && preparingShipment && (
            <Button onClick={handleDispatch} disabled={dispatch.isPending}>
              {dispatch.isPending ? 'Dispatching...' : 'Mark Dispatched'}
            </Button>
          )}
          {!isCentralStore && dispatchedShipment && (
            <Button onClick={handleConfirmReceipt} disabled={confirmReceipt.isPending}>
              {confirmReceipt.isPending ? 'Confirming...' : 'Confirm Receipt'}
            </Button>
          )}
        </div>

        {/* Phase F: end-to-end audit trail — request lifecycle */}
        <ImsActivityFeed
          entityType="indent"
          entityId={id}
          title="Request History"
        />

        {/* Phase F: shipment-level audit (if a shipment exists) */}
        {shipments && shipments.length > 0 && (
          <ImsActivityFeed
            entityType="shipment"
            entityId={shipments[0].id}
            title="Shipment History"
          />
        )}
      </div>
    </ContentLayout>
  );
}
