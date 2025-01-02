'use client';

import { useCallback } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import { CategoryService } from '@/lib/services/application/category-service';
import { Category } from '@/types/categories';

interface ApplicationHubFiltersProps {
  categories: Category[];
  filters: {
    search?: string;
    category?: string;
  };
  onFilterChange: (filters: any) => void;
}

export function ApplicationHubFilters({
  categories,
  filters,
  onFilterChange
}: ApplicationHubFiltersProps) {
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
    console.log('Selected category:', value);
    onFilterChange({ category: value === 'all' ? undefined : value });
  };

  return (
    <div className='mb-6 space-y-4'>
      <div className='grid gap-4 md:grid-cols-2'>
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
      </div>
    </div>
  );
}
