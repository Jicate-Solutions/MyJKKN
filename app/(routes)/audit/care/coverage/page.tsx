// app/(routes)/audit/care/coverage/page.tsx
// CARRE Coverage Map — every people-facing module's engagement status in one
// place. Spec: team-lead build brief 2026-07-05.
//
// The page NEVER grades a module itself: it derives the left column from the
// curated CARRE_AUDITABLE_MODULES list, LEFT-JOINs the most-recent real audit
// per module (fn_carre_module_coverage), and computes each status from the
// audit's OWNER scores using the pure math in carre-scoring-service.ts.
//
// Gating: no PermissionGuard here — the /audit layout's RoutePermissionGuard
// enforces MENU_PERMISSIONS['/audit/care/coverage'] = 'audit.cycle.view'
// (mirror of /audit/cycles). The coverage RPC is independently leadership-gated.

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  LayoutGrid,
  Plus,
  ArrowRight,
  RefreshCw,
  ShieldAlert,
  Inbox,
  Bot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCarreCoverage, useCarreAutoSignals } from '@/hooks/audit';
import { CARRE_AUDITABLE_MODULES } from '@/lib/constants/carre-auditable-modules';
import {
  carreIndex,
  type OperativeVerdict,
} from '@/lib/services/audit/carre-scoring-service';
import type {
  CarreModuleCoverageRow,
  CarreModuleAutoSignalRow,
} from '@/lib/services/audit/carre-coverage-service';

/**
 * navMeta — reached via the "Coverage map" button on the chip-reachable
 * /audit/cycles header (and the /audit/dashboard CARE/CARRE section). Also
 * declared in the reachability gate's NAV_EXCLUDE for the same reason.
 */
export const navMeta = {
  invokedFrom: '/audit/cycles',
} as const;

// An audit is out of date once its data is > 90 days old, or once its own
// re-audit deadline has passed — either way it needs a fresh check.
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

type ModuleStatus = 'never-checked' | 'frozen' | 'out-of-date' | 'current';

interface RowStatus {
  status: ModuleStatus;
  index: number | null;
  operativeVerdict: OperativeVerdict | null;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function isOverdue(row: CarreModuleCoverageRow): boolean {
  const now = Date.now();
  const created = new Date(row.created_at).getTime();
  if (Number.isFinite(created) && now - created > NINETY_DAYS_MS) return true;
  if (row.re_audit_date) {
    const due = new Date(`${row.re_audit_date}T00:00:00`).getTime();
    if (Number.isFinite(due) && due < now) return true;
  }
  return false;
}

function computeStatus(row: CarreModuleCoverageRow | null): RowStatus {
  if (!row) {
    return { status: 'never-checked', index: null, operativeVerdict: null };
  }
  // Pure math — the same carreIndex()/respectFrozen() the scoring UI uses.
  const result = carreIndex(row.owner_scores ?? []);
  if (result.respectFrozen) {
    // Respect override supersedes recency: dignity failures show red regardless.
    return { status: 'frozen', index: result.index, operativeVerdict: result.operativeVerdict };
  }
  if (isOverdue(row)) {
    return { status: 'out-of-date', index: result.index, operativeVerdict: result.operativeVerdict };
  }
  return { status: 'current', index: result.index, operativeVerdict: result.operativeVerdict };
}

interface DisplayRow extends RowStatus {
  key: string;
  label: string;
  coverage: CarreModuleCoverageRow | null;
  /** Phase-2 evidence-grade auto-signal for this module, or null. Rendered in a
   *  separate labeled column — NEVER folded into the human status/index above. */
  autoSignal: CarreModuleAutoSignalRow | null;
  untracked?: boolean;
}

/** Phase-2 auto-derived signal cell. Deliberately styled unlike the human
 *  status/score (violet, robot glyph, "auto" tag) so a reader can never confuse
 *  a machine-derived participation number with a human CARRE audit score. */
function AutoSignalCell({ signal }: { signal: CarreModuleAutoSignalRow | null }) {
  if (!signal) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <Badge
          variant="outline"
          className="gap-1 text-[10px] border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200"
        >
          <Bot className="h-3 w-3" />
          auto
        </Badge>
        <span className="text-sm font-semibold tabular-nums text-violet-800 dark:text-violet-200">
          {signal.value_pct}%
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground">
        {signal.label} · {signal.numerator.toLocaleString('en-IN')} of{' '}
        {signal.denominator.toLocaleString('en-IN')} · {signal.cohort_count} sessions ·{' '}
        {signal.window_days}d
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: ModuleStatus }) {
  const map: Record<ModuleStatus, { label: string; cls: string }> = {
    current: {
      label: 'Current',
      cls: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    },
    'out-of-date': {
      label: 'Needs re-check',
      cls: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
    },
    frozen: {
      label: 'Scale-up frozen',
      cls: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
    },
    'never-checked': {
      label: 'Not yet checked',
      cls: 'border-muted-foreground/25 bg-muted text-muted-foreground',
    },
  };
  const { label, cls } = map[status];
  return (
    <Badge variant="outline" className={cn('text-[10px]', cls)}>
      {label}
    </Badge>
  );
}

