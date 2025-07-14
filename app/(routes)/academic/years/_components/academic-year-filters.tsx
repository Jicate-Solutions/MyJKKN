// app/(routes)/academic/years/_components/academic-year-filters.tsx

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import type { AcademicYearFilters } from '@/types/academics';

interface AcademicYearFiltersProps {
  filters: AcademicYearFilters;
  onFilterChange: (filters: Partial<AcademicYearFilters>) => void;
}

export function AcademicYearFilters({
  filters,
  onFilterChange
}: AcademicYearFiltersProps) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const { institutions, loading: institutionsLoading } =
    useInstitutionsWithAccess({
      isActive: true
    });

  // Auto-set institution filter for faculty users
  useEffect(() => {
    if (!isSuperAdmin && userProfile?.institution_id) {
      // Only set if not already set to avoid infinite loops
      if (filters.institution_id !== userProfile.institution_id) {
        onFilterChange({ institution_id: userProfile.institution_id });
      }
    }
  }, [userProfile, isSuperAdmin, filters.institution_id, onFilterChange]);

  const debouncedSearch = useDebounce((value: string) => {
    onFilterChange({ search: value });
  }, 300);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      debouncedSearch(e.target.value);
    },
    [debouncedSearch]
  );

  return (
    <div className='space-y-4 mb-6'>
      <div className='grid gap-4 md:grid-cols-3'>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            placeholder='Search academic years...'
            onChange={handleSearchChange}
            defaultValue={filters.search}
            className='pl-9'
          />
        </div>

        {/* Institution Filter - Only show for super admins */}
        {isSuperAdmin && (
          <Select
            value={filters.institution_id || 'all'}
            onValueChange={(value) =>
              onFilterChange({
                institution_id: value === 'all' ? undefined : value
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='Select institution' />
            </SelectTrigger>
            <SelectContent className='max-h-60 overflow-y-auto'>
              <SelectItem value='all'>All Institutions</SelectItem>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name} ({inst.counselling_code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={
            filters.isActive === undefined
              ? 'all'
              : filters.isActive
              ? 'active'
              : 'inactive'
          }
          onValueChange={(value) =>
            onFilterChange({
              isActive: value === 'all' ? undefined : value === 'active'
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='Filter by status' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Status</SelectItem>
            <SelectItem value='active'>Active</SelectItem>
            <SelectItem value='inactive'>Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Show current institution for faculty users */}
      {!isSuperAdmin && userProfile?.institution_id && (
        <div className='text-sm text-muted-foreground'>
          Showing academic years for your institution only
        </div>
      )}
    </div>
  );
}
