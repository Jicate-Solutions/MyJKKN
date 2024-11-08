'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { CategoryService } from '@/lib/services/category-service';
import { Category } from '@/types/categories';
import type { ApplicationFilters as Filters } from '@/lib/services/application-service';
import { useDebounce } from '@/hooks/use-debounce';

interface ApplicationFiltersProps {
  filters: {
    search?: string;
    category?: string;
    isActive?: boolean;
  };
  onFilterChange: (filters: any) => void;
}

export function ApplicationFilters({
  filters,
  onFilterChange
}: ApplicationFiltersProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const data = await CategoryService.getCategories();
        setCategories(data);
      } catch (error) {
        console.error('Error loading categories:', error);
      } finally {
        setLoadingCategories(false);
      }
    };

    loadCategories();
  }, []);

  const debouncedSearch = useDebounce((value: string) => {
    onFilterChange({ search: value });
  }, 300);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      debouncedSearch(e.target.value);
    },
    [debouncedSearch]
  );

  const handleCategoryChange = (value: string) => {
    onFilterChange({ category: value === 'all' ? undefined : value });
  };

  const handleStatusChange = (value: string) => {
    onFilterChange({
      isActive: value === 'all' ? undefined : value === 'active'
    });
  };

  return (
    <div className='mb-6 space-y-4'>
      <div className='grid gap-4 md:grid-cols-3'>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            placeholder='Search applications...'
            onChange={handleSearchChange}
            defaultValue={filters.search}
            className='pl-10'
          />
        </div>

        <Select
          value={filters.category || 'all'}
          onValueChange={handleCategoryChange}
          disabled={loadingCategories}
        >
          <SelectTrigger>
            <SelectValue placeholder='Select category' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={
            filters.isActive === undefined
              ? 'all'
              : filters.isActive
              ? 'active'
              : 'inactive'
          }
          onValueChange={handleStatusChange}
        >
          <SelectTrigger>
            <SelectValue placeholder='Status' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Status</SelectItem>
            <SelectItem value='active'>Active</SelectItem>
            <SelectItem value='inactive'>Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}