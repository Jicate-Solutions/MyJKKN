'use client';

import { ChevronLeft, ChevronRight, Info, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addDays, hasFilter, type CubeFilter, type Period } from '@/lib/campus-living/attendance-cube';
import type { AttendanceBreakdown } from '@/types/campus-living/attendance-analytics';
import { formatDate } from './palette';

const ALL = '__all__';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Single day' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom range' },
];

export interface ScopeBarProps {
  today: string;
  period: Period;
  day: string;
  customFrom: string;
  customTo: string;
  range: { from: string; to: string };
  filter: CubeFilter;
  data: AttendanceBreakdown | undefined;
  onPeriod: (p: Period) => void;
  onDay: (d: string) => void;
  onCustom: (from: string, to: string) => void;
  onFilter: (f: CubeFilter) => void;
  onClear: () => void;
}

/**
 * Period + cross-filter bar. The institution / department / block pickers are the
 * keyboard-accessible twin of clicking a chart: both write the same filter, which
 * lives in the URL.
 */
export function ScopeBar(p: ScopeBarProps) {
  const isDay = p.period === 'day';
  const institutions = p.data?.institutions ?? [];
  const departments = (p.data?.departments ?? []).filter(
    (d) => !p.filter.institutionId || d.institution_id === p.filter.institutionId,
  );
  const blocks = p.data?.blocks ?? [];

  const name = {
    inst: institutions.find((i) => i.id === p.filter.institutionId)?.name,
    dept: p.data?.departments.find((d) => d.id === p.filter.departmentId)?.name,
    block: blocks.find((b) => b.id === p.filter.blockId)?.name,
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Period</Label>
              <Select value={p.period} onValueChange={(v) => p.onPeriod(v as Period)}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isDay && (
              <div className="space-y-1">
                <Label htmlFor="attendance-day" className="text-xs text-muted-foreground">
                  Date
                </Label>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous day"
                    className="shrink-0"
                    onClick={() => p.onDay(addDays(p.day, -1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Input
                    id="attendance-day"
                    type="date"
                    value={p.day}
                    max={p.today}
                    onChange={(e) => e.target.value && p.onDay(e.target.value)}
                    className="min-w-0 flex-1 sm:w-[160px] sm:flex-none"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next day"
                    className="shrink-0"
                    disabled={p.day >= p.today}
                    onClick={() => p.onDay(addDays(p.day, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {p.period === 'custom' && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="attendance-from" className="text-xs text-muted-foreground">
                    From
                  </Label>
                  <Input
                    id="attendance-from"
                    type="date"
                    value={p.customFrom}
                    max={p.customTo}
                    onChange={(e) => e.target.value && p.onCustom(e.target.value, p.customTo)}
                    className="w-full sm:w-[160px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="attendance-to" className="text-xs text-muted-foreground">
                    To
                  </Label>
                  <Input
                    id="attendance-to"
                    type="date"
                    value={p.customTo}
                    min={p.customFrom}
                    max={p.today}
                    onChange={(e) => e.target.value && p.onCustom(p.customFrom, e.target.value)}
                    className="w-full sm:w-[160px]"
                  />
                </div>
              </>
            )}
          </div>

          {/* Cross-filter row: an even three-up grid so the selects line up at every width. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:max-w-4xl">
            <FilterSelect
              label="Institution"
              value={p.filter.institutionId}
              options={institutions.map((i) => ({ value: i.id, label: i.name }))}
              onChange={(v) =>
                p.onFilter({ institutionId: v, departmentId: null, blockId: p.filter.blockId })
              }
            />
            <FilterSelect
              label="Department"
              value={p.filter.departmentId}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              onChange={(v) => {
                const inst =
                  p.data?.departments.find((d) => d.id === v)?.institution_id ?? p.filter.institutionId;
                p.onFilter({ ...p.filter, departmentId: v, institutionId: v ? inst ?? null : p.filter.institutionId });
              }}
            />
            <FilterSelect
              label="Block"
              value={p.filter.blockId}
              options={blocks.map((b) => ({ value: b.id, label: b.name }))}
              onChange={(v) => p.onFilter({ ...p.filter, blockId: v })}
            />
          </div>

          {hasFilter(p.filter) && (
            <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
              <span className="text-xs text-muted-foreground">Filtered to</span>
              {name.inst && <Chip label={name.inst} onRemove={() => p.onFilter({ ...p.filter, institutionId: null, departmentId: null })} />}
              {name.dept && <Chip label={name.dept} onRemove={() => p.onFilter({ ...p.filter, departmentId: null })} />}
              {name.block && <Chip label={name.block} onRemove={() => p.onFilter({ ...p.filter, blockId: null })} />}
              <Button variant="ghost" size="sm" onClick={p.onClear}>
                Clear all
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resident totals and the at-risk list come from allocations as they stand
          NOW; marks come from the chosen days. Say so rather than let the numbers
          quietly disagree with history. */}
      {p.range.to < p.today && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Marks are from {formatDate(p.range.from)}
            {p.range.from !== p.range.to ? ` to ${formatDate(p.range.to)}` : ''}, but resident totals,
            departments and institutions are as they stand <strong>today</strong> — anyone allocated,
            vacated or moved since then shifts those numbers.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  options: { value: string; label: string }[];
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
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

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="rounded-sm p-0.5 hover:bg-background/60"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}
