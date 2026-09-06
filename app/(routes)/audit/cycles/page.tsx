// app/(routes)/audit/cycles/page.tsx
// List of audit cycles: active by default, toggle for archive (phase=closed).
// Thrash T6: closed cycles hidden by default with "Show archive" toggle.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Layers,
  Plus,
  Search,
  Inbox,
  ArrowRight,
  RefreshCw,
  LayoutGrid,
  Building2,
} from 'lucide-react';
import { useAuditCycles } from '@/hooks/audit';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { AuditCycleService } from '@/lib/services/audit';
import { CyclePhaseBadge } from '../_components/cycle-phase-badge';
import type { AuditCycle } from '@/lib/types/audit';

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

/**
 * Date range for a cycle row. The standing audit never ends and carries a
 * far-future sentinel end_date from fn_ensure_standing_institution_audit —
 * showing "31 Dec 2099" reads as a real deadline, so say what it means.
 */
function formatCycleRange(cycle: AuditCycle) {
  if (cycle.is_standing) return `${formatDate(cycle.start_date)} — ongoing`;
  return `${formatDate(cycle.start_date)} — ${formatDate(cycle.end_date)}`;
}

// Engagement audits (CARE/CARRE) and compliance audits (NAAC/NBA/…) both live
// in audit_cycles. Classify each row by framework so it routes to its OWN flow:
// engagement → the 0–4 two-scorer scoring UI, compliance → attestations/findings.
const ENGAGEMENT_FRAMEWORKS = new Set(['CARE', 'CARRE']);

function auditKind(frameworks: string[]): 'engagement' | 'compliance' {
  return frameworks.some((f) => ENGAGEMENT_FRAMEWORKS.has(f))
    ? 'engagement'
    : 'compliance';
}

function auditHref(cycle: { id: string; frameworks: string[] }): string {
  return auditKind(cycle.frameworks) === 'engagement'
    ? `/audit/care/${cycle.id}`
    : `/audit/cycles/${cycle.id}`;
}

