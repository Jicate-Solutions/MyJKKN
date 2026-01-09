// app/(routes)/organizations/degrees/_components/degree-filters.tsx

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
import { DegreesSearchParams } from './data-table-schema';

interface DegreeFiltersProps {
  searchParams: DegreesSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function DegreeFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: DegreeFiltersProps) {
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadInstitutions() {
      try {
        setLoading(true);
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        console.error('Error loading institutions:', error);
      } finally {
        setLoading(false);
      }
    }
    loadInstitutions();
  }, []);

  const hasActiveFilters = !!(
    searchParams.institution_id ||
    searchParams.degree_type ||
    searchParams.status
  );

  return (
    <div className='space-y-4'>
      {/* Filters Row */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center'>
          {/* Institution Filter */}
          <div className='min-w-[200px]'>
            <Select
              value={searchParams.institution_id || 'all'}
              onValueChange={(value) =>
                onFilterChange(
                  'institution_id',
                  value === 'all' ? undefined : value
                )
              }
              disabled={loading}
            >
              <SelectTrigger>
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

          {/* Degree Type Filter */}
          <div className='min-w-[150px]'>
            <Select
              value={searchParams.degree_type || 'all'}
              onValueChange={(value) =>
                onFilterChange(
                  'degree_type',
                  value === 'all' ? undefined : value
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='All Types' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Types</SelectItem>
                <SelectItem value='ug'>Undergraduate</SelectItem>
                <SelectItem value='pg'>Postgraduate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
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

          {/* Clear Filters Button */}
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
  );
}
