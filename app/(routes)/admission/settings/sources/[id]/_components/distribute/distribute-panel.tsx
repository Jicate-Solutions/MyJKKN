'use client';

import { useReducer, useMemo, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, Send } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { usePermissions } from '@/hooks/use-permissions';
import {
  useUnassignedLeads,
  useAllUnassignedLeadIdsLazy,
  type UnassignedLeadFilters,
} from '@/hooks/admission/use-unassigned-leads';
import { useBulkAssign } from '@/hooks/admission/use-bulk-assign';
import { useSourceCounselorsWithLoad } from '@/hooks/admission/use-source-counselors-with-load';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import type { BulkAssignReport, PerLeadResult } from '@/lib/services/admission/bulk-assign-service';
import type { LeadSourceEnum } from '@/lib/services/admission/source-master-service';

import { DistributeModeTabs, type DistributeMode } from './distribute-mode-tabs';
import { UnassignedLeadFilters as FiltersUI } from './unassigned-lead-filters';
import { UnassignedLeadList } from './unassigned-lead-list';
import { CounselorTargetPicker } from './counselor-target-picker';
import { OverrideToggle } from './override-toggle';
import { DistributeDryRun } from './distribute-dry-run';
import { InstitutionSummary, useInstitutionSummary } from './institution-summary';

interface DistributePanelProps {
  sourceId: string;
  sourceEnum: LeadSourceEnum;
  institutionId?: string | null;
}

type Phase = 'ready' | 'previewing' | 'preview-ready' | 'mutating' | 'partial';

interface State {
  expanded: boolean;
  mode: DistributeMode;
  filters: UnassignedLeadFilters;
  selectedIds: Set<string>;
  /**
   * lead_id -> institution_id for every selected lead. Populated as the user
   * toggles individual leads (we always know institution_id at toggle time
   * from either the visible list or the lazy-fetched ID list). Used to
   * compute the institution-matching summary without round-tripping the DB.
   */
  selectedLeadInstitutions: Map<string, string | null>;
  pickerIds: string[];
  /** Hide counselors whose institution_id isn't in the lead-selection set. */
  restrictPickerToLeadInstitutions: boolean;
  override: boolean;
  reason: string;
  /** Round-robin only: cap each selected counselor at N leads per run. */
  perCounselorLimit: string;
  phase: Phase;
  preview: BulkAssignReport | null;
  errors: PerLeadResult[] | null;
}

const initial: State = {
  expanded: false,
  mode: 'bulk-one',
  filters: {},
  selectedIds: new Set<string>(),
  selectedLeadInstitutions: new Map<string, string | null>(),
  pickerIds: [],
  restrictPickerToLeadInstitutions: true,
  override: false,
  reason: '',
  perCounselorLimit: '',
  phase: 'ready',
  preview: null,
  errors: null,
};

