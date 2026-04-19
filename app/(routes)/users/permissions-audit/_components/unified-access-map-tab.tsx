'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BeatLoader } from 'react-spinners';
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import {
  AlertTriangle,
  ExternalLink,
  Filter,
  RotateCcw,
  ShieldCheck,
  Users,
  X
} from 'lucide-react';
import { PERMISSION_CATEGORIES } from '@/lib/constants/permissions';

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

type CrudVerb = 'C' | 'R' | 'U' | 'D';

interface VerbStatus {
  granted: number;
  total: number;
}

interface CellStats {
  grantedCount: number;
  totalCount: number;
  verbs: Record<CrudVerb, VerbStatus>;
  hasView: boolean;
  hasCreate: boolean;
  hasEdit: boolean;
  hasDelete: boolean;
  hasExport: boolean;
  hasApprove: boolean;
  conflicts: Conflict[];
}

type ConflictSeverity = 'red' | 'amber';

interface Conflict {
  code: string;
  label: string;
  description: string;
  severity: ConflictSeverity;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Same classifier used by module-access-tab.tsx — duplicated per spec. */
function classifyPerm(permKey: string) {
  const parts = permKey.split('.');
  if (parts.length < 2) return { module: permKey, submodule: '', action: '' };
  return {
    module: parts[0],
    action: parts[parts.length - 1],
    submodule: parts.slice(1, -1).join(' › ')
  };
}

function moduleLabel(key: string) {
  const cat = PERMISSION_CATEGORIES.find((c) => c.key === key);
  return cat?.name ?? key;
}

/** Map an action verb onto CRUD buckets (C/R/U/D). Returns null if unmapped. */
function verbToCrud(action: string): CrudVerb | null {
  const a = action.toLowerCase();
  if (a === 'view' || a === 'read') return 'R';
  if (a === 'create') return 'C';
  if (a === 'edit' || a === 'update') return 'U';
  if (a === 'delete') return 'D';
  return null;
}

const READ_ACTIONS = new Set(['view', 'read']);
const WRITE_CREATE = new Set(['create']);
const WRITE_EDIT = new Set(['edit', 'update']);
const WRITE_DELETE = new Set(['delete']);
const EXPORT_ACTIONS = new Set(['export']);
const APPROVE_ACTIONS = new Set(['approve']);

/** Build per-cell stats + conflicts for one (role, module) pair. */
function computeCellStats(
  matrix: MatrixData['matrix'],
  role: string,
  moduleKey: string,
  modulePerms: string[]
): CellStats {
  const verbs: Record<CrudVerb, VerbStatus> = {
    C: { granted: 0, total: 0 },
    R: { granted: 0, total: 0 },
    U: { granted: 0, total: 0 },
    D: { granted: 0, total: 0 }
  };

  let grantedCount = 0;
  let hasView = false;
  let hasCreate = false;
  let hasEdit = false;
  let hasDelete = false;
  let hasExport = false;
  let hasApprove = false;

  for (const permKey of modulePerms) {
    const { action } = classifyPerm(permKey);
    const granted = matrix[permKey]?.[role] === true;
    if (granted) grantedCount += 1;

    const bucket = verbToCrud(action);
    if (bucket) {
      verbs[bucket].total += 1;
      if (granted) verbs[bucket].granted += 1;
    }

    if (granted) {
      if (READ_ACTIONS.has(action)) hasView = true;
      if (WRITE_CREATE.has(action)) hasCreate = true;
      if (WRITE_EDIT.has(action)) hasEdit = true;
      if (WRITE_DELETE.has(action)) hasDelete = true;
      if (EXPORT_ACTIONS.has(action)) hasExport = true;
      if (APPROVE_ACTIONS.has(action)) hasApprove = true;
    }
  }

  const conflicts: Conflict[] = [];
  if (hasCreate && !hasView) {
    conflicts.push({
      code: 'create-blind',
      label: 'Create-blind',
      description:
        'Role can create records but cannot view them — user will create data they can never see afterwards.',
      severity: 'red'
    });
  }
  if (hasEdit && !hasView) {
    conflicts.push({
      code: 'edit-blind',
      label: 'Edit-blind',
      description:
        'Role can edit/update records but cannot view them — high risk of blind modifications.',
      severity: 'red'
    });
  }
  if (hasDelete && !hasView) {
    conflicts.push({
      code: 'delete-blind',
      label: 'Delete-blind',
      description:
        'Role can delete records but cannot view them — cannot verify what they are deleting.',
      severity: 'red'
    });
  }
  if (hasDelete && !hasCreate) {
    conflicts.push({
      code: 'delete-without-create',
      label: 'Delete-without-Create',
      description:
        'Role can delete but cannot create. Sometimes intentional (auditor role) but worth flagging.',
      severity: 'amber'
    });
  }
  if (hasExport && !hasView) {
    conflicts.push({
      code: 'export-blind',
      label: 'Export-blind',
      description:
        'Role can export data but cannot view it — potential data-exfiltration hazard.',
      severity: 'red'
    });
  }
  if (hasApprove && !hasView) {
    conflicts.push({
      code: 'approve-blind',
      label: 'Approve-blind',
      description:
        'Role can approve records without being able to view them — governance risk.',
      severity: 'red'
    });
  }

  return {
    grantedCount,
    totalCount: modulePerms.length,
    verbs,
    hasView,
    hasCreate,
    hasEdit,
    hasDelete,
    hasExport,
    hasApprove,
    conflicts
  };
}

function statusDotClass(grantedCount: number, totalCount: number): string {
  if (totalCount === 0 || grantedCount === 0) return 'bg-slate-300';
  const pct = grantedCount / totalCount;
  if (pct >= 1) return 'bg-emerald-500';
  if (pct >= 0.5) return 'bg-sky-500';
  return 'bg-amber-500';
}

function statusDotLabel(grantedCount: number, totalCount: number): string {
  if (totalCount === 0) return 'No permissions defined';
  if (grantedCount === 0) return 'Nothing granted';
  const pct = Math.round((grantedCount / totalCount) * 100);
  return `${grantedCount}/${totalCount} granted (${pct}%)`;
}

/** Debounce hook — pure client-side, no extra deps. */
function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DrawerTarget {
  role: string;
  moduleKey: string;
}

export function UnifiedAccessMapTab() {
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [searchRaw, setSearchRaw] = useState('');
  const search = useDebouncedValue(searchRaw, 200);
  const [hiddenModules, setHiddenModules] = useState<Set<string>>(new Set());
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [hideEmptyRows, setHideEmptyRows] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await fetch('/api/users/permissions-audit/matrix');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setData((await r.json()) as MatrixData);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Modules actually present in matrix — preserves PERMISSION_CATEGORIES source order
  // and appends any matrix-only modules at the end.
  const allModules = useMemo(() => {
    if (!data) return [] as Array<{ key: string; label: string; permKeys: string[] }>;

    const permsByModule = new Map<string, string[]>();
    Object.keys(data.matrix).forEach((k) => {
      const { module: m } = classifyPerm(k);
      if (!permsByModule.has(m)) permsByModule.set(m, []);
      permsByModule.get(m)!.push(k);
    });

    const ordered: Array<{ key: string; label: string; permKeys: string[] }> = [];
    const seen = new Set<string>();
    for (const cat of PERMISSION_CATEGORIES) {
      if (permsByModule.has(cat.key)) {
        ordered.push({
          key: cat.key,
          label: cat.name,
          permKeys: permsByModule.get(cat.key)!
        });
        seen.add(cat.key);
      }
    }
    // Append any matrix-only modules we didn't find in PERMISSION_CATEGORIES.
    for (const [key, permKeys] of permsByModule) {
      if (!seen.has(key)) {
        ordered.push({ key, label: moduleLabel(key), permKeys });
      }
    }
    return ordered;
  }, [data]);

  const visibleModules = useMemo(
    () => allModules.filter((m) => !hiddenModules.has(m.key)),
    [allModules, hiddenModules]
  );

  // Split roles: super-admin row first, then everything else.
  const { superAdminRoles, otherRoles } = useMemo(() => {
    if (!data) return { superAdminRoles: [] as string[], otherRoles: [] as string[] };
    const supers: string[] = [];
    const rest: string[] = [];
    for (const role of data.roles) {
      const meta = data.roleMeta[role];
      const isSuper =
        meta?.isSystem === true &&
        /super[_-]?admin/i.test(role + ' ' + (meta?.name ?? ''));
      if (isSuper) supers.push(role);
      else rest.push(role);
    }
    return { superAdminRoles: supers, otherRoles: rest };
  }, [data]);

  // Per-role per-module stats, memoised so we don't recompute while filtering.
  const statsByRole = useMemo(() => {
    const out = new Map<string, Map<string, CellStats>>();
    if (!data) return out;
    for (const role of data.roles) {
      const inner = new Map<string, CellStats>();
      for (const mod of allModules) {
        inner.set(mod.key, computeCellStats(data.matrix, role, mod.key, mod.permKeys));
      }
      out.set(role, inner);
    }
    return out;
  }, [data, allModules]);

  const filteredOtherRoles = useMemo(() => {
    if (!data) return [] as string[];
    const needle = search.trim().toLowerCase();
    return otherRoles.filter((role) => {
      const meta = data.roleMeta[role];
      if (!meta) return false;
      if (needle) {
        const hay = `${meta.name} ${role}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      const rowStats = statsByRole.get(role);
      if (!rowStats) return false;

      if (conflictsOnly) {
        const anyConflict = visibleModules.some(
          (m) => (rowStats.get(m.key)?.conflicts.length ?? 0) > 0
        );
        if (!anyConflict) return false;
      }

      if (hideEmptyRows) {
        const anyGrant = visibleModules.some(
          (m) => (rowStats.get(m.key)?.grantedCount ?? 0) > 0
        );
        if (!anyGrant) return false;
      }
      return true;
    });
  }, [data, otherRoles, search, conflictsOnly, hideEmptyRows, statsByRole, visibleModules]);

  // Summary totals — computed over filtered rows so the header matches what you see.
  const summary = useMemo(() => {
    if (!data) {
      return { totalRoles: 0, totalModules: 0, totalConflicts: 0, affectedUsers: 0 };
    }
    const allRolesInView = [...superAdminRoles, ...filteredOtherRoles];
    let totalConflicts = 0;
    const affectedRoleSet = new Set<string>();
    for (const role of allRolesInView) {
      const rowStats = statsByRole.get(role);
      if (!rowStats) continue;
      for (const mod of visibleModules) {
        const c = rowStats.get(mod.key)?.conflicts ?? [];
        if (c.length > 0) {
          totalConflicts += c.length;
          affectedRoleSet.add(role);
        }
      }
    }
    const affectedUsers = Array.from(affectedRoleSet).reduce(
      (n, r) => n + (data.roleMeta[r]?.userCount ?? 0),
      0
    );
    return {
      totalRoles: allRolesInView.length,
      totalModules: visibleModules.length,
      totalConflicts,
      affectedUsers
    };
  }, [data, superAdminRoles, filteredOtherRoles, statsByRole, visibleModules]);

  const resetFilters = () => {
    setSearchRaw('');
    setHiddenModules(new Set());
    setConflictsOnly(false);
    setHideEmptyRows(false);
  };

  const toggleModuleHidden = (key: string) => {
    setHiddenModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Render states ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card>
        <CardContent className='flex items-center justify-center h-64'>
          <BeatLoader color='#6366f1' size={10} />
        </CardContent>
      </Card>
    );
  }
  if (err || !data) {
    return (
      <Card>
        <CardContent className='flex items-center justify-center h-64 text-destructive'>
          {err ?? 'No data returned from API'}
        </CardContent>
      </Card>
    );
  }

  const drawerStats =
    drawer && statsByRole.get(drawer.role)?.get(drawer.moduleKey);
  const drawerModule =
    drawer && allModules.find((m) => m.key === drawer.moduleKey);
  const drawerRoleMeta = drawer ? data.roleMeta[drawer.role] : null;
  const drawerIsSuper = drawer ? superAdminRoles.includes(drawer.role) : false;

  return (
    <div className='space-y-4'>
      {/* Summary header */}
      <Card>
        <CardHeader className='pb-3'>
          <div className='flex flex-col gap-2'>
            <div className='flex items-center justify-between gap-2 flex-wrap'>
              <div>
                <CardTitle className='text-base font-semibold'>
                  Unified Access Map
                </CardTitle>
                <p className='text-xs text-muted-foreground mt-1'>
                  One grid for every role × module. Status dot shows coverage, CRUD
                  chips show which verbs are granted, and a red triangle flags
                  permission conflicts (e.g. edit without view).
                </p>
              </div>
              <div className='flex items-center gap-2 flex-wrap'>
                <Badge variant='outline' className='text-xs'>
                  {summary.totalRoles} role{summary.totalRoles !== 1 ? 's' : ''}
                </Badge>
                <Badge variant='outline' className='text-xs'>
                  {summary.totalModules} module
                  {summary.totalModules !== 1 ? 's' : ''}
                </Badge>
                <Badge
                  variant='outline'
                  className={
                    summary.totalConflicts > 0
                      ? 'text-xs border-rose-400 bg-rose-50 text-rose-700'
                      : 'text-xs border-emerald-400 bg-emerald-50 text-emerald-700'
                  }
                >
                  <AlertTriangle className='h-3 w-3 mr-1' />
                  {summary.totalConflicts} conflict
                  {summary.totalConflicts !== 1 ? 's' : ''}
                </Badge>
                <Badge variant='outline' className='text-xs'>
                  <Users className='h-3 w-3 mr-1' />
                  {summary.affectedUsers} user
                  {summary.affectedUsers !== 1 ? 's' : ''} affected
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>

        {/* Filter bar */}
        <CardContent className='pt-0 border-t'>
          <div className='flex flex-wrap items-center gap-3 pt-3'>
            <div className='flex items-center gap-2'>
              <Filter className='h-3.5 w-3.5 text-muted-foreground' />
              <input
                type='text'
                value={searchRaw}
                onChange={(e) => setSearchRaw(e.target.value)}
                placeholder='Search roles…'
                className='h-8 px-2 text-xs border rounded-md bg-background w-[200px] focus:outline-none focus:ring-2 focus:ring-indigo-500'
              />
            </div>

            <div className='flex items-center gap-2'>
              <span className='text-xs text-muted-foreground whitespace-nowrap'>
                Hide module
              </span>
              <Select
                value=''
                onValueChange={(v) => {
                  if (v) toggleModuleHidden(v);
                }}
              >
                <SelectTrigger className='w-[220px] h-8 text-xs'>
                  <SelectValue placeholder='Select module to hide…' />
                </SelectTrigger>
                <SelectContent>
                  {allModules.map((m) => (
                    <SelectItem key={m.key} value={m.key}>
                      {hiddenModules.has(m.key) ? '✓ ' : ''}
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className='flex items-center gap-1.5 text-xs cursor-pointer select-none'>
              <input
                type='checkbox'
                checked={conflictsOnly}
                onChange={(e) => setConflictsOnly(e.target.checked)}
                className='h-3.5 w-3.5 accent-indigo-600'
              />
              Show conflicts only
            </label>

            <label className='flex items-center gap-1.5 text-xs cursor-pointer select-none'>
              <input
                type='checkbox'
                checked={hideEmptyRows}
                onChange={(e) => setHideEmptyRows(e.target.checked)}
                className='h-3.5 w-3.5 accent-indigo-600'
              />
              Hide empty rows
            </label>

            <Button
              size='sm'
              variant='outline'
              onClick={resetFilters}
              className='h-8 text-xs gap-1 ml-auto'
            >
              <RotateCcw className='h-3 w-3' /> Reset filters
            </Button>
          </div>

          {hiddenModules.size > 0 && (
            <div className='flex flex-wrap gap-1.5 pt-3'>
              <span className='text-[11px] text-muted-foreground'>Hidden:</span>
              {Array.from(hiddenModules).map((key) => (
                <Badge
                  key={key}
                  variant='outline'
                  className='text-[10px] gap-1 cursor-pointer hover:bg-destructive/10'
                  onClick={() => toggleModuleHidden(key)}
                >
                  {moduleLabel(key)}
                  <X className='h-2.5 w-2.5' />
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grid */}
      <Card>
        <CardContent className='p-0'>
          {visibleModules.length === 0 ? (
            <div className='flex items-center justify-center h-32 text-sm text-muted-foreground'>
              All modules hidden. Use the filter bar to bring them back.
            </div>
          ) : (
            <div className='overflow-auto max-h-[70vh] relative'>
              <table className='w-full border-collapse text-xs'>
                <thead className='sticky top-0 z-20 bg-muted/95 backdrop-blur'>
                  <tr>
                    <th className='sticky left-0 z-30 bg-muted/95 backdrop-blur text-left p-2 border-b border-r min-w-[220px] font-semibold'>
                      Role
                    </th>
                    {visibleModules.map((m) => (
                      <th
                        key={m.key}
                        className='text-left p-2 border-b border-r font-semibold min-w-[140px] max-w-[180px]'
                        title={m.key}
                      >
                        <div className='truncate'>{m.label}</div>
                        <div className='text-[10px] font-normal text-muted-foreground'>
                          {m.permKeys.length} perm
                          {m.permKeys.length !== 1 ? 's' : ''}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Super-admin rows first */}
                  {superAdminRoles.map((role) => {
                    const meta = data.roleMeta[role];
                    if (!meta) return null;
                    const rowStats = statsByRole.get(role);
                    return (
                      <tr
                        key={role}
                        className='border-l-4 border-l-amber-500 bg-amber-50/40'
                      >
                        <td className='sticky left-0 z-10 bg-amber-50/80 backdrop-blur border-b border-r p-2 align-top'>
                          <div className='flex items-start gap-2'>
                            <ShieldCheck className='h-4 w-4 text-amber-600 shrink-0 mt-0.5' />
                            <div className='min-w-0'>
                              <div className='font-semibold text-foreground truncate'>
                                {meta.name}
                              </div>
                              <div className='text-[10px] text-muted-foreground'>
                                {meta.userCount} user
                                {meta.userCount !== 1 ? 's' : ''}
                              </div>
                              <Badge
                                variant='outline'
                                className='mt-1 text-[9px] border-amber-400 bg-amber-100 text-amber-800 px-1 py-0'
                              >
                                Bypasses all RLS &amp; code permission checks
                              </Badge>
                            </div>
                          </div>
                        </td>
                        {visibleModules.map((m) => {
                          const s = rowStats?.get(m.key);
                          return (
                            <td
                              key={m.key}
                              className='border-b border-r p-2 align-top cursor-pointer hover:bg-amber-100/50 transition-colors'
                              onClick={() =>
                                setDrawer({ role, moduleKey: m.key })
                              }
                            >
                              <CellRender stats={s} superAdmin />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {/* Regular rows */}
                  {filteredOtherRoles.length === 0 ? (
                    <tr>
                      <td
                        colSpan={visibleModules.length + 1}
                        className='p-6 text-center text-muted-foreground text-sm'
                      >
                        No roles match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredOtherRoles.map((role) => {
                      const meta = data.roleMeta[role];
                      if (!meta) return null;
                      const rowStats = statsByRole.get(role);
                      return (
                        <tr key={role} className='hover:bg-muted/30'>
                          <td className='sticky left-0 z-10 bg-background hover:bg-muted/30 border-b border-r p-2 align-top'>
                            <div className='min-w-0'>
                              <div className='font-medium text-foreground truncate'>
                                {meta.name}
                              </div>
                              <div className='text-[10px] text-muted-foreground flex items-center gap-1'>
                                <Users className='h-2.5 w-2.5' />
                                {meta.userCount} user
                                {meta.userCount !== 1 ? 's' : ''}
                                {meta.isSystem && (
                                  <Badge
                                    variant='outline'
                                    className='text-[9px] px-1 py-0 ml-0.5'
                                  >
                                    system
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </td>
                          {visibleModules.map((m) => {
                            const s = rowStats?.get(m.key);
                            return (
                              <td
                                key={m.key}
                                className='border-b border-r p-2 align-top cursor-pointer hover:bg-indigo-50/60 transition-colors'
                                onClick={() =>
                                  setDrawer({ role, moduleKey: m.key })
                                }
                              >
                                <CellRender stats={s} />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className='p-3'>
          <button
            type='button'
            onClick={() => setLegendOpen((o) => !o)}
            className='text-xs font-medium text-muted-foreground hover:text-foreground'
          >
            {legendOpen ? '▼' : '▶'} Legend &amp; conflict rules
          </button>
          {legendOpen && (
            <div className='mt-3 grid gap-4 md:grid-cols-2 text-xs'>
              <div>
                <div className='font-semibold mb-1'>Status dot</div>
                <ul className='space-y-1'>
                  <li className='flex items-center gap-2'>
                    <span className='inline-block h-2.5 w-2.5 rounded-full bg-slate-300' />
                    Nothing granted
                  </li>
                  <li className='flex items-center gap-2'>
                    <span className='inline-block h-2.5 w-2.5 rounded-full bg-amber-500' />
                    1–49% granted
                  </li>
                  <li className='flex items-center gap-2'>
                    <span className='inline-block h-2.5 w-2.5 rounded-full bg-sky-500' />
                    50–99% granted
                  </li>
                  <li className='flex items-center gap-2'>
                    <span className='inline-block h-2.5 w-2.5 rounded-full bg-emerald-500' />
                    100% granted
                  </li>
                </ul>
                <div className='font-semibold mt-3 mb-1'>CRUD chips</div>
                <ul className='space-y-1'>
                  <li>
                    <span className='font-mono'>C</span> Create ·{' '}
                    <span className='font-mono'>R</span> Read/View ·{' '}
                    <span className='font-mono'>U</span> Update/Edit ·{' '}
                    <span className='font-mono'>D</span> Delete
                  </li>
                  <li>Green = any matching permission granted, grey = none.</li>
                </ul>
              </div>
              <div>
                <div className='font-semibold mb-1'>Conflict rules</div>
                <ul className='space-y-1'>
                  <li>
                    <b className='text-rose-700'>Create-blind</b> — Create without
                    View/Read.
                  </li>
                  <li>
                    <b className='text-rose-700'>Edit-blind</b> — Edit/Update without
                    View/Read.
                  </li>
                  <li>
                    <b className='text-rose-700'>Delete-blind</b> — Delete without
                    View/Read.
                  </li>
                  <li>
                    <b className='text-amber-700'>Delete-without-Create</b> — Delete
                    without Create (often OK, still flagged).
                  </li>
                  <li>
                    <b className='text-rose-700'>Export-blind</b> — Export without
                    View/Read.
                  </li>
                  <li>
                    <b className='text-rose-700'>Approve-blind</b> — Approve without
                    View/Read.
                  </li>
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail drawer */}
      <Sheet
        open={drawer !== null}
        onOpenChange={(o) => {
          if (!o) setDrawer(null);
        }}
      >
        <SheetContent className='sm:max-w-lg overflow-y-auto'>
          {drawer && drawerRoleMeta && drawerStats && drawerModule ? (
            <>
              <SheetHeader>
                <SheetTitle className='flex items-center gap-2'>
                  {drawerIsSuper && (
                    <ShieldCheck className='h-4 w-4 text-amber-600' />
                  )}
                  {drawerRoleMeta.name}
                </SheetTitle>
                <SheetDescription>
                  Access to <b>{drawerModule.label}</b> —{' '}
                  {statusDotLabel(
                    drawerStats.grantedCount,
                    drawerStats.totalCount
                  )}
                </SheetDescription>
              </SheetHeader>

              <div className='mt-4 space-y-4'>
                {drawerIsSuper && (
                  <div className='rounded-md border border-amber-400 bg-amber-50 p-2 text-xs text-amber-800'>
                    Super-admins bypass all RLS and code-level permission checks.
                    CRUD chips below are informational only.
                  </div>
                )}

                <div>
                  <div className='text-xs font-semibold mb-2'>CRUD breakdown</div>
                  <div className='grid grid-cols-4 gap-2'>
                    {(['C', 'R', 'U', 'D'] as const).map((v) => {
                      const s = drawerStats.verbs[v];
                      const fully = s.total > 0 && s.granted === s.total;
                      const none = s.granted === 0;
                      const partial = !fully && !none;
                      const cls = fully
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                        : partial
                        ? 'border-amber-400 bg-amber-50 text-amber-700'
                        : 'border-slate-300 bg-slate-50 text-slate-600';
                      return (
                        <div
                          key={v}
                          className={`rounded-md border p-2 text-center ${cls}`}
                        >
                          <div className='font-mono text-base font-bold'>{v}</div>
                          <div className='text-[10px]'>
                            {s.granted}/{s.total}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {drawerStats.conflicts.length > 0 && (
                  <div>
                    <div className='text-xs font-semibold mb-2 flex items-center gap-1'>
                      <AlertTriangle className='h-3.5 w-3.5 text-rose-600' />
                      Conflict warnings
                    </div>
                    <div className='space-y-1.5'>
                      {drawerStats.conflicts.map((c) => (
                        <div
                          key={c.code}
                          className={
                            c.severity === 'red'
                              ? 'rounded-md border border-rose-300 bg-rose-50 p-2 text-xs'
                              : 'rounded-md border border-amber-300 bg-amber-50 p-2 text-xs'
                          }
                        >
                          <div
                            className={
                              c.severity === 'red'
                                ? 'font-semibold text-rose-700'
                                : 'font-semibold text-amber-700'
                            }
                          >
                            {c.label}
                          </div>
                          <div className='text-muted-foreground mt-0.5'>
                            {c.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className='text-xs font-semibold mb-2'>
                    Permission keys ({drawerModule.permKeys.length})
                  </div>
                  <div className='rounded-md border divide-y max-h-[40vh] overflow-auto'>
                    {drawerModule.permKeys.map((pk) => {
                      const granted = data.matrix[pk]?.[drawer.role] === true;
                      const { action, submodule } = classifyPerm(pk);
                      return (
                        <div
                          key={pk}
                          className='flex items-center gap-2 px-2 py-1.5 text-[11px]'
                        >
                          <span
                            className={
                              granted
                                ? 'inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] shrink-0'
                                : 'inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-slate-500 text-[10px] shrink-0'
                            }
                          >
                            {granted ? '✓' : '✗'}
                          </span>
                          <span className='font-mono text-foreground/90 truncate flex-1'>
                            {pk}
                          </span>
                          <span className='text-[10px] text-muted-foreground shrink-0'>
                            {action}
                            {submodule ? ` · ${submodule}` : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className='flex items-center justify-between text-xs border-t pt-3'>
                  <div className='text-muted-foreground flex items-center gap-1'>
                    <Users className='h-3 w-3' />
                    {drawerRoleMeta.userCount} user
                    {drawerRoleMeta.userCount !== 1 ? 's' : ''} in this role
                  </div>
                  <div className='flex items-center gap-2'>
                    <Link href='/users/role-management'>
                      <Button size='sm' variant='outline' className='h-7 text-xs gap-1'>
                        Edit role <ExternalLink className='h-3 w-3' />
                      </Button>
                    </Link>
                    <Link
                      href={`/users/permissions-audit?tab=resolver&role=${encodeURIComponent(
                        drawer.role
                      )}`}
                    >
                      <Button size='sm' className='h-7 text-xs gap-1'>
                        See users <ExternalLink className='h-3 w-3' />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Cell renderer ────────────────────────────────────────────────────────────

function CellRender({
  stats,
  superAdmin
}: {
  stats?: CellStats;
  superAdmin?: boolean;
}) {
  if (!stats) {
    return <div className='text-[10px] text-muted-foreground'>—</div>;
  }
  return (
    <div className='relative'>
      {stats.conflicts.length > 0 && (
        <AlertTriangle
          className={
            stats.conflicts.some((c) => c.severity === 'red')
              ? 'absolute top-0 right-0 h-3 w-3 text-rose-600'
              : 'absolute top-0 right-0 h-3 w-3 text-amber-600'
          }
        />
      )}
      <div className='flex items-center gap-1.5'>
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${statusDotClass(
            stats.grantedCount,
            stats.totalCount
          )}`}
          title={statusDotLabel(stats.grantedCount, stats.totalCount)}
        />
        {superAdmin && (
          <span className='text-[9px] font-semibold text-amber-700 uppercase tracking-wide'>
            Full
          </span>
        )}
      </div>
      <div className='flex items-center gap-0.5 mt-1'>
        {(['C', 'R', 'U', 'D'] as const).map((v) => {
          const s = stats.verbs[v];
          const any = superAdmin ? true : s.granted > 0;
          const cls = any
            ? 'inline-flex items-center justify-center h-3.5 w-3.5 rounded-sm bg-emerald-500 text-white text-[9px] font-semibold'
            : 'inline-flex items-center justify-center h-3.5 w-3.5 rounded-sm bg-slate-200 text-slate-500 text-[9px] font-semibold';
          return (
            <span key={v} className={cls} title={`${v}: ${s.granted}/${s.total}`}>
              {v}
            </span>
          );
        })}
      </div>
    </div>
  );
}
