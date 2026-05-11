import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ExpandedSidebarModuleStore {
  /** Slug of the module whose accordion submenu is open, or null if none. */
  expandedModule: string | null;
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
  setExpandedModule: (slug: string | null) => void;
  toggleModule: (slug: string) => void;
}

export const useExpandedSidebarModule = create<ExpandedSidebarModuleStore>()(
  persist(
    (set) => ({
      expandedModule: null,
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      setExpandedModule: (slug) => set({ expandedModule: slug }),
      toggleModule: (slug) =>
        set((state) => ({
          expandedModule: state.expandedModule === slug ? null : slug,
        })),
    }),
    {
      name: 'myjkkn.sidebar.expanded-module',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ expandedModule: state.expandedModule }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);

/** Returns true once the persisted state has been read from localStorage. */
export const useExpandedSidebarModuleHydration = () =>
  useExpandedSidebarModule((s) => s._hasHydrated);
