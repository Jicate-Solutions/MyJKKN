'use client';

// app/(routes)/audit/cycles/[id]/adapt/page.tsx
// Gate ④ — ADAPT. The audit sharpening itself. Reads audit_parameter_results
// history + findings (via fn_audit_compute_adaptations) and recommends how the
// audit should change next cycle:
//   • escalate a gap that keeps recurring (bump owner + shorten SLA),
//   • automate a check found by hand (add a discovery query),
//   • ease off a parameter that's stayed clean (sample less often),
//   • tune a noisy vs. high-signal check (from dismissed-vs-actioned rate).
// Recommend-only: applying (which can change a parameter's rigor) is gated on
// audit.parameter.manage. A "Recompute" button re-derives recommendations
// idempotently without disturbing anything a human already applied/dismissed.

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft,
  RotateCw,
  Inbox,
  Check,
  X,
  ArrowRight,
  ShieldAlert,
  Wand2,
  Gauge,
  TrendingUp,
} from 'lucide-react';
import { useAuditCycle } from '@/hooks/audit/use-audit-cycles';
import {
  useAdaptations,
  useComputeAdaptations,
  useApplyAdaptation,
  useDismissAdaptation,
} from '@/hooks/audit/use-audit-adaptations';
import { usePermissions } from '@/hooks/use-permissions';
import { SectionEyebrow } from '../../../_components/redesign/kit';
import { cn, getErrorMessage } from '@/lib/utils';
import type { AuditAdaptation, AuditAdaptationRule } from '@/lib/types/audit';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Rule presentation — chip colour + icon + short label. Escalate is the loudest
// (a gap that isn't closing); automate/ease-off/tune are cooler.
const RULE_META: Record<
  AuditAdaptationRule,
  { label: string; chip: string; icon: React.ComponentType<{ className?: string }> }
> = {
  escalate_recurring: {
    label: 'Escalate',
    chip: 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
    icon: ShieldAlert,
  },
  add_discovery: {
    label: 'Automate',
    chip: 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300',
    icon: Wand2,
  },
  reduce_frequency: {
    label: 'Ease off',
    chip: 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    icon: Gauge,
  },
  tune_threshold: {
    label: 'Tune',
    chip: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
    icon: TrendingUp,
  },
};

const SEVERITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
};

// Human-readable summary of the concrete change an "Apply" would make.
function actionPreview(a: AuditAdaptation): string | null {
  const s = a.suggested_action ?? {};
  switch (s.kind) {
    case 'escalate':
      return `Owner ${s.prev_owner_role ?? '—'} → ${s.new_owner_role ?? '—'} · SLA ${s.prev_p1_sla}/${s.prev_p2_sla} → ${s.new_p1_sla}/${s.new_p2_sla} days`;
    case 'reduce_frequency':
      return `Check every ${s.prev_frequency} → every ${s.new_frequency} cycles`;
    case 'add_discovery':
      return `${s.finding_count ?? 0} hand-logged finding(s) · no automatic check yet`;
    case 'tune_threshold':
      return `${s.dismissed ?? 0}/${s.total ?? 0} dismissed (${Math.round(Number(s.dismiss_rate ?? 0) * 100)}%)`;
    default:
      return null;
  }
}

// escalate/reduce actually change the catalog → "Apply". The advisory rules just
// get acknowledged.
function applyLabel(rule: AuditAdaptationRule): string {
  return rule === 'escalate_recurring' || rule === 'reduce_frequency'
    ? 'Apply'
    : 'Acknowledge';
}

