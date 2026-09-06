'use client';

/**
 * Filter bar for the payroll-organisation directory.
 *
 * All four filters are applied IN MEMORY by the data-table wrapper, not pushed
 * to Postgres. hr_staff_payroll_directory() takes no arguments and returns ~744
 * rows for the whole group, so adding parameters to a SECURITY DEFINER function
 * — and re-granting it — buys nothing a client-side predicate does not already
 * give at this size.
 *
 * Options are derived from the rows the directory actually returned rather than
 * from the institutions/designations catalogues, so a filter never offers a
 * value that matches zero rows.
 *
 * State lives in the page's React state, NOT in searchParams — the DataTable
 * already owns page/pageSize/search/sort in the query string, and a second
 * writer there is how cascade filters end up clobbering each other with
 * competing router.replace calls.
 */

import { useState } from 'react';
import { Check, ChevronsUpDown, RotateCcw } from 'lucide-react';

import type { StaffPayerRow } from '@/lib/services/hr/payroll/staff-payroll-service';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** 'awaiting' = no payer recorded; 'recorded' = has one. */
export type PayerStatus = 'all' | 'awaiting' | 'recorded';

export interface PayerDirectoryFilterState {
  payerStatus: PayerStatus;
  /** '' = every work location. */
  worksAtId: string;
  /**
   * '' = every payer. '__none__' is NOT used here — "no payer" is expressed by
   * payerStatus='awaiting', so the two controls never contradict each other.
   */
  payerOrgId: string;
  /** Normalised role key ('' = every role). See normaliseRole. */
  roleKey: string;
}

export const DEFAULT_PAYER_DIRECTORY_FILTERS: PayerDirectoryFilterState = {
  payerStatus: 'all',
  worksAtId: '',
  payerOrgId: '',
  roleKey: '',
};

/**
 * Live data carries the same title under several spellings — "Bus Cleaner"
 * and "Bus cleaner", "Main Gate Security" with and without a trailing space.
 * Collapsing on a trimmed, lower-cased key keeps those as ONE option instead of
 * offering the user two identical-looking rows that each match half the people.
 */
export function normaliseRole(title: string | null | undefined): string {
  return (title ?? '').trim().toLowerCase();
}

/**
 * ONE ROW CAN HOLD SEVERAL ROLES. role_title is the staff member's Role
 * Management assignments comma-joined ("Facilitator, HOD"), and 215 of 614
 * rows carry more than one. Keying the filter on the whole string would make
 * "Facilitator" match only people who are ONLY a facilitator — so both the
 * option list and the match test work per individual role.
 */
export function splitRoles(title: string | null | undefined): string[] {
  return (title ?? '')
    .split(',')
    .map((part) => normaliseRole(part))
    .filter(Boolean);
}

export function countActiveDirectoryFilters(
  f: PayerDirectoryFilterState
): number {
  return (
    (f.payerStatus !== 'all' ? 1 : 0) +
    (f.worksAtId ? 1 : 0) +
    (f.payerOrgId ? 1 : 0) +
    (f.roleKey ? 1 : 0)
  );
}

/** Which dropdown a count is being computed for. See matchesDirectoryFilters. */
export type DirectoryFacet = 'worksAt' | 'payer' | 'role';

/**
 * Does this row survive the filter bar? The filters are ANDed.
 *
 * `except` omits ONE filter, which is how each dropdown counts its own options:
 * a facet must be counted against the OTHER filters and never against itself,
 * or every option except the selected one would read 0.
 *
 * This is the SINGLE definition of "matches". The counts in the dropdowns and
 * the rows in the table both go through it — they used to carry separate
 * copies, and the divergence was the bug: the "Works at" option advertised
 * "JKKN Main Office (104)" from the unfiltered array while the table applied
 * the conjunction and found nobody. Main Office runs no payroll
 * (is_payroll_entity = false), so every one of its people has a NULL payer;
 * combining it with any payer filter is empty by construction, and only for
 * that one institution.
 */
export function matchesDirectoryFilters(
  r: StaffPayerRow,
  f: PayerDirectoryFilterState,
  except?: DirectoryFacet
): boolean {
  const hasPayer = !!r.payer_org_id;
  if (f.payerStatus === 'awaiting' && hasPayer) return false;
  if (f.payerStatus === 'recorded' && !hasPayer) return false;
  if (except !== 'worksAt' && f.worksAtId && r.works_at_id !== f.worksAtId) {
    return false;
  }
  if (except !== 'payer' && f.payerOrgId && r.payer_org_id !== f.payerOrgId) {
    return false;
  }
  if (except !== 'role' && f.roleKey && !splitRoles(r.role_title).includes(f.roleKey)) {
    return false;
  }
  return true;
}

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

