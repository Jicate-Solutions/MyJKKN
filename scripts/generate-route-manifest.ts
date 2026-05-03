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
 *
 * Order matters — the first match wins. Put more specific patterns before
 * more generic ones (e.g. `/data-quality` before `/quality`).
 */
function inferIcon(urlPath: string): string {
  // ─── Specific dashboard / overview patterns ──────────────────────────
  if (urlPath.endsWith('/dashboard') || urlPath.endsWith('/group-dashboard')) return 'LayoutGrid';
  if (urlPath.endsWith('/overview')) return 'LayoutDashboard';
  if (urlPath.endsWith('/analytics') || urlPath.endsWith('/analytics-dashboard')) return 'BarChart';
  if (urlPath.endsWith('/insights')) return 'Lightbulb';
  if (urlPath.endsWith('/leaderboard')) return 'Trophy';

  // ─── Configuration / settings ────────────────────────────────────────
  if (urlPath.endsWith('/settings') || urlPath.endsWith('/manage')) return 'Settings';
  if (urlPath.endsWith('/parameters')) return 'Sliders';
  if (urlPath.endsWith('/policies')) return 'BookText';
  if (urlPath.endsWith('/regulations')) return 'Scale';

  // ─── Create / list / search actions ─────────────────────────────────
  if (urlPath.endsWith('/new') || urlPath.includes('/create')) return 'Plus';
  if (urlPath.endsWith('/list') || urlPath.endsWith('/all')) return 'List';
  if (urlPath.includes('/search') || urlPath.includes('/discovery')) return 'Search';
  if (urlPath.includes('/findings')) return 'Search';

  // ─── Reports & data quality ─────────────────────────────────────────
  if (urlPath.includes('/data-quality')) return 'CheckCircle2';
  if (urlPath.includes('/reports')) return 'FileBarChart';
  if (urlPath.includes('/audit-trail') || urlPath.includes('/activity')) return 'History';

  // ─── Time / calendar ─────────────────────────────────────────────────
  if (urlPath.includes('/calendar')) return 'Calendar';
  if (urlPath.includes('/timetables') || urlPath.includes('/timetable')) return 'CalendarClock';
  if (urlPath.includes('/schedule')) return 'CalendarClock';
  if (urlPath.includes('/availability')) return 'CalendarCheck';
  if (urlPath.includes('/semesters')) return 'CalendarDays';
  if (urlPath.endsWith('/years')) return 'CalendarRange';
  if (urlPath.endsWith('/periods')) return 'Clock';
  if (urlPath.includes('/cycles')) return 'RotateCw';

  // ─── People / roles ─────────────────────────────────────────────────
  if (urlPath.includes('/counselors') || urlPath.includes('/consultants')) return 'Users';
  if (urlPath.includes('/mentors') || urlPath.includes('/experts')) return 'UserCheck';
  if (urlPath.includes('/auditors')) return 'UserSearch';
  if (urlPath.includes('/staff') || urlPath.includes('/employees')) return 'Users';
  if (urlPath.includes('/learners') || urlPath.includes('/students')) return 'GraduationCap';
  if (urlPath.includes('/alumni')) return 'GraduationCap';
  if (urlPath.includes('/recruitment')) return 'UserSearch';
  if (urlPath.includes('/team')) return 'Users';
  if (urlPath.includes('/users') || urlPath.includes('/members')) return 'Users';
  if (urlPath.includes('/community')) return 'Users2';
  if (urlPath.includes('/profile')) return 'UserCircle';
  if (urlPath.includes('/visitors')) return 'UserCog';
  if (urlPath.includes('/residents')) return 'BedDouble';
  if (urlPath.includes('/onboarding')) return 'UserPlus';
  if (urlPath.includes('/leads') || urlPath.includes('/enquiries')) return 'UserPlus';

  // ─── Messages / notifications ────────────────────────────────────────
  if (urlPath.includes('/inbox')) return 'Inbox';
  if (urlPath.includes('/messages') || urlPath.includes('/chat')) return 'MessageSquare';
  if (urlPath.includes('/notifications')) return 'Bell';
  if (urlPath.includes('/communication')) return 'MessageCircle';
  if (urlPath.includes('/feedback')) return 'MessageCircle';
  if (urlPath.includes('/marketing')) return 'Megaphone';
  if (urlPath.includes('/gd-pi')) return 'MessagesSquare';

  // ─── Money / billing ────────────────────────────────────────────────
  if (urlPath.includes('/payment') || urlPath.includes('/billing')) return 'Wallet';
  if (urlPath.includes('/invoices') || urlPath.includes('/receipts')) return 'Receipt';
  if (urlPath.includes('/refunds')) return 'Undo2';
  if (urlPath.includes('/discounts')) return 'Tag';
  if (urlPath.includes('/finance') || urlPath.includes('/earnings')) return 'DollarSign';
  if (urlPath.includes('/ta-da')) return 'DollarSign';

  // ─── Academic ────────────────────────────────────────────────────────
  if (urlPath.includes('/applications')) return 'ClipboardList';
  if (urlPath.includes('/admission')) return 'GraduationCap';
  if (urlPath.includes('/programs')) return 'BookOpen';
  if (urlPath.includes('/courses')) return 'BookOpen';
  if (urlPath.includes('/batches')) return 'Boxes';
  if (urlPath.includes('/sections')) return 'LayoutGrid';
  if (urlPath.includes('/departments')) return 'Building2';
  if (urlPath.includes('/institutions')) return 'Building';
  if (urlPath.includes('/degrees')) return 'GraduationCap';
  if (urlPath.includes('/attendance')) return 'CheckSquare';
  if (urlPath.includes('/leave')) return 'CalendarOff';
  if (urlPath.includes('/grades') || urlPath.includes('/marks')) return 'Award';
  if (urlPath.includes('/exams')) return 'FileQuestion';
  if (urlPath.includes('/internal-marks')) return 'Star';
  if (urlPath.includes('/privileges')) return 'KeyRound';
  if (urlPath.includes('/regulations')) return 'Scale';

  // ─── Roles / permissions / governance ───────────────────────────────
  if (urlPath.includes('/roles') || urlPath.includes('/role-management')) return 'Shield';
  if (urlPath.includes('/permissions')) return 'KeyRound';
  if (urlPath.includes('/governance')) return 'Building';
  if (urlPath.includes('/compositions')) return 'Layers';

  // ─── Health / wellness / sports ──────────────────────────────────────
  if (urlPath.includes('/health')) return 'Heart';
  if (urlPath.includes('/wellness')) return 'HeartPulse';
  if (urlPath.includes('/safety')) return 'ShieldAlert';
  if (urlPath.includes('/fitness')) return 'Dumbbell';
  if (urlPath.includes('/sports')) return 'Volleyball';
  if (urlPath.includes('/training')) return 'Dumbbell';
  if (urlPath.includes('/achievements')) return 'Award';
  if (urlPath.includes('/assessments')) return 'ClipboardCheck';

  // ─── Hostel / facilities ─────────────────────────────────────────────
  if (urlPath.includes('/hostel') || urlPath.includes('/blocks')) return 'Building';
  if (urlPath.includes('/allocations')) return 'PackageCheck';
  if (urlPath.includes('/mess')) return 'Utensils';
  if (urlPath.includes('/laundry')) return 'Shirt';
  if (urlPath.includes('/housekeeping')) return 'SprayCan';
  if (urlPath.includes('/maintenance')) return 'Wrench';
  if (urlPath.includes('/gate-passes')) return 'Ticket';
  if (urlPath.includes('/vacate')) return 'LogOut';
  if (urlPath.includes('/resources') || urlPath.includes('/reservations')) return 'Boxes';

  // ─── Innovation / build / capabilities ──────────────────────────────
  if (urlPath.includes('/innovation')) return 'Lightbulb';
  if (urlPath.includes('/quests')) return 'Trophy';
  if (urlPath.includes('/channels')) return 'Tv';
  if (urlPath.includes('/build')) return 'Hammer';
  if (urlPath.includes('/capabilities')) return 'Cpu';
  if (urlPath.includes('/portfolio')) return 'Briefcase';
  if (urlPath.includes('/objectives')) return 'Target';
  if (urlPath.includes('/check-in')) return 'CheckCircle';
  if (urlPath.includes('/cascade')) return 'Network';
  if (urlPath.includes('/organization')) return 'Building2';

  // ─── Events ──────────────────────────────────────────────────────────
  if (urlPath.includes('/events')) return 'CalendarHeart';

  // ─── Tags / categorization ──────────────────────────────────────────
  if (urlPath.includes('/categories') || urlPath.includes('/category')) return 'Tags';

  // ─── Tech / API ──────────────────────────────────────────────────────
  if (urlPath.includes('/api-management') || urlPath.includes('/api-guidelines')) return 'Code2';
  if (urlPath.includes('/lti')) return 'PlugZap';
  if (urlPath.includes('/saml')) return 'KeyRound';
  if (urlPath.includes('/audit')) return 'ClipboardCheck';

  // ─── Generic fallback ────────────────────────────────────────────────
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
