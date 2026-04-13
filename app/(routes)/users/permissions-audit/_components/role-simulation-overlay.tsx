'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertCircle,
  ArrowRight,
  Check,
  FlaskConical,
  Search,
  X
} from 'lucide-react';
import type {
  UnifiedAccessResponse,
  CrudAccess,
  ConflictItem
} from '@/types/permissions-audit';
import { wouldPolicyGrantAccess } from '@/lib/utils/rls-expression-parser';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface RoleSimulationOverlayProps {
  unifiedData: UnifiedAccessResponse;
  rolePermissions: Record<string, boolean>;
  onClose: () => void;
}

interface AffectedModule {
  moduleName: string;
  currentCrud: CrudAccess;
  simulatedCrud: CrudAccess;
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
  newConflicts: ConflictItem[];
  resolvedConflicts: ConflictItem[];
}

type Verdict = 'safe' | 'warning' | 'danger';

// ─── Helpers ────────────────────────────────────────────────────────────────────

const CRUD_LABELS = ['create', 'read', 'update', 'delete'] as const;

function crudEqual(a: CrudAccess, b: CrudAccess): boolean {
  return CRUD_LABELS.every((op) => a[op] === b[op]);
}

/** Build a merged permissions map with simulated overrides applied. */
function buildSimulatedPermissions(
  original: Record<string, boolean>,
  changes: Map<string, boolean>
): Record<string, boolean> {
  const merged = { ...original };
  changes.forEach((value, key) => {
    merged[key] = value;
  });
  return merged;
}

/** Derive CRUD access from a list of permission details and a permissions map. */
function deriveCrud(
  details: { key: string; granted: boolean }[],
  permissions: Record<string, boolean>
): CrudAccess {
  const crud: CrudAccess = { create: null, read: null, update: null, delete: null };

  for (const detail of details) {
    const granted = permissions[detail.key] ?? false;
    const lower = detail.key.toLowerCase();
    for (const op of CRUD_LABELS) {
      if (lower.includes(op) || (op === 'read' && lower.includes('view'))) {
        crud[op] = granted;
      }
    }
  }
  return crud;
}

// ─── CrudCell ───────────────────────────────────────────────────────────────────

