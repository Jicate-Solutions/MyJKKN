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
import { CategoryService } from '@/lib/services/application/category-service';
import { Category } from '@/types/categories';
import { ApplicationsSearchParams } from './data-table-schema';
import { usePermissions } from '@/hooks/use-permissions';

interface ApplicationFiltersProps {
  searchParams: ApplicationsSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function ApplicationFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: ApplicationFiltersProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();

  useEffect(() => {
    async function loadCategories() {
      try {
        setLoading(true);
        const data = await CategoryService.getCategories();
        setCategories(data);
      } catch (error) {
        console.error('Error loading categories:', error);
      } finally {
        setLoading(false);
      }
    }
    loadCategories();
  }, []);

  const hasActiveFilters = !!(
    searchParams.category ||
    searchParams.isActive ||
    searchParams.integration_type ||
    searchParams.auth_method ||
    searchParams.platform ||
    searchParams.uses_parent_auth
  );

  return (
    <div className='space-y-4'>
      {/* Filters Row */}
      <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center flex-wrap'>
          {/* Category Filter */}
          <div className='min-w-[200px]'>
            <Select
              value={searchParams.category || 'all'}
              onValueChange={(value) =>
                onFilterChange('category', value === 'all' ? undefined : value)
              }
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={loading ? 'Loading...' : 'All Categories'}
                />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto'>
                <SelectItem value='all'>All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div className='min-w-[150px]'>
            <Select
              value={searchParams.isActive || 'all'}
              onValueChange={(value) =>
                onFilterChange('isActive', value === 'all' ? undefined : value)
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

          {/* Integration Type Filter */}
          <div className='min-w-[150px]'>
            <Select
              value={searchParams.integration_type || 'all'}
              onValueChange={(value) =>
                onFilterChange(
                  'integration_type',
                  value === 'all' ? undefined : value
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='All Types' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Types</SelectItem>
                <SelectItem value='direct_link'>Direct Link</SelectItem>
                <SelectItem value='embedded'>Embedded</SelectItem>
                <SelectItem value='api'>API</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Auth Method Filter */}
          <div className='min-w-[150px]'>
            <Select
              value={searchParams.auth_method || 'all'}
              onValueChange={(value) =>
                onFilterChange(
                  'auth_method',
                  value === 'all' ? undefined : value
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='All Auth' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Auth</SelectItem>
                <SelectItem value='sso'>SSO</SelectItem>
                <SelectItem value='separate_login'>Separate Login</SelectItem>
                <SelectItem value='none'>None</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Platform Filter */}
          <div className='min-w-[150px]'>
            <Select
              value={searchParams.platform || 'all'}
              onValueChange={(value) =>
                onFilterChange('platform', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='All Platforms' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Platforms</SelectItem>
                <SelectItem value='web'>Web</SelectItem>
                <SelectItem value='mobile'>Mobile</SelectItem>
                <SelectItem value='both'>Both</SelectItem>
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