export default function AuditCyclesPage() {
  const [includeClosed, setIncludeClosed] = useState(false);
  const [search, setSearch] = useState('');

  const {
    data: cycles,
    isLoading,
    error,
    refetch,
  } = useAuditCycles({ includeClosed });

  // Cycle names repeat across colleges and quarters ("Q2 FY26-27 Institutional
  // Audit" twice over), so the name alone can't tell two rows apart. Resolve the
  // college each cycle covers and show it beside the name.
  const { institutions } = useInstitutionsWithAccess();
  const institutionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of institutions) m.set(i.id, i.name);
    return m;
  }, [institutions]);

  const scopeLabel = useCallback(
    (cycle: AuditCycle): string | null => {
      const ids = cycle.institution_ids;
      if (!ids || ids.length === 0) return 'All institutions';
      const names = ids.map((id) => institutionNameById.get(id)).filter(Boolean);
      if (names.length === 0) return null; // names still loading
      if (names.length === 1) return names[0]!;
      return `${names.length} institutions`;
    },
    [institutionNameById]
  );

  // Self-heal: guarantee the standing "Whole Institution — Ongoing" audit exists
  // (it holds the org-wide checks — loop health, exam integrity). Runs once on
  // mount; if the row was ever deleted the RPC recreates it, then we refetch so
  // it reappears in the list below.
  const ensuredRef = useRef(false);
  useEffect(() => {
    if (ensuredRef.current) return;
    ensuredRef.current = true;
    AuditCycleService.ensureStandingAudit()
      .then(() => refetch())
      .catch((err) => {
        console.error('[audit/cycles] ensureStandingAudit failed:', err);
      });
  }, [refetch]);

  const filtered = useMemo<AuditCycle[]>(() => {
    if (!cycles) return [];
    const q = search.trim().toLowerCase();
    const matched = !q
      ? cycles
      : cycles.filter((c) => {
          return (
            c.name.toLowerCase().includes(q) ||
            (c.description ?? '').toLowerCase().includes(q) ||
            c.frameworks.join(' ').toLowerCase().includes(q)
          );
        });
    // Pin the standing whole-institution audit to the top so it never gets lost
    // among the per-college quarterly cycles. Stable sort keeps created_at order
    // (from the service) for every non-standing row.
    return [...matched].sort(
      (a, b) => Number(b.is_standing ?? false) - Number(a.is_standing ?? false),
    );
  }, [cycles, search]);

  const activeCount = (cycles ?? []).filter((c) => c.phase !== 'closed').length;
  const closedCount = (cycles ?? []).filter((c) => c.phase === 'closed').length;

  return (
    <ContentLayout title="Audit Cycles">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Audit', href: '/audit' },
          { label: 'Cycles', href: '/audit/cycles' },
        ]}
      />

      <div className="space-y-6">
        {/* Header card */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  Audits
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Every audit in one place — <strong>compliance</strong> cycles
                  (NAAC/NBA and other bodies) and <strong>engagement</strong> audits
                  (CARE/CARRE). Each row opens its own flow: engagement audits use
                  0–4 two-scorer scoring; compliance cycles use attestations and
                  findings.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/audit/care/coverage">
                  <Button size="sm" variant="outline">
                    <LayoutGrid className="mr-2 h-4 w-4" />
                    Coverage map
                  </Button>
                </Link>
                <Link href="/audit/care/new">
                  <Button size="sm" variant="outline">
                    <Plus className="mr-2 h-4 w-4" />
                    New CARRE audit
                  </Button>
                </Link>
                <Link href="/audit/cycles/new">
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    New compliance cycle
                  </Button>
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Badge variant="outline">
                  Active: <span className="ml-1 font-bold">{activeCount}</span>
                </Badge>
                <Badge variant="outline">
                  Closed: <span className="ml-1 font-bold">{closedCount}</span>
                </Badge>
                <div className="flex items-center gap-2">
                  <Switch
                    id="archive-toggle"
                    checked={includeClosed}
                    onCheckedChange={setIncludeClosed}
                  />
                  <label
                    htmlFor="archive-toggle"
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    Show archive
                  </label>
                </div>
              </div>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search cycles…"
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cycles table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-sm text-destructive">
                  Failed to load audit cycles
                </p>
                <p className="text-xs text-muted-foreground">
                  {(error as Error)?.message ?? 'Unknown error'}
                </p>
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center text-sm text-muted-foreground">
                <Inbox className="h-8 w-8 mb-2" />
                {search ? (
                  <>
                    <p>No cycles match &ldquo;{search}&rdquo;.</p>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setSearch('')}
                    >
                      Clear search
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="font-medium">No audit cycles yet.</p>
                    <p className="text-xs">
                      Create the first one to kick off institution-wide auditing.
                    </p>
                    <Link href="/audit/cycles/new" className="mt-3 inline-block">
                      <Button size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Create cycle
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cycle</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>Frameworks</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow
                      key={c.id}
                      className={
                        c.is_standing
                          ? 'bg-amber-50/50 dark:bg-amber-950/20'
                          : undefined
                      }
                    >
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{c.name}</span>
                          {c.is_standing && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                            >
                              Standing · Whole Institution
                            </Badge>
                          )}
                        </div>
                        {!c.is_standing && scopeLabel(c) && (
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3 shrink-0" />
                            {scopeLabel(c)}
                          </div>
                        )}
                        {c.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1 max-w-md">
                            {c.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <CyclePhaseBadge phase={c.phase} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge
                            variant="outline"
                            className={
                              auditKind(c.frameworks) === 'engagement'
                                ? 'text-[10px] border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                                : 'text-[10px] border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200'
                            }
                          >
                            {auditKind(c.frameworks) === 'engagement'
                              ? 'Engagement'
                              : 'Compliance'}
                          </Badge>
                          {c.frameworks.map((f) => (
                            <Badge
                              key={f}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {f}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatCycleRange(c)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={auditHref(c)}>
                          <Button variant="ghost" size="sm">
                            Open
                            <ArrowRight className="ml-1 h-3 w-3" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
