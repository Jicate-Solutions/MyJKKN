#!/usr/bin/env tsx
/**
 * Generate Route Manifest
 * --------------------------------------------------------------------------
 * Walks app/(routes)/** and emits a tree of every page.tsx, indexed by URL
 * path. The manifest powers the <AutoTabNav /> component so any new page
 * automatically appears as a sibling tab on its peers — no per-section
 * layout.tsx maintenance required.
 *
 * Output: lib/navigation/route-manifest.generated.ts
 *
 * Conventions
 * - Folders starting with `(` are route groups (don't affect URL)
 * - Folders starting with `_` are private (skipped — internal components)
 * - Folders containing `[` are dynamic segments (kept as `[id]` placeholders)
 * - Pages emit a `navMeta` const if they want to override label/icon:
 *     export const navMeta = { label: 'My Custom Label', icon: 'Users' }
 *   (See components/navigation/nav-meta.ts for the type.)
 *
 * Run via:
 *   npm run gen:routes
 *
 * CI:
 *   The build script runs this and fails if the output differs from git
 *   (so PRs adding pages must commit a fresh manifest).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROUTES_DIR = path.join(process.cwd(), 'app', '(routes)');
const OUT_PATH = path.join(
  process.cwd(),
  'lib',
  'navigation',
  'route-manifest.generated.ts'
);

interface RouteNode {
  /** URL path (e.g. /admission/marketing) */
  path: string;
  /** Display label (derived from path or overridden by navMeta) */
  label: string;
  /** Icon name (lucide-react export). Falls back to inferred default. */
  iconName: string;
  /** Children — siblings of the next-deeper level */
  children: RouteNode[];
}

const SKIP_PREFIXES = ['_'];
const ROUTE_GROUP_RE = /^\(.+\)$/;
const DYNAMIC_RE = /^\[.+\]$/;

function shouldSkipDir(name: string): boolean {
  return SKIP_PREFIXES.some((p) => name.startsWith(p));
}

function isRouteGroup(name: string): boolean {
  return ROUTE_GROUP_RE.test(name);
}

function isDynamic(name: string): boolean {
  return DYNAMIC_RE.test(name);
}

function urlSegmentForFolder(folderName: string): string | null {
  if (shouldSkipDir(folderName)) return null;
  if (isRouteGroup(folderName)) return ''; // contributes nothing to URL
  return folderName;
}

function titleCaseSegment(seg: string): string {
  return seg
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Map URL prefixes to a sensible default lucide icon for new pages.
 * Real icons can be overridden per-page via `export const navMeta = { icon }`.
 */
function inferIcon(urlPath: string): string {
  if (urlPath.endsWith('/dashboard')) return 'LayoutGrid';
  if (urlPath.endsWith('/analytics')) return 'BarChart';
  if (urlPath.endsWith('/settings')) return 'Settings';
  if (urlPath.endsWith('/new') || urlPath.includes('/create')) return 'Plus';
  if (urlPath.endsWith('/list') || urlPath.endsWith('/all')) return 'List';
  if (urlPath.includes('/reports')) return 'FileBarChart';
  if (urlPath.includes('/calendar')) return 'Calendar';
  if (urlPath.includes('/users') || urlPath.includes('/members')) return 'Users';
  if (urlPath.includes('/profile')) return 'UserCircle';
  if (urlPath.includes('/messages') || urlPath.includes('/chat')) return 'MessageSquare';
  if (urlPath.includes('/payment') || urlPath.includes('/billing')) return 'Wallet';
  return 'FileText';
}

/**
 * Read `export const navMeta = {...}` literal from a page file (best-effort).
 * Supports simple object literals — bails out silently for anything tricky
 * since this runs at build, not runtime.
 */
function readNavMeta(
  pagePath: string
): { label?: string; iconName?: string } | null {
  try {
    const src = fs.readFileSync(pagePath, 'utf8');
    // Match: export const navMeta = { ... }
    const re = /export\s+const\s+navMeta\s*(?::\s*\w+\s*)?=\s*\{([^}]*)\}/;
    const m = src.match(re);
    if (!m) return null;
    const body = m[1]!;
    const out: { label?: string; iconName?: string } = {};
    const labelM = body.match(/label\s*:\s*['"`]([^'"`]+)['"`]/);
    const iconM = body.match(/icon(?:Name)?\s*:\s*['"`]([^'"`]+)['"`]/);
    if (labelM) out.label = labelM[1];
    if (iconM) out.iconName = iconM[1];
    return out;
  } catch {
    return null;
  }
}

function walk(absDir: string, urlSoFar: string): RouteNode[] {
  if (!fs.existsSync(absDir)) return [];
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  const folders = entries.filter((e) => e.isDirectory());

  const out: RouteNode[] = [];

  for (const folder of folders) {
    const seg = urlSegmentForFolder(folder.name);
    if (seg === null) continue;
    const childAbs = path.join(absDir, folder.name);
    const childUrl = seg === '' ? urlSoFar : `${urlSoFar}/${seg}`;
    const hasOwnPage = fs.existsSync(path.join(childAbs, 'page.tsx'));
    const grandChildren = walk(childAbs, childUrl);

    // If a folder is just a route-group passthrough (seg === ''), promote its
    // children up to the current level rather than nesting them.
    if (seg === '') {
      out.push(...grandChildren);
      continue;
    }

    // Skip dynamic-only segments from nav (we don't tab-nav between [id]s).
    if (isDynamic(folder.name)) continue;

    if (!hasOwnPage && grandChildren.length === 0) {
      // Empty folder, skip
      continue;
    }

    const meta = hasOwnPage
      ? readNavMeta(path.join(childAbs, 'page.tsx'))
      : null;

    out.push({
      path: childUrl,
      label: meta?.label ?? titleCaseSegment(folder.name),
      iconName: meta?.iconName ?? inferIcon(childUrl),
      children: grandChildren,
    });
  }

  // Stable sort: alphabetical by path
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

function emit(tree: RouteNode[]): string {
  const banner = `/**
 * AUTO-GENERATED by scripts/generate-route-manifest.ts
 * Run: npm run gen:routes
 *
 * Do NOT edit by hand. Adding/removing/renaming a page.tsx anywhere under
 * app/(routes) will change this file; commit the change with your PR.
 *
 * Consumed by components/navigation/auto-tab-nav.tsx — every entry here
 * becomes a candidate tab in the in-page nav, automatically.
 */
`;
  const body = `export interface RouteNode {
  path: string;
  label: string;
  iconName: string;
  children: RouteNode[];
}

export const ROUTE_MANIFEST: RouteNode[] = ${JSON.stringify(tree, null, 2)};
`;
  return banner + '\n' + body;
}

function main() {
  if (!fs.existsSync(ROUTES_DIR)) {
    console.error(`Routes dir not found: ${ROUTES_DIR}`);
    process.exit(1);
  }
  const tree = walk(ROUTES_DIR, '');
  const out = emit(tree);
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

  const previous = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : '';
  if (previous === out) {
    console.log(`✓ Route manifest unchanged (${countNodes(tree)} pages)`);
    return;
  }
  fs.writeFileSync(OUT_PATH, out, 'utf8');
  console.log(
    `✓ Wrote route manifest: ${countNodes(tree)} pages → ${path.relative(
      process.cwd(),
      OUT_PATH
    )}`
  );
}

function countNodes(nodes: RouteNode[]): number {
  return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children), 0);
}

main();
