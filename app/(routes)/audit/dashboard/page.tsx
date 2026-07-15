// app/(routes)/audit/dashboard/page.tsx
// Selvamani's home — Lead Auditor dashboard, redesigned to the approved
// "instrument of record" language (see _components/redesign/kit).
//
// Surface (matches auditor-redesign-mockup.html §dashboard):
//   1. Greeting header + quick actions
//   2. Active-cycle hero — name, dates, frameworks, PhaseStepper, phase pill, Open cycle
//   3. 4-tile KPI row — cleared / open findings / due-within-7 / attestations signed
//   4. "Findings assigned to owners" list (my open findings, owner role from catalog)
//   5. "Coverage by framework" panel — Accreditation / Culture-CARRE / Loop Health meters
//   6. Culture Audits (CARE/CARRE) list — kept as a supporting functional block
//
// Presentation-only reshape of the prior dashboard, PLUS two real fixes:
//   FIX 1 — the KPI strip previously hardcoded findingsClosed=0; the closed count is
//           now computed honestly from this cycle's findings (closed_at / closed status).
//   FIX 2 — the active-cycle picker previously EXCLUDED culture (CARE/CARRE) cycles, so a
//           user whose only open cycle is a culture audit saw "No active cycle". It now
//           considers every non-closed cycle (preferring compliance cycles) and routes a
//           pure-culture cycle to /audit/care/{id} instead of the compliance detail.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  ArrowRight,
  FileText,
  Settings2,
  Layers,
  Inbox,
  CalendarClock,
  RefreshCw,
  RotateCw,
  BookOpen,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { AuditCycleService } from '@/lib/services/audit';
import {
  useAuditCycles,
  useMyFindings,
  useSystemParameters,
  useFindingsByCycle,
  useAttestationsByCycle,
} from '@/hooks/audit';
import { CyclePhaseBadge } from '../_components/cycle-phase-badge';
import { CareDashboardSection } from '../_components/care-dashboard-section';
import {
  SectionEyebrow,
  KpiTile,
  PhaseStepper,
  OwnerChip,
  StatusPill,
  CoverageMeter,
  tally,
} from '../_components/redesign/kit';
import {
  buildParamStatusResolver,
  isOpenFinding,
  type ParamStatus,
} from '../_components/redesign/param-status';
import type {
  AuditCycle,
  AuditFindingView,
  AuditParameterCatalogRow,
  FindingSeverity,
} from '@/lib/types/audit';

// ---------------------------------------------------------------------------
// Formatting + framework helpers
// ---------------------------------------------------------------------------
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

// Engagement audits (CARE/CARRE) have no attestations and live under /audit/care.
const ENGAGEMENT_FRAMEWORKS = new Set(['CARE', 'CARRE']);
function hasComplianceFramework(cycle: AuditCycle): boolean {
  return cycle.frameworks.some((f) => !ENGAGEMENT_FRAMEWORKS.has(f));
}

// FIX 2 — pick the active cycle from ALL non-closed cycles (culture cycles were
// previously excluded, hiding them entirely). Compliance-bearing cycles are
// preferred because the compliance KPIs below are meaningful for them; a
// pure-culture cycle still surfaces so the hero is never empty for its owner.
const PHASE_PRIORITY: Record<string, number> = {
  'in-progress': 0,
  rectification: 1,
  'peer-visit': 2,
  draft: 3,
  closed: 9,
};

