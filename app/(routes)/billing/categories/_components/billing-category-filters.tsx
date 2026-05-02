'use client';

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
import type {
  BillingCategoryFilters as Filters,
  BillingCategoryFrequency
} from '@/types/billing';

interface BillingCategoryFiltersProps {
  filters: Filters;
  onFilterChange: (filters: Partial<Filters>) => void;
}

export function BillingCategoryFilters({
  filters,
  onFilterChange
}: BillingCategoryFiltersProps) {
  const handleClearFilters = () => {
    onFilterChange({
      search: '',
      frequency: undefined,
      isActive: undefined
    });
  };

  const hasActiveFilters =
    filters.search || filters.frequency || filters.isActive !== undefined;

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

        <div className='space-y-2'>
          <Label htmlFor='frequency'>Frequency</Label>
          <Select
            value={filters.frequency || 'all'}
            onValueChange={(value) =>
              onFilterChange({
                frequency:
                  value === 'all'
                    ? undefined
                    : (value as BillingCategoryFrequency)
              })
            }
          >
            <SelectTrigger id='frequency'>
              <SelectValue placeholder='All frequencies' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All frequencies</SelectItem>
              <SelectItem value='one-time'>One-time</SelectItem>
              <SelectItem value='monthly'>Monthly</SelectItem>
              <SelectItem value='quarterly'>Quarterly</SelectItem>
              <SelectItem value='yearly'>Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>

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
