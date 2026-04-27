/**
 * Permissions Audit — module mappings (canonical, derivation-first).
 *
 * Replaces two hardcoded constants that had drifted from the rest of the
 * codebase (caught 2026-04-27, brief from session continuation):
 *
 *   1. `MODULE_TO_CATEGORY_KEY` had 16 entries but `getAllModuleNames()`
 *      returns 24+. Result: 8+ modules rendered as gray "indeterminate"
 *      CRUD badges in the User Resolver tab for ALL roles, masking the
 *      real CEO/zero-permission cohort that was the actual target.
 *
 *   2. `ROUTE_PREFIX_TO_MODULE` had 19 prefixes, but MENU_PERMISSIONS has
 *      535 routes spanning 41 distinct top-level prefixes. Result: 238
 *      routes (44%) fell through to `null`, so 10 modules — Campus Living,
 *      Startup Studio, Solutions, HR, OKR, Accreditation, Audit, Faculty,
 *      Health, Learn, BoS — showed "0/0 routes" or no route line at all.
 *
 * Derivation rules:
 *   - MODULE_TO_CATEGORY_KEY: lowercase + space→underscore the module name,
 *     match against `PERMISSION_CATEGORIES.key`. If no match, fall through
 *     to MODULE_CATEGORY_OVERRIDES (preserves manual entries the previous
 *     code shipped, e.g. Bug Reports → 'system', Privileges → 'academic',
 *     Lifecycle Analytics → 'admin'). If still no match, the API surfaces
 *     a "no permission category defined" hint so the UI can render an
 *     explicit em-dash badge instead of gray nulls.
 *
 *   - ROUTE_PREFIX_TO_MODULE: hand-curated to cover every top-level URL
 *     space found by `git grep "'/[a-z]" lib/sidebarMenuLink.ts | sort -u`.
 *     Longer prefixes come first so the linear scan picks the most-specific
 *     match. The CI gate at scripts/check-permission-audit-coverage.ts will
 *     fail if a future MENU_PERMISSIONS entry lands without a matching
 *     prefix (or excluded explicitly via ROUTE_EXCLUDE).
 */

import { PERMISSION_CATEGORIES } from '@/lib/constants/permissions';
import { getAllModuleNames } from '@/lib/constants/table-module-map';

// ── 1. Module display name → PERMISSION_CATEGORIES.key ─────────────────────

/**
 * Manual overrides for modules whose display name doesn't snake_case-match
 * a permission category. Preserved verbatim from the original 16-entry
 * map so we don't regress existing behaviour.
 */
const MODULE_CATEGORY_OVERRIDES: Record<string, string> = {
  Organization: 'organizations',
  'Service Requests': 'service_requests',
  'Bug Reports': 'system',
  Privileges: 'academic',
  'Lifecycle Analytics': 'admin',
  'PDE Learning': 'pde',
};

const PERMISSION_CATEGORY_KEYS = new Set(PERMISSION_CATEGORIES.map((c) => c.key));

/** Module display name → canonical permission-category key (or undefined). */
function deriveCategoryKey(moduleName: string): string | undefined {
  if (MODULE_CATEGORY_OVERRIDES[moduleName]) {
    return MODULE_CATEGORY_OVERRIDES[moduleName];
  }
  const normalized = moduleName.toLowerCase().replace(/\s+/g, '_');
  if (PERMISSION_CATEGORY_KEYS.has(normalized)) return normalized;
  return undefined;
}

/**
 * Modules that exist as PERMISSION_CATEGORIES + sidebar routes BUT do not
 * have any tables (so they don't appear in `getAllModuleNames()`). The
 * unified API loop iterates `getAllModuleNames() ∪ CATEGORY_ONLY_MODULES`
 * so these still show up in the User Resolver Module Access Summary.
 */
export const CATEGORY_ONLY_MODULES: ReadonlyArray<readonly [string, string]> = [
  ['Documents', 'documents'],
];

/**
 * Pre-built map of every module name returned by getAllModuleNames() PLUS
 * every CATEGORY_ONLY_MODULES display name. Modules with no resolvable
 * category map to `undefined`, which the API treats as "render an explicit
 * no-category indicator" rather than gray-null.
 */
export const MODULE_TO_CATEGORY_KEY: Record<string, string | undefined> =
  Object.freeze({
    ...Object.fromEntries(
      getAllModuleNames().map((m) => [m, deriveCategoryKey(m)] as const),
    ),
    ...Object.fromEntries(CATEGORY_ONLY_MODULES.map(([m, c]) => [m, c])),
  });

/**
 * Combined module list that the unified API should iterate over.
 */
export function getAllAuditModuleNames(): string[] {
  const set = new Set(getAllModuleNames());
  for (const [m] of CATEGORY_ONLY_MODULES) set.add(m);
  return Array.from(set).sort();
}

// ── 2. Route prefix → module display name ─────────────────────────────────

/**
 * Order matters: the linear scan in `getModuleForRoute` returns the first
 * prefix that the route `startsWith()`. More-specific prefixes (e.g.
 * `/admin/bug-reports`) MUST come before broader ones (e.g. `/admin`).
 */
