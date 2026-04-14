'use client';
// app/(routes)/organizations/institutions/_components/institution-filters.tsx

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { InstitutionsSearchParams } from './data-table-schema';
import { ENTITY_TYPES } from '@/lib/constants/institutions';

interface InstitutionFiltersProps {
  searchParams: InstitutionsSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function InstitutionFilter({
  searchParams,
  onFilterChange,
  onClearFilters
}: InstitutionFiltersProps) {
  const hasActiveFilters = !!searchParams.status || !!searchParams.entity_type;

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center'>
          <div className='min-w-[150px]'>
            <Select
              value={searchParams.status || 'all'}
              onValueChange={(value) =>
                onFilterChange('status', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='All Status' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Status</SelectItem>
                <SelectItem value='active'>Active</SelectItem>
                <SelectItem value='inactive'>Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='min-w-[200px]'>
            <Select
              value={searchParams.entity_type || 'all'}
              onValueChange={(value) =>
                onFilterChange('entity_type', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='All Entity Types' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Entity Types</SelectItem>
                {ENTITY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <Button
              variant='outline'
              size='sm'
              onClick={onClearFilters}
              className='shrink-0'
            >
              <RotateCcw className='mr-2 h-4 w-4' />
              Clear Filters
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
