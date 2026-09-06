'use client';

import { Suspense, useState } from 'react';
import { Send } from 'lucide-react';
import { useTabParam } from '@/hooks/use-tab-param';
import { ContentLayout } from '@/components/layout/content-layout';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { useImsStore } from '@/hooks/ims';
import { usePermissions } from '@/hooks/use-permissions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { OutgoingRequestsView } from './_components/OutgoingRequestsView';
import { IncomingRequestsView } from './_components/IncomingRequestsView';
import { PushToStoreSlideover } from './_components/PushToStoreSlideover';
import { ImsPageGuard } from '@/components/ims/ims-page-guard';

export default function TransfersPage() {
  return (
    <ImsPageGuard module="ims.transfers" action="view">
      <Suspense fallback={null}>
        <TransfersPageInner />
      </Suspense>
    </ImsPageGuard>
  );
}

const TRANSFERS_TABS = ['outgoing', 'incoming'] as const;

function TransfersPageInner() {
  const { storeId, institutionId, isStoreSelected, isResolving } = useImsStoreContext();
  const { data: currentStore } = useImsStore(storeId ?? '');
  const { canAccess, isSuperAdmin } = usePermissions();
  const [activeTab, setActiveTab] = useTabParam('outgoing', TRANSFERS_TABS);
  const [pushOpen, setPushOpen] = useState(false);

  // "Send to Store" is a warehouse-only action: only the institution's warehouse
  // holds the inbound stock, and ims_create_push_transfer rejects a push from
  // any other store anyway.
  const isWarehouse = currentStore?.is_central_supply_store ?? false;
  const canDispatch = isSuperAdmin || canAccess('ims.transfers', 'dispatch');

  if (isResolving || !isStoreSelected) {
    return (
      <ContentLayout title="Transfers">
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          {isResolving ? 'Resolving store...' : 'Select a store to view transfers.'}
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Transfers">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Supply Transfers</h2>
            <p className="text-muted-foreground text-sm mt-1">
              {isWarehouse
                ? 'Send stock to your operating stores, or fulfil the requests they raise.'
                : 'Request stock from your warehouse, and confirm what arrives.'}
            </p>
          </div>
          {isWarehouse && canDispatch && (
            <Button onClick={() => setPushOpen(true)} className="shrink-0">
              <Send className="h-4 w-4 mr-2" />
              Send to Store
            </Button>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="outgoing">My Requests</TabsTrigger>
            <TabsTrigger value="incoming">Incoming Requests</TabsTrigger>
          </TabsList>

          <TabsContent value="outgoing" className="mt-4">
            <OutgoingRequestsView storeId={storeId!} institutionId={institutionId} />
          </TabsContent>

          <TabsContent value="incoming" className="mt-4">
            <IncomingRequestsView storeId={storeId!} />
          </TabsContent>
        </Tabs>
      </div>

      {isWarehouse && (
        <PushToStoreSlideover
          open={pushOpen}
          onClose={() => setPushOpen(false)}
          warehouseStoreId={storeId!}
          institutionId={institutionId}
        />
      )}
    </ContentLayout>
  );
}
