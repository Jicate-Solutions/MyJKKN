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
  'Improvement Board': 'improvement', // display name 'Improvement Board' → 'improvement' category key
  // Social Media catalog landed 2026-06-11 (`social.*` keys in
  // lib/constants/permissions.ts). All seven social/Meta surface modules
  // roll up into the single 'social' category.
  Instagram: 'social',
  'Social Facebook': 'social',
  'Social Lead Ads': 'social',
  'Social Messenger': 'social',
  'Social Ads': 'social',
  'Integrations Meta Pixel': 'social',
  'Integrations Meta Audiences': 'social',
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
  // AI Pulse re-glue (post-#728 revert): module exists at the route layer
  // (/ai-pulse landing page) but the substrate tables ship in PR #747+.
  // CATEGORY_ONLY_MODULES until then.
  ['AI Pulse', 'system'],
  // Global Calendar module (Phases 1-5, merged 2026-06-23): has the 'calendar'
  // PERMISSION_CATEGORIES entry + sidebar routes but no tables in
  // table-module-map, so it's category-only like Documents/AI Pulse above.
  ['Calendar', 'calendar'],
  // Feedback dashboard (/feedback, 2026-06-26): reads the universal feedback
  // spine (feedback_events). Has the 'feedback' PERMISSION_CATEGORIES entry +
  // sidebar route but no tables in table-module-map, so it's category-only.
  ['Feedback', 'feedback'],
  // Foundation & Competitive-Exam Programme (2026-07-06): has the 'foundation'
  // PERMISSION_CATEGORIES entry + sidebar route; fp_* tables not yet in
  // table-module-map, so it's category-only like Calendar/Feedback above.
  ['Foundation Programme', 'foundation'],
  // Centralized Procurement (2026-07): has the 'procurement' PERMISSION_CATEGORIES
  // entry + sidebar routes; procurement_* tables aren't in table-module-map, so
  // it's category-only like the entries above.
  ['Procurement', 'procurement'],
  // Director's Desk (2026-08-05, specs/director-desk/SPEC.md): has the 'director'
  // PERMISSION_CATEGORIES entry + the /director-desk and /my-desk routes;
  // director_handovers / director_handover_audit are not in table-module-map, so
  // it's category-only like the entries above.
  ["Director's Desk", 'director'],
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
  // Reference / Masters hub (registry-driven catalogs, 2026-07-11)
  ['/reference', 'Reference'],
  // Projects module (menu-visibility gap fix 2026-07-12 — first
  // MENU_PERMISSIONS entry for /projects needed a module mapping too)
  ['/projects', 'Projects'],
  // Campus Walk writes project_tasks under CAMPUS-OPS, so it rolls up into the
  // existing Projects module rather than introducing a new canonical module.
  ['/campus-walk', 'Projects'],
  // My Kit — store-kit self view (PR-K2 2026-07-12); module home is IMS
  ['/my-kit', 'IMS'],
  // /admin/* — sub-prefixes first
  ['/admin/bug-reports', 'Bug Reports'],
  // /admin/notifications relocated to /notifications/admin (2026-06-11
  // admin-cluster relocation wave-2) — no broader '/notifications' base
  // mapping exists, so the override is rewritten rather than dropped.
  ['/notifications/admin', 'Notifications'],
  // /admin/lifecycle relocated to /learners/lifecycle (2026-06-11 admin-cluster
  // relocation wave-2) — sub-prefix kept BEFORE the broader ['/learners', ...]
  // mapping below so the dashboard keeps its own module identity.
  ['/learners/lifecycle', 'Lifecycle Analytics'],
  ['/admin/lti', 'System'],
  ['/pde/admin', 'PDE Learning'],
  // /pde/* catch-all — covers /pde/faculty/* and /pde/learn/* (the case-based
  // learning surfaces). Must come after the more-specific /pde/admin above so
  // the linear scan keeps that explicit mapping; both roll up to PDE Learning.
  ['/pde', 'PDE Learning'],
  ['/admin/page-metadata', 'System'],
  ['/admin/saml', 'System'],
  // /admin/ai-query-tools relocated to /ai-query/admin (2026-06-11 admin-cluster
  // relocation wave-2) — covered by the base ['/ai-query', 'System'] mapping
  // below; override dropped.
  ['/admin/reset-driver-passwords', 'System'],
  // Teaching-enterprise cohort config. Lives under /admin (super-admin URL
  // space) but belongs to the Improvement Board module — it is gated by
  // improvement.board.manage and edits that module's participant layer. Must
  // stay ABOVE the '/admin' catch-all so the longest-prefix scan picks it.
  ['/admin/teaching-cohorts', 'Improvement Board'],
  // /admin/hr relocated to /hr/admin (2026-06-10 admin-cluster relocation) —
  // covered by the base ['/hr', 'Staff'] mapping below; override dropped.
  // Meta surface modules (catalog consolidation 2026-05-30, κ).
  // /admission/social/* — sub-prefixes BEFORE the /admission catch-all below.
  ['/admission/social/facebook', 'Social Facebook'], // β PR #1150
  ['/admission/social/lead-ads', 'Social Lead Ads'], // γ PR #1154
  ['/admission/social/ads', 'Social Ads'], // ζ PR #1152
  // Meta integrations — relocated /admin/integrations/* → /admission/social/*
  // (2026-06-11 admin-cluster relocation wave-2). Sub-prefixes BEFORE the
  // /admission catch-all below.
  ['/admission/social/meta-pixel', 'Integrations Meta Pixel'], // ε PR #1151
  ['/admission/social/meta-audiences', 'Integrations Meta Audiences'], // η PR #1155
  ['/admin', 'System'], // catch-all for any future /admin/*

  // Module-prefixed sidebar entries (sorted longest-first to be safe).
  ['/application-hub', 'Applications'],
  ['/applications', 'Applications'],
  ['/learners-council', 'Privileges'],
  ['/resource-management', 'Resources'],
  ['/service-requests', 'Service Requests'],
  ['/startup-studio', 'Startup Studio'],
  ['/campus-living', 'Campus Living'],
  ['/procurement', 'Procurement'], // Centralized Procurement (procurement.* perms)
  ['/accreditation', 'System'],
  ['/audit-trail', 'System'],
  // Clinical internships module (super_admin-gated "Internship Module" sidebar
  // group: cycles, sites/hospitals, preceptors, vehicles). No dedicated
  // permission catalog or table-module entry yet, so it rolls up to System like
  // /accreditation and /bos. Distinct from /cdc/internships (CDC career
  // placements, gated by cdc.internships.*) — different first URL segment, so
  // this prefix can't swallow it.
  ['/internships', 'System'],
  ['/work-pulse', 'Work Pulse'],
  ['/ai-pulse', 'AI Pulse'],
  ['/my-bug-reports', 'Bug Reports'],
  ['/bug-leaderboard', 'Bug Reports'],
  // /admission/inbox/* — sub-prefixes BEFORE /admission catch-all (κ 2026-05-30).
  ['/admission/inbox/messenger', 'Social Messenger'], // δ PR #1149
  ['/admission/inbox/instagram', 'Instagram'], // ι PR #1153 — shares ig_* substrate with /social/instagram
  ['/admission', 'Admission'],
  ['/organizations', 'Organization'],
  ['/documents', 'Documents'],
  ['/solutions', 'System'],
  ['/learners', 'Learners'],
  ['/moments', 'Learners'], // Family Moments — parent engagement (Father's Day 2026)
  ['/my-proof', 'Learners'], // Verified Skills Record — learner self view (learners.proof.view)
  ['/academic', 'Academic'],
  ['/foundation', 'Foundation Programme'], // Foundation & Competitive-Exam Programme (foundation.* perms)
  ['/improvement-board', 'Improvement Board'], // MBA teaching-enterprise (improvement.* + ceo_rounds.* perms)
  ['/ceo-rounds', 'Improvement Board'], // MBA teaching-enterprise — CEO Rounds log (ceo_rounds.* perms)
  // Director's Desk — the two halves of one feature (director.handover.* perms).
  // /my-desk is the receiving side and is mapped to view_profile in
  // MENU_PERMISSIONS, but it still belongs to this module for audit purposes.
  ['/director-desk', "Director's Desk"],
  ['/my-desk', "Director's Desk"],
  ['/rcltp', 'Academic'], // MyJKKN RCLTP reading-assessment module (rcltp.* perms)
  ['/faculty', 'Academic'],
  ['/billing', 'Billing'],
  // Global Calendar module (/calendar, /calendar/holidays, /calendar/settings) —
  // gated by calendar.* perms. Single prefix covers all three via longest-match.
  ['/calendar', 'Calendar'],
  ['/feedback', 'Feedback'], // Feedback spine dashboard (feedback.view); category-only module
  ['/health', 'Health'],
  ['/ims', 'IMS'],
  ['/events', 'Events'],
  ['/courses', 'Courses'],
  ['/audit', 'System'],
  ['/staff', 'Staff'],
  ['/users', 'Users'],
  ['/system', 'System'],
  ['/learn', 'PDE Learning'],
  ['/meetings', 'System'], // jicate-booking inbox; Overview-group sidebar entry per PR #655
  ['/profile', 'Users'],
  // What's New — the product changelog. Open to everyone signed in
  // (view_profile sentinel); it scopes its own content by role.
  ['/whats-new', 'System'],
  ['/okr', 'Work Pulse'],
  ['/vac', 'VAC'],
  ['/bos', 'System'],
  ['/cdc', 'CDC'], // Career Development Centre — drives, placements, internships, idp, clubs, mentors, training, bulletin, exports, industry-mentors
  // Industry Partners directory (public.industry_partners — the COMPANIES,
  // distinct from /cdc/industry-mentors which reads industry_mentors). The
  // route is top-level rather than under /cdc, but the module is CDC-owned and
  // its permission key is cdc.industry_partners.view — so it rolls up to CDC.
  ['/industry-partners', 'CDC'],
  ['/internships', 'Internship'], // Internship Module — operational cycles/sites/preceptors/vehicles routes (PR #1209)
  // Instagram monitoring substrate (Phase 1B, 2026-05-30): /social/instagram/*
  // sub-routes (accounts, posts, audits, dormant queue, alerts) all roll up
  // into the Instagram module. Listed before broader prefixes to be safe.
  ['/social/instagram', 'Instagram'],
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
  // 'Instagram' + the six Meta surface modules (PRs #1149–#1155) — removed
  // 2026-06-11. The Social Media catalog (`social.*` keys) landed in
  // lib/constants/permissions.ts; all seven map to the 'social' category
  // via MODULE_CATEGORY_OVERRIDES above.
  // 'CDC' — removed 2026-05-21. CDC permission catalog now lives in
  // lib/constants/permissions.ts (cdc.* keys for 10 sub-modules). Audit
  // dashboard should report against those keys instead of em-dashing the row.
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
