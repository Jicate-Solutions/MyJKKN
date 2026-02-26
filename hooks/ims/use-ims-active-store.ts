'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ImsActiveStoreState {
  storeId: string | null;
  institutionId: string | null;
  storeName: string | null;
  setActiveStore: (storeId: string, institutionId: string, storeName: string) => void;
  clearActiveStore: () => void;
}

export const useImsActiveStore = create(
  persist<ImsActiveStoreState>(
    (set) => ({
      storeId: null,
      institutionId: null,
      storeName: null,
      setActiveStore: (storeId, institutionId, storeName) =>
        set({ storeId, institutionId, storeName }),
      clearActiveStore: () =>
        set({ storeId: null, institutionId: null, storeName: null }),
    }),
    {
      name: 'ims-active-store',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
