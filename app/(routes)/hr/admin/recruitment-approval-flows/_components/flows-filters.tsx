'use client';

/**
 * Advanced filters for the recruitment approval workflows table.
 *
 * The filter shape, the predicate that honours it and the panel that sets it
 * all live here so they cannot drift apart. The page owns the state and applies
 * applyFlowFilters() inside its fetchData closure, ahead of the search box —
 * the whole flow list is small config data that never leaves the client.
 */

import { useMemo, useState } from 'react';
import { ChevronsUpDown, Filter, RotateCcw, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  MONTHLY_SALARY_BAND_LABELS,
  ROLE_CATEGORY_LABELS,
  type HRApprovalFlow,
  type MonthlySalaryBand,
  type RoleCategory,
} from '@/types/hr-recruitment';

const ALL = 'all';

export interface FlowFilters {
  /** Empty = every organization. */
  orgIds: string[];
  /** Empty = every role category. */
  categories: RoleCategory[];
  /** 'agnostic' = flows carrying no salary band, which is what the runtime routes on. */
  band: typeof ALL | 'agnostic' | MonthlySalaryBand;
  status: typeof ALL | 'active' | 'inactive';
  /** `role:<role_key>` or `user:<user_id>` — matched against every step. */
  approver: string;
  /** Exact step count, as a string so it can share the Select plumbing. */
  stepCount: string;
  interview: typeof ALL | 'required' | 'none';
}

export const EMPTY_FLOW_FILTERS: FlowFilters = {
  orgIds: [],
  categories: [],
  band: ALL,
  status: ALL,
  approver: ALL,
  stepCount: ALL,
  interview: ALL,
};

const conditionsOf = (f: HRApprovalFlow) =>
  (f.conditions as Record<string, string> | null) ?? {};

export function countActiveFlowFilters(f: FlowFilters): number {
  return (
    (f.orgIds.length > 0 ? 1 : 0) +
    (f.categories.length > 0 ? 1 : 0) +
    (f.band !== ALL ? 1 : 0) +
    (f.status !== ALL ? 1 : 0) +
    (f.approver !== ALL ? 1 : 0) +
    (f.stepCount !== ALL ? 1 : 0) +
    (f.interview !== ALL ? 1 : 0)
  );
}

/** Every clause is ANDed; an unset control adds no constraint. */
export function applyFlowFilters(
  rows: HRApprovalFlow[],
  f: FlowFilters,
): HRApprovalFlow[] {
  if (countActiveFlowFilters(f) === 0) return rows;

  return rows.filter((row) => {
    if (f.orgIds.length > 0 && !f.orgIds.includes(row.hr_organization_id)) {
      return false;
    }

    const cond = conditionsOf(row);

    // A condition-less legacy flow has no category, so it drops out as soon as
    // the user asks for specific ones.
    if (
      f.categories.length > 0 &&
      !f.categories.includes(cond.role_category as RoleCategory)
    ) {
      return false;
    }

    if (f.band === 'agnostic') {
      if (cond.monthly_salary_band) return false;
    } else if (f.band !== ALL && cond.monthly_salary_band !== f.band) {
      return false;
    }

    if (f.status !== ALL && row.is_active !== (f.status === 'active')) {
      return false;
    }

    const steps = row.steps ?? [];

    if (f.approver !== ALL) {
      const [kind, id] = splitApprover(f.approver);
      const hit = steps.some((s) =>
        kind === 'user'
          ? s.approver_user_id === id
          : (s.approver_role ?? '').toLowerCase() === id,
      );
      if (!hit) return false;
    }

    if (f.stepCount !== ALL && String(steps.length) !== f.stepCount) {
      return false;
    }

    if (f.interview !== ALL) {
      const anyInterview = steps.some((s) => s.interview_required);
      if (anyInterview !== (f.interview === 'required')) return false;
    }

    return true;
  });
}

/** `role:principal` -> ['role', 'principal']; the id half keeps its own casing rules. */
function splitApprover(value: string): ['role' | 'user', string] {
  const idx = value.indexOf(':');
  const kind = value.slice(0, idx) === 'user' ? 'user' : 'role';
  return [kind, value.slice(idx + 1)];
}

interface Option {
  value: string;
  label: string;
}

/**
 * Checkbox list in a popover — the same idiom as the organization picker in
 * flow-editor.tsx. Two of these on one panel earn the local helper.
 */
