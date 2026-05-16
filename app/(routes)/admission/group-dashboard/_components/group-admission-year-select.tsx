'use client';

// app/(routes)/admission/group-dashboard/_components/group-admission-year-select.tsx
//
// Group-level admission-year picker for the dashboard. Lists program_start_year
// cohorts deduped across the user's accessible institutions. Default selection
// is the latest year (top of DESC list).

import { useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGroupAdmissionYears } from '@/hooks/admission/use-group-admission-years';

export interface GroupAdmissionYearSelectProps {
  /** Institution scope. undefined = all institutions the user can access. */
  institutionIds: string[] | null | undefined;
  /** Currently selected program_start_year (or null while we're choosing default). */
  value: number | null;
  /** Called with the new program_start_year. */
  onChange: (programStartYear: number) => void;
  /** Optional className for the wrapping div. */
  className?: string;
}

export function GroupAdmissionYearSelect({
  institutionIds,
  value,
  onChange,
  className,
}: GroupAdmissionYearSelectProps) {
  const { data: options = [], isLoading } = useGroupAdmissionYears(institutionIds);

  // Auto-select latest cohort once options arrive (one-shot per institutionIds change).
  useEffect(() => {
    if (value !== null) return;
    if (isLoading) return;
    if (options.length === 0) return;
    onChange(options[0].programStartYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, options.length, value]);

  const placeholder = isLoading
    ? 'Loading admission years…'
    : options.length === 0
    ? 'No admission years configured'
    : 'Select admission year';

  return (
    <div className={className}>
      <Select
        value={value !== null ? String(value) : ''}
        onValueChange={(v) => onChange(Number(v))}
        disabled={isLoading || options.length === 0}
      >
        <SelectTrigger className="w-[180px] h-9">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.programStartYear} value={String(o.programStartYear)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
