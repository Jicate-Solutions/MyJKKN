'use client';

/**
 * InstitutionSemesterPicker — the drive form's audience selector.
 *
 * Step 1: tick institutions. Step 2: for each ticked institution, tick the
 * semesters whose learners should be notified. Selecting no semester for an
 * institution means "every semester of that institution". Semester options
 * come from the institution's real `semesters` master
 * (/api/cdc/pickers/institution-semesters), collapsed to distinct orders.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Building2, CheckSquare, GraduationCap, Square, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useCdcInstitutionSemesters, useCdcProgramOptionsAll } from '@/hooks/cdc/use-cdc-drives';
import type { CdcDriveInstitutionSemesters } from '@/types/cdc';

export interface PickerInstitution {
  id: string;
  name: string;
}

interface Props {
  institutions: PickerInstitution[];
  institutionsLoading?: boolean;
  institutionsError?: string | null;
  selectedInstitutions: string[];
  onSelectedInstitutionsChange: (ids: string[]) => void;
  targeting: CdcDriveInstitutionSemesters;
  onTargetingChange: (next: CdcDriveInstitutionSemesters) => void;
  disabled?: boolean;
  /**
   * Programs saved on the drive's eligibility record ("Who is eligible"). When a
   * targeting entry has no programs of its own, the matching ones for that
   * institution are pre-ticked once the options load, so the two places agree.
   */
  fallbackProgramIds?: string[];
}

