'use client';

// Advanced filters for the All Candidates page.
//
// Option lists are derived from the loaded rows, so a reviewer can never pick a
// value that matches nothing — the same rule as the Approvals filter panel.
// EXCEPT Department once a college is chosen: it lists every active department
// of that college (from `departments`), merged with any department the rows
// carry. Row-derived alone hid every department with no applicant yet (JKKN
// CET showed 5 of 8 — no EEE, IT or Mechanical), which read as "missing".
// Department and Job options narrow to the chosen college, and picking a
// different college clears a department/job that no longer belongs to it.

import { useMemo } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useDepartments } from '@/hooks/organization/use-departments';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
  type JobStatus,
  type JobType,
} from '@/types/hr-recruitment';
import {
  ADVANCED_KEYS,
  APPLIED_WITHIN_LABELS,
  EMPTY_FILTERS,
  EXPERIENCE_BAND_LABELS,
  SOURCE_LABELS,
  type AppliedWithin,
  type ExperienceBand,
  type PipelineFilters,
  type PipelineRow,
  type PipelineSource,
} from '../_lib/pipeline-model';

const ANY = '__any__';

interface Option { value: string; label: string }

function distinct(
  rows: PipelineRow[],
  pick: (r: PipelineRow) => string | null | undefined,
  label: (r: PipelineRow, v: string) => string,
): Option[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const v = pick(r);
    if (v && !seen.has(v)) seen.set(v, label(r, v));
  }
  return Array.from(seen, ([value, l]) => ({ value, label: l }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function FilterCell({
  allLabel, value, options, onChange,
}: {
  allLabel: string;
  value: string | null;
  options: Option[];
  onChange: (next: string | null) => void;
}) {
  return (
    <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? null : v)}>
      <SelectTrigger className="w-full" aria-label={allLabel}>
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent className="max-h-60 overflow-y-auto">
        <SelectItem value={ANY}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Every active department of one college; [] until a college is chosen. */
function useCollegeDepartments(institutionId: string | null): Option[] {
  const { data } = useDepartments({
    institution_id: institutionId ?? undefined,
    isActive: true,
    limit: 1000,
  }, { enabled: Boolean(institutionId) });
  return useMemo(
    () =>
      institutionId
        ? (data?.data ?? [])
            .filter((d) => d.institution_id === institutionId)
            .map((d) => ({ value: d.id, label: d.display_name || d.department_name }))
        : [],
    [data, institutionId],
  );
}

function ToggleCell({
  id, label, checked, onChange,
}: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex h-10 items-center justify-between gap-3 rounded-md border px-3">
      <Label htmlFor={id} className="text-sm font-normal">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function CandidatesFiltersPanel({
  open, rows, value, onChange,
}: {
  open: boolean;
  /** All loaded rows — option lists come from these. */
  rows: PipelineRow[];
  value: PipelineFilters;
  onChange: (patch: Partial<PipelineFilters>) => void;
}) {
  const inCollege = useMemo(
    () => (value.institution ? rows.filter((r) => r.institutionId === value.institution) : rows),
    [rows, value.institution],
  );

  const institutionOptions = useMemo(
    () => distinct(rows, (r) => r.institutionId, (r) => r.institutionName ?? 'Unknown college'),
    [rows],
  );
  const collegeDepartments = useCollegeDepartments(value.institution);
  const departmentOptions = useMemo(() => {
    const fromRows = distinct(inCollege, (r) => r.job?.department_id, (r) =>
      value.institution ? r.job?.department_name ?? '—' : `${r.job?.department_name ?? '—'} · ${r.institutionName ?? ''}`);
    if (!value.institution) return fromRows;
    const merged = new Map(collegeDepartments.map((o) => [o.value, o.label]));
    for (const o of fromRows) if (!merged.has(o.value)) merged.set(o.value, o.label);
    return Array.from(merged, ([v, l]) => ({ value: v, label: l }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [inCollege, value.institution, collegeDepartments]);
  const jobOptions = useMemo(
    () => distinct(inCollege, (r) => r.job?.id, (r) =>
      [r.job?.title, r.job?.job_code, value.institution ? null : r.institutionName].filter(Boolean).join(' · ')),
    [inCollege, value.institution],
  );
  const jobTypeOptions = useMemo(
    () => distinct(rows, (r) => r.job?.job_type, (_r, v) => JOB_TYPE_LABELS[v as JobType] ?? v),
    [rows],
  );
  const jobStatusOptions = useMemo(
    () => distinct(rows, (r) => r.job?.status, (_r, v) => JOB_STATUS_LABELS[v as JobStatus] ?? v),
    [rows],
  );
  const sourceOptions = useMemo(
    () => distinct(rows, (r) => r.source, (_r, v) => SOURCE_LABELS[v as PipelineSource]),
    [rows],
  );
  const cityOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const r of rows) {
      for (const c of r.workedCities) {
        const label = c.trim();
        if (label && !byKey.has(label.toLowerCase())) byKey.set(label.toLowerCase(), label);
      }
    }
    return Array.from(byKey.values()).sort().map((c) => ({ value: c, label: c }));
  }, [rows]);

  if (!open) return null;

  const activeCount = ADVANCED_KEYS.filter((k) => value[k] !== EMPTY_FILTERS[k]).length;
  const clearAll = () =>
    onChange(Object.fromEntries(ADVANCED_KEYS.map((k) => [k, EMPTY_FILTERS[k]])) as Partial<PipelineFilters>);

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">Advanced Filters</span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="space-y-4">
        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Job</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <FilterCell
              allLabel="All Colleges"
              value={value.institution}
              options={institutionOptions}
              onChange={(v) => onChange({ institution: v, department: null, job: null })}
            />
            <FilterCell
              allLabel="All Departments"
              value={value.department}
              options={departmentOptions}
              onChange={(v) => onChange({ department: v })}
            />
            <SearchableSelect
              value={value.job ?? ANY}
              onValueChange={(v) => onChange({ job: !v || v === ANY ? null : v })}
              options={[{ value: ANY, label: 'All Jobs' }, ...jobOptions]}
              placeholder="All Jobs"
              searchPlaceholder="Search jobs…"
              className="w-full"
            />
            <FilterCell
              allLabel="All Job Types"
              value={value.jobType}
              options={jobTypeOptions}
              onChange={(v) => onChange({ jobType: v as JobType | null })}
            />
            <FilterCell
              allLabel="All Job Statuses"
              value={value.jobStatus}
              options={jobStatusOptions}
              onChange={(v) => onChange({ jobStatus: v as JobStatus | null })}
            />
          </div>
        </section>

        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Applicant</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterCell
              allLabel="All Sources"
              value={value.source}
              options={sourceOptions}
              onChange={(v) => onChange({ source: v as PipelineSource | null })}
            />
            <FilterCell
              allLabel="Any Experience"
              value={value.experience}
              options={(Object.keys(EXPERIENCE_BAND_LABELS) as ExperienceBand[])
                .map((k) => ({ value: k, label: EXPERIENCE_BAND_LABELS[k] }))}
              onChange={(v) => onChange({ experience: v as ExperienceBand | null })}
            />
            <FilterCell
              allLabel="Applied Any Time"
              value={value.applied}
              options={(Object.keys(APPLIED_WITHIN_LABELS) as AppliedWithin[])
                .map((k) => ({ value: k, label: APPLIED_WITHIN_LABELS[k] }))}
              onChange={(v) => onChange({ applied: v as AppliedWithin | null, from: null, to: null })}
            />
            <FilterCell
              allLabel="Any City Worked"
              value={value.city}
              options={cityOptions}
              onChange={(v) => onChange({ city: v })}
            />
            {value.applied === 'custom' && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="applied-from" className="text-xs text-muted-foreground">Applied from</Label>
                  <Input
                    id="applied-from"
                    type="date"
                    value={value.from ?? ''}
                    max={value.to ?? undefined}
                    onChange={(e) => onChange({ from: e.target.value || null })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="applied-to" className="text-xs text-muted-foreground">Applied to</Label>
                  <Input
                    id="applied-to"
                    type="date"
                    value={value.to ?? ''}
                    min={value.from ?? undefined}
                    onChange={(e) => onChange({ to: e.target.value || null })}
                  />
                </div>
              </>
            )}
          </div>
        </section>

        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pipeline</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ToggleCell
              id="f-resume"
              label="Has résumé"
              checked={value.hasResume}
              onChange={(v) => onChange({ hasResume: v })}
            />
            <ToggleCell
              id="f-emergency"
              label="Emergency only"
              checked={value.emergency}
              onChange={(v) => onChange({ emergency: v })}
            />
            <ToggleCell
              id="f-multi"
              label="Applied to more than one job"
              checked={value.multiJob}
              onChange={(v) => onChange({ multiJob: v })}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

/** Removable chips for every active advanced filter, shown under the toolbar. */
export function ActiveFilterChips({
  rows, value, onChange,
}: {
  rows: PipelineRow[];
  value: PipelineFilters;
  onChange: (patch: Partial<PipelineFilters>) => void;
}) {
  const collegeDepartments = useCollegeDepartments(value.institution);
  const chips: { label: string; clear: Partial<PipelineFilters> }[] = [];
  const any = (pick: (r: PipelineRow) => boolean) => rows.find(pick);

  if (value.institution) {
    chips.push({
      label: any((r) => r.institutionId === value.institution)?.institutionName ?? 'College',
      clear: { institution: null, department: null, job: null },
    });
  }
  if (value.department) {
    chips.push({
      label:
        any((r) => r.job?.department_id === value.department)?.job?.department_name ??
        collegeDepartments.find((o) => o.value === value.department)?.label ??
        'Department',
      clear: { department: null },
    });
  }
  if (value.job) {
    chips.push({ label: any((r) => r.job?.id === value.job)?.job?.title ?? 'Job', clear: { job: null } });
  }
  if (value.jobType) chips.push({ label: JOB_TYPE_LABELS[value.jobType], clear: { jobType: null } });
  if (value.jobStatus) chips.push({ label: `Job: ${JOB_STATUS_LABELS[value.jobStatus]}`, clear: { jobStatus: null } });
  if (value.source) chips.push({ label: SOURCE_LABELS[value.source], clear: { source: null } });
  if (value.experience) chips.push({ label: EXPERIENCE_BAND_LABELS[value.experience], clear: { experience: null } });
  if (value.applied) {
    const label = value.applied === 'custom'
      ? `Applied ${value.from ?? '…'} – ${value.to ?? '…'}`
      : `Applied: ${APPLIED_WITHIN_LABELS[value.applied]}`;
    chips.push({ label, clear: { applied: null, from: null, to: null } });
  }
  if (value.city) chips.push({ label: `Worked in ${value.city}`, clear: { city: null } });
  if (value.hasResume) chips.push({ label: 'Has résumé', clear: { hasResume: false } });
  if (value.emergency) chips.push({ label: 'Emergency', clear: { emergency: false } });
  if (value.multiJob) chips.push({ label: 'Multiple jobs', clear: { multiJob: false } });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Badge key={chip.label} variant="secondary" className="gap-1 py-1 pl-2.5 pr-1 font-normal">
          {chip.label}
          <button
            type="button"
            aria-label={`Remove ${chip.label} filter`}
            onClick={() => onChange(chip.clear)}
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange(Object.fromEntries(ADVANCED_KEYS.map((k) => [k, EMPTY_FILTERS[k]])) as Partial<PipelineFilters>)}
        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}
