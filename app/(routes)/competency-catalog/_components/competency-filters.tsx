'use client';

import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import type { CompetencyType } from '@/types/competency';

interface CompetencyFiltersState {
  search: string;
  competency_type?: CompetencyType;
  is_active?: boolean;
}

interface CompetencyFiltersProps {
  filters: CompetencyFiltersState;
  onFilterChange: (filters: {
    search?: string;
    competency_type?: CompetencyType | undefined;
    is_active?: boolean | undefined;
  }) => void;
}

export function CompetencyFilters({
  filters,
  onFilterChange
}: CompetencyFiltersProps) {
  const handleClearFilters = () => {
    onFilterChange({
      search: '',
      competency_type: undefined,
      is_active: undefined
    });
  };

  const hasActiveFilters =
    filters.search ||
    filters.competency_type !== undefined ||
    filters.is_active !== undefined;

  return (
    <div className='space-y-4 mb-6'>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
        {/* Search */}
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
          <Input
            placeholder='Search by name or code...'
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className='pl-10'
          />
        </div>

        {/* Competency Type Filter */}
        <Select
          value={filters.competency_type || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              competency_type:
                value === 'all' ? undefined : (value as CompetencyType)
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='All types' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Types</SelectItem>
            <SelectItem value='technical'>Technical</SelectItem>
            <SelectItem value='behavioral'>Behavioral</SelectItem>
            <SelectItem value='domain'>Domain</SelectItem>
            <SelectItem value='soft_skill'>Soft Skill</SelectItem>
            <SelectItem value='metacognitive'>Metacognitive</SelectItem>
          </SelectContent>
        </Select>

        {/* Active/Inactive Filter */}
        <Select
          value={
            filters.is_active === undefined
              ? 'all'
              : filters.is_active
                ? 'active'
                : 'inactive'
          }
          onValueChange={(value) =>
            onFilterChange({
              is_active:
                value === 'all' ? undefined : value === 'active'
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='All statuses' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Statuses</SelectItem>
            <SelectItem value='active'>Active</SelectItem>
            <SelectItem value='inactive'>Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <div className='flex justify-end'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleClearFilters}
            className='h-8'
          >
            <X className='mr-2 h-4 w-4' />
            Clear Filters
          </Button>
        </div>
      )}
    </div>
  );
}
