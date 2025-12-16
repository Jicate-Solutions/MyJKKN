'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
  BarChart,
  Package,
  Bell,
  Settings,
  Shield,
  TabletSmartphone,
  MessageCircle,
  Key,
  History,
  Sparkles,
  LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBottomNav } from '@/hooks/use-bottom-nav';
import { GetRoleBasedPages } from '@/lib/sidebarMenuLink';
import { AuthService } from '@/lib/auth/auth-service';
import { RoleService } from '@/lib/services/roles/role-service';
import { CustomRole } from '@/types/auth';
import { BottomNavItem } from './bottom-nav-item';
import { BottomNavSubmenu } from './bottom-nav-submenu';
import { BottomNavMoreMenu } from './bottom-nav-more-menu';
import { BottomNavGroup, FlatMenuItem } from './types';

// Icon mapping for menu groups
const GROUP_ICONS: Record<string, LucideIcon> = {
  'Overview': Home,
  'User Management': Users,
  'Applications': TabletSmartphone,
  'Application Management': TabletSmartphone,
  'Organization Management': Building,
  'Learners Management': GraduationCap,
  'Facilitators Management': Users,
  'Academic Management': CalendarClock,
  'Resource Management': Package,
  'Admissions Management': ClipboardCheck,
  'Billing Management': FileText,
  'Administration': Bell,
  'System': Settings
};

// Routes that are parent-only (no actual page, only submenus)
// These will be skipped when flattening - only submenu items will be shown
const PARENT_ONLY_ROUTES = new Set([
  '/billing/categories'  // No page exists - only show sub-category pages
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

    // Apply redirect if needed
    const parentHref = REDIRECT_ROUTES[menu.href] || menu.href;

    if (menu.submenus.length === 0) {
      // No submenus - include the menu item directly
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
      // Has submenus - only include submenu items (skip parent if it's parent-only)
      // Skip parent route if it's a parent-only container
      if (!PARENT_ONLY_ROUTES.has(menu.href) && !seenHrefs.has(parentHref)) {
        // Check if parent href is different from all submenus
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

      // Add all submenu items
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
  const [userRole, setUserRole] = useState<CustomRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const {
    activeNavId,
    isExpanded,
    isMoreMenuOpen,
    setActiveNav,
    setExpanded,
    setMoreMenuOpen
  } = useBottomNav();

  // Fetch user role on mount
  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        setIsLoading(true);
        const profile = await AuthService.getUserProfile();
        if (profile?.role) {
          const roleData = await RoleService.getRoleByKey(profile.role);
          setUserRole(roleData);
        }
      } catch (error) {
        console.error('[BottomNav] Error fetching user role:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserRole();
  }, []);

  // Get filtered pages based on role
  const filteredPages = useMemo(() => {
    return GetRoleBasedPages(pathname, userRole);
  }, [pathname, userRole]);

  // Transform filtered pages into bottom nav groups
  const allNavGroups = useMemo((): BottomNavGroup[] => {
    return filteredPages
      .filter((group) => group.menus.length > 0)
      .map((group) => ({
        id: group.groupLabel?.toLowerCase().replace(/\s+/g, '-') || 'default',
        groupLabel: group.groupLabel || 'Menu',
        icon: GROUP_ICONS[group.groupLabel || ''] || Home,
        menus: flattenMenuItems(group.menus)
      }));
  }, [filteredPages]);

  // Primary nav groups (first 4)
  const primaryNavGroups = useMemo(() => {
    return allNavGroups.slice(0, 4);
  }, [allNavGroups]);

  // Remaining groups for "More" menu
  const moreNavGroups = useMemo(() => {
    return allNavGroups.slice(4);
  }, [allNavGroups]);

  // Current active submenu items
  const activeSubmenus = useMemo(() => {
    if (!activeNavId) return [];
    const group = primaryNavGroups.find((g) => g.id === activeNavId);
    return group?.menus || [];
  }, [activeNavId, primaryNavGroups]);

  // Detect which group contains the current pathname
  useEffect(() => {
    const activeGroup = primaryNavGroups.find((group) =>
      group.menus.some(
        (menu) =>
          pathname === menu.href || pathname.startsWith(menu.href + '/')
      )
    );

    if (activeGroup && activeNavId !== activeGroup.id) {
      setActiveNav(activeGroup.id);
      setExpanded(false);
    }
  }, [pathname, primaryNavGroups, activeNavId, setActiveNav, setExpanded]);

  // Handle nav item click
  const handleNavClick = useCallback(
    (groupId: string) => {
      if (activeNavId === groupId) {
        // Toggle expand if clicking the same item
        setExpanded(!isExpanded);
      } else {
        // Select new item and expand
        setActiveNav(groupId);
        setExpanded(true);
      }
    },
    [activeNavId, isExpanded, setActiveNav, setExpanded]
  );

  // Handle submenu item click
  const handleSubmenuClick = useCallback(
    (href: string) => {
      router.push(href);
      setExpanded(false);
    },
    [router, setExpanded]
  );

  // Handle "More" menu
  const handleMoreClick = useCallback(() => {
    setMoreMenuOpen(true);
    setExpanded(false);
  }, [setMoreMenuOpen, setExpanded]);

  // Handle click on More menu item
  const handleMoreItemClick = useCallback(
    (href: string) => {
      router.push(href);
      setMoreMenuOpen(false);
    },
    [router, setMoreMenuOpen]
  );

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

  // Don't render on desktop or while loading
  if (!isMobile || isLoading) return null;

  // Don't render if no groups available
  if (primaryNavGroups.length === 0) return null;

  return (
    <>
      {/* Backdrop when expanded */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setExpanded(false)}
          />
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <motion.nav
        data-bottom-nav
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 md:hidden',
          'bg-background/95 backdrop-blur-lg border-t border-border',
          'shadow-lg shadow-background/20'
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
              isActive={activeNavId === group.id}
              hasSubmenu={group.menus.length > 1}
              onClick={() => handleNavClick(group.id)}
            />
          ))}

          {/* More button if there are additional groups */}
          {moreNavGroups.length > 0 && (
            <BottomNavItem
              id="more"
              icon={MoreHorizontal}
              label="More"
              isActive={isMoreMenuOpen}
              hasSubmenu={true}
              badgeCount={moreNavGroups.length}
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