export function InstitutionSemesterPicker({
  institutions,
  institutionsLoading,
  institutionsError,
  selectedInstitutions,
  onSelectedInstitutionsChange,
  targeting,
  onTargetingChange,
  disabled,
  fallbackProgramIds,
}: Props) {
  const { data: semData, isLoading: semLoading, isError: semIsError } =
    useCdcInstitutionSemesters(selectedInstitutions);
  const { data: programOptions, isLoading: progLoading, isError: progIsError } =
    useCdcProgramOptionsAll(selectedInstitutions.length > 0);
  const programsByInst = useMemo(() => {
    const m = new Map<string, NonNullable<typeof programOptions>>();
    (programOptions ?? []).forEach((o) => {
      if (!o.institution_id) return;
      const list = m.get(o.institution_id) ?? [];
      list.push(o);
      m.set(o.institution_id, list);
    });
    return m;
  }, [programOptions]);

  // One-time seed from eligibility.program_ids (per institution, only where the
  // entry has no programs yet).
  const seededFromFallback = useRef(false);
  useEffect(() => {
    if (seededFromFallback.current || !programOptions || !fallbackProgramIds?.length) return;
    seededFromFallback.current = true;
    const fallback = new Set(fallbackProgramIds);
    let changed = false;
    const next = targeting.map((t) => {
      if (t.program_ids && t.program_ids.length > 0) return t;
      const instIds = (programsByInst.get(t.institution_id) ?? []).flatMap((o) => o.ids);
      const matched = instIds.filter((id) => fallback.has(id));
      if (matched.length === 0) return t;
      changed = true;
      return { ...t, program_ids: matched };
    });
    if (changed) onTargetingChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programOptions, fallbackProgramIds]);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    institutions.forEach((i) => m.set(i.id, i.name));
    return m;
  }, [institutions]);

  function ordersFor(instId: string): number[] {
    return targeting.find((t) => t.institution_id === instId)?.semester_orders ?? [];
  }
  function programsFor(instId: string): string[] {
    return targeting.find((t) => t.institution_id === instId)?.program_ids ?? [];
  }

  function setOrders(instId: string, orders: number[]) {
    const sorted = Array.from(new Set(orders)).sort((a, b) => a - b);
    const rest = targeting.filter((t) => t.institution_id !== instId);
    onTargetingChange([...rest, { institution_id: instId, semester_orders: sorted, program_ids: programsFor(instId) }]);
  }

  function setPrograms(instId: string, ids: string[]) {
    const rest = targeting.filter((t) => t.institution_id !== instId);
    onTargetingChange([
      ...rest,
      { institution_id: instId, semester_orders: ordersFor(instId), program_ids: Array.from(new Set(ids)) },
    ]);
  }

  /** A program option covers several master ids; toggle them as one. */
  function toggleProgram(instId: string, optionIds: string[]) {
    const current = programsFor(instId);
    const on = optionIds.some((id) => current.includes(id));
    setPrograms(instId, on ? current.filter((id) => !optionIds.includes(id)) : [...current, ...optionIds]);
  }

  function toggleInstitution(id: string) {
    if (selectedInstitutions.includes(id)) {
      onSelectedInstitutionsChange(selectedInstitutions.filter((i) => i !== id));
      onTargetingChange(targeting.filter((t) => t.institution_id !== id));
    } else {
      onSelectedInstitutionsChange([...selectedInstitutions, id]);
      onTargetingChange([...targeting, { institution_id: id, semester_orders: [], program_ids: [] }]);
    }
  }

  function toggleOrder(instId: string, order: number) {
    const current = ordersFor(instId);
    setOrders(instId, current.includes(order) ? current.filter((o) => o !== order) : [...current, order]);
  }

  /** Apply one institution's semester selection to every selected institution (where those orders exist). */
  function applyToAll(fromInst: string) {
    const source = ordersFor(fromInst);
    const next: CdcDriveInstitutionSemesters = selectedInstitutions.map((id) => {
      const available = new Set((semData?.institutions[id] ?? []).map((o) => o.order));
      return { institution_id: id, semester_orders: source.filter((o) => available.has(o)), program_ids: programsFor(id) };
    });
    onTargetingChange(next);
  }

  const allSelected = institutions.length > 0 && selectedInstitutions.length === institutions.length;

  return (
    <div className="space-y-5">
      {/* Step 1 — institutions */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Institutions
            {selectedInstitutions.length > 0 ? (
              <Badge variant="secondary" className="font-normal">
                {selectedInstitutions.length} selected
              </Badge>
            ) : null}
          </div>
          {institutions.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                if (allSelected) {
                  onSelectedInstitutionsChange([]);
                  onTargetingChange([]);
                } else {
                  onSelectedInstitutionsChange(institutions.map((i) => i.id));
                  onTargetingChange(
                    institutions.map((i) => ({
                      institution_id: i.id,
                      semester_orders: ordersFor(i.id),
                      program_ids: programsFor(i.id),
                    }))
                  );
                }
              }}
            >
              {allSelected ? (
                <>
                  <Square className="h-4 w-4 mr-1" /> Clear all
                </>
              ) : (
                <>
                  <CheckSquare className="h-4 w-4 mr-1" /> Select all
                </>
              )}
            </Button>
          ) : null}
        </div>

        {institutionsLoading ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : institutionsError ? (
          <div className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md p-3">
            Could not load institutions: {institutionsError}
          </div>
        ) : institutions.length === 0 ? (
          <div className="text-sm text-muted-foreground border rounded-md p-3">
            No institutions are available to select.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {institutions.map((inst) => {
              const checked = selectedInstitutions.includes(inst.id);
              return (
                <label
                  key={inst.id}
                  className={cn(
                    'flex items-center gap-3 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors',
                    checked ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/40',
                    disabled && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={() => toggleInstitution(inst.id)}
                  />
                  <span className="leading-tight">{inst.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Step 2 — programs + semesters per institution */}
      {selectedInstitutions.length > 0 ? (
        <div>
          <p className="text-sm font-medium flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-muted-foreground" />
            Programs &amp; semesters per institution
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Pick any number of programs and semesters for each institution. Leave programs empty for all
            programs, and semesters empty for all semesters. Only matching learners are notified.
          </p>

          <div className="space-y-3">
            {selectedInstitutions.map((instId) => {
              const options = semData?.institutions[instId] ?? [];
              const chosen = ordersFor(instId);
              const progOptions = programsByInst.get(instId) ?? [];
              const chosenPrograms = programsFor(instId);
              const chosenProgramCount = progOptions.filter((o) => o.ids.some((id) => chosenPrograms.includes(id))).length;
              return (
                <div key={instId} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{nameOf.get(instId) ?? instId}</p>
                      <p className="text-xs text-muted-foreground">
                        {chosenProgramCount === 0 ? 'All programs' : `${chosenProgramCount} program${chosenProgramCount === 1 ? '' : 's'}`}
                        {' · '}
                        {chosen.length === 0
                          ? 'All semesters'
                          : `Semester ${chosen.join(', ')}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {chosen.length > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={disabled}
                          onClick={() => setOrders(instId, [])}
                        >
                          Clear
                        </Button>
                      ) : null}
                      {selectedInstitutions.length > 1 && chosen.length > 0 ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={disabled}
                          onClick={() => applyToAll(instId)}
                        >
                          Apply to all
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {/* Programs */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <p className="text-xs font-medium flex items-center gap-1.5">
                        <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" /> Programs
                      </p>
                      {chosenPrograms.length > 0 ? (
                        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setPrograms(instId, [])}>
                          Clear
                        </Button>
                      ) : null}
                    </div>
                    {progLoading ? (
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <Skeleton key={i} className="h-8 w-32 rounded-full" />
                        ))}
                      </div>
                    ) : progIsError ? (
                      <p className="text-xs text-destructive">Could not load programs for this institution.</p>
                    ) : progOptions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No active programs are configured for this institution — all of its learners are included.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {progOptions.map((opt) => {
                          const on = opt.ids.some((id) => chosenPrograms.includes(id));
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              disabled={disabled}
                              onClick={() => toggleProgram(instId, opt.ids)}
                              aria-pressed={on}
                              className={cn(
                                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                on
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background hover:bg-muted text-foreground',
                                disabled && 'opacity-60 cursor-not-allowed'
                              )}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <p className="text-xs font-medium mb-1.5">Semesters</p>
                  {semLoading ? (
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-24 rounded-full" />
                      ))}
                    </div>
                  ) : semIsError ? (
                    <p className="text-xs text-destructive">Could not load semesters for this institution.</p>
                  ) : options.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No semesters are configured for this institution — all of its learners will be included.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {options.map((opt) => {
                        const on = chosen.includes(opt.order);
                        return (
                          <button
                            key={opt.order}
                            type="button"
                            disabled={disabled}
                            onClick={() => toggleOrder(instId, opt.order)}
                            aria-pressed={on}
                            className={cn(
                              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                              on
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background hover:bg-muted text-foreground',
                              disabled && 'opacity-60 cursor-not-allowed'
                            )}
                            title={opt.label}
                          >
                            Sem {opt.order}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** "Institutions: 2 · Semesters: 5, 6" style one-liner for summaries. */
export function describeTargeting(
  targeting: CdcDriveInstitutionSemesters,
  institutionCount: number
): string {
  const orders = new Set<number>();
  targeting.forEach((t) => t.semester_orders.forEach((o) => orders.add(o)));
  const semText =
    orders.size === 0 ? 'all semesters' : `Semester ${Array.from(orders).sort((a, b) => a - b).join(', ')}`;
  const programRestricted = targeting.some((t) => (t.program_ids?.length ?? 0) > 0);
  return `${institutionCount} institution${institutionCount === 1 ? '' : 's'} · ${programRestricted ? 'selected programs' : 'all programs'} · ${semText}`;
}
