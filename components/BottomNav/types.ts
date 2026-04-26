import { LucideIcon } from 'lucide-react';

export interface FlatMenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
  parentLabel?: string;
  active?: boolean;
}

export interface BottomNavGroup {
  id: string;
  groupLabel: string;
  icon: LucideIcon;
  /**
   * Flattened menus — module entries + their submenus collapsed into a flat
   * list. Used by the strip-chip submenu sheet (existing behavior) so deep
   * navigation works for groups that fit on the bottom strip.
   */
  menus: FlatMenuItem[];
  /**
   * Top-level peer modules under this group, BEFORE submenu flattening but
   * AFTER permission filtering. Used by the More drawer to:
   *   (1) determine chevron disclosure affordance (length > 1 = chevron)
   *   (2) populate the drill-down list view (each entry = one row)
   *
   * Length === sidebarMenuLink's `matched.menus.length` for this group, so
   * a single-module group with deep submenus (e.g. Organization with 9
   * submenus) yields topLevelPeers.length === 1 (no chevron, direct nav)
   * — letting the in-page ModuleNav handle deeper navigation per PR #486.
   *
   * Being permission-filtered means honest affordance: chevron only shows
   * when 2+ peer modules are actually accessible to the current user.
   */
  topLevelPeers: FlatMenuItem[];
}

export interface BottomNavItemProps {
  id: string;
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  hasSubmenu: boolean;
  badgeCount?: number;
  hideIndicator?: boolean; // Hide the bottom underline indicator
  customColor?: string; // Custom color for icon and label
  onClick: () => void;
  /** Render mode. 'strip' (default) for the bottom-nav strip; 'tile' for the More-drawer 4-col grid */
  variant?: 'strip' | 'tile';
  /** When variant='tile', the Tailwind gradient string for the icon container background */
  tileGradient?: string;
}

export interface BottomNavSubmenuProps {
  items: FlatMenuItem[];
  isOpen: boolean;
  onItemClick: (href: string) => void;
}

export interface BottomNavMoreMenuProps {
  groups: BottomNavGroup[];
  isOpen: boolean;
  onClose: () => void;
  onItemClick: (href: string) => void;
}

// Active page info for minimized state
export interface ActivePageInfo {
  href: string;
  label: string;
  icon: LucideIcon;
  groupLabel: string;
}

// Serializable version for localStorage (without icon component)
export interface SerializableActivePageInfo {
  href: string;
  label: string;
  groupLabel: string;
}

export interface BottomNavState {
  activeNavId: string | null;
  isExpanded: boolean;
  isMoreMenuOpen: boolean;
  isMinimized: boolean;  // New: controls minimized vs full navbar
  activePage: ActivePageInfo | null;  // New: current active page info
  selectedSubItem: {
    href: string;
    label: string;
  } | null;
  setActiveNav: (id: string | null) => void;
  switchToNav: (id: string) => void;
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  toggleMoreMenu: () => void;
  setMoreMenuOpen: (open: boolean) => void;
  setSelectedSubItem: (item: BottomNavState['selectedSubItem']) => void;
  setMinimized: (minimized: boolean) => void;  // New
  setActivePage: (page: ActivePageInfo | null) => void;  // New
  resetState: () => void;
}
