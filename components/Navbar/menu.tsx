'use client';

import Link from 'next/link';
import { Ellipsis, LogOut, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { usePWA } from '@/components/pwa/pwa-provider';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider
} from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'motion/react';
import { GetRoleBasedPages, RolePermissionData } from '@/lib/sidebarMenuLink';
import { getModulesBySection } from '@/lib/navigation/modules';
import { getPageRegistry } from '@/lib/navigation/page-registry';
import { filterByPermissions } from '@/lib/navigation/permission-filter';
import { AuthService } from '@/lib/auth/auth-service';
import { useEffect, useMemo } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useExpandedSidebarModule,
  useExpandedSidebarModuleHydration,
} from '@/hooks/use-expanded-sidebar-module';
import { useUserExpoTeamStatus } from '@/hooks/admission/use-expo-capture';
import { useCommitteeMembership } from '@/hooks/events/marathon/use-committee-membership';
import { useCommandPalette } from '@/components/CommandPalette/CommandPaletteProvider';
import { FavoritesSidebarSection } from '@/components/Favorites/FavoritesSidebarSection';
import { FavoriteStar } from '@/components/Favorites/FavoriteStar';
import { Search } from 'lucide-react';
import { getShortcutForPath } from '@/lib/navigation/keyboard-shortcuts';
import { logSidebarHealthDev } from '@/lib/sidebar-validator';
import { useSidebarCollapsedSections } from '@/hooks/use-sidebar-collapsed-sections';

interface MenuProps {
  isOpen: boolean | undefined;
}

