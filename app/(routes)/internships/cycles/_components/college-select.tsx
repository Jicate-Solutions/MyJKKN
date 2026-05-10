'use client';

// app/(routes)/internships/cycles/_components/college-select.tsx
// Institution (college) dropdown backed by useJkknInstitutions hook.
// Used by both the list filter chip and the create form.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useJkknInstitutions } from '@/hooks/use-jkkn-institutions';

interface CollegeSelectProps {
  value: string;
  onChange: (value: string) => void;
  /** Reserve the special "all" option (used in list filter, not in create form) */
  includeAll?: boolean;
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
  ariaLabel?: string;
}

export function CollegeSelect({
  value,
  onChange,
  includeAll = false,
  placeholder = 'Select college',
  disabled,
  triggerClassName,
  ariaLabel = 'College',
}: CollegeSelectProps) {
  // Fetch a single page large enough to cover all 8 colleges.
  const { data, isLoading } = useJkknInstitutions({ page: 1, limit: 50, isActive: true });
  const institutions = data?.data ?? [];

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || isLoading}>
      <SelectTrigger className={triggerClassName} aria-label={ariaLabel}>
        <SelectValue placeholder={isLoading ? 'Loading colleges...' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="all">All colleges</SelectItem>}
        {institutions.map((inst) => (
          <SelectItem key={inst.id} value={inst.id}>
            {inst.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Hook that returns a stable id→name map for resolving institution_id on lists.
 * Returns an empty record while loading; consumer should fall back to the raw id.
 */
export function useCollegeNameMap(): Record<string, string> {
  const { data } = useJkknInstitutions({ page: 1, limit: 50, isActive: true });
  const result: Record<string, string> = {};
  for (const inst of data?.data ?? []) {
    result[inst.id] = inst.name;
  }
  return result;
}