interface PayerDirectoryFiltersProps {
  filters: PayerDirectoryFilterState;
  onChange: (patch: Partial<PayerDirectoryFilterState>) => void;
  onReset: () => void;
  worksAtOptions: FilterOption[];
  payerOptions: FilterOption[];
  roleOptions: FilterOption[];
  disabled?: boolean;
}

/** Role has ~40 options on live data — a plain Select is unusable at that size. */
function RoleCombobox({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: FilterOption[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          role='combobox'
          aria-expanded={open}
          disabled={disabled}
          className='h-8 w-full justify-between font-normal sm:w-52'
        >
          <span className='truncate'>
            {selected ? selected.label : 'All roles'}
          </span>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[--radix-popover-trigger-width] p-0' align='start'>
        <Command>
          <CommandInput placeholder='Search role…' className='h-9' />
          <CommandList>
            <CommandEmpty>No role matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value='All roles'
                onSelect={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === '' ? 'opacity-100' : 'opacity-0'
                  )}
                />
                All roles
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  // cmdk filters on this string, so it must be the human label,
                  // not the normalised key the value carries.
                  value={o.label}
                  onSelect={() => {
                    onChange(o.value === value ? '' : o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === o.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className='truncate'>{o.label}</span>
                  <span className='ml-auto pl-2 text-xs text-muted-foreground'>
                    {o.count}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Radix Select has no empty-string item, so '' travels as a sentinel. */
const ALL = '__all__';

function OptionSelect({
  label,
  placeholder,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: FilterOption[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className='space-y-1.5'>
      <Label className='text-xs font-normal text-muted-foreground'>{label}</Label>
      <Select
        value={value || ALL}
        onValueChange={(v) => onChange(v === ALL ? '' : v)}
        disabled={disabled}
      >
        <SelectTrigger className='h-8 w-full sm:w-52'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label} ({o.count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function PayerDirectoryFilters({
  filters,
  onChange,
  onReset,
  worksAtOptions,
  payerOptions,
  roleOptions,
  disabled,
}: PayerDirectoryFiltersProps) {
  const activeCount = countActiveDirectoryFilters(filters);

  return (
    <div className='flex flex-wrap items-end gap-3'>
      <div className='space-y-1.5'>
        <Label className='text-xs font-normal text-muted-foreground'>
          Payer status
        </Label>
        <Select
          value={filters.payerStatus}
          onValueChange={(v) => {
            const next = v as PayerStatus;
            // Selecting "Awaiting" while a payer organisation is chosen would
            // ask for rows that are simultaneously assigned and unassigned —
            // always empty. Clear the contradicting filter instead of showing
            // a blank table with no clue why.
            onChange(
              next === 'awaiting'
                ? { payerStatus: next, payerOrgId: '' }
                : { payerStatus: next }
            );
          }}
          disabled={disabled}
        >
          <SelectTrigger className='h-8 w-full sm:w-44'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>Everyone</SelectItem>
            <SelectItem value='awaiting'>Awaiting a payer</SelectItem>
            <SelectItem value='recorded'>Payer recorded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <OptionSelect
        label='Works at'
        placeholder='All work locations'
        value={filters.worksAtId}
        options={worksAtOptions}
        onChange={(v) => onChange({ worksAtId: v })}
        disabled={disabled}
      />

      <OptionSelect
        label='Paid by'
        placeholder='All payers'
        value={filters.payerOrgId}
        options={payerOptions}
        onChange={(v) =>
          // Choosing a payer implies "recorded"; leaving status on "awaiting"
          // would contradict it.
          onChange(
            v && filters.payerStatus === 'awaiting'
              ? { payerOrgId: v, payerStatus: 'all' }
              : { payerOrgId: v }
          )
        }
        disabled={disabled}
      />

      <div className='space-y-1.5'>
        <Label className='text-xs font-normal text-muted-foreground'>Role</Label>
        <RoleCombobox
          value={filters.roleKey}
          options={roleOptions}
          onChange={(v) => onChange({ roleKey: v })}
          disabled={disabled}
        />
      </div>

      {activeCount > 0 && (
        <div className='flex items-center gap-2'>
          <Badge variant='secondary' className='h-6'>
            {activeCount} filter{activeCount === 1 ? '' : 's'}
          </Badge>
          <Button variant='ghost' size='sm' className='h-8' onClick={onReset}>
            <RotateCcw className='mr-2 h-3.5 w-3.5' />
            Reset
          </Button>
        </div>
      )}
    </div>
  );
}
