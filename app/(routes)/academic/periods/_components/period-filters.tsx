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
import { PeriodFilters as PeriodFiltersType } from '@/types/academics';
import { useDebounceValue } from '@/hooks/use-debounce-value';

interface PeriodFiltersProps {
  filters: PeriodFiltersType;
  onFilterChange: (filters: Partial<PeriodFiltersType>) => void;
}

export function PeriodFilters({ filters, onFilterChange }: PeriodFiltersProps) {
  const [searchTerm, setSearchTerm] = useState(filters.search || '');
  const debouncedSearchTerm = useDebounceValue(searchTerm, 500);

  useEffect(() => {
    if (debouncedSearchTerm !== filters.search) {
      onFilterChange({ search: debouncedSearchTerm || undefined });
    }
  }, [debouncedSearchTerm, filters.search, onFilterChange]);

  const handleIsBreakChange = (value: string) => {
    if (value === 'all') {
      onFilterChange({ isBreak: undefined });
    } else {
      onFilterChange({ isBreak: value === 'true' });
    }
  };

  return (
    <div className='flex flex-col sm:flex-row gap-4'>
      <div className='relative flex-1'>
        <Search className='absolute left-3 top-3 h-4 w-4 text-muted-foreground' />
        <Input
          placeholder='Search periods...'
          className='pl-9'
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <Select
        value={
          filters.isBreak === undefined
            ? 'all'
            : filters.isBreak
            ? 'true'
            : 'false'
        }
        onValueChange={handleIsBreakChange}
      >
        <SelectTrigger className='w-full sm:w-[180px]'>
          <SelectValue placeholder='Filter by type' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>All Types</SelectItem>
          <SelectItem value='false'>Academic</SelectItem>
          <SelectItem value='true'>Break</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
