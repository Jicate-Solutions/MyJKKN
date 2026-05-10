'use client';

// app/(routes)/internships/cycles/_components/college-select.tsx
// Institution (college) dropdown backed by `useInstitutionsWithAccess`.
//
// IMPORTANT: This source is the local Supabase `public.institutions` table,
// which keys rows by UUID. The previous implementation used
// `useJkknInstitutions` (proxy to JKKN central API) — that proxy returns
// numeric `counselling_code` as `id`, which 400'd against
// `internship_*.institution_id` UUID FK columns. Reconciled 2026-05-10.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

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
  const { institutions, loading } = useInstitutionsWithAccess({ isActive: true });

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || loading}>
      <SelectTrigger className={triggerClassName} aria-label={ariaLabel}>
        <SelectValue placeholder={loading ? 'Loading colleges...' : placeholder} />
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
  const { institutions } = useInstitutionsWithAccess({ isActive: true });
  const result: Record<string, string> = {};
  for (const inst of institutions) {
    result[inst.id] = inst.name;
  }
  return result;
}
