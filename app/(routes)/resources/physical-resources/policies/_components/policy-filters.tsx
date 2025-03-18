'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Loader2, FilterX, Filter } from 'lucide-react';
import { ResourceCategoryService } from '@/lib/services/resource/physical/resource-category-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import type { SharingPolicyFilters } from '@/types/resources';

interface PolicyFiltersProps {
  filters: SharingPolicyFilters;
  onFilterChange: (filters: Partial<SharingPolicyFilters>) => void;
  onReset: () => void;
}

export function PolicyFilters({
  filters,
  onFilterChange,
  onReset
}: PolicyFiltersProps) {
  const [resourceTypes, setResourceTypes] = useState<
    { id: string; category_name: string }[]
  >([]);
  const [institutions, setInstitutions] = useState<
    { id: string; name: string; counselling_code: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        setLoading(true);

        // Fetch resource types
        const resourceTypesResponse =
          await ResourceCategoryService.getResourceCategories();
        setResourceTypes(resourceTypesResponse.data);

        // Fetch institutions - using getInstitutionNames which is more lightweight
        const institutionsData =
          await OrganizationService.getInstitutionNames();
        setInstitutions(institutionsData);
      } catch (error) {
        console.error('Error fetching filter options:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFilterOptions();
  }, []);

  const handleResourceTypeChange = (value: string) => {
    onFilterChange({
      resource_type_id: value === 'all_types' ? undefined : value
    });
  };

  const handleInstitutionChange = (value: string) => {
    onFilterChange({
      institution_id: value === 'all_institutions' ? undefined : value
    });
  };

  const handleApprovalRequiredChange = (value: string) => {
    if (value === 'all') {
      onFilterChange({ approval_required: undefined });
    } else {
      onFilterChange({ approval_required: value === 'true' });
    }
  };

  const handleStatusChange = (value: string) => {
    if (value === 'all') {
      onFilterChange({ isActive: undefined });
    } else {
      onFilterChange({ isActive: value === 'true' });
    }
  };

  return (
    <div className='space-y-4 p-4 border rounded-md bg-muted/10'>
      <div className='flex items-center justify-between'>
        <h3 className='text-sm font-medium'>Filter Policies</h3>
        <Button
          variant='ghost'
          size='sm'
          onClick={onReset}
          className='h-8 px-2 text-xs'
        >
          <FilterX className='h-3.5 w-3.5 mr-1' />
          Reset
        </Button>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        {/* Resource Type Filter */}
        <div className='space-y-2'>
          <Label htmlFor='resource-type'>Resource Type</Label>
          {loading ? (
            <div className='flex items-center space-x-2'>
              <Loader2 className='h-4 w-4 animate-spin' />
              <span className='text-sm text-muted-foreground'>Loading...</span>
            </div>
          ) : (
            <Select
              value={filters.resource_type_id || 'all_types'}
              onValueChange={handleResourceTypeChange}
            >
              <SelectTrigger id='resource-type'>
                <SelectValue placeholder='All Types' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all_types'>All Types</SelectItem>
                {resourceTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.category_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Institution Filter */}
        <div className='space-y-2'>
          <Label htmlFor='institution'>Institution</Label>
          {loading ? (
            <div className='flex items-center space-x-2'>
              <Loader2 className='h-4 w-4 animate-spin' />
              <span className='text-sm text-muted-foreground'>Loading...</span>
            </div>
          ) : (
            <Select
              value={filters.institution_id || 'all_institutions'}
              onValueChange={handleInstitutionChange}
            >
              <SelectTrigger id='institution'>
                <SelectValue placeholder='All Institutions' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all_institutions'>
                  All Institutions
                </SelectItem>
                {institutions.map((institution) => (
                  <SelectItem key={institution.id} value={institution.id}>
                    {institution.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Approval Required Filter */}
        <div className='space-y-2'>
          <Label htmlFor='approval-required'>Approval Required</Label>
          <Select
            value={
              filters.approval_required === undefined
                ? 'all'
                : filters.approval_required
                ? 'true'
                : 'false'
            }
            onValueChange={handleApprovalRequiredChange}
          >
            <SelectTrigger id='approval-required'>
              <SelectValue placeholder='All' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All</SelectItem>
              <SelectItem value='true'>Yes</SelectItem>
              <SelectItem value='false'>No</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status Filter */}
        <div className='space-y-2'>
          <Label htmlFor='status'>Status</Label>
          <Select
            value={
              filters.isActive === undefined
                ? 'all'
                : filters.isActive
                ? 'true'
                : 'false'
            }
            onValueChange={handleStatusChange}
          >
            <SelectTrigger id='status'>
              <SelectValue placeholder='All' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All</SelectItem>
              <SelectItem value='true'>Active</SelectItem>
              <SelectItem value='false'>Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