export const ROUTE_PREFIX_TO_MODULE: ReadonlyArray<readonly [string, string]> = [
  // /admin/* — sub-prefixes first
  ['/admin/bug-reports', 'Bug Reports'],
  ['/admin/notifications', 'Notifications'],
  ['/admin/lifecycle', 'Lifecycle Analytics'],
  ['/admin/lti', 'System'],
  ['/admin/pde', 'PDE Learning'],
  ['/admin/page-metadata', 'System'],
  ['/admin/saml', 'System'],
  ['/admin/ai-query-tools', 'System'],
  ['/admin/reset-driver-passwords', 'System'],
  ['/admin', 'System'], // catch-all for any future /admin/*

  // Module-prefixed sidebar entries (sorted longest-first to be safe).
  ['/application-hub', 'Applications'],
  ['/applications', 'Applications'],
  ['/learners-council', 'Privileges'],
  ['/resource-management', 'Resources'],
  ['/service-requests', 'Service Requests'],
  ['/startup-studio', 'Startup Studio'],
  ['/campus-living', 'Campus Living'],
  ['/accreditation', 'System'],
  ['/audit-trail', 'System'],
  ['/work-pulse', 'Work Pulse'],
  ['/my-bug-reports', 'Bug Reports'],
  ['/bug-leaderboard', 'Bug Reports'],
  ['/admission', 'Admission'],
  ['/organizations', 'Organization'],
  ['/documents', 'Documents'],
  ['/solutions', 'System'],
  ['/learners', 'Learners'],
  ['/academic', 'Academic'],
  ['/faculty', 'Academic'],
  ['/billing', 'Billing'],
  ['/health', 'Health'],
  ['/events', 'Events'],
  ['/audit', 'System'],
  ['/staff', 'Staff'],
  ['/users', 'Users'],
  ['/system', 'System'],
  ['/learn', 'PDE Learning'],
  ['/profile', 'Users'],
  ['/okr', 'Work Pulse'],
  ['/vac', 'VAC'],
  ['/bos', 'System'],
  ['/hr', 'Staff'],

  // Single-segment dashboards — keep last to avoid swallowing nested paths.
  ['/ai-query', 'System'],
];

/**
 * Routes that MUST NOT be assigned to any module. Currently just the home
 * dashboard (`/`), which is universal and not module-scoped.
 */
export const ROUTE_EXCLUDE = new Set<string>(['/']);

export function getModuleForRoute(route: string): string | null {
  if (ROUTE_EXCLUDE.has(route)) return null;
  for (const [prefix, mod] of ROUTE_PREFIX_TO_MODULE) {
    if (route === prefix || route.startsWith(prefix + '/') || route.startsWith(prefix + '?')) {
      return mod;
    }
  }
  return null;
}

// ── 3. Modules deliberately excluded from category mapping ────────────────

/**
 * Modules that exist in the table-module map (and therefore in
 * `getAllModuleNames()`) but have NO corresponding permission category yet.
 * These render as an em-dash badge in the UI rather than as a bug.
 *
 * Keep this list explicit so the CI gate doesn't have to second-guess —
 * any module added here must be re-evaluated when its permissions catalog
 * lands.
 */
export const MODULE_WITHOUT_CATEGORY = new Set<string>([
  'Chatbot', // chatbot tables exist; no permission catalog yet
  'Expo', // expo tables exist; no permission catalog yet
  'Marathon', // marathon tables exist; no permission catalog yet
]);

// ── 4. Permission-key module display helpers ─────────────────────────────
// Centralised so audit-tab UIs stop carrying duplicated `prettifyKey` +
// `moduleLabel` heuristics. The matrix API (`/api/users/permissions-audit/
// matrix/route.ts`) emits permission keys like `admission.leads.view`; the
// "module" each tab groups by is the first dot-segment (`admission`).
// These helpers turn that raw key into a human label, with PERMISSION_
// CATEGORIES as the canonical source and a safe Title-Case fallback for
// the ~56 of 88 data-discovered modules that aren't catalogued.

/**
 * Title-case a snake_case identifier for human display.
 * Examples: `solutions_hub` → "Solutions Hub", `view_dashboard` → "View
 * Dashboard", `physical_resources` → "Physical Resources".
 */
export function prettifyKey(key: string): string {
  return key
    .split('_')
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(' ');
}

/**
 * Display label for a permission-key module (the first dot-segment of a
 * permission key, e.g. `admission` extracted from `admission.leads.view`).
 *
 * Resolution order:
 *   1. PERMISSION_CATEGORIES.name when the key is catalogued (e.g.
 *      `admission` → "Admission Module", `users` → "User Management").
 *   2. prettifyKey() fallback for uncatalogued modules so the picker
 *      never renders raw `snake_case` to the user.
 *
 * This is the single source of truth used by every audit-page surface that
 * groups permission keys by module (Module → Roles tab, Permission Matrix
 * tab). Any future tab consuming the matrix endpoint should call this
 * instead of inventing its own labelling heuristic.
 */
export function getDisplayNameForModuleKey(moduleKey: string): string {
  const cat = PERMISSION_CATEGORIES.find((c) => c.key === moduleKey);
  return cat?.name ?? prettifyKey(moduleKey);
}
