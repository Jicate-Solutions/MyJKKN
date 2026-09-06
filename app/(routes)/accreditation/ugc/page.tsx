// app/(routes)/accreditation/ugc/page.tsx
// ============================================================================
// PR-A15 — UGC Dashboard (Unification Program, 15/15)
//
// University Grants Commission — applies to every JKKN college. The college
// switcher's rows and heading come from _lib/visible-institutions.ts and
// describe what the SIGNED-IN READER can see, like NAAC. Continuous cycle.
// Tracks 6 domains: 2(f)/12(B) Status, Anti-Ragging, Grievance Redressal,
// Fee Structures, Faculty Recruitment, Student Welfare.
//
// HIGHLIGHTS the live fan-out: anti-ragging evidence is already flowing via
// PR-A5 trigger (2026-04-17 on production).
//
// Replaces the PR-A8 c2 BodyPlaceholderPage stub.
// ============================================================================

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Landmark,
  BarChart3,
  ShieldAlert,
  MessageSquareWarning,
  Wallet,
  Users,
  Heart,
  FileCheck,
  Zap,
  School,
} from 'lucide-react';
import { ACCREDITATION_BODIES } from '@/lib/types/accreditation';
import {
  useBodyMetrics,
  useBodyEvidenceCounts,
} from '@/hooks/accreditation/use-body-dashboard';
import type { BodyMetricRow } from '@/hooks/accreditation/use-body-dashboard';
import { useVisibleInstitutions } from '@/hooks/accreditation/use-visible-institutions';
import { AGGREGATE_SCOPE } from '../_lib/visible-institutions';
import { NoVisibleColleges } from '../_components/no-visible-colleges';

// ----------------------------------------------------------------------------
// UGC compliance domains — 6 categories per UGC Act 1956 + Regulations.
// ----------------------------------------------------------------------------
interface UGCDomain {
  key: string;
  name: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  description: string;
  codeHints: string[];
  live?: boolean; // marks domains with live fan-out triggers
  liveNote?: string;
}

