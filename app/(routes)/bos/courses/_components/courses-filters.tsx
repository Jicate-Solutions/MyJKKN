'use client';

import { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useBosRegulationOptions } from '@/hooks/bos/use-bos-scheme-options';

export interface CoursesFiltersState {
  search: string;
  regulation_code: string;
  is_active: 'true' | 'false';
}

export function CoursesFilters({
  value,
  onChange,
  institutionId,
  myjkknInstitutionIds,
}: {
  value: CoursesFiltersState;
  onChange: (v: CoursesFiltersState) => void;
  institutionId?: string;
  myjkknInstitutionIds?: string[];
}) {
  const lookupIds = myjkknInstitutionIds && myjkknInstitutionIds.length > 0
    ? myjkknInstitutionIds
    : institutionId;
  const { data: regulationsData, isLoading: regulationsLoading } = useBosRegulationOptions(lookupIds);
  const regulations = regulationsData?.data ?? [];

  // Clear regulation filter when institution changes.
  useEffect(() => {
    onChange({ ...value, regulation_code: '' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionId]);

  return (
    <div className='flex gap-3 flex-wrap items-end'>
      <div className='space-y-1'>
        <Label className='text-xs'>Search</Label>
        <Input
          placeholder='Code or name...'
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          className='w-[260px]'
        />
      </div>
      <div className='space-y-1'>
        <Label className='text-xs'>Regulation</Label>
        <SearchableSelect
          value={value.regulation_code}
          onValueChange={(v) => onChange({ ...value, regulation_code: v })}
          options={[
            { value: '', label: 'All regulations' },
            ...regulations.map((r) => ({
              value: r.regulation_code,
              label: r.regulation_year
                ? `${r.regulation_code} (${r.regulation_year})`
                : r.regulation_code,
            })),
          ]}
          loading={regulationsLoading}
          disabled={!institutionId}
          placeholder='All regulations'
          searchPlaceholder='Search regulation…'
          className='w-[180px]'
        />
      </div>
      <div className='space-y-1'>
        <Label className='text-xs'>Status</Label>
        <Select value={value.is_active} onValueChange={(v) => onChange({ ...value, is_active: v as 'true' | 'false' })}>
          <SelectTrigger className='w-[140px]'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='true'>Active</SelectItem>
            <SelectItem value='false'>Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
