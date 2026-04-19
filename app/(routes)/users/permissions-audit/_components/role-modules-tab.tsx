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
  AlertTriangle,
  CheckCircle,
  Download,
  ExternalLink,
  Eye,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  Users
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

// ─── Action-verb visual catalog (full class names for Tailwind JIT) ──────────

type VerbStyle = {
  label: string;
  icon: typeof Eye;
  activeBgClass: string;
  activeTextClass: string;
  activeBorderClass: string;
};

const VERB_STYLES: Record<string, VerbStyle> = {
  view: {
    label: 'View',
    icon: Eye,
    activeBgClass: 'bg-emerald-100',
    activeTextClass: 'text-emerald-700',
    activeBorderClass: 'border-emerald-300'
  },
  read: {
    label: 'Read',
    icon: Eye,
    activeBgClass: 'bg-emerald-100',
    activeTextClass: 'text-emerald-700',
    activeBorderClass: 'border-emerald-300'
  },
  create: {
    label: 'Create',
    icon: Plus,
    activeBgClass: 'bg-sky-100',
    activeTextClass: 'text-sky-700',
    activeBorderClass: 'border-sky-300'
  },
  edit: {
    label: 'Edit',
    icon: Pencil,
    activeBgClass: 'bg-amber-100',
    activeTextClass: 'text-amber-700',
    activeBorderClass: 'border-amber-300'
  },
  update: {
    label: 'Update',
    icon: Pencil,
    activeBgClass: 'bg-amber-100',
    activeTextClass: 'text-amber-700',
    activeBorderClass: 'border-amber-300'
  },
  delete: {
    label: 'Delete',
    icon: Trash2,
    activeBgClass: 'bg-rose-100',
    activeTextClass: 'text-rose-700',
    activeBorderClass: 'border-rose-300'
  },
  approve: {
    label: 'Approve',
    icon: CheckCircle,
    activeBgClass: 'bg-violet-100',
    activeTextClass: 'text-violet-700',
    activeBorderClass: 'border-violet-300'
  },
  export: {
    label: 'Export',
    icon: Download,
    activeBgClass: 'bg-slate-200',
    activeTextClass: 'text-slate-700',
    activeBorderClass: 'border-slate-300'
  },
  assign: {
    label: 'Assign',
    icon: Plus,
    activeBgClass: 'bg-indigo-100',
    activeTextClass: 'text-indigo-700',
    activeBorderClass: 'border-indigo-300'
  },
  manage: {
    label: 'Manage',
    icon: ShieldAlert,
    activeBgClass: 'bg-fuchsia-100',
    activeTextClass: 'text-fuchsia-700',
    activeBorderClass: 'border-fuchsia-300'
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Split a dot-notation permission key into module / submodule / action.
 *  - 2 segments: users.view            → { users, '', view }
 *  - 3 segments: organizations.institutions.view
 *  - 4 segments: organizations.course.mappings.view → submodule = "course › mappings"
 */
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

// Verbs considered "view / read" — used to detect the conflict
// (can modify but can't see).
const VIEW_VERBS = new Set(['view', 'read']);
// Verbs considered "modify" — any of these without view = conflict.
const MODIFY_VERBS = new Set(['create', 'edit', 'update', 'delete']);

// Progress bar color bands — full Tailwind class names so JIT picks them up.
function progressBarClass(granted: number, total: number) {
  if (total === 0 || granted === 0) return 'bg-slate-300';
  const pct = (granted / total) * 100;
  if (pct >= 100) return 'bg-emerald-500';
  if (pct >= 51) return 'bg-sky-500';
  return 'bg-amber-500';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RoleModulesTab() {
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [role, setRole] = useState<string>('');
  const [onlyGranted, setOnlyGranted] = useState<boolean>(true);

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

  // Sorted role list for the dropdown (most users first, then name).
  const sortedRoles = useMemo(() => {
    if (!data) return [] as Array<{ key: string; meta: RoleMeta }>;
    return data.roles
      .map((r) => ({ key: r, meta: data.roleMeta[r] }))
      .filter((r): r is { key: string; meta: RoleMeta } => Boolean(r.meta))
      .sort((a, b) => {
        if (b.meta.userCount !== a.meta.userCount) {
          return b.meta.userCount - a.meta.userCount;
        }
        return a.meta.name.localeCompare(b.meta.name);
      });
  }, [data]);

  // Per-module breakdown for the selected role. Order mirrors PERMISSION_CATEGORIES.
  const moduleBreakdown = useMemo(() => {
    if (!data || !role) return [];
    return PERMISSION_CATEGORIES.map((cat) => {
      const perms = cat.permissions.map((p) => {
        const granted = data.matrix[p.key]?.[role] === true;
        const { action } = classifyPerm(p.key);
        return { key: p.key, label: p.label, action, granted };
      });
      // Collect verbs present (unique) with their granted-state.
      const verbMap = new Map<string, boolean>();
      for (const p of perms) {
        const prev = verbMap.get(p.action) ?? false;
        verbMap.set(p.action, prev || p.granted);
      }
      const grantedCount = perms.filter((p) => p.granted).length;
      const totalCount = perms.length;

      // Conflict detection — can modify but can't view/read.
      const hasModify = Array.from(verbMap.entries()).some(
        ([v, g]) => g && MODIFY_VERBS.has(v)
      );
      // Does this module define any view/read perm at all?
      const hasViewPerm = Array.from(verbMap.keys()).some((v) =>
        VIEW_VERBS.has(v)
      );
      const viewGranted = Array.from(verbMap.entries()).some(
        ([v, g]) => g && VIEW_VERBS.has(v)
      );
      const conflict = hasModify && hasViewPerm && !viewGranted;

      return {
        key: cat.key,
        name: cat.name,
        perms,
        verbMap,
        grantedCount,
        totalCount,
        conflict
      };
    });
  }, [data, role]);

  // Summary numbers (across the whole role, not filtered).
  const summary = useMemo(() => {
    let totalGranted = 0;
    let touchedModules = 0;
    let fullyUnlocked = 0;
    let partial = 0;
    let locked = 0;
    for (const m of moduleBreakdown) {
      if (m.totalCount === 0) continue;
      totalGranted += m.grantedCount;
      if (m.grantedCount > 0) touchedModules += 1;
      if (m.grantedCount === m.totalCount) fullyUnlocked += 1;
      else if (m.grantedCount > 0) partial += 1;
      else locked += 1;
    }
    return { totalGranted, touchedModules, fullyUnlocked, partial, locked };
  }, [moduleBreakdown]);

  const selectedRoleMeta: RoleMeta | undefined = role
    ? data?.roleMeta[role]
    : undefined;

  // Visible module list (respects the "show only granted" toggle).
  const visibleModules = onlyGranted
    ? moduleBreakdown.filter((m) => m.grantedCount > 0)
    : moduleBreakdown;

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

  return (
    <div className='space-y-4'>
      {/* Role picker */}
      <Card>
        <CardHeader className='pb-3'>
          <div className='flex flex-col gap-3'>
            <div>
              <CardTitle className='text-base font-semibold'>
                Role → Modules (Role-Centric Lens)
              </CardTitle>
              <p className='text-xs text-muted-foreground mt-1'>
                Pick a role to see which modules it can reach and what actions
                (C/R/U/D) are granted. Flip the toggle to reveal denials.
              </p>
            </div>
            <div className='flex flex-wrap items-center gap-3'>
              <div className='flex items-center gap-2'>
                <span className='text-xs text-muted-foreground whitespace-nowrap'>
                  Role
                </span>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className='w-[300px] h-8 text-xs'>
                    <SelectValue placeholder='Select a role' />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedRoles.map(({ key, meta }) => (
                      <SelectItem key={key} value={key}>
                        {meta.name}
                        <span className='text-muted-foreground ml-1'>
                          ({meta.userCount} user{meta.userCount !== 1 ? 's' : ''})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='flex items-center gap-2'>
                <label className='flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none'>
                  <input
                    type='checkbox'
                    className='h-3.5 w-3.5 rounded border-slate-300'
                    checked={onlyGranted}
                    onChange={(e) => setOnlyGranted(e.target.checked)}
                  />
                  Show only granted
                </label>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Empty state */}
      {!role && (
        <Card>
          <CardContent className='flex flex-col items-center justify-center h-48 gap-2 text-center'>
            <Users className='h-8 w-8 text-muted-foreground/60' />
            <p className='text-sm font-medium'>
              Pick a role above to see what they can access.
            </p>
            <p className='text-xs text-muted-foreground max-w-md'>
              You&apos;ll get a module-by-module breakdown with C/R/U/D chips,
              fill ratios, and conflict warnings for roles that can modify data
              but not see it.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Role header + summary + grid */}
      {role && selectedRoleMeta && (
        <>
          {/* Role header */}
          <Card>
            <CardContent className='pt-5 pb-4'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div className='flex items-center gap-3'>
                  <div>
                    <div className='text-xl font-semibold leading-tight'>
                      {selectedRoleMeta.name}
                    </div>
                    <div className='flex items-center gap-2 mt-1'>
                      <Badge variant='outline' className='text-[10px] gap-1'>
                        <Users className='h-3 w-3' />
                        {selectedRoleMeta.userCount} user
                        {selectedRoleMeta.userCount !== 1 ? 's' : ''}
                      </Badge>
                      <Badge
                        variant={
                          selectedRoleMeta.isSystem ? 'secondary' : 'outline'
                        }
                        className='text-[10px]'
                      >
                        {selectedRoleMeta.isSystem
                          ? 'System role'
                          : 'Custom role'}
                      </Badge>
                    </div>
                  </div>
                </div>
                <Link href='/users/role-management'>
                  <Button size='sm' variant='outline' className='h-8 text-xs gap-1'>
                    Edit role <ExternalLink className='h-3 w-3' />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Summary bar */}
          <Card>
            <CardContent className='py-3'>
              <div className='flex flex-wrap items-center gap-x-6 gap-y-1 text-xs'>
                <div>
                  <span className='font-semibold text-foreground'>
                    {summary.totalGranted}
                  </span>{' '}
                  <span className='text-muted-foreground'>
                    permissions granted across
                  </span>{' '}
                  <span className='font-semibold text-foreground'>
                    {summary.touchedModules}
                  </span>{' '}
                  <span className='text-muted-foreground'>modules</span>
                </div>
                <div className='flex items-center gap-1'>
                  <span className='inline-block h-2 w-2 rounded-full bg-emerald-500' />
                  <span className='font-semibold text-foreground'>
                    {summary.fullyUnlocked}
                  </span>
                  <span className='text-muted-foreground'>fully unlocked</span>
                </div>
                <div className='flex items-center gap-1'>
                  <span className='inline-block h-2 w-2 rounded-full bg-amber-500' />
                  <span className='font-semibold text-foreground'>
                    {summary.partial}
                  </span>
                  <span className='text-muted-foreground'>partial</span>
                </div>
                <div className='flex items-center gap-1'>
                  <span className='inline-block h-2 w-2 rounded-full bg-slate-300' />
                  <span className='font-semibold text-foreground'>
                    {summary.locked}
                  </span>
                  <span className='text-muted-foreground'>locked</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Module grid */}
          {visibleModules.length === 0 ? (
            <Card>
              <CardContent className='flex items-center justify-center h-32 text-sm text-muted-foreground'>
                {onlyGranted
                  ? 'This role has no granted permissions. Toggle "Show only granted" off to see what is denied.'
                  : 'No modules defined.'}
              </CardContent>
            </Card>
          ) : (
            <div className='grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3'>
              {visibleModules.map((m) => {
                // Primary CRUD verbs row.
                const crudVerbs = ['create', 'read', 'update', 'delete'];
                // Extra verbs present in this module beyond the CRUD core.
                const extraVerbs = Array.from(m.verbMap.keys())
                  .filter(
                    (v) =>
                      !crudVerbs.includes(v) &&
                      v !== 'view' &&
                      v !== 'edit' &&
                      v !== ''
                  )
                  .sort();

                // For the CRUD row we map read→read|view, update→update|edit.
                const crudStates: Array<{
                  letter: string;
                  granted: boolean;
                  verbKey: string;
                }> = [
                  {
                    letter: 'C',
                    granted: m.verbMap.get('create') === true,
                    verbKey: 'create'
                  },
                  {
                    letter: 'R',
                    granted:
                      m.verbMap.get('read') === true ||
                      m.verbMap.get('view') === true,
                    verbKey: 'view'
                  },
                  {
                    letter: 'U',
                    granted:
                      m.verbMap.get('update') === true ||
                      m.verbMap.get('edit') === true,
                    verbKey: 'edit'
                  },
                  {
                    letter: 'D',
                    granted: m.verbMap.get('delete') === true,
                    verbKey: 'delete'
                  }
                ];

                const barClass = progressBarClass(m.grantedCount, m.totalCount);
                const pct =
                  m.totalCount === 0
                    ? 0
                    : Math.round((m.grantedCount / m.totalCount) * 100);

                return (
                  <Card key={m.key}>
                    <CardHeader className='pb-2'>
                      <div className='flex items-start justify-between gap-2'>
                        <div className='min-w-0'>
                          <CardTitle className='text-sm font-semibold truncate'>
                            {m.name}
                          </CardTitle>
                          <div className='text-[11px] text-muted-foreground mt-0.5'>
                            {m.grantedCount} of {m.totalCount} granted
                            {m.totalCount > 0 && (
                              <span className='ml-1'>({pct}%)</span>
                            )}
                          </div>
                        </div>
                        {m.conflict && (
                          <span
                            title='Can modify but not see this data — review.'
                            className='flex items-center text-rose-600'
                          >
                            <AlertTriangle className='h-4 w-4' />
                          </span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className='pt-0 space-y-2.5'>
                      {/* CRUD chips */}
                      <div className='flex items-center gap-1.5'>
                        {crudStates.map((chip) => {
                          const verb = VERB_STYLES[chip.verbKey];
                          if (chip.granted && verb) {
                            return (
                              <span
                                key={chip.letter}
                                className={`inline-flex items-center justify-center h-6 w-6 rounded-md border text-[11px] font-semibold ${verb.activeBgClass} ${verb.activeTextClass} ${verb.activeBorderClass}`}
                              >
                                {chip.letter}
                              </span>
                            );
                          }
                          return (
                            <span
                              key={chip.letter}
                              className='inline-flex items-center justify-center h-6 w-6 rounded-md border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-400'
                            >
                              {chip.letter}
                            </span>
                          );
                        })}
                        {extraVerbs.map((v) => {
                          const style = VERB_STYLES[v];
                          const granted = m.verbMap.get(v) === true;
                          if (granted && style) {
                            return (
                              <Badge
                                key={v}
                                variant='outline'
                                className={`text-[10px] h-6 px-1.5 ${style.activeBgClass} ${style.activeTextClass} ${style.activeBorderClass}`}
                              >
                                {style.label}
                              </Badge>
                            );
                          }
                          return (
                            <Badge
                              key={v}
                              variant='outline'
                              className='text-[10px] h-6 px-1.5 border-slate-200 bg-slate-50 text-slate-400'
                            >
                              {style?.label ?? v}
                            </Badge>
                          );
                        })}
                      </div>

                      {/* Progress bar */}
                      <div className='h-1.5 w-full rounded-full overflow-hidden bg-slate-100'>
                        <div
                          className={`h-full transition-all ${barClass}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {/* Collapsible permission details */}
                      <details>
                        <summary className='text-[10px] text-muted-foreground cursor-pointer hover:text-foreground select-none'>
                          {m.perms.length} permission
                          {m.perms.length !== 1 ? 's' : ''} · click to expand
                        </summary>
                        <div className='mt-1.5 space-y-0.5'>
                          {m.perms.map((p) => (
                            <div
                              key={p.key}
                              className='flex items-start gap-1.5 text-[11px]'
                            >
                              {p.granted ? (
                                <span className='text-emerald-600 font-bold mt-0.5'>
                                  ✓
                                </span>
                              ) : (
                                <span className='text-slate-300 font-bold mt-0.5'>
                                  ✗
                                </span>
                              )}
                              <div className='flex-1 min-w-0'>
                                <div
                                  className={
                                    p.granted
                                      ? 'text-foreground'
                                      : 'text-muted-foreground'
                                  }
                                >
                                  {p.label}
                                </div>
                                <div className='font-mono text-[10px] text-muted-foreground/70 truncate'>
                                  {p.key}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
