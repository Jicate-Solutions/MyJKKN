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
      const permission = MENU_PERMISSIONS[node.path];

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
