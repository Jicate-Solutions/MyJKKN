'use client';

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { TimetableFilters as TimetableFiltersType } from '@/types/academics';
import { useDebounceValue } from '@/hooks/use-debounce-value';

interface TimetableFiltersProps {
  filters: TimetableFiltersType;
  onFilterChange: (filters: Partial<TimetableFiltersType>) => void;
}

export function TimetableFilters({
  filters,
  onFilterChange
}: TimetableFiltersProps) {
  const [searchTerm, setSearchTerm] = useState(filters.search || '');
  const debouncedSearchTerm = useDebounceValue(searchTerm, 500);

  useEffect(() => {
    if (debouncedSearchTerm !== filters.search) {
      onFilterChange({ search: debouncedSearchTerm || undefined });
    }
  }, [debouncedSearchTerm, filters.search, onFilterChange]);

  const handleIsActiveChange = (value: string) => {
    if (value === 'all') {
      onFilterChange({ is_active: undefined });
    } else {
      onFilterChange({ is_active: value === 'true' });
    }
  };

  const handleIsTemplateChange = (value: string) => {
    if (value === 'all') {
      onFilterChange({ is_template: undefined });
    } else {
      onFilterChange({ is_template: value === 'true' });
    }
  };

  return (
    <div className='space-y-4'>
      <div className='relative'>
        <Search className='absolute left-3 top-3 h-4 w-4 text-muted-foreground' />
        <Input
          placeholder='Search timetables...'
          className='pl-9'
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className='flex flex-col sm:flex-row gap-4'>
        <Select
          value={
            filters.is_active === undefined
              ? 'all'
              : filters.is_active
              ? 'true'
              : 'false'
          }
          onValueChange={handleIsActiveChange}
        >
          <SelectTrigger className='w-full'>
            <SelectValue placeholder='Filter by status' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Status</SelectItem>
            <SelectItem value='true'>Active</SelectItem>
            <SelectItem value='false'>Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={
            filters.is_template === undefined
              ? 'all'
              : filters.is_template
              ? 'true'
              : 'false'
          }
          onValueChange={handleIsTemplateChange}
        >
          <SelectTrigger className='w-full'>
            <SelectValue placeholder='Filter by type' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Types</SelectItem>
            <SelectItem value='false'>Regular</SelectItem>
            <SelectItem value='true'>Template</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
