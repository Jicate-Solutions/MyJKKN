'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ImsActiveStoreState {
  storeId: string | null;
  institutionId: string | null;
  storeName: string | null;
  /**
   * The profiles.assigned_store_id value this browser has already reconciled
   * against. Lets useImsStoreContext force a NEW admin allocation exactly once
   * (the persisted selection otherwise outranks it) without fighting a store
   * admin who then deliberately switches stores.
   */
  reconciledAssignedStoreId: string | null;
  setActiveStore: (
    storeId: string,
    institutionId: string,
    storeName: string,
    reconciledAssignedStoreId?: string | null
  ) => void;
  clearActiveStore: () => void;
}

export const useImsActiveStore = create(
  persist<ImsActiveStoreState>(
    (set) => ({
      storeId: null,
      institutionId: null,
      storeName: null,
      reconciledAssignedStoreId: null,
      setActiveStore: (storeId, institutionId, storeName, reconciledAssignedStoreId) =>
        set((state) => ({
          storeId,
          institutionId,
          storeName,
          // Undefined means "caller has no opinion" — keep the existing mark
          // rather than resetting it and re-triggering reconciliation.
          reconciledAssignedStoreId:
            reconciledAssignedStoreId === undefined
              ? state.reconciledAssignedStoreId
              : reconciledAssignedStoreId,
        })),
      clearActiveStore: () =>
        set({
          storeId: null,
          institutionId: null,
          storeName: null,
          reconciledAssignedStoreId: null,
        }),
    }),
    {
      name: 'ims-active-store',
      storage: createJSONStorage(() => localStorage),
      version: 2,
      // v1 blobs predate reconciledAssignedStoreId. Seeding it to null means
      // the first assignment they encounter is treated as new and applied once.
      migrate: (persistedState) => ({
        ...(persistedState as ImsActiveStoreState),
        reconciledAssignedStoreId: null,
      }),
    }
  )
);
