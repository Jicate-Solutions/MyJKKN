'use client';

// Advanced filter panel for the Allocation Batches list.
//
// This deliberately does NOT reuse AllocationCascadeFilters from
// ../../_components/allocation-filters: that panel reads hostel_blocks /
// hostel_rooms / learner.academic off each ALLOCATION row, and a batch row
// carries none of those — only block_name, institution_name, status and a
// category_breakdown[] of {category, floors, rooms, beds}. Same visual idiom
// (Collapsible + derived Select options), different data shape.
//
// Options derive from the loaded batches and narrow under the upstream picks,
// so a value offered by a select always yields at least one row.

import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { distinctOptions } from '@/components/campus-living/filter-panel';
import type { AllocationBatchRow, BatchCategoryBreakdown } from '@/types/allocation-batch';

export const BATCH_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending_approval: 'secondary',
  approved: 'default',
  rejected: 'destructive',
};
export const BATCH_STATUS_LABEL: Record<string, string> = {
  pending_approval: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

/** One table row: a batch paired with ONE of its room-category breakdowns. */
export interface BatchTableRow {
  key: string;
  batch: AllocationBatchRow;
  category: BatchCategoryBreakdown | null;
}

// A batch renders one row per room category its run touched (a batch with no
// breakdown renders a single em-dash row). Centralised here so the filter
// predicate and the table body can't disagree on what a "row" is.
export function explodeBatchRows(batches: AllocationBatchRow[]): BatchTableRow[] {
  return batches.flatMap((batch) => {
    const cats =
      batch.category_breakdown && batch.category_breakdown.length > 0
        ? batch.category_breakdown
        : [null];
    return cats.map((category, idx) => ({
      key: category ? `${batch.id}-${category.category}-${idx}` : batch.id,
      batch,
      category,
    }));
  });
}

export interface BatchFilterValue {
  block: string; // 'all' | a block name
  floor: string; // 'all' | a floor as a string
  roomCategory: string; // 'all' | a room category name
  status: string; // 'all' | an AllocationBatchStatus
  institutionId: string; // 'all' | an institution id
}

export const EMPTY_BATCH_FILTERS: BatchFilterValue = {
  block: 'all',
  floor: 'all',
  roomCategory: 'all',
  status: 'all',
  institutionId: 'all',
};

export function countActiveBatchFilters(v: BatchFilterValue): number {
  return Object.values(v).filter((x) => x !== 'all').length;
}

// category_breakdown.floors is a COMMA-JOINED STRING ("2, 3") built by
// fn_batch_room_category_breakdown — a category can span several floors of a
// block — so it has to be split before matching, never compared whole.
const floorsOf = (c: BatchCategoryBreakdown | null): string[] =>
  (c?.floors ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

const floorLabel = (f: string) => (f === '0' ? 'Ground floor' : `Floor ${f}`);

// Single source of truth for the predicate, so the page (which applies it) and
// the panel (which sets it) can't drift. 'all' means "Any".
export function batchRowMatchesFilters(r: BatchTableRow, v: BatchFilterValue): boolean {
  if (v.block !== 'all' && (r.batch.block_name ?? '') !== v.block) return false;
  if (v.floor !== 'all' && !floorsOf(r.category).includes(v.floor)) return false;
  if (v.roomCategory !== 'all' && (r.category?.category ?? '') !== v.roomCategory) return false;
  if (v.status !== 'all' && r.batch.status !== v.status) return false;
  if (v.institutionId !== 'all' && (r.batch.institution_id ?? '') !== v.institutionId) return false;
  return true;
}

export function BatchAdvancedFilters({
  rows,
  value,
  onChange,
  open,
  onOpenChange,
}: {
  /** ALL exploded rows, unfiltered — the option lists derive from these. */
  rows: BatchTableRow[];
  value: BatchFilterValue;
  onChange: (next: BatchFilterValue) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const blockOptions = useMemo(
    () => distinctOptions(rows, (r) => ({ value: r.batch.block_name, label: r.batch.block_name })),
    [rows]
  );

  const blockScoped = useMemo(
    () => (value.block === 'all' ? rows : rows.filter((r) => r.batch.block_name === value.block)),
    [rows, value.block]
  );

  // Floor numbers repeat across blocks (every block has a "Floor 2"), so the
  // floor select only appears once a block narrows the scope — same rule the
  // Allocations cascade uses.
  const floorOptions = useMemo(() => {
    if (value.block === 'all') return [] as string[];
    const set = new Set<string>();
    for (const r of blockScoped) floorsOf(r.category).forEach((f) => set.add(f));
    return [...set].sort((a, b) => Number(a) - Number(b));
  }, [blockScoped, value.block]);

  const floorScoped = useMemo(
    () =>
      value.floor === 'all'
        ? blockScoped
        : blockScoped.filter((r) => floorsOf(r.category).includes(value.floor)),
    [blockScoped, value.floor]
  );

  const roomCategoryOptions = useMemo(
    () =>
      distinctOptions(floorScoped, (r) => ({
        value: r.category?.category,
        label: r.category?.category,
      })),
    [floorScoped]
  );

  const statusOptions = useMemo(
    () =>
      distinctOptions(floorScoped, (r) => ({
        value: r.batch.status,
        label: BATCH_STATUS_LABEL[r.batch.status] ?? r.batch.status,
      })),
    [floorScoped]
  );

  const institutionOptions = useMemo(
    () =>
      distinctOptions(floorScoped, (r) => ({
        value: r.batch.institution_id,
        label: r.batch.institution_name,
      })),
    [floorScoped]
  );

  const activeCount = countActiveBatchFilters(value);

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <span className="flex items-center gap-2">
            Advanced Filters
            {/* A span, not <Badge> — Badge renders a <div>, which is invalid
                inside the trigger's <button>. */}
            {activeCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-secondary px-1.5 text-xs font-semibold text-secondary-foreground">
                {activeCount}
              </span>
            )}
          </span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {blockOptions.length > 0 && (
            <Select
              value={value.block}
              // Floor and room-category options are scoped under the block, so
              // switching it invalidates the current picks — clear them here.
              onValueChange={(v) =>
                onChange({ ...value, block: v, floor: 'all', roomCategory: 'all' })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All Blocks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Blocks</SelectItem>
                {blockOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {value.block !== 'all' && floorOptions.length > 0 && (
            <Select
              value={value.floor}
              onValueChange={(v) => onChange({ ...value, floor: v, roomCategory: 'all' })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Floors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Floors</SelectItem>
                {floorOptions.map((f) => (
                  <SelectItem key={f} value={f}>
                    {floorLabel(f)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {roomCategoryOptions.length > 0 && (
            <Select
              value={value.roomCategory}
              onValueChange={(v) => onChange({ ...value, roomCategory: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Room Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Room Categories</SelectItem>
                {roomCategoryOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {statusOptions.length > 0 && (
            <Select value={value.status} onValueChange={(v) => onChange({ ...value, status: v })}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statusOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {institutionOptions.length > 0 && (
            <Select
              value={value.institutionId}
              onValueChange={(v) => onChange({ ...value, institutionId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Institutions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Institutions</SelectItem>
                {institutionOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onChange(EMPTY_BATCH_FILTERS)}>
            <RotateCcw className="mr-2 h-4 w-4" /> Clear All Filters
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
