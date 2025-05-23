'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import type { BillingParentCategoryFilters } from '@/types/billing';
import type { Institution } from '@/types/organizations';

interface ParentCategoryFiltersProps {
  filters: BillingParentCategoryFilters;
  onFilterChange: (filters: Partial<BillingParentCategoryFilters>) => void;
}

export function ParentCategoryFilters({
  filters,
  onFilterChange
}: ParentCategoryFiltersProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);

  useEffect(() => {
    loadInstitutions();
  }, []);

  const loadInstitutions = async () => {
    try {
      setIsLoadingInstitutions(true);
      const institutionNames = await OrganizationService.getInstitutionNames(
        true
      );
      setInstitutions(institutionNames as Institution[]);
    } catch (error) {
      console.error('Error loading institutions:', error);
    } finally {
      setIsLoadingInstitutions(false);
    }
  };

  const handleClearFilters = () => {
    onFilterChange({
      search: '',
      institution_id: undefined,
      isActive: undefined
    });
  };

  const hasActiveFilters =
    filters.search || filters.institution_id || filters.isActive !== undefined;

  return (
    <div className='space-y-4 p-4 bg-muted/50 rounded-lg'>
      <div className='flex items-center justify-between'>
        <h3 className='text-sm font-medium'>Filters</h3>
        {hasActiveFilters && (
          <Button
            variant='ghost'
            size='sm'
            onClick={handleClearFilters}
            className='h-8 px-2 lg:px-3'
          >
            <X className='mr-2 h-4 w-4' />
            Clear
          </Button>
        )}
      </div>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        {/* Search Filter */}
        <div className='space-y-2'>
          <Label htmlFor='search'>Search</Label>
          <div className='relative'>
            <Search className='absolute left-3 top-3 h-4 w-4 text-muted-foreground' />
            <Input
              id='search'
              placeholder='Search by category name...'
              value={filters.search || ''}
              onChange={(e) => onFilterChange({ search: e.target.value })}
              className='pl-9'
            />
          </div>
        </div>

        {/* Institution Filter */}
        <div className='space-y-2'>
          <Label htmlFor='institution'>Institution</Label>
          <Select
            value={filters.institution_id || ''}
            onValueChange={(value) =>
              onFilterChange({
                institution_id: value === 'all' ? undefined : value
              })
            }
            disabled={isLoadingInstitutions}
          >
            <SelectTrigger id='institution'>
              <SelectValue
                placeholder={
                  isLoadingInstitutions
                    ? 'Loading institutions...'
                    : 'All institutions'
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All institutions</SelectItem>
              {institutions.map((institution) => (
                <SelectItem key={institution.id} value={institution.id}>
                  {institution.name} ({institution.counselling_code})
                </SelectItem>
              ))}
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
                ? 'active'
                : 'inactive'
            }
            onValueChange={(value) => {
              if (value === 'all') {
                onFilterChange({ isActive: undefined });
              } else {
                onFilterChange({ isActive: value === 'active' });
              }
            }}
          >
            <SelectTrigger id='status'>
              <SelectValue placeholder='All statuses' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All statuses</SelectItem>
              <SelectItem value='active'>Active</SelectItem>
              <SelectItem value='inactive'>Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
