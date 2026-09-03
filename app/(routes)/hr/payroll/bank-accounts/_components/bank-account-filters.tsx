'use client';

/**
 * Filter bar for the bank-account directory.
 *
 * The predicate lives HERE and is exported, so the table and the summary cards
 * apply the same one — the payer directory learned that the hard way when its
 * option counts were measured against the unfiltered array while the table
 * ANDed the filters.
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
import { isPayable } from '@/lib/hr/payroll/bank-account-validation';
import type { StaffBankDirectoryRow } from '@/lib/services/hr/payroll/staff-bank-account-service';

export type BankStatusFilter =
  | 'all' | 'missing' | 'incomplete' | 'unverified' | 'verified' | 'relieved';

export interface BankFilterState {
  status: BankStatusFilter;
  worksAtId: string;
  bankName: string;
}

export const DEFAULT_BANK_FILTERS: BankFilterState = {
  status: 'all',
  worksAtId: 'all',
  bankName: 'all',
};

export function matchesBankFilters(
  r: StaffBankDirectoryRow,
  f: BankFilterState
): boolean {
  if (f.status === 'missing' && (r.account_id !== null || !r.is_active)) return false;
  // The worklist for finishing the job: a number is on file, but no transfer
  // could route to it.
  if (f.status === 'incomplete' && (r.account_id === null || isPayable(r))) return false;
  if (f.status === 'unverified' && (r.account_id === null || r.verified_at !== null)) return false;
  if (f.status === 'verified' && r.verified_at === null) return false;
  if (f.status === 'relieved' && r.is_active) return false;
  if (f.worksAtId !== 'all' && r.works_at_id !== f.worksAtId) return false;
  if (f.bankName !== 'all' && (r.bank_name ?? '') !== f.bankName) return false;
  return true;
}

interface Option { value: string; label: string; count: number }

function byCountThenLabel(a: Option, b: Option): number {
  return b.count - a.count || a.label.localeCompare(b.label);
}

interface Props {
  rows: StaffBankDirectoryRow[];
  filters: BankFilterState;
  onChange: (next: BankFilterState) => void;
}

export function BankAccountFilters({ rows, filters, onChange }: Props) {
  /** Counted with THIS dimension released, so its own choice does not zero it. */
  const worksAtOptions = useMemo<Option[]>(() => {
    const scope = rows.filter((r) => matchesBankFilters(r, { ...filters, worksAtId: 'all' }));
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

  const bankOptions = useMemo<Option[]>(() => {
    const scope = rows.filter((r) => matchesBankFilters(r, { ...filters, bankName: 'all' }));
    const byName = new Map<string, Option>();
    for (const r of rows) {
      const n = r.bank_name;
      if (n && !byName.has(n)) byName.set(n, { value: n, label: n, count: 0 });
    }
    for (const r of scope) {
      const o = r.bank_name ? byName.get(r.bank_name) : undefined;
      if (o) o.count += 1;
    }
    return [...byName.values()].sort(byCountThenLabel);
  }, [filters, rows]);

  const statusCounts = useMemo(() => {
    const scope = rows.filter((r) => matchesBankFilters(r, { ...filters, status: 'all' }));
    return {
      all: scope.length,
      missing: scope.filter((r) => r.account_id === null && r.is_active).length,
      incomplete: scope.filter((r) => r.account_id !== null && !isPayable(r)).length,
      unverified: scope.filter((r) => r.account_id !== null && r.verified_at === null).length,
      verified: scope.filter((r) => r.verified_at !== null).length,
      relieved: scope.filter((r) => !r.is_active).length,
    };
  }, [filters, rows]);

  const dirty =
    filters.status !== 'all' || filters.worksAtId !== 'all' || filters.bankName !== 'all';

  return (
    <div className='mb-3 flex flex-wrap items-center gap-2'>
      <Select
        value={filters.status}
        onValueChange={(v) => onChange({ ...filters, status: v as BankStatusFilter })}
      >
        <SelectTrigger className='h-9 w-[220px]'>
          <SelectValue placeholder='Account state' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>All employees ({statusCounts.all})</SelectItem>
          <SelectItem value='missing'>No account on file ({statusCounts.missing})</SelectItem>
          <SelectItem value='incomplete'>
            Incomplete — no IFSC ({statusCounts.incomplete})
          </SelectItem>
          <SelectItem value='unverified'>Unverified ({statusCounts.unverified})</SelectItem>
          <SelectItem value='verified'>Verified ({statusCounts.verified})</SelectItem>
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

      {bankOptions.length > 0 && (
        <Select
          value={filters.bankName}
          onValueChange={(v) => onChange({ ...filters, bankName: v })}
        >
          <SelectTrigger className='h-9 w-[210px]'>
            <SelectValue placeholder='Bank' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All banks</SelectItem>
            {bankOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label} ({o.count})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {dirty && (
        <Button
          variant='ghost'
          size='sm'
          className='h-9'
          onClick={() => onChange(DEFAULT_BANK_FILTERS)}
        >
          <X className='mr-1.5 h-3.5 w-3.5' />
          Clear
        </Button>
      )}
    </div>
  );
}
