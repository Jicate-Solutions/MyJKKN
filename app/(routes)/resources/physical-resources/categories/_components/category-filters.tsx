'use client';

import { useEffect, useState } from 'react';
import { ResourceCategoryFilters } from '@/types/resources';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useResourceCategories } from '@/hooks/resource/physical/use-resource-categories';

interface CategoryFiltersComponentProps {
  filters: ResourceCategoryFilters;
  onFilterChange: (filters: Partial<ResourceCategoryFilters>) => void;
}

export function CategoryFiltersComponent({
  filters,
  onFilterChange
}: CategoryFiltersComponentProps) {
  const [topLevelCategories, setTopLevelCategories] = useState<
    { id: string; category_name: string }[]
  >([]);
  const { fetchCategoryHierarchy } = useResourceCategories();

  useEffect(() => {
    const loadTopLevelCategories = async () => {
      try {
        const hierarchy = await fetchCategoryHierarchy();
        setTopLevelCategories(
          hierarchy.map((cat) => ({
            id: cat.id,
            category_name: cat.category_name
          }))
        );
      } catch (error) {
        console.error('Error loading category hierarchy:', error);
      }
    };

    loadTopLevelCategories();
  }, [fetchCategoryHierarchy]);

  const handleReset = () => {
    onFilterChange({
      search: '',
      parent_category_id: undefined,
      isActive: true,
      page: 1
    });
  };

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-4'>
        <div className='space-y-2'>
          <Label htmlFor='parent-category'>Parent Category</Label>
          <Select
            value={filters.parent_category_id || 'all'}
            onValueChange={(value) =>
              onFilterChange({
                parent_category_id: value === 'all' ? undefined : value
              })
            }
          >
            <SelectTrigger id='parent-category'>
              <SelectValue placeholder='All Categories' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Categories</SelectItem>
              <SelectItem value='null'>Top Level Categories Only</SelectItem>
              {topLevelCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.category_name}
                </SelectItem>
              ))}
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
              <SelectValue placeholder='All Statuses' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Statuses</SelectItem>
              <SelectItem value='active'>Active</SelectItem>
              <SelectItem value='inactive'>Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className='flex justify-end space-x-2'>
        <Button variant='outline' onClick={handleReset}>
          Reset Filters
        </Button>
        <Button onClick={() => onFilterChange(filters)}>Apply Filters</Button>
      </div>
    </div>
  );
}
