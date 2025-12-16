import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { BottomNavState, ActivePageInfo } from '@/components/BottomNav/types';

export const useBottomNav = create<BottomNavState>()(
  persist(
    (set) => ({
      activeNavId: null,
      isExpanded: false,
      isMoreMenuOpen: false,
      isMinimized: true,  // Start minimized - shows active page only
      activePage: null,
      selectedSubItem: null,

      setActiveNav: (id) =>
        set({
          activeNavId: id
        }),

      // Switch to a specific nav group and expand submenu
      switchToNav: (id) =>
        set({
          activeNavId: id,
          isExpanded: true,
          isMoreMenuOpen: false
        }),

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

      setMinimized: (minimized) =>
        set({
          isMinimized: minimized,
          isExpanded: false,
          isMoreMenuOpen: false
        }),

      setActivePage: (page) =>
        set({
          activePage: page
        }),

      resetState: () =>
        set({
          activeNavId: null,
          isExpanded: false,
          isMoreMenuOpen: false,
          isMinimized: true,
          activePage: null,
          selectedSubItem: null
        })
    }),
    {
      name: 'bottom-nav-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedSubItem: state.selectedSubItem,
        isMinimized: state.isMinimized
      })
    }
  )
);