type Action =
  | { type: 'TOGGLE_EXPAND' }
  | { type: 'SET_MODE'; mode: DistributeMode }
  | { type: 'SET_FILTERS'; filters: UnassignedLeadFilters }
  | {
      type: 'TOGGLE_LEAD';
      id: string;
      institutionId: string | null;
    }
  | {
      type: 'TOGGLE_ALL_VISIBLE';
      visible: Array<{ id: string; institution_id: string | null }>;
    }
  | {
      type: 'SELECT_ALL_MATCHING';
      rows: Array<{ id: string; institution_id: string | null }>;
    }
  | { type: 'CLEAR_LEAD_SELECTION' }
  | { type: 'SET_PICKER'; ids: string[] }
  | { type: 'TOGGLE_INST_RESTRICTION'; value: boolean }
  | { type: 'SET_OVERRIDE'; value: boolean }
  | { type: 'SET_REASON'; value: string }
  | { type: 'SET_PER_COUNSELOR_LIMIT'; value: string }
  | { type: 'SET_PHASE'; phase: Phase }
  | { type: 'SET_PREVIEW'; preview: BulkAssignReport | null }
  | { type: 'SET_ERRORS'; errors: PerLeadResult[] | null }
  | { type: 'RESET_AFTER_COMMIT' };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'TOGGLE_EXPAND':
      return { ...s, expanded: !s.expanded };
    case 'SET_MODE':
      return { ...s, mode: a.mode, phase: 'ready', preview: null };
    case 'SET_FILTERS':
      return { ...s, filters: a.filters };
    case 'TOGGLE_LEAD': {
      const next = new Set(s.selectedIds);
      const nextInst = new Map(s.selectedLeadInstitutions);
      if (next.has(a.id)) {
        next.delete(a.id);
        nextInst.delete(a.id);
      } else {
        next.add(a.id);
        nextInst.set(a.id, a.institutionId);
      }
      return { ...s, selectedIds: next, selectedLeadInstitutions: nextInst };
    }
    case 'TOGGLE_ALL_VISIBLE': {
      const next = new Set(s.selectedIds);
      const nextInst = new Map(s.selectedLeadInstitutions);
      const allOn = a.visible.every((row) => next.has(row.id));
      if (allOn) {
        a.visible.forEach((row) => {
          next.delete(row.id);
          nextInst.delete(row.id);
        });
      } else {
        a.visible.forEach((row) => {
          next.add(row.id);
          nextInst.set(row.id, row.institution_id);
        });
      }
      return { ...s, selectedIds: next, selectedLeadInstitutions: nextInst };
    }
    case 'SELECT_ALL_MATCHING': {
      const next = new Set<string>();
      const nextInst = new Map<string, string | null>();
      for (const row of a.rows) {
        next.add(row.id);
        nextInst.set(row.id, row.institution_id);
      }
      return { ...s, selectedIds: next, selectedLeadInstitutions: nextInst };
    }
    case 'CLEAR_LEAD_SELECTION':
      return {
        ...s,
        selectedIds: new Set<string>(),
        selectedLeadInstitutions: new Map<string, string | null>(),
      };
    case 'SET_PICKER':
      return { ...s, pickerIds: a.ids };
    case 'TOGGLE_INST_RESTRICTION':
      return { ...s, restrictPickerToLeadInstitutions: a.value };
    case 'SET_OVERRIDE':
      return { ...s, override: a.value };
    case 'SET_REASON':
      return { ...s, reason: a.value };
    case 'SET_PER_COUNSELOR_LIMIT':
      return { ...s, perCounselorLimit: a.value };
    case 'SET_PHASE':
      return { ...s, phase: a.phase };
    case 'SET_PREVIEW':
      return { ...s, preview: a.preview, phase: a.preview ? 'preview-ready' : 'ready' };
    case 'SET_ERRORS':
      return { ...s, errors: a.errors, phase: a.errors ? 'partial' : 'ready' };
    case 'RESET_AFTER_COMMIT':
      return { ...initial, expanded: s.expanded };
  }
}

