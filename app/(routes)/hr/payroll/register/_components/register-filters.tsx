'use client';

/**
 * Filters for the Salary Register table.
 *
 * STATUS DEFAULTS TO 'paid', so the screen opens on exactly the set the previous
 * hand-rolled table showed above its fold. Excluded people are one click away
 * rather than a second table — they work at this institution but produced no
 * payable row, and "who did we not pay, and why" has to stay answerable from the
 * screen that decided it.
 *
 * The predicate lives here beside the control, so the counts on the chips and
 * the rows in the table can never be computed two different ways.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { HRSalaryRegisterLine } from '@/types/hr-payroll';

export type RegisterStatusFilter = 'paid' | 'excluded' | 'all';

export interface RegisterFilterState {
  status: RegisterStatusFilter;
  /** hr_organizations.id of the payer, or null for every payer. */
  payerId: string | null;
}

export const DEFAULT_REGISTER_FILTERS: RegisterFilterState = {
  status: 'paid',
  payerId: null,
};

export function matchesRegisterFilters(
  line: HRSalaryRegisterLine,
  filters: RegisterFilterState
): boolean {
  if (filters.status === 'paid' && !line.is_included) return false;
  if (filters.status === 'excluded' && line.is_included) return false;
  // `?? ''` not `|| ''`: a null payer is a real category — 105 active staff have
  // no payer recorded — and it gets its own option rather than vanishing.
  if (filters.payerId !== null && (line.paid_by_organization_id ?? '') !== filters.payerId) {
    return false;
  }
  return true;
}

/** The distinct payers on this register, in name order, plus the unrecorded bucket. */
export function payerOptions(
  lines: HRSalaryRegisterLine[]
): Array<{ id: string; label: string }> {
  const byId = new Map<string, string>();
  let hasUnrecorded = false;
  for (const l of lines) {
    if (l.paid_by_organization_id) {
      byId.set(l.paid_by_organization_id, l.paid_by_name ?? l.paid_by_organization_id);
    } else {
      hasUnrecorded = true;
    }
  }
  const out = [...byId.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (hasUnrecorded) out.push({ id: '', label: 'No payer recorded' });
  return out;
}

interface Props {
  lines: HRSalaryRegisterLine[];
  filters: RegisterFilterState;
  onChange: (next: RegisterFilterState) => void;
}

export function RegisterFilters({ lines, filters, onChange }: Props) {
  const paid = lines.filter((l) => l.is_included).length;
  const excluded = lines.length - paid;
  const payers = payerOptions(lines);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={filters.status}
        onValueChange={(v) => onChange({ ...filters, status: v as RegisterStatusFilter })}
      >
        <SelectTrigger className="h-9 w-[190px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="paid">Paid ({paid})</SelectItem>
          <SelectItem value="excluded">Excluded ({excluded})</SelectItem>
          <SelectItem value="all">All ({lines.length})</SelectItem>
        </SelectContent>
      </Select>

      {/* Worth having because the register groups by WORK location: at Main
          Office every row is paid by one of five other institutions. */}
      {payers.length > 1 && (
        <Select
          // Two sentinels, both mapped back on read. Radix refuses an empty
          // string as a value, and "no payer recorded" IS the empty id — so it
          // travels as '__none__' and must be translated, or the option would
          // silently match nobody.
          value={
            filters.payerId === null
              ? '__all__'
              : filters.payerId === ''
                ? '__none__'
                : filters.payerId
          }
          onValueChange={(v) =>
            onChange({
              ...filters,
              payerId: v === '__all__' ? null : v === '__none__' ? '' : v,
            })
          }
        >
          <SelectTrigger className="h-9 w-[230px]">
            <SelectValue placeholder="Paid by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Every payer</SelectItem>
            {payers.map((p) => (
              <SelectItem key={p.id || '__none__'} value={p.id || '__none__'}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {excluded > 0 && filters.status === 'paid' && (
        <Badge
          variant="outline"
          className="border-amber-300 font-normal text-amber-700 dark:border-amber-800 dark:text-amber-400"
        >
          {excluded} excluded and hidden
        </Badge>
      )}

      {(filters.status !== 'paid' || filters.payerId !== null) && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => onChange(DEFAULT_REGISTER_FILTERS)}
        >
          Reset
        </Button>
      )}
    </div>
  );
}
