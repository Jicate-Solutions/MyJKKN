'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { useImsStore, useImsStores } from '@/hooks/ims';
import { TransferModeBadge } from './_components/TransferModeBadge';
import { CollegeRequestView } from './_components/CollegeRequestView';
import { CentralDispatchView } from './_components/CentralDispatchView';

export default function TransfersPage() {
  const { storeId, institutionId, isStoreSelected, isResolving } = useImsStoreContext();

  // Get current store metadata to determine mode
  const { data: currentStore } = useImsStore(storeId ?? '');
  const isCentralStore = currentStore?.is_central_supply_store ?? false;

  // Resolve the central store (college view needs its ID and institution)
  const { data: centralStoreData } = useImsStores({
    is_central_supply_store: true,
    is_active: true,
    limit: 1,
  });
  const centralStore = centralStoreData?.data[0];

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
            {isCentralStore
              ? 'Review and dispatch supply requests from department stores.'
              : 'Request supplies from the central store and track your shipments.'}
          </p>
        </div>

        <TransferModeBadge
          isCentralStore={isCentralStore}
          centralStoreName={centralStore?.name}
        />

        {isCentralStore ? (
          <CentralDispatchView storeId={storeId!} institutionId={institutionId} />
        ) : (
          <CollegeRequestView
            storeId={storeId!}
            institutionId={institutionId}
            centralStoreId={centralStore?.id ?? ''}
            centralInstitutionId={centralStore?.institution_id ?? ''}
          />
        )}
      </div>
    </ContentLayout>
  );
}
