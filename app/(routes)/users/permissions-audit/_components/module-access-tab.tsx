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
  if (parts.length < 2) {
    // Legacy single-segment keys like "view_dashboard", "manage_users",
    // "assign_roles". The data has ~15 of these with active grants. Derive
    // the action verb from the underscore prefix when it matches a known
    // verb (view/manage/assign/etc.), otherwise fall back to "manage" so
    // the perm still groups under a real action card instead of an empty
    // "(action)" header.
    const underscore = permKey.indexOf('_');
    const prefix = underscore > 0 ? permKey.slice(0, underscore) : '';
    const action = prefix && VERB_STYLES[prefix] ? prefix : 'manage';
    return { module: permKey, submodule: '', action };
  }
  return {
    module: parts[0],
    action: parts[parts.length - 1],
    submodule: parts.slice(1, -1).join(' › ')
  };
}

// `moduleLabel` and the `prettifyKey` fallback now live in
// `lib/permissions-audit/module-mappings.ts` (added by PR #533's structural
// fix and extended in this commit). `getDisplayNameForModuleKey` is the
// single source of truth for "permission-key module → human label" — used
// by both this tab and Permission Matrix.
const moduleLabel = getDisplayNameForModuleKey;

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

  // Modules in the picker. Source is the UNION of:
  //   1. Modules discovered in data.matrix (every first-dot-segment of every
  //      permission key actually present in custom_roles.permissions JSONB).
  //   2. Modules catalogued in PERMISSION_CATEGORIES — included even when
  //      no role's JSONB has any of their perm keys yet (so an auditor can
  //      still inspect "Accreditation has 30 catalogued perms but zero are
  //      defined on any role" as a finding, instead of the module silently
  //      disappearing from the picker).
  //
  // Earlier this filtered out modules with 0 grants — that hid 39/88 modules.
  // For an audit dashboard the OPPOSITE is needed: show everything, mark the
  // dormant ones, and let the auditor decide what's worth investigating. We
  // sort active first (by total grants desc) so the impactful modules still
  // float to the top, but dormant entries remain visible at the bottom.
  const modules = useMemo(() => {
    if (!data) {
      return [] as Array<{
        key: string;
        label: string;
        count: number;
        grantCount: number;
        grantingRoles: number;
        source: 'data' | 'catalog' | 'both';
      }>;
    }

    type ModuleStat = {
      count: number;
      grantCount: number;
      grantingRoles: Set<string>;
    };

    // 1. Stats from discovered data
    const stats = new Map<string, ModuleStat>();
    Object.keys(data.matrix).forEach((permKey) => {
      const { module: m } = classifyPerm(permKey);
      let stat = stats.get(m);
      if (!stat) {
        stat = { count: 0, grantCount: 0, grantingRoles: new Set() };
        stats.set(m, stat);
      }
      stat.count += 1;
      const row = data.matrix[permKey] || {};
      for (const [roleKey, granted] of Object.entries(row)) {
        if (granted === true) {
          stat.grantCount += 1;
          stat.grantingRoles.add(roleKey);
        }
      }
    });

    const dataKeys = new Set(stats.keys());
    const catalogKeys = new Set(PERMISSION_CATEGORIES.map((c) => c.key));

    // 2. Inject catalogued modules that didn't appear in data so the auditor
    // sees them with zeroes rather than nothing at all.
    catalogKeys.forEach((k) => {
      if (!stats.has(k)) {
        stats.set(k, { count: 0, grantCount: 0, grantingRoles: new Set() });
      }
    });

    return Array.from(stats.entries())
      .map(([key, s]) => {
        const inData = dataKeys.has(key);
        const inCatalog = catalogKeys.has(key);
        return {
          key,
          label: moduleLabel(key),
          count: s.count,
          grantCount: s.grantCount,
          grantingRoles: s.grantingRoles.size,
          source: (inData && inCatalog
            ? 'both'
            : inCatalog
            ? 'catalog'
            : 'data') as 'data' | 'catalog' | 'both',
        };
      })
      // Sort: active modules first (most grants desc); dormant modules
      // (grantCount=0) fall to the bottom, alpha-sorted there.
      .sort((a, b) => {
        if (a.grantCount === 0 && b.grantCount === 0) {
          return a.label.localeCompare(b.label);
        }
        if (a.grantCount === 0) return 1;
        if (b.grantCount === 0) return -1;
        return b.grantCount - a.grantCount || a.label.localeCompare(b.label);
      });
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
  // sorted by user-count descending (most impactful first). Always includes
  // super_admin as a synthetic entry — they bypass per-permission flags via
  // is_super_admin() in 02_functions.sql, so they always have effective
  // access regardless of what's in custom_roles.permissions. Without this
  // synthesis, super_admin sometimes appeared and sometimes didn't depending
  // on whether their JSONB happened to contain the key, which made the panel
  // look inconsistent.
  const rolesWithAccess = (
    permKeys: string[]
  ): Array<{ role: string; meta: RoleMeta; alwaysGrants?: boolean }> => {
    if (!data) return [];
    const out: Array<{ role: string; meta: RoleMeta; alwaysGrants?: boolean }> = [];

    const superAdminMeta = data.roleMeta['super_admin'];
    if (superAdminMeta) {
      out.push({ role: 'super_admin', meta: superAdminMeta, alwaysGrants: true });
    }

    for (const role of data.roles) {
      if (role === 'super_admin') continue; // already added as synthetic entry
      const granted = permKeys.some((pk) => data.matrix[pk]?.[role] === true);
      if (granted) {
        const meta = data.roleMeta[role];
        if (meta) out.push({ role, meta });
      }
    }

    // Keep super_admin pinned first; sort the rest by user count.
    return out.sort((a, b) => {
      if (a.alwaysGrants && !b.alwaysGrants) return -1;
      if (!a.alwaysGrants && b.alwaysGrants) return 1;
      return b.meta.userCount - a.meta.userCount;
    });
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
                    {modules.length === 0 ? (
                      <div className='px-2 py-1.5 text-xs text-muted-foreground'>
                        No modules available.
                      </div>
                    ) : (
                      modules.map((m) => {
                        const isDormant = m.grantCount === 0;
                        const sourceTag =
                          m.source === 'catalog'
                            ? ' · catalog only'
                            : m.source === 'data'
                            ? ' · uncatalogued'
                            : '';
                        return (
                          <SelectItem key={m.key} value={m.key}>
                            <span
                              className={
                                isDormant ? 'text-muted-foreground italic' : ''
                              }
                            >
                              {m.label}
                            </span>
                            <span className='text-muted-foreground ml-1 text-[11px]'>
                              {isDormant
                                ? `· no grants${sourceTag}`
                                : `· ${m.grantingRoles} role${m.grantingRoles !== 1 ? 's' : ''}${sourceTag}`}
                            </span>
                          </SelectItem>
                        );
                      })
                    )}
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
                  <div className='flex flex-wrap gap-1.5'>
                    {rolesGranted.map(({ role, meta, alwaysGrants }) => (
                      <Link
                        key={role}
                        href={`/users/permissions-audit?tab=resolver&role=${encodeURIComponent(
                          role
                        )}`}
                        className='group'
                      >
                        <Badge
                          variant={alwaysGrants ? 'default' : 'outline'}
                          className={`text-xs gap-1 cursor-pointer transition-colors ${
                            alwaysGrants ? '' : verb.hoverClass
                          }`}
                          title={
                            alwaysGrants
                              ? 'Super admins bypass per-permission flags via is_super_admin() — always granted regardless of role config'
                              : undefined
                          }
                        >
                          {meta.name}
                          <span
                            className={
                              alwaysGrants
                                ? 'opacity-80'
                                : 'text-muted-foreground group-hover:text-foreground'
                            }
                          >
                            {alwaysGrants
                              ? `· always · ${meta.userCount}`
                              : `(${meta.userCount})`}
                          </span>
                        </Badge>
                      </Link>
                    ))}
                  </div>
                  {rolesGranted.length === 1 && rolesGranted[0]?.alwaysGrants && (
                    <div className='text-xs text-muted-foreground italic mt-1'>
                      Only super admins have this. No other role grants it.
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
