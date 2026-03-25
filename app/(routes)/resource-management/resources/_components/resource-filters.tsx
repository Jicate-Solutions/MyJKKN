// app/(routes)/resource-management/resources/_components/resource-filters.tsx

'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, X, ChevronDown, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';
import type { ResourceFilters } from '@/types/resource-management';
import { useParentCategoriesSelect } from '@/hooks/resource-management/use-parent-categories';
import { useSubCategoriesSelect } from '@/hooks/resource-management/use-sub-categories';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useDepartments } from '@/hooks/organization/use-departments';

interface ResourceFiltersComponentProps {
  filters: ResourceFilters;
  onFilterChange: (filters: Partial<ResourceFilters>) => void;
  onSearch: (search: string) => void;
}

export function ResourceFiltersComponent({
  filters,
  onFilterChange,
  onSearch
}: ResourceFiltersComponentProps) {
  const [searchValue, setSearchValue] = useState(filters.search || '');
  const [showFilters, setShowFilters] = useState(false);

  const { institutions } = useUserInstitutionAccess();
  const { categories: parentCategories } = useParentCategoriesSelect();
  const { categories: subcategories } = useSubCategoriesSelect(
    filters.parent_category_id
  );

  // Fetch departments based on selected institution filter
  const { data: departmentsData } = useDepartments({
    institution_id: filters.institution_id
  });
  const departments = departmentsData?.data || [];

  // Update search value when filters change
  useEffect(() => {
    setSearchValue(filters.search || '');
  }, [filters.search]);

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== filters.search) {
        onSearch(searchValue);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchValue, filters.search, onSearch]);

  const handleClearFilters = () => {
    setSearchValue('');
    onFilterChange({
      search: '',
      parent_category_id: undefined,
      subcategory_id: undefined,
      institution_id: undefined,
      department_id: undefined,
      status: undefined,
      booking_type: undefined,
      sortBy: 'created_at',
      sortOrder: 'desc'
    });
  };

  const hasActiveFilters =
    filters.parent_category_id ||
    filters.subcategory_id ||
    filters.institution_id ||
    filters.department_id ||
    filters.status ||
    filters.booking_type;

  return (
    <div className='space-y-4'>
      {/* Search Bar - Always Visible */}
      <div className='flex items-center gap-4'>
        <div className='relative flex-1'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            placeholder='Search resources by name or description...'
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className='pl-9'
          />
          {searchValue && (
            <Button
              variant='ghost'
              size='sm'
              className='absolute right-1 top-1/2 -translate-y-1/2'
              onClick={() => setSearchValue('')}
            >
              <X className='h-4 w-4' />
            </Button>
          )}
        </div>

        {/* Toggle Filters Button */}
        <Button
          variant='outline'
          onClick={() => setShowFilters(!showFilters)}
          className='gap-2'
        >
          <Filter className='h-4 w-4' />
          {showFilters ? 'Hide Filters' : 'Show Filters'}
          {hasActiveFilters && (
            <span className='ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground'>
              •
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              showFilters ? 'rotate-180' : ''
            }`}
          />
        </Button>

        {hasActiveFilters && (
          <Button
            variant='outline'
            size='sm'
            onClick={handleClearFilters}
            className='gap-2'
          >
            <RotateCcw className='h-4 w-4' />
            Clear All
          </Button>
        )}
      </div>

      {/* Collapsible Filters Section */}
      <Collapsible open={showFilters} onOpenChange={setShowFilters}>
        <CollapsibleContent>
          <Card>
            <CardContent className='pt-6'>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
                {/* Institution Filter */}
                <div className='space-y-2'>
                  <Label>Institution</Label>
                  <Select
                    value={filters.institution_id || 'all'}
                    onValueChange={(value) =>
                      onFilterChange({
                        institution_id: value === 'all' ? undefined : value,
                        department_id: undefined // Reset department when institution changes
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='All institutions' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All institutions</SelectItem>
                      {institutions.map((inst) => (
                        <SelectItem key={inst.institution_id} value={inst.institution_id}>
                          {inst.institution_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Department Filter - Only enabled when institution is selected */}
                <div className='space-y-2'>
                  <Label>Department</Label>
                  <Select
                    value={filters.department_id || 'all'}
                    onValueChange={(value) =>
                      onFilterChange({
                        department_id: value === 'all' ? undefined : value
                      })
                    }
                    disabled={!filters.institution_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={
                        filters.institution_id
                          ? 'All departments'
                          : 'Select institution first'
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All departments</SelectItem>
                      {departments.map((dept: any) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.department_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Parent Category Filter */}
                <div className='space-y-2'>
                  <Label>Category</Label>
                  <Select
                    value={filters.parent_category_id || 'all'}
                    onValueChange={(value) =>
                      onFilterChange({
                        parent_category_id: value === 'all' ? undefined : value,
                        subcategory_id: undefined
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='All categories' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All categories</SelectItem>
                      {parentCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Sub Category Filter - Only enabled when parent category is selected */}
                <div className='space-y-2'>
                  <Label>Sub-Category</Label>
                  <Select
                    value={filters.subcategory_id || 'all'}
                    onValueChange={(value) =>
                      onFilterChange({
                        subcategory_id: value === 'all' ? undefined : value
                      })
                    }
                    disabled={!filters.parent_category_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={
                        filters.parent_category_id
                          ? 'All sub-categories'
                          : 'Select category first'
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All sub-categories</SelectItem>
                      {subcategories.map((sub: any) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          {sub.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Status Filter */}
                <div className='space-y-2'>
                  <Label>Status</Label>
                  <Select
                    value={filters.status || 'all'}
                    onValueChange={(value) =>
                      onFilterChange({
                        status: (value === 'all' ? undefined : value) as any
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='All statuses' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All statuses</SelectItem>
                      <SelectItem value='available'>Available</SelectItem>
                      <SelectItem value='occupied'>Occupied</SelectItem>
                      <SelectItem value='maintenance'>Maintenance</SelectItem>
                      <SelectItem value='retired'>Retired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Booking Type Filter */}
                <div className='space-y-2'>
                  <Label>Booking Type</Label>
                  <Select
                    value={filters.booking_type || 'all'}
                    onValueChange={(value) =>
                      onFilterChange({
                        booking_type: (value === 'all' ? undefined : value) as any
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='All booking types' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All booking types</SelectItem>
                      <SelectItem value='reservation'>Reservation</SelectItem>
                      <SelectItem value='walk_in'>Walk-in</SelectItem>
                      <SelectItem value='both'>Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Sort By */}
                <div className='space-y-2'>
                  <Label>Sort By</Label>
                  <Select
                    value={filters.sortBy || 'created_at'}
                    onValueChange={(value) =>
                      onFilterChange({ sortBy: value as any })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='created_at'>Created Date</SelectItem>
                      <SelectItem value='name'>Name</SelectItem>
                      <SelectItem value='status'>Status</SelectItem>
                      <SelectItem value='reservation_count'>
                        Reservations
                      </SelectItem>
                      <SelectItem value='usage_count'>Usage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Sort Order */}
                <div className='space-y-2'>
                  <Label>Sort Order</Label>
                  <Select
                    value={filters.sortOrder || 'desc'}
                    onValueChange={(value) =>
                      onFilterChange({ sortOrder: value as 'asc' | 'desc' })
                    }
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
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-sm text-muted-foreground'>Active filters:</span>
          {filters.institution_id && (
            <Button
              variant='secondary'
              size='sm'
              onClick={() =>
                onFilterChange({
                  institution_id: undefined,
                  department_id: undefined
                })
              }
            >
              Institution
              <X className='ml-2 h-3 w-3' />
            </Button>
          )}
          {filters.department_id && (
            <Button
              variant='secondary'
              size='sm'
              onClick={() => onFilterChange({ department_id: undefined })}
            >
              Department
              <X className='ml-2 h-3 w-3' />
            </Button>
          )}
          {filters.parent_category_id && (
            <Button
              variant='secondary'
              size='sm'
              onClick={() =>
                onFilterChange({
                  parent_category_id: undefined,
                  subcategory_id: undefined
                })
              }
            >
              Category
              <X className='ml-2 h-3 w-3' />
            </Button>
          )}
          {filters.subcategory_id && (
            <Button
              variant='secondary'
              size='sm'
              onClick={() => onFilterChange({ subcategory_id: undefined })}
            >
              Sub-Category
              <X className='ml-2 h-3 w-3' />
            </Button>
          )}
          {filters.status && (
            <Button
              variant='secondary'
              size='sm'
              onClick={() => onFilterChange({ status: undefined })}
            >
              {filters.status}
              <X className='ml-2 h-3 w-3' />
            </Button>
          )}
          {filters.booking_type && (
            <Button
              variant='secondary'
              size='sm'
              onClick={() => onFilterChange({ booking_type: undefined })}
            >
              {filters.booking_type}
              <X className='ml-2 h-3 w-3' />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
