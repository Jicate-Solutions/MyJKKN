'use client';

// ============================================================================
// Lead Stages Data Table — Director-facing policy view.
// Created: 2026-05-07. Plain-English UX (Director bar: PR #748).
//
// Shows every funnel stage that has a policy row, with:
//   - Stage name (plain English)
//   - Applies to (global or college name)
//   - Terminal? (toggle switch with live consequence preview)
//   - Leads currently in this stage (live count from /api/admin/lead-stages-policy/counts)
//   - Last updated
//
// Stages are grouped: global policies first, then college-specific overrides.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import {
  LeadStagePolicyService,
  type LeadActiveStagePolicy,
  type StageLeadCount,
} from '@/lib/services/admission/lead-stage-policy-service';

import { ConsequencesCascade } from './consequences-cascade';
import { LeadStagesFormDialog } from './lead-stages-form-dialog';

export function LeadStagesDataTable() {
  const [policies, setPolicies] = useState<LeadActiveStagePolicy[] | null>(null);
  const [stageCounts, setStageCounts] = useState<StageLeadCount[]>([]);
  const [countsLoading, setCountsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<LeadActiveStagePolicy | null>(null);
  const [deletingPolicy, setDeletingPolicy] = useState<LeadActiveStagePolicy | null>(null);

  // Track which row is pending a toggle (before confirmation via form dialog)
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null);
  const [pendingToggleValue, setPendingToggleValue] = useState<boolean>(false);

  const { institutions } = useInstitutionsWithAccess();

  const institutionNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const inst of institutions) map[inst.id] = inst.name;
    return map;
  }, [institutions]);

  // Load policies from API
  const loadPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await LeadStagePolicyService.getStagePolicies();
      setPolicies(rows);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Couldn't reach the policy server. Try refreshing.";
      toast.error(msg);
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load live lead counts from Agent C's endpoint
  // Gracefully shows "—" if endpoint isn't ready yet
  const loadCounts = useCallback(async () => {
    setCountsLoading(true);
    try {
      const res = await fetch('/api/admin/lead-stages-policy/counts');
      if (!res.ok) throw new Error('counts endpoint not ready');
      const data: StageLeadCount[] = await res.json();
      setStageCounts(data);
    } catch {
      // Graceful degradation — endpoint may not be ready (Agent C parallel work)
      setStageCounts([]);
    } finally {
      setCountsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPolicies();
    loadCounts();
  }, [loadPolicies, loadCounts]);

  // Groups: global first, then institution-specific
  const globalPolicies = useMemo(
    () => policies?.filter((p) => p.scope_type === 'global') ?? [],
    [policies],
  );
  const institutionPolicies = useMemo(
    () => policies?.filter((p) => p.scope_type === 'institution') ?? [],
    [policies],
  );

  // Per-institution groups for the override section
  const byInstitution = useMemo(() => {
    const map: Record<string, LeadActiveStagePolicy[]> = {};
    for (const p of institutionPolicies) {
      const key = p.institution_id ?? '__unknown';
      if (!map[key]) map[key] = [];
      map[key].push(p);
    }
    return map;
  }, [institutionPolicies]);

  // Toggle handlers — open form dialog for consequence preview before saving
  const handleToggleClick = (policy: LeadActiveStagePolicy, next: boolean) => {
    setPendingToggleId(policy.id);
    setPendingToggleValue(next);
    setEditingPolicy(policy);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingPolicy) return;
    try {
      await LeadStagePolicyService.deleteStagePolicy(deletingPolicy.id);
      toast.success('Stage policy removed.');
      setDeletingPolicy(null);
      await loadPolicies();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Couldn't remove this policy.";
      toast.error(msg);
    }
  };

  const handleFormSaved = async () => {
    setFormOpen(false);
    setEditingPolicy(null);
    setPendingToggleId(null);
    await Promise.all([loadPolicies(), loadCounts()]);
  };

  const handleRefresh = () => {
    loadPolicies();
    loadCounts();
  };

  const countForStage = (stage: string): number =>
    stageCounts.find((c) => c.funnel_stage === stage)?.count ?? 0;

  return (
    <div className="space-y-6">
      {/* Plain-English explainer */}
      <div className="rounded-lg border border-border bg-muted/30 p-5">
        <h3 className="mb-2 text-sm font-semibold">How this works</h3>
        <p className="text-sm text-muted-foreground">
          Each row is a stage in your admission funnel. Mark a stage as{' '}
          <strong>terminal</strong> if leads in it should{' '}
          <strong>not</strong> count against a counselor&apos;s active-leads
          cap. For example, marking &ldquo;Lost&rdquo; as terminal (the
          default) means counselors free up capacity once a lead is marked
          lost — they can take on new leads sooner.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Stages not marked as terminal are counted as active. A counselor
          who has 20 active leads at their cap will receive no new leads
          until one of those leads moves to a terminal stage.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Stage Policies</h2>
          <p className="text-xs text-muted-foreground">
            {policies !== null
              ? `${policies.length} stage${policies.length === 1 ? '' : 's'} configured`
              : '—'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingPolicy(null);
              setPendingToggleId(null);
              setFormOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Stage
          </Button>
        </div>
      </div>

      {loading || policies === null ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : policies.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm font-medium">No stage policies configured yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click <strong>Add Stage</strong> to define which funnel stages
            count toward counselor workload.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Global policies */}
          {globalPolicies.length > 0 && (
            <PolicyTable
              title="Default rules — applies to all colleges"
              policies={globalPolicies}
              institutionNameById={institutionNameById}
              stageCounts={stageCounts}
              countsLoading={countsLoading}
              pendingToggleId={pendingToggleId}
              pendingToggleValue={pendingToggleValue}
              onToggle={handleToggleClick}
              onEdit={(p) => {
                setEditingPolicy(p);
                setPendingToggleId(null);
                setFormOpen(true);
              }}
              onDelete={(p) => setDeletingPolicy(p)}
              countForStage={countForStage}
            />
          )}

          {/* Institution-specific overrides */}
          {Object.entries(byInstitution).map(([instId, rows]) => (
            <PolicyTable
              key={instId}
              title={`Override — just for ${institutionNameById[instId] ?? 'one college'}`}
              policies={rows}
              institutionNameById={institutionNameById}
              stageCounts={stageCounts}
              countsLoading={countsLoading}
              pendingToggleId={pendingToggleId}
              pendingToggleValue={pendingToggleValue}
              onToggle={handleToggleClick}
              onEdit={(p) => {
                setEditingPolicy(p);
                setPendingToggleId(null);
                setFormOpen(true);
              }}
              onDelete={(p) => setDeletingPolicy(p)}
              countForStage={countForStage}
            />
          ))}
        </div>
      )}

      <LeadStagesFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) {
            setEditingPolicy(null);
            setPendingToggleId(null);
          }
        }}
        policy={editingPolicy}
        institutions={institutions}
        stageCounts={stageCounts}
        countsLoading={countsLoading}
        onSaved={handleFormSaved}
      />

      <AlertDialog
        open={!!deletingPolicy}
        onOpenChange={(open) => {
          if (!open) setDeletingPolicy(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this stage policy?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingPolicy && (
                <>
                  This will remove the policy for{' '}
                  <strong>
                    {LeadStagePolicyService.formatStage(deletingPolicy.funnel_stage)}
                  </strong>
                  {deletingPolicy.scope_type === 'institution'
                    ? ` for ${institutionNameById[deletingPolicy.institution_id ?? ''] ?? 'this college'}`
                    : ' (default rule)'}
                  . Leads in this stage will revert to being counted as active
                  unless another rule covers it.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PolicyTable — grouped table for one section (global or institution)
// ---------------------------------------------------------------------------
interface PolicyTableProps {
  title: string;
  policies: LeadActiveStagePolicy[];
  institutionNameById: Record<string, string>;
  stageCounts: StageLeadCount[];
  countsLoading: boolean;
  pendingToggleId: string | null;
  pendingToggleValue: boolean;
  onToggle: (policy: LeadActiveStagePolicy, next: boolean) => void;
  onEdit: (policy: LeadActiveStagePolicy) => void;
  onDelete: (policy: LeadActiveStagePolicy) => void;
  countForStage: (stage: string) => number;
}

function PolicyTable({
  title,
  policies,
  institutionNameById,
  countsLoading,
  pendingToggleId,
  pendingToggleValue,
  onToggle,
  onEdit,
  onDelete,
  countForStage,
}: PolicyTableProps) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{title}</h3>

      {/* Consequences cascade — shown inline when a row is pending toggle */}
      {pendingToggleId && (
        <div className="mb-3">
          {policies
            .filter((p) => p.id === pendingToggleId)
            .map((p) => (
              <ConsequencesCascade
                key={p.id}
                stageName={p.funnel_stage}
                currentIsTerminal={p.is_terminal}
                pendingIsTerminal={pendingToggleValue}
                leadsInStage={countForStage(p.funnel_stage)}
                countsLoading={countsLoading}
              />
            ))}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stage</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead className="text-center">Counts as terminal?</TableHead>
              <TableHead className="text-right">Leads right now</TableHead>
              <TableHead>Last updated</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {policies.map((policy) => {
              const stageLabel = LeadStagePolicyService.formatStage(policy.funnel_stage);
              const scopeLabel = LeadStagePolicyService.formatScope(
                policy.scope_type,
                policy.institution_id
                  ? institutionNameById[policy.institution_id]
                  : null,
              );
              const liveCount = countForStage(policy.funnel_stage);

              return (
                <TableRow key={policy.id}>
                  <TableCell className="font-medium">{stageLabel}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {scopeLabel}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`terminal-${policy.id}`}
                          checked={
                            policy.id === pendingToggleId
                              ? pendingToggleValue
                              : policy.is_terminal
                          }
                          onCheckedChange={(next) => onToggle(policy, next)}
                          aria-label={`Mark ${stageLabel} as terminal`}
                        />
                        <label
                          htmlFor={`terminal-${policy.id}`}
                          className="cursor-pointer text-xs text-muted-foreground"
                        >
                          {policy.is_terminal ? 'Yes' : 'No'}
                        </label>
                      </div>
                      <Badge
                        variant={policy.is_terminal ? 'secondary' : 'outline'}
                        className="text-[10px]"
                      >
                        {LeadStagePolicyService.terminalBadgeLabel(policy.is_terminal)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {countsLoading ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={liveCount > 0 ? 'font-medium' : 'text-muted-foreground'}>
                        {liveCount.toLocaleString()}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {policy.updated_at
                      ? format(parseISO(policy.updated_at), 'd MMM yyyy')
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onEdit(policy)}
                        aria-label={`Edit ${stageLabel} policy`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDelete(policy)}
                        aria-label={`Remove ${stageLabel} policy`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
