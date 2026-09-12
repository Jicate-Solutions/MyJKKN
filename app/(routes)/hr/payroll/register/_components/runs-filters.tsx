'use client';

/**
 * Filters for the register index.
 *
 * `includeSuperseded` is NOT a client-side predicate — it changes what the query
 * asks for, because listRuns() filters `superseded_at IS NULL` in Postgres and
 * capping at 200 rows means the superseded ones are not in the array to filter.
 * It therefore lives here but is handed to the hook, not to matchRunFilters().
 *
 * Institution and year are ordinary client-side predicates over the array the
 * page already holds, so the counts on screen and the rows in the table cannot
 * be computed two different ways.
 */

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { HRSalaryRegisterRun } from '@/types/hr-payroll';

export interface RunFilterState {
  /** hr_organization_id, or null for every institution. */
  orgId: string | null;
  /** period_year, or null for every year. */
  year: number | null;
  /** Sent to the query, not applied to the array. See the header. */
  includeSuperseded: boolean;
}

export const DEFAULT_RUN_FILTERS: RunFilterState = {
  orgId: null,
  year: null,
  includeSuperseded: false,
};

export function matchesRunFilters(run: HRSalaryRegisterRun, f: RunFilterState): boolean {
  if (f.orgId !== null && run.hr_organization_id !== f.orgId) return false;
  if (f.year !== null && run.period_year !== f.year) return false;
  return true;
}

interface Props {
  runs: HRSalaryRegisterRun[];
  orgNameById: Map<string, string>;
  filters: RunFilterState;
  onChange: (next: RunFilterState) => void;
}

export function RunsFilters({ runs, orgNameById, filters, onChange }: Props) {
  // Only institutions that actually have a register. Offering all fourteen
  // would let someone filter to an empty table and conclude the page is broken.
  const orgIds = [...new Set(runs.map((r) => r.hr_organization_id))]
    .map((id) => ({ id, label: orgNameById.get(id) ?? id }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const years = [...new Set(runs.map((r) => r.period_year))].sort((a, b) => b - a);

  const dirty =
    filters.orgId !== null || filters.year !== null || filters.includeSuperseded;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {orgIds.length > 1 && (
        <Select
          value={filters.orgId ?? '__all__'}
          onValueChange={(v) => onChange({ ...filters, orgId: v === '__all__' ? null : v })}
        >
          <SelectTrigger className="h-9 w-[240px]">
            <SelectValue placeholder="Institution" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Every institution</SelectItem>
            {orgIds.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {years.length > 1 && (
        <Select
          value={filters.year === null ? '__all__' : String(filters.year)}
          onValueChange={(v) =>
            onChange({ ...filters, year: v === '__all__' ? null : Number(v) })
          }
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Every year</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
        <Switch
          id="include-superseded"
          checked={filters.includeSuperseded}
          onCheckedChange={(v) => onChange({ ...filters, includeSuperseded: v })}
        />
        <Label htmlFor="include-superseded" className="cursor-pointer text-sm font-normal">
          Show replaced registers
        </Label>
      </div>

      {dirty && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => onChange(DEFAULT_RUN_FILTERS)}
        >
          Reset
        </Button>
      )}
    </div>
  );
}
