import type { ParsedExpression } from '@/lib/utils/rls-expression-parser';

// ── RLS Policy Types ──

export interface RlsPolicy {
  tableName: string;
  policyName: string;
  command: string; // SELECT, INSERT, UPDATE, DELETE, ALL
  usingExpression: string | null;
  withCheckExpression: string | null;
  parsed: ParsedExpression;
  module: string;
  subModule: string;
}

// ── Unified Access Types ──

export interface CrudAccess {
  create: boolean | null;
  read: boolean | null;
  update: boolean | null;
  delete: boolean | null;
}

export interface TableAccess {
  tableName: string;
  crud: CrudAccess;
  policies: RlsPolicy[];
  deterministic: boolean; // Whether access could be fully determined
}

export interface RouteAccess {
  route: string;
  requiredPermission: string;
  hasPermission: boolean;
}

export interface ModuleAccess {
  moduleName: string;
  codePermissions: CrudAccess;
  codePermissionDetails: { key: string; granted: boolean }[];
  tableAccess: TableAccess[];
  routeAccess: RouteAccess[];
  conflicts: ConflictItem[];
  isConsistent: boolean;
  /**
   * `true` when this module has a corresponding entry in
   * `PERMISSION_CATEGORIES` and we can therefore enumerate per-CRUD code
   * permissions. `false` when the module is known to lack a permission
   * catalog yet (e.g. Chatbot, Expo, Marathon) — UI should render an
   * explicit em-dash with hover hint, not a gray "indeterminate" badge.
   */
  hasCategory: boolean;
}

export interface ConflictItem {
  type:
    | 'code_grants_rls_blocks'
    | 'rls_grants_code_blocks'
    | 'no_rls_policy'
    | 'nav_without_code'
    | 'code_without_nav';
  description: string;
  module: string;
  target: string; // Affected permission key or table name
  severity: 'warning' | 'error' | 'info';
}

// ── API Responses ──

export interface UnifiedAccessResponse {
  role: {
    roleKey: string;
    roleName: string;
    userCount: number;
    isSystem: boolean;
  };
  modules: ModuleAccess[];
  totalConflicts: number;
  computedAt: string;
}

export interface ModuleRoleMatrix {
  moduleName: string;
  roles: {
    roleKey: string;
    roleName: string;
    userCount: number;
    codePermissions: CrudAccess;
    dbAccess: CrudAccess;
    navRouteCount: number;
    conflictCount: number;
  }[];
}

export interface RlsAuditResponse {
  tables: {
    tableName: string;
    module: string;
    subModule: string;
    policies: RlsPolicy[];
    missingOperations: string[];
    hasRls: boolean;
  }[];
  stats: {
    totalTables: number;
    totalPolicies: number;
    totalModules: number;
    unmappedTables: number;
    tablesWithoutPolicies: number;
  };
}

// ── Export Types ──

export interface ExportRequest {
  reportType:
    | 'full_matrix'
    | 'conflicts'
    | 'role_summary'
    | 'module_summary'
    | 'rls_coverage';
  format: 'excel' | 'json';
  roleKey?: string;
  moduleName?: string;
}

// ── Simulation Types ──

export interface SimulationChange {
  permissionKey: string;
  newValue: boolean;
}

export interface SimulationResult {
  roleKey: string;
  changes: SimulationChange[];
  affectedModules: {
    moduleName: string;
    currentCrud: CrudAccess;
    simulatedCrud: CrudAccess;
    newConflicts: ConflictItem[];
    resolvedConflicts: ConflictItem[];
    tableChanges: {
      tableName: string;
      operation: string;
      currentAccess: boolean | null;
      simulatedAccess: boolean | null;
    }[];
    routeChanges: {
      route: string;
      currentVisible: boolean;
      simulatedVisible: boolean;
    }[];
  }[];
  verdict: {
    status: 'safe' | 'warning' | 'danger';
    message: string;
  };
}

// ── Page Access Lens Types ─────────────────────────────────────────────────
//
// The "Module → Roles" tab answers "which roles hold permission key X". These
// types back the second question an auditor actually asks: "which SCREENS can
// a role open, and what can it do on them" — page → tabs → table actions.
//
// The data has two halves, and keeping them apart is the whole design:
//
//   1. A STATIC half — lib/permissions-audit/page-access-map.generated.ts,
//      written at build time by scripts/generate-page-access-map.ts. It records
//      what the CODE says gates each surface, and nothing about any role.
//      It stores REFERENCES, never derivable copies: a tab knows its href, not
//      a duplicate of that href's gate; a gate hook knows its name, not the
//      curated prose about it. Copying either in made the committed artefact
//      4.5 MB on the first cut, and would have let it drift from its sources.
//   2. A LIVE half — app/api/users/permissions-audit/page-access/route.ts,
//      which resolves those references (routeMatcher, NON_KEY_GATES) and then
//      answers the role question against custom_roles.permissions.

/**
 * Where a page's required permission came from.
 *
 * 'direct'    — the URL has its own MENU_PERMISSIONS entry.
 * 'inherited' — no own entry; routeMatcher's longest-prefix walk found an
 *               ancestor's. 619 of 1530 pages are in this state, and they are
 *               genuinely gated — omitting them would under-report access.
 * 'ungated'   — neither. The page opens for any authenticated user. That is a
 *               finding, so it is rendered, not filtered out.
 */
export type GateSource = 'direct' | 'inherited' | 'ungated';

/**
 * Which UI surface a permission-gated control sits on. Derived from the
 * declaring file's name, because this codebase names those files by
 * convention (`row-actions.tsx`, `columns.tsx`, `*-data-table.tsx`) far more
 * reliably than any heuristic could infer intent from the JSX.
 */
