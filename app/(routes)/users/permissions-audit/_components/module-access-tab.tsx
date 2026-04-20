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
  borderClass: string;
  iconClass: string;
  hoverClass: string;
};

const VERB_STYLES: Record<string, VerbStyle> = {
  view: {
    label: 'View',
    icon: Eye,
    borderClass: 'border-l-emerald-500',
    iconClass: 'text-emerald-600',
    hoverClass: 'hover:bg-emerald-50 hover:border-emerald-300'
  },
  read: {
    label: 'Read',
    icon: Eye,
    borderClass: 'border-l-emerald-500',
    iconClass: 'text-emerald-600',
    hoverClass: 'hover:bg-emerald-50 hover:border-emerald-300'
  },
  create: {
    label: 'Create',
    icon: Plus,
    borderClass: 'border-l-sky-500',
    iconClass: 'text-sky-600',
    hoverClass: 'hover:bg-sky-50 hover:border-sky-300'
  },
  edit: {
    label: 'Edit',
    icon: Pencil,
    borderClass: 'border-l-amber-500',
    iconClass: 'text-amber-600',
    hoverClass: 'hover:bg-amber-50 hover:border-amber-300'
  },
  update: {
    label: 'Update',
    icon: Pencil,
    borderClass: 'border-l-amber-500',
    iconClass: 'text-amber-600',
    hoverClass: 'hover:bg-amber-50 hover:border-amber-300'
  },
  delete: {
    label: 'Delete',
    icon: Trash2,
    borderClass: 'border-l-rose-500',
    iconClass: 'text-rose-600',
    hoverClass: 'hover:bg-rose-50 hover:border-rose-300'
  },
  approve: {
    label: 'Approve',
    icon: CheckCircle,
    borderClass: 'border-l-violet-500',
    iconClass: 'text-violet-600',
    hoverClass: 'hover:bg-violet-50 hover:border-violet-300'
  },
  export: {
    label: 'Export',
    icon: Download,
    borderClass: 'border-l-slate-500',
    iconClass: 'text-slate-600',
    hoverClass: 'hover:bg-slate-50 hover:border-slate-300'
  },
  assign: {
    label: 'Assign',
    icon: Plus,
    borderClass: 'border-l-indigo-500',
    iconClass: 'text-indigo-600',
    hoverClass: 'hover:bg-indigo-50 hover:border-indigo-300'
  },
  manage: {
    label: 'Manage',
    icon: ShieldAlert,
    borderClass: 'border-l-fuchsia-500',
    iconClass: 'text-fuchsia-600',
    hoverClass: 'hover:bg-fuchsia-50 hover:border-fuchsia-300'
  }
};

const ACTION_ORDER = [
  'view',
  'read',
  'create',
  'assign',
  'edit',
  'update',
  'delete',
  'approve',
  'export',
  'manage'
];

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

