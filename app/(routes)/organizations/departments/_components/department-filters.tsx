// app/(routes)/organizations/departments/_components/department-filters.tsx

'use client';

import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentsSearchParams } from './data-table-schema';

interface DepartmentFiltersProps {
  searchParams: DepartmentsSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function DepartmentFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: DepartmentFiltersProps) {
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [degrees, setDegrees] = useState<
    Array<{ id: string; degree_name: string }>
  >([]);
  const [loading, setLoading] = useState(false);

  // FIXED: Add AbortController to prevent race conditions and memory leaks
  useEffect(() => {
    const abortController = new AbortController();

    async function loadInstitutions() {
      try {
        setLoading(true);
        const data = await OrganizationService.getInstitutionNames(true);

        // Only update state if not aborted
        if (!abortController.signal.aborted) {
          setInstitutions(data);
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error('Error loading institutions:', error);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadInstitutions();

    // Cleanup: abort fetch on unmount
    return () => abortController.abort();
  }, []);

  // FIXED: Add AbortController to prevent race conditions and memory leaks
  useEffect(() => {
    const abortController = new AbortController();

    async function loadDegrees() {
      if (searchParams.institution_id) {
        try {
          setLoading(true);
          const data = await DegreeService.getDegreesByInstitution(
            searchParams.institution_id
          );

          // Only update state if not aborted
          if (!abortController.signal.aborted) {
            setDegrees(data);
          }
        } catch (error) {
          if (!abortController.signal.aborted) {
            console.error('Error loading degrees:', error);
          }
        } finally {
          if (!abortController.signal.aborted) {
            setLoading(false);
          }
        }
      } else {
        if (!abortController.signal.aborted) {
          setDegrees([]);
        }
      }
    }

    loadDegrees();

    // Cleanup: abort fetch on unmount or when institution changes
    return () => abortController.abort();
  }, [searchParams.institution_id]);

  const handleInstitutionChange = (value: string) => {
    onFilterChange('institution_id', value === 'all' ? undefined : value);
    // Reset degree when institution changes
    if (searchParams.degree_id) {
      onFilterChange('degree_id', undefined);
    }
  };

  const hasActiveFilters = !!(
    searchParams.institution_id ||
    searchParams.degree_id ||
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
              onValueChange={handleInstitutionChange}
              disabled={loading}
            >
              <SelectTrigger className='w-full'>
                <SelectValue
                  placeholder={loading ? 'Loading...' : 'All Institutions'}
                />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto'>
                <SelectItem value='all'>All Institutions</SelectItem>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Degree Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.degree_id || 'all'}
              onValueChange={(value) =>
                onFilterChange('degree_id', value === 'all' ? undefined : value)
              }
              disabled={!searchParams.institution_id || loading}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='All Degrees' />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto'>
                <SelectItem value='all'>All Degrees</SelectItem>
                {degrees.map((degree) => (
                  <SelectItem key={degree.id} value={degree.id}>
                    {degree.degree_name}
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
        </div>

        {/* Second Row - Clear Filters */}
        {hasActiveFilters && (
          <div className='flex items-center gap-2'>
            {/* Clear Filters Button */}
            <Button
              variant='outline'
              size='sm'
              onClick={onClearFilters}
              className='w-full sm:w-auto'
            >
              <RotateCcw className='mr-2 h-4 w-4' />
              Clear Filters
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
