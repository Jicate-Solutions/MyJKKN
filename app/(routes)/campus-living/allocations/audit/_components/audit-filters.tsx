'use client';

// Audit-specific advanced filters — the dimensions that only exist because a
// row has been JUDGED: which year it was judged against, what the fee band and
// room rule concluded, and whether an upgrade explains the room.
//
// Deliberately NOT added to ../_components/allocation-filters.tsx. That panel
// is shared verbatim with the Allocations page so the two screens can't drift;
// none of these fields exist there, and bolting them on would either break that
// page or force it to carry dead controls. Two panels, each owning its own
// concern, composed with AND.

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
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import type { AllocationAuditRow } from '@/types/campus-living-allocation-audit';
import { VERDICT_META, BAND_META, RULE_META, BILL_STATE_META, YEAR_SOURCE_META } from './audit-badges';

export interface AuditAdvancedFilters {
  /** learners_profiles.admission_year, as a string. 'all' = any. */
  admissionYear: string;
  /** The academic year the fee band was actually read from. */
  bandYear: string;
  /** Why that year — admission_year | earliest_billed | no_admission_anchor | none. */
  bandYearSource: string;
  bandVerdict: string;
  roomRule: string;
  /** 'yes' | 'no' — did the room category change since the FIRST allocation? */
  upgraded: string;
  upgradeBill: string;
  verdict: string;
}

export const EMPTY_AUDIT_FILTERS: AuditAdvancedFilters = {
  admissionYear: 'all',
  bandYear: 'all',
  bandYearSource: 'all',
  bandVerdict: 'all',
  roomRule: 'all',
  upgraded: 'all',
  upgradeBill: 'all',
  verdict: 'all',
};

export function countActiveAuditFilters(f: AuditAdvancedFilters): number {
  return Object.values(f).filter((v) => v !== 'all').length;
}

/** Single source of truth for the predicate, so the panel and the page agree. */
export function auditMatchesFilters(r: AllocationAuditRow, f: AuditAdvancedFilters): boolean {
  if (f.admissionYear !== 'all' && String(r.admission_year ?? '') !== f.admissionYear) return false;
  if (f.bandYear !== 'all' && (r.band_academic_year_name ?? '') !== f.bandYear) return false;
  if (f.bandYearSource !== 'all' && r.band_year_source !== f.bandYearSource) return false;
  if (f.bandVerdict !== 'all' && r.band_verdict !== f.bandVerdict) return false;
  if (f.roomRule !== 'all' && r.room_rule_verdict !== f.roomRule) return false;
  if (f.upgraded !== 'all' && (r.is_upgraded ? 'yes' : 'no') !== f.upgraded) return false;
  if (f.upgradeBill !== 'all' && r.upgrade_bill_state !== f.upgradeBill) return false;
  if (f.verdict !== 'all' && r.verdict !== f.verdict) return false;
  return true;
}

/** Active filters in words, for the PDF's scope block. */
export function auditFilterLabels(f: AuditAdvancedFilters): string[] {
  const out: string[] = [];
  if (f.admissionYear !== 'all') out.push(`Admitted: ${f.admissionYear}`);
  if (f.bandYear !== 'all') out.push(`Band year: ${f.bandYear}`);
  if (f.bandYearSource !== 'all')
    out.push(`Year basis: ${YEAR_SOURCE_META[f.bandYearSource as never]?.label ?? f.bandYearSource}`);
  if (f.bandVerdict !== 'all')
    out.push(`Fee band: ${BAND_META[f.bandVerdict as never]?.label ?? f.bandVerdict}`);
  if (f.roomRule !== 'all')
    out.push(`Room rule: ${RULE_META[f.roomRule as never]?.label ?? f.roomRule}`);
  if (f.upgraded !== 'all') out.push(`Room upgraded: ${f.upgraded === 'yes' ? 'Yes' : 'No'}`);
  if (f.upgradeBill !== 'all')
    out.push(`Upgrade bill: ${BILL_STATE_META[f.upgradeBill as never]?.label ?? f.upgradeBill}`);
  if (f.verdict !== 'all')
    out.push(`Verdict: ${VERDICT_META[f.verdict as never]?.label ?? f.verdict}`);
  return out;
}

/**
 * Options are derived from the LOADED ROWS, never from the enum definitions —
 * same rule the Allocations filter panel follows, so a value can never be
 * offered that matches nothing. A verdict nobody currently holds simply isn't
 * in the list.
 */