function CrudCell({
  label,
  value,
  changed
}: {
  label: string;
  value: boolean | null;
  changed?: boolean;
}) {
  const bg =
    value === true
      ? changed
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
      : value === false
        ? changed
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
          : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
        : 'bg-muted text-muted-foreground';

  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${bg}`}>
      {label[0].toUpperCase()}
    </span>
  );
}

function CrudRow({
  crud,
  compareTo
}: {
  crud: CrudAccess;
  compareTo?: CrudAccess;
}) {
  return (
    <div className="flex gap-1">
      {CRUD_LABELS.map((op) => (
        <CrudCell
          key={op}
          label={op}
          value={crud[op]}
          changed={compareTo ? crud[op] !== compareTo[op] : false}
        />
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export function RoleSimulationOverlay({
  unifiedData,
  rolePermissions,
  onClose
}: RoleSimulationOverlayProps) {
  const [simulatedChanges, setSimulatedChanges] = useState<Map<string, boolean>>(
    () => new Map()
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Collect all unique permission keys from modules
  const allPermissionKeys = useMemo(() => {
    const keys = new Map<string, boolean>();
    for (const mod of unifiedData.modules) {
      for (const detail of mod.codePermissionDetails) {
        if (!keys.has(detail.key)) {
          keys.set(detail.key, detail.granted);
        }
      }
    }
    return keys;
  }, [unifiedData]);

  // Filtered permission keys based on search
  const filteredKeys = useMemo(() => {
    const entries = Array.from(allPermissionKeys.entries());
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(([key]) => key.toLowerCase().includes(q));
  }, [allPermissionKeys, searchQuery]);

  // Effective permissions with simulated changes applied
  const simulatedPermissions = useMemo(
    () => buildSimulatedPermissions(rolePermissions, simulatedChanges),
    [rolePermissions, simulatedChanges]
  );

  // Toggle a permission key
  const togglePermission = useCallback(
    (key: string) => {
      setSimulatedChanges((prev) => {
        const next = new Map(prev);
        const currentValue = simulatedPermissions[key] ?? false;
        // If reverting to original, remove from changes
        const originalValue = rolePermissions[key] ?? false;
        const newValue = !currentValue;
        if (newValue === originalValue) {
          next.delete(key);
        } else {
          next.set(key, newValue);
        }
        return next;
      });
    },
    [simulatedPermissions, rolePermissions]
  );

  // Compute affected modules
  const affectedModules = useMemo<AffectedModule[]>(() => {
    if (simulatedChanges.size === 0) return [];

    const results: AffectedModule[] = [];

    for (const mod of unifiedData.modules) {
      const currentCrud = mod.codePermissions;
      const simCrud = deriveCrud(mod.codePermissionDetails, simulatedPermissions);

      // Table changes via RLS re-evaluation
      const tableChanges: AffectedModule['tableChanges'] = [];
      for (const ta of mod.tableAccess) {
        for (const policy of ta.policies) {
          const currentAccess = wouldPolicyGrantAccess(
            policy.parsed,
            unifiedData.role.roleKey,
            rolePermissions
          );
          const simAccess = wouldPolicyGrantAccess(
            policy.parsed,
            unifiedData.role.roleKey,
            simulatedPermissions
          );
          if (currentAccess !== simAccess) {
            tableChanges.push({
              tableName: ta.tableName,
              operation: policy.command,
              currentAccess,
              simulatedAccess: simAccess
            });
          }
        }
      }

      // Route changes
      const routeChanges: AffectedModule['routeChanges'] = [];
      for (const ra of mod.routeAccess) {
        const currentVisible = rolePermissions[ra.requiredPermission] ?? false;
        const simVisible = simulatedPermissions[ra.requiredPermission] ?? false;
        if (currentVisible !== simVisible) {
          routeChanges.push({
            route: ra.route,
            currentVisible,
            simulatedVisible: simVisible
          });
        }
      }

      // Detect new and resolved conflicts
      const newConflicts: ConflictItem[] = [];
      const resolvedConflicts: ConflictItem[] = [];

      // Check for code_grants_rls_blocks: code says yes but RLS says no
      for (const ta of mod.tableAccess) {
        for (const policy of ta.policies) {
          const simCodeGranted = simCrud.read || simCrud.create || simCrud.update || simCrud.delete;
          const simRls = wouldPolicyGrantAccess(
            policy.parsed,
            unifiedData.role.roleKey,
            simulatedPermissions
          );
          const curCodeGranted =
            currentCrud.read || currentCrud.create || currentCrud.update || currentCrud.delete;
          const curRls = wouldPolicyGrantAccess(
            policy.parsed,
            unifiedData.role.roleKey,
            rolePermissions
          );

          if (simCodeGranted && simRls === false && !(curCodeGranted && curRls === false)) {
            newConflicts.push({
              type: 'code_grants_rls_blocks',
              description: `Code grants access but RLS blocks on ${ta.tableName} (${policy.command})`,
              module: mod.moduleName,
              target: ta.tableName,
              severity: 'error'
            });
          }
          if (curCodeGranted && curRls === false && !(simCodeGranted && simRls === false)) {
            resolvedConflicts.push({
              type: 'code_grants_rls_blocks',
              description: `Resolved: code/RLS conflict on ${ta.tableName} (${policy.command})`,
              module: mod.moduleName,
              target: ta.tableName,
              severity: 'error'
            });
          }
        }
      }

      const crudChanged = !crudEqual(currentCrud, simCrud);
      const hasImpact =
        crudChanged ||
        tableChanges.length > 0 ||
        routeChanges.length > 0 ||
        newConflicts.length > 0 ||
        resolvedConflicts.length > 0;

      if (hasImpact) {
        results.push({
          moduleName: mod.moduleName,
          currentCrud,
          simulatedCrud: simCrud,
          tableChanges,
          routeChanges,
          newConflicts,
          resolvedConflicts
        });
      }
    }

    return results;
  }, [unifiedData, rolePermissions, simulatedPermissions, simulatedChanges.size]);

  // Compute verdict
  const verdict = useMemo<{ status: Verdict; message: string }>(() => {
    const totalNew = affectedModules.reduce((s, m) => s + m.newConflicts.length, 0);
    const hasErrors = affectedModules.some((m) =>
      m.newConflicts.some((c) => c.severity === 'error')
    );

    if (hasErrors) {
      return {
        status: 'danger',
        message: `Danger — this would create access inconsistencies`
      };
    }
    if (totalNew > 0) {
      return {
        status: 'warning',
        message: `Warning — ${totalNew} new cross-layer conflict${totalNew > 1 ? 's' : ''}`
      };
    }
    return {
      status: 'safe',
      message: 'Safe — no new conflicts introduced'
    };
  }, [affectedModules]);

  const verdictColors: Record<Verdict, string> = {
    safe: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300',
    warning:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-300'
  };

  const changesCount = simulatedChanges.size;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between rounded-lg bg-amber-100 px-4 py-3 dark:bg-amber-900/30">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
          <FlaskConical className="h-5 w-5" />
          <span className="text-sm font-semibold uppercase tracking-wide">Simulation Mode</span>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          <X className="mr-1 h-4 w-4" />
          Exit Simulation
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left column — Permission Toggles */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Permission Toggles</CardTitle>
              {changesCount > 0 && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  {changesCount} change{changesCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter permissions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
              {filteredKeys.map(([key]) => {
                const isGranted = simulatedPermissions[key] ?? false;
                const isChanged = simulatedChanges.has(key);

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => togglePermission(key)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 ${
                      isChanged
                        ? 'bg-amber-50 dark:bg-amber-900/20'
                        : ''
                    }`}
                  >
                    <code className="text-xs">{key}</code>
                    <span
                      className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        isGranted
                          ? 'bg-emerald-500'
                          : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                          isGranted ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </span>
                  </button>
                );
              })}
              {filteredKeys.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No permissions match your search.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right column — Impact Preview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Impact Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {changesCount === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Toggle permissions on the left to preview the impact.
              </p>
            ) : affectedModules.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No modules affected by the current changes.
              </p>
            ) : (
              <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
                {affectedModules.map((mod) => (
                  <div key={mod.moduleName} className="space-y-2">
                    <h4 className="text-sm font-semibold">{mod.moduleName}</h4>

                    {/* CRUD comparison */}
                    {!crudEqual(mod.currentCrud, mod.simulatedCrud) && (
                      <div className="flex items-center gap-2">
                        <CrudRow crud={mod.currentCrud} />
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <CrudRow crud={mod.simulatedCrud} compareTo={mod.currentCrud} />
                      </div>
                    )}

                    {/* Table access changes */}
                    {mod.tableChanges.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          Table access changes
                        </p>
                        {mod.tableChanges.map((tc, i) => (
                          <div
                            key={`${tc.tableName}-${tc.operation}-${i}`}
                            className="flex items-center gap-1.5 text-xs"
                          >
                            <code className="text-[11px]">{tc.tableName}</code>
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              {tc.operation}
                            </Badge>
                            <span className={tc.currentAccess ? 'text-emerald-600' : 'text-red-500'}>
                              {tc.currentAccess === null ? '?' : tc.currentAccess ? 'yes' : 'no'}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span
                              className={`font-medium ${
                                tc.simulatedAccess ? 'text-emerald-600' : 'text-red-500'
                              }`}
                            >
                              {tc.simulatedAccess === null
                                ? '?'
                                : tc.simulatedAccess
                                  ? 'yes'
                                  : 'no'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Route visibility changes */}
                    {mod.routeChanges.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          Route visibility changes
                        </p>
                        {mod.routeChanges.map((rc, i) => (
                          <div
                            key={`${rc.route}-${i}`}
                            className="flex items-center gap-1.5 text-xs"
                          >
                            <code className="text-[11px]">{rc.route}</code>
                            <span className={rc.currentVisible ? 'text-emerald-600' : 'text-red-500'}>
                              {rc.currentVisible ? 'visible' : 'hidden'}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span
                              className={`font-medium ${
                                rc.simulatedVisible ? 'text-emerald-600' : 'text-red-500'
                              }`}
                            >
                              {rc.simulatedVisible ? 'visible' : 'hidden'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* New conflicts */}
                    {mod.newConflicts.length > 0 && (
                      <div className="space-y-1">
                        {mod.newConflicts.map((c, i) => (
                          <div
                            key={`new-${i}`}
                            className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
                          >
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{c.description}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Resolved conflicts */}
                    {mod.resolvedConflicts.length > 0 && (
                      <div className="space-y-1">
                        {mod.resolvedConflicts.map((c, i) => (
                          <div
                            key={`resolved-${i}`}
                            className="flex items-start gap-2 rounded-md bg-emerald-50 p-2 text-xs text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                          >
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{c.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Verdict bar */}
      {changesCount > 0 && (
        <div
          className={`flex items-center justify-center rounded-lg border px-4 py-3 ${verdictColors[verdict.status]}`}
        >
          <Badge
            variant="outline"
            className={`text-sm font-medium ${verdictColors[verdict.status]}`}
          >
            {verdict.message}
          </Badge>
        </div>
      )}
    </div>
  );
}
