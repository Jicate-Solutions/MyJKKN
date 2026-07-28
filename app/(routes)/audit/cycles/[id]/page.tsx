// app/(routes)/audit/cycles/[id]/page.tsx
// Cycle workspace: the auditor's home base for one cycle. Action bar (AuditHeader)
// on top, then a phase spine (where am I / what's next) and three workspace cards
// that link to the real sub-pages (parameter sheet, findings, attestations).
//
// The old Overview/Findings/Parameters/Attestations shadcn Tabs only ever rendered
// Overview — the other tabs showed a button that navigated away (a misleading
// double-click). That is replaced here by the redesigned Cycle-workspace surface.

'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  PlayCircle,
  ClipboardCheck,
  Users,
  CheckCircle2,
  Archive,
  Trash2,
  AlertCircle,
  RefreshCw,
  Layers,
  AlertTriangle,
  Signature,
  ArrowRight,
  Info,
  CalendarDays,
  UserCircle2,
  Sparkles,
} from 'lucide-react';
import {
  useAuditCycle,
  useTransitionCyclePhase,
  useDeleteDraftCycle,
  useAttestationRollup,
  useFindingsByCycle,
  useSystemParameters,
} from '@/hooks/audit';
import { useAttestationsByCycle } from '@/hooks/audit/use-audit-attestations';
import { AuditHeader } from '../../_components/audit-header';
import { CyclePhaseBadge } from '../../_components/cycle-phase-badge';
import {
  SectionEyebrow,
  PhaseStepper,
  StatusPill,
  CoverageMeter,
  tally,
} from '../../_components/redesign/kit';
import {
  buildParamStatusResolver,
  isOpenFinding,
} from '../../_components/redesign/param-status';
import type { AuditCyclePhase } from '@/lib/types/audit';

interface PageProps {
  params: Promise<{ id: string }>;
}

const PHASE_FLOW: Array<{
  from: AuditCyclePhase;
  to: AuditCyclePhase;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  {
    from: 'draft',
    to: 'in-progress',
    label: 'Start cycle',
    icon: PlayCircle,
    description:
      'Freeze the parameter snapshot and open attestations + findings for the selected institutions.',
  },
  {
    from: 'in-progress',
    to: 'rectification',
    label: 'Move to rectification',
    icon: ClipboardCheck,
    description:
      'Findings have been logged; owners now have SLA windows to upload evidence and close gaps.',
  },
  {
    from: 'rectification',
    to: 'peer-visit',
    label: 'Open peer visit',
    icon: Users,
    description:
      'External / mock peer team is on site. Evidence is frozen except for peer notes.',
  },
  {
    from: 'peer-visit',
    to: 'closed',
    label: 'Close cycle',
    icon: CheckCircle2,
    description:
      'Lock the cycle. All attestations and findings move to the historical archive.',
  },
];

// Where the phase sits in the 4-step spine (mirrors the kit's PhaseStepper grouping:
// rectification + peer-visit both live in step 3, "Review & sign-off").
const PHASE_STEP: Record<AuditCyclePhase, { num: number; label: string }> = {
  draft: { num: 1, label: 'Draft' },
  'in-progress': { num: 2, label: 'In progress' },
  rectification: { num: 3, label: 'Review & sign-off' },
  'peer-visit': { num: 3, label: 'Review & sign-off' },
  closed: { num: 4, label: 'Sealed' },
};

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

