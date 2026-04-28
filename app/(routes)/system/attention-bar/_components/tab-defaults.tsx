'use client';

/**
 * Tab 2 — Layer 1 Defaults  [TAB-2:DEFAULTS]
 *
 * Read-only coverage matrix: rows = 10 spec'd pages, cols = 5 spec'd roles.
 * Cell = action label from STATIC_DEFAULTS registry (exact match only).
 * Red cell = coverage gap (resolved via fallback, not exact entry).
 *
 * Click cell → side drawer showing full ActionTemplate details.
 * "Add to backlog" button → GitHub issue URL pre-filled.
 *
 * Spec: specs/attention-bar-5-layer-system.md §6 Tab 2
 * Permission: attention_bar.rules.view
 *
 * Q2 twin-check: tab-overview.tsx — same file shape. Bespoke: grid layout
 * and drawer pattern are attention-bar-specific, not shared elsewhere.
 */

import { useState, useMemo } from 'react';
import {
  STATIC_DEFAULTS,
  getCoverageGaps,
  findStaticDefault,
} from '@/lib/attention-bar/static-defaults';
import type { ActionTemplate } from '@/lib/attention-bar/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  ExternalLink,
  Eye,
  GitBranch,
  Info,
  List,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

/** The 10 pages specified in §3 Layer 1 coverage v1. */
const SPEC_PAGES = [
  '/dashboard',
  '/admission/leads',
  '/admission/counselors',
  '/academic/attendance/dashboard',
  '/academic/timetables',
  '/billing/invoices',
  '/billing/receipts',
  '/staff',
  '/learners',
  '/system/notifications',
] as const;

/** The 5 roles specified in §3 Layer 1 coverage v1. */
const SPEC_ROLES = [
  'super_admin',
  'admin',
  'counselor',
  'faculty',
  'hod',
] as const;

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  counselor: 'Counselor',
  faculty: 'Faculty',
  hod: 'HoD',
};

const TONE_BADGE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  amber:  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  green:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  blue:   'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const GITHUB_REPO = 'Jicate-Solutions/MyJKKN';
const GITHUB_ISSUES_URL = `https://github.com/${GITHUB_REPO}/issues/new`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a pre-filled GitHub issue URL for a coverage gap. */
function buildGitHubIssueUrl(page: string, role: string): string {
  const title = `[attention-bar] Add Layer 1 default: ${role} on ${page}`;
  const body = [
    '## Layer 1 Coverage Gap',
    '',
    `**Page:** \`${page}\``,
    `**Role:** \`${role}\``,
    '',
    '### Current behaviour',
    `When a \`${role}\` visits \`${page}\`, the attention bar falls back to the catch-all (\`*/*\`) default instead of a page-specific action.`,
    '',
    '### Expected behaviour',
    `A specific \`(${page}, ${role})\` entry exists in \`lib/attention-bar/static-defaults.ts\` with a contextually appropriate action.`,
    '',
    '### Acceptance criteria',
    `- [ ] Entry added to \`STATIC_DEFAULTS\` in \`static-defaults.ts\``,
    `- [ ] \`getCoverageGaps()\` no longer returns \`{ page: "${page}", role: "${role}" }\``,
    `- [ ] \`npm run check:attention-bar\` exits 0`,
    '',
    '---',
    '_Auto-generated from /system/attention-bar?tab=defaults_',
  ].join('\n');

  const params = new URLSearchParams({ title, body, labels: 'attention-bar,layer-1' });
  return `${GITHUB_ISSUES_URL}?${params.toString()}`;
}