export function Menu({ isOpen }: MenuProps) {
  const pathname = usePathname();
  const {
    permissions,
    isSuperAdmin,
    isLoading: permissionsLoading,
    userProfile
  } = usePermissions();
  const { isInstalled, canInstall, installApp } = usePWA();
  const { open: openCommandPalette } = useCommandPalette();
  // Wave 2b PR-S2: persist per-section collapsed state to localStorage
  // under `myjkkn.sidebar.collapsed-sections` (spec D5 + R4).
  const { isCollapsed: isSectionCollapsed, toggle: toggleSection, hydrated: collapseHydrated } =
    useSidebarCollapsedSections();

  // Single-expand accordion state for sidebar modules (Phase 2).
  const expandedModule = useExpandedSidebarModule((s) => s.expandedModule);
  const toggleModule = useExpandedSidebarModule((s) => s.toggleModule);
  const setExpandedModule = useExpandedSidebarModule((s) => s.setExpandedModule);
  const hydrated = useExpandedSidebarModuleHydration();

  // Auto-expand the module matching the current URL on mount / route change,
  // but only if no module is currently expanded (respect user's manual close).
  useEffect(() => {
    if (!hydrated) return;
    const slug = pathname.split('/').filter(Boolean)[0] || null;
    if (!slug) return;
    // Read current state imperatively to avoid putting `expandedModule` in deps
    // (we only want to auto-set when nothing is expanded — staleness is by design).
    const current = useExpandedSidebarModule.getState().expandedModule;
    if (current === null) {
      setExpandedModule(slug);
    }
  }, [pathname, hydrated, setExpandedModule]);

  // Check if user is an expo team member (for dynamic sidebar visibility)
  const { data: isExpoTeamMember } = useUserExpoTeamStatus();

  // Check if student is a marathon committee member (for ops page visibility)
  const marathonEventId = pathname.match(/\/events\/marathon\/([^/]+)/)?.[1] ?? '';
  const { isMember: isMarathonCommitteeMember } = useCommitteeMembership(marathonEventId);

  // Build RolePermissionData from usePermissions (multi-role merged)
  const roleData = useMemo((): RolePermissionData | null => {
    if (!userProfile) return null;

    // Super admin: GetRoleBasedPages checks role_key === 'super_admin'
    if (isSuperAdmin) {
      return {
        role_key: 'super_admin',
        permissions: {}
      };
    }

    // Enrich permissions with dynamic access for assigned team members.
    // Faculty/students assigned to expo events need to see the Expos menu
    // even without a global `admission.marketing.expos.view` permission.
    let enrichedPermissions = { ...permissions };

    if (isExpoTeamMember) {
      enrichedPermissions['admission.marketing.expos.view'] = true;
    }

    // Student committee members need ops page visibility in sidebar
    if (isMarathonCommitteeMember) {
      enrichedPermissions['events.marathon.ops.committee_access'] = true;
    }

    return {
      role_key: userProfile.role || '',
      permissions: enrichedPermissions
    };
  }, [userProfile, permissions, isSuperAdmin, isExpoTeamMember, isMarathonCommitteeMember]);

  // Debug: Log permission state for troubleshooting
  if (process.env.NODE_ENV === 'development' && roleData && !permissionsLoading) {
    const permCount = Object.keys(roleData.permissions).length;
    const trueCount = Object.values(roleData.permissions).filter(v => v === true).length;
    console.log(`[Menu] Role: ${roleData.role_key} | Permissions: ${trueCount}/${permCount} true`);
  }

  // Use the role-based menu with merged permissions.
  //
  // Wave 2b PR-S5: top-level section ORDER and IDENTITY are sourced from the
  // `MODULES` constant (via `getModulesBySection`) — the same canonical registry
  // the mobile bottom-nav uses post-#482. This keeps desktop sidebar and mobile
  // bottom-nav in lock-step: any change to MODULES (add/rename/reorder a section)
  // automatically reflects in BOTH surfaces. No more divergent section lists.
  //
  // Submenu data per section continues to come from the existing sidebar manifest
  // since `MODULES` deliberately does not carry submenu data — same trade-off as
  // bottom-navbar.tsx. Sections with zero accessible menus (after permission
  // filtering) are dropped, exactly as before.
  const pagesRaw = GetRoleBasedPages(pathname, roleData);
  const pages = useMemo(() => {
    // Index permission-filtered groups by groupLabel for O(1) lookup
    const byLabel = new Map<string, (typeof pagesRaw)[number]>();
    for (const g of pagesRaw) {
      if (g.groupLabel) byLabel.set(g.groupLabel, g);
    }

    // Walk MODULES section order; emit only sections with at least one
    // accessible menu in the permission-filtered set.
    const ordered: typeof pagesRaw = [];
    const matchedLabels = new Set<string>();
    for (const [section] of getModulesBySection()) {
      const matched = byLabel.get(section);
      if (!matched || matched.menus.length === 0) continue;
      ordered.push(matched);
      matchedLabels.add(section);
    }

    // Preserve any labeled sections that exist in the permission-filtered
    // set but are NOT yet in MODULES (forward-compat: a new section can ship
    // in sidebarMenuLink before being added to MODULES, and shouldn't vanish).
    // These trail at the end. Drop is impossible — surfacing the gap visibly.
    for (const g of pagesRaw) {
      if (g.groupLabel && !matchedLabels.has(g.groupLabel)) {
        ordered.push(g);
      } else if (!g.groupLabel) {
        // Anonymous (header-less) groups — pass through at end to preserve
        // existing rendering for any oddball items without a section.
        ordered.push(g);
      }
    }

    return ordered;
  }, [pagesRaw]);

  // DEV-only: warn if any group exceeds the flat-item thresholds set by the
  // validator (prevents regression back to cluttered flat lists on new modules).
  // No-op in production.
  if (process.env.NODE_ENV !== 'production' && pages.length > 0) {
    logSidebarHealthDev(pages);
  }

  const handleLogout = async () => {
    try {
      await AuthService.signOut();
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  return (
    <div className='overflow-y-auto h-full custom-scrollbar'>
      {/* Search trigger button */}
      <div className='px-2 pt-4 pb-1'>
        <button
          onClick={openCommandPalette}
          className={cn(
            'w-full flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm text-muted-foreground',
            'hover:bg-accent hover:text-accent-foreground transition-colors',
            'dark:border-gray-700/50 dark:hover:bg-gray-800',
            isOpen === false && 'justify-center px-2'
          )}
        >
          <Search className='h-4 w-4 shrink-0' />
          {isOpen !== false && (
            <>
              <span className='flex-1 text-left truncate'>Search...</span>
              <kbd className='hidden lg:inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground dark:border-gray-600'>
                Ctrl+K
              </kbd>
            </>
          )}
        </button>
      </div>
      {/* Favorites section */}
      <FavoritesSidebarSection isOpen={isOpen} />
      <nav className='mt-2 h-full w-full'>
        {permissionsLoading ? (
          <div className='flex justify-center items-center py-4'>
            <div className='animate-pulse h-4 w-24 bg-muted rounded mb-2'></div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className='animate-pulse h-8 w-full bg-muted rounded-md mb-2'
              ></div>
            ))}
          </div>
        ) : (
          <ul className='flex flex-col min-h-[calc(100vh-48px-36px-16px-32px)] lg:min-h-[calc(100vh-32px-40px-32px)] items-start space-y-1 px-2'>
            {pages.map(({ groupLabel, menus }, index) => {
              // Wave 2b PR-S2: collapsed-section behavior only applies in the
              // expanded sidebar (isOpen !== false). In the icon-only rail
              // we always render every module row so the tooltips still work.
              const collapsed =
                collapseHydrated && !!groupLabel && isOpen !== false && isSectionCollapsed(groupLabel);
              // Only truly anonymous groups (no label) can be completely
              // header-less; labeled groups always render a clickable header.
              const showClickableHeader = isOpen !== false && !!groupLabel;
              return (
              <li
                className={cn('w-full', groupLabel ? 'pt-5' : '')}
                key={index}
              >
                {showClickableHeader ? (
                  // Clickable section header — toggles collapsed state (D5, R4)
                  <button
                    type='button'
                    onClick={() => groupLabel && toggleSection(groupLabel)}
                    aria-expanded={!collapsed}
                    aria-controls={`sidebar-section-${index}`}
                    className={cn(
                      'group/section w-full flex items-center justify-between px-4 pb-2 max-w-[248px]',
                      'text-sm font-medium text-muted-foreground dark:text-white/80',
                      'hover:text-foreground dark:hover:text-white transition-colors cursor-pointer'
                    )}
                  >
                    <span className='truncate text-left'>{groupLabel}</span>
                    <ChevronDown
                      size={14}
                      className={cn(
                        'shrink-0 ml-2 transition-transform duration-200',
                        collapsed && '-rotate-90'
                      )}
                      aria-hidden='true'
                    />
                  </button>
                ) : !isOpen && isOpen !== undefined && groupLabel ? (
                  <TooltipProvider>
                    <Tooltip delayDuration={100}>
                      <TooltipTrigger className='w-full'>
                        <div className='w-full flex justify-center items-center'>
                          <Ellipsis className='h-5 w-5' />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side='right'>
                        <p>{groupLabel}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <p className='pb-2'></p>
                )}
                <div id={`sidebar-section-${index}`} hidden={collapsed}>
                {menus.map(({ href, label, icon: Icon, active }) => {
                  const iconName = (Icon as { displayName?: string }).displayName || 'Folder';
                  const moduleName = groupLabel || 'General';

                  // Derive the module slug from the href: '/admission' → 'admission'.
                  // Skip Dashboard ('/') — it has no sub-pages and stays a plain link.
                  const moduleSlug = href === '/' ? null : href.replace(/^\//, '').split('/')[0]!;

                  // Filter the route manifest by URL path prefix to get this
                  // module's direct children (depth = 2 segments, e.g.
                  // /admission/leads). Path-based filtering avoids the
                  // module-name fuzzy match in getPagesByModule(), which fails
                  // for hyphenated slugs like 'campus-living' (the manifest
                  // stores those as humanized 'Campus Living').
                  const moduleSubPages = moduleSlug
                    ? getPageRegistry().filter((p) => {
                        const segs = p.path.split('/').filter(Boolean);
                        return (
                          segs.length === 2 &&
                          segs[0] === moduleSlug &&
                          p.path !== href
                        );
                      })
                    : [];
                  const directChildren = filterByPermissions(
                    moduleSubPages,
                    permissions,
                    isSuperAdmin,
                    userProfile?.role || ''
                  );

                  // Decide rendering mode:
                  // - Sidebar collapsed (icon-only, isOpen===false) → always plain link
                  // - No accessible direct children → plain link
                  // - Otherwise → accordion
                  const useAccordion = isOpen !== false && directChildren.length > 0;
                  const isExpanded = useAccordion && expandedModule === moduleSlug;

                  return (
                    <div className='w-full group/row' key={href}>
                      <div className='flex items-center'>
                        <TooltipProvider disableHoverableContent>
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              {useAccordion ? (
                                <Button
                                  variant={active ? 'secondary' : 'ghost'}
                                  className={cn(
                                    'flex-1 justify-start h-10 mb-1',
                                    !active && 'dark:text-gray-400'
                                  )}
                                  onClick={(e) => {
                                    if (active) {
                                      // Already on a page in this module — pure toggle, no nav.
                                      e.preventDefault();
                                      toggleModule(moduleSlug!);
                                    } else {
                                      // Navigating to the module root — open the accordion.
                                      setExpandedModule(moduleSlug!);
                                      // Let the Link navigation proceed.
                                    }
                                  }}
                                  aria-expanded={isExpanded}
                                  aria-controls={isExpanded ? `sidebar-submenu-${moduleSlug}` : undefined}
                                  asChild
                                >
                                  <Link href={href}>
                                    <span className={cn(isOpen === false ? '' : 'mr-4')}>
                                      <Icon size={18} />
                                    </span>
                                    <p
                                      className={cn(
                                        'max-w-[170px] truncate flex-1 text-left',
                                        isOpen === false
                                          ? '-translate-x-96 opacity-0'
                                          : 'translate-x-0 opacity-100'
                                      )}
                                    >
                                      {label}
                                    </p>
                                    {isOpen !== false && (() => {
                                      const shortcut = getShortcutForPath(href);
                                      return shortcut ? (
                                        <kbd className='hidden lg:inline-flex h-4 select-none items-center rounded border px-1 font-mono text-[9px] font-medium text-muted-foreground dark:text-gray-400 dark:border-gray-600 dark:bg-gray-800/50 bg-muted/80 border-border/60 mr-1'>
                                          {shortcut}
                                        </kbd>
                                      ) : null;
                                    })()}
                                    <ChevronRight
                                      size={16}
                                      className={cn(
                                        'transition-transform duration-200',
                                        isExpanded && 'rotate-90'
                                      )}
                                      aria-hidden='true'
                                    />
                                  </Link>
                                </Button>
                              ) : (
                                <Button
                                  variant={active ? 'secondary' : 'ghost'}
                                  className={cn(
                                    'flex-1 justify-start h-10 mb-1',
                                    !active && 'dark:text-gray-400'
                                  )}
                                  asChild
                                >
                                  <Link href={href}>
                                    <span className={cn(isOpen === false ? '' : 'mr-4')}>
                                      <Icon size={18} />
                                    </span>
                                    <p
                                      className={cn(
                                        'max-w-[170px] truncate flex-1',
                                        isOpen === false
                                          ? '-translate-x-96 opacity-0'
                                          : 'translate-x-0 opacity-100'
                                      )}
                                    >
                                      {label}
                                    </p>
                                    {isOpen !== false && (() => {
                                      const shortcut = getShortcutForPath(href);
                                      return shortcut ? (
                                        <kbd className='hidden lg:inline-flex h-4 select-none items-center rounded border px-1 font-mono text-[9px] font-medium text-muted-foreground dark:text-gray-400 dark:border-gray-600 dark:bg-gray-800/50 bg-muted/80 border-border/60'>
                                          {shortcut}
                                        </kbd>
                                      ) : null;
                                    })()}
                                  </Link>
                                </Button>
                              )}
                            </TooltipTrigger>
                            {isOpen === false && (
                              <TooltipContent side='right'>{label}</TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                        {isOpen !== false && (
                          <FavoriteStar
                            pagePath={href}
                            pageTitle={label}
                            module={moduleName}
                            iconName={iconName}
                            size='sm'
                            className='opacity-0 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity mr-1'
                          />
                        )}
                      </div>

                      {/* Accordion sub-page list */}
                      {useAccordion && (
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.ul
                              id={`sidebar-submenu-${moduleSlug}`}
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: 'easeOut' }}
                              className='overflow-hidden ml-2 border-l border-border/50'
                            >
                              {directChildren.map((sub) => {
                                const SubIcon = sub.icon;
                                const isActive = pathname === sub.path;
                                return (
                                  <li key={sub.path}>
                                    <Button
                                      variant={isActive ? 'secondary' : 'ghost'}
                                      className={cn(
                                        'w-full justify-start h-10 mb-1 pl-6',
                                        !isActive && 'dark:text-gray-400'
                                      )}
                                      asChild
                                    >
                                      <Link href={sub.path}>
                                        <span className='mr-4'>
                                          <SubIcon size={18} />
                                        </span>
                                        <span className='max-w-[160px] truncate'>{sub.title}</span>
                                      </Link>
                                    </Button>
                                  </li>
                                );
                              })}
                            </motion.ul>
                          )}
                        </AnimatePresence>
                      )}
                    </div>
                  );
                })}
                </div>
              </li>
              );
            })}
            <li className='w-full grow flex items-end'>
              <div className='w-full'>
                {!isInstalled && canInstall && (
                  <TooltipProvider disableHoverableContent>
                    <Tooltip delayDuration={100}>
                      <TooltipTrigger asChild>
                        <Button
                          variant='ghost'
                          className='w-full justify-start h-10 mb-1 text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-950'
                          onClick={installApp}
                        >
                          <span className={cn(isOpen === false ? '' : 'mr-4')}>
                            <Download size={18} />
                          </span>
                          <p
                            className={cn(
                              'max-w-[200px] truncate',
                              isOpen === false
                                ? '-translate-x-96 opacity-0'
                                : 'translate-x-0 opacity-100'
                            )}
                          >
                            Install App
                          </p>
                        </Button>
                      </TooltipTrigger>
                      {isOpen === false && (
                        <TooltipContent side='right'>Install App</TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                )}
                <TooltipProvider disableHoverableContent>
                  <Tooltip delayDuration={100}>
                    <TooltipTrigger asChild>
                      <Button
                        variant='outline'
                        className='w-full justify-center h-10 mt-4'
                        onClick={handleLogout}
                      >
                        <span className={cn(isOpen === false ? '' : 'mr-4')}>
                          <LogOut size={18} />
                        </span>
                        <p
                          className={cn(
                            'whitespace-nowrap',
                            isOpen === false ? 'opacity-0 hidden' : 'opacity-100'
                          )}
                        >
                          Sign out
                        </p>
                      </Button>
                    </TooltipTrigger>
                    {isOpen === false && (
                      <TooltipContent side='right'>Sign out</TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
            </li>
          </ul>
        )}
      </nav>
    </div>
  );
}
