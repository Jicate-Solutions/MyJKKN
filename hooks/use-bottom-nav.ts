import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { BottomNavState } from '@/components/BottomNav/types';

export const useBottomNav = create<BottomNavState>()(
  persist(
    (set) => ({
      activeNavId: null,
      isExpanded: false,
      isMoreMenuOpen: false,
      selectedSubItem: null,

      setActiveNav: (id) =>
        set((state) => ({
          activeNavId: id,
          isExpanded: id !== null && id !== state.activeNavId ? true : state.isExpanded
        })),

      toggleExpanded: () =>
        set((state) => ({
          isExpanded: !state.isExpanded
        })),

      setExpanded: (expanded) =>
        set({
          isExpanded: expanded
        }),

      toggleMoreMenu: () =>
        set((state) => ({
          isMoreMenuOpen: !state.isMoreMenuOpen,
          isExpanded: false
        })),

      setMoreMenuOpen: (open) =>
        set({
          isMoreMenuOpen: open,
          isExpanded: false
        }),

      setSelectedSubItem: (item) =>
        set({
          selectedSubItem: item
        }),

      resetState: () =>
        set({
          activeNavId: null,
          isExpanded: false,
          isMoreMenuOpen: false,
          selectedSubItem: null
        })
    }),
    {
      name: 'bottom-nav-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedSubItem: state.selectedSubItem
      })
    }
  )
);
