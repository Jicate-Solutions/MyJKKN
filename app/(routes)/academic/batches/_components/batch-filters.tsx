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
import { BatchesSearchParams } from './data-table-schema';
import { usePermissions } from '@/hooks/use-permissions';

interface BatchFiltersProps {
  searchParams: BatchesSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function BatchFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: BatchFiltersProps) {
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const { isSuperAdmin, userProfile } = usePermissions();

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

  // Auto-set institution filter for non-super admin users
  useEffect(() => {
    if (
      !isSuperAdmin &&
      userProfile?.institution_id &&
      !searchParams.institution_id &&
      !loading
    ) {
      onFilterChange('institution_id', userProfile.institution_id);
    }
  }, [
    userProfile,
    isSuperAdmin,
    searchParams.institution_id,
    onFilterChange,
    loading
  ]);

  const hasActiveFilters = !!(
    searchParams.institution_id || searchParams.is_active || searchParams.batch_year
  );

  return (
    <div className='space-y-4'>
      {/* Filters Row */}
      <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center'>
          {/* Institution Filter - Only show for super admins */}
          {isSuperAdmin && (
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

          {/* Status Filter */}
          <div className='min-w-[150px]'>
            <Select
              value={searchParams.is_active || 'all'}
              onValueChange={(value) =>
                onFilterChange('is_active', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='All Status' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Status</SelectItem>
                <SelectItem value='true'>Active</SelectItem>
                <SelectItem value='false'>Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button
            variant='ghost'
            onClick={onClearFilters}
            className='h-8 px-2 lg:px-3'
          >
            Reset
            <RotateCcw className='ml-2 h-4 w-4' />
          </Button>
        )}
      </div>
    </div>
  );
}
