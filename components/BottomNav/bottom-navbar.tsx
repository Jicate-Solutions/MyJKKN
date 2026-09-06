'use client';

import { useEffect, useMemo, useCallback, useLayoutEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
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
import { GetRoleBasedPages, RolePermissionData, filterToInductionOnlyMenu } from '@/lib/sidebarMenuLink';
import { adaptMenuLabels, adaptLabel } from '@/lib/utils/school-label-adapter';
import { useAuth } from '@/providers/auth-provider';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionType } from '@/hooks/use-institution-type';
import { useUserExpoTeamStatus } from '@/hooks/admission/use-expo-capture';
import { useIsHosteler } from '@/hooks/campus-living/use-is-hosteler';
import { useIsInductionOnly } from '@/hooks/use-my-lifecycle-status';
import { usePageFavorites } from '@/hooks/use-page-favorites';
import { ICON_MAP } from '@/lib/navigation/page-registry';
import { MODULES, getModulesBySection } from '@/lib/navigation/modules';
import { BottomNavItem } from './bottom-nav-item';
import { BottomNavSubmenu } from './bottom-nav-submenu';
import { BottomNavMoreMenu, GROUP_TILE_GRADIENTS } from './bottom-nav-more-menu';
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

  const { user } = useAuth();
  const { institutionType, isLoading: institutionTypeLoading } = useInstitutionType();

  if (process.env.NODE_ENV === 'development') {
    console.log('[BottomNav] institutionType:', institutionType, 'isLoading:', institutionTypeLoading);
  }

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

  // Students: the My Hostel entry is shown only for actual hostel residents
  // (learners_profiles accommodation = hostel). Mirrors menu.tsx so desktop
  // sidebar and mobile bottom-nav stay in lock-step.
  const isStudentRole = userProfile?.role === 'student';
  const { data: isHosteler } = useIsHosteler(isStudentRole);
  // Pre-onboarding (induction-only) learners: scope the bottom nav to My Induction
  // + My Profile (matches the desktop sidebar + proxy whitelist).
  const isInductionOnly = useIsInductionOnly(isStudentRole);

  // Build RolePermissionData from usePermissions (multi-role merged)
  const roleData = useMemo((): RolePermissionData | null => {
    if (!userProfile) return null;

    if (isSuperAdmin) {
      return {
        role_key: 'super_admin',
        permissions: {}
      };
    }

    // Enrich permissions with dynamic expo access for assigned team members.
    // 2026-05-11: counselor roles whose Marketing access was explicitly
    // revoked must NOT get expo visibility re-granted via team-membership
    // enrichment. Without this carve-out, the mobile Marketing module entry
    // re-appears for admission_counselor / learner_counselor / staff_counselor
    // users who happen to be on any expo team. Mirrors menu.tsx logic so
    // desktop sidebar and mobile bottom-nav stay in lock-step.
    const EXPO_ENRICHMENT_SKIP_ROLES = new Set([
      'admission_counselor',
      'learner_counselor',
      'staff_counselor',
    ]);
    const skipExpoEnrichment = EXPO_ENRICHMENT_SKIP_ROLES.has(userProfile.role || '');
    const enrichedPermissions: Record<string, boolean> = { ...permissions };
    if (isExpoTeamMember && !skipExpoEnrichment) {
      enrichedPermissions['admission.marketing.expos.view'] = true;
    }

    // Students: gate the My Hostel entry on live hostel residency. The role-wide
    // campus_living.my_hostel.view grant covers every student; overwrite it with
    // user_is_hosteler() so dayscholars don't get a dead-end menu.
    if (isStudentRole) {
      enrichedPermissions['campus_living.my_hostel.view'] =
        permissions['campus_living.my_hostel.view'] === true && isHosteler === true;
    }

    return {
      role_key: userProfile.role || '',
      permissions: enrichedPermissions
    };
  }, [userProfile, permissions, isSuperAdmin, isExpoTeamMember, isStudentRole, isHosteler]);

  // Get filtered pages based on merged permissions and institution type
  const filteredPages = useMemo(() => {
    const rawPages = GetRoleBasedPages(pathname, roleData);
    const pages = isInductionOnly ? filterToInductionOnlyMenu(rawPages) : rawPages;

    // Apply label adaptation for schools (Degrees → Streams, etc.)
    // NOTE: Do NOT filter by entity type like filterMenuByEntityType does.
    // Schools need access to organization menus, just with adapted labels.
    // The sidebar approach (adapt labels, don't hide menus) is correct.
    const entityType = (institutionType ?? 'institution') as any;
    return adaptMenuLabels(pages, entityType);
  }, [pathname, roleData, institutionType, isInductionOnly]);

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

    // Build a BottomNavGroup from a section label + its permission-filtered
    // menu group. Icon prefers the MODULES section icon (via getSectionIcon);
    // for leftover sections whose groupLabel isn't in MODULES it falls back to
    // the first menu item's own icon so the More drawer never shows a bare Home.
    const inModules = (label: string) => MODULES.some((m) => m.section === label);
    const toNavGroup = (
      label: string,
      matched: (typeof filteredPages)[number]
    ): BottomNavGroup => ({
      id: label.toLowerCase().replace(/\s+/g, '-') || 'default',
      groupLabel: label,
      icon: inModules(label) ? getSectionIcon(label) : (matched.menus[0]?.icon ?? getSectionIcon(label)),
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

    // 1) Walk MODULES section order; emit a BottomNavGroup for each section
    // that has at least one accessible menu in `filteredPages`.
    const groups: BottomNavGroup[] = [];
    const matchedLabels = new Set<string>();
    for (const [section] of getModulesBySection()) {
      const matched = filteredByLabel.get(section);
      if (!matched || matched.menus.length === 0) continue;
      groups.push(toNavGroup(section, matched));
      matchedLabels.add(section);
    }

    // 2) Forward-compat safety net — MIRRORS menu.tsx:205-213 so the mobile
    // bottom-nav stays in true lock-step with the desktop sidebar. Any labeled
    // group that exists in the permission-filtered set but is NOT matched by a
    // MODULES section still surfaces (trailing) instead of being silently
    // dropped. Without this, a sidebar groupLabel that drifts from its MODULES
    // section name — or a section with no MODULES entry at all — vanishes from
    // the bottom bar while still rendering on desktop (the asymmetry that hid
    // Employee Management, IMS, Meetings/Scheduling, PDE, Calendar, CDC and
    // Feedback from mobile). Drop is impossible — surfacing the gap visibly.
    for (const g of filteredPages) {
      if (g.groupLabel && !matchedLabels.has(g.groupLabel) && g.menus.length > 0) {
        groups.push(toNavGroup(g.groupLabel, g));
        matchedLabels.add(g.groupLabel);
      }
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
        label: adaptLabel(fav.title, institutionType ?? 'institution'),
        icon: ICON_MAP[fav.iconName] || Star,
      })),
      // Favorites are flat by definition — every favorite is a top-level
      // peer (no nested submenus). topLevelPeers === menus here.
      topLevelPeers: favorites.map((fav) => ({
        href: fav.path,
        label: adaptLabel(fav.title, institutionType ?? 'institution'),
        icon: ICON_MAP[fav.iconName] || Star,
      })),
    };
  }, [favorites, institutionType]);

  // Primary nav groups: 3 regular + favorites (if any), or 4 regular
  const primaryNavGroups = useMemo(() => {
    if (favoritesNavGroup) {
      // Show 3 regular groups + favorites group
      return [...allNavGroups.slice(0, 3), favoritesNavGroup];
    }
    return allNavGroups.slice(0, 4);
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

  // Sync activeNavId with pathname when it changes (but not while user is browsing).
  // Use the primitive id string as the dep — the group object reference changes on every
  // render (filteredPages depends on pathname), which would cause an infinite setState loop
  // if the full object were in the deps array.
  const currentActiveGroupId = currentActiveGroup?.id ?? null;
  useEffect(() => {
    if (!isExpanded && currentActiveGroupId && currentActiveGroupId !== activeNavId) {
      setActiveNav(currentActiveGroupId);
    }
  }, [currentActiveGroupId, activeNavId, setActiveNav, isExpanded]);

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
      {/* AttentionBar pill removed 2026-06-19 — the contextual pill that
          floated above the bottom-nav strip is now hidden on ALL mobile
          pages per product request. The render is intentionally omitted;
          the underlying resolver/API and the admin UI (/system/attention-bar)
          remain intact, so this can be restored by re-adding `<AttentionBar />`
          here plus its import. */}

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
          'max-w-full overflow-x-hidden',
          // Hide on desktop when sidebar is visible (lg+)
          'lg:hidden',
          'bg-background border-t border-border',
          'shadow-[0_-4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]'
        )}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          // A slow drag that started on the nav used to begin an iOS text
          // selection and pop the Copy / Proofread menu instead of doing
          // nothing. Nav chrome is not readable content, so it is not
          // selectable. Both properties are inherited, so the submenu that
          // renders inside this element is covered too. Set here rather than
          // via a Tailwind class because this project has no autoprefixer and
          // older iOS Safari only honours the -webkit- form.
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none'
        }}
      >
        {/* Expanded submenu */}
        <BottomNavSubmenu
          items={activeSubmenus}
          isOpen={isExpanded}
          onItemClick={handleSubmenuClick}
        />

        {/* Nav items — Tier-D glass strip per UX directive 2026-04-27.
            Every item gets a 3-color holographic gradient via tileGradient.
            Modules use GROUP_TILE_GRADIENTS by groupLabel; Search + More
            get utility-color defaults. */}
        <div className="flex w-full min-w-0 items-center justify-around">
          {primaryNavGroups.map((group) => (
            <BottomNavItem
              key={group.id}
              id={group.id}
              icon={group.icon}
              label={group.groupLabel}
              isActive={effectiveActiveNavId === group.id}
              hasSubmenu={group.menus.length > 1}
              tileGradient={GROUP_TILE_GRADIENTS[group.groupLabel] ?? GROUP_TILE_GRADIENTS['Overview']}
              onClick={() => handleNavClick(group.id)}
            />
          ))}

          {/* Search button — utility cyan-blue gradient */}
          <BottomNavItem
            id="search"
            icon={Search}
            label="Search"
            isActive={false}
            hasSubmenu={false}
            hideIndicator={true}
            tileGradient="bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600"
            onClick={openSearch}
          />

          {/* More button — always visible. Drawer is the menu hub: full module
              list + favorites + global search. Rose-pink-rose holographic
              gradient (carries forward the previous rose-700 customColor). */}
          <BottomNavItem
            id="more"
            icon={MoreHorizontal}
            label="More"
            isActive={isMoreMenuOpen}
            hasSubmenu={true}
            hideIndicator={true} // Remove underline
            tileGradient="bg-gradient-to-br from-rose-400 via-pink-500 to-rose-700"
            onClick={handleMoreClick}
          />
        </div>
      </motion.nav>

      {/* More menu sheet — feeds the FULL accessible module list, not the
          slice past primary. Drawer's own usePageFavorites hook handles
          favorites; passing allGroupsWithFavorites would double-render. */}
      <BottomNavMoreMenu
        groups={allNavGroups}
        isOpen={isMoreMenuOpen}
        onClose={() => setMoreMenuOpen(false)}
        onItemClick={handleMoreItemClick}
      />
    </>
  );
}
