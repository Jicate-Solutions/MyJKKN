// app/(routes)/audit/cycles/[id]/page.tsx
// Cycle detail: header, phase controls, KPI strip, quick links to sub-pages.
// Sub-pages (findings, parameters, attestations) owned by Agent 3 / Agent 4.

'use client';

import { useMemo, useState } from 'react';
import { use } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
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
  Inbox,
  RefreshCw,
  FileText,
  Layers,
  Signature,
} from 'lucide-react';
import {
  useAuditCycle,
  useTransitionCyclePhase,
  useDeleteDraftCycle,
  useAttestationRollup,
  useFindingsByCycle,
  useSystemParameters,
} from '@/hooks/audit';
import { AuditHeader } from '../../_components/audit-header';
import { CycleProgressStats } from '../../_components/cycle-progress-stats';
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

export default function AuditCycleDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<
    'overview' | 'findings' | 'parameters' | 'attestations'
  >('overview');

  const {
    data: cycle,
    isLoading,
    error,
    refetch,
  } = useAuditCycle(id);

  const { data: rollup } = useAttestationRollup(id);
  const { data: findings, isLoading: findingsLoading } = useFindingsByCycle(id);
  const { data: systemParams } = useSystemParameters();

  const transition = useTransitionCyclePhase();
  const deleteDraft = useDeleteDraftCycle();

  const nextTransition = useMemo(() => {
    if (!cycle) return null;
    return PHASE_FLOW.find((step) => step.from === cycle.phase) ?? null;
  }, [cycle]);

  const findingsOpen = useMemo(
    () => (findings ?? []).filter((f) => f.status !== 'closed').length,
    [findings],
  );
  const findingsClosed = useMemo(
    () => (findings ?? []).filter((f) => f.status === 'closed').length,
    [findings],
  );

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

  const totalParameters = cycle?.parameter_catalog_snapshot
    ? ((cycle.parameter_catalog_snapshot as { parameters?: unknown[] }).parameters
        ?.length ?? systemParams?.length ?? 0)
    : systemParams?.length ?? 0;

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

        {/* KPI strip */}
        <CycleProgressStats
          totalParameters={totalParameters}
          compliant={rollup?.compliant ?? 0}
          partial={rollup?.partial ?? 0}
          nonCompliant={rollup?.non_compliant ?? 0}
          findingsOpen={findingsOpen}
          findingsClosed={findingsClosed}
          isLoading={isLoading || findingsLoading}
        />

        {/* Tabs / sub-page nav. Overview renders inline; other tabs deep-link to sub-pages. */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cycle workspace</CardTitle>
            <p className="text-xs text-muted-foreground">
              Drill into findings, parameter sheets, and attestations for this
              cycle.
            </p>
          </CardHeader>
          <CardContent>
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as typeof activeTab)}
            >
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="findings">Findings</TabsTrigger>
                <TabsTrigger value="parameters">Parameters</TabsTrigger>
                <TabsTrigger value="attestations">Attestations</TabsTrigger>
              </TabsList>
            </Tabs>

            {activeTab === 'overview' && (
              <OverviewTab
                cycle={cycle}
                isLoading={isLoading}
                nextTransition={nextTransition}
              />
            )}
            {activeTab === 'findings' && (
              <div className="pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {findingsOpen} open · {findingsClosed} closed
                </p>
                <Link href={`/audit/cycles/${id}/findings`}>
                  <Button size="sm" variant="outline">
                    <FileText className="mr-2 h-4 w-4" />
                    Open findings workspace
                  </Button>
                </Link>
              </div>
            )}
            {activeTab === 'parameters' && (
              <div className="pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {totalParameters} parameters
                  {cycle?.parameter_catalog_snapshot ? ' (frozen snapshot)' : ''}
                </p>
                <Link href={`/audit/cycles/${id}/parameters`}>
                  <Button size="sm" variant="outline">
                    <Layers className="mr-2 h-4 w-4" />
                    Open parameters workspace
                  </Button>
                </Link>
              </div>
            )}
            {activeTab === 'attestations' && (
              <div className="pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {rollup?.total ?? 0} attestations ·{' '}
                  {rollup?.compliant ?? 0} compliant ·{' '}
                  {rollup?.partial ?? 0} partial ·{' '}
                  {rollup?.non_compliant ?? 0} non-compliant
                </p>
                <Link href={`/audit/cycles/${id}/attestations`}>
                  <Button size="sm" variant="outline">
                    <Signature className="mr-2 h-4 w-4" />
                    Open attestations workspace
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

function OverviewTab({
  cycle,
  isLoading,
  nextTransition,
}: {
  cycle: ReturnType<typeof useAuditCycle>['data'];
  isLoading: boolean;
  nextTransition: (typeof PHASE_FLOW)[number] | null;
}) {
  if (isLoading) {
    return (
      <div className="pt-4 space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (!cycle) {
    return (
      <div className="pt-4 flex flex-col items-center py-8 text-center text-xs text-muted-foreground">
        <Inbox className="h-6 w-6 mb-2" />
        <p>Cycle not found.</p>
      </div>
    );
  }

  return (
    <div className="pt-4 space-y-4">
      <div className="rounded-md border bg-muted/40 p-4 text-sm space-y-2">
        <div className="flex items-start gap-3">
          <ClipboardCheck className="h-5 w-5 text-primary flex-shrink-0" />
          <div>
            <p className="font-medium">
              Current phase:{' '}
              <span className="font-semibold">{cycle.phase}</span>
            </p>
            {nextTransition ? (
              <p className="text-xs text-muted-foreground mt-1">
                <strong>Next: {nextTransition.label}.</strong>{' '}
                {nextTransition.description}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                This cycle is in its terminal phase ({cycle.phase}). No further
                transitions are available.
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border p-3 text-sm">
          <div className="text-xs text-muted-foreground">Cosigner roles</div>
          <div className="font-medium mt-1">
            {cycle.cosigner_roles.length > 0
              ? cycle.cosigner_roles.join(' · ').toUpperCase()
              : '—'}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            NAAC/NBA-mapped attestations require all listed roles to co-sign.
          </p>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <div className="text-xs text-muted-foreground">Institution scope</div>
          <div className="font-medium mt-1">
            {cycle.institution_ids === null || cycle.institution_ids.length === 0
              ? 'All institutions (lead auditor scope)'
              : `${cycle.institution_ids.length} institution(s)`}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Discovery queries and attestations are scoped to these institutions.
          </p>
        </div>
      </div>
    </div>
  );
}
