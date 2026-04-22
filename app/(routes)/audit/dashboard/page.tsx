// app/(routes)/audit/dashboard/page.tsx
// Selvamani's home — Lead Auditor dashboard.
// Spec: specs/myjkkn-audit-workflow-sprint-01-plan.md §Routes
//
// Sections:
// 1. Active-cycle card (or "no active cycle — create one" CTA)
// 2. 4-KPI progress strip (parameters / attestations / findings / coverage)
// 3. Coverage heatmap mini
// 4. My overdue findings (top 5) — uses useMyFindings
// 5. Quick actions row

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
  ShieldCheck,
  Plus,
  AlertCircle,
  ArrowRight,
  FileText,
  Settings2,
  Layers,
  Inbox,
  CalendarClock,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useAuditCycles,
  useAttestationRollup,
  useMyFindings,
  useSystemParameters,
} from '@/hooks/audit';
import { CyclePhaseBadge } from '../_components/cycle-phase-badge';
import { CycleProgressStats } from '../_components/cycle-progress-stats';
import { CoverageHeatmapMini } from '../_components/coverage-heatmap-mini';
import type { AuditCycle, AuditFindingView } from '@/lib/types/audit';

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

function pickActiveCycle(cycles: AuditCycle[] | undefined): AuditCycle | null {
  if (!cycles || cycles.length === 0) return null;
  // Preference: in-progress > rectification > peer-visit > draft; most-recently created wins.
  const priority: Record<string, number> = {
    'in-progress': 0,
    rectification: 1,
    'peer-visit': 2,
    draft: 3,
    closed: 9,
  };
  return [...cycles].sort((a, b) => {
    const pa = priority[a.phase] ?? 99;
    const pb = priority[b.phase] ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0]!;
}

// Split findings into P1 (red/urgent/high) and P2 (yellow/medium) buckets
function bucketFindings(findings: AuditFindingView[]) {
  const p1: AuditFindingView[] = [];
  const p2: AuditFindingView[] = [];
  for (const f of findings) {
    if (f.severity === 'red' || f.priority === 'urgent' || f.priority === 'high') {
      p1.push(f);
    } else if (f.severity === 'yellow' || f.priority === 'medium') {
      p2.push(f);
    }
  }
  return { p1: p1.slice(0, 5), p2: p2.slice(0, 5) };
}

export default function AuditDashboardPage() {
  const { profile } = useAuth();

  const {
    data: cycles,
    isLoading: cyclesLoading,
    error: cyclesError,
    refetch: refetchCycles,
  } = useAuditCycles();

  const activeCycle = useMemo(() => pickActiveCycle(cycles), [cycles]);

  const { data: rollup, isLoading: rollupLoading } = useAttestationRollup(
    activeCycle?.id ?? undefined,
  );

  const {
    data: myFindings,
    isLoading: findingsLoading,
  } = useMyFindings(profile?.id ?? undefined);

  const { data: systemParams, isLoading: paramsLoading } = useSystemParameters();

  const { p1, p2 } = useMemo(
    () => bucketFindings(myFindings ?? []),
    [myFindings],
  );

  const totalParameters = systemParams?.length ?? 0;

  return (
    <ContentLayout title="Audit Workflow">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Audit', href: '/audit' },
          { label: 'Dashboard', href: '/audit/dashboard' },
        ]}
      />

      <div className="space-y-6">
        {/* Hero / active cycle */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <CardTitle className="flex items-center gap-2 text-xl">
                <ShieldCheck className="h-6 w-6 text-primary" />
                Audit Workflow
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Link href="/audit/cycles/new">
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Create cycle
                  </Button>
                </Link>
                <Link href="/audit/findings">
                  <Button size="sm" variant="outline">
                    <FileText className="mr-2 h-4 w-4" />
                    Log finding
                  </Button>
                </Link>
                <Link href="/audit/parameters">
                  <Button size="sm" variant="outline">
                    <Layers className="mr-2 h-4 w-4" />
                    Parameters
                  </Button>
                </Link>
                <Link href="/audit/parameters/settings">
                  <Button size="sm" variant="ghost">
                    <Settings2 className="mr-2 h-4 w-4" />
                    Settings
                  </Button>
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {cyclesLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : cyclesError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
                <p className="font-medium text-destructive">
                  Failed to load audit cycles
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {(cyclesError as Error)?.message ?? 'Unknown error'}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => refetchCycles()}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </div>
            ) : !activeCycle ? (
              <div className="flex flex-col items-start gap-3 rounded-md border border-dashed p-6 text-sm">
                <Inbox className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="font-medium">No active audit cycle.</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Create a cycle to begin logging findings, freezing a parameter snapshot,
                    and collecting attestations across institutions.
                  </p>
                </div>
                <Link href="/audit/cycles/new">
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Create the first cycle
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{activeCycle.name}</h2>
                    <CyclePhaseBadge phase={activeCycle.phase} />
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      {formatDate(activeCycle.start_date)} — {formatDate(activeCycle.end_date)}
                    </span>
                    {activeCycle.frameworks.length > 0 && (
                      <span>Frameworks: {activeCycle.frameworks.join(' · ')}</span>
                    )}
                  </div>
                  {activeCycle.description && (
                    <p className="text-xs text-muted-foreground max-w-xl pt-1">
                      {activeCycle.description}
                    </p>
                  )}
                </div>
                <Link href={`/audit/cycles/${activeCycle.id}`}>
                  <Button variant="outline" size="sm">
                    Open cycle
                    <ArrowRight className="ml-2 h-3 w-3" />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPI strip */}
        <CycleProgressStats
          totalParameters={totalParameters}
          compliant={rollup?.compliant ?? 0}
          partial={rollup?.partial ?? 0}
          nonCompliant={rollup?.non_compliant ?? 0}
          findingsOpen={(myFindings ?? []).length}
          findingsClosed={0}
          isLoading={cyclesLoading || rollupLoading || paramsLoading}
        />

        {/* Coverage heatmap */}
        <CoverageHeatmapMini activeCycleId={activeCycle?.id ?? null} />

        {/* My findings — P1 + P2 lists side by side */}
        <div className="grid gap-4 lg:grid-cols-2">
          <FindingsColumn
            title="P1 — High priority"
            subtitle="14-day SLA · Red / High"
            accent="text-rose-600"
            findings={p1}
            isLoading={findingsLoading}
            emptyLabel="No high-priority findings assigned to you."
          />
          <FindingsColumn
            title="P2 — Medium priority"
            subtitle="30-day SLA · Yellow / Medium"
            accent="text-amber-600"
            findings={p2}
            isLoading={findingsLoading}
            emptyLabel="No medium-priority findings assigned to you."
          />
        </div>
      </div>
    </ContentLayout>
  );
}

