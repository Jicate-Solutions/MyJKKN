/**
 * manifest-pages.ts — bridge between the auto-generated ROUTE_MANIFEST
 * (scripts/generate-route-manifest.ts) and the CommandPalette's PageEntry
 * format.
 *
 * Walks the manifest tree, yields a flat array of PageEntry items. Used by
 * page-registry.ts to additively expand the palette's searchable surface
 * from the curated sidebar (~140 pages) to every page.tsx in the app
 * (~540 pages as of Apr 2026).
 *
 * Entries produced here are "shallow" — they have default keywords and a
 * generic description. The curated PAGE_ENRICHMENTS in page-registry.ts
 * take precedence and are layered on top via the merge in buildRegistry().
 */

import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ROUTE_MANIFEST, type RouteNode } from './route-manifest.generated';
import { MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';
import type { PageEntry } from './types';

/**
 * Humanize a URL segment into a display label.
 *   "campus-living"       → "Campus Living"
 *   "data-quality"        → "Data Quality"
 *   "[id]"                → ""   (parametric segments have no label)
 */
function humanizeSegment(seg: string): string {
  if (!seg || seg.startsWith('[')) return '';
  return seg
    .split('-')
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

/**
 * Derive a module label from the first URL segment.
 *   "/admission/leads"           → "Admission"
 *   "/campus-living/attendance"  → "Campus Living"
 *   "/"                          → "Overview"
 */
function deriveModuleLabel(path: string): string {
  const first = path.split('/').filter(Boolean)[0];
  if (!first) return 'Overview';
  return humanizeSegment(first) || 'Overview';
}

/**
 * Keywords auto-derived from label + module — mirrors the fallback used
 * by page-registry.generateDefaultKeywords().
 */
function generateKeywords(label: string, module: string): string[] {
  const words = label.toLowerCase().split(/[\s/&-]+/).filter((w) => w.length > 2);
  const mod = module.toLowerCase();
  return Array.from(new Set([...words, mod]));
}

/** Resolve an icon name string to a Lucide component; fall back to FileText. */
function resolveIcon(iconName: string): LucideIcon {
  const icon = (Icons as unknown as Record<string, LucideIcon>)[iconName];
  return icon ?? Icons.FileText;
}

/**
 * Resolve the permission gate for a manifest path.
 *
 * A direct MENU_PERMISSIONS entry always wins. Otherwise — for BoS pages only —
 * walk up the path segments and inherit the nearest mapped ancestor's gate.
 *
 * Why: the route manifest registers every page.tsx as its own entry, including
 * children like /bos/compositions/new and /bos/syllabus/new. Those children are
 * NOT catalogued in MENU_PERMISSIONS, so without inheritance they resolve to
 * `undefined`, and the Command Palette's filter treats a missing permission as
 * "visible to all authenticated users" (lib/navigation/permission-filter.ts:19)
 * — surfacing them to students even though the parent listing page is gated.
 *
 * Scoped to /bos so we only tighten this known subtree; unmapped children
 * elsewhere keep their current visibility (avoids cross-module regressions).
 * Inheritance only ADDS a gate to pages that had none — it never loosens one.
 */
function resolveManifestPermission(path: string): string | undefined {
  const direct = MENU_PERMISSIONS[path];
  if (direct) return direct;
  if (!path.startsWith('/bos')) return undefined;

  // e.g. '/bos/compositions/new' → try '/bos/compositions', then '/bos'.
  const segments = path.split('/').filter(Boolean);
  for (let i = segments.length - 1; i >= 1; i--) {
    const ancestor = '/' + segments.slice(0, i).join('/');
    const inherited = MENU_PERMISSIONS[ancestor];
    if (inherited) return inherited;
  }
  return undefined;
}

/**
 * Walk the ROUTE_MANIFEST tree depth-first, emitting a PageEntry for every
 * non-parametric path. Parametric segments (e.g. `[id]`) are skipped at the
 * source by the generator, but we guard anyway.
 */
export function getManifestPages(): PageEntry[] {
  const out: PageEntry[] = [];
  const seen = new Set<string>();

  const walk = (nodes: RouteNode[], parentPath: string | undefined): void => {
    for (const node of nodes) {
      // Skip anything parametric that slipped through.
      if (node.path.includes('[') || seen.has(node.path)) {
        if (node.children.length) walk(node.children, node.path);
        continue;
      }
      seen.add(node.path);

      const module = deriveModuleLabel(node.path);
      const icon = resolveIcon(node.iconName);
      const permission = resolveManifestPermission(node.path);

      out.push({
        path: node.path,
        title: node.label,
        keywords: generateKeywords(node.label, module),
        description: `${node.label} in ${module}`,
        module,
        icon,
        iconName: node.iconName,
        permission: permission || undefined,
        parentPath,
      });

      if (node.children.length) walk(node.children, node.path);
    }
  };

  walk(ROUTE_MANIFEST, undefined);
  return out;
}
