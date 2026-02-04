'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import type { VACCourseFilters } from '@/types/vac';

// Institution options
const INSTITUTIONS = [
  { value: 'Engineering', label: 'Engineering' },
  { value: 'Pharmacy', label: 'Pharmacy' },
  { value: 'Arts & Science', label: 'Arts & Science' },
  { value: 'Dental', label: 'Dental' },
  { value: 'Nursing', label: 'Nursing' },
  { value: 'Physiotherapy', label: 'Physiotherapy' },
  { value: 'All', label: 'All Institutions' }
];

// Track options
const TRACKS = [
  { value: 'ai', label: 'Artificial Intelligence' },
  { value: 'matlab', label: 'MATLAB' },
  { value: 'general', label: 'General' },
  { value: 'programming', label: 'Programming' },
  { value: 'data-science', label: 'Data Science' },
  { value: 'web-development', label: 'Web Development' }
];

interface VACCourseFiltersProps {
  filters: VACCourseFilters;
  onFilterChange: (filters: Partial<VACCourseFilters>) => void;
}

export function VACCourseFiltersComponent({
  filters,
  onFilterChange
}: VACCourseFiltersProps) {
  const handleClearFilters = () => {
    onFilterChange({
      institution: undefined,
      track: undefined,
      activeOnly: undefined
    });
  };

  const hasActiveFilters =
    filters.institution || filters.track || filters.activeOnly !== undefined;

  return (
    <div className='space-y-4 p-4 bg-muted/50 rounded-lg mb-4'>
      <div className='flex items-center justify-between'>
        <h3 className='text-sm font-medium'>Filters</h3>
        {hasActiveFilters && (
          <Button
            variant='ghost'
            size='sm'
            onClick={handleClearFilters}
            className='h-8 px-2 lg:px-3'
          >
            <X className='mr-2 h-4 w-4' />
            Clear
          </Button>
        )}
      </div>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        {/* Institution Filter */}
        <div className='space-y-2'>
          <Label htmlFor='institution'>Institution</Label>
          <Select
            value={filters.institution || ''}
            onValueChange={(value) =>
              onFilterChange({
                institution: value === 'all' ? undefined : value
              })
            }
          >
            <SelectTrigger id='institution'>
              <SelectValue placeholder='All institutions' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All institutions</SelectItem>
              {INSTITUTIONS.map((inst) => (
                <SelectItem key={inst.value} value={inst.value}>
                  {inst.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Track Filter */}
        <div className='space-y-2'>
          <Label htmlFor='track'>Track</Label>
          <Select
            value={filters.track || ''}
            onValueChange={(value) =>
              onFilterChange({
                track: value === 'all' ? undefined : value
              })
            }
          >
            <SelectTrigger id='track'>
              <SelectValue placeholder='All tracks' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All tracks</SelectItem>
              {TRACKS.map((track) => (
                <SelectItem key={track.value} value={track.value}>
                  {track.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status Filter */}
        <div className='space-y-2'>
          <Label htmlFor='status'>Status</Label>
          <Select
            value={
              filters.activeOnly === undefined
                ? 'all'
                : filters.activeOnly
                ? 'active'
                : 'inactive'
            }
            onValueChange={(value) => {
              if (value === 'all') {
                onFilterChange({ activeOnly: undefined });
              } else {
                onFilterChange({ activeOnly: value === 'active' });
              }
            }}
          >
            <SelectTrigger id='status'>
              <SelectValue placeholder='All statuses' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All statuses</SelectItem>
              <SelectItem value='active'>Active</SelectItem>
              <SelectItem value='inactive'>Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
