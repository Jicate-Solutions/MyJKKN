'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { useScopedInstitutionFilter } from '@/hooks/organization/use-scoped-institution-filter';
import { CoursesSearchParams } from './data-table-schema';

interface CourseFiltersProps {
  searchParams: CoursesSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function CourseFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: CourseFiltersProps) {
  // Super admins see all institutions + an "All" option; normal users see
  // only their own and are auto-selected into one (no "All" option).
  const { institutions, loading, isSuperAdmin } = useScopedInstitutionFilter({
    selectedInstitutionId: searchParams.institution_id,
    onFilterChange
  });

  const hasActiveFilters = !!(
    searchParams.institution_id ||
    searchParams.status
  );

  return (
    <div className='space-y-4'>
      {/* Filters and Actions */}
      <div className='space-y-4'>
        {/* First Row - Filters */}
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
          {/* Institution Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.institution_id || 'all'}
              onValueChange={(value) =>
                onFilterChange('institution_id', value === 'all' ? undefined : value)
              }
              disabled={loading}
            >
              <SelectTrigger className='w-full'>
                <SelectValue
                  placeholder={loading ? 'Loading...' : 'All Institutions'}
                />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto'>
                {isSuperAdmin && (
                  <SelectItem value='all'>All Institutions</SelectItem>
                )}
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.status || 'all'}
              onValueChange={(value) =>
                onFilterChange('status', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='All Status' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Status</SelectItem>
                <SelectItem value='active'>Active</SelectItem>
                <SelectItem value='inactive'>Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Empty div for grid alignment on larger screens */}
          <div className='hidden lg:block'></div>
        </div>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button
            variant='outline'
            size='sm'
            onClick={onClearFilters}
          >
            <RotateCcw className='mr-2 h-4 w-4' />
            Clear Filters
          </Button>
        )}
      </div>
    </div>
  );
}
