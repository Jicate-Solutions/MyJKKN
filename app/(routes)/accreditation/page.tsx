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
import { useAuth } from '@/hooks/use-auth';
import { useInstitutionBodyScope } from '@/hooks/accreditation/use-institution-bodies';
import { isBodyInScope, appliesToNobody } from './_lib/institution-body-scope';

export default function AccreditationLandingPage() {
  const { data: scoreboard, isLoading } = useAccreditationScoreboard();
  const { profile } = useAuth();

  // The hub is cluster-wide, but the person reading it belongs to one college.
  // Showing a dental card to an engineering HOD is the same wrong-denominator
  // bug one level up, so the cards are narrowed to the bodies their own campus
  // answers to. An unread mapping narrows nothing (see institution-body-scope).
  const { scope } = useInstitutionBodyScope(
    (profile?.institution_id as string | undefined) ?? null,
  );

  // Someone sitting in an office or a company answers to no body at all, and
  // for them the hub is the cluster view — narrowing it to nothing would leave
  // a page with no content and no explanation. They see everything, labelled.
  const narrowing = scope.kind === 'known' && !appliesToNobody(scope);
  const visibleBodies = narrowing
    ? ACCREDITATION_BODIES.filter((meta) => isBodyInScope(scope, meta.code))
    : ACCREDITATION_BODIES;

  // Pair each body meta with its scoreboard row.
  const scoreboardByBody = (scoreboard ?? []).reduce<
    Record<string, (typeof scoreboard)[number]>
  >((acc, row) => {
    if (row) acc[row.body_code] = row;
    return acc;
  }, {});

  // The totals move with the cards. Summing all ten bodies beneath a list of
  // five would restate the wrong denominator in the header — the same half-fix
  // that left "of 107" on the owners desk.
  const countedRows = (scoreboard ?? []).filter(
    (r) => !narrowing || isBodyInScope(scope, r.body_code),
  );
  const totalMetrics = countedRows.reduce((sum, r) => sum + r.metrics_seeded, 0);
  const totalEvidence = countedRows.reduce((sum, r) => sum + r.evidence_rows, 0);

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
              Accreditation Hub
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              One data substrate feeds every awarding, ranking and regulatory
              body JKKN answers to. Every operational event emits evidence
              for every applicable body — one publication contributes to 4
              bodies simultaneously via the <code>quality_evidence_mappings</code> junction.
            </p>
            <p className="text-xs text-muted-foreground">
              {narrowing
                ? 'Showing the bodies your campus answers to. Every college is measured only against its own — a dental council metric is not a gap in an engineering college.'
                : 'Showing every body in the cluster. Which of them apply to each campus is recorded in Manage → Awarding Bodies.'}
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">
                  {narrowing ? 'Bodies for your campus' : 'Bodies tracked'}
                </div>
                <div className="text-2xl font-bold">{visibleBodies.length}</div>
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
          {visibleBodies.map((meta) => (
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
