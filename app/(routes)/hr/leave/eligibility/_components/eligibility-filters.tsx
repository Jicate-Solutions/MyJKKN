'use client';

// Advanced filter bar for the "Granted & decided" eligibility table.
//
// Same shape as the HR Leave Types filter bar: state lives on the PAGE in plain
// React state, not in searchParams. The DataTable's own URL state already owns
// page / pageSize / search / sort, and a second writer to the same query string
// is how competing router.replace calls clobber each other.
//
// Every filter is applied in memory by the table wrapper. That is deliberate:
// the list is the eligibility register of the organisations the caller may read
// (a few dozen rows today, capped at 1000 by the service), already held by React
// Query, so there is nothing to gain from re-querying the server per filter.

import { RotateCcw, SlidersHorizontal } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { LEAVE_ELIGIBILITY_STATUS_LABELS, type LeaveEligibilityStatus } from '@/types/hr-leave-types';

/** 'all' means "do not filter on this". */
export type TriState = 'all' | 'yes' | 'no';

/**
 * 'decided' is the page's historical view — approved, rejected and revoked, i.e.
 * everything except what is still waiting (that lives in "Waiting on you"). It is
 * the default so the table opens as it always did; 'all' adds the pending ones.
 */
export type StatusFilter = 'decided' | 'all' | LeaveEligibilityStatus;

export interface EligibilityFilterState {
  /** '' = every organisation the caller can read. */
  hrOrgId: string;
  status: StatusFilter;
  /** normalizeTypeName() of the leave type, or 'all'. */
  leaveType: string;
  source: 'all' | 'hr' | 'request';
  hasDocument: TriState;
  hasExpiry: TriState;
}

export const DEFAULT_ELIGIBILITY_FILTERS: EligibilityFilterState = {
  hrOrgId: '',
  status: 'decided',
  leaveType: 'all',
  source: 'all',
  hasDocument: 'all',
  hasExpiry: 'all',
};

/** The three behind "More filters" — drives its count badge. */
export function countAdvancedFilters(f: EligibilityFilterState): number {
  return [f.source, f.hasDocument, f.hasExpiry].filter((v) => v !== 'all').length;
}

/** Everything that differs from the opening state, so Reset only shows when it has work to do. */
export function countAllFilters(f: EligibilityFilterState): number {
  return (
    countAdvancedFilters(f) +
    (f.hrOrgId ? 1 : 0) +
    (f.status !== DEFAULT_ELIGIBILITY_FILTERS.status ? 1 : 0) +
    (f.leaveType !== 'all' ? 1 : 0)
  );
}

interface Props {
  filters: EligibilityFilterState;
  onChange: (patch: Partial<EligibilityFilterState>) => void;
  onReset: () => void;
  organizations: Array<{ id: string; name: string }>;
  leaveTypes: Array<{ key: string; label: string }>;
}

function TriStateSelect({
  label, value, onValueChange, yesLabel = 'Yes', noLabel = 'No',
}: {
  label: string;
  value: TriState;
  onValueChange: (v: TriState) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={(v) => onValueChange(v as TriState)}>
        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any</SelectItem>
          <SelectItem value="yes">{yesLabel}</SelectItem>
          <SelectItem value="no">{noLabel}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function EligibilityFilters({
  filters, onChange, onReset, organizations, leaveTypes,
}: Props) {
  const advancedCount = countAdvancedFilters(filters);
  const totalCount = countAllFilters(filters);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      {/* Only offered when the list actually spans more than one organisation. */}
      {organizations.length > 1 && (
        <div className="w-full sm:w-64">
          <Label className="text-xs font-normal text-muted-foreground">Institution</Label>
          <Select
            value={filters.hrOrgId || 'all'}
            onValueChange={(v) => onChange({ hrOrgId: v === 'all' ? '' : v })}
          >
            <SelectTrigger className="h-9"><SelectValue placeholder="All institutions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All institutions</SelectItem>
              {organizations.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="w-full sm:w-48">
        <Label className="text-xs font-normal text-muted-foreground">Status</Label>
        <Select
          value={filters.status}
          onValueChange={(v) => onChange({ status: v as StatusFilter })}
        >
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="decided">Decided (not pending)</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(LEAVE_ELIGIBILITY_STATUS_LABELS) as LeaveEligibilityStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{LEAVE_ELIGIBILITY_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-full sm:w-52">
        <Label className="text-xs font-normal text-muted-foreground">Leave type</Label>
        <Select
          value={filters.leaveType}
          onValueChange={(v) => onChange({ leaveType: v })}
        >
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All leave types</SelectItem>
            {leaveTypes.map((t) => (
              <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-9 justify-start">
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            More filters
            {advancedCount > 0 && (
              <Badge variant="secondary" className="ml-2 px-1.5">{advancedCount}</Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-3">
          <p className="text-sm font-medium">Refine</p>

          <div className="space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">How it was raised</Label>
            <Select
              value={filters.source}
              onValueChange={(v) => onChange({ source: v as EligibilityFilterState['source'] })}
            >
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="request">Requested by the team member</SelectItem>
                <SelectItem value="hr">Granted directly by HR</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TriStateSelect
              label="Has a document"
              value={filters.hasDocument}
              onValueChange={(v) => onChange({ hasDocument: v })}
            />
            <TriStateSelect
              label="Has an expiry"
              value={filters.hasExpiry}
              onValueChange={(v) => onChange({ hasExpiry: v })}
              yesLabel="Expires"
              noLabel="No expiry"
            />
          </div>
        </PopoverContent>
      </Popover>

      {totalCount > 0 && (
        <Button variant="ghost" className="h-9" onClick={onReset}>
          Reset
          <RotateCcw className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