function MultiSelect({
  options,
  selected,
  onChange,
  allLabel,
}: {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          className='h-8 w-full justify-between px-2.5 text-xs font-normal'
        >
          <span className='truncate'>
            {selected.length === 0 ? allLabel : `${selected.length} selected`}
          </span>
          <ChevronsUpDown className='ml-1 h-3.5 w-3.5 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-[280px] p-2'>
        <div className='max-h-56 space-y-0.5 overflow-y-auto'>
          {options.map((o) => (
            <label
              key={o.value}
              className='flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted'
            >
              <Checkbox
                checked={selected.includes(o.value)}
                onCheckedChange={(v) =>
                  onChange(
                    v === true
                      ? [...selected, o.value]
                      : selected.filter((x) => x !== o.value),
                  )
                }
              />
              <span className='truncate'>{o.label}</span>
            </label>
          ))}
        </div>
        {selected.length > 0 && (
          <Button
            variant='ghost'
            size='sm'
            className='mt-1 h-7 w-full text-xs'
            onClick={() => onChange([])}
          >
            Clear selection
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface FlowsFiltersProps {
  filters: FlowFilters;
  onChange: (next: FlowFilters) => void;
  orgs: Array<{ id: string; name: string | null }>;
  /** The UNFILTERED row set — approver and step-count options are read off it. */
  rows: HRApprovalFlow[];
  roleNameByKey: ReadonlyMap<string, string>;
}

export function FlowsFilters({
  filters,
  onChange,
  orgs,
  rows,
  roleNameByKey,
}: FlowsFiltersProps) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFlowFilters(filters);

  const set = <K extends keyof FlowFilters>(key: K, value: FlowFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const orgOptions = useMemo<Option[]>(
    () => orgs.map((o) => ({ value: o.id, label: o.name ?? o.id })),
    [orgs],
  );
  const orgNameById = useMemo(
    () => new Map(orgOptions.map((o) => [o.value, o.label] as const)),
    [orgOptions],
  );

  const categoryOptions = useMemo<Option[]>(
    () =>
      (Object.keys(ROLE_CATEGORY_LABELS) as RoleCategory[]).map((c) => ({
        value: c,
        label: ROLE_CATEGORY_LABELS[c],
      })),
    [],
  );

  // Derived from the rows themselves, so every option matches at least one row.
  const approverOptions = useMemo<Option[]>(() => {
    const byValue = new Map<string, string>();
    for (const f of rows) {
      for (const s of f.steps ?? []) {
        if (s.approver_user_id) {
          byValue.set(`user:${s.approver_user_id}`, s.approver_name ?? 'Pinned person');
        } else if (s.approver_role) {
          const key = s.approver_role.toLowerCase();
          byValue.set(`role:${key}`, roleNameByKey.get(key) ?? s.approver_role);
        }
      }
    }
    return [...byValue]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, roleNameByKey]);

  const stepCountOptions = useMemo(
    () =>
      [...new Set(rows.map((f) => (f.steps ?? []).length))].sort((a, b) => a - b),
    [rows],
  );

  const bandLabel = (v: FlowFilters['band']) =>
    v === 'agnostic'
      ? 'Band-agnostic'
      : (MONTHLY_SALARY_BAND_LABELS[v as MonthlySalaryBand] ?? v);

  return (
    <div className='rounded-lg border bg-card p-2.5'>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          variant={open ? 'secondary' : 'outline'}
          size='sm'
          className='h-8 shrink-0 gap-1 px-2.5'
          onClick={() => setOpen((p) => !p)}
          aria-expanded={open}
          aria-controls='approval-flows-advanced-filters'
        >
          <Filter className='h-3.5 w-3.5' />
          <span className='text-xs'>Filters</span>
          {activeCount > 0 && (
            <span className='ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground'>
              {activeCount}
            </span>
          )}
        </Button>

        {activeCount > 0 && (
          <Button
            variant='ghost'
            size='sm'
            className='h-8 shrink-0'
            onClick={() => onChange(EMPTY_FLOW_FILTERS)}
          >
            <RotateCcw className='mr-1 h-3.5 w-3.5' />
            <span className='text-xs'>Reset</span>
          </Button>
        )}

        {activeCount > 0 && (
          <div className='flex flex-wrap items-center gap-1'>
            {filters.orgIds.map((id) => (
              <Chip
                key={id}
                label={orgNameById.get(id) ?? id}
                onRemove={() =>
                  set('orgIds', filters.orgIds.filter((x) => x !== id))
                }
              />
            ))}
            {filters.categories.map((c) => (
              <Chip
                key={c}
                label={ROLE_CATEGORY_LABELS[c] ?? c}
                onRemove={() =>
                  set('categories', filters.categories.filter((x) => x !== c))
                }
              />
            ))}
            {filters.band !== ALL && (
              <Chip label={bandLabel(filters.band)} onRemove={() => set('band', ALL)} />
            )}
            {filters.status !== ALL && (
              <Chip
                label={filters.status === 'active' ? 'Active' : 'Inactive'}
                onRemove={() => set('status', ALL)}
              />
            )}
            {filters.approver !== ALL && (
              <Chip
                label={
                  approverOptions.find((o) => o.value === filters.approver)?.label ??
                  filters.approver
                }
                onRemove={() => set('approver', ALL)}
              />
            )}
            {filters.stepCount !== ALL && (
              <Chip
                label={`${filters.stepCount} steps`}
                onRemove={() => set('stepCount', ALL)}
              />
            )}
            {filters.interview !== ALL && (
              <Chip
                label={
                  filters.interview === 'required'
                    ? 'Interview required'
                    : 'No interview'
                }
                onRemove={() => set('interview', ALL)}
              />
            )}
          </div>
        )}
      </div>

      {open && (
        <div
          id='approval-flows-advanced-filters'
          className='mt-2.5 grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4'
        >
          <div className='space-y-1'>
            <Label className='text-xs'>Organization</Label>
            <MultiSelect
              options={orgOptions}
              selected={filters.orgIds}
              onChange={(v) => set('orgIds', v)}
              allLabel='All organizations'
            />
          </div>

          <div className='space-y-1'>
            <Label className='text-xs'>Role category</Label>
            <MultiSelect
              options={categoryOptions}
              selected={filters.categories}
              onChange={(v) => set('categories', v as RoleCategory[])}
              allLabel='All categories'
            />
          </div>

          <div className='space-y-1'>
            <Label className='text-xs'>Salary band</Label>
            <Select
              value={filters.band}
              onValueChange={(v) => set('band', v as FlowFilters['band'])}
            >
              <SelectTrigger className='h-8 w-full text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any band</SelectItem>
                <SelectItem value='agnostic'>Band-agnostic (standard)</SelectItem>
                {(Object.keys(MONTHLY_SALARY_BAND_LABELS) as MonthlySalaryBand[]).map(
                  (b) => (
                    <SelectItem key={b} value={b}>
                      {MONTHLY_SALARY_BAND_LABELS[b]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1'>
            <Label className='text-xs'>Status</Label>
            <Select
              value={filters.status}
              onValueChange={(v) => set('status', v as FlowFilters['status'])}
            >
              <SelectTrigger className='h-8 w-full text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any status</SelectItem>
                <SelectItem value='active'>Active only</SelectItem>
                <SelectItem value='inactive'>Inactive only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1'>
            <Label className='text-xs'>Approver in chain</Label>
            <Select
              value={filters.approver}
              onValueChange={(v) => set('approver', v)}
            >
              <SelectTrigger className='h-8 w-full text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Anyone</SelectItem>
                {approverOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1'>
            <Label className='text-xs'>Chain length</Label>
            <Select
              value={filters.stepCount}
              onValueChange={(v) => set('stepCount', v)}
            >
              <SelectTrigger className='h-8 w-full text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any length</SelectItem>
                {stepCountOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} step{n === 1 ? '' : 's'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1'>
            <Label className='text-xs'>Interview</Label>
            <Select
              value={filters.interview}
              onValueChange={(v) => set('interview', v as FlowFilters['interview'])}
            >
              <SelectTrigger className='h-8 w-full text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Either way</SelectItem>
                <SelectItem value='required'>Interview required</SelectItem>
                <SelectItem value='none'>No interview step</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge variant='secondary' className='gap-1 pr-1 text-[10px] font-normal'>
      <span className='max-w-[160px] truncate'>{label}</span>
      <button
        type='button'
        onClick={onRemove}
        className='rounded-sm opacity-60 hover:opacity-100'
        aria-label={`Remove filter ${label}`}
      >
        <X className='h-3 w-3' />
      </button>
    </Badge>
  );
}