export function DistributePanel({ sourceId, sourceEnum, institutionId }: DistributePanelProps) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const canDistribute = isSuperAdmin || canAccess('admission.settings.sources', 'manage');
  const canOverride = isSuperAdmin || canAccess('admission.counselors.team', 'bulk_override');

  const [s, dispatch] = useReducer(reducer, initial);

  // Eager fetch (gated only by permission, not by expand) so the panel header
  // can show the live unassigned count even before the user clicks to expand.
  // Previously this was `enabled: s.expanded`, which caused a chicken-and-egg
  // bug: the panel hid itself based on totalCount=0, and totalCount stayed 0
  // because the query never fired until expand — but expand had no CTA to
  // click because the panel was hidden. Result: panel invisible forever.
  const { data: leadsData, isLoading: leadsLoading } = useUnassignedLeads({
    sourceEnum,
    institutionId,
    filters: s.filters,
    enabled: canDistribute,
  });

  const { data: counselors } = useSourceCounselorsWithLoad(sourceId, canDistribute);
  const counselorPool = useMemo(
    () => (counselors ?? []).filter((a) => s.override || !a.is_paused),
    [counselors, s.override]
  );

  // Institutions name map (for the summary card + picker chip).
  const { institutions } = useInstitutionsWithAccess();
  const institutionMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const inst of institutions ?? []) m.set(inst.id, inst.name);
    return m;
  }, [institutions]);

  // Institution IDs represented across the currently-selected leads. Drives
  // the counselor-picker auto-filter and the institution-summary card.
  const selectedLeadInstitutionIds = useMemo(() => {
    const set = new Set<string>();
    for (const inst of s.selectedLeadInstitutions.values()) {
      if (inst) set.add(inst);
    }
    return Array.from(set);
  }, [s.selectedLeadInstitutions]);

  // Selected counselor objects (full records, not just IDs) — needed by the
  // institution-summary so it can read counselor.institution_id.
  const selectedCounselors = useMemo(
    () => (counselors ?? []).filter((a) => s.pickerIds.includes(a.counselor_id)),
    [counselors, s.pickerIds],
  );

  // Default round-robin participant pool: all available counselors selected by default.
  // Done in useEffect rather than useMemo so the dispatch happens off the render path.
  useEffect(() => {
    if (s.mode === 'round-robin' && s.pickerIds.length === 0 && counselorPool.length > 0) {
      dispatch({ type: 'SET_PICKER', ids: counselorPool.map((a) => a.counselor_id) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.mode, counselorPool.length]);

  const { bulkOne, autoRoute, roundRobin } = useBulkAssign();
  const totalCount = leadsData?.totalCount ?? 0;
  const visibleLeads = leadsData?.leads ?? [];

  // Lazy fetch for "Select all N" — only fires when user clicks the button.
  const allIdsLazy = useAllUnassignedLeadIdsLazy();
  const [isSelectingAll, setIsSelectingAll] = useState(false);

  // Auto-batch progress: when the user commits with > MAX_RUN_SIZE leads, the
  // service chunks the run and calls onProgress after each batch resolves.
  // This lets us paint a "Processed X of Y" footer instead of leaving the
  // user staring at a frozen Confirming… button for 30+ seconds.
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  const handleSelectAllMatching = async () => {
    setIsSelectingAll(true);
    try {
      const rows = await allIdsLazy.mutateAsync({
        sourceEnum,
        institutionId,
        filters: s.filters,
      });
      dispatch({ type: 'SELECT_ALL_MATCHING', rows });
      toast.success(`Selected all ${rows.length.toLocaleString()} matching leads`);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to load all matching leads');
    } finally {
      setIsSelectingAll(false);
    }
  };

  // Institution-matching status (also surfaced as the commit gate).
  const summaryStatus = useInstitutionSummary({
    selectedLeadInstitutions: Array.from(s.selectedLeadInstitutions.entries()).map(
      ([leadId, institutionId]) => ({ leadId, institutionId }),
    ),
    selectedCounselors,
    allMappedCounselors: counselors ?? [],
    institutionMap,
  });

  // Institution-matched commit batches. The user's intent: a lead should
  // ONLY go to a counselor of its own institution. We split the selected
  // pool into per-institution buckets (leads + their matching counselors)
  // and a "no match" bucket for leads with no eligible counselor in this
  // run. Unmatched leads stay unassigned for manual handling.
  //
  // Returned shape:
  //   - bulkOneSplit  : matched/unmatched relative to the single picked
  //                     counselor's institution (used by Bulk-One mode)
  //   - rrBatches     : array of { institutionId, leadIds, counselorIds }
  //                     for Round-Robin — each batch will produce a
  //                     dedicated RPC call so cycling stays within the
  //                     institution
  //   - unmatchedIds  : combined list to be skipped (carries across modes)
  const commitPlan = useMemo(() => {
    const leadsByInst = new Map<string, string[]>();
    const leadsWithNoInst: string[] = [];
    for (const [leadId, instId] of s.selectedLeadInstitutions.entries()) {
      if (!instId) {
        leadsWithNoInst.push(leadId);
        continue;
      }
      const list = leadsByInst.get(instId);
      if (list) list.push(leadId);
      else leadsByInst.set(instId, [leadId]);
    }

    const counselorsByInst = new Map<string, string[]>();
    for (const c of selectedCounselors) {
      const inst = c.counselor?.institution_id;
      if (!inst) continue;
      const list = counselorsByInst.get(inst);
      if (list) list.push(c.counselor_id);
      else counselorsByInst.set(inst, [c.counselor_id]);
    }

    // Round-Robin / Auto-Route batches: only institutions with both leads
    // and at least one matching counselor.
    const rrBatches: Array<{
      institutionId: string;
      leadIds: string[];
      counselorIds: string[];
    }> = [];
    const unmatchedIds: string[] = [...leadsWithNoInst];
    for (const [inst, leadIds] of leadsByInst.entries()) {
      const counselorIds = counselorsByInst.get(inst);
      if (counselorIds && counselorIds.length > 0) {
        rrBatches.push({ institutionId: inst, leadIds, counselorIds });
      } else {
        unmatchedIds.push(...leadIds);
      }
    }

    // Bulk-One split: target counselor's institution dictates the match.
    const bulkOneTarget =
      s.mode === 'bulk-one' && s.pickerIds.length === 1
        ? (counselors ?? []).find((c) => c.counselor_id === s.pickerIds[0])
        : null;
    const bulkOneInst = bulkOneTarget?.counselor?.institution_id ?? null;
    let bulkOneMatched: string[] = [];
    let bulkOneUnmatched: string[] = [];
    if (s.mode === 'bulk-one' && bulkOneInst) {
      for (const [leadId, instId] of s.selectedLeadInstitutions.entries()) {
        if (instId === bulkOneInst) bulkOneMatched.push(leadId);
        else bulkOneUnmatched.push(leadId);
      }
    }

    const matchedTotal =
      s.mode === 'bulk-one'
        ? bulkOneMatched.length
        : rrBatches.reduce((sum, b) => sum + b.leadIds.length, 0);
    const unmatchedTotal =
      s.mode === 'bulk-one' ? bulkOneUnmatched.length : unmatchedIds.length;

    return {
      bulkOneSplit: {
        matched: bulkOneMatched,
        unmatched: bulkOneUnmatched,
        targetInstitution: bulkOneInst,
      },
      rrBatches,
      unmatchedIds,
      matchedTotal,
      unmatchedTotal,
    };
  }, [s.selectedLeadInstitutions, selectedCounselors, s.mode, s.pickerIds, counselors]);

  // Confirmation dialog state — opens on Confirm click, shows the matched
  // vs unmatched summary before any RPC fires. User clicks "Proceed" to
  // actually run; unmatched leads are skipped on the floor.
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!canDistribute) return null;
  // Always render the panel when the user can distribute — even at zero
  // unassigned leads. Previously this returned null at zero, which hid the
  // panel entirely and confused users who had just mapped counselors and
  // expected to see the distribution surface.

  const handlePreview = async () => {
    dispatch({ type: 'SET_PHASE', phase: 'previewing' });
    try {
      const ids = Array.from(s.selectedIds);
      if (s.mode === 'auto-route') {
        const r = await autoRoute.mutateAsync({ leadIds: ids, dryRun: true, override: s.override });
        dispatch({ type: 'SET_PREVIEW', preview: r });
      } else if (s.mode === 'round-robin') {
        const limit = s.perCounselorLimit.trim()
          ? Math.max(1, Math.floor(Number(s.perCounselorLimit)))
          : null;
        const r = await roundRobin.mutateAsync({
          leadIds: ids,
          counselorIds: s.pickerIds,
          dryRun: true,
          override: s.override,
          perCounselorLimit: limit,
        });
        dispatch({ type: 'SET_PREVIEW', preview: r });
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Preview failed');
      dispatch({ type: 'SET_PHASE', phase: 'ready' });
    }
  };

  // Opens the confirmation dialog. The dialog shows the matched/unmatched
  // breakdown so the user explicitly acknowledges what will be skipped
  // before the RPCs fire.
  const handleConfirmClick = () => {
    if (s.override && s.reason.trim().length === 0) {
      toast.error('Override requires a reason note.');
      return;
    }
    if (s.mode === 'bulk-one' && s.pickerIds.length !== 1) {
      toast.error('Pick exactly one counselor for Bulk-one mode.');
      return;
    }
    setConfirmOpen(true);
  };

  // Runs the actual per-institution-matched assignment. Each round-robin
  // batch fires one RPC scoped to its institution, so cycling stays
  // within that institution and a Pharmacy lead can never land on an
  // Engineering counselor. Unmatched leads are not sent — they stay
  // unassigned for manual handling.
  const handleProceedCommit = async () => {
    setConfirmOpen(false);
    dispatch({ type: 'SET_PHASE', phase: 'mutating' });

    // For auto-route, the server-side _pick_counselor_for_source already
    // does its own institution matching via the routing rules — we just
    // send the full selection.
    const isAutoRoute = s.mode === 'auto-route';
    const matchedTotal = isAutoRoute ? s.selectedIds.size : commitPlan.matchedTotal;
    setBatchProgress(matchedTotal > 500 ? { done: 0, total: matchedTotal } : null);
    const onProgress = (done: number, total: number) =>
      setBatchProgress({ done, total });

    try {
      // Aggregate results across all per-institution sub-runs.
      const allResults: BulkAssignReport['results'] = [];
      let successCount = 0;
      let failureCount = 0;
      let planHash: string | undefined;

      if (s.mode === 'bulk-one') {
        const targetIds = commitPlan.bulkOneSplit.matched;
        if (targetIds.length === 0) {
          toast(
            'No leads matched the selected counselor’s institution. Nothing to assign.',
          );
          dispatch({ type: 'SET_PHASE', phase: 'ready' });
          setBatchProgress(null);
          return;
        }
        const r = await bulkOne.mutateAsync({
          leadIds: targetIds,
          counselorId: s.pickerIds[0],
          reason: s.reason || undefined,
          override: s.override,
        });
        allResults.push(...r.results);
        successCount += r.successCount;
        failureCount += r.failureCount;
      } else if (isAutoRoute) {
        const r = await autoRoute.mutateAsync({
          leadIds: Array.from(s.selectedIds),
          dryRun: false,
          override: s.override,
          expectedPlanHash: s.preview?.planHash ?? null,
          onProgress,
        });
        allResults.push(...r.results);
        successCount += r.successCount;
        failureCount += r.failureCount;
        planHash = r.planHash;
      } else {
        // Round-Robin: one RPC per institution-batch so cycling stays
        // institution-scoped. Aggregate per-counselor progress across them.
        if (commitPlan.rrBatches.length === 0) {
          toast(
            'No selected leads have a matching counselor of their institution. Nothing to assign.',
          );
          dispatch({ type: 'SET_PHASE', phase: 'ready' });
          setBatchProgress(null);
          return;
        }
        const limit = s.perCounselorLimit.trim()
          ? Math.max(1, Math.floor(Number(s.perCounselorLimit)))
          : null;
        let cumulative = 0;
        for (const batch of commitPlan.rrBatches) {
          const r = await roundRobin.mutateAsync({
            leadIds: batch.leadIds,
            counselorIds: batch.counselorIds,
            dryRun: false,
            override: s.override,
            // expectedPlanHash isn't meaningful across multiple
            // institution-scoped batches; pass null.
            expectedPlanHash: null,
            perCounselorLimit: limit,
            onProgress: (done: number) => {
              setBatchProgress({
                done: cumulative + done,
                total: matchedTotal,
              });
            },
          });
          allResults.push(...r.results);
          successCount += r.successCount;
          failureCount += r.failureCount;
          cumulative += batch.leadIds.length;
        }
      }

      // Result toast surfaces the matched-assigned + unmatched-skipped split
      // so the user knows exactly what stayed unassigned for manual handling.
      const unmatchedSkipped = isAutoRoute ? 0 : commitPlan.unmatchedTotal;
      const parts: string[] = [];
      if (successCount > 0) {
        parts.push(`Assigned ${successCount.toLocaleString()} lead${successCount === 1 ? '' : 's'}`);
      }
      if (unmatchedSkipped > 0) {
        parts.push(
          `${unmatchedSkipped.toLocaleString()} unmatched lead${unmatchedSkipped === 1 ? '' : 's'} skipped (no counselor from their institution selected)`,
        );
      }
      if (failureCount > 0) {
        parts.push(`${failureCount.toLocaleString()} failed`);
      }
      if (parts.length > 0) {
        toast.success(parts.join(' · '));
      }

      const aggregated: BulkAssignReport = {
        total: allResults.length,
        successCount,
        failureCount,
        results: allResults,
        failures: allResults.filter((r) => r.status !== 'assigned'),
        planHash,
      };

      setBatchProgress(null);
      if (aggregated.failureCount > 0 && aggregated.successCount > 0) {
        dispatch({ type: 'SET_ERRORS', errors: aggregated.failures });
      } else {
        dispatch({ type: 'RESET_AFTER_COMMIT' });
      }
    } catch (_err: any) {
      // Mutation hook already toasted
      setBatchProgress(null);
      dispatch({ type: 'SET_PHASE', phase: 'ready' });
    }
  };

  const isCommitting = s.phase === 'mutating';
  const canCommitNow =
    s.selectedIds.size > 0 &&
    !isCommitting &&
    (s.mode === 'bulk-one'
      ? s.pickerIds.length === 1
      : s.mode === 'round-robin'
        ? s.pickerIds.length > 0
        : true /* auto-route needs no picker */);

  const hasUnassigned = totalCount > 0;

  return (
    <Card
      className={
        hasUnassigned
          ? 'border-red-300 bg-red-50/50 shadow-sm ring-1 ring-red-200'
          : ''
      }
    >
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => hasUnassigned && dispatch({ type: 'TOGGLE_EXPAND' })}
          disabled={!hasUnassigned}
          className={
            hasUnassigned
              ? 'flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left transition-colors hover:bg-red-100/50'
              : 'flex w-full items-center justify-between gap-2 px-4 py-3 text-left disabled:cursor-default disabled:hover:bg-transparent'
          }
        >
          <span className="flex items-center gap-2">
            <span
              className={
                hasUnassigned
                  ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-sm'
                  : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'
              }
            >
              <Send className="h-3.5 w-3.5" />
            </span>
            <span className="flex flex-col text-left">
              <span
                className={
                  hasUnassigned
                    ? 'text-sm font-bold text-red-900'
                    : 'text-sm font-semibold'
                }
              >
                {hasUnassigned
                  ? `${totalCount.toLocaleString()} unassigned leads — needs attention`
                  : 'No unassigned leads to distribute — new leads from this source will auto-route via your counselor mapping'}
              </span>
              {hasUnassigned && (
                <span className="text-[11px] text-red-700/80">
                  Click to expand and distribute now
                </span>
              )}
            </span>
          </span>
          {hasUnassigned &&
            (s.expanded ? (
              <ChevronUp className="h-5 w-5 text-red-700" />
            ) : (
              <ChevronDown className="h-5 w-5 text-red-700" />
            ))}
        </button>

        {s.expanded && (
          <div className="space-y-3 border-t p-4">
            <DistributeModeTabs value={s.mode} onChange={(m) => dispatch({ type: 'SET_MODE', mode: m })} />

            <FiltersUI value={s.filters} onChange={(f) => dispatch({ type: 'SET_FILTERS', filters: f })} />

            <UnassignedLeadList
              leads={visibleLeads}
              totalCount={totalCount}
              isLoading={leadsLoading}
              selectedIds={s.selectedIds}
              toggleOne={(id) => {
                const lead = visibleLeads.find((l) => l.id === id);
                dispatch({
                  type: 'TOGGLE_LEAD',
                  id,
                  institutionId: lead?.institution_id ?? null,
                });
              }}
              toggleAllVisible={() =>
                dispatch({
                  type: 'TOGGLE_ALL_VISIBLE',
                  visible: visibleLeads.map((l) => ({
                    id: l.id,
                    institution_id: l.institution_id,
                  })),
                })
              }
              selectAllMatching={handleSelectAllMatching}
              isSelectingAll={isSelectingAll}
              clearSelection={() => dispatch({ type: 'CLEAR_LEAD_SELECTION' })}
            />

            {s.mode !== 'auto-route' && (
              <CounselorTargetPicker
                sourceId={sourceId}
                mode={s.mode === 'bulk-one' ? 'single' : 'multi'}
                selectedIds={s.pickerIds}
                onChange={(ids) => dispatch({ type: 'SET_PICKER', ids })}
                override={s.override}
                selectedLeadInstitutionIds={selectedLeadInstitutionIds}
                restrictToLeadInstitutions={s.restrictPickerToLeadInstitutions}
                onToggleRestriction={(v) =>
                  dispatch({ type: 'TOGGLE_INST_RESTRICTION', value: v })
                }
                institutionMap={institutionMap}
              />
            )}

            {s.mode !== 'auto-route' && s.selectedIds.size > 0 && (
              <InstitutionSummary
                selectedLeadInstitutions={Array.from(
                  s.selectedLeadInstitutions.entries(),
                ).map(([leadId, instId]) => ({
                  leadId,
                  institutionId: instId,
                }))}
                selectedCounselors={selectedCounselors}
                allMappedCounselors={counselors ?? []}
                institutionMap={institutionMap}
                overrideActive={s.override}
              />
            )}

            {/* Round-robin only: per-counselor cap. When set, each selected
                counselor receives at most this many leads in this run; the
                rest stay unassigned for next round. Useful for batch
                distribution like "give each counselor exactly 500 today". */}
            {s.mode === 'round-robin' && (
              <div className="rounded-md border bg-muted/20 p-3">
                <Label htmlFor="per-counselor-limit" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Limit per counselor (optional)
                </Label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id="per-counselor-limit"
                    type="number"
                    min={1}
                    step={1}
                    value={s.perCounselorLimit}
                    onChange={(e) =>
                      dispatch({ type: 'SET_PER_COUNSELOR_LIMIT', value: e.target.value })
                    }
                    placeholder="No cap"
                    className="h-8 w-32 rounded-md border bg-background px-2 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">
                    {(() => {
                      const limit = s.perCounselorLimit.trim()
                        ? Math.max(1, Math.floor(Number(s.perCounselorLimit)))
                        : null;
                      const pickers = s.pickerIds.length;
                      const total = s.selectedIds.size;
                      if (limit && pickers > 0) {
                        const willAssign = Math.min(limit * pickers, total);
                        const willSkip = total - willAssign;
                        return `Each of ${pickers} counselor${pickers === 1 ? '' : 's'} gets up to ${limit} leads → ${willAssign.toLocaleString()} assigned, ${willSkip.toLocaleString()} unassigned remain`;
                      }
                      return 'Leave blank to cycle through every selected lead';
                    })()}
                  </span>
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="bulk-reason" className="text-xs uppercase tracking-wide text-muted-foreground">
                Reason note {s.override ? '(required for override)' : '(optional)'}
              </Label>
              <Textarea
                id="bulk-reason"
                value={s.reason}
                onChange={(e) => dispatch({ type: 'SET_REASON', value: e.target.value })}
                placeholder="Why are you running this distribution?"
                rows={2}
                className="mt-1"
              />
            </div>

            {canOverride && (
              <OverrideToggle
                value={s.override}
                onChange={(v) => dispatch({ type: 'SET_OVERRIDE', value: v })}
                disabled={isCommitting}
              />
            )}

            {/* Batch progress for large auto-route / round-robin runs. The
                service chunks selections > 500 transparently and calls
                onProgress after each chunk; this surfaces it as a live
                "X of Y" bar so Confirming doesn't look frozen. */}
            {batchProgress && (
              <div className="rounded-md border bg-card p-3 text-xs">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium">
                    Distributing in batches of {500}…
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {batchProgress.done.toLocaleString()} /{' '}
                    {batchProgress.total.toLocaleString()}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (batchProgress.done / batchProgress.total) * 100,
                        ),
                      )}%`,
                    }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Don't close this page — running the next batch in a moment.
                </div>
              </div>
            )}

            {s.phase === 'preview-ready' && s.preview ? (
              <DistributeDryRun
                report={s.preview}
                isCommitting={isCommitting}
                override={s.override}
                onCommit={handleConfirmClick}
                onCancel={() => dispatch({ type: 'SET_PHASE', phase: 'ready' })}
              />
            ) : (
              <div className="flex items-center justify-end gap-2 border-t pt-3">
                <span className="mr-auto text-xs text-muted-foreground">
                  {s.selectedIds.size.toLocaleString()} of{' '}
                  {totalCount.toLocaleString()} selected
                  {s.selectedIds.size > 500 && (
                    <>
                      {' · '}
                      <span className="text-foreground">
                        will run in {Math.ceil(s.selectedIds.size / 500)} batches
                      </span>
                    </>
                  )}
                </span>
                {s.mode !== 'bulk-one' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePreview}
                    disabled={!canCommitNow || s.phase === 'previewing'}
                  >
                    {s.phase === 'previewing' ? 'Previewing…' : 'Preview'}
                  </Button>
                )}
                <Button size="sm" onClick={handleConfirmClick} disabled={!canCommitNow}>
                  {isCommitting ? 'Assigning…' : 'Confirm'}
                </Button>
              </div>
            )}

            {s.phase === 'partial' && s.errors && (
              <div className="rounded-md border-l-4 border-orange-400 bg-orange-50 p-2 text-xs">
                <strong className="text-orange-900">{s.errors.length} leads failed.</strong>{' '}
                Check Lead Timeline for details.
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Pre-commit confirmation dialog — surfaces the institution-matched
          split before any RPC fires. Unmatched leads are never sent; they
          stay in the unassigned pool for manual handling. */}
      <ConfirmAssignmentDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        mode={s.mode}
        matchedTotal={
          s.mode === 'auto-route' ? s.selectedIds.size : commitPlan.matchedTotal
        }
        unmatchedTotal={
          s.mode === 'auto-route' ? 0 : commitPlan.unmatchedTotal
        }
        institutionMap={institutionMap}
        rrBatches={commitPlan.rrBatches}
        bulkOneTargetInstitutionName={
          commitPlan.bulkOneSplit.targetInstitution
            ? institutionMap.get(commitPlan.bulkOneSplit.targetInstitution) ??
              null
            : null
        }
        onProceed={handleProceedCommit}
        isCommitting={isCommitting}
      />
    </Card>
  );
}

// -----------------------------------------------------------------------------
// ConfirmAssignmentDialog
// -----------------------------------------------------------------------------
// Pre-commit summary modal. Shows the per-institution batches that will run
// + a clear "N unmatched, will be skipped" line. Force-acknowledge gesture so
// users never accidentally trigger a 14k-lead distribution.
function ConfirmAssignmentDialog({
  open,
  onOpenChange,
  mode,
  matchedTotal,
  unmatchedTotal,
  institutionMap,
  rrBatches,
  bulkOneTargetInstitutionName,
  onProceed,
  isCommitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: DistributeMode;
  matchedTotal: number;
  unmatchedTotal: number;
  institutionMap: Map<string, string>;
  rrBatches: Array<{ institutionId: string; leadIds: string[]; counselorIds: string[] }>;
  bulkOneTargetInstitutionName: string | null;
  onProceed: () => void;
  isCommitting: boolean;
}) {
  const showInstBreakdown = mode === 'round-robin' && rrBatches.length > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm assignment</DialogTitle>
          <DialogDescription>
            Review the institution-matched split before running. Unmatched
            leads are NOT sent — they stay in the unassigned pool for manual
            handling later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Headline split */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
              <div className="text-[10px] uppercase tracking-wide font-medium">
                Will assign
              </div>
              <div className="mt-0.5 text-2xl font-semibold tabular-nums">
                {matchedTotal.toLocaleString()}
              </div>
              <div className="text-[11px] opacity-80">institution-matched</div>
            </div>
            <div
              className={
                unmatchedTotal > 0
                  ? 'rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200'
                  : 'rounded-md border bg-muted/30 p-3 text-muted-foreground'
              }
            >
              <div className="text-[10px] uppercase tracking-wide font-medium">
                Will skip
              </div>
              <div className="mt-0.5 text-2xl font-semibold tabular-nums">
                {unmatchedTotal.toLocaleString()}
              </div>
              <div className="text-[11px] opacity-80">
                {unmatchedTotal > 0 ? 'no matching counselor' : 'all matched'}
              </div>
            </div>
          </div>

          {/* Per-institution breakdown for Round-Robin */}
          {showInstBreakdown && (
            <div className="rounded-md border">
              <div className="border-b bg-muted/30 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Per institution
              </div>
              <div className="max-h-44 overflow-y-auto divide-y text-xs">
                {rrBatches.map((b) => (
                  <div
                    key={b.institutionId}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5"
                  >
                    <span className="truncate font-medium">
                      {institutionMap.get(b.institutionId) ?? '(unknown)'}
                    </span>
                    <span className="flex-shrink-0 text-muted-foreground tabular-nums">
                      {b.leadIds.length.toLocaleString()} leads →{' '}
                      {b.counselorIds.length} counselor
                      {b.counselorIds.length === 1 ? '' : 's'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bulk-one target institution chip */}
          {mode === 'bulk-one' && bulkOneTargetInstitutionName && (
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              All matched leads will go to one counselor at{' '}
              <span className="font-medium text-foreground">
                {bulkOneTargetInstitutionName}
              </span>
              .
            </div>
          )}

          {/* Auto-route disclaimer — server-side routing rules pick counselors */}
          {mode === 'auto-route' && (
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Auto-route uses server-side routing rules and applies its own
              institution scoping internally. Every selected lead is sent;
              the server may still mark some as "no-candidate" if no eligible
              counselor exists for their source/institution.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCommitting}
          >
            Cancel
          </Button>
          <Button
            onClick={onProceed}
            disabled={isCommitting || matchedTotal === 0}
          >
            {isCommitting
              ? 'Assigning…'
              : `Assign ${matchedTotal.toLocaleString()} lead${matchedTotal === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
