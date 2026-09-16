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

import { useMemo } from 'react';
import { Building2, CheckSquare, Square, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useCdcInstitutionSemesters } from '@/hooks/cdc/use-cdc-drives';
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
}: Props) {
  const { data: semData, isLoading: semLoading, isError: semIsError } =
    useCdcInstitutionSemesters(selectedInstitutions);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    institutions.forEach((i) => m.set(i.id, i.name));
    return m;
  }, [institutions]);

  function ordersFor(instId: string): number[] {
    return targeting.find((t) => t.institution_id === instId)?.semester_orders ?? [];
  }

  function setOrders(instId: string, orders: number[]) {
    const sorted = Array.from(new Set(orders)).sort((a, b) => a - b);
    const rest = targeting.filter((t) => t.institution_id !== instId);
    onTargetingChange([...rest, { institution_id: instId, semester_orders: sorted }]);
  }

  function toggleInstitution(id: string) {
    if (selectedInstitutions.includes(id)) {
      onSelectedInstitutionsChange(selectedInstitutions.filter((i) => i !== id));
      onTargetingChange(targeting.filter((t) => t.institution_id !== id));
    } else {
      onSelectedInstitutionsChange([...selectedInstitutions, id]);
      onTargetingChange([...targeting, { institution_id: id, semester_orders: [] }]);
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
      return { institution_id: id, semester_orders: source.filter((o) => available.has(o)) };
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

      {/* Step 2 — semesters per institution */}
      {selectedInstitutions.length > 0 ? (
        <div>
          <p className="text-sm font-medium flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-muted-foreground" />
            Semesters per institution
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Only learners in the ticked semesters are notified. Leave an institution&apos;s
            semesters empty to include all of its learners.
          </p>

          <div className="space-y-3">
            {selectedInstitutions.map((instId) => {
              const options = semData?.institutions[instId] ?? [];
              const chosen = ordersFor(instId);
              return (
                <div key={instId} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{nameOf.get(instId) ?? instId}</p>
                      <p className="text-xs text-muted-foreground">
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
  return `${institutionCount} institution${institutionCount === 1 ? '' : 's'} · ${semText}`;
}
