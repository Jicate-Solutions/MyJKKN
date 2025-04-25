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
import { OrganizationService } from '@/lib/services/organization/organization-service';
import type { DigitalSharingPolicyFilters } from '@/types/digital-resources';
import { DigitalCategoryService } from '@/lib/services/resource/digital/digital-category-service';

interface PolicyFiltersProps {
  filters: DigitalSharingPolicyFilters;
  onFilterChange: (filters: Partial<DigitalSharingPolicyFilters>) => void;
  onReset: () => void;
}

export function PolicyFilters({
  filters,
  onFilterChange,
  onReset
}: PolicyFiltersProps) {
  const [categories, setCategories] = useState<
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

        // Fetch digital resource categories
        const categoriesResponse =
          await DigitalCategoryService.getDigitalCategories();
        setCategories(categoriesResponse.data);

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

  const handleCategoryChange = (value: string) => {
    onFilterChange({
      category_id: value === 'all_categories' ? undefined : value
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
        {/* Digital Category Filter */}
        <div className='space-y-2'>
          <Label htmlFor='category'>Digital Resource Category</Label>
          {loading ? (
            <div className='flex items-center space-x-2'>
              <Loader2 className='h-4 w-4 animate-spin' />
              <span className='text-sm text-muted-foreground'>Loading...</span>
            </div>
          ) : (
            <Select
              value={filters.category_id || 'all_categories'}
              onValueChange={handleCategoryChange}
            >
              <SelectTrigger id='category'>
                <SelectValue placeholder='All Categories' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all_categories'>All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.category_name}
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
