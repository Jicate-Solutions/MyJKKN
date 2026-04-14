import type { AccessType, ParsedExpression } from '@/lib/utils/rls-expression-parser';

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