function distinct<T>(
  rows: AllocationAuditRow[],
  pick: (r: AllocationAuditRow) => T | null | undefined,
  label: (v: T) => string,
  sort?: (a: T, b: T) => number
): { value: string; label: string }[] {
  const seen = new Map<string, T>();
  for (const r of rows) {
    const v = pick(r);
    if (v === null || v === undefined || v === '') continue;
    const key = String(v);
    if (!seen.has(key)) seen.set(key, v);
  }
  const entries = [...seen.entries()];
  if (sort) entries.sort((a, b) => sort(a[1], b[1]));
  else entries.sort((a, b) => a[0].localeCompare(b[0]));
  return entries.map(([k, v]) => ({ value: k, label: label(v) }));
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  if (options.length === 0) return null;
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AuditAdvancedFilterPanel({
  rows,
  value,
  onChange,
  open,
  onOpenChange,
}: {
  rows: AllocationAuditRow[];
  value: AuditAdvancedFilters;
  onChange: (next: AuditAdvancedFilters) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const admissionYears = useMemo(
    // Newest cohort first — the recent intake is what an operator checks after
    // a fresh allocation run.
    () => distinct(rows, (r) => r.admission_year, (v) => String(v), (a, b) => Number(b) - Number(a)),
    [rows]
  );
  const bandYears = useMemo(
    () =>
      distinct(rows, (r) => r.band_academic_year_name, (v) => v, (a, b) =>
        String(b).localeCompare(String(a))
      ),
    [rows]
  );
  const bandYearSources = useMemo(
    () => distinct(rows, (r) => r.band_year_source, (v) => YEAR_SOURCE_META[v]?.label ?? String(v)),
    [rows]
  );
  const bandVerdicts = useMemo(
    () => distinct(rows, (r) => r.band_verdict, (v) => BAND_META[v]?.label ?? String(v)),
    [rows]
  );
  const roomRules = useMemo(
    () => distinct(rows, (r) => r.room_rule_verdict, (v) => RULE_META[v]?.label ?? String(v)),
    [rows]
  );
  const upgradeBills = useMemo(
    () => distinct(rows, (r) => r.upgrade_bill_state, (v) => BILL_STATE_META[v]?.label ?? String(v)),
    [rows]
  );
  const verdicts = useMemo(
    () => distinct(rows, (r) => r.verdict, (v) => VERDICT_META[v]?.label ?? String(v)),
    [rows]
  );
  const upgradedOptions = useMemo(
    () =>
      distinct(
        rows,
        (r) => (r.is_upgraded ? 'yes' : 'no'),
        (v) => (v === 'yes' ? 'Upgraded since first room' : 'Never upgraded'),
        (a, b) => String(a).localeCompare(String(b))
      ),
    [rows]
  );

  const set = (patch: Partial<AuditAdvancedFilters>) => onChange({ ...value, ...patch });
  const active = countActiveAuditFilters(value);

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <span className="flex items-center gap-2">
            Audit Filters
            {active > 0 && (
              <Badge variant="secondary" className="text-xs">
                {active}
              </Badge>
            )}
          </span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            label="Admitted year"
            allLabel="All admitted years"
            value={value.admissionYear}
            onChange={(v) => set({ admissionYear: v })}
            options={admissionYears}
          />
          <FilterSelect
            label="Fee band read from"
            allLabel="All band years"
            value={value.bandYear}
            onChange={(v) => set({ bandYear: v })}
            options={bandYears}
          />
          <FilterSelect
            label="Year basis"
            allLabel="Any basis"
            value={value.bandYearSource}
            onChange={(v) => set({ bandYearSource: v })}
            options={bandYearSources}
          />
          <FilterSelect
            label="Fee band verdict"
            allLabel="Any fee band"
            value={value.bandVerdict}
            onChange={(v) => set({ bandVerdict: v })}
            options={bandVerdicts}
          />
          <FilterSelect
            label="Room upgraded"
            allLabel="Upgraded or not"
            value={value.upgraded}
            onChange={(v) => set({ upgraded: v })}
            options={upgradedOptions}
          />
          <FilterSelect
            label="Upgrade bill"
            allLabel="Any upgrade bill"
            value={value.upgradeBill}
            onChange={(v) => set({ upgradeBill: v })}
            options={upgradeBills}
          />
          <FilterSelect
            label="Room rule"
            allLabel="Any room rule"
            value={value.roomRule}
            onChange={(v) => set({ roomRule: v })}
            options={roomRules}
          />
          <FilterSelect
            label="Verdict"
            allLabel="Any verdict"
            value={value.verdict}
            onChange={(v) => set({ verdict: v })}
            options={verdicts}
          />
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onChange(EMPTY_AUDIT_FILTERS)}>
            <RotateCcw className="mr-2 h-4 w-4" /> Clear Audit Filters
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