interface FindingsColumnProps {
  title: string;
  subtitle: string;
  accent: string;
  findings: AuditFindingView[];
  isLoading?: boolean;
  emptyLabel: string;
}

function FindingsColumn({
  title,
  subtitle,
  accent,
  findings,
  isLoading,
  emptyLabel,
}: FindingsColumnProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className={`h-5 w-5 ${accent}`} />
            {title}
          </CardTitle>
          <Link href="/audit/my-findings">
            <Button variant="ghost" size="sm">
              View all
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : findings.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center text-xs text-muted-foreground">
            <Inbox className="h-6 w-6 mb-2" />
            <p>{emptyLabel}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {findings.map((f) => (
              <li
                key={f.finding_id}
                className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {f.request_number ?? f.finding_id.slice(0, 8)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        f.severity === 'red'
                          ? 'border-rose-300 text-rose-700'
                          : f.severity === 'yellow'
                            ? 'border-amber-300 text-amber-700'
                            : 'border-emerald-300 text-emerald-700'
                      }`}
                    >
                      {f.severity}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {f.status}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-xs">
                    <span className="font-mono">{f.parameter_code}</span>
                    {f.form_data?.notes ? ` — ${f.form_data.notes}` : ''}
                  </p>
                </div>
                <Link
                  href={`/audit/findings/${f.finding_id}`}
                  className="text-xs text-primary hover:underline flex-shrink-0"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
