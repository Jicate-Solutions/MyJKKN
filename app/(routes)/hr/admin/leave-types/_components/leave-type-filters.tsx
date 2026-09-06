'use client';

// Advanced filter bar for HR Leave Types (2026-07-23).
//
// Three filters push DOWN to Postgres via HRLeaveTypeService.list
// (hr_organization_id, is_active, request_category) — the service already
// accepts them. The remaining seven are boolean/enum columns the service does
// not filter on; they are applied in memory by the data-table wrapper, which is
// safe here because a single HR org's catalog is a handful of rows, not a
// paginated dataset.
//
// State is held by the page in plain React state rather than searchParams. The
// DataTable's own URL state already owns page/pageSize/search/sort; adding a
// second writer to the same query string is how cascade filters end up
// clobbering each other with competing router.replace calls.

import { SlidersHorizontal, RotateCcw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { LEAVE_DURATION_LABELS } from '@/types/hr';
import type { LeaveDurationType, LeaveRequestCategory } from '@/types/hr';
import {
  APPLICABLE_GENDER_LABELS,
  REQUEST_CATEGORY_LABELS,
  type LeaveApplicableGender,
} from '@/types/hr-leave-types';

/** 'all' means "don't filter on this". */
export type TriState = 'all' | 'yes' | 'no';

export interface LeaveTypeFilterState {
  /** '' = every organization the caller can see. */
  hrOrgId: string;
  requestCategory: LeaveRequestCategory | 'all';
  status: 'all' | 'active' | 'archived';
  durationType: LeaveDurationType | 'all';
  gender: LeaveApplicableGender | 'all';
  isPaid: TriState;
  carryForward: TriState;
  encashable: TriState;
  requiresApproval: TriState;
  requiresDocuments: TriState;
}

export const DEFAULT_LEAVE_TYPE_FILTERS: LeaveTypeFilterState = {
  hrOrgId: '',
  requestCategory: 'all',
  status: 'all',
  durationType: 'all',
  gender: 'all',
  isPaid: 'all',
  carryForward: 'all',
  encashable: 'all',
  requiresApproval: 'all',
  requiresDocuments: 'all',
};

/** The seven behind the "More filters" popover — drives its count badge. */
export function countAdvancedFilters(f: LeaveTypeFilterState): number {
  return [
    f.durationType,
    f.gender,
    f.isPaid,
    f.carryForward,
    f.encashable,
    f.requiresApproval,
    f.requiresDocuments,
  ].filter((v) => v !== 'all').length;
}

export function countAllFilters(f: LeaveTypeFilterState): number {
  return (
    countAdvancedFilters(f) +
    (f.hrOrgId ? 1 : 0) +
    (f.requestCategory !== 'all' ? 1 : 0) +
    (f.status !== 'all' ? 1 : 0)
  );
}

interface OrgOption {
  hr_organization_id: string;
  organization_name: string;
}

interface LeaveTypeFiltersProps {
  filters: LeaveTypeFilterState;
  onChange: (patch: Partial<LeaveTypeFilterState>) => void;
  onReset: () => void;
  organizations: OrgOption[];
}

/** Yes / No / All — five of the advanced filters share this exact shape. */
function TriStateSelect({
  label,
  value,
  onValueChange,
  yesLabel = 'Yes',
  noLabel = 'No',
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
        <SelectTrigger className="h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any</SelectItem>
          <SelectItem value="yes">{yesLabel}</SelectItem>
          <SelectItem value="no">{noLabel}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function LeaveTypeFilters({
  filters,
  onChange,
  onReset,
  organizations,
}: LeaveTypeFiltersProps) {
  const advancedCount = countAdvancedFilters(filters);
  const totalCount = countAllFilters(filters);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      {/* Organization — also decides whether "Add Leave Type" is enabled, since
          types are created per organization. */}
      <div className="w-full sm:w-64">
        <Label className="text-xs font-normal text-muted-foreground">
          Organization
        </Label>
        <Select
          value={filters.hrOrgId || 'all'}
          onValueChange={(v) => onChange({ hrOrgId: v === 'all' ? '' : v })}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="All organizations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All organizations</SelectItem>
            {organizations.map((m) => (
              <SelectItem key={m.hr_organization_id} value={m.hr_organization_id}>
                {m.organization_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-full sm:w-48">
        <Label className="text-xs font-normal text-muted-foreground">Category</Label>
        <Select
          value={filters.requestCategory}
          onValueChange={(v) =>
            onChange({ requestCategory: v as LeaveTypeFilterState['requestCategory'] })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(REQUEST_CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-full sm:w-40">
        <Label className="text-xs font-normal text-muted-foreground">Status</Label>
        <Select
          value={filters.status}
          onValueChange={(v) =>
            onChange({ status: v as LeaveTypeFilterState['status'] })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-9 justify-start">
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            More filters
            {advancedCount > 0 && (
              <Badge variant="secondary" className="ml-2 px-1.5">
                {advancedCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-3">
          <p className="text-sm font-medium">Refine by rule</p>

          <div className="space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">
              Duration type
            </Label>
            <Select
              value={filters.durationType}
              onValueChange={(v) =>
                onChange({ durationType: v as LeaveTypeFilterState['durationType'] })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any duration</SelectItem>
                {Object.entries(LEAVE_DURATION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">
              Applies to
            </Label>
            <Select
              value={filters.gender}
              onValueChange={(v) =>
                onChange({ gender: v as LeaveTypeFilterState['gender'] })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anyone</SelectItem>
                {Object.entries(APPLICABLE_GENDER_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TriStateSelect
              label="Paid"
              value={filters.isPaid}
              onValueChange={(v) => onChange({ isPaid: v })}
              yesLabel="Paid"
              noLabel="Unpaid"
            />
            <TriStateSelect
              label="Carry-forward"
              value={filters.carryForward}
              onValueChange={(v) => onChange({ carryForward: v })}
            />
            <TriStateSelect
              label="Encashable"
              value={filters.encashable}
              onValueChange={(v) => onChange({ encashable: v })}
            />
            <TriStateSelect
              label="Needs approval"
              value={filters.requiresApproval}
              onValueChange={(v) => onChange({ requiresApproval: v })}
            />
            <TriStateSelect
              label="Needs documents"
              value={filters.requiresDocuments}
              onValueChange={(v) => onChange({ requiresDocuments: v })}
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
