'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface InstitutionOption {
  id: string;
  name: string;
  institution_code: string;
}

/**
 * Picks an institution for BoS tabs. Backed by /api/bos/institutions which
 * returns the caller's full list (super-admin) or just their own institution
 * (otherwise). Auto-selects the first option once it loads so non-admins
 * never see an unselected dropdown.
 */
export function InstitutionPicker({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (institutionId: string | undefined) => void;
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

  // Auto-select the first option (handles both: single-institution non-admins
  // and the first time a super-admin lands on the page).
  useEffect(() => {
    if (!value && institutions.length > 0) {
      onChange(institutions[0].id);
    }
  }, [institutions, value, onChange]);

  return (
    <div className='space-y-1'>
      <Label className='text-xs'>Institution</Label>
      <Select value={value ?? ''} onValueChange={onChange} disabled={isLoading || institutions.length === 0}>
        <SelectTrigger className='w-[220px]'>
          <SelectValue placeholder={isLoading ? 'Loading…' : 'Select institution'} />
        </SelectTrigger>
        <SelectContent>
          {institutions.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.institution_code} — {i.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
