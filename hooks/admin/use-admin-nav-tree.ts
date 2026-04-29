'use client';

/**
 * useAdminNavTree — merge filesystem auto-discovery (Agent M, PR #624) with
 * super_admin DB overrides (Agent P, PR #622) for the /admin 3-tier nav.
 *
 * Approach 4 (filesystem default + DB override) — Director's directive 2026-04-29.
 *
 * Default: filesystem-derived tree (drop new page.tsx → auto-appears, zero registration).
 * Override: rows in `platform_policies` with key prefix `nav.admin.override.<path>`
 *           let super_admins rename, reorder, or hide pages without code changes.
 *
 * RPC: `fn_get_admin_nav_overrides()` returns {href, category, label, display_order, hidden, icon}.
 * Cached 60s via TanStack — edits in /admin/nav-config UI take effect on next refetch.
 *
 * Fallback semantics: if the RPC fails (e.g. permission/network), components render the
 * unmodified filesystem tree — never break the nav. Override is purely additive.
 */

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  getAdminNavTree,
  type AdminCategoryNode,
  type AdminPageNode,
} from '@/lib/admin/nav-tree';

interface NavOverride {
  href: string;
  category: string | null;
  label: string | null;
  display_order: number | null;
  hidden: boolean | null;
  icon: string | null;
}

async function fetchOverrides(): Promise<NavOverride[]> {
  const supabase = createClientSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('fn_get_admin_nav_overrides');
  if (error) {
    console.warn('[admin/nav] override RPC failed; falling back to filesystem default:', error.message);
    return [];
  }
  return (data as NavOverride[]) ?? [];
}

function applyOverrides(
  tree: AdminCategoryNode[],
  overrides: NavOverride[]
): AdminCategoryNode[] {
  if (overrides.length === 0) return tree;

  const byHref = new Map<string, NavOverride>(overrides.map((o) => [o.href, o]));

  const merged = tree.map((category) => {
    const pagesAfter: AdminPageNode[] = category.pages
      .filter((page) => !byHref.get(page.href)?.hidden)
      .map((page) => {
        const o = byHref.get(page.href);
        if (!o) return page;
        return {
          ...page,
          label: o.label ?? page.label,
          iconName: o.icon ?? page.iconName,
        };
      });
    return { ...category, pages: pagesAfter };
  });

  // Drop categories whose pages are all hidden — keeps Tier-2 nav clean.
  return merged.filter((c) => c.pages.length > 0);
}

/**
 * Hook returning the override-merged admin nav tree. Components consuming this
 * automatically reflect /admin/nav-config edits within 60s (the cache TTL).
 *
 * Note: cross-category overrides (moving a page from one category to another) are
 * NOT yet supported — the override layer respects label/icon/hidden but page
 * stays in its filesystem-derived category. Cross-category moves require deeper
 * tree mutation; deferred until that's a real Director ask.
 */
export function useAdminNavTree(): AdminCategoryNode[] {
  const baseTree = getAdminNavTree();
  const { data: overrides = [] } = useQuery({
    queryKey: ['admin-nav-overrides'],
    queryFn: fetchOverrides,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  });
  return applyOverrides(baseTree, overrides);
}
