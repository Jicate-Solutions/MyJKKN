// app/(routes)/accreditation/page.tsx
// ============================================================================
// /accreditation landing — Compliance Unification Program (PR-A7).
// 10 body scoreboard cards + link to /accreditation/coverage deep dashboard.
// Body-agnostic from day one (Director mandate 2026-04-17).
// ============================================================================

'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, BarChart3, Building2, Award } from 'lucide-react';
import { ACCREDITATION_BODIES } from '@/lib/types/accreditation';
import { BodyScoreboardCard } from '@/components/accreditation/body-scoreboard-card';
import { useAccreditationScoreboard } from '@/hooks/accreditation/use-accreditation-scoreboard';

export default function AccreditationLandingPage() {
  const { data: scoreboard, isLoading } = useAccreditationScoreboard();

  // Pair each body meta with its scoreboard row.
  const scoreboardByBody = (scoreboard ?? []).reduce<
    Record<string, (typeof scoreboard)[number]>
  >((acc, row) => {
    if (row) acc[row.body_code] = row;
    return acc;
  }, {});

  const totalMetrics = (scoreboard ?? []).reduce((sum, r) => sum + r.metrics_seeded, 0);
  const totalEvidence = (scoreboard ?? []).reduce((sum, r) => sum + r.evidence_rows, 0);

  return (
    <ContentLayout title="Accreditation & Compliance">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
        ]}
      />

      <div className="space-y-6">
        {/* Header */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Award className="h-6 w-6 text-primary" />
              Accreditation Hub — 10 Compliance Bodies
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              One data substrate feeds NAAC, NIRF, NBA, QS, DCI, PCI, INC,
              AICTE, NCTE, and UGC. Every operational event emits evidence
              for every applicable body — one publication contributes to 4
              bodies simultaneously via the <code>quality_evidence_mappings</code> junction.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Bodies tracked</div>
                <div className="text-2xl font-bold">{ACCREDITATION_BODIES.length}</div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Metrics seeded</div>
                <div className="text-2xl font-bold">
                  {isLoading ? '—' : totalMetrics}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Evidence rows</div>
                <div className="text-2xl font-bold">
                  {isLoading ? '—' : totalEvidence}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Link href="/accreditation/coverage">
                <Button size="sm" variant="outline">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  View coverage matrix
                </Button>
              </Link>
              <Link href="/accreditation/naac">
                <Button size="sm" variant="outline">
                  <Building2 className="mr-2 h-4 w-4" />
                  NAAC (primary — PR-A8)
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Body scoreboard grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ACCREDITATION_BODIES.map((meta) => (
            <BodyScoreboardCard
              key={meta.code}
              meta={meta}
              scoreboard={scoreboardByBody[meta.code]}
              isLoading={isLoading}
            />
          ))}
        </div>

        {/* Footnote */}
        <Card className="bg-muted/30">
          <CardContent className="pt-6 text-xs text-muted-foreground space-y-2">
            <p>
              <strong>Coverage formula</strong> is a placeholder —
              <code> evidence_rows / metrics_seeded</code>. The weighted
              auto-fill % (per <code>docs/one-jkkn-one-data.md §8</code>) lands
              per-body with each body's dashboard PR (A8–A15) as the full
              rubric catalog is seeded.
            </p>
            <p>
              <strong>Principal</strong> is IQAC Chairman (NAAC) + NIRF
              Coordinator + NBA Co-Chair + DCI/PCI/INC Principal +
              AICTE/UGC Institutional Head. Continuous improvement is the
              methodology that runs across every module, not a siloed
              committee. See{' '}
              <Link href="/accreditation/coverage" className="underline">
                /accreditation/coverage
              </Link>
              {' '}for the cross-body weighted coverage matrix across 8
              JKKN colleges.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
