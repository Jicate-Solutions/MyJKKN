'use client';

// Advanced filter bar for the "All pending" approvals list.
//
// useApprovalsJobOverview() returns the whole ApprovalsJobOverviewRow[] in one
// request, and the page already searches + sorts it in memory, so this filters
// the same in-memory list — no server round-trip per filter change.
//
// The search box on the page toolbar covers title / job code / institution.
// This bar covers the job's own attributes (status, category, institution,
// type, location, age) plus the thing that actually matters to an approver:
// WHERE a job is stuck in the pipeline, which lives in the row's counts rather
// than the job record. Dropdown options are derived from the rows actually
// present, so a reviewer can never pick a value that matches nothing.

import { useMemo } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  ApprovalsJobOverviewRow,
  JobStatus,
  JobType,
  RoleCategory,
} from '@/types/hr-recruitment';
import {
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
  ROLE_CATEGORY_LABELS,
} from '@/types/hr-recruitment';

// =====================================================================================
// Filter shape
// =====================================================================================

/**
 * Where a job sits in the pipeline. Single-choice on purpose: an approver
 * triages through one lens at a time ("what needs me", then "what's stalled"),
 * and stacking these as independent toggles produces contradictory combinations.
 */
export type PipelineLens =
  | 'awaiting_me'
  | 'in_approval'
  | 'pending_screening'
  | 'shortlisted'
  | 'approved'
  | 'joined'
  | 'no_applicants';

export interface ApprovalsAdvancedFilters {
  status: JobStatus | null;
  role_category: RoleCategory | null;
  institution_id: string | null;
  job_type: JobType | null;
  state: string | null;
  city: string | null;
  pipeline: PipelineLens | null;
  /** Job created within the last N days. */
  created_within_days: number | null;
}

export const EMPTY_APPROVALS_FILTERS: ApprovalsAdvancedFilters = {
  status: null,
  role_category: null,
  institution_id: null,
  job_type: null,
  state: null,
  city: null,
  pipeline: null,
  created_within_days: null,
};

export function countActiveApprovalsFilters(
  f: ApprovalsAdvancedFilters
): number {
  return Object.values(f).filter((v) => v !== null).length;
}

// =====================================================================================
// Option metadata
// =====================================================================================

const ANY = '__any__';

const PIPELINE_LABELS: Record<PipelineLens, string> = {
  awaiting_me: 'Awaiting my decision',
  in_approval: 'Candidates in approval',
  pending_screening: 'Applications to screen',
  shortlisted: 'Has shortlisted applicants',
  approved: 'Approved, not yet joined',
  joined: 'Has joined candidates',
  no_applicants: 'No applicants yet',
};

/** Each lens as a predicate over the row's counts. */
const PIPELINE_TESTS: Record<
  PipelineLens,
  (r: ApprovalsJobOverviewRow) => boolean
> = {
  awaiting_me: (r) => r.awaiting_me > 0,
  in_approval: (r) => r.in_approval > 0,
  pending_screening: (r) => r.applications_pending > 0,
  shortlisted: (r) => r.applications_shortlisted > 0,
  approved: (r) => r.approved > 0,
  joined: (r) => r.joined > 0,
  no_applicants: (r) => r.applications_total === 0,
};

const CREATED_OPTIONS: Array<{ days: number; label: string }> = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 3 months' },
  { days: 365, label: 'Last year' },
];

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return (Date.now() - ms) / 86_400_000;
}

// =====================================================================================
// The predicate — single source of truth, shared with the page
// =====================================================================================

/** True when the row passes every active filter. Null means "All". */
export function approvalRowMatchesFilters(
  row: ApprovalsJobOverviewRow,
  f: ApprovalsAdvancedFilters
): boolean {
  const { job } = row;

  if (f.status && job.status !== f.status) return false;
  if (f.role_category && job.role_category !== f.role_category) return false;
  if (f.institution_id && job.institution_id !== f.institution_id) return false;
  if (f.job_type && job.job_type !== f.job_type) return false;
  if (f.state && job.state !== f.state) return false;
  if (f.city && job.city !== f.city) return false;

  if (f.pipeline && !PIPELINE_TESTS[f.pipeline](row)) return false;

  if (f.created_within_days !== null) {
    const age = daysSince(job.created_at);
    if (age === null || age > f.created_within_days) return false;
  }

  return true;
}

