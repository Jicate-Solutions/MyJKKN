'use client';

import { useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import type { AdmissionYearsSearchParams } from './data-table-schema';

interface AdmissionYearFiltersProps {
  searchParams: AdmissionYearsSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function AdmissionYearFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: AdmissionYearFiltersProps) {
  // Access-aware institution list — honors institution_scope on the user's role.
  const { institutions, loading } = useInstitutionsWithAccess({
    isActive: true
  });
  const canPickInstitution = institutions.length > 1;

  // If the user has exactly one accessible institution, auto-apply it as a filter
  // so the table is pre-scoped correctly.
  useEffect(() => {
    if (loading) return;
    if (canPickInstitution) return;
    if (institutions.length === 0) return;
    if (searchParams.institution_id === institutions[0].id) return;
    onFilterChange('institution_id', institutions[0].id);
  }, [
    institutions,
    canPickInstitution,
    loading,
    searchParams.institution_id,
    onFilterChange
  ]);

  const currentYear = new Date().getFullYear();
  const yearOptions: number[] = [];
  for (let y = currentYear + 2; y >= currentYear - 10; y--) yearOptions.push(y);

  const hasActiveFilters = !!(
    searchParams.institution_id ||
    searchParams.program_start_year ||
    searchParams.status
  );

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center'>
          {canPickInstitution && (
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
          )}

          <div className='min-w-[160px]'>
            <Select
              value={
                searchParams.program_start_year
                  ? String(searchParams.program_start_year)
                  : 'all'
              }
              onValueChange={(value) =>
                onFilterChange(
                  'program_start_year',
                  value === 'all' ? undefined : value
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='All Start Years' />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto'>
                <SelectItem value='all'>All Start Years</SelectItem>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          {hasActiveFilters && (
            <Button
              variant='ghost'
              onClick={onClearFilters}
              size='sm'
              className='h-8 px-2 lg:px-3'
            >
              <RotateCcw className='mr-2 h-4 w-4' />
              Reset
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
