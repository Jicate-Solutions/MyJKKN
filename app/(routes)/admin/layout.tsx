'use client';

/**
 * Admin Module — Tier 2 shared layout.
 *
 * Wraps every `/admin/*` route with the admin shell (ContentLayout +
 * Breadcrumb + page header + Tier-2 module tabs). Per-category Tier-3
 * sub-tabs come from per-category layouts (Agent N's PR adds those for
 * notifications, lti, pde, counselors).
 *
 * Pattern reference
 * -----------------
 * Mirrors `app/(routes)/admission/counselors/team/layout.tsx` (PR #603) —
 * the canonical 3-tier shape: ContentLayout > Breadcrumb > Header > Nav >
 * {tab body}.
 *
 * Auto-discovery
 * --------------
 * Module tabs come from `getAdminNavTree()` (filesystem-derived). Drop a
 * new `app/(routes)/admin/<x>/page.tsx` and the new tab auto-appears with
 * zero registration overhead.
 *
 * Why this layout does NOT gate permissions
 * -----------------------------------------
 * Existing admin pages (lifecycle, bug-reports, etc.) handle their own
 * permission gating with bespoke fallback UIs. This layout intentionally
 * stays permissive so it can decorate every admin route without breaking
 * those page-owned auth states. The sidebar already enforces top-level
 * "admin module" visibility.
 */

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

import { AdminModuleNav } from '@/components/admin/AdminModuleNav';
import { findActiveCategory } from '@/lib/admin/nav-tree';

/**
 * Resolve the page header + breadcrumb crumbs from the active pathname.
 * Falls back to the bare "Administration" header when no category matches
 * (e.g. on the `/admin` redirect page itself).
 */
function resolveHeader(pathname: string | null): {
  title: string;
  subtitle: string;
  categoryCrumb: { href: string; label: string } | null;
  pageCrumb: { label: string } | null;
} {
  if (!pathname) {
    return {
      title: 'Administration',
      subtitle: 'Platform-wide configuration and admin tools.',
      categoryCrumb: null,
      pageCrumb: null,
    };
  }
  const active = findActiveCategory(pathname);
  if (!active) {
    return {
      title: 'Administration',
      subtitle: 'Platform-wide configuration and admin tools.',
      categoryCrumb: null,
      pageCrumb: null,
    };
  }
  const { category, activePage } = active;

  // Category title — use category label as the H1 once the user is inside
  // a category. Subtitle stays generic; per-category layouts can override
  // by rendering their own header above {children}.
  const title = category.label;
  const subtitle =
    category.key === 'system'
      ? 'Platform-wide tools and individual admin utilities.'
      : `${category.label} — administrative configuration.`;

  // Breadcrumb segments
  const categoryCrumb =
    category.key === 'system'
      ? null
      : { href: category.href, label: category.label };
  const pageCrumb =
    activePage && !activePage.isCategoryRoot
      ? { label: activePage.label }
      : null;

  return { title, subtitle, categoryCrumb, pageCrumb };
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const header = resolveHeader(pathname);

  return (
    <ContentLayout title={header.title}>
      <div className="space-y-6">
        {/* Breadcrumb — Admin > [Category] > [Page] */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              {header.categoryCrumb || header.pageCrumb ? (
                <BreadcrumbLink href="/admin">Admin</BreadcrumbLink>
              ) : (
                <BreadcrumbPage>Admin</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {header.categoryCrumb && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {header.pageCrumb ? (
                    <BreadcrumbLink href={header.categoryCrumb.href}>
                      {header.categoryCrumb.label}
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{header.categoryCrumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </>
            )}
            {header.pageCrumb && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{header.pageCrumb.label}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold">{header.title}</h1>
          <p className="text-muted-foreground mt-1">{header.subtitle}</p>
        </div>

        {/* Tier 2: Module tabs (Notifications, PDE, LTI, Counselors, System) */}
        <AdminModuleNav />

        {/* Tier 3 sub-tabs come from per-category layouts (Agent N) */}
        {children}
      </div>
    </ContentLayout>
  );
}
