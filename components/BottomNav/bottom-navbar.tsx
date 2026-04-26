'use client';

import { useEffect, useMemo, useCallback, useLayoutEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  MoreHorizontal,
  GraduationCap,
  CalendarClock,
  FileText,
  Users,
  Building,
  ClipboardCheck,
  Package,
  Bell,
  Settings,
  TabletSmartphone,
  Bug,
  Rocket,
  Star,
  LucideIcon,
  Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBottomNav, useBottomNavHydration } from '@/hooks/use-bottom-nav';
import { useCommandPalette } from '@/components/CommandPalette/CommandPaletteProvider';
import { GetRoleBasedPages, RolePermissionData } from '@/lib/sidebarMenuLink';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserExpoTeamStatus } from '@/hooks/admission/use-expo-capture';
import { usePageFavorites } from '@/hooks/use-page-favorites';
import { ICON_MAP } from '@/lib/navigation/page-registry';
import { MODULES, getModulesBySection } from '@/lib/navigation/modules';
import { BottomNavItem } from './bottom-nav-item';
import { BottomNavSubmenu } from './bottom-nav-submenu';
import { BottomNavMoreMenu } from './bottom-nav-more-menu';
import { BottomNavMinimized } from './bottom-nav-minimized';
import { BottomNavGroup, FlatMenuItem, ActivePageInfo } from './types';

/**
 * Resolve a section's icon by deriving from MODULES — single source of truth.
 *
 * Pre-2026-04-25 this was a hardcoded `GROUP_ICONS` map that:
 *   1. Only covered 14 of 28 sections (rest fell to Home → all looked identical)
 *   2. Used OLD section names as keys, so PR #490's renames silently lost icons
 *
 * The cross-paradigmatic fix: MODULES already has `icon: 'IconName'` per
 * module, and ICON_MAP (lib/navigation/page-registry.ts) already resolves
 * those name strings to LucideIcon components. Pick the FIRST module of a
 * section as the section's representative icon. New sections / renames /
 * reorders propagate automatically — same pattern as PR #482 and #488 made
 * MODULES the single source of truth for ordering and identity.
 *
 * If a section has no module (impossible but defensive) or its first
 * module's icon string isn't in ICON_MAP, fall back to Home.
 */
function getSectionIcon(section: string): LucideIcon {
  const firstModule = MODULES.find((m) => m.section === section);
  if (!firstModule) return Home;
  return ICON_MAP[firstModule.icon] ?? Home;
}

// Routes that are parent-only (no actual page, only submenus)
const PARENT_ONLY_ROUTES = new Set([
  '/billing/categories'
]);

// Routes that should redirect to dashboard
const REDIRECT_ROUTES: Record<string, string> = {
  '/': '/dashboard'
};

// Flatten menu items including submenus, excluding parent-only routes
function flattenMenuItems(
  menus: Array<{
    href: string;
    label: string;
    icon: LucideIcon;
    active: boolean;
    submenus: Array<{ href: string; label: string; active: boolean }>;
  }>
): FlatMenuItem[] {
  const seenHrefs = new Set<string>();

  return menus.flatMap((menu) => {
    const items: FlatMenuItem[] = [];
    const parentHref = REDIRECT_ROUTES[menu.href] || menu.href;

    if (menu.submenus.length === 0) {
      if (!seenHrefs.has(parentHref)) {
        seenHrefs.add(parentHref);
        items.push({
          href: parentHref,
          label: menu.label,
          icon: menu.icon,
          active: menu.active
        });
      }
    } else {
      if (!PARENT_ONLY_ROUTES.has(menu.href) && !seenHrefs.has(parentHref)) {
        const parentIsDifferent = !menu.submenus.some(sub => sub.href === parentHref);
        if (parentIsDifferent) {
          seenHrefs.add(parentHref);
          items.push({
            href: parentHref,
            label: menu.label,
            icon: menu.icon,
            active: menu.active
          });
        }
      }

      menu.submenus.forEach((sub) => {
        const subHref = REDIRECT_ROUTES[sub.href] || sub.href;
        if (!seenHrefs.has(subHref)) {
          seenHrefs.add(subHref);
          items.push({
            href: subHref,
            label: sub.label,
            icon: menu.icon,
            active: sub.active
          });
        }
      });
    }

    return items;
  });
}

