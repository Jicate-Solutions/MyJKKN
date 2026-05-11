'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';

export interface InstitutionOption {
  id: string;
  name: string;
  institution_code: string;
  /** All related MyJKKN UUIDs — more than one for CAS (Aided + Self-Financed). */
  myjkkn_institution_ids: string[];
}

const ALL_SENTINEL = '__all__';

/**
 * Picks an institution for BoS tabs. Backed by /api/bos/institutions which
 * returns the caller's full list (super-admin) or just their own institution
 * (otherwise). Auto-selects the first option once it loads so non-admins
 * never see an unselected dropdown.
 *
 * showAllOption — when true (super-admin contexts only) prepends an
 * "All Institutions" entry that clears the selection (onChange receives undefined).
 *
 * onSelect fires with the full InstitutionOption (id + name + institution_code +
 * myjkkn_institution_ids) so callers can fan out to all related UUIDs (e.g. CAS).
 */
export function InstitutionPicker({
  value,
  onChange,
  onSelect,
  showAllOption = false,
}: {
  value: string | undefined;
  onChange: (institutionId: string | undefined) => void;
  onSelect?: (option: InstitutionOption) => void;
  showAllOption?: boolean;
}) {
  const { data: institutions = [], isLoading } = useQuery<InstitutionOption[]>({
    queryKey: ['bos', 'institutions'],
    queryFn: async () => {
      const r = await fetch('/api/bos/institutions');
      if (!r.ok) throw new Error('Failed to load institutions');
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Auto-select the first option for non-admins (single institution) and for
  // super-admins when showAllOption is false. Skip when showAllOption is true
  // so super-admins explicitly choose.
  useEffect(() => {
    if (!value && institutions.length > 0 && !showAllOption) {
      onChange(institutions[0].id);
      onSelect?.(institutions[0]);
    }
  }, [institutions, value, onChange, onSelect, showAllOption]);

  const selectValue = value ?? (showAllOption ? ALL_SENTINEL : '');

  const options = [
    ...(showAllOption ? [{ value: ALL_SENTINEL, label: 'All Institutions' }] : []),
    ...institutions.map((i) => ({ value: i.id, label: `${i.institution_code} — ${i.name}` })),
  ];

  return (
    <div className='space-y-1'>
      <Label className='text-xs'>Institution</Label>
      <SearchableSelect
        value={selectValue}
        onValueChange={(picked) => {
          if (picked === ALL_SENTINEL) {
            onChange(undefined);
          } else {
            onChange(picked);
            const opt = institutions.find((i) => i.id === picked);
            if (opt) onSelect?.(opt);
          }
        }}
        options={options}
        loading={isLoading}
        disabled={institutions.length === 0 && !isLoading}
        placeholder='Select institution'
        searchPlaceholder='Search institution…'
        className='w-[220px]'
      />
    </div>
  );
}
