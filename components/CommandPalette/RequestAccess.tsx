'use client';

import { useMemo } from 'react';
import { getPageRegistry } from '@/lib/navigation/page-registry';
import { MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PageEntry } from '@/lib/navigation/types';

interface RestrictedPageResult {
  page: PageEntry;
  requiredPermission: string;
}

/**
 * Find pages that match a search query but the user doesn't have access to.
 * Shows these as muted results with "Request Access" hint.
 */
export function findRestrictedPages(
  query: string,
  accessiblePaths: Set<string>,
  limit: number = 3
): RestrictedPageResult[] {
  if (!query || query.length < 2) return [];

  const q = query.toLowerCase();
  const allPages = getPageRegistry();

  return allPages
    .filter((page) => {
      // Must NOT be accessible
      if (accessiblePaths.has(page.path)) return false;
      // Must have a permission requirement
      if (!page.permission) return false;
      // Must match the query
      return (
        page.title.toLowerCase().includes(q) ||
        page.keywords.some((k) => k.toLowerCase().includes(q)) ||
        page.description.toLowerCase().includes(q)
      );
    })
    .slice(0, limit)
    .map((page) => ({
      page,
      requiredPermission: page.permission || '',
    }));
}

/**
 * Component to render a restricted page result in the command palette.
 */
export function RestrictedPageItem({
  page,
  permission,
}: {
  page: PageEntry;
  permission: string;
}) {
  // Format permission for display: 'billing.invoices.view' → 'billing invoices view'
  const permissionLabel = permission.replace(/[._]/g, ' ');

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 opacity-50 cursor-not-allowed'
      )}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/40 dark:bg-gray-800/50">
        <Lock className="h-4 w-4 text-muted-foreground/50" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground truncate">{page.title}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground/50 shrink-0">
            {page.module}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground/40 mt-0.5">
          Requires: {permissionLabel}
        </p>
      </div>
      <span className="text-[10px] text-muted-foreground/40 shrink-0">
        No access
      </span>
    </div>
  );
}