// =====================================================================================
// Active-filter chips
// =====================================================================================

export interface ActiveApprovalsChip {
  key: keyof ApprovalsAdvancedFilters;
  label: string;
}

export function describeActiveApprovalsFilters(
  f: ApprovalsAdvancedFilters,
  institutionNameById: ReadonlyMap<string, string>
): ActiveApprovalsChip[] {
  const chips: ActiveApprovalsChip[] = [];
  if (f.pipeline) {
    chips.push({ key: 'pipeline', label: PIPELINE_LABELS[f.pipeline] });
  }
  if (f.status) {
    chips.push({ key: 'status', label: JOB_STATUS_LABELS[f.status] ?? f.status });
  }
  if (f.role_category) {
    chips.push({
      key: 'role_category',
      label: ROLE_CATEGORY_LABELS[f.role_category] ?? f.role_category,
    });
  }
  if (f.institution_id) {
    chips.push({
      key: 'institution_id',
      label: institutionNameById.get(f.institution_id) ?? 'Institution',
    });
  }
  if (f.job_type) {
    chips.push({ key: 'job_type', label: JOB_TYPE_LABELS[f.job_type] ?? f.job_type });
  }
  if (f.state) chips.push({ key: 'state', label: f.state });
  if (f.city) chips.push({ key: 'city', label: f.city });
  if (f.created_within_days !== null) {
    const opt = CREATED_OPTIONS.find((o) => o.days === f.created_within_days);
    chips.push({
      key: 'created_within_days',
      label: `Created: ${opt?.label ?? `${f.created_within_days} days`}`,
    });
  }
  return chips;
}

export function clearApprovalsFilter(
  f: ApprovalsAdvancedFilters,
  key: keyof ApprovalsAdvancedFilters
): ApprovalsAdvancedFilters {
  return { ...f, [key]: EMPTY_APPROVALS_FILTERS[key] } as ApprovalsAdvancedFilters;
}

// =====================================================================================
// Panel — a responsive grid of self-labelling selects, matching the house
// filter-bar pattern (billing/schedule/_components/billing-schedule-filters).
// Each cell's "All …" option IS the label, so no separate label column is
// needed and the cells wrap onto new rows instead of overflowing sideways.
// =====================================================================================

interface Option {
  value: string;
  label: string;
}