export default function AuditCycleDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const { data: cycle, isLoading, error, refetch } = useAuditCycle(id);

  const { data: rollup } = useAttestationRollup(id);
  const { data: findings } = useFindingsByCycle(id);
  const { data: attestations } = useAttestationsByCycle(id);
  const { data: systemParams } = useSystemParameters();

  const transition = useTransitionCyclePhase();
  const deleteDraft = useDeleteDraftCycle();

  const nextTransition = useMemo(() => {
    if (!cycle) return null;
    return PHASE_FLOW.find((step) => step.from === cycle.phase) ?? null;
  }, [cycle]);

  // Parameter codes for this cycle: frozen snapshot if present, else the live catalog.
  const paramCodes = useMemo(() => {
    const snap = cycle?.parameter_catalog_snapshot as
      | { parameters?: Array<{ code?: string }> }
      | null
      | undefined;
    const fromSnap = Array.isArray(snap?.parameters)
      ? snap!.parameters
      : Array.isArray(snap as unknown)
        ? (snap as unknown as Array<{ code?: string }>)
        : null;
    const source =
      fromSnap && fromSnap.length ? fromSnap : (systemParams ?? []);
    return source
      .map((p) => p?.code)
      .filter((c): c is string => Boolean(c));
  }, [cycle?.parameter_catalog_snapshot, systemParams]);

  // Live per-parameter status (worst-case across institutions; cleared only when
  // fully signed) — the single source of truth shared with the parameter sheet.
  const paramStatuses = useMemo(() => {
    const resolve = buildParamStatusResolver(
      findings ?? [],
      attestations ?? [],
      cycle?.institution_ids ?? [],
    );
    return paramCodes.map(resolve);
  }, [findings, attestations, cycle?.institution_ids, paramCodes]);

  const t = useMemo(() => tally(paramStatuses), [paramStatuses]);
  const totalParameters = paramCodes.length;
  const clearedCount = t.cleared;
  const findingParams = t.p1 + t.p2;
  const toGo = Math.max(0, totalParameters - clearedCount - findingParams);

  // Open findings by severity (for the Findings card pills).
  const { openFindings, highOpen, mediumOpen } = useMemo(() => {
    const open = (findings ?? []).filter(isOpenFinding);
    return {
      openFindings: open.length,
      highOpen: open.filter((f) => f.severity === 'red').length,
      mediumOpen: open.filter((f) => f.severity === 'yellow').length,
    };
  }, [findings]);

  // Signed parameters: fully attested across in-scope institutions (or ≥1 signed
  // when the cycle has no institution denominator). Mirrors the resolver's signing rule.
  const signedCount = useMemo(() => {
    const inScope = (cycle?.institution_ids ?? []).filter(Boolean);
    const signedInstByCode = new Map<string, Set<string>>();
    for (const a of attestations ?? []) {
      if (!a.attested_at) continue;
      const set = signedInstByCode.get(a.parameter_code) ?? new Set<string>();
      set.add(a.institution_id);
      signedInstByCode.set(a.parameter_code, set);
    }
    let n = 0;
    for (const code of paramCodes) {
      const s = signedInstByCode.get(code);
      if (!s || s.size === 0) continue;
      if (inScope.length > 0 ? inScope.every((iid) => s.has(iid)) : true) n++;
    }
    return n;
  }, [attestations, paramCodes, cycle?.institution_ids]);

  async function handleTransition() {
    if (!cycle || !nextTransition) return;
    try {
      await transition.mutateAsync({ id: cycle.id, phase: nextTransition.to });
    } catch (e) {
      // Error is surfaced via the mutation state UI below
      console.error('[audit/cycles] transition failed', e);
    }
  }

  async function handleDeleteDraft() {
    if (!cycle) return;
    try {
      await deleteDraft.mutateAsync(cycle.id);
      router.push('/audit/cycles');
    } catch (e) {
      console.error('[audit/cycles] delete draft failed', e);
    }
  }

  const step = cycle ? PHASE_STEP[cycle.phase] : null;
  const isSealed = cycle?.phase === 'closed';

  return (
    <ContentLayout title={cycle?.name ?? 'Audit Cycle'}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Audit', href: '/audit' },
          { label: 'Cycles', href: '/audit/cycles' },
          { label: cycle?.name ?? 'Detail', href: `/audit/cycles/${id}` },
        ]}
      />

      <div className="space-y-6">
        {error ? (
          <Card>
            <CardContent className="py-8 text-center space-y-3">
              <p className="text-sm text-destructive">Failed to load cycle</p>
              <p className="text-xs text-muted-foreground">
                {(error as Error)?.message ?? 'Unknown error'}
              </p>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <AuditHeader
            cycle={cycle}
            isLoading={isLoading}
            rightSlot={
              cycle && (
                <div className="flex flex-wrap gap-2">
                  {nextTransition && (
                    <Button
                      size="sm"
                      onClick={handleTransition}
                      disabled={transition.isPending}
                    >
                      <nextTransition.icon className="mr-2 h-4 w-4" />
                      {nextTransition.label}
                    </Button>
                  )}
                  {cycle.phase === 'draft' && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete draft
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this draft cycle?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes &ldquo;{cycle.name}&rdquo;.
                            Only draft cycles can be deleted — once started, cycles
                            must be closed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDeleteDraft}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  {cycle.phase === 'closed' && (
                    <Button size="sm" variant="ghost" disabled>
                      <Archive className="mr-2 h-4 w-4" />
                      Archived
                    </Button>
                  )}
                </div>
              )
            }
          />
        )}

        {/* Phase-transition error feedback */}
        {transition.isError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
            <div>
              <p className="font-medium text-destructive">
                Could not transition phase
              </p>
              <p className="text-muted-foreground">
                {(transition.error as Error)?.message}
              </p>
            </div>
          </div>
        )}

        {/* Redesigned cycle workspace */}
        {isLoading && !cycle ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <div className="grid gap-4 md:grid-cols-3">
              <Skeleton className="h-44 w-full" />
              <Skeleton className="h-44 w-full" />
              <Skeleton className="h-44 w-full" />
            </div>
          </div>
        ) : cycle ? (
          <>
            {/* Phase spine */}
            <Card>
              <CardContent className="space-y-5 py-5">
                <div className="space-y-2">
                  <SectionEyebrow>Cycle workspace</SectionEyebrow>
                  <h2 className="text-xl font-semibold tracking-tight">
                    {cycle.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <CyclePhaseBadge phase={cycle.phase} />
                    <MetaChip icon={CalendarDays}>
                      {formatDate(cycle.start_date)} – {formatDate(cycle.end_date)}
                    </MetaChip>
                    <MetaChip icon={UserCircle2}>
                      Lead · {cycle.lead_auditor_id.slice(0, 8)}
                    </MetaChip>
                  </div>
                </div>

                <PhaseStepper phase={cycle.phase} />

                <div className="flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100">
                  <Info className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    {isSealed ? (
                      <p>
                        <strong>You are at step {step?.num} — {step?.label}.</strong>{' '}
                        This cycle is sealed and archived. Its attestations and
                        findings are now an immutable record.
                      </p>
                    ) : (
                      <p>
                        <strong>You are at step {step?.num} — {step?.label}.</strong>{' '}
                        {nextTransition ? (
                          <>
                            Next: <strong>{nextTransition.label}</strong>.{' '}
                            {nextTransition.description} The cycle can be sealed once
                            every parameter is signed.
                          </>
                        ) : (
                          'Work each parameter, log findings where the standard isn’t met, then move to review.'
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Workspace cards */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {/* Parameter sheet */}
              <WorkspaceCard
                href={`/audit/cycles/${id}/parameters`}
                icon={Layers}
                iconClass="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                title="Parameter sheet"
                blurb={
                  totalParameters > 0
                    ? `${totalParameters} parameters${cycle.parameter_catalog_snapshot ? ' (frozen snapshot)' : ''}. Work them lane by lane.`
                    : 'Parameters are captured when the cycle starts.'
                }
              >
                <CoverageMeter t={t} />
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {clearedCount}
                  </span>{' '}
                  cleared ·{' '}
                  <span className="font-medium text-foreground">
                    {findingParams}
                  </span>{' '}
                  finding{findingParams === 1 ? '' : 's'} ·{' '}
                  <span className="font-medium text-foreground">{toGo}</span> to go
                </p>
              </WorkspaceCard>

              {/* Findings */}
              <WorkspaceCard
                href={`/audit/cycles/${id}/findings`}
                icon={AlertTriangle}
                iconClass="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                title="Findings"
                blurb={
                  openFindings > 0
                    ? 'Each finding is a ticket: a parameter, what fell short, an owner and an SLA.'
                    : 'No open findings. Log one where a parameter’s evidence falls short.'
                }
              >
                {openFindings > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {highOpen > 0 && (
                      <StatusPill status="p1" label={`${highOpen} high`} />
                    )}
                    {mediumOpen > 0 && (
                      <StatusPill status="p2" label={`${mediumOpen} medium`} />
                    )}
                    {highOpen === 0 && mediumOpen === 0 && (
                      <StatusPill
                        status="observation"
                        label={`${openFindings} open`}
                      />
                    )}
                  </div>
                ) : (
                  <StatusPill status="cleared" label="All clear" />
                )}
              </WorkspaceCard>

              {/* Attestations */}
              <WorkspaceCard
                href={`/audit/cycles/${id}/attestations`}
                icon={Signature}
                iconClass="bg-muted text-muted-foreground"
                title="Attestations"
                blurb="Sign each parameter as compliant, partial or non-compliant."
              >
                <CoverageMeter
                  t={{
                    cleared: signedCount,
                    p1: 0,
                    p2: 0,
                    observation: 0,
                    todo: Math.max(0, totalParameters - signedCount),
                  }}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{signedCount}</span>{' '}
                  of {totalParameters} signed
                  {rollup && rollup.total > 0 && (
                    <>
                      {' · '}
                      {rollup.compliant} compliant · {rollup.partial} partial ·{' '}
                      {rollup.non_compliant} non-compliant
                    </>
                  )}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {isSealed
                    ? 'Sealed and archived.'
                    : `Sealing unlocks at ${totalParameters} / ${totalParameters}.`}
                </p>
              </WorkspaceCard>

              {/* Report card — gate ③ */}
              <WorkspaceCard
                href={`/audit/cycles/${id}/report-card`}
                icon={ClipboardCheck}
                iconClass="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                title="Report card"
                blurb="How each parameter scored this cycle, and how the gap moved since last time."
              >
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Verdicts, deltas &amp; recurrence
                  </span>{' '}
                  — the audit measuring itself.
                </p>
              </WorkspaceCard>

              {/* Adapt — gate ④ */}
              <WorkspaceCard
                href={`/audit/cycles/${id}/adapt`}
                icon={Sparkles}
                iconClass="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                title="Adapt"
                blurb="What the audit learned this cycle — escalate what keeps failing, automate what you find by hand."
              >
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Recommendations &amp; apply
                  </span>{' '}
                  — the audit sharpening itself.
                </p>
              </WorkspaceCard>
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Cycle not found.
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}

// ---------------------------------------------------------------------------
// Local presentational pieces
// ---------------------------------------------------------------------------

function MetaChip({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
      <Icon className="h-3 w-3" />
      {children}
    </span>
  );
}

function WorkspaceCard({
  href,
  icon: Icon,
  iconClass,
  title,
  blurb,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl border bg-card p-5 transition hover:border-emerald-300 hover:shadow-sm dark:hover:border-emerald-800"
    >
      <div className="mb-3 flex items-start justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconClass}`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1.5 mb-4 text-[13px] leading-snug text-muted-foreground">
        {blurb}
      </p>
      <div className="mt-auto">{children}</div>
    </Link>
  );
}