export default function CarreCoveragePage() {
  const { data, isLoading, error, refetch } = useCarreCoverage();
  // Phase-2 auto-signals load independently; a failure here must NOT break the
  // human coverage table, so it is read best-effort (no error surfacing).
  const { data: autoSignals } = useCarreAutoSignals();

  const { moduleRows, unassigned, tally, frozenRows } = useMemo(() => {
    const rows = data ?? [];
    const autoByKey = new Map<string, CarreModuleAutoSignalRow>();
    for (const s of autoSignals ?? []) {
      if (s?.module_key && !autoByKey.has(s.module_key)) autoByKey.set(s.module_key, s);
    }
    const byKey = new Map<string, CarreModuleCoverageRow>();
    const unassignedRows: CarreModuleCoverageRow[] = [];
    for (const r of rows) {
      if (r.module_key == null) {
        unassignedRows.push(r);
        continue;
      }
      // RPC returns one row per module_key already; first-wins is defensive.
      if (!byKey.has(r.module_key)) byKey.set(r.module_key, r);
    }

    const curatedKeys = new Set(CARRE_AUDITABLE_MODULES.map((m) => m.key));

    const curatedRows: DisplayRow[] = CARRE_AUDITABLE_MODULES.map((m) => {
      const cov = byKey.get(m.key) ?? null;
      return {
        key: m.key,
        label: m.label,
        coverage: cov,
        autoSignal: autoByKey.get(m.key) ?? null,
        ...computeStatus(cov),
      };
    });

    // Audits tagged to a module NOT in the curated list — surfaced so a tag is
    // never silently lost (e.g. a module later dropped from the tracked list).
    const extraRows: DisplayRow[] = [...byKey.entries()]
      .filter(([k]) => !curatedKeys.has(k))
      .map(([k, cov]) => ({
        key: k,
        label: k,
        coverage: cov,
        autoSignal: autoByKey.get(k) ?? null,
        untracked: true,
        ...computeStatus(cov),
      }));

    const allRows = [...curatedRows, ...extraRows];
    const frozen = allRows.filter((r) => r.status === 'frozen');

    return {
      moduleRows: allRows,
      unassigned: unassignedRows,
      frozenRows: frozen,
      tally: {
        M: CARRE_AUDITABLE_MODULES.length,
        N: curatedRows.filter((r) => r.status !== 'never-checked').length,
        overdue: allRows.filter((r) => r.status === 'out-of-date').length,
        frozen: frozen.length,
      },
    };
  }, [data, autoSignals]);

  return (
    <ContentLayout title="CARRE Coverage Map">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Audit', href: '/audit' },
          { label: 'CARRE Coverage', href: '/audit/care/coverage' },
        ]}
      />

      <div className="space-y-6">
        {/* Header card */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <LayoutGrid className="h-5 w-5 text-primary" />
                  CARRE Coverage Map
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                  Every module a learner or staff member directly experiences,
                  with the status of its most-recent CARRE engagement audit.
                  Modules are never graded here — each status comes from a real
                  audit scored by its owner. An audit older than 90 days is shown
                  as <strong>needs re-check</strong>; a module whose operative
                  verdict is a dignity failure is <strong>frozen</strong>.
                </p>
                <p className="text-xs text-muted-foreground mt-2 max-w-2xl">
                  The <strong>Auto-signal</strong> column is a separate,
                  machine-derived read of live participant data — tagged{' '}
                  <span className="text-violet-700 dark:text-violet-300">auto</span>,
                  shown only where the data honestly supports it, and{' '}
                  <strong>never mixed into the human audit score</strong>. Respect
                  is never auto-scored.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/audit/cycles">
                  <Button size="sm" variant="ghost">
                    All audits
                  </Button>
                </Link>
                <Link href="/audit/care/new">
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    New CARRE audit
                  </Button>
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="outline">
                Checked:{' '}
                <span className="ml-1 font-bold">
                  {tally.N} of {tally.M}
                </span>
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  tally.overdue > 0 &&
                    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
                )}
              >
                Overdue: <span className="ml-1 font-bold">{tally.overdue}</span>
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  tally.frozen > 0 &&
                    'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
                )}
              >
                Frozen: <span className="ml-1 font-bold">{tally.frozen}</span>
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Frozen banner */}
        {frozenRows.length > 0 && (
          <div className="rounded-md border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
              <div className="text-sm">
                <p className="font-semibold text-red-800 dark:text-red-200">
                  {frozenRows.length} module
                  {frozenRows.length > 1 ? 's' : ''} frozen for scale-up — a
                  dignity failure (Respect override) supersedes the score.
                </p>
                <p className="mt-1 text-red-700 dark:text-red-300">
                  {frozenRows.map((r) => r.label).join(', ')}
                </p>
                <p className="mt-1 text-xs text-red-700/80 dark:text-red-300/80">
                  Correct the Respect items before any expansion — a high index
                  does not waive this.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Coverage table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-6">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="space-y-3 p-6 text-center">
                <p className="text-sm text-destructive">
                  Failed to load coverage
                </p>
                <p className="text-xs text-muted-foreground">
                  {(error as Error)?.message ?? 'Unknown error'}
                </p>
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Operative verdict</TableHead>
                    <TableHead>Last checked</TableHead>
                    <TableHead>
                      <span className="flex items-center gap-1">
                        <Bot className="h-3.5 w-3.5 text-violet-500" />
                        Auto-signal
                      </span>
                    </TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moduleRows.map((row) => {
                    const frozen = row.status === 'frozen';
                    const stale = row.status === 'out-of-date';
                    const never = row.status === 'never-checked';
                    const scoreText =
                      row.index !== null ? `${row.index}/100` : '—';
                    const verdictText =
                      row.operativeVerdict ??
                      (row.coverage ? 'Awaiting scores' : '—');
                    const actionLabel = never ? 'Audit now' : 'Re-audit';
                    return (
                      <TableRow
                        key={row.key}
                        className={cn(
                          frozen && 'bg-red-50/60 dark:bg-red-950/40',
                        )}
                      >
                        <TableCell>
                          <div className="font-medium">{row.label}</div>
                          {row.coverage && (
                            <Link
                              href={`/audit/care/${row.coverage.cycle_id}`}
                              className="text-xs text-muted-foreground hover:text-foreground line-clamp-1 max-w-xs"
                            >
                              {row.coverage.name}
                            </Link>
                          )}
                          {row.untracked && (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400">
                              tagged module not in tracked list
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={row.status} />
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'text-sm font-semibold tabular-nums',
                              (stale || never) && 'text-muted-foreground',
                              frozen && 'text-red-700 dark:text-red-300',
                            )}
                          >
                            {scoreText}
                          </span>
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-xs',
                            frozen
                              ? 'text-red-700 dark:text-red-300'
                              : 'text-muted-foreground',
                          )}
                        >
                          {verdictText}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.coverage
                            ? formatDate(row.coverage.created_at)
                            : '—'}
                          {stale && (
                            <span className="ml-1 text-amber-600 dark:text-amber-400">
                              · re-check
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <AutoSignalCell signal={row.autoSignal} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/audit/care/new?module=${encodeURIComponent(row.key)}`}
                          >
                            <Button variant="ghost" size="sm">
                              {actionLabel}
                              <ArrowRight className="ml-1 h-3 w-3" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Unassigned checks — CARE/CARRE audits with no module tag. */}
        {unassigned.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Inbox className="h-4 w-4 text-muted-foreground" />
                Unassigned checks
                <Badge variant="secondary" className="text-[10px]">
                  {unassigned.length}
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Engagement audits not yet tagged to a module. Open one to see it,
                or re-open it against a module from the create page.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableBody>
                  {unassigned.map((r) => (
                    <TableRow key={r.cycle_id}>
                      <TableCell>
                        <Link
                          href={`/audit/care/${r.cycle_id}`}
                          className="font-medium hover:underline"
                        >
                          {r.name}
                        </Link>
                        {r.framework && (
                          <Badge
                            variant="secondary"
                            className="ml-2 text-[10px]"
                          >
                            {r.framework}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatDate(r.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
