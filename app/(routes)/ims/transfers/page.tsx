'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OutgoingRequestsView } from './_components/OutgoingRequestsView';
import { IncomingRequestsView } from './_components/IncomingRequestsView';
import { ImsPageGuard } from '@/components/ims/ims-page-guard';

export default function TransfersPage() {
  return (
    <ImsPageGuard module="ims.transfers" action="view">
      <TransfersPageInner />
    </ImsPageGuard>
  );
}

function TransfersPageInner() {
  const { storeId, institutionId, isStoreSelected, isResolving } = useImsStoreContext();

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
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Supply Transfers</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Request supplies from any institution, or fulfill incoming requests from others.
          </p>
        </div>

        <Tabs defaultValue="outgoing">
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
    </ContentLayout>
  );
}
