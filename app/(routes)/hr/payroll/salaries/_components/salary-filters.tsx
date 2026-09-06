'use client';

/**
 * Filter bar for the salary directory.
 *
 * The predicate lives HERE and is exported, so the table and the summary cards
 * apply the same one. The payer-directory screen learned this the hard way: its
 * filter options counted against the unfiltered array while the table ANDed the
 * filters, and it advertised "JKKN Main Office (104)" above an empty table.
 *
 * Option counts are therefore FACETED — an option exists if any row carries the
 * value, but its count is measured against the OTHER active filters. A zero is
 * shown rather than hidden so a stale selection keeps a label in the trigger.
 */

import { useMemo } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StaffSalaryDirectoryRow } from '@/lib/services/hr/payroll/staff-salary-service';

export type SalaryStatusFilter =
  | 'active'
  | 'all'
  | 'awaiting'
  | 'salaried'
  | 'no_payer'
  | 'relieved';

export interface SalaryFilterState {
  status: SalaryStatusFilter;
  worksAtId: string;
  payerOrgId: string;
}

/**
 * DEFAULTS TO 'active', NOT 'all'.
 *
 * hr_staff_salary_directory() admits a row when the person is active OR still
 * carries an unsuperseded salary — `WHERE (s.is_active OR sal.id IS NOT NULL)`.
 * That OR is deliberate: a relieved employee whose salary was never closed is
 * exactly the row someone needs to find and correct, so the RPC keeps returning
 * them. But it also meant this screen opened on 616 people while HR Directory
 * and Payroll Organisation — both active-only over the same v_hr_staff — opened
 * on 594, and a headcount that disagrees with the other two HR screens reads as
 * a category leak even though every one of the 616 is already HR-included.
 *
 * So the roster is narrowed HERE rather than in the RPC. The 22 stay one click
 * away under 'relieved'; they just stop being the default population.
 */
export const DEFAULT_SALARY_FILTERS: SalaryFilterState = {
  status: 'active',
  worksAtId: 'all',
  payerOrgId: 'all',
};

/** Single source of truth for "is this row in scope", shared by table and cards. */
export function matchesSalaryFilters(
  r: StaffSalaryDirectoryRow,
  f: SalaryFilterState
): boolean {
  if (f.status === 'active' && !r.is_active) return false;
  if (f.status === 'awaiting' && (r.salary_id !== null || !r.is_active)) return false;
  if (f.status === 'salaried' && r.salary_id === null) return false;
  if (f.status === 'no_payer' && r.payer_org_id !== null) return false;
  if (f.status === 'relieved' && r.is_active) return false;
  if (f.worksAtId !== 'all' && r.works_at_id !== f.worksAtId) return false;
  // 'none' is a real choice, not a missing one — it means "no payer recorded".
  if (f.payerOrgId === 'none' && r.payer_org_id !== null) return false;
  if (f.payerOrgId !== 'all' && f.payerOrgId !== 'none' && r.payer_org_id !== f.payerOrgId) {
    return false;
  }
  return true;
}

interface Option { value: string; label: string; count: number }

function byCountThenLabel(a: Option, b: Option): number {
  return b.count - a.count || a.label.localeCompare(b.label);
}

interface Props {
  rows: StaffSalaryDirectoryRow[];
  filters: SalaryFilterState;
  onChange: (next: SalaryFilterState) => void;
}

export function SalaryFilters({ rows, filters, onChange }: Props) {
  /** Counted with THIS dimension released, so its own choice does not zero it. */
  const worksAtOptions = useMemo<Option[]>(() => {
    const scope = rows.filter((r) => matchesSalaryFilters(r, { ...filters, worksAtId: 'all' }));
    const byId = new Map<string, Option>();
    for (const r of rows) {
      if (!byId.has(r.works_at_id)) {
        byId.set(r.works_at_id, { value: r.works_at_id, label: r.works_at_name, count: 0 });
      }
    }
    for (const r of scope) {
      const o = byId.get(r.works_at_id);
      if (o) o.count += 1;
    }
    return [...byId.values()].sort(byCountThenLabel);
  }, [filters, rows]);

  const payerOptions = useMemo<Option[]>(() => {
    const scope = rows.filter((r) => matchesSalaryFilters(r, { ...filters, payerOrgId: 'all' }));
    const byId = new Map<string, Option>();
    byId.set('none', { value: 'none', label: 'No payer recorded', count: 0 });
    for (const r of rows) {
      if (r.payer_org_id && !byId.has(r.payer_org_id)) {
        byId.set(r.payer_org_id, {
          value: r.payer_org_id,
          label: r.payer_org_name ?? 'Unnamed',
          count: 0,
        });
      }
    }
    for (const r of scope) {
      const o = byId.get(r.payer_org_id ?? 'none');
      if (o) o.count += 1;
    }
    return [...byId.values()].sort(byCountThenLabel);
  }, [filters, rows]);

  const statusCounts = useMemo(() => {
    const scope = rows.filter((r) => matchesSalaryFilters(r, { ...filters, status: 'all' }));
    return {
      active: scope.filter((r) => r.is_active).length,
      all: scope.length,
      awaiting: scope.filter((r) => r.salary_id === null && r.is_active).length,
      salaried: scope.filter((r) => r.salary_id !== null).length,
      no_payer: scope.filter((r) => r.payer_org_id === null).length,
      relieved: scope.filter((r) => !r.is_active).length,
    };
  }, [filters, rows]);

  // Compared against the DEFAULTS, not against the literal 'all'. The status
  // default is 'active', so hardcoding 'all' here would show a Clear button on
  // an untouched screen and hide it once the user actually widened the scope.
  const dirty =
    filters.status !== DEFAULT_SALARY_FILTERS.status ||
    filters.worksAtId !== DEFAULT_SALARY_FILTERS.worksAtId ||
    filters.payerOrgId !== DEFAULT_SALARY_FILTERS.payerOrgId;

  return (
    <div className='mb-3 flex flex-wrap items-center gap-2'>
      <Select
        value={filters.status}
        onValueChange={(v) => onChange({ ...filters, status: v as SalaryStatusFilter })}
      >
        <SelectTrigger className='h-9 w-[210px]'>
          <SelectValue placeholder='Salary status' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='active'>Active employees ({statusCounts.active})</SelectItem>
          <SelectItem value='all'>
            Including relieved ({statusCounts.all})
          </SelectItem>
          <SelectItem value='awaiting'>Awaiting a salary ({statusCounts.awaiting})</SelectItem>
          <SelectItem value='salaried'>Salary recorded ({statusCounts.salaried})</SelectItem>
          <SelectItem value='no_payer'>No payer recorded ({statusCounts.no_payer})</SelectItem>
          <SelectItem value='relieved'>Relieved ({statusCounts.relieved})</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.worksAtId}
        onValueChange={(v) => onChange({ ...filters, worksAtId: v })}
      >
        <SelectTrigger className='h-9 w-[230px]'>
          <SelectValue placeholder='Works at' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>All work locations</SelectItem>
          {worksAtOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label} ({o.count})</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.payerOrgId}
        onValueChange={(v) => onChange({ ...filters, payerOrgId: v })}
      >
        <SelectTrigger className='h-9 w-[230px]'>
          <SelectValue placeholder='Paid by' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>All paying organisations</SelectItem>
          {payerOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label} ({o.count})</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {dirty && (
        <Button
          variant='ghost'
          size='sm'
          className='h-9'
          onClick={() => onChange(DEFAULT_SALARY_FILTERS)}
        >
          <X className='mr-1.5 h-3.5 w-3.5' />
          Clear
        </Button>
      )}
    </div>
  );
}
