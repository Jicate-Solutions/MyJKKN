'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { BeatLoader } from 'react-spinners';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Check, Download, Search, SlidersHorizontal, X } from 'lucide-react';
import { PERMISSION_CATEGORIES } from '@/lib/constants/permissions';
import {
  getDisplayNameForModuleKey,
} from '@/lib/permissions-audit/module-mappings';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoleMeta {
  name: string;
  userCount: number;
  isSystem: boolean;
}

interface MatrixData {
  roles: string[];
  roleMeta: Record<string, RoleMeta>;
  matrix: Record<string, Record<string, boolean>>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Module key for a permission = first dot-segment, with a sane fallback
 *  for legacy single-segment keys (e.g. "view_dashboard" → module
 *  "view_dashboard"). */
function moduleKeyOf(permKey: string): string {
  return permKey.includes('.') ? permKey.split('.', 1)[0] : permKey;
}

// `moduleLabel` is now sourced from the canonical library (added by
// PR #533's structural fix). Both this tab and Module → Roles share the
// same "permission-key module → human label" implementation, so future
// audit surfaces don't drift.
const moduleLabel = getDisplayNameForModuleKey;

/** Friendly permission label: look up by key in any category's permissions
 *  array (matches the helper used elsewhere in this dashboard). Falls back
 *  to a humanised version of the dotted key. */
function labelForPermission(permKey: string): string {
  for (const cat of PERMISSION_CATEGORIES) {
    const found = cat.permissions.find((p) => p.key === permKey);
    if (found) return found.label;
  }
  // Humanise the trailing segment as a last resort.
  const tail = permKey.split('.').pop() ?? permKey;
  return moduleLabel(tail.replace(/[._]/g, ' '));
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PermissionMatrixTab() {
  const [matrixData, setMatrixData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hideRolesWithNoUsers, setHideRolesWithNoUsers] = useState(true);
  const [hideRolesWithNoGrants, setHideRolesWithNoGrants] = useState(true);
  const [hideSystemRoles, setHideSystemRoles] = useState(false);
  const [density, setDensity] = useState<'compact' | 'comfortable'>('comfortable');

  // Fetch matrix on mount
  useEffect(() => {
    const fetchMatrix = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/users/permissions-audit/matrix');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setMatrixData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load matrix');
      } finally {
        setLoading(false);
      }
    };
    fetchMatrix();
  }, []);

  // ── Module dropdown options ────────────────────────────────────────────────
  // Dynamic: union of modules discovered in data.matrix AND catalogued in
  // PERMISSION_CATEGORIES. Earlier this dropdown only showed PERMISSION_CATEGORIES,
  // making 56 of 88 actual modules unreachable from the picker — that was the
  // "not working correctly" symptom for this tab.
  const moduleOptions = useMemo(() => {
    if (!matrixData) {
      return [] as Array<{
        key: string;
        label: string;
        permCount: number;
        grantCount: number;
      }>;
    }

    const stats = new Map<string, { permCount: number; grantCount: number }>();

    for (const permKey of Object.keys(matrixData.matrix)) {
      const m = moduleKeyOf(permKey);
      let s = stats.get(m);
      if (!s) {
        s = { permCount: 0, grantCount: 0 };
        stats.set(m, s);
      }
      s.permCount += 1;
      const row = matrixData.matrix[permKey] || {};
      for (const v of Object.values(row)) if (v === true) s.grantCount += 1;
    }

    // Inject catalogued modules that aren't represented in data so an auditor
    // sees catalog-vs-data drift instead of silently missing entries.
    for (const cat of PERMISSION_CATEGORIES) {
      if (!stats.has(cat.key)) stats.set(cat.key, { permCount: 0, grantCount: 0 });
    }

    return Array.from(stats.entries())
      .map(([key, s]) => ({
        key,
        label: moduleLabel(key),
        permCount: s.permCount,
        grantCount: s.grantCount,
      }))
      .sort((a, b) => {
        if (a.grantCount === 0 && b.grantCount === 0) {
          return a.label.localeCompare(b.label);
        }
        if (a.grantCount === 0) return 1;
        if (b.grantCount === 0) return -1;
        return b.grantCount - a.grantCount || a.label.localeCompare(b.label);
      });
  }, [matrixData]);

  // ── Filtered permission set ────────────────────────────────────────────────
  const filteredPermissions = useMemo(() => {
    if (!matrixData) return [] as string[];
    const q = searchQuery.trim().toLowerCase();
    return Object.keys(matrixData.matrix).filter((permKey) => {
      // Module filter
      if (selectedModule !== 'all' && moduleKeyOf(permKey) !== selectedModule) {
        return false;
      }
      // Search filter
      if (q) {
        const label = labelForPermission(permKey).toLowerCase();
        if (!permKey.toLowerCase().includes(q) && !label.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [matrixData, selectedModule, searchQuery]);

  // ── Per-role grant totals (for the "no grants" filter and chip counts) ────
  const roleGrantTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    if (!matrixData) return totals;
    for (const permKey of Object.keys(matrixData.matrix)) {
      const row = matrixData.matrix[permKey] || {};
      for (const [role, granted] of Object.entries(row)) {
        if (granted) totals[role] = (totals[role] || 0) + 1;
      }
    }
    return totals;
  }, [matrixData]);

  // ── Filtered, displayed roles (column set) ─────────────────────────────────
  const displayedRoles = useMemo(() => {
    if (!matrixData) return [] as string[];
    return matrixData.roles.filter((role) => {
      const meta = matrixData.roleMeta[role];
      if (!meta) return false;
      if (hideSystemRoles && meta.isSystem) return false;
      if (hideRolesWithNoUsers && (meta.userCount ?? 0) === 0) return false;
      if (hideRolesWithNoGrants && (roleGrantTotals[role] ?? 0) === 0) return false;
      return true;
    });
  }, [
    matrixData,
    hideSystemRoles,
    hideRolesWithNoUsers,
    hideRolesWithNoGrants,
    roleGrantTotals,
  ]);

  // ── Group filtered permissions by module category ──────────────────────────
  const groups = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; permissions: string[] }>();
    for (const permKey of filteredPermissions) {
      const m = moduleKeyOf(permKey);
      let g = byKey.get(m);
      if (!g) {
        g = { key: m, label: moduleLabel(m), permissions: [] };
        byKey.set(m, g);
      }
      g.permissions.push(permKey);
    }
    // Stable order: alpha by label
    return Array.from(byKey.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [filteredPermissions]);

  // ── CSV export ─────────────────────────────────────────────────────────────
  const exportCsv = () => {
    if (!matrixData) return;
    const headers = ['Module', 'Permission Key', 'Permission Label'];
    for (const role of displayedRoles) {
      const meta = matrixData.roleMeta[role];
      headers.push(`${meta?.name ?? role} (${meta?.userCount ?? 0})`);
    }
    const rows: string[][] = [headers];
    for (const g of groups) {
      for (const permKey of g.permissions) {
        const row = [g.label, permKey, labelForPermission(permKey)];
        for (const role of displayedRoles) {
          row.push(matrixData.matrix[permKey]?.[role] ? 'YES' : 'no');
        }
        rows.push(row);
      }
    }
    const csv = rows
      .map((r) =>
        r
          .map((cell) => {
            const needs = /[",\n]/.test(cell);
            const esc = cell.replace(/"/g, '""');
            return needs ? `"${esc}"` : esc;
          })
          .join(','),
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `permission-matrix-${selectedModule}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Loading / error states ──────────────────────────────────────────────────
  if (loading) {
    return (
      <Card>
        <CardContent className='flex items-center justify-center h-64'>
          <BeatLoader color='#6366f1' size={10} />
        </CardContent>
      </Card>
    );
  }
  if (error || !matrixData) {
    return (
      <Card>
        <CardContent className='flex items-center justify-center h-64 text-destructive'>
          {error ?? 'No data returned from API'}
        </CardContent>
      </Card>
    );
  }

  const totalRoles = matrixData.roles.length;
  const hiddenRolesCount = totalRoles - displayedRoles.length;

  // ── Filter sheet content (shared between mobile sheet + desktop popover) ───
  const filtersBody = (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <Label className='text-xs font-medium'>Hide roles with no users</Label>
        <div className='flex items-center gap-2'>
          <Switch
            checked={hideRolesWithNoUsers}
            onCheckedChange={setHideRolesWithNoUsers}
            id='hide-empty-users'
          />
          <Label htmlFor='hide-empty-users' className='text-xs text-muted-foreground'>
            Roles with 0 assigned users won't appear as columns.
          </Label>
        </div>
      </div>
      <div className='space-y-1.5'>
        <Label className='text-xs font-medium'>Hide roles that grant nothing</Label>
        <div className='flex items-center gap-2'>
          <Switch
            checked={hideRolesWithNoGrants}
            onCheckedChange={setHideRolesWithNoGrants}
            id='hide-empty-grants'
          />
          <Label htmlFor='hide-empty-grants' className='text-xs text-muted-foreground'>
            Hide roles whose JSONB has no <code>true</code> values.
          </Label>
        </div>
      </div>
      <div className='space-y-1.5'>
        <Label className='text-xs font-medium'>Hide system roles</Label>
        <div className='flex items-center gap-2'>
          <Switch
            checked={hideSystemRoles}
            onCheckedChange={setHideSystemRoles}
            id='hide-system'
          />
          <Label htmlFor='hide-system' className='text-xs text-muted-foreground'>
            Hide roles flagged <code>is_system_role</code>.
          </Label>
        </div>
      </div>
      <div className='space-y-1.5'>
        <Label className='text-xs font-medium'>Density</Label>
        <div className='flex gap-2'>
          <Button
            size='sm'
            variant={density === 'comfortable' ? 'default' : 'outline'}
            className='flex-1 h-8 text-xs'
            onClick={() => setDensity('comfortable')}
          >
            Comfortable
          </Button>
          <Button
            size='sm'
            variant={density === 'compact' ? 'default' : 'outline'}
            className='flex-1 h-8 text-xs'
            onClick={() => setDensity('compact')}
          >
            Compact
          </Button>
        </div>
      </div>
      <div className='border-t pt-3 text-[11px] text-muted-foreground'>
        Showing {displayedRoles.length} of {totalRoles} roles
        {hiddenRolesCount > 0 && (
          <>
            {' '}
            (<span className='text-foreground'>{hiddenRolesCount} hidden</span>)
          </>
        )}
      </div>
    </div>
  );

  // Density-driven cell padding
  const rowPadY = density === 'compact' ? 'py-1' : 'py-2';
  const cellPadY = density === 'compact' ? 'py-1' : 'py-2';

  return (
    <Card>
      {/* ── Header / Toolbar ──────────────────────────────────────────────── */}
      <CardHeader className='pb-3 space-y-3'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'>
          <div>
            <CardTitle className='text-base font-semibold'>
              Permission Matrix
            </CardTitle>
            <p className='text-xs text-muted-foreground mt-0.5'>
              Roles × permissions grid. {filteredPermissions.length} permission
              {filteredPermissions.length !== 1 ? 's' : ''} ·{' '}
              {displayedRoles.length} role{displayedRoles.length !== 1 ? 's' : ''}
              .
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Button
              size='sm'
              variant='outline'
              className='h-8 text-xs gap-1'
              onClick={exportCsv}
              disabled={filteredPermissions.length === 0}
            >
              <Download className='h-3.5 w-3.5' />
              <span className='hidden sm:inline'>Export CSV</span>
              <span className='sm:hidden'>CSV</span>
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  size='sm'
                  variant='outline'
                  className='h-8 text-xs gap-1'
                >
                  <SlidersHorizontal className='h-3.5 w-3.5' />
                  <span className='hidden sm:inline'>Filters</span>
                  {hiddenRolesCount > 0 && (
                    <Badge variant='secondary' className='ml-1 h-4 px-1 text-[10px]'>
                      {hiddenRolesCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side='right' className='w-[320px] sm:w-[360px]'>
                <SheetHeader>
                  <SheetTitle>Filter roles &amp; layout</SheetTitle>
                </SheetHeader>
                <div className='mt-4'>{filtersBody}</div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Search + module on one row (wraps on mobile) */}
        <div className='flex flex-col sm:flex-row gap-2'>
          <div className='relative flex-1'>
            <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground' />
            <Input
              placeholder='Search permission key or label...'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className='pl-8 h-9 text-sm'
            />
            {searchQuery && (
              <button
                aria-label='Clear search'
                className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
                onClick={() => setSearchQuery('')}
              >
                <X className='h-3.5 w-3.5' />
              </button>
            )}
          </div>
          <Select value={selectedModule} onValueChange={setSelectedModule}>
            <SelectTrigger className='w-full sm:w-[260px] h-9 text-sm'>
              <SelectValue placeholder='All Modules' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>
                All Modules
                <span className='ml-1 text-muted-foreground text-[11px]'>
                  · {Object.keys(matrixData.matrix).length} perms
                </span>
              </SelectItem>
              {moduleOptions.map((m) => {
                const dormant = m.grantCount === 0;
                return (
                  <SelectItem key={m.key} value={m.key}>
                    <span className={dormant ? 'text-muted-foreground italic' : ''}>
                      {m.label}
                    </span>
                    <span className='ml-1 text-muted-foreground text-[11px]'>
                      ·{' '}
                      {dormant
                        ? 'no grants'
                        : `${m.grantCount} grant${m.grantCount !== 1 ? 's' : ''}`}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Role chips strip — horizontally scrollable on mobile */}
        <div className='-mx-1 overflow-x-auto'>
          <div className='flex flex-wrap gap-1.5 px-1 min-w-max sm:min-w-0'>
            {displayedRoles.length === 0 ? (
              <span className='text-xs text-muted-foreground italic'>
                No roles match the current filters.
              </span>
            ) : (
              displayedRoles.map((role) => {
                const meta = matrixData.roleMeta[role];
                const grants = roleGrantTotals[role] ?? 0;
                return (
                  <Badge
                    key={role}
                    variant='outline'
                    className='text-[11px] gap-1 whitespace-nowrap'
                    title={`${grants} permission${grants !== 1 ? 's' : ''} granted · ${meta?.userCount ?? 0} user${meta?.userCount === 1 ? '' : 's'}`}
                  >
                    {meta?.name ?? role}
                    <span className='text-muted-foreground'>
                      · {meta?.userCount ?? 0}
                    </span>
                  </Badge>
                );
              })
            )}
          </div>
        </div>
      </CardHeader>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <CardContent className='p-0'>
        {filteredPermissions.length === 0 ? (
          <div className='flex flex-col items-center justify-center h-40 text-sm text-muted-foreground gap-2'>
            <Search className='h-8 w-8 opacity-40' />
            <span>No permissions match the current filters.</span>
            {(searchQuery || selectedModule !== 'all') && (
              <Button
                size='sm'
                variant='outline'
                className='h-8 text-xs'
                onClick={() => {
                  setSearchQuery('');
                  setSelectedModule('all');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* ─── MOBILE: Card-per-permission view (≤ md) ─────────────── */}
            <div className='md:hidden divide-y'>
              {groups.map((group) => (
                <div key={`mob-group-${group.key}`}>
                  <div className='sticky top-0 bg-indigo-50/95 backdrop-blur px-4 py-1.5 text-xs font-semibold text-indigo-700 border-b border-indigo-100 z-10'>
                    {group.label}
                    <span className='ml-1 text-indigo-700/60 font-normal'>
                      · {group.permissions.length}
                    </span>
                  </div>
                  <div className='divide-y'>
                    {group.permissions.map((permKey) => {
                      const grantedRoles = displayedRoles.filter(
                        (r) => matrixData.matrix[permKey]?.[r] === true,
                      );
                      return (
                        <div
                          key={`mob-${permKey}`}
                          className={`px-4 ${rowPadY === 'py-1' ? 'py-2' : 'py-3'}`}
                        >
                          <div className='font-medium text-sm leading-tight'>
                            {labelForPermission(permKey)}
                          </div>
                          <code className='text-[10px] text-muted-foreground font-mono break-all'>
                            {permKey}
                          </code>
                          <div className='mt-1.5 flex flex-wrap gap-1'>
                            {grantedRoles.length === 0 ? (
                              <span className='text-[11px] text-muted-foreground italic'>
                                No visible role grants this.
                              </span>
                            ) : (
                              grantedRoles.map((role) => {
                                const meta = matrixData.roleMeta[role];
                                return (
                                  <Badge
                                    key={role}
                                    variant='secondary'
                                    className='text-[10px] gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  >
                                    <Check className='h-2.5 w-2.5' />
                                    {meta?.name ?? role}
                                  </Badge>
                                );
                              })
                            )}
                          </div>
                          <div className='mt-1 text-[10px] text-muted-foreground'>
                            {grantedRoles.length} of {displayedRoles.length} visible
                            roles
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* ─── DESKTOP: Matrix grid (≥ md) ─────────────────────────── */}
            <div className='hidden md:block overflow-x-auto'>
              <table className='w-full text-xs border-collapse'>
                <thead>
                  <tr className='border-b bg-muted/40'>
                    <th
                      className={`sticky left-0 z-20 bg-muted/40 text-left px-4 ${cellPadY} font-semibold min-w-[260px] border-r`}
                    >
                      Permission
                    </th>
                    {displayedRoles.map((role) => {
                      const meta = matrixData.roleMeta[role];
                      const grants = roleGrantTotals[role] ?? 0;
                      return (
                        <th
                          key={role}
                          className={`px-2 ${cellPadY} text-center font-semibold whitespace-nowrap min-w-[88px] align-bottom`}
                        >
                          <div className='leading-tight'>{meta?.name ?? role}</div>
                          <div className='text-[10px] text-muted-foreground font-normal mt-0.5'>
                            {meta?.userCount ?? 0} user
                            {meta?.userCount === 1 ? '' : 's'} · {grants} grant
                            {grants !== 1 ? 's' : ''}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <Fragment key={`grp-${group.key}`}>
                      {/* Category divider */}
                      <tr className='bg-indigo-50 border-y border-indigo-100'>
                        <td
                          colSpan={displayedRoles.length + 1}
                          className='sticky left-0 px-4 py-1.5 font-semibold text-indigo-700 bg-indigo-50 z-10'
                        >
                          {group.label}
                          <span className='ml-1 text-indigo-700/60 font-normal'>
                            · {group.permissions.length}
                          </span>
                        </td>
                      </tr>
                      {group.permissions.map((permKey, idx) => {
                        const stripe =
                          idx % 2 === 0 ? 'bg-background' : 'bg-muted/15';
                        return (
                          <tr
                            key={permKey}
                            className={`${stripe} hover:bg-indigo-50/40 transition-colors`}
                          >
                            <td
                              className={`sticky left-0 z-10 px-4 ${rowPadY} border-r ${stripe}`}
                            >
                              <div className='text-[12px] font-medium leading-tight'>
                                {labelForPermission(permKey)}
                              </div>
                              <code className='text-[10px] text-muted-foreground font-mono break-all'>
                                {permKey}
                              </code>
                            </td>
                            {displayedRoles.map((role) => {
                              const granted =
                                matrixData.matrix[permKey]?.[role] === true;
                              return (
                                <td
                                  key={role}
                                  className={`px-2 ${cellPadY} text-center`}
                                  aria-label={`${role}: ${granted ? 'granted' : 'denied'}`}
                                  title={`${matrixData.roleMeta[role]?.name ?? role}: ${granted ? 'granted' : 'denied'}`}
                                >
                                  {granted ? (
                                    <span className='inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mx-auto'>
                                      <Check className='h-3 w-3' strokeWidth={3} />
                                    </span>
                                  ) : (
                                    <span className='inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted/40 text-muted-foreground/50 mx-auto'>
                                      <X className='h-3 w-3' strokeWidth={2} />
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Legend / footer (shared) */}
        <div className='flex flex-wrap items-center gap-3 px-4 py-3 border-t text-xs text-muted-foreground'>
          <span className='flex items-center gap-1.5'>
            <span className='inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-700'>
              <Check className='h-2.5 w-2.5' strokeWidth={3} />
            </span>
            Granted
          </span>
          <span className='flex items-center gap-1.5'>
            <span className='inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted/40 text-muted-foreground/50'>
              <X className='h-2.5 w-2.5' strokeWidth={2} />
            </span>
            Denied
          </span>
          <span className='ml-auto'>
            {filteredPermissions.length} permission
            {filteredPermissions.length !== 1 ? 's' : ''} ·{' '}
            {displayedRoles.length} role{displayedRoles.length !== 1 ? 's' : ''}
            {hiddenRolesCount > 0 && (
              <span className='text-foreground'>
                {' '}
                ({hiddenRolesCount} hidden)
              </span>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
