'use client';

import { Search, RotateCcw } from 'lucide-react';
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
import type { ParentCategoryFilters } from '@/types/resource-management';
import { CATEGORY_STATUS } from '@/types/resource-management';

interface ParentCategoryFiltersProps {
  filters: ParentCategoryFilters;
  onFilterChange: (filters: Partial<ParentCategoryFilters>) => void;
}

export function ParentCategoryFilters({
  filters,
  onFilterChange
}: ParentCategoryFiltersProps) {
  const handleSearchChange = (value: string) => {
    onFilterChange({ search: value });
  };

  const handleStatusChange = (value: string) => {
    onFilterChange({
      status: value === 'all' ? 'all' : (value as any)
    });
  };

  const handleSortByChange = (value: string) => {
    onFilterChange({
      sortBy: value as 'name' | 'created_at' | 'usage_count'
    });
  };

  const handleSortOrderChange = (value: string) => {
    onFilterChange({
      sortOrder: value as 'asc' | 'desc'
    });
  };

  const handleClearFilters = () => {
    onFilterChange({
      search: undefined,
      status: undefined,
      sortBy: 'created_at',
      sortOrder: 'desc'
    });
  };

  const hasActiveFilters = filters.search || filters.status;

  return (
    <div className='space-y-4 mb-6'>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        {/* Search */}
        <div className='space-y-2'>
          <Label htmlFor='search'>Search</Label>
          <div className='relative'>
            <Search className='absolute left-3 top-3 h-4 w-4 text-muted-foreground' />
            <Input
              id='search'
              placeholder='Search categories...'
              value={filters.search || ''}
              onChange={(e) => handleSearchChange(e.target.value)}
              className='pl-9'
            />
          </div>
        </div>

        {/* Status Filter */}
        <div className='space-y-2'>
          <Label htmlFor='status'>Status</Label>
          <Select
            value={filters.status || 'all'}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger>
              <SelectValue placeholder='All Statuses' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Statuses</SelectItem>
              <SelectItem value={CATEGORY_STATUS.ACTIVE}>Active</SelectItem>
              <SelectItem value={CATEGORY_STATUS.INACTIVE}>Inactive</SelectItem>
              <SelectItem value={CATEGORY_STATUS.ARCHIVED}>Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sort By */}
        <div className='space-y-2'>
          <Label htmlFor='sortBy'>Sort By</Label>
          <Select
            value={filters.sortBy || 'created_at'}
            onValueChange={handleSortByChange}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='name'>Name</SelectItem>
              <SelectItem value='created_at'>Created Date</SelectItem>
              <SelectItem value='usage_count'>Usage Count</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sort Order */}
        <div className='space-y-2'>
          <Label htmlFor='sortOrder'>Sort Order</Label>
          <Select
            value={filters.sortOrder || 'desc'}
            onValueChange={handleSortOrderChange}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='desc'>Descending</SelectItem>
              <SelectItem value='asc'>Ascending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <div className='flex justify-end'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleClearFilters}
            className='flex items-center gap-2'
          >
            <RotateCcw className='h-4 w-4' />
            Clear Filters
          </Button>
        </div>
      )}
    </div>
  );
}
