'use client';

import { useReducer, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, Send } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

import { usePermissions } from '@/hooks/use-permissions';
import { useUnassignedLeads, type UnassignedLeadFilters } from '@/hooks/admission/use-unassigned-leads';
import { useBulkAssign } from '@/hooks/admission/use-bulk-assign';
import { useSourceCounselorsWithLoad } from '@/hooks/admission/use-source-counselors-with-load';
import type { BulkAssignReport, PerLeadResult } from '@/lib/services/admission/bulk-assign-service';
import type { LeadSourceEnum } from '@/lib/services/admission/source-master-service';

import { DistributeModeTabs, type DistributeMode } from './distribute-mode-tabs';
import { UnassignedLeadFilters as FiltersUI } from './unassigned-lead-filters';
import { UnassignedLeadList } from './unassigned-lead-list';
import { CounselorTargetPicker } from './counselor-target-picker';
import { OverrideToggle } from './override-toggle';
import { DistributeDryRun } from './distribute-dry-run';

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
  pickerIds: string[];
  override: boolean;
  reason: string;
  phase: Phase;
  preview: BulkAssignReport | null;
  errors: PerLeadResult[] | null;
}

const initial: State = {
  expanded: false,
  mode: 'bulk-one',
  filters: {},
  selectedIds: new Set<string>(),
  pickerIds: [],
  override: false,
  reason: '',
  phase: 'ready',
  preview: null,
  errors: null,
};

type Action =
  | { type: 'TOGGLE_EXPAND' }
  | { type: 'SET_MODE'; mode: DistributeMode }
  | { type: 'SET_FILTERS'; filters: UnassignedLeadFilters }
  | { type: 'TOGGLE_LEAD'; id: string }
  | { type: 'TOGGLE_ALL_VISIBLE'; visibleIds: string[] }
  | { type: 'SELECT_ALL_MATCHING'; ids: string[] }
  | { type: 'SET_PICKER'; ids: string[] }
  | { type: 'SET_OVERRIDE'; value: boolean }
  | { type: 'SET_REASON'; value: string }
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
      if (next.has(a.id)) next.delete(a.id);
      else next.add(a.id);
      return { ...s, selectedIds: next };
    }
    case 'TOGGLE_ALL_VISIBLE': {
      const next = new Set(s.selectedIds);
      const allOn = a.visibleIds.every((id) => next.has(id));
      a.visibleIds.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return { ...s, selectedIds: next };
    }
    case 'SELECT_ALL_MATCHING':
      return { ...s, selectedIds: new Set(a.ids) };
    case 'SET_PICKER':
      return { ...s, pickerIds: a.ids };
    case 'SET_OVERRIDE':
      return { ...s, override: a.value };
    case 'SET_REASON':
      return { ...s, reason: a.value };
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
        const r = await roundRobin.mutateAsync({
          leadIds: ids,
          counselorIds: s.pickerIds,
          dryRun: true,
          override: s.override,
        });
        dispatch({ type: 'SET_PREVIEW', preview: r });
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Preview failed');
      dispatch({ type: 'SET_PHASE', phase: 'ready' });
    }
  };

  const handleCommit = async () => {
    if (s.override && s.reason.trim().length === 0) {
      toast.error('Override requires a reason note.');
      return;
    }
    dispatch({ type: 'SET_PHASE', phase: 'mutating' });
    const ids = Array.from(s.selectedIds);
    try {
      let report: BulkAssignReport;
      if (s.mode === 'bulk-one') {
        if (s.pickerIds.length !== 1) {
          toast.error('Pick exactly one counselor for Bulk-one mode.');
          dispatch({ type: 'SET_PHASE', phase: 'ready' });
          return;
        }
        report = await bulkOne.mutateAsync({
          leadIds: ids,
          counselorId: s.pickerIds[0],
          reason: s.reason || undefined,
          override: s.override,
        });
      } else if (s.mode === 'auto-route') {
        report = await autoRoute.mutateAsync({
          leadIds: ids,
          dryRun: false,
          override: s.override,
          expectedPlanHash: s.preview?.planHash ?? null,
        });
      } else {
        report = await roundRobin.mutateAsync({
          leadIds: ids,
          counselorIds: s.pickerIds,
          dryRun: false,
          override: s.override,
          expectedPlanHash: s.preview?.planHash ?? null,
        });
      }

      if (report.failureCount > 0 && report.successCount > 0) {
        dispatch({ type: 'SET_ERRORS', errors: report.failures });
      } else {
        dispatch({ type: 'RESET_AFTER_COMMIT' });
      }
    } catch (_err: any) {
      // Mutation hook already toasted
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
    <Card>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => hasUnassigned && dispatch({ type: 'TOGGLE_EXPAND' })}
          disabled={!hasUnassigned}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/30 disabled:cursor-default disabled:hover:bg-transparent"
        >
          <span className="flex items-center gap-2">
            <Send className={`h-4 w-4 ${hasUnassigned ? 'text-blue-600' : 'text-muted-foreground'}`} />
            <span className="text-sm font-semibold">
              {hasUnassigned
                ? `Distribute ${totalCount} unassigned leads`
                : 'No unassigned leads to distribute — new leads from this source will auto-route via your counselor mapping'}
            </span>
          </span>
          {hasUnassigned &&
            (s.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
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
              toggleOne={(id) => dispatch({ type: 'TOGGLE_LEAD', id })}
              toggleAllVisible={() =>
                dispatch({ type: 'TOGGLE_ALL_VISIBLE', visibleIds: visibleLeads.map((l) => l.id) })
              }
              selectAllMatching={() =>
                dispatch({ type: 'SELECT_ALL_MATCHING', ids: visibleLeads.map((l) => l.id) })
              }
            />

            {s.mode !== 'auto-route' && (
              <CounselorTargetPicker
                sourceId={sourceId}
                mode={s.mode === 'bulk-one' ? 'single' : 'multi'}
                selectedIds={s.pickerIds}
                onChange={(ids) => dispatch({ type: 'SET_PICKER', ids })}
                override={s.override}
              />
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

            {s.phase === 'preview-ready' && s.preview ? (
              <DistributeDryRun
                report={s.preview}
                isCommitting={isCommitting}
                override={s.override}
                onCommit={handleCommit}
                onCancel={() => dispatch({ type: 'SET_PHASE', phase: 'ready' })}
              />
            ) : (
              <div className="flex items-center justify-end gap-2 border-t pt-3">
                <span className="mr-auto text-xs text-muted-foreground">
                  {s.selectedIds.size} of {totalCount} selected
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
                <Button size="sm" onClick={handleCommit} disabled={!canCommitNow}>
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
    </Card>
  );
}
