'use client';

import Link from 'next/link';
import { Ellipsis, LogOut, Download, ChevronDown, ChevronRight, FileText, AlertTriangle, RefreshCw } from 'lucide-react';
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
import { GetRoleBasedPages, RolePermissionData, MENU_PERMISSIONS, filterToInductionOnlyMenu } from '@/lib/sidebarMenuLink';
import { getModulesBySection } from '@/lib/navigation/modules';
import { getPageRegistry, getPageByPath } from '@/lib/navigation/page-registry';
import { filterByPermissions } from '@/lib/navigation/permission-filter';
import { AuthService } from '@/lib/auth/auth-service';
import { useEffect, useMemo } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionType } from '@/hooks/use-institution-type';
import { adaptMenuLabels, adaptLabel } from '@/lib/utils/school-label-adapter';
import {
  useExpandedSidebarModule,
  useExpandedSidebarModuleHydration,
} from '@/hooks/use-expanded-sidebar-module';
import { useUserExpoTeamStatus } from '@/hooks/admission/use-expo-capture';
import { useCommitteeMembership } from '@/hooks/events/marathon/use-committee-membership';
import { useHasAnyTournamentRole } from '@/hooks/events/use-has-any-tournament-role';
import {
  useIsSoiCoordinator,
  withSoiCoordinatorNavAccess,
} from '@/hooks/school-of-influence/use-soi-coordinator-nav-access';
import { useIsHosteler } from '@/hooks/campus-living/use-is-hosteler';
import { useIsInductionOnly } from '@/hooks/use-my-lifecycle-status';
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
    isStudent,
    isLoading: permissionsLoading,
    error: permissionsError,
    refetch: refetchPermissions,
    userProfile
  } = usePermissions();
  const { institutionType } = useInstitutionType();
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

  // Per-event tournament organizers (in-charge / committee / volunteer) hold no
  // sports.tournaments.* key but ARE let into the module by RoutePermissionGuard's
  // fallbackCheck. Skip the RPC for users the menu already shows the module to.
  const hasTournamentViewKey = isSuperAdmin || permissions['sports.tournaments.view'] === true;
  const hasTournamentRole = useHasAnyTournamentRole(!permissionsLoading && !hasTournamentViewKey);

  // School of Influence coordinators are appointed in cohort_coordinators, not
  // granted a key, so filterByPermissions could never see them and the sidebar
  // hid the programme from the one person whose job it is (BUG-005799 /
  // BUG-005800). Same shape as the tournament seam above; the hook skips the
  // lookup entirely for super admins and for anyone already holding the key.
  const isSoiCoordinator = useIsSoiCoordinator();

  // Students: the My Hostel sidebar entry is shown only for actual hostel
  // residents (learners_profiles accommodation = hostel), not every student.
  const isStudentRole = userProfile?.role === 'student';
  const { data: isHosteler } = useIsHosteler(isStudentRole);
  // Pre-onboarding (induction-only) learners: scope the sidebar to My Induction +
  // My Profile. Proxy.ts is the real gate; this hides links that would only redirect.
  const isInductionOnly = useIsInductionOnly(isStudentRole);

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
    //
    // 2026-05-11: counselor roles whose access to the Marketing module was
    // explicitly revoked must NOT get expo visibility re-granted via
    // team-membership enrichment. Without this carve-out, an
    // admission_counselor / learner_counselor / staff_counselor user who
    // happens to be on any expo team (e.g. MAHENDIRAN S) would have the
    // Marketing parent menu re-appear in the sidebar because at least one of
    // its 16 submenus (`/admission/marketing/expos`) becomes accessible. The
    // expo_counselor role legitimately needs expo access and gets it through
    // its own `custom_roles.permissions`, so it is intentionally NOT skipped.
    const enrichedPermissions = {
      ...withSoiCoordinatorNavAccess(permissions, isSoiCoordinator),
    };
    const EXPO_ENRICHMENT_SKIP_ROLES = new Set([
      'admission_counselor',
      'learner_counselor',
      'staff_counselor',
    ]);
    const skipExpoEnrichment = EXPO_ENRICHMENT_SKIP_ROLES.has(userProfile.role || '');

    if (isExpoTeamMember && !skipExpoEnrichment) {
      enrichedPermissions['admission.marketing.expos.view'] = true;
    }

    // Student committee members need ops page visibility in sidebar
    if (isMarathonCommitteeMember) {
      enrichedPermissions['events.marathon.ops.committee_access'] = true;
    }

    // Tournament in-charges / committee members / volunteers (2026-07-21).
    // Without this the nav contradicted the route guard: an appointed student
    // in-charge was let into /events/tournament by fallbackCheck but never shown
    // the link, so the in-charge feature was unreachable for its intended users.
    // Grants nothing new — fn_has_any_tournament_role() is the SAME check the
    // guard runs, and every page/API still authorizes per event (useTournamentAccess
    // -> canView/canManage, canViewTournament/canManageTournament server-side).
    if (hasTournamentRole) {
      enrichedPermissions['sports.tournaments.view'] = true;
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
  }, [userProfile, permissions, isSuperAdmin, isExpoTeamMember, isMarathonCommitteeMember, hasTournamentRole, isSoiCoordinator, isStudentRole, isHosteler]);

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
  const pagesRawBase = GetRoleBasedPages(pathname, roleData);
  const pagesRaw = isInductionOnly ? filterToInductionOnlyMenu(pagesRawBase) : pagesRawBase;

  // Adapt menu labels based on institution type (school → classes/terms, college → programs/semesters)
  const pagesAdapted = useMemo(
    () => adaptMenuLabels(pagesRaw, institutionType),
    [pagesRaw, institutionType]
  );

  const pages = useMemo(() => {
    // Index permission-filtered groups by groupLabel for O(1) lookup
    const byLabel = new Map<string, (typeof pagesAdapted)[number]>();
    for (const g of pagesAdapted) {
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
    for (const g of pagesAdapted) {
      if (g.groupLabel && !matchedLabels.has(g.groupLabel)) {
        ordered.push(g);
      } else if (!g.groupLabel) {
        // Anonymous (header-less) groups — pass through at end to preserve
        // existing rendering for any oddball items without a section.
        ordered.push(g);
      }
    }

    return ordered;
  }, [pagesAdapted]);

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

  // Distinguish a genuine "no access" state from a transient permission-LOAD
  // failure. A signed-in STAFF user (non-student) who has a role on their profile
  // should always resolve at least one permission; an EMPTY merged set (or a
  // query error) means permissions didn't load — almost always a transient
  // network/RPC hiccup, not a real loss of access. We must NOT silently collapse
  // to a Dashboard-only menu in that case: that reads as "you lost all your
  // access" and is the exact confusion behind BUG-004281 (CLAUDE.md #27 — surface
  // failures explicitly).
  //
  // Exclusions (legitimate empty-permission states, NOT failures):
  //   - super admins: menu isn't permission-keyed; `permissions` is empty by design.
  //   - students: student-status rules (inactive/exited/pending) deliberately empty
  //     the permission set, which is a valid no-menu state.
  //   - users with no profile role: nothing to load.
  const hasAnyTruePermission = Object.values(permissions).some((v) => v === true);
  const permissionsLoadFailed =
    !isSuperAdmin &&
    !isStudent &&
    !permissionsLoading &&
    !!userProfile &&
    !!userProfile.role &&
    (!!permissionsError || !hasAnyTruePermission);

  return (
    <div className='overflow-y-auto overflow-x-hidden h-full custom-scrollbar'>
      {/* Sticky header: search + favorites pin to the top so they remain
          visible while the rest of the sidebar scrolls. The bg-sidebar
          background prevents scrolling content from showing through. */}
      <div className='sticky top-0 z-10 bg-sidebar'>
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
      </div>
      <nav className='mt-2 h-full w-full'>
        {permissionsLoading ? (
          // flex defaults to `row`, so without flex-col these placeholder bars
          // rendered squeezed side-by-side instead of as stacked menu rows.
          <div className='flex flex-col items-center py-4 px-2'>
            <div className='animate-pulse h-4 w-24 bg-muted rounded mb-2'></div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className='animate-pulse h-8 w-full bg-muted rounded-md mb-2'
              ></div>
            ))}
          </div>
        ) : permissionsLoadFailed ? (
          // Explicit, recoverable state — never silently collapse to Dashboard-only
          // when permissions failed to load (BUG-004281). The user keeps a way out
          // (Retry + Dashboard) and a plain-language reason.
          <div className='flex flex-col items-center justify-center gap-3 px-4 py-12 text-center'>
            <AlertTriangle className='h-8 w-8 text-amber-500' aria-hidden />
            <div className='space-y-1'>
              <p className='text-sm font-medium text-foreground'>
                We couldn&apos;t load your menu
              </p>
              <p className='text-xs text-muted-foreground'>
                Your access didn&apos;t load. This is almost always a temporary
                network hiccup — your permissions haven&apos;t changed.
              </p>
            </div>
            <button
              type='button'
              onClick={() => {
                void refetchPermissions();
              }}
              className='inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            >
              <RefreshCw className='h-3.5 w-3.5' aria-hidden />
              Retry
            </button>
            <Link
              href='/'
              className='text-xs text-muted-foreground underline-offset-2 hover:underline'
            >
              Go to Dashboard
            </Link>
            <p className='text-[11px] text-muted-foreground'>
              If this keeps happening, refresh the page or contact your
              administrator.
            </p>
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
              // PR #680's accordion was designed for sections with a single
              // module-root row. After Wave 2b PR-S2 (#432) flattened the
              // sidebar, most sections render multiple rows that share the
              // same URL slug (e.g. /users, /users/dashboard, /users/roles
              // all live in "User Management"). Without an anchor pick,
              // every row would expand together (slug-keyed state) and each
              // would re-list the same children.
              //
              // Anchor selection: the row whose href matches /<slug> exactly
              // wins; otherwise the first row in section-order claims the
              // anchor for its slug. Only the anchor row gets the accordion;
              // sibling rows are plain links. The anchor's children list
              // excludes any href already rendered in this section, so
              // siblings never appear duplicated under the anchor.
              const siblingHrefs = new Set(menus.map((m) => m.href));
              const anchorBySlug = new Map<string, string>();
              for (const m of menus) {
                if (m.href === '/') continue;
                const slug = m.href.replace(/^\//, '').split('/')[0];
                if (m.href === `/${slug}` && !anchorBySlug.has(slug)) {
                  anchorBySlug.set(slug, m.href);
                }
              }
              for (const m of menus) {
                if (m.href === '/') continue;
                const slug = m.href.replace(/^\//, '').split('/')[0];
                if (!anchorBySlug.has(slug)) anchorBySlug.set(slug, m.href);
              }
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
                {menus.map(({ href, label, icon: Icon, active, submenus, noSubmenus }) => {
                  const iconName = (Icon as { displayName?: string }).displayName || 'Folder';
                  const moduleName = groupLabel || 'General';

                  // Derive the module slug from the href: '/admission' → 'admission'.
                  // Skip Dashboard ('/') — it has no sub-pages and stays a plain link.
                  const moduleSlug = href === '/' ? null : href.replace(/^\//, '').split('/')[0]!;

                  // Rows with hand-authored submenus self-anchor under their full-path
                  // key so several accordion rows can share one top-level slug (e.g.
                  // /hr, /hr/recruitment and /hr/admin each expand independently).
                  // Auto-discovery rows keep the one-anchor-per-slug competition below,
                  // which exists so siblings never re-list the same manifest children.
                  const hasExplicitSubmenus = submenus.length > 0 && !noSubmenus;
                  const accordionKey = hasExplicitSubmenus && moduleSlug ? href.replace(/^\//, '') : moduleSlug;

                  // Children source priority:
                  //  1. `noSubmenus: true` on the row → plain link, no
                  //     children at all (skip both submenus and manifest).
                  //  2. Explicit `submenus` array on the anchor row — lets
                  //     authors set custom order + custom labels per child.
                  //     Icon is borrowed from the route-manifest entry when
                  //     available, else falls back to FileText.
                  //  3. Otherwise auto-discover depth-2 pages from the route
                  //     manifest (alphabetical) excluding any sibling href.
                  //
                  // Only the anchor row for each slug gets sub-pages; non-anchor
                  // siblings render as plain links.
                  const isAnchor = moduleSlug ? (hasExplicitSubmenus || anchorBySlug.get(moduleSlug) === href) : false;
                  const moduleSubPages = (isAnchor && !noSubmenus)
                    ? (submenus.length > 0
                        ? submenus.map((sub) => {
                            const fromManifest = getPageByPath(sub.href);
                            return {
                              path: sub.href,
                              title: sub.label,
                              module: moduleSlug ?? '',
                              // Hand-authored `submenus` carry no permission of their
                              // own, so filterByPermissions used to treat them as
                              // "no permission required → visible to all" — leaking the
                              // full menu (e.g. IMS) to users who only hold a subset of
                              // the module's permissions. Attach the route's permission
                              // from the manifest, falling back to MENU_PERMISSIONS, so
                              // each child is gated like auto-discovered pages are.
                              permission: fromManifest?.permission ?? MENU_PERMISSIONS[sub.href],
                              icon: fromManifest?.icon ?? FileText,
                              iconName: fromManifest?.iconName ?? 'FileText',
                              keywords: [],
                              description: '',
                            };
                          })
                        : getPageRegistry().filter((p) => {
                            const segs = p.path.split('/').filter(Boolean);
                            return (
                              segs.length === 2 &&
                              segs[0] === moduleSlug &&
                              p.path !== href &&
                              !siblingHrefs.has(p.path)
                            );
                          }))
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
                  const isExpanded = useAccordion && expandedModule === accordionKey;

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
                                    // Pure toggle: clicking the parent only opens/closes
                                    // the accordion. The module root page is reachable
                                    // via the module's /dashboard sub-page (auto-discovered),
                                    // Ctrl+K, or direct URL.
                                    e.preventDefault();
                                    toggleModule(accordionKey!);
                                  }}
                                  aria-expanded={isExpanded}
                                  aria-controls={isExpanded ? `sidebar-submenu-${accordionKey}` : undefined}
                                  asChild
                                >
                                  <Link href={href}>
                                    {/* useAccordion === true here, which means
                                        isOpen !== false (line 351). The collapsed
                                        sidebar (icon-only, isOpen===false) takes
                                        the plain-link branch below, never this
                                        accordion branch — so the isOpen === false
                                        layout variants are dead code here. */}
                                    <span className='mr-4'>
                                      <Icon size={18} />
                                    </span>
                                    <p className='max-w-[170px] truncate flex-1 text-left translate-x-0 opacity-100'>
                                      {label}
                                    </p>
                                    {(() => {
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
                              id={`sidebar-submenu-${accordionKey}`}
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
                                        <span className='max-w-[160px] truncate'>{adaptLabel(sub.title, institutionType)}</span>
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