export type ControlSurface =
  | 'page'
  | 'tab-bar'
  | 'row-action'
  | 'column'
  | 'toolbar'
  | 'component';

export interface PageGate {
  /** The permission key, or null when the route is ungated. */
  permission: string | null;
  source: GateSource;
  /** The MENU_PERMISSIONS entry that won the longest-prefix match. */
  matchedPath: string | null;
  /**
   * True when `permission` is one of the MENU_PERMISSIONS values that is NOT a
   * grantable key ('super_admin', 'view_dashboard', 'view_profile'). See
   * isSentinelPermission() in lib/navigation/permission-filter.ts.
   */
  isSentinel: boolean;
  /**
   * True when an ancestor layout.tsx wraps this subtree in
   * <RoutePermissionGuard>. Only 28 subtrees do. Everywhere else the
   * permission hides the sidebar link but does NOT stop someone typing the
   * URL — which is exactly the leak RoutePermissionGuard was written to close.
   */
  enforcedByLayout: boolean;
}

// ── Stored shapes (what the generated map actually contains) ───────────────

/**
 * A reference to a gate the extractor could name but not evaluate — a hook
 * wrapping an RPC, a membership lookup. Deliberately just the name and where
 * it was seen: the meaning lives in lib/permissions-audit/non-key-gates.ts and
 * is joined on at request time, so editing that curated file takes effect
 * without regenerating the map.
 */
export interface GateHookRef {
  hook: string;
  /** Repo-relative path of the file that referenced it. */
  file: string;
}

export interface StoredPageTab {
  label: string;
  /**
   * 'route'   — the tab is a real URL (this app prefers link-based tabs so
   *             views stay deep-linkable and nav-reachable). Its gate is
   *             resolved from `href` at request time, never stored.
   * 'in-page' — a Radix <TabsTrigger>; it has no route of its own and is
   *             usually visible to anyone who can open the page.
   */
  kind: 'route' | 'in-page';
  href?: string;
  value?: string;
  gateHook: GateHookRef | null;
}

export interface StoredPageAction {
  /** view | create | edit | update | delete | approve | export | manage | … */
  verb: string;
  permissionKey: string;
  surface: ControlSurface;
  /** Provenance — the file that declared this gate, repo-relative. */
  file: string;
}

export interface PageAccessEntry {
  url: string;
  label: string;
  /**
   * Permission-key module (first dot-segment of the resolved key) — the SAME
   * namespace the Module → Roles picker groups by, so a page lands under the
   * module an auditor selected.
   */
  moduleKey: string;
  gate: PageGate;
  tabs: StoredPageTab[];
  actions: StoredPageAction[];
  /**
   * Gate hooks found on this page that could not be tied to one specific tab
   * or action. They still gate something, so they are reported at page level
   * rather than dropped.
   */
  gateHooks: GateHookRef[];
  /**
   * Gate expressions the extractor could not reduce to a key, verbatim
   * (e.g. `canAccess(module, action)`). Surfaced so the tree is honest about
   * its blind spots instead of silently under-reporting.
   */
  unresolvedGates: string[];
}

/** Shape of lib/permissions-audit/page-access-map.generated.ts. */
export interface PageAccessMap {
  generatedAt: string;
  /**
   * URL prefixes whose layout.tsx wraps the subtree in <RoutePermissionGuard>.
   * Stored so the API can compute `enforcedByLayout` for a tab's href without
   * touching the filesystem, which it cannot do at runtime.
   */
  guardedPrefixes: string[];
  pages: PageAccessEntry[];
}

// ── Resolved shapes (what the API returns) ─────────────────────────────────

/** A gate hook with the curated meaning joined on. */
export interface NonKeyGate extends GateHookRef {
  /**
   * The permission key this gate provably resolves to, or null when it is
   * per-record / config-driven and has no single role answer. Never guessed —
   * see lib/permissions-audit/non-key-gates.ts.
   */
  mirrors: string | null;
  note: string;
}

/** A role resolved as having access to one page / tab / action. */
export interface ResolvedRole {
  roleKey: string;
  roleName: string;
  userCount: number;
  /**
   * Super admins bypass every per-permission flag via is_super_admin(), so
   * they are listed regardless of what custom_roles.permissions contains.
   */
  alwaysGrants?: boolean;
  /**
   * True when the role was resolved through a NonKeyGate's `mirrors` key
   * rather than from the gate itself — the UI must show this as derived.
   */
  derived?: boolean;
}

export interface ResolvedPageTab extends Omit<StoredPageTab, 'gateHook'> {
  /** Resolved from `href` for route tabs; null for in-page tabs. */
  gate: PageGate | null;
  nonKeyGate: NonKeyGate | null;
  roles: ResolvedRole[];
  /**
   * True when nothing gates this tab beyond the page itself — anyone who can
   * open the page sees it. Stated explicitly so the UI never implies a gate
   * that does not exist.
   */
  inheritsPageAccess: boolean;
}

export interface ResolvedPageAction extends StoredPageAction {
  roles: ResolvedRole[];
}

export interface ResolvedPageAccess
  extends Omit<PageAccessEntry, 'tabs' | 'actions' | 'gateHooks'> {
  roles: ResolvedRole[];
  totalUsers: number;
  tabs: ResolvedPageTab[];
  actions: ResolvedPageAction[];
  nonKeyGates: NonKeyGate[];
}

export interface PageAccessResponse {
  moduleKey: string;
  moduleLabel: string;
  pages: ResolvedPageAccess[];
  /** Every role in the system, so the UI can render counts without a 2nd call. */
  roleMeta: Record<string, { name: string; userCount: number; isSystem: boolean }>;
  /** When the static map was generated (not when this response was computed). */
  generatedAt: string;
  computedAt: string;
}
