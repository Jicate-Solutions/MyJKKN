'use client';

/**
 * Module → Pages: the page-level half of the Inverse Access Lens.
 *
 * The sibling "Actions" view answers "which roles hold permission key X". This
 * one answers the question an auditor actually arrives with: "which SCREENS can
 * a role open in this module, and what can it do once it is there" — page, then
 * its tabs, then its table and toolbar controls.
 *
 * Everything shown here is a claim with a stated basis. A page row names the
 * permission that gates it and whether that permission is the page's own or
 * inherited from an ancestor route; an action names the file that declared it;
 * a code-gated tab names the hook. Where the answer is genuinely unknown the
 * row says so rather than showing an empty role list, because on an audit
 * screen "no roles" and "we could not tell" must not look the same.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { BeatLoader } from 'react-spinners';
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileWarning,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Users
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type {
  PageAccessResponse,
  ResolvedPageAccess,
  ResolvedRole
} from '@/types/permissions-audit';

// ─── Visual vocabulary ───────────────────────────────────────────────────────

const VERB_ICON: Record<string, typeof Eye> = {
  view: Eye,
  read: Eye,
  create: Plus,
  assign: Plus,
  edit: Pencil,
  update: Pencil,
  delete: Trash2,
  approve: CheckCircle,
  export: Download,
  manage: ShieldAlert
};

const VERB_COLOR: Record<string, string> = {
  view: 'text-emerald-600',
  read: 'text-emerald-600',
  create: 'text-sky-600',
  assign: 'text-indigo-600',
  edit: 'text-amber-600',
  update: 'text-amber-600',
  delete: 'text-rose-600',
  approve: 'text-violet-600',
  export: 'text-slate-600',
  manage: 'text-fuchsia-600'
};

const SURFACE_LABEL: Record<string, string> = {
  page: 'Page body',
  'tab-bar': 'Tab bar',
  'row-action': 'Table row action',
  column: 'Table column',
  toolbar: 'Toolbar',
  component: 'Component'
};

// ─── Small pieces ────────────────────────────────────────────────────────────

function RoleChips({ roles }: { roles: ResolvedRole[] }) {
  if (roles.length === 0) {
    return (
      <span className='text-[11px] italic text-muted-foreground'>
        No role grants this.
      </span>
    );
  }
  return (
    <div className='flex flex-wrap gap-1'>
      {roles.map((r) => (
        <Link
          key={r.roleKey}
          href={`/users/permissions-audit?tab=resolver&role=${encodeURIComponent(r.roleKey)}`}
          className='group'
        >
          <Badge
            variant={r.alwaysGrants ? 'default' : 'outline'}
            className='cursor-pointer gap-1 text-[11px] transition-colors'
            title={
              r.alwaysGrants
                ? 'Super admins bypass per-permission flags via is_super_admin() — always granted regardless of role config'
                : r.derived
                  ? 'Derived from the permission key this gate mirrors, not read from the gate itself'
                  : undefined
            }
          >
            {r.roleName}
            <span
              className={
                r.alwaysGrants
                  ? 'opacity-80'
                  : 'text-muted-foreground group-hover:text-foreground'
              }
            >
              {r.alwaysGrants ? `· always · ${r.userCount}` : `(${r.userCount})`}
            </span>
            {r.derived && !r.alwaysGrants && (
              <span className='text-[9px] uppercase tracking-wide opacity-70'>
                derived
              </span>
            )}
          </Badge>
        </Link>
      ))}
    </div>
  );
}

function GateBadge({ page }: { page: ResolvedPageAccess }) {
  const { gate } = page;
  if (gate.source === 'ungated') {
    return (
      <Badge
        variant='outline'
        className='gap-1 border-amber-400 text-[10px] text-amber-700'
        title='No MENU_PERMISSIONS entry matched this URL, so any authenticated user can open it.'
      >
        <AlertTriangle className='h-3 w-3' /> ungated
      </Badge>
    );
  }
  if (gate.isSentinel) {
    return (
      <Badge
        variant='outline'
        className='gap-1 border-violet-400 text-[10px] text-violet-700'
        title={`"${gate.permission}" is a route marker, not a grantable key — only admins pass it.`}
      >
        sentinel · {gate.permission}
      </Badge>
    );
  }
  return (
    <Badge
      variant='outline'
      className='font-mono text-[10px]'
      title={
        gate.source === 'inherited'
          ? `Inherited from ${gate.matchedPath} — this URL has no MENU_PERMISSIONS entry of its own.`
          : 'Declared on this exact URL in MENU_PERMISSIONS.'
      }
    >
      {gate.permission}
      {gate.source === 'inherited' && (
        <span className='ml-1 font-sans text-muted-foreground'>
          ← {gate.matchedPath}
        </span>
      )}
    </Badge>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Mounted with `key={moduleKey}` by the parent, so switching modules remounts
 * and the expanded rows / filter reset themselves. That is deliberately not an
 * effect: resetting local state in response to a prop change is the exact
 * pattern React asks you to express as remounting instead.
 */
