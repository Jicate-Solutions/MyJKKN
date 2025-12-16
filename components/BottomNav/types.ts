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
  menus: FlatMenuItem[];
}

export interface BottomNavItemProps {
  id: string;
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  hasSubmenu: boolean;
  badgeCount?: number;
  onClick: () => void;
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

export interface BottomNavState {
  activeNavId: string | null;
  isExpanded: boolean;
  isMoreMenuOpen: boolean;
  selectedSubItem: {
    href: string;
    label: string;
  } | null;
  setActiveNav: (id: string | null) => void;
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  toggleMoreMenu: () => void;
  setMoreMenuOpen: (open: boolean) => void;
  setSelectedSubItem: (item: BottomNavState['selectedSubItem']) => void;
  resetState: () => void;
}
