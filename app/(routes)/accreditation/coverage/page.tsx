// app/(routes)/accreditation/coverage/page.tsx
// ============================================================================
// /accreditation/coverage — cross-body weighted coverage matrix (PR-A7).
// North-Star measurement UI per docs/one-jkkn-one-data §8, 10.
// ============================================================================

'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, TrendingUp, Inbox } from 'lucide-react';
import { ACCREDITATION_BODIES } from '@/lib/types/accreditation';
import { useAccreditationCoverage } from '@/hooks/accreditation/use-accreditation-scoreboard';

export default function AccreditationCoveragePage() {
  const { data: matrix, isLoading } = useAccreditationCoverage();

  // Group matrix rows by body for rendering
  const groupedByBody = (matrix ?? []).reduce<
    Record<string, typeof matrix>
  >((acc, row) => {
    if (!row) return acc;
    const key = row.body_code;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(row);
    return acc;
  }, {});

  const totalRows = matrix?.length ?? 0;
  const avgCoverage =
    matrix && matrix.length
      ? Math.round(matrix.reduce((sum, r) => sum + r.coverage_pct, 0) / matrix.length)
      : 0;

  return (
    <ContentLayout title="Coverage Matrix">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'Coverage', href: '/accreditation/coverage' },
        ]}
      />

      <div className="space-y-6">
        {/* Header stats */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Cross-Body Coverage Matrix
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              One row per (body × college) with evidence. Coverage is
              <code className="mx-1">evidence_rows / metrics_seeded</code>
              (placeholder). Real weighted formula per
              <code className="mx-1">docs/one-jkkn-one-data.md §8</code> lands
              with each body's dashboard.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Rows</div>
                <div className="text-2xl font-bold">
                  {isLoading ? '—' : totalRows}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Avg coverage</div>
                <div className="text-2xl font-bold flex items-center gap-2">
                  {isLoading ? '—' : `${avgCoverage}%`}
                  {!isLoading && avgCoverage > 0 && (
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  )}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Bodies with evidence</div>
                <div className="text-2xl font-bold">
                  {isLoading ? '—' : Object.keys(groupedByBody).length}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Matrix — one card per body */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : matrix && matrix.length > 0 ? (
          <div className="space-y-4">
            {ACCREDITATION_BODIES.map((meta) => {
              const rows = groupedByBody[meta.code];
              if (!rows || rows.length === 0) return null;
              return (
                <Card key={meta.code} className={meta.accentClass}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>
                        {meta.shortLabel}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {meta.name}
                        </span>
                      </span>
                      <Link
                        href={`/accreditation/${meta.code.toLowerCase()}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Open dashboard →
                      </Link>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Institution</TableHead>
                          <TableHead className="text-right">Evidence</TableHead>
                          <TableHead className="text-right">Metrics</TableHead>
                          <TableHead className="w-[200px]">Coverage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((row) => (
                          <TableRow key={`${row.body_code}-${row.institution_id}`}>
                            <TableCell className="font-medium">
                              <span className="flex items-center gap-2">
                                {row.iqac_code && (
                                  <Badge variant="outline" className="text-[10px] font-mono">
                                    {row.iqac_code}
                                  </Badge>
                                )}
                                <span>{row.institution_name}</span>
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {row.evidence_rows}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {row.metrics_seeded}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={row.coverage_pct} className="h-2 flex-1" />
                                <span className="text-xs font-medium w-10 text-right">
                                  {row.coverage_pct}%
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <div>No evidence rows yet.</div>
              <div className="text-xs">
                Coverage populates as modules emit{' '}
                <code>quality_evidence_mappings</code> rows via fan-out triggers
                (PR-A5 anti-ragging is live; PR-A3 admission + PR-A9 NIRF
                publications triggers incoming).
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
