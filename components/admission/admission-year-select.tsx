'use client';

// components/admission/admission-year-select.tsx
//
// Shared admission-year picker for ANY surface that needs to attach a learner
// (or lead, or seat allocation) to a specific (institution, cohort) pair.
// Handles the three placeholder states symmetrically:
//   1. no institution selected
//   2. loading
//   3. no admission_years exist for the institution
//
// Extracted 2026-04-23 from 3 copy-pasted call sites:
//   - admission/leads/new/page.tsx:929-960
//   - admission/leads/[id]/page.tsx:2978-3010
//   - learners/enquiries/_components/form-sections/course-selection.tsx (PR-3)
//
// Why a shared component (not just the hook): the placeholder copy and the
// label rendering were identical across sites. Centralizing here means one
// place to fix UX copy or add the inline "+ Create new admission year"
// affordance later.

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAdmissionYears,
  type AdmissionYearOption,
} from '@/hooks/use-admission-years';

export interface AdmissionYearSelectProps {
  /** Institution scope. Required — null/empty disables the field. */
  institutionId: string | null | undefined;
  /** Currently selected admission_year UUID (or empty string for "none"). */
  value: string | null | undefined;
  /**
   * Called when the user picks a different admission year. Receives both the
   * new FK id and the full row — callers that also need to sync derived
   * fields (e.g. the legacy `admission_year` integer = year) can read them
   * off the row without re-querying.
   */
  onChange: (admissionYearId: string, row?: AdmissionYearOption) => void;
  /** Force-disable regardless of state (e.g. read-only post-admit). */
  disabled?: boolean;
  /** Optional id for the trigger element (and matching label htmlFor). */
  id?: string;
  /** Optional label text. Set null to render without an internal label. */
  label?: string | null;
  /** Optional className passed to the wrapping div. */
  className?: string;
  /** Override placeholder when no institution is picked yet. */
  placeholderNoInstitution?: string;
}

export function AdmissionYearSelect({
  institutionId,
  value,
  onChange,
  disabled = false,
  id = 'admission_year_id',
  label = 'Admission Year',
  className,
  placeholderNoInstitution = 'Select institution first',
}: AdmissionYearSelectProps) {
  const { admissionYears, loading } = useAdmissionYears(institutionId);

  const placeholder = !institutionId
    ? placeholderNoInstitution
    : loading
    ? 'Loading...'
    : admissionYears.length === 0
    ? 'No admission years for this institution'
    : 'Select admission year';

  // Empty-string sentinel from radix Select needs to round-trip cleanly.
  const handleValueChange = (next: string) => {
    if (next === '_none') return;
    const row = admissionYears.find((y) => y.id === next);
    onChange(next, row);
  };

  return (
    <div className={className ? `space-y-2 ${className}` : 'space-y-2'}>
      {label !== null && <Label htmlFor={id}>{label}</Label>}
      <Select
        value={value || ''}
        onValueChange={handleValueChange}
        disabled={disabled || loading || !institutionId}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {admissionYears.length === 0 ? (
            <SelectItem value="_none" disabled>
              {institutionId
                ? 'No admission years for this institution'
                : 'Pick an institution first'}
            </SelectItem>
          ) : (
            admissionYears.map((y: AdmissionYearOption) => (
              <SelectItem key={y.id} value={y.id}>
                {y.admission_year_name}
                <span className="ml-2 text-xs text-muted-foreground">
                  ({y.year})
                </span>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
