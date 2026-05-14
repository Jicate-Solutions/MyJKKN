'use client';

import { useMemo } from 'react';
import { Building2, Pause, Users, AlertTriangle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSourceCounselorsWithLoad } from '@/hooks/admission/use-source-counselors-with-load';

interface CounselorTargetPickerProps {
  sourceId: string;
  mode: 'single' | 'multi';
  selectedIds: string[];
  onChange: (next: string[]) => void;
  override: boolean;
  /**
   * Institution IDs represented by the currently selected leads. Used to
   * auto-narrow the picker so counselors who don't serve any of those
   * institutions are hidden by default — enforcing the "own institution
   * only" rule. Empty array = no scoping (show all).
   */
  selectedLeadInstitutionIds?: string[];
  /**
   * When true, restrict the picker to counselors whose institution_id is
   * in `selectedLeadInstitutionIds`. When false, show every mapped
   * counselor (legacy behavior). Toggled by an in-picker control.
   */
  restrictToLeadInstitutions?: boolean;
  onToggleRestriction?: (next: boolean) => void;
  /** institution_id -> name map for the chip display. */
  institutionMap?: Map<string, string>;
}

export function CounselorTargetPicker({
  sourceId,
  mode,
  selectedIds,
  onChange,
  override,
  selectedLeadInstitutionIds = [],
  restrictToLeadInstitutions = true,
  onToggleRestriction,
  institutionMap,
}: CounselorTargetPickerProps) {
  const { data: counselors, isLoading } = useSourceCounselorsWithLoad(sourceId);

  // Two-stage filter:
  //   1. Pause filter (always; override toggle bypasses).
  //   2. Institution filter (when enabled): only counselors whose
  //      institution_id is in the lead-selected set survive.
  // This is what gates a Pharmacy counselor from accidentally getting an
  // Engineering lead via Round-Robin.
  const visible = useMemo(() => {
    const byPause = (counselors ?? []).filter((a) => override || !a.is_paused);
    if (!restrictToLeadInstitutions || selectedLeadInstitutionIds.length === 0) {
      return byPause;
    }
    const allowed = new Set(selectedLeadInstitutionIds);
    return byPause.filter(
      (a) => a.counselor?.institution_id && allowed.has(a.counselor.institution_id),
    );
  }, [counselors, override, restrictToLeadInstitutions, selectedLeadInstitutionIds]);

  // Counselors hidden by the institution filter (so we can offer a quick
  // "Show all" affordance + count chip).
  const hiddenByInstFilterCount = useMemo(() => {
    if (!restrictToLeadInstitutions || selectedLeadInstitutionIds.length === 0) {
      return 0;
    }
    const byPause = (counselors ?? []).filter((a) => override || !a.is_paused);
    return byPause.length - visible.length;
  }, [counselors, override, restrictToLeadInstitutions, selectedLeadInstitutionIds, visible.length]);

  const toggle = (id: string) => {
    if (mode === 'single') {
      onChange([id]);
      return;
    }
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const showInstFilterToggle =
    selectedLeadInstitutionIds.length > 0 && !!onToggleRestriction;

  if (visible.length === 0) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {mode === 'single' ? 'Assign all to' : 'Participants'}
        </Label>
        <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-1 h-5 w-5 opacity-50" />
          {restrictToLeadInstitutions && selectedLeadInstitutionIds.length > 0 ? (
            <>
              No counselors mapped to the selected leads' institutions
              {hiddenByInstFilterCount > 0 && (
                <>
                  {' '}({hiddenByInstFilterCount} counselor
                  {hiddenByInstFilterCount === 1 ? '' : 's'} from other
                  institutions hidden).
                </>
              )}
              {onToggleRestriction && (
                <div className="mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onToggleRestriction(false)}
                  >
                    Show counselors from all institutions
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>No mapped counselors {override ? '' : '(toggle override to include paused)'}</>
          )}
        </div>
      </div>
    );
  }

  // Bulk-select helpers (multi-mode only) — operate on the currently visible
  // (post-filter) pool so toggling the institution filter changes what
  // "select all" affects.
  const allVisibleSelected =
    mode === 'multi' &&
    visible.length > 0 &&
    visible.every((a) => selectedIds.includes(a.counselor_id));
  const handleSelectAllVisible = () => {
    const visibleIds = visible.map((a) => a.counselor_id);
    const merged = new Set(selectedIds);
    visibleIds.forEach((id) => merged.add(id));
    onChange(Array.from(merged));
  };
  const handleClearAll = () => onChange([]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {mode === 'single'
            ? 'Assign all to'
            : `Participants (${selectedIds.length} of ${visible.length} selected)`}
        </Label>
        {mode === 'multi' && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={handleSelectAllVisible}
              disabled={allVisibleSelected}
            >
              Select all
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={handleClearAll}
              disabled={selectedIds.length === 0}
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      {showInstFilterToggle && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">
            {restrictToLeadInstitutions
              ? `Showing only counselors from selected leads' institution${selectedLeadInstitutionIds.length === 1 ? '' : 's'}`
              : 'Showing all mapped counselors (institution filter off)'}
          </span>
          {hiddenByInstFilterCount > 0 && restrictToLeadInstitutions && (
            <Badge variant="secondary" className="text-[10px]">
              {hiddenByInstFilterCount} hidden
            </Badge>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto h-6 px-2 text-xs"
            onClick={() => onToggleRestriction?.(!restrictToLeadInstitutions)}
          >
            {restrictToLeadInstitutions ? 'Show all institutions' : 'Restrict to lead institutions'}
          </Button>
        </div>
      )}

      <div className="space-y-1 rounded-md border p-1 max-h-72 overflow-y-auto">
        {visible.map((a) => {
          const c = a.counselor;
          const checked = selectedIds.includes(a.counselor_id);
          const atCap =
            (c?.current_leads ?? 0) >= (c?.max_leads ?? Number.POSITIVE_INFINITY);
          const instName =
            c?.institution_id && institutionMap?.get(c.institution_id);

          return (
            <label
              key={a.counselor_id}
              className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
            >
              <Checkbox checked={checked} onCheckedChange={() => toggle(a.counselor_id)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{c?.name ?? 'Unknown'}</span>
                  {a.is_paused && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700">
                      <Pause className="h-2.5 w-2.5" /> Paused
                    </span>
                  )}
                  {atCap && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">
                      <AlertTriangle className="h-2.5 w-2.5" /> At cap
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {instName && (
                    <span className="mr-1 inline-flex items-center gap-0.5">
                      <Building2 className="h-2.5 w-2.5" />
                      {instName}
                    </span>
                  )}
                  {c?.designation && (instName ? <> · {c.designation}</> : c.designation)}
                  {c?.email && <> · {c.email}</>}
                </div>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {c?.current_leads ?? 0}
                {c?.max_leads ? ` / ${c.max_leads}` : ''}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