export default function AdaptPage({ params }: PageProps) {
  const { id } = use(params);
  const { can } = usePermissions();
  const canManage = can('audit.parameter.manage');

  const { data: cycle } = useAuditCycle(id);
  const { data: adaptations, isLoading } = useAdaptations(id);
  const compute = useComputeAdaptations();
  const applyMut = useApplyAdaptation(id);
  const dismissMut = useDismissAdaptation(id);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = adaptations ?? [];
  const openCount = useMemo(() => rows.filter((r) => r.status === 'proposed').length, [rows]);

  const handleRecompute = async () => {
    try {
      const n = await compute.mutateAsync(id);
      toast.success(`Recomputed — ${n} recommendation${n === 1 ? '' : 's'}.`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const handleApply = async (a: AuditAdaptation) => {
    setBusyId(a.id);
    try {
      await applyMut.mutateAsync({ id: a.id });
      toast.success(
        a.rule === 'escalate_recurring' || a.rule === 'reduce_frequency'
          ? 'Applied — the parameter has been updated.'
          : 'Acknowledged.'
      );
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (a: AuditAdaptation) => {
    setBusyId(a.id);
    try {
      await dismissMut.mutateAsync({ id: a.id });
      toast.success('Dismissed.');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PermissionGuard module="audit" action="parameter.view">
      <ContentLayout title="Adapt">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Audit', href: '/audit' },
            { label: 'Cycles', href: '/audit/cycles' },
            { label: cycle?.name ?? 'Detail', href: `/audit/cycles/${id}` },
            { label: 'Adapt', href: `/audit/cycles/${id}/adapt` },
          ]}
        />

        <div className="space-y-6">
          {/* Header */}
          <div>
            <Link
              href={`/audit/cycles/${id}`}
              className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back to cycle
            </Link>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <SectionEyebrow>Adapt · {cycle?.name ?? '…'}</SectionEyebrow>
                <h1 className="text-2xl font-semibold tracking-tight">
                  How the audit is adapting
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Each cycle the audit reads its own history and recommends how to get
                  sharper — escalate what keeps failing, automate what you find by hand,
                  ease off what has stayed clean, and tune the noisy checks. This is Gate ④.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleRecompute}
                disabled={compute.isPending}
                className="shrink-0"
              >
                <RotateCw className={cn('mr-2 h-4 w-4', compute.isPending && 'animate-spin')} />
                Recompute
              </Button>
            </div>
          </div>

          {/* Summary */}
          {!isLoading && rows.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{rows.length}</span> recommendation
              {rows.length === 1 ? '' : 's'} · {' '}
              <span className="font-medium text-foreground">{openCount}</span> to act on
            </p>
          )}

          {/* List */}
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Inbox className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">No recommendations yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The audit is content with how it is checking. Run Recompute after closing
                    findings or finishing a cycle to re-scan the history.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {rows.map((a) => {
                const meta = RULE_META[a.rule];
                const Icon = meta.icon;
                const preview = actionPreview(a);
                const resolved = a.status !== 'proposed';
                const busy = busyId === a.id;
                return (
                  <Card
                    key={a.id}
                    className={cn(resolved && 'opacity-70')}
                  >
                    <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                              meta.chip
                            )}
                          >
                            <Icon className="h-3 w-3" /> {meta.label}
                          </span>
                          <span
                            className={cn('h-1.5 w-1.5 rounded-full', SEVERITY_DOT[a.severity])}
                            title={`${a.severity} priority`}
                          />
                          <span className="font-mono text-xs text-muted-foreground">
                            {a.parameter_code}
                          </span>
                        </div>
                        <p className="text-sm font-semibold">{a.title}</p>
                        <p className="text-[13px] leading-snug text-muted-foreground">{a.detail}</p>
                        {preview && (
                          <p className="text-[12px] text-muted-foreground/90">
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{preview}</span>
                          </p>
                        )}
                        {resolved && (
                          <p className="text-[12px] text-muted-foreground">
                            {a.status === 'applied' ? '✓ Applied' : 'Dismissed'}
                            {a.resolved_at
                              ? ` · ${new Date(a.resolved_at).toLocaleDateString()}`
                              : ''}
                            {a.resolution_note ? ` — ${a.resolution_note}` : ''}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      {!resolved && (
                        <div className="flex shrink-0 items-center gap-2">
                          {a.rule === 'add_discovery' && (
                            <Link
                              href="/audit/parameters"
                              className="inline-flex items-center gap-1 text-[13px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                            >
                              Open catalog <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          )}
                          {canManage ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleApply(a)}
                                disabled={busy}
                              >
                                <Check className="mr-1 h-3.5 w-3.5" />
                                {applyLabel(a.rule)}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDismiss(a)}
                                disabled={busy}
                              >
                                <X className="mr-1 h-3.5 w-3.5" />
                                Dismiss
                              </Button>
                            </>
                          ) : (
                            <span className="text-[12px] text-muted-foreground">View only</span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