/** Distinct, label-sorted values present in the loaded rows for one accessor. */
function distinct(
  rows: ApprovalsJobOverviewRow[],
  pick: (r: ApprovalsJobOverviewRow) => string | null | undefined,
  label: (v: string) => string
): Option[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = pick(r);
    if (v) set.add(v);
  }
  return Array.from(set)
    .map((value) => ({ value, label: label(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** One grid cell: a bare select whose "All …" entry doubles as its label. */
function FilterCell({
  allLabel,
  value,
  options,
  onChange,
}: {
  allLabel: string;
  value: string | null;
  options: Option[];
  onChange: (next: string | null) => void;
}) {
  return (
    <Select
      value={value ?? ANY}
      onValueChange={(v) => onChange(v === ANY ? null : v)}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent className="max-h-60 overflow-y-auto">
        <SelectItem value={ANY}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ApprovalsFiltersPanel({
  open,
  rows,
  institutionNameById,
  value,
  onChange,
}: {
  /** Collapsed by default; the page owns the toggle button. */
  open: boolean;
  /** The unfiltered overview rows, used to derive the option lists. */
  rows: ApprovalsJobOverviewRow[];
  institutionNameById: ReadonlyMap<string, string>;
  value: ApprovalsAdvancedFilters;
  onChange: (next: ApprovalsAdvancedFilters) => void;
}) {
  const activeCount = countActiveApprovalsFilters(value);

  const statusOptions = useMemo(
    () =>
      distinct(rows, (r) => r.job.status, (v) => JOB_STATUS_LABELS[v as JobStatus] ?? v),
    [rows]
  );
  const categoryOptions = useMemo(
    () =>
      distinct(
        rows,
        (r) => r.job.role_category,
        (v) => ROLE_CATEGORY_LABELS[v as RoleCategory] ?? v
      ),
    [rows]
  );
  const institutionOptions = useMemo(
    () =>
      distinct(
        rows,
        (r) => r.job.institution_id,
        (v) => institutionNameById.get(v) ?? 'Unknown institution'
      ),
    [rows, institutionNameById]
  );
  const jobTypeOptions = useMemo(
    () => distinct(rows, (r) => r.job.job_type, (v) => JOB_TYPE_LABELS[v as JobType] ?? v),
    [rows]
  );
  const stateOptions = useMemo(
    () => distinct(rows, (r) => r.job.state, (v) => v),
    [rows]
  );
  const cityOptions = useMemo(
    () => distinct(rows, (r) => r.job.city, (v) => v),
    [rows]
  );

  // Only offer a lens that would actually return something.
  const pipelineOptions = useMemo(
    () =>
      (Object.keys(PIPELINE_LABELS) as PipelineLens[])
        .filter((k) => rows.some(PIPELINE_TESTS[k]))
        .map((k) => ({ value: k, label: PIPELINE_LABELS[k] })),
    [rows]
  );

  if (!open) return null;

  const set = (patch: Partial<ApprovalsAdvancedFilters>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">Advanced Filters</span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_APPROVALS_FILTERS)}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {/* One responsive grid: 1 column on mobile, scaling to 4 on xl. Cells
          wrap onto new rows, so nothing overflows sideways. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* Pipeline leads — it is the primary triage control. */}
        {pipelineOptions.length > 0 && (
          <FilterCell
            allLabel="All Stages"
            value={value.pipeline}
            options={pipelineOptions}
            onChange={(v) => set({ pipeline: v as PipelineLens | null })}
          />
        )}
        {statusOptions.length > 0 && (
          <FilterCell
            allLabel="All Job Statuses"
            value={value.status}
            options={statusOptions}
            onChange={(v) => set({ status: v as JobStatus | null })}
          />
        )}
        {categoryOptions.length > 0 && (
          <FilterCell
            allLabel="All Categories"
            value={value.role_category}
            options={categoryOptions}
            onChange={(v) => set({ role_category: v as RoleCategory | null })}
          />
        )}
        {institutionOptions.length > 0 && (
          <FilterCell
            allLabel="All Institutions"
            value={value.institution_id}
            options={institutionOptions}
            onChange={(v) => set({ institution_id: v })}
          />
        )}
        {jobTypeOptions.length > 0 && (
          <FilterCell
            allLabel="All Job Types"
            value={value.job_type}
            options={jobTypeOptions}
            onChange={(v) => set({ job_type: v as JobType | null })}
          />
        )}
        {stateOptions.length > 0 && (
          <FilterCell
            allLabel="All States"
            value={value.state}
            options={stateOptions}
            onChange={(v) => set({ state: v })}
          />
        )}
        {cityOptions.length > 0 && (
          <FilterCell
            allLabel="All Cities"
            value={value.city}
            options={cityOptions}
            onChange={(v) => set({ city: v })}
          />
        )}
        <FilterCell
          allLabel="Any Time"
          value={
            value.created_within_days === null
              ? null
              : String(value.created_within_days)
          }
          options={CREATED_OPTIONS.map((o) => ({
            value: String(o.days),
            label: o.label,
          }))}
          onChange={(v) =>
            set({ created_within_days: v === null ? null : Number(v) })
          }
        />
      </div>
    </div>
  );
}

/** Removable chip row rendered under the toolbar so active filters stay visible. */
export function ActiveApprovalsFilterChips({
  value,
  institutionNameById,
  onChange,
}: {
  value: ApprovalsAdvancedFilters;
  institutionNameById: ReadonlyMap<string, string>;
  onChange: (next: ApprovalsAdvancedFilters) => void;
}) {
  const chips = describeActiveApprovalsFilters(value, institutionNameById);
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          variant="secondary"
          className="gap-1 py-1 pl-2.5 pr-1 font-normal"
        >
          {chip.label}
          <button
            type="button"
            aria-label={`Remove ${chip.label} filter`}
            onClick={() => onChange(clearApprovalsFilter(value, chip.key))}
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <button
        type="button"
        onClick={() => onChange(EMPTY_APPROVALS_FILTERS)}
        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}
