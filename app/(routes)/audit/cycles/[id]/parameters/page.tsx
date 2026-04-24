'use client';

// app/(routes)/audit/cycles/[id]/parameters/page.tsx
// Cycle-scoped parameter snapshot. If the cycle has been started (non-draft
// phase), `parameter_catalog_snapshot` holds a frozen copy of the catalog
// taken when the cycle left the draft phase. For draft cycles we show a
// preview of the live system catalog and warn that it will freeze on start.
//
// Rows grouped by parameter_group (1=Academic, 2=Research, 3=Governance,
// 4=Infrastructure). Click a row → /audit/parameters/[code].

import { use, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  ArrowLeft,
  ChevronRight,
  Info,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { useAuditCycle } from '@/hooks/audit/use-audit-cycles';
import { useSystemParameters } from '@/hooks/audit/use-audit-parameters';
import { FrameworkMappingDisplay } from '../../../_components/parameters/framework-mapping-display';
import { CyclePhaseBadge } from '../../../_components/cycle-phase-badge';
import type {
  AuditParameterCatalogRow,
  ParameterGroup,
} from '@/lib/types/audit';

const GROUPS: { value: ParameterGroup; label: string; hint: string }[] = [
  { value: 1, label: 'Group 1', hint: 'Academic / Curricular' },
  { value: 2, label: 'Group 2', hint: 'Research' },
  { value: 3, label: 'Group 3', hint: 'Governance' },
  { value: 4, label: 'Group 4', hint: 'Infrastructure' },
];

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Extract the parameter array from a cycle snapshot. The JSONB may be stored
 * as `{ parameters: [...] }` or as a bare array. Handle both defensively.
 */
function extractSnapshotParameters(
  snapshot: Record<string, unknown> | null,
): AuditParameterCatalogRow[] | null {
  if (!snapshot) return null;
  if (Array.isArray((snapshot as { parameters?: unknown[] }).parameters)) {
    return (snapshot as { parameters: AuditParameterCatalogRow[] }).parameters;
  }
  if (Array.isArray(snapshot as unknown)) {
    return snapshot as unknown as AuditParameterCatalogRow[];
  }
  return null;
}

export default function CycleParametersPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const {
    data: cycle,
    isLoading: cycleLoading,
    error: cycleError,
    refetch,
  } = useAuditCycle(id);
  const { data: systemParams = [], isLoading: systemLoading } =
    useSystemParameters();

  const snapshotParams = useMemo(
    () => extractSnapshotParameters(cycle?.parameter_catalog_snapshot ?? null),
    [cycle?.parameter_catalog_snapshot],
  );

  // Preferred source: frozen snapshot (if present), else live system catalog.
  const isSnapshot = snapshotParams !== null && snapshotParams.length > 0;
  const rows: AuditParameterCatalogRow[] = isSnapshot
    ? snapshotParams!
    : systemParams;

  const byGroup = useMemo(() => {
    const map = new Map<ParameterGroup, AuditParameterCatalogRow[]>();
    for (const g of GROUPS) map.set(g.value, []);
    for (const row of rows) {
      const bucket = map.get(row.parameter_group);
      if (bucket) bucket.push(row);
    }
    // Sort each group by code for stable display
    for (const [, arr] of map) {
      arr.sort((a, b) => a.code.localeCompare(b.code));
    }
    return map;
  }, [rows]);

  const loading = cycleLoading || (!isSnapshot && systemLoading);

  return (
    <PermissionGuard module="audit" action="parameter.view">
      <ContentLayout
        title={cycle?.name ? `${cycle.name} — Parameters` : 'Cycle Parameters'}
      >
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Audit', href: '/audit' },
            { label: 'Cycles', href: '/audit/cycles' },
            {
              label: cycle?.name ?? 'Cycle',
              href: `/audit/cycles/${id}`,
            },
            { label: 'Parameters', isCurrent: true },
          ]}
        />

        <div className="space-y-6">
          {cycleError ? (
            <Card>
              <CardContent className="py-8 text-center space-y-3">
                <p className="text-sm text-destructive">Failed to load cycle</p>
                <p className="text-xs text-muted-foreground">
                  {(cycleError as Error)?.message ?? 'Unknown error'}
                </p>
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-4">
                <div className="flex flex-col gap-2">
                  <Link
                    href={`/audit/cycles/${id}`}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Back to cycle
                  </Link>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-xl font-semibold tracking-tight">
                      {cycleLoading
                        ? 'Loading cycle…'
                        : cycle?.name ?? 'Cycle parameters'}
                    </h1>
                    {cycle && <CyclePhaseBadge phase={cycle.phase} />}
                    {isSnapshot ? (
                      <Badge
                        variant="outline"
                        className="text-xs border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      >
                        <Lock className="mr-1 h-3 w-3" />
                        Frozen snapshot
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-xs border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                      >
                        Preview
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isSnapshot
                      ? 'Parameter catalog frozen at cycle start. Attestations and findings reference this list for the duration of the cycle.'
                      : 'Preview of the live system catalog. This list is frozen into a snapshot when the cycle leaves the draft phase.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {!isSnapshot && !cycleError && !cycleLoading && (
            <div className="rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-700 dark:text-amber-300 flex-shrink-0" />
              <div className="text-amber-900 dark:text-amber-100">
                <p className="font-medium">Snapshot not yet frozen</p>
                <p className="text-amber-800 dark:text-amber-200">
                  Showing the current system catalog as a preview. Once this
                  cycle transitions from <em>draft</em> to <em>in-progress</em>,
                  the catalog will be captured and locked for audit integrity.
                </p>
              </div>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Parameters
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({rows.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="1">
                <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
                  {GROUPS.map((g) => {
                    const count = byGroup.get(g.value)?.length ?? 0;
                    return (
                      <TabsTrigger key={g.value} value={String(g.value)}>
                        <span className="flex flex-col items-center">
                          <span className="text-sm font-semibold">{g.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {g.hint} ({count})
                          </span>
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                {GROUPS.map((g) => {
                  const groupRows = byGroup.get(g.value) ?? [];
                  return (
                    <TabsContent
                      key={g.value}
                      value={String(g.value)}
                      className="mt-4"
                    >
                      <ParameterGroupTable
                        rows={groupRows}
                        loading={loading}
                        onRowClick={(code) =>
                          router.push(
                            `/audit/parameters/${encodeURIComponent(code)}`,
                          )
                        }
                      />
                    </TabsContent>
                  );
                })}
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

function ParameterGroupTable({
  rows,
  loading,
  onRowClick,
}: {
  rows: AuditParameterCatalogRow[];
  loading: boolean;
  onRowClick: (code: string) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No parameters in this group.
      </p>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="w-[110px]">Evidence</TableHead>
            <TableHead className="w-[220px]">Framework Mapping</TableHead>
            <TableHead className="w-[40px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const evidenceCount = Array.isArray(row.evidence_required)
              ? row.evidence_required.length
              : 0;
            return (
              <TableRow
                key={`${row.code}-${row.institution_id ?? 'sys'}`}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => onRowClick(row.code)}
              >
                <TableCell className="font-mono text-xs">{row.code}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{row.name}</span>
                    {row.institution_id && (
                      <Badge variant="outline" className="text-[10px]">
                        override
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {evidenceCount
                    ? `${evidenceCount} required`
                    : '—'}
                </TableCell>
                <TableCell>
                  <FrameworkMappingDisplay mapping={row.framework_mapping} />
                </TableCell>
                <TableCell>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
