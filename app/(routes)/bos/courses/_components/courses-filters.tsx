'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export interface CoursesFiltersState {
  search: string;
  regulation_code: string;
  is_active: 'true' | 'false';
}

export function CoursesFilters({
  value, onChange,
}: { value: CoursesFiltersState; onChange: (v: CoursesFiltersState) => void }) {
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
        <Input
          placeholder='e.g. R-2024'
          value={value.regulation_code}
          onChange={(e) => onChange({ ...value, regulation_code: e.target.value.toUpperCase() })}
          className='w-[160px]'
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