function verbFor(action: string): VerbStyle {
  return (
    VERB_STYLES[action] ?? {
      label: action.replace(/_/g, ' ') || '(action)',
      icon: ShieldAlert,
      borderClass: 'border-l-slate-500',
      iconClass: 'text-slate-600',
      hoverClass: 'hover:bg-slate-50 hover:border-slate-300'
    }
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ModuleAccessTab() {
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [module, setModule] = useState<string>('');
  const [submodule, setSubmodule] = useState<string>('__all__');

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

  // Modules present in the matrix (auto-discovered)
  const modules = useMemo(() => {
    if (!data) return [] as Array<{ key: string; label: string; count: number }>;
    const byModule = new Map<string, number>();
    Object.keys(data.matrix).forEach((k) => {
      const { module: m } = classifyPerm(k);
      byModule.set(m, (byModule.get(m) ?? 0) + 1);
    });
    return Array.from(byModule.entries())
      .map(([key, count]) => ({ key, label: moduleLabel(key), count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data]);

  // Auto-select first module once data arrives
  useEffect(() => {
    if (!module && modules.length > 0) setModule(modules[0].key);
  }, [modules, module]);

  // Sub-modules for the selected module
  const submodules = useMemo(() => {
    if (!data || !module) return [] as string[];
    const set = new Set<string>();
    Object.keys(data.matrix).forEach((k) => {
      const c = classifyPerm(k);
      if (c.module === module) set.add(c.submodule || '__root__');
    });
    return Array.from(set).sort();
  }, [data, module]);

  // Permissions in-scope, grouped by action verb
  const groupedByAction = useMemo(() => {
    const acc = new Map<string, Array<{ permKey: string; submodule: string }>>();
    if (!data || !module) return acc;
    Object.keys(data.matrix).forEach((k) => {
      const c = classifyPerm(k);
      if (c.module !== module) return;
      if (submodule !== '__all__') {
        const normalized = c.submodule || '__root__';
        if (normalized !== submodule) return;
      }
      if (!acc.has(c.action)) acc.set(c.action, []);
      acc.get(c.action)!.push({ permKey: k, submodule: c.submodule });
    });
    return acc;
  }, [data, module, submodule]);

  // For a bucket of perm keys: return roles that have ANY of them granted,
  // sorted by user-count descending (most impactful first).
  const rolesWithAccess = (
    permKeys: string[]
  ): Array<{ role: string; meta: RoleMeta }> => {
    if (!data) return [];
    const out: Array<{ role: string; meta: RoleMeta }> = [];
    for (const role of data.roles) {
      const granted = permKeys.some(
        (pk) => data.matrix[pk]?.[role] === true
      );
      if (granted) {
        const meta = data.roleMeta[role];
        if (meta) out.push({ role, meta });
      }
    }
    return out.sort((a, b) => b.meta.userCount - a.meta.userCount);
  };

  // CSV export of the current scope
  const exportCsv = () => {
    if (!data || groupedByAction.size === 0) return;
    const header = ['Module', 'Sub-module', 'Action', 'Permission Key', 'Roles Granted', 'Total Users'];
    const rows: string[][] = [header];
    for (const [action, perms] of groupedByAction) {
      for (const { permKey, submodule: sm } of perms) {
        const grantedRoles = (data.roles || []).filter(
          (r) => data.matrix[permKey]?.[r] === true
        );
        const roleLabels = grantedRoles.map(
          (r) => `${data.roleMeta[r]?.name ?? r} (${data.roleMeta[r]?.userCount ?? 0})`
        );
        const totalUsers = grantedRoles.reduce(
          (n, r) => n + (data.roleMeta[r]?.userCount ?? 0),
          0
        );
        rows.push([
          moduleLabel(module),
          sm || '(root)',
          action,
          permKey,
          roleLabels.join('; '),
          String(totalUsers)
        ]);
      }
    }
    const csv = rows
      .map((r) =>
        r
          .map((cell) => {
            const needsQuote = /[",\n]/.test(cell);
            const escaped = cell.replace(/"/g, '""');
            return needsQuote ? `"${escaped}"` : escaped;
          })
          .join(',')
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `module-access-${module}${
      submodule !== '__all__' && submodule !== '__root__' ? `-${submodule}` : ''
    }.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  const actionKeys = Array.from(groupedByAction.keys()).sort((a, b) => {
    const ai = ACTION_ORDER.indexOf(a);
    const bi = ACTION_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const totalPerms = Array.from(groupedByAction.values()).reduce(
    (n, arr) => n + arr.length,
    0
  );

  return (
    <div className='space-y-4'>
      {/* Scope picker */}
      <Card>
        <CardHeader className='pb-3'>
          <div className='flex flex-col gap-3'>
            <div>
              <CardTitle className='text-base font-semibold'>
                Module → Roles (Inverse Access Lens)
              </CardTitle>
              <p className='text-xs text-muted-foreground mt-1'>
                Pick a module (and optional sub-module) to see exactly which roles can view,
                create, edit, or delete. User counts shown per role; click a role to open it
                in User Resolver.
              </p>
            </div>
            <div className='flex flex-wrap items-center gap-3'>
              <div className='flex items-center gap-2'>
                <span className='text-xs text-muted-foreground whitespace-nowrap'>
                  Module
                </span>
                <Select
                  value={module}
                  onValueChange={(v) => {
                    setModule(v);
                    setSubmodule('__all__');
                  }}
                >
                  <SelectTrigger className='w-[260px] h-8 text-xs'>
                    <SelectValue placeholder='Select module' />
                  </SelectTrigger>
                  <SelectContent>
                    {modules.map((m) => (
                      <SelectItem key={m.key} value={m.key}>
                        {m.label}
                        <span className='text-muted-foreground ml-1'>({m.count})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {submodules.length > 1 && (
                <div className='flex items-center gap-2'>
                  <span className='text-xs text-muted-foreground whitespace-nowrap'>
                    Sub-module
                  </span>
                  <Select value={submodule} onValueChange={setSubmodule}>
                    <SelectTrigger className='w-[260px] h-8 text-xs'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='__all__'>All sub-modules</SelectItem>
                      {submodules.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s === '__root__' ? '(root)' : s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className='ml-auto flex items-center gap-2'>
                <Button
                  size='sm'
                  variant='outline'
                  className='h-8 text-xs gap-1'
                  onClick={exportCsv}
                  disabled={actionKeys.length === 0}
                >
                  <Download className='h-3 w-3' /> Export CSV
                </Button>
                <Link href='/users/role-management'>
                  <Button size='sm' variant='outline' className='h-8 text-xs gap-1'>
                    Edit roles <ExternalLink className='h-3 w-3' />
                  </Button>
                </Link>
              </div>
            </div>

            <div className='text-xs text-muted-foreground'>
              Scope:&nbsp;
              <span className='font-medium text-foreground'>{moduleLabel(module)}</span>
              {submodule !== '__all__' && submodule !== '__root__' && (
                <>
                  {' '}
                  ›{' '}
                  <span className='font-medium text-foreground'>{submodule}</span>
                </>
              )}
              <span className='mx-2'>·</span>
              {totalPerms} permission{totalPerms !== 1 ? 's' : ''} across{' '}
              {actionKeys.length} action{actionKeys.length !== 1 ? 's' : ''}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Action cards */}
      {actionKeys.length === 0 ? (
        <Card>
          <CardContent className='flex items-center justify-center h-32 text-sm text-muted-foreground'>
            No permissions defined for this scope.
          </CardContent>
        </Card>
      ) : (
        <div className='grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3'>
          {actionKeys.map((action) => {
            const perms = groupedByAction.get(action) ?? [];
            const permKeys = perms.map((p) => p.permKey);
            const rolesGranted = rolesWithAccess(permKeys);
            const totalUsers = rolesGranted.reduce(
              (n, r) => n + r.meta.userCount,
              0
            );
            const verb = verbFor(action);
            const Icon = verb.icon;
            return (
              <Card key={action} className={`border-l-4 ${verb.borderClass}`}>
                <CardHeader className='pb-2'>
                  <div className='flex items-center justify-between gap-2'>
                    <div className='flex items-center gap-2'>
                      <Icon className={`h-4 w-4 ${verb.iconClass}`} />
                      <CardTitle className='text-sm font-semibold capitalize'>
                        {verb.label}
                      </CardTitle>
                    </div>
                    <div className='flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap'>
                      <Users className='h-3 w-3' />
                      {rolesGranted.length} role
                      {rolesGranted.length !== 1 ? 's' : ''} · {totalUsers} user
                      {totalUsers !== 1 ? 's' : ''}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className='pt-0'>
                  {rolesGranted.length === 0 ? (
                    <div className='text-xs text-muted-foreground italic'>
                      No roles grant this permission. (Super admins always have access.)
                    </div>
                  ) : (
                    <div className='flex flex-wrap gap-1.5'>
                      {rolesGranted.map(({ role, meta }) => (
                        <Link
                          key={role}
                          href={`/users/permissions-audit?tab=resolver&role=${encodeURIComponent(
                            role
                          )}`}
                          className='group'
                        >
                          <Badge
                            variant='outline'
                            className={`text-xs gap-1 cursor-pointer transition-colors ${verb.hoverClass}`}
                          >
                            {meta.name}
                            <span className='text-muted-foreground group-hover:text-foreground'>
                              ({meta.userCount})
                            </span>
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  )}
                  {perms.length > 0 && (
                    <details className='mt-2.5'>
                      <summary className='text-[10px] text-muted-foreground cursor-pointer hover:text-foreground select-none'>
                        {perms.length} permission key{perms.length !== 1 ? 's' : ''}
                      </summary>
                      <div className='mt-1.5 space-y-0.5'>
                        {perms.map((p) => (
                          <div
                            key={p.permKey}
                            className='font-mono text-[10px] text-muted-foreground'
                          >
                            {p.permKey}
                            {p.submodule && (
                              <span className='ml-2 text-foreground/50'>
                                [{p.submodule}]
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