/** Build a mock ResolverContext for cell preview (no real state). */
const MOCK_CTX = {
  userId: 'admin',
  role: '',
  page: '',
  state: {},
  preferences: { layer3Consent: false, layer3OverrideTo: 'inherit' as const },
  enabledLayers: new Set<0 | 1 | 2 | 3 | 4>(),
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface CellInfo {
  page: string;
  role: string;
  action: ActionTemplate | null;
  isExact: boolean;
  isGap: boolean;
}

interface DrawerState {
  open: boolean;
  cell: CellInfo | null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CoverageStats({
  gaps,
  total,
}: {
  gaps: { page: string; role: string }[];
  total: number;
}) {
  const exact = total - gaps.length;
  const pct = Math.round((exact / total) * 100);

  return (
    <div className='flex flex-wrap items-center gap-3'>
      <div className='flex items-center gap-1.5 text-sm'>
        <CheckCircle2 className='h-4 w-4 text-emerald-500' />
        <span className='font-medium'>{exact}</span>
        <span className='text-muted-foreground'>exact matches</span>
      </div>
      <div className='flex items-center gap-1.5 text-sm'>
        <AlertTriangle className='h-4 w-4 text-red-500' />
        <span className='font-medium'>{gaps.length}</span>
        <span className='text-muted-foreground'>gaps (fallback only)</span>
      </div>
      <Badge
        className={cn(
          'font-mono',
          pct === 100
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
            : pct >= 90
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
        )}
      >
        {pct}% coverage
      </Badge>
    </div>
  );
}

function MatrixCell({
  cell,
  onClick,
}: {
  cell: CellInfo;
  onClick: (cell: CellInfo) => void;
}) {
  if (cell.isGap) {
    return (
      <button
        onClick={() => onClick(cell)}
        className={cn(
          'group relative w-full rounded-lg border-2 border-dashed p-2 text-left',
          'border-red-300 bg-red-50/60 dark:border-red-800 dark:bg-red-950/20',
          'hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950/40',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1',
          'transition-colors',
        )}
        aria-label={`Coverage gap: ${cell.role} on ${cell.page}. Click to add to backlog.`}
      >
        <div className='flex items-start gap-1'>
          <AlertTriangle className='h-3.5 w-3.5 shrink-0 text-red-500 mt-0.5' />
          <span className='text-[11px] leading-snug text-red-700 dark:text-red-400 font-medium'>
            No exact match
          </span>
        </div>
        <p className='mt-1 text-[10px] text-red-500 dark:text-red-500'>
          Falls back to */* catch-all
        </p>
      </button>
    );
  }

  return (
    <button
      onClick={() => onClick(cell)}
      className={cn(
        'group relative w-full rounded-lg border p-2 text-left',
        'border-border bg-background',
        'hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1',
        'transition-colors',
      )}
      aria-label={`${cell.role} on ${cell.page}: ${cell.action?.label ?? 'unknown'}. Click to view details.`}
    >
      <div className='flex items-start gap-1'>
        <CheckCircle2 className='h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5' />
        <span className='text-[11px] leading-snug font-medium text-foreground line-clamp-2'>
          {cell.action?.label ?? '—'}
        </span>
      </div>
      {cell.action?.cta && (
        <p className='mt-1 text-[10px] text-muted-foreground'>
          CTA: <span className='font-mono'>{cell.action.cta}</span>
        </p>
      )}
    </button>
  );
}

function ActionDetailDrawer({
  drawerState,
  onClose,
}: {
  drawerState: DrawerState;
  onClose: () => void;
}) {
  const { open, cell } = drawerState;

  return (
    <Sheet open={open} onOpenChange={open => !open && onClose()}>
      <SheetContent side='right' className='w-full max-w-sm sm:max-w-md overflow-y-auto'>
        {cell && (
          <>
            <SheetHeader className='space-y-1 pb-4 border-b'>
              <SheetTitle className='flex items-center gap-2 text-base'>
                {cell.isGap ? (
                  <AlertTriangle className='h-4 w-4 text-red-500' />
                ) : (
                  <CheckCircle2 className='h-4 w-4 text-emerald-500' />
                )}
                {cell.isGap ? 'Coverage Gap' : 'ActionTemplate Detail'}
              </SheetTitle>
              <SheetDescription className='text-xs font-mono'>
                ({cell.page}, {cell.role})
              </SheetDescription>
            </SheetHeader>

            <div className='space-y-5 pt-5'>
              {/* Key + page + role */}
              <section className='space-y-2'>
                <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5'>
                  <Database className='h-3.5 w-3.5' />
                  Registry Key
                </h4>
                <div className='rounded-md bg-muted p-3 space-y-1.5'>
                  <div className='flex items-center justify-between gap-2 text-sm'>
                    <span className='text-muted-foreground'>page</span>
                    <code className='font-mono text-xs bg-background px-1.5 py-0.5 rounded border'>
                      {cell.page}
                    </code>
                  </div>
                  <div className='flex items-center justify-between gap-2 text-sm'>
                    <span className='text-muted-foreground'>role</span>
                    <code className='font-mono text-xs bg-background px-1.5 py-0.5 rounded border'>
                      {cell.role}
                    </code>
                  </div>
                  <div className='flex items-center justify-between gap-2 text-sm'>
                    <span className='text-muted-foreground'>match</span>
                    <Badge
                      className={
                        cell.isGap
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                      }
                    >
                      {cell.isGap ? 'fallback (*/*) only' : 'exact match'}
                    </Badge>
                  </div>
                </div>
              </section>

              {/* ActionTemplate fields (when not a gap) */}
              {!cell.isGap && cell.action && (
                <section className='space-y-2'>
                  <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5'>
                    <Eye className='h-3.5 w-3.5' />
                    ActionTemplate
                  </h4>
                  <div className='rounded-md bg-muted p-3 space-y-2.5'>
                    <Field label='id' value={cell.action.id} mono />
                    <Field label='label' value={cell.action.label} />
                    <Field label='context' value={cell.action.context ?? '—'} muted={!cell.action.context} />
                    <Field label='tone' value={cell.action.tone}>
                      <Badge className={cn('text-xs', TONE_BADGE[cell.action.tone])}>
                        {cell.action.tone}
                      </Badge>
                    </Field>
                    <Field label='cta' value={cell.action.cta} />
                    <Field label='icon' value={cell.action.icon} mono />
                    <Field label='href' value={cell.action.href} mono />
                  </div>
                </section>
              )}

              {/* Gap guidance */}
              {cell.isGap && (
                <section className='space-y-2'>
                  <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5'>
                    <Info className='h-3.5 w-3.5' />
                    What happens now
                  </h4>
                  <p className='text-sm text-muted-foreground leading-relaxed'>
                    When a <strong>{ROLE_LABELS[cell.role] ?? cell.role}</strong> visits{' '}
                    <code className='font-mono text-xs bg-muted px-1 py-0.5 rounded'>
                      {cell.page}
                    </code>{' '}
                    the resolver falls through to the global{' '}
                    <code className='font-mono text-xs bg-muted px-1 py-0.5 rounded'>*/*</code>{' '}
                    catch-all, which shows &ldquo;Open dashboard&rdquo;. That's not useful. Add a
                    specific entry to{' '}
                    <code className='font-mono text-xs bg-muted px-1 py-0.5 rounded'>
                      lib/attention-bar/static-defaults.ts
                    </code>
                    .
                  </p>
                </section>
              )}

              {/* Source location */}
              <section className='space-y-2'>
                <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5'>
                  <GitBranch className='h-3.5 w-3.5' />
                  Source
                </h4>
                <p className='text-xs text-muted-foreground font-mono'>
                  lib/attention-bar/static-defaults.ts
                </p>
                <p className='text-xs text-muted-foreground'>
                  Layer 1 lives in code (not DB) so changes pass code review and
                  orphan pages are visible at compile-time.
                </p>
              </section>

              {/* Add to backlog CTA */}
              {cell.isGap && (
                <Button
                  asChild
                  variant='destructive'
                  size='sm'
                  className='w-full'
                >
                  <a
                    href={buildGitHubIssueUrl(cell.page, cell.role)}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='flex items-center justify-center gap-2'
                  >
                    <ExternalLink className='h-4 w-4' />
                    Add to Backlog (GitHub Issue)
                  </a>
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  value,
  mono = false,
  muted = false,
  children,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className='flex items-start justify-between gap-2'>
      <span className='text-xs text-muted-foreground shrink-0 pt-0.5 w-14'>{label}</span>
      {children ?? (
        <span
          className={cn(
            'text-xs text-right break-all',
            mono && 'font-mono bg-background px-1.5 py-0.5 rounded border',
            muted && 'text-muted-foreground italic',
          )}
        >
          {value}
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TabDefaults() {
  const [drawerState, setDrawerState] = useState<DrawerState>({
    open: false,
    cell: null,
  });

  // Build the gaps set once (stable reference)
  const gaps = useMemo(
    () => getCoverageGaps(SPEC_PAGES, SPEC_ROLES),
    [],
  );
  const gapSet = useMemo(
    () => new Set(gaps.map(g => `${g.page}::${g.role}`)),
    [gaps],
  );

  // Pre-build the full matrix
  const matrix = useMemo<CellInfo[][]>(() => {
    return SPEC_PAGES.map(page => {
      return SPEC_ROLES.map(role => {
        const isGap = gapSet.has(`${page}::${role}`);
        let action: ActionTemplate | null = null;

        if (!isGap) {
          const found = findStaticDefault(page, role);
          if (found) {
            action = found.build({
              ...MOCK_CTX,
              role,
              page,
            });
          }
        }

        return {
          page,
          role,
          action,
          isExact: !isGap,
          isGap,
        };
      });
    });
  }, [gapSet]);

  function openCell(cell: CellInfo) {
    setDrawerState({ open: true, cell });
  }

  function closeDrawer() {
    setDrawerState(prev => ({ ...prev, open: false }));
  }

  const totalCells = SPEC_PAGES.length * SPEC_ROLES.length;

  return (
    <div className='space-y-6 py-4'>

      {/* Header + stats */}
      <div className='space-y-3'>
        <div className='flex items-center justify-between gap-4 flex-wrap'>
          <h3 className='text-lg font-semibold flex items-center gap-2'>
            <List className='h-5 w-5 text-indigo-500' />
            Layer 1 — Static Defaults Coverage
          </h3>
          <CoverageStats gaps={gaps} total={totalCells} />
        </div>

        <p className='text-sm text-muted-foreground leading-relaxed max-w-2xl'>
          This matrix is a read-only view of{' '}
          <code className='font-mono text-xs bg-muted px-1 py-0.5 rounded'>
            STATIC_DEFAULTS
          </code>{' '}
          in <code className='font-mono text-xs bg-muted px-1 py-0.5 rounded'>lib/attention-bar/static-defaults.ts</code>.
          Green cells have an exact (page, role) entry. Red cells resolve only via the
          catch-all and should be filled in — click any cell for details or to open a
          GitHub backlog issue.
        </p>
      </div>

      {/* Legend */}
      <div className='flex flex-wrap items-center gap-4 text-xs text-muted-foreground'>
        <div className='flex items-center gap-1.5'>
          <CheckCircle2 className='h-3.5 w-3.5 text-emerald-500' />
          Exact (page, role) entry
        </div>
        <div className='flex items-center gap-1.5'>
          <AlertTriangle className='h-3.5 w-3.5 text-red-500' />
          No exact entry — falls back to catch-all (*,*)
        </div>
      </div>

      {/* Coverage matrix */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-sm font-medium text-muted-foreground'>
            {SPEC_PAGES.length} pages × {SPEC_ROLES.length} roles = {totalCells} cells
          </CardTitle>
        </CardHeader>
        <CardContent className='overflow-x-auto'>
          <table className='w-full min-w-[640px] border-collapse'>
            <thead>
              <tr>
                {/* Page column header */}
                <th className='text-left text-xs font-medium text-muted-foreground pb-3 pr-3 w-[180px]'>
                  Page
                </th>
                {/* Role headers */}
                {SPEC_ROLES.map(role => (
                  <th
                    key={role}
                    className='text-left text-xs font-medium text-muted-foreground pb-3 px-1.5'
                  >
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, rowIdx) => {
                const page = SPEC_PAGES[rowIdx];
                const rowHasGap = row.some(c => c.isGap);
                return (
                  <tr
                    key={page}
                    className={cn(
                      'border-t border-border/50',
                      rowIdx % 2 === 0 ? 'bg-muted/20' : '',
                    )}
                  >
                    {/* Page label */}
                    <td className='py-2 pr-3 align-top'>
                      <div className='flex items-start gap-1.5'>
                        {rowHasGap && (
                          <AlertTriangle className='h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0' />
                        )}
                        <code className='font-mono text-[11px] leading-relaxed text-foreground break-all'>
                          {page}
                        </code>
                      </div>
                    </td>

                    {/* Role cells */}
                    {row.map((cell, colIdx) => (
                      <td key={SPEC_ROLES[colIdx]} className='py-2 px-1.5 align-top'>
                        <MatrixCell cell={cell} onClick={openCell} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Registry summary */}
      <Card>
        <CardHeader className='pb-2'>
          <CardTitle className='text-sm flex items-center gap-2'>
            <Database className='h-4 w-4 text-indigo-500' />
            Registry stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
            <Stat
              label='Total entries'
              value={STATIC_DEFAULTS.length.toString()}
              desc='incl. catch-all'
            />
            <Stat
              label='Spec pages'
              value={SPEC_PAGES.length.toString()}
              desc='10 required pages'
            />
            <Stat
              label='Spec roles'
              value={SPEC_ROLES.length.toString()}
              desc='5 required roles'
            />
            <Stat
              label='Coverage'
              value={`${Math.round(((totalCells - gaps.length) / totalCells) * 100)}%`}
              desc={`${gaps.length} gap${gaps.length !== 1 ? 's' : ''}`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Drawer */}
      <ActionDetailDrawer drawerState={drawerState} onClose={closeDrawer} />
    </div>
  );
}

function Stat({
  label,
  value,
  desc,
}: {
  label: string;
  value: string;
  desc?: string;
}) {
  return (
    <div className='space-y-0.5'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='text-2xl font-bold'>{value}</p>
      {desc && <p className='text-xs text-muted-foreground'>{desc}</p>}
    </div>
  );
}