export function ModulePageTree({ moduleKey }: { moduleKey: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [onlyFindings, setOnlyFindings] = useState(false);

  const {
    data,
    isPending: loading,
    error
  } = useQuery<PageAccessResponse>({
    queryKey: ['permissions-audit', 'page-access', moduleKey],
    enabled: !!moduleKey,
    queryFn: async () => {
      const r = await fetch(
        `/api/users/permissions-audit/page-access?module=${encodeURIComponent(moduleKey)}`
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as PageAccessResponse;
    },
    // Role grants are live data, but they do not change while an auditor reads
    // one module — and re-fetching 100+ roles on every tab focus would be a
    // heavy query for no new information.
    staleTime: 60_000
  });
  const err = error ? (error instanceof Error ? error.message : 'Failed to load') : null;

  const toggle = useCallback((url: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, []);

  const pages = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    return data.pages.filter((p) => {
      if (onlyFindings && p.gate.source !== 'ungated' && p.gate.enforcedByLayout) {
        return false;
      }
      if (!q) return true;
      return (
        p.url.toLowerCase().includes(q) ||
        p.label.toLowerCase().includes(q) ||
        (p.gate.permission ?? '').toLowerCase().includes(q) ||
        p.tabs.some((t) => t.label.toLowerCase().includes(q)) ||
        p.actions.some((a) => a.permissionKey.toLowerCase().includes(q))
      );
    });
  }, [data, filter, onlyFindings]);

  /**
   * CSV of the CURRENTLY FILTERED rows, one line per gated surface.
   *
   * Exports what is on screen rather than the whole module: the filter and the
   * findings toggle are how an auditor narrows to the thing they are chasing,
   * and an export that silently widens the scope again is the export that ends
   * up pasted into a report with the wrong numbers.
   */
  const exportCsv = useCallback(() => {
    if (!data || pages.length === 0) return;
    const rows: string[][] = [
      [
        'Module',
        'Page URL',
        'Page label',
        'Surface',
        'Name',
        'Permission key',
        'Gate source',
        'Enforced at page layer',
        'Code gate',
        'Roles',
        'Users'
      ]
    ];
    const roleList = (roles: ResolvedRole[]) =>
      roles.map((r) => `${r.roleName} (${r.userCount})`).join('; ');
    const userTotal = (roles: ResolvedRole[]) =>
      String(roles.reduce((n, r) => n + r.userCount, 0));

    for (const p of pages) {
      rows.push([
        data.moduleLabel,
        p.url,
        p.label,
        'Page',
        p.label,
        p.gate.permission ?? '(ungated)',
        p.gate.source,
        p.gate.enforcedByLayout ? 'yes' : 'no — nav only',
        '',
        roleList(p.roles),
        userTotal(p.roles)
      ]);
      for (const t of p.tabs) {
        rows.push([
          data.moduleLabel,
          p.url,
          p.label,
          t.kind === 'route' ? 'Route tab' : 'In-page tab',
          t.label,
          t.gate?.permission ?? '',
          t.gate?.source ?? '',
          '',
          t.nonKeyGate ? `${t.nonKeyGate.hook}()` : '',
          roleList(t.roles),
          userTotal(t.roles)
        ]);
      }
      for (const a of p.actions) {
        rows.push([
          data.moduleLabel,
          p.url,
          p.label,
          SURFACE_LABEL[a.surface] ?? a.surface,
          a.verb,
          a.permissionKey,
          '',
          '',
          '',
          roleList(a.roles),
          userTotal(a.roles)
        ]);
      }
    }

    const csv = rows
      .map((r) =>
        r
          .map((cell) => {
            const escaped = cell.replace(/"/g, '""');
            return /[",\n]/.test(cell) ? `"${escaped}"` : escaped;
          })
          .join(',')
      )
      .join('\n');
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `page-access-${moduleKey}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data, pages, moduleKey]);

  const stats = useMemo(() => {
    if (!data) return null;
    return {
      total: data.pages.length,
      ungated: data.pages.filter((p) => p.gate.source === 'ungated').length,
      navOnly: data.pages.filter((p) => !p.gate.enforcedByLayout).length,
      inherited: data.pages.filter((p) => p.gate.source === 'inherited').length
    };
  }, [data]);

  if (loading) {
    return (
      <Card>
        <CardContent className='flex h-64 items-center justify-center'>
          <BeatLoader color='#6366f1' size={10} />
        </CardContent>
      </Card>
    );
  }
  if (err || !data) {
    return (
      <Card>
        <CardContent className='flex h-64 items-center justify-center text-destructive'>
          {err ?? 'No data returned from API'}
        </CardContent>
      </Card>
    );
  }
  if (data.pages.length === 0) {
    return (
      <Card>
        <CardContent className='flex h-32 items-center justify-center text-sm text-muted-foreground'>
          No pages map to this module. Its permission keys exist, but no route
          resolves to them.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-3'>
      {/* Summary + filters */}
      <Card>
        <CardContent className='flex flex-wrap items-center gap-3 py-3'>
          <div className='relative'>
            <Search className='absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder='Filter by URL, tab, or permission key…'
              className='h-8 w-[300px] pl-7 text-xs'
            />
          </div>
          <Button
            size='sm'
            variant={onlyFindings ? 'default' : 'outline'}
            className='h-8 gap-1 text-xs'
            onClick={() => setOnlyFindings((v) => !v)}
            title='Show only pages that are ungated, or gated in the sidebar but not enforced at the page layer'
          >
            <FileWarning className='h-3 w-3' /> Findings only
          </Button>
          <Button
            size='sm'
            variant='outline'
            className='h-8 gap-1 text-xs'
            onClick={exportCsv}
            disabled={pages.length === 0}
          >
            <Download className='h-3 w-3' /> Export CSV
          </Button>
          {stats && (
            <div className='ml-auto text-xs text-muted-foreground'>
              {pages.length} of {stats.total} pages
              <span className='mx-2'>·</span>
              {stats.inherited} inherit their gate
              <span className='mx-2'>·</span>
              <span className={stats.ungated > 0 ? 'text-amber-700' : undefined}>
                {stats.ungated} ungated
              </span>
              <span className='mx-2'>·</span>
              <span className={stats.navOnly > 0 ? 'text-amber-700' : undefined}>
                {stats.navOnly} nav-gated only
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Page rows */}
      <div className='space-y-2'>
        {pages.map((page) => {
          const isOpen = open.has(page.url);
          return (
            <Card key={page.url}>
              <button
                type='button'
                onClick={() => toggle(page.url)}
                aria-expanded={isOpen}
                className='flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40'
              >
                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    isOpen ? 'rotate-90' : ''
                  }`}
                />
                <span className='truncate text-sm font-medium'>{page.label}</span>
                <span className='truncate font-mono text-[11px] text-muted-foreground'>
                  {page.url}
                </span>
                <GateBadge page={page} />
                {!page.gate.enforcedByLayout && (
                  <Badge
                    variant='outline'
                    className='gap-1 border-amber-300 text-[10px] text-amber-700'
                    title='No <RoutePermissionGuard> layout covers this subtree, so the permission hides the sidebar link but does not stop someone typing the URL.'
                  >
                    <AlertTriangle className='h-3 w-3' /> nav-gated only
                  </Badge>
                )}
                <span className='ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground'>
                  <Users className='h-3 w-3' />
                  {page.roles.length} role{page.roles.length !== 1 ? 's' : ''} ·{' '}
                  {page.totalUsers} user{page.totalUsers !== 1 ? 's' : ''}
                </span>
                <Link
                  href={page.url}
                  onClick={(e) => e.stopPropagation()}
                  className='shrink-0 text-muted-foreground hover:text-foreground'
                  title='Open this page'
                >
                  <ExternalLink className='h-3.5 w-3.5' />
                </Link>
              </button>

              {isOpen && (
                <CardContent className='space-y-4 border-t pt-3'>
                  <section>
                    <h4 className='mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                      Who can open this page
                    </h4>
                    <RoleChips roles={page.roles} />
                  </section>

                  <section>
                    <h4 className='mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                      Tabs ({page.tabs.length})
                    </h4>
                    {page.tabs.length === 0 ? (
                      <p className='text-[11px] italic text-muted-foreground'>
                        No tabs detected on this page.
                      </p>
                    ) : (
                      <div className='space-y-2'>
                        {page.tabs.map((tab) => (
                          <div
                            key={`${tab.kind}:${tab.href ?? tab.value}`}
                            className='rounded border border-border/60 px-2.5 py-2'
                          >
                            <div className='flex flex-wrap items-center gap-2'>
                              <span className='text-xs font-medium'>{tab.label}</span>
                              <Badge variant='secondary' className='text-[10px]'>
                                {tab.kind === 'route' ? 'route tab' : 'in-page tab'}
                              </Badge>
                              {tab.href && (
                                <span className='font-mono text-[10px] text-muted-foreground'>
                                  {tab.href}
                                </span>
                              )}
                              {tab.gate?.permission && (
                                <Badge variant='outline' className='font-mono text-[10px]'>
                                  {tab.gate.permission}
                                </Badge>
                              )}
                              {tab.nonKeyGate && (
                                <Badge
                                  variant='outline'
                                  className='gap-1 border-amber-400 text-[10px] text-amber-700'
                                  title={tab.nonKeyGate.note}
                                >
                                  <AlertTriangle className='h-3 w-3' />
                                  code-gated · {tab.nonKeyGate.hook}
                                </Badge>
                              )}
                              {tab.inheritsPageAccess && !tab.nonKeyGate && (
                                <span className='text-[10px] italic text-muted-foreground'>
                                  no extra gate — anyone who can open the page sees it
                                </span>
                              )}
                            </div>

                            {tab.nonKeyGate && (
                              <p className='mt-1 text-[10px] leading-relaxed text-muted-foreground'>
                                {tab.nonKeyGate.note}
                                {!tab.nonKeyGate.mirrors && (
                                  <>
                                    {' '}
                                    <span className='font-medium text-amber-700'>
                                      Roles below reflect the route gate only.
                                    </span>
                                  </>
                                )}
                              </p>
                            )}

                            <div className='mt-1.5'>
                              <RoleChips roles={tab.roles} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h4 className='mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                      Table &amp; toolbar actions ({page.actions.length})
                    </h4>
                    {page.actions.length === 0 ? (
                      <p className='text-[11px] italic text-muted-foreground'>
                        No permission-keyed controls found in this page&rsquo;s component
                        tree. Its controls are either ungated or gated on something other
                        than a permission key.
                      </p>
                    ) : (
                      <div className='space-y-2'>
                        {page.actions.map((action) => {
                          const Icon = VERB_ICON[action.verb] ?? ShieldAlert;
                          return (
                            <div
                              key={`${action.permissionKey}:${action.surface}:${action.file}`}
                              className='rounded border border-border/60 px-2.5 py-2'
                            >
                              <div className='flex flex-wrap items-center gap-2'>
                                <Icon
                                  className={`h-3.5 w-3.5 ${
                                    VERB_COLOR[action.verb] ?? 'text-slate-500'
                                  }`}
                                />
                                <span className='text-xs font-medium capitalize'>
                                  {action.verb}
                                </span>
                                <Badge variant='secondary' className='text-[10px]'>
                                  {SURFACE_LABEL[action.surface] ?? action.surface}
                                </Badge>
                                <Badge variant='outline' className='font-mono text-[10px]'>
                                  {action.permissionKey}
                                </Badge>
                                <span
                                  className='font-mono text-[10px] text-muted-foreground'
                                  title='The file that declared this gate'
                                >
                                  {action.file}
                                </span>
                              </div>
                              <div className='mt-1.5'>
                                <RoleChips roles={action.roles} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {page.nonKeyGates.length > 0 && (
                    <section>
                      <h4 className='mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                        Other code gates on this page
                      </h4>
                      <div className='space-y-1'>
                        {page.nonKeyGates.map((g) => (
                          <div key={g.hook} className='text-[10px] text-muted-foreground'>
                            <span className='font-mono text-amber-700'>{g.hook}()</span>{' '}
                            <span className='font-mono'>{g.file}</span>
                            <div className='leading-relaxed'>{g.note}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {page.unresolvedGates.length > 0 && (
                    <section>
                      <h4 className='mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                        Could not resolve statically
                      </h4>
                      <div className='space-y-0.5'>
                        {page.unresolvedGates.map((u) => (
                          <div key={u} className='font-mono text-[10px] text-muted-foreground'>
                            {u}
                          </div>
                        ))}
                      </div>
                      <p className='mt-1 text-[10px] italic text-muted-foreground'>
                        These gates take variable arguments, so the permission key they
                        check is only known at runtime. Read the file to confirm.
                      </p>
                    </section>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <p className='text-[10px] text-muted-foreground'>
        Page/tab/action structure extracted from source at build time (
        {new Date(data.generatedAt).toLocaleString()}); role grants read live from
        custom_roles just now.
      </p>
    </div>
  );
}
