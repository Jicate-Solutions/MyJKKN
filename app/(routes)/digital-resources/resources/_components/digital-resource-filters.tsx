'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useDigitalResourceCategories } from '@/hooks/resource/use-digital-resource-categories';
import { 
  DigitalResourceFilters,
  DIGITAL_RESOURCE_TYPES,
  ACCESS_METHODS,
  OWNER_TYPES
} from '@/types/digital-resources';

interface DigitalResourceFiltersComponentProps {
  filters: DigitalResourceFilters;
  onFilterChange: (filters: Partial<DigitalResourceFilters>) => void;
}

export function DigitalResourceFiltersComponent({
  filters,
  onFilterChange
}: DigitalResourceFiltersComponentProps) {
  const [localFilters, setLocalFilters] = useState<DigitalResourceFilters>({
    ...filters
  });
  const { categories, loading: categoriesLoading } = useDigitalResourceCategories();

  useEffect(() => {
    setLocalFilters({ ...filters });
  }, [filters]);

  const handleChange = (
    key: keyof DigitalResourceFilters,
    value: string | boolean | number | undefined
  ) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = () => {
    onFilterChange(localFilters);
  };

  const handleResetFilters = () => {
    const resetFilters: DigitalResourceFilters = {
      search: '',
      type: undefined,
      category_id: undefined,
      access_method: undefined,
      owner_type: undefined,
      isActive: undefined,
      page: 1,
      limit: 10
    };
    setLocalFilters(resetFilters);
    onFilterChange(resetFilters);
  };

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
        <div className='space-y-2'>
          <Label htmlFor='type'>Resource Type</Label>
          <Select
            value={localFilters.type || ''}
            onValueChange={(value) =>
              handleChange('type', value ? value : undefined)
            }
          >
            <SelectTrigger id='type'>
              <SelectValue placeholder='All Types' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-types">All Types</SelectItem>
              {Object.entries(DIGITAL_RESOURCE_TYPES).map(([key, value]) => (
                <SelectItem key={key} value={value}>
                  {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='category'>Category</Label>
          <Select
            value={localFilters.category_id || ''}
            onValueChange={(value) =>
              handleChange('category_id', value === 'all-categories' ? undefined : value)
            }
          >
            <SelectTrigger id='category'>
              <SelectValue placeholder='All Categories' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-categories">All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.category_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='access_method'>Access Method</Label>
          <Select
            value={localFilters.access_method || ''}
            onValueChange={(value) =>
              handleChange('access_method', value === 'all-access-methods' ? undefined : value)
            }
          >
            <SelectTrigger id='access_method'>
              <SelectValue placeholder='All Access Methods' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-access-methods">All Access Methods</SelectItem>
              {Object.entries(ACCESS_METHODS).map(([key, value]) => (
                <SelectItem key={key} value={value}>
                  {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='owner_type'>Owner Type</Label>
          <Select
            value={localFilters.owner_type || ''}
            onValueChange={(value) =>
              handleChange('owner_type', value === 'all-owner-types' ? undefined : value)
            }
          >
            <SelectTrigger id='owner_type'>
              <SelectValue placeholder='All Owner Types' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-owner-types">All Owner Types</SelectItem>
              {Object.entries(OWNER_TYPES).map(([key, value]) => (
                <SelectItem key={key} value={value}>
                  {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='isActive'>Status</Label>
          <Select
            value={
              localFilters.isActive === undefined
                ? 'all-statuses'
                : localFilters.isActive
                ? 'true'
                : 'false'
            }
            onValueChange={(value) =>
              handleChange(
                'isActive',
                value === 'all-statuses'
                  ? undefined
                  : value === 'true'
                  ? true
                  : false
              )
            }
          >
            <SelectTrigger id='isActive'>
              <SelectValue placeholder='All Statuses' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all-statuses'>All Statuses</SelectItem>
              <SelectItem value='true'>Active</SelectItem>
              <SelectItem value='false'>Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className='flex justify-end space-x-2 pt-2'>
        <Button variant='outline' onClick={handleResetFilters}>
          Reset
        </Button>
        <Button onClick={handleApplyFilters}>Apply Filters</Button>
      </div>
    </div>
  );
}
