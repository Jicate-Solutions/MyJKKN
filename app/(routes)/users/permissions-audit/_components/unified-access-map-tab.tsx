'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  Filter,
  Loader2,
  Package,
  RefreshCw,
  Shield,
  X
} from 'lucide-react';
import type {
  UnifiedAccessResponse,
  ModuleAccess,
  CrudAccess
} from '@/types/permissions-audit';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoleMeta {
  name: string;
  userCount: number;
  isSystem: boolean;
}

interface RoleEntry {
  roleKey: string;
  roleName: string;
  userCount: number;
  isSystem: boolean;
}

type FilterMode = 'all' | 'conflicts' | 'granted';

// ─── CrudBadges ──────────────────────────────────────────────────────────────

function CrudBadges({
  crud,
  size = 'sm'
}: {
  crud: CrudAccess;
  size?: 'sm' | 'xs';
}) {
  const labels = ['C', 'R', 'U', 'D'] as const;
  const keys: (keyof CrudAccess)[] = ['create', 'read', 'update', 'delete'];
  const sizeClasses =
    size === 'sm'
      ? 'w-6 h-6 text-xs'
      : 'w-5 h-5 text-[10px]';

  return (
    <div className="inline-flex gap-0.5">
      {labels.map((label, i) => {
        const val = crud[keys[i]];
        const bg =
          val === true
            ? 'bg-emerald-100 text-emerald-700'
            : val === false
              ? 'bg-red-100 text-red-700'
              : 'bg-gray-100 text-gray-400';
        const status =
          val === true ? 'Granted' : val === false ? 'Denied' : 'Unknown';
        return (
          <span
            key={label}
            className={`${sizeClasses} ${bg} inline-flex items-center justify-center rounded font-mono font-medium`}
            title={`${keys[i]}: ${status}`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

// ─── ModuleCard ──────────────────────────────────────────────────────────────

function ModuleCard({
  module,
  isExpanded,
  onToggle
}: {
  module: ModuleAccess;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const conflictCount = module.conflicts.length;
  const hasAccess =
    module.codePermissions.create ||
    module.codePermissions.read ||
    module.codePermissions.update ||
    module.codePermissions.delete;
  const grantedPerms = module.codePermissionDetails.filter(
    (p) => p.granted
  ).length;
  const totalPerms = module.codePermissionDetails.length;
  const visibleRoutes = module.routeAccess.filter(
    (r) => r.hasPermission
  ).length;
  const totalRoutes = module.routeAccess.length;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card
        className={
          conflictCount > 0 ? 'border-amber-300' : ''
        }
      >
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">
                  {module.moduleName}
                </span>
                {conflictCount > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
                  </Badge>
                )}
                {module.isConsistent && hasAccess && (
                  <Badge
                    variant="outline"
                    className="text-xs border-emerald-300 text-emerald-700"
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Consistent
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  Code: <CrudBadges crud={module.codePermissions} />
                </span>
                <span>{module.tableAccess.length} tables</span>
                <span>
                  {visibleRoutes}/{totalRoutes} routes
                </span>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Column 1 - Code Permissions */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-sm font-medium">
                    Code Permissions ({grantedPerms}/{totalPerms})
                  </span>
                </div>
                {totalPerms > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {module.codePermissionDetails.map((perm) => (
                      <div
                        key={perm.key}
                        className="flex items-center gap-2 text-xs py-0.5"
                      >
                        {perm.granted ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-red-500 shrink-0" />
                        )}
                        <span className="truncate" title={perm.key}>
                          {perm.key}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No code permissions mapped
                  </p>
                )}
              </div>

              {/* Column 2 - Database Access */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <span className="text-sm font-medium">
                    Database Access ({module.tableAccess.length} tables)
                  </span>
                </div>
                {module.tableAccess.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {module.tableAccess.map((t) => (
                      <div
                        key={t.tableName}
                        className="flex items-center justify-between text-xs py-0.5"
                      >
                        <span className="truncate mr-2" title={t.tableName}>
                          {t.tableName}
                        </span>
                        <CrudBadges crud={t.crud} size="xs" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No database tables mapped
                  </p>
                )}
              </div>

              {/* Column 3 - Navigation */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">
                    Navigation ({visibleRoutes}/{totalRoutes} visible)
                  </span>
                </div>
                {totalRoutes > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {module.routeAccess.map((r) => (
                      <div
                        key={r.route}
                        className="flex items-center gap-2 text-xs py-0.5"
                      >
                        {r.hasPermission ? (
                          <Eye className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-red-500 shrink-0" />
                        )}
                        <span className="truncate" title={r.route}>
                          {r.route}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No navigation routes mapped
                  </p>
                )}
              </div>
            </div>

            {/* Conflicts Section */}
            {conflictCount > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">
                    Cross-Layer Conflicts
                  </span>
                </div>
                <div className="space-y-2">
                  {module.conflicts.map((conflict, idx) => {
                    const severityColor =
                      conflict.severity === 'error'
                        ? 'text-red-600'
                        : conflict.severity === 'warning'
                          ? 'text-amber-600'
                          : 'text-blue-600';
                    return (
                      <div
                        key={idx}
                        className="flex items-start gap-2 rounded bg-amber-100/60 p-2 text-xs"
                      >
                        <AlertCircle
                          className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${severityColor}`}
                        />
                        <span className="text-amber-900">
                          {conflict.description}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ─── UnifiedAccessMapTab ─────────────────────────────────────────────────────

export function UnifiedAccessMapTab() {
  const [roles, setRoles] = useState<RoleEntry[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [data, setData] = useState<UnifiedAccessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    new Set()
  );

  // Fetch role list on mount
  useEffect(() => {
    async function fetchRoles() {
      try {
        const res = await fetch('/api/users/permissions-audit/matrix');
        if (!res.ok) throw new Error('Failed to fetch roles');
        const json = await res.json();
        const roleKeys: string[] = json.roles ?? [];
        const roleMeta: Record<string, RoleMeta> = json.roleMeta ?? {};
        const entries: RoleEntry[] = roleKeys.map((key) => ({
          roleKey: key,
          roleName: roleMeta[key]?.name ?? key,
          userCount: roleMeta[key]?.userCount ?? 0,
          isSystem: roleMeta[key]?.isSystem ?? false
        }));
        setRoles(entries);
      } catch (err) {
        console.error('[users/permissions-audit] Failed to fetch roles:', err);
      }
    }
    fetchRoles();
  }, []);

  // Fetch unified data when role changes
  const fetchUnifiedData = useCallback(async (roleKey: string) => {
    if (!roleKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/users/permissions-audit/unified?roleKey=${encodeURIComponent(roleKey)}`
      );
      if (!res.ok) throw new Error('Failed to fetch unified access data');
      const json: UnifiedAccessResponse = await res.json();
      setData(json);
      setExpandedModules(new Set());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch unified access'
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedRole) {
      fetchUnifiedData(selectedRole);
    }
  }, [selectedRole, fetchUnifiedData]);

  // Toggle module expansion
  const toggleModule = (moduleName: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleName)) {
        next.delete(moduleName);
      } else {
        next.add(moduleName);
      }
      return next;
    });
  };

  // Filter modules
  const filteredModules = data?.modules.filter((m) => {
    if (filter === 'conflicts') return m.conflicts.length > 0;
    if (filter === 'granted') {
      return (
        m.codePermissions.create ||
        m.codePermissions.read ||
        m.codePermissions.update ||
        m.codePermissions.delete
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Controls Card */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Role Selector */}
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select a role..." />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.roleKey} value={role.roleKey}>
                    <span className="flex items-center gap-2">
                      {role.roleName}
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        {role.userCount}
                      </Badge>
                      {role.isSystem && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5"
                        >
                          System
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filter Selector */}
            <Select
              value={filter}
              onValueChange={(v) => setFilter(v as FilterMode)}
            >
              <SelectTrigger className="w-[180px]">
                <Filter className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                <SelectItem value="conflicts">Conflicts Only</SelectItem>
                <SelectItem value="granted">Granted Only</SelectItem>
              </SelectContent>
            </Select>

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectedRole && fetchUnifiedData(selectedRole)}
              disabled={!selectedRole || loading}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>

            {/* Conflict Summary Badge */}
            {data && data.totalConflicts > 0 && (
              <Badge variant="destructive">
                {data.totalConflicts} cross-layer conflict
                {data.totalConflicts !== 1 ? 's' : ''} detected
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State - No Role Selected */}
      {!selectedRole && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Shield className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">
            Select a role to view unified access
          </h3>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Choose a role from the dropdown to see its tri-layer access map
          </p>
        </div>
      )}

      {/* Module Cards */}
      {!loading && data && filteredModules && (
        <div className="space-y-3">
          {filteredModules.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No modules match the selected filter.
            </div>
          ) : (
            filteredModules.map((mod) => (
              <ModuleCard
                key={mod.moduleName}
                module={mod}
                isExpanded={expandedModules.has(mod.moduleName)}
                onToggle={() => toggleModule(mod.moduleName)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