export function BottomNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const hasInitialized = useRef(false);
  const hasHydrated = useBottomNavHydration();

  const {
    permissions,
    isSuperAdmin,
    isLoading,
    userProfile
  } = usePermissions();

  const { open: openSearch } = useCommandPalette();
  const { favorites } = usePageFavorites();

  const {
    activeNavId,
    isExpanded,
    isMoreMenuOpen,
    isMinimized,
    activePage,
    setActiveNav,
    switchToNav,
    setExpanded,
    setMoreMenuOpen,
    setMinimized,
    setActivePage
  } = useBottomNav();

  // Check if user is an expo team member (for dynamic sidebar visibility)
  const { data: isExpoTeamMember } = useUserExpoTeamStatus();

  // Build RolePermissionData from usePermissions (multi-role merged)
  const roleData = useMemo((): RolePermissionData | null => {
    if (!userProfile) return null;

    if (isSuperAdmin) {
      return {
        role_key: 'super_admin',
        permissions: {}
      };
    }

    // Enrich permissions with dynamic expo access for assigned team members
    const enrichedPermissions = isExpoTeamMember
      ? { ...permissions, 'admission.marketing.expos.view': true }
      : permissions;

    return {
      role_key: userProfile.role || '',
      permissions: enrichedPermissions
    };
  }, [userProfile, permissions, isSuperAdmin, isExpoTeamMember]);

  // Get filtered pages based on merged permissions
  const filteredPages = useMemo(() => {
    return GetRoleBasedPages(pathname, roleData);
  }, [pathname, roleData]);

  // Transform filtered pages into bottom nav groups.
  //
  // **Wave 2b PR-S4 Option A**: top-level group ORDER and IDENTITY are now
  // sourced from `MODULES` (via `getModulesBySection`) — the canonical
  // module registry introduced by PR #409. Submenu data per group still
  // comes from the existing sidebar manifest (`filteredPages`) since
  // `MODULES` deliberately does not carry submenu data.
  //
  // Behavioral preservation:
  //   - `MODULES` section order matches today's `GetPages` group order
  //     for every section that has nav-config or sidebar menus, so the
  //     visible top-level chip sequence is unchanged.
  //   - Sections with zero accessible menus (after permission filtering)
  //     are dropped, exactly as before.
  //   - Group icon, label, and id derivation are unchanged.
  const allNavGroups = useMemo((): BottomNavGroup[] => {
    // Index permission-filtered groups by groupLabel for O(1) lookup
    const filteredByLabel = new Map<string, (typeof filteredPages)[number]>();
    for (const g of filteredPages) {
      if (g.groupLabel) filteredByLabel.set(g.groupLabel, g);
    }

    // Walk MODULES section order; emit a BottomNavGroup for each section
    // that has at least one accessible menu in `filteredPages`.
    const groups: BottomNavGroup[] = [];
    for (const [section] of getModulesBySection()) {
      const matched = filteredByLabel.get(section);
      if (!matched || matched.menus.length === 0) continue;
      groups.push({
        id: section.toLowerCase().replace(/\s+/g, '-') || 'default',
        groupLabel: section,
        icon: getSectionIcon(section),
        menus: flattenMenuItems(matched.menus),
        // Top-level peers BEFORE submenu flatten — used by More drawer for
        // chevron disclosure + drill-down list. Already permission-filtered
        // because `matched` came from `filteredPages`. See BottomNavGroup
        // type docstring.
        topLevelPeers: matched.menus.map((m) => ({
          href: REDIRECT_ROUTES[m.href] || m.href,
          label: m.label,
          icon: m.icon,
          active: m.active,
        })),
      });
    }
    return groups;
  }, [filteredPages]);

  // Build a favorites nav group from user's favorited pages
  const favoritesNavGroup = useMemo((): BottomNavGroup | null => {
    if (favorites.length === 0) return null;
    return {
      id: 'favorites',
      groupLabel: 'Favorites',
      icon: Star,
      menus: favorites.map((fav) => ({
        href: fav.path,
        label: fav.title,
        icon: ICON_MAP[fav.iconName] || Star,
      })),
      // Favorites are flat by definition — every favorite is a top-level
      // peer (no nested submenus). topLevelPeers === menus here.
      topLevelPeers: favorites.map((fav) => ({
        href: fav.path,
        label: fav.title,
        icon: ICON_MAP[fav.iconName] || Star,
      })),
    };
  }, [favorites]);

  // Primary nav groups: 3 regular + favorites (if any), or 4 regular
  const primaryNavGroups = useMemo(() => {
    if (favoritesNavGroup) {
      // Show 3 regular groups + favorites group
      return [...allNavGroups.slice(0, 3), favoritesNavGroup];
    }
    return allNavGroups.slice(0, 4);
  }, [allNavGroups, favoritesNavGroup]);

  // Remaining groups for "More" menu — start from index 3 if favorites took a slot
  const moreNavGroups = useMemo(() => {
    if (favoritesNavGroup) {
      return allNavGroups.slice(3);
    }
    return allNavGroups.slice(4);
  }, [allNavGroups, favoritesNavGroup]);

  // All groups including favorites for lookup purposes
  // Regular groups come first so pathname matching prefers module context over favorites
  const allGroupsWithFavorites = useMemo(() => {
    if (favoritesNavGroup) {
      return [...allNavGroups, favoritesNavGroup];
    }
    return allNavGroups;
  }, [allNavGroups, favoritesNavGroup]);

  // Find the group that contains the current pathname
  const currentActiveGroup = useMemo(() => {
    // Search all groups (including favorites) for a matching menu item
    for (const group of allGroupsWithFavorites) {
      for (const menu of group.menus) {
        // Exact match or starts with (for nested routes)
        if (pathname === menu.href || pathname.startsWith(menu.href + '/')) {
          return group;
        }
      }
    }
    // Default to first group if no match found
    return allNavGroups[0] || null;
  }, [pathname, allGroupsWithFavorites, allNavGroups]);

  // Find the active page info based on current pathname
  const currentActivePage = useMemo((): ActivePageInfo | null => {
    if (!currentActiveGroup) return null;

    for (const menu of currentActiveGroup.menus) {
      if (pathname === menu.href || pathname.startsWith(menu.href + '/')) {
        return {
          href: menu.href,
          label: menu.label,
          icon: menu.icon,
          groupLabel: currentActiveGroup.groupLabel
        };
      }
    }
    return null;
  }, [pathname, currentActiveGroup]);

  // Determine the effective active nav ID
  const effectiveActiveNavId = useMemo(() => {
    // When submenu is expanded, respect user's manual selection
    // This allows clicking different groups to show their submenus
    if (isExpanded && activeNavId) {
      return activeNavId;
    }
    // When collapsed (or no selection), use pathname-based detection
    if (currentActiveGroup) {
      return currentActiveGroup.id;
    }
    // Fallback to stored activeNavId
    return activeNavId;
  }, [currentActiveGroup, activeNavId, isExpanded]);

  // Current active submenu items - based on effective active nav
  const activeSubmenus = useMemo(() => {
    if (effectiveActiveNavId) {
      const selectedGroup = allGroupsWithFavorites.find((g) => g.id === effectiveActiveNavId);
      if (selectedGroup) {
        return selectedGroup.menus;
      }
    }
    // Fallback to current pathname's group
    return currentActiveGroup?.menus || [];
  }, [effectiveActiveNavId, allGroupsWithFavorites, currentActiveGroup]);

  // Update active page IMMEDIATELY when currentActivePage changes (before paint)
  useLayoutEffect(() => {
    if (currentActivePage) {
      setActivePage(currentActivePage);

      // On first initialization after loading completes, ensure we're NOT minimized
      if (!hasInitialized.current && !isLoading) {
        hasInitialized.current = true;
        // Always keep full navbar visible - never minimize
        setMinimized(false);
      }
    }
  }, [currentActivePage, setActivePage, isLoading, setMinimized]);

  // Sync activeNavId with pathname when it changes (but not while user is browsing)
  useEffect(() => {
    // Only sync when not expanded - don't override user's manual selection while browsing
    if (!isExpanded && currentActiveGroup && currentActiveGroup.id !== activeNavId) {
      setActiveNav(currentActiveGroup.id);
    }
  }, [currentActiveGroup, activeNavId, setActiveNav, isExpanded]);

  // Handle nav item click - simplified toggle logic with atomic state update
  const handleNavClick = useCallback(
    (groupId: string) => {
      // If submenu is open and showing THIS group's items, close it
      if (isExpanded && activeNavId === groupId) {
        setExpanded(false);
        setMoreMenuOpen(false);
      } else {
        // Otherwise, switch to this group's submenu (atomic update)
        switchToNav(groupId);
      }
    },
    [activeNavId, isExpanded, switchToNav, setExpanded, setMoreMenuOpen]
  );

  // Handle submenu item click - navigate and close submenu
  const handleSubmenuClick = useCallback(
    (href: string) => {
      router.push(href);
      setExpanded(false);
      // Don't minimize - keep full navbar visible
    },
    [router, setExpanded]
  );

  // Handle "More" menu open - close submenu first
  const handleMoreClick = useCallback(() => {
    setExpanded(false); // Close any open submenu first
    setMoreMenuOpen(!isMoreMenuOpen); // Toggle More menu
  }, [setMoreMenuOpen, setExpanded, isMoreMenuOpen]);

  // Handle click on More menu item - navigate and close menu
  const handleMoreItemClick = useCallback(
    (href: string) => {
      router.push(href);
      setMoreMenuOpen(false);
      // Don't minimize - keep full navbar visible
    },
    [router, setMoreMenuOpen]
  );

  // Handle expand from minimized state (no longer used, but kept for compatibility)
  const handleExpandFromMinimized = useCallback(() => {
    // Set the active nav to the current group based on pathname
    if (currentActiveGroup) {
      setActiveNav(currentActiveGroup.id);
    }
    setMinimized(false);
    setExpanded(false);
  }, [setMinimized, setExpanded, setActiveNav, currentActiveGroup]);

  // Close submenu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-bottom-nav]')) {
        setExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isExpanded, setExpanded]);

  // Wait for Zustand store to hydrate before rendering
  // This prevents flash of incorrect state
  if (!hasHydrated) {
    return null;
  }

  // While loading role data, return null
  // Full navbar will show after loading completes
  if (isLoading) {
    return null;
  }

  // Don't render if no groups available
  if (primaryNavGroups.length === 0) return null;

  // Always show full navbar - never minimized
  return (
    <>
      {/* Backdrop when submenu expanded - only for submenu, not More menu */}
      <AnimatePresence>
        {isExpanded && !isMoreMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[75] lg:hidden"
            onClick={() => {
              setExpanded(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Full bottom navigation - always visible on mobile */}
      <motion.nav
        data-bottom-nav
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{
          type: 'spring',
          stiffness: 500,
          damping: 35,
          mass: 0.8
        }}
        className={cn(
          'fixed bottom-0 left-0 right-0 z-[80]',
          // Hide on desktop when sidebar is visible (lg+)
          'lg:hidden',
          'bg-background border-t border-border',
          'shadow-[0_-4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]'
        )}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)'
        }}
      >
        {/* Expanded submenu */}
        <BottomNavSubmenu
          items={activeSubmenus}
          isOpen={isExpanded}
          onItemClick={handleSubmenuClick}
        />

        {/* Nav items */}
        <div className="flex items-center justify-around">
          {primaryNavGroups.map((group) => (
            <BottomNavItem
              key={group.id}
              id={group.id}
              icon={group.icon}
              label={group.groupLabel}
              isActive={effectiveActiveNavId === group.id}
              hasSubmenu={group.menus.length > 1}
              customColor={group.id === 'favorites' ? 'text-yellow-600 dark:text-yellow-500' : undefined}
              onClick={() => handleNavClick(group.id)}
            />
          ))}

          {/* Search button */}
          <BottomNavItem
            id="search"
            icon={Search}
            label="Search"
            isActive={false}
            hasSubmenu={false}
            hideIndicator={true}
            onClick={openSearch}
          />

          {/* More button if there are additional groups */}
          {moreNavGroups.length > 0 && (
            <BottomNavItem
              id="more"
              icon={MoreHorizontal}
              label="More"
              isActive={true} // Always show as active/highlighted
              hasSubmenu={true}
              hideIndicator={true} // Remove underline
              customColor="text-rose-700" // Dark rose color
              onClick={handleMoreClick}
            />
          )}
        </div>
      </motion.nav>

      {/* More menu sheet */}
      <BottomNavMoreMenu
        groups={moreNavGroups}
        isOpen={isMoreMenuOpen}
        onClose={() => setMoreMenuOpen(false)}
        onItemClick={handleMoreItemClick}
      />
    </>
  );
}