function pickActiveCycle(cycles: AuditCycle[] | undefined): AuditCycle | null {
  if (!cycles || cycles.length === 0) return null;
  // The standing "Whole Institution" audit never closes and always sorts first,
  // so it would permanently win this pick and strand every real cycle. It has
  // its own always-on row on this page; exclude it here.
  const open = cycles.filter((c) => c.phase !== 'closed' && !c.is_standing);
  if (open.length === 0) return null;
  return [...open].sort((a, b) => {
    // Compliance cycles first.
    const ca = hasComplianceFramework(a) ? 0 : 1;
    const cb = hasComplianceFramework(b) ? 0 : 1;
    if (ca !== cb) return ca - cb;
    const pa = PHASE_PRIORITY[a.phase] ?? 99;
    const pb = PHASE_PRIORITY[b.phase] ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0]!;
}

// Coverage lanes group parameter codes the same way the parameter sheet does.
type FwKey = 'acc' | 'carre' | 'loop' | 'exam' | 'other';
function frameworkOf(code: string): FwKey {
  const c = code.toUpperCase();
  if (c === 'LOOP_HEALTH') return 'loop';
  if (c === 'EXAM_IA_AUDIT') return 'exam';
  if (c.startsWith('CARRE')) return 'carre';
  if (/^G[1-4]/.test(c)) return 'acc';
  return 'other';
}
const FW_META: { key: FwKey; label: string; auto?: boolean }[] = [
  { key: 'acc', label: 'Accreditation' },
  { key: 'carre', label: 'Culture — CARRE' },
  { key: 'loop', label: 'Loop Health', auto: true },
  { key: 'exam', label: 'Exam Integrity', auto: true },
];

// Map a finding severity to the kit's status vocabulary (for the severity pill).
function severityStatus(sev: FindingSeverity): ParamStatus {
  if (sev === 'red') return 'p1';
  if (sev === 'yellow') return 'p2';
  return 'observation';
}
const SEVERITY_STRIPE: Record<FindingSeverity, string> = {
  red: 'bg-red-500',
  yellow: 'bg-amber-500',
  green: 'bg-sky-500',
};
const SEVERITY_RANK: Record<FindingSeverity, number> = { red: 0, yellow: 1, green: 2 };

const DEFAULT_P1_SLA = 14;
const DEFAULT_P2_SLA = 30;

/** Due date for a finding = submitted_at + the parameter's severity-matched SLA. */
function findingDueDate(
  f: AuditFindingView,
  paramByCode: Map<string, AuditParameterCatalogRow>,
): Date | null {
  if (!f.submitted_at) return null;
  const p = paramByCode.get(f.parameter_code);
  const slaDays =
    f.severity === 'red'
      ? p?.p1_sla_days ?? DEFAULT_P1_SLA
      : p?.p2_sla_days ?? DEFAULT_P2_SLA;
  const d = new Date(f.submitted_at);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + slaDays);
  return d;
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
  const openCycleCount = useMemo(
    () => (cycles ?? []).filter((c) => c.phase !== 'closed').length,
    [cycles],
  );
  const activeIsCulture = activeCycle ? !hasComplianceFramework(activeCycle) : false;

  // Standing "Whole Institution — Ongoing" audit — holds the org-wide checks
  // (loop health, exam integrity). Prefer the already-loaded row; also ensure it
  // exists on mount (self-heal) so the link below never dead-ends.
  const standingCycle = useMemo(
    () => (cycles ?? []).find((c) => c.is_standing) ?? null,
    [cycles],
  );
  const [ensuredStandingId, setEnsuredStandingId] = useState<string | null>(null);
  const standingEnsuredRef = useRef(false);
  useEffect(() => {
    if (standingEnsuredRef.current) return;
    standingEnsuredRef.current = true;
    AuditCycleService.ensureStandingAudit()
      .then(setEnsuredStandingId)
      .catch((err) => {
        console.error('[audit/dashboard] ensureStandingAudit failed:', err);
      });
  }, []);
  const standingId = standingCycle?.id ?? ensuredStandingId;

  const { data: systemParams = [], isLoading: paramsLoading } = useSystemParameters();
  const { data: myFindings = [], isLoading: myFindingsLoading } = useMyFindings(
    profile?.id ?? undefined,
  );
  const { data: cycleFindings = [], isLoading: cycleFindingsLoading } = useFindingsByCycle(
    activeCycle?.id ?? undefined,
  );
  const { data: attestations = [], isLoading: attestationsLoading } = useAttestationsByCycle(
    activeCycle?.id ?? undefined,
  );

  // Live catalog indexed by code — owner role + SLA + the universe of parameters.
  const paramByCode = useMemo(() => {
    const m = new Map<string, AuditParameterCatalogRow>();
    for (const p of systemParams) if (!m.has(p.code)) m.set(p.code, p);
    return m;
  }, [systemParams]);

  // Per-parameter live status for THIS cycle (worst-case findings + full sign-off).
  const resolveStatus = useMemo(
    () =>
      buildParamStatusResolver(
        cycleFindings,
        attestations,
        activeCycle?.institution_ids ?? [],
      ),
    [cycleFindings, attestations, activeCycle?.institution_ids],
  );

  // ---- KPI computations ----------------------------------------------------
  const totalParameters = systemParams.length;

  const clearedCount = useMemo(
    () => systemParams.filter((p) => resolveStatus(p.code) === 'cleared').length,
    [systemParams, resolveStatus],
  );
  const workedCount = useMemo(
    () => systemParams.filter((p) => resolveStatus(p.code) !== 'todo').length,
    [systemParams, resolveStatus],
  );

  const openFindings = useMemo(
    () => cycleFindings.filter(isOpenFinding),
    [cycleFindings],
  );
  const openCount = openFindings.length;
  // FIX 1 — honest closed count: any cycle finding that is no longer open.
  const closedCount = cycleFindings.length - openCount;
  const highOpen = openFindings.filter((f) => f.severity === 'red').length;
  const mediumOpen = openFindings.filter((f) => f.severity === 'yellow').length;

  const dueWithin7 = useMemo(() => {
    const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return openFindings.filter((f) => {
      const due = findingDueDate(f, paramByCode);
      return due !== null && due.getTime() <= horizon;
    }).length;
  }, [openFindings, paramByCode]);

  const signedCount = useMemo(
    () => attestations.filter((a) => a.attested_at).length,
    [attestations],
  );
  const signedParamCount = useMemo(
    () =>
      new Set(attestations.filter((a) => a.attested_at).map((a) => a.parameter_code)).size,
    [attestations],
  );

  const clearedPct = totalParameters
    ? Math.round((clearedCount / totalParameters) * 100)
    : 0;

  // ---- Coverage by framework ----------------------------------------------
  const coverage = useMemo(() => {
    return FW_META.map((fw) => {
      const codes = systemParams
        .filter((p) => frameworkOf(p.code) === fw.key)
        .map((p) => p.code);
      const statuses = codes.map((c) => resolveStatus(c));
      const t = tally(statuses);
      return { ...fw, count: codes.length, cleared: t.cleared, t };
    }).filter((g) => g.count > 0);
  }, [systemParams, resolveStatus]);

  // ---- Findings assigned to owners (my open findings) ----------------------
  const myFindingsSorted = useMemo(() => {
    return [...myFindings]
      .sort((a, b) => {
        const rs = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        if (rs !== 0) return rs;
        const da = findingDueDate(a, paramByCode)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const db = findingDueDate(b, paramByCode)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return da - db;
      })
      .slice(0, 6);
  }, [myFindings, paramByCode]);

  // ---- Greeting (client-only to avoid hydration mismatch) ------------------
  const [clock, setClock] = useState<{ hour: number; label: string } | null>(null);
  useEffect(() => {
    const d = new Date();
    setClock({
      hour: d.getHours(),
      label: d.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
    });
  }, []);
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? null;
  const greeting = clock
    ? clock.hour < 12
      ? 'Good morning'
      : clock.hour < 17
        ? 'Good afternoon'
        : 'Good evening'
    : 'Welcome back';

  const heroLoading = cyclesLoading || paramsLoading;
  const openCycleHref = activeCycle
    ? activeIsCulture
      ? `/audit/care/${activeCycle.id}`
      : `/audit/cycles/${activeCycle.id}`
    : '#';

  return (
    <ContentLayout title="Audit Workflow">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Audit', href: '/audit' },
          { label: 'Dashboard', href: '/audit/dashboard' },
        ]}
      />

      <div className="space-y-8">
        {/* 1 — Greeting + quick actions */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <SectionEyebrow>
              {clock ? `Today · ${clock.label}` : 'Today'}
            </SectionEyebrow>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting}
              {firstName ? `, ${firstName}` : ''}.
            </h1>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
              {activeCycle
                ? `You are leading ${openCycleCount} open audit ${
                    openCycleCount === 1 ? 'cycle' : 'cycles'
                  }. Here is what needs your attention before ${
                    openCycleCount === 1 ? 'it' : 'they'
                  } can be sealed.`
                : 'No audit cycle is open right now. Create one to begin logging findings, freezing a parameter snapshot, and collecting attestations.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <Link href="/audit/findings">
                <FileText className="mr-1.5 h-4 w-4" />
                Log finding
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/audit/cycles/new">
                <Plus className="mr-1.5 h-4 w-4" />
                New cycle
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/audit/parameters">
                <Layers className="mr-1.5 h-4 w-4" />
                Parameters
              </Link>
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/audit/parameters/settings">
                <Settings2 className="mr-1.5 h-4 w-4" />
                Settings
              </Link>
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/guide?module=audit">
                <BookOpen className="mr-1.5 h-4 w-4" />
                Guide
              </Link>
            </Button>
          </div>
        </div>

        {/* 2 — Active-cycle hero */}
        {cyclesError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
            <p className="font-medium text-destructive">Failed to load audit cycles</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(cyclesError as Error)?.message ?? 'Unknown error'}
            </p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => refetchCycles()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        ) : heroLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : !activeCycle ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-card p-8 text-sm">
            <Inbox className="h-7 w-7 text-muted-foreground" />
            <div>
              <p className="font-medium">No active audit cycle.</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Create a cycle to begin logging findings, freezing a parameter snapshot,
                and collecting attestations across institutions.
              </p>
            </div>
            <Button size="sm" asChild>
              <Link href="/audit/cycles/new">
                <Plus className="mr-1.5 h-4 w-4" />
                Create the first cycle
              </Link>
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <SectionEyebrow>Active cycle</SectionEyebrow>
                <h2 className="text-xl font-semibold tracking-tight">{activeCycle.name}</h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {formatDate(activeCycle.start_date)} — {formatDate(activeCycle.end_date)}
                  </span>
                  {activeCycle.frameworks.length > 0 && (
                    <span>{activeCycle.frameworks.join(' · ')}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <CyclePhaseBadge phase={activeCycle.phase} />
                  <span className="rounded border bg-muted/40 px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {workedCount} of {totalParameters} worked
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-start gap-4 lg:items-end">
                <PhaseStepper phase={activeCycle.phase} className="lg:justify-end" />
                <Button asChild>
                  <Link href={openCycleHref}>
                    Open cycle
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Standing whole-institution audit — always-on org-wide checks, kept
            unobtrusive so it complements (not competes with) the active cycle. */}
        {standingId && (
          <Link
            href={`/audit/cycles/${standingId}`}
            className="group flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <ShieldCheck className="h-4 w-4 flex-shrink-0 text-primary" />
              <span>
                <span className="font-medium text-foreground">
                  Whole-institution checks
                </span>{' '}
                — loop health, exam integrity · always on
              </span>
            </span>
            <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}

        {/* 3 + 4 + 5 — KPIs, findings, coverage. Compliance-oriented, so shown only for a
            compliance-bearing active cycle; a pure-culture cycle carries its data in the
            Culture Audits block below instead of misleading all-zero compliance stats. */}
        {activeCycle && !activeIsCulture && !cyclesError && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiTile
                label="Parameters cleared"
                value={clearedCount}
                suffix={`/ ${totalParameters}`}
                sub={`${clearedPct}% of the cycle attested-ready`}
              />
              <KpiTile
                label="Open findings"
                value={openCount}
                tone="crit"
                sub={`${highOpen} high · ${mediumOpen} medium · ${closedCount} closed`}
              />
              <KpiTile
                label="Due within 7 days"
                value={dueWithin7}
                tone="warn"
                sub={
                  dueWithin7 === 0
                    ? 'Nothing near its SLA this week.'
                    : `${dueWithin7} finding${dueWithin7 === 1 ? '' : 's'} approaching SLA`
                }
              />
              <KpiTile
                label="Attestations signed"
                value={signedCount}
                tone="neutral"
                sub={
                  signedCount === 0
                    ? 'Sealing opens once findings clear.'
                    : `across ${signedParamCount} parameter${signedParamCount === 1 ? '' : 's'}`
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
              {/* 4 — Findings assigned to owners */}
              <div className="rounded-xl border bg-card">
                <div className="flex items-center justify-between px-5 pt-5">
                  <h3 className="text-base font-semibold">Findings assigned to owners</h3>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/audit/my-findings">
                      View all
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
                <div className="px-5 pb-5 pt-3">
                  {myFindingsLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : myFindingsSorted.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-muted-foreground">
                      <Inbox className="h-6 w-6" />
                      <p>No open findings assigned to you. Nothing to rectify right now.</p>
                    </div>
                  ) : (
                    <ul className="divide-y">
                      {myFindingsSorted.map((f) => {
                        const p = paramByCode.get(f.parameter_code);
                        const due = findingDueDate(f, paramByCode);
                        const title = f.form_data?.notes ?? p?.name ?? f.parameter_code;
                        const isAuto = Boolean(p?.discovery_query_sql);
                        return (
                          <li key={f.finding_id}>
                            <Link
                              href={`/audit/findings/${f.finding_id}`}
                              className="group flex items-stretch gap-3 py-3 first:pt-0"
                            >
                              <span
                                className={`w-1 flex-shrink-0 rounded-full ${SEVERITY_STRIPE[f.severity]}`}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium group-hover:underline">
                                  {title}
                                </p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                                  <span className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                                    {f.parameter_code}
                                  </span>
                                  <StatusPill status={severityStatus(f.severity)} />
                                  {isAuto && (
                                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                      <RotateCw className="h-3 w-3" />
                                      Auto-detected
                                    </span>
                                  )}
                                  <OwnerChip role={p?.default_owner_role ?? null} />
                                  {due && (
                                    <span className="inline-flex items-center gap-1 tabular-nums">
                                      <CalendarClock className="h-3 w-3" />
                                      Due {formatDate(due.toISOString())}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* 5 — Coverage by framework */}
              <div className="rounded-xl border bg-card p-5">
                <h3 className="text-base font-semibold">Coverage by framework</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  How much of each framework is cleared.
                </p>
                <div className="mt-5 space-y-5">
                  {cycleFindingsLoading || attestationsLoading || paramsLoading ? (
                    [1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)
                  ) : coverage.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No parameters in the catalog yet.</p>
                  ) : (
                    coverage.map((g) => (
                      <div key={g.key}>
                        <div className="mb-1.5 flex items-center justify-between text-sm">
                          <span className="font-medium">{g.label}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {g.auto ? `auto · ${g.count}` : `${g.cleared} / ${g.count}`}
                          </span>
                        </div>
                        <CoverageMeter t={g.t} />
                        {g.auto && (
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            Runs itself each cycle
                            {g.t.p1 + g.t.p2 > 0
                              ? ` · ${g.t.p1 + g.t.p2} finding${g.t.p1 + g.t.p2 === 1 ? '' : 's'} raised`
                              : ''}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* 6 — Culture Audits (CARE/CARRE) — kept: only dashboard entry point for them */}
        <CareDashboardSection />
      </div>
    </ContentLayout>
  );
}