const UGC_DOMAINS: UGCDomain[] = [
  {
    key: 'recognition',
    name: '2(f) / 12(B) Status',
    shortLabel: '2(f) / 12(B)',
    icon: FileCheck,
    accent: 'text-slate-700',
    description: 'UGC recognition under Sections 2(f) + 12(B), grants eligibility, affiliation status.',
    codeHints: ['1', '2f', '12b', 'recognition'],
  },
  {
    key: 'anti-ragging',
    name: 'Anti-Ragging',
    shortLabel: 'Anti-Ragging',
    icon: ShieldAlert,
    accent: 'text-red-600',
    description: 'UGC Regulations 2009 — committee formation, affidavit collection, helpline, action records.',
    codeHints: ['2', 'ragging', 'anti-ragging', 'affidavit'],
    live: true,
    liveNote: 'Evidence live — auto-emitted via PR-A5 fan-out trigger from anti_ragging_affidavits',
  },
  {
    key: 'grievance',
    name: 'Grievance Redressal',
    shortLabel: 'Grievance',
    icon: MessageSquareWarning,
    accent: 'text-orange-600',
    description: 'UGC Regulations 2023 §5 — Student Grievance Redressal Committee + anonymous-OK grievances.',
    codeHints: ['3', 'grievance', 'redressal'],
  },
  {
    key: 'fees',
    name: 'Fee Structures',
    shortLabel: 'Fees',
    icon: Wallet,
    accent: 'text-emerald-600',
    description: 'UGC-notified fee caps compliance, transparency, refund policy, capitation-fee prohibition.',
    codeHints: ['4', 'fee', 'fees'],
  },
  {
    key: 'faculty',
    name: 'Faculty Recruitment',
    shortLabel: 'Faculty',
    icon: Users,
    accent: 'text-indigo-600',
    description: 'UGC qualification norms (NET/SET/PhD), UGC pay scales, sanctioned vs working strength.',
    codeHints: ['5', 'faculty', 'recruitment', 'net', 'phd'],
  },
  {
    key: 'welfare',
    name: 'Student Welfare',
    shortLabel: 'Welfare',
    icon: Heart,
    accent: 'text-rose-600',
    description: 'Scholarships, hostel, accessibility (PwD), SC/ST/OBC/EWS welfare measures.',
    codeHints: ['6', 'welfare', 'scholarship', 'accessibility', 'hostel'],
  },
];

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------
export default function UGCDashboardPage() {
  const ugcMeta = ACCREDITATION_BODIES.find((b) => b.code === 'UGC')!;

  // Rows and heading come from the scope module — see _lib/visible-institutions.ts.
  const {
    options: scopeOptions,
    defaultSelection,
    state: scopeState,
    isLoading: institutionsLoading,
  } = useVisibleInstitutions();
  const [picked, setPicked] = useState<string | null>(null);
  const selectedInstitution =
    picked && scopeOptions.some((o) => o.value === picked) ? picked : defaultSelection;
  const setSelectedInstitution = setPicked;

  // In the `none-visible` state `selectedInstitution` is NO_VISIBLE_SCOPE, which
  // is not a uuid — passing it through would become `.eq('institution_id', …)`
  // and fail with a 22P02. The page discards the result below either way, so it
  // asks the same cluster question these readers already send today.
  const evidenceScope =
    scopeState === 'none-visible' ? AGGREGATE_SCOPE : selectedInstitution;

  const { data: metrics, isLoading: metricsLoading } = useBodyMetrics('UGC');
  const { data: evidenceCounts, isLoading: evidenceLoading } = useBodyEvidenceCounts(
    'UGC',
    evidenceScope,
  );

  function domainFor(metric: BodyMetricRow): string {
    const code = (metric.metric_code ?? '').toLowerCase();
    const cat = (metric.category ?? '').toLowerCase();
    const name = (metric.metric_name ?? '').toLowerCase();
    for (const d of UGC_DOMAINS) {
      if (
        d.codeHints.some(
          (h) =>
            code.startsWith(h) ||
            code.includes(h) ||
            cat.includes(h) ||
            name.includes(h),
        )
      ) {
        return d.key;
      }
    }
    return 'other';
  }

  const metricsByDomain = (metrics ?? []).reduce<Record<string, BodyMetricRow[]>>((acc, m) => {
    const k = domainFor(m);
    if (!acc[k]) acc[k] = [];
    acc[k]!.push(m);
    return acc;
  }, {});

  const totalMetrics = (metrics ?? []).length;
  const totalEvidence = Object.values(evidenceCounts ?? {}).reduce((s, n) => s + n, 0);
  const totalMaxScore = (metrics ?? []).reduce((s, m) => s + (m.max_score ?? 0), 0);

  // Anti-ragging live evidence count (for the fan-out callout)
  const antiRaggingMetrics = metricsByDomain['anti-ragging'] ?? [];
  const antiRaggingEvidence = antiRaggingMetrics.reduce(
    (s, m) => s + (evidenceCounts?.[m.metric_code] ?? 0),
    0,
  );

  // No accredited college in this reader's access. Every figure below folds
  // through the visible-college list, so rendering the dashboard would print a
  // measured nought — see _components/no-visible-colleges.tsx for why that is
  // refused rather than dashed out.
  if (scopeState === 'none-visible') {
    return (
      <NoVisibleColleges
        title="UGC — Compliance Dashboard"
        bodyLabel="UGC"
        bodyHref="/accreditation/ugc"
      />
    );
  }

  return (
    <ContentLayout title="UGC — Compliance Dashboard">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'UGC', href: '/accreditation/ugc' },
        ]}
      />

      <div className="space-y-6">
        {/* Header */}
        <Card className={`border-2 ${ugcMeta.accentClass}`}>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Landmark className="h-7 w-7 text-slate-700" />
                  UGC — Compliance Dashboard
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  University Grants Commission. Applies to every JKKN college.
                  Continuous cycle — 2(f)/12(B) status, anti-ragging,
                  grievance redressal, fee structures, faculty recruitment,
                  student welfare.
                </p>
              </div>

              {/* College switcher — the colleges this reader can see */}
              <div className="flex items-center gap-2 min-w-[240px]">
                <Select
                  value={selectedInstitution}
                  onValueChange={setSelectedInstitution}
                  disabled={institutionsLoading}
                >
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="Select college" />
                  </SelectTrigger>
                  <SelectContent>
                    {scopeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          {/* Stat strip */}
          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Metrics seeded</div>
                <div className="text-2xl font-bold">
                  {metricsLoading ? '—' : totalMetrics}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Max score tracked</div>
                <div className="text-2xl font-bold">
                  {metricsLoading ? '—' : totalMaxScore || '—'}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Evidence rows</div>
                <div className="text-2xl font-bold">
                  {evidenceLoading ? '—' : totalEvidence}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Cycle</div>
                <div className="text-lg font-semibold">{ugcMeta.cycleLabel}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/accreditation/coverage">
                <Button variant="outline" size="sm">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Coverage matrix
                </Button>
              </Link>
              <Link href="/accreditation">
                <Button variant="outline" size="sm">
                  <School className="mr-2 h-4 w-4" />
                  All 10 bodies
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* LIVE FAN-OUT CALLOUT — anti-ragging evidence */}
        <Card className="border-2 border-red-300 bg-red-50/50 dark:bg-red-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-5 w-5 text-red-600 fill-red-600" />
              Anti-ragging evidence is LIVE on production
              <Badge variant="destructive" className="ml-2 text-[10px]">
                PR-A5 · Live since 2026-04-17
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Every row inserted into <code className="rounded bg-background px-1 py-0.5 text-xs">anti_ragging_affidavits</code>{' '}
              automatically emits a row into{' '}
              <code className="rounded bg-background px-1 py-0.5 text-xs">quality_evidence_mappings</code>{' '}
              with <code>body_code=&apos;UGC&apos;</code> (and NAAC Attr 7, NIRF Diversity & Outreach, NBA 1.2.2) via the PR-A5 fan-out trigger.
              No manual tagging needed. Current anti-ragging evidence count (this scope):{' '}
              <strong>{evidenceLoading ? '—' : antiRaggingEvidence}</strong> row
              {antiRaggingEvidence === 1 ? '' : 's'}.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              See <code>supabase/setup/04_triggers.sql</code> — trigger{' '}
              <code>trg_anti_ragging_fanout_evidence</code>. Similar fan-outs
              for grievance (PR-A6) will emit on grievance closures per UGC
              Regulations 2023 §5.
            </p>
          </CardContent>
        </Card>

        {/* 6 compliance domain cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {UGC_DOMAINS.map((d) => {
            const metricList = metricsByDomain[d.key] ?? [];
            const domainEvidence = metricList.reduce(
              (s, m) => s + (evidenceCounts?.[m.metric_code] ?? 0),
              0,
            );
            const domainMaxScore = metricList.reduce((s, m) => s + (m.max_score ?? 0), 0);
            const Icon = d.icon;
            return (
              <Card
                key={d.key}
                className={`h-full ${d.live ? 'border-red-300 dark:border-red-700' : ''}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className={`h-5 w-5 ${d.accent}`} />
                      <span>{d.shortLabel}</span>
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      {d.live && (
                        <Badge variant="destructive" className="text-[9px]">
                          Live
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {metricList.length} metrics
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm font-medium">{d.name}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">{d.description}</p>
                  {d.liveNote && (
                    <p className="text-[11px] italic text-red-700 dark:text-red-400">
                      {d.liveNote}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Max score</div>
                      <div className="text-lg font-semibold">{domainMaxScore || '—'}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Evidence</div>
                      <div className="text-lg font-semibold">{domainEvidence}</div>
                    </div>
                  </div>
                  {metricList.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        {metricList.length} metric{metricList.length === 1 ? '' : 's'}
                      </summary>
                      <ul className="mt-2 space-y-1 pl-2">
                        {metricList.map((m) => (
                          <li key={m.metric_code} className="flex items-start justify-between gap-2">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {m.metric_code}
                            </span>
                            <span className="flex-1 text-[11px]">{m.metric_name}</span>
                            <Badge variant="secondary" className="text-[9px]">
                              {evidenceCounts?.[m.metric_code] ?? 0}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer */}
        <Card className="bg-muted/30">
          <CardContent className="pt-6 text-xs text-muted-foreground space-y-2">
            <p>
              <strong>Scope:</strong> UGC applies to every JKKN college. The
              selector above lists the colleges you can see — pick one to drill
              into that college and its compliance surface.
            </p>
            <p>
              <strong>Live fan-outs:</strong> Anti-ragging (PR-A5) — already
              emitting. Grievance (PR-A6, per UGC Regulations 2023 §5) —
              pending. Admission accreditation (PR-A3) — live for NAAC +
              NIRF + UGC enrolment metrics.
            </p>
            <p>
              <strong>Coverage formula (placeholder):</strong> evidence_rows /
              metrics_seeded. Real weighted UGC formula lands as the full
              catalog is seeded per{' '}
              <code>docs/one-jkkn-one-data.md §8</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
