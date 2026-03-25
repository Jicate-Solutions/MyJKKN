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
import { BillingParentCategoryService } from '@/lib/services/billing/categories/billing-parent-category-service';
import type {
  BillingSubCategoryFilters,
  BillingParentCategory
} from '@/types/billing';
import type { Institution } from '@/types/organizations';

interface SubCategoryFiltersProps {
  filters: BillingSubCategoryFilters;
  onFilterChange: (filters: Partial<BillingSubCategoryFilters>) => void;
}

export function SubCategoryFilters({
  filters,
  onFilterChange
}: SubCategoryFiltersProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [parentCategories, setParentCategories] = useState<
    BillingParentCategory[]
  >([]);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);
  const [isLoadingParentCategories, setIsLoadingParentCategories] =
    useState(false);

  useEffect(() => {
    loadInstitutions();
  }, []);

  // Load parent categories when institution filter changes
  useEffect(() => {
    if (filters.institution_id) {
      loadParentCategories(filters.institution_id);
    } else {
      setParentCategories([]);
      // Clear parent category filter if institution is cleared
      if (filters.parent_category_id) {
        onFilterChange({ parent_category_id: undefined });
      }
    }
  }, [filters.institution_id, filters.parent_category_id, onFilterChange]);

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

  const loadParentCategories = async (institutionId: string) => {
    try {
      setIsLoadingParentCategories(true);
      const categories =
        await BillingParentCategoryService.getBillingParentCategoriesByInstitution(
          institutionId,
          true // Only active categories
        );
      setParentCategories(categories);
    } catch (error) {
      console.error('Error loading parent categories:', error);
    } finally {
      setIsLoadingParentCategories(false);
    }
  };

  const handleClearFilters = () => {
    onFilterChange({
      search: '',
      institution_id: undefined,
      parent_category_id: undefined,
      isActive: undefined
    });
  };

  const hasActiveFilters =
    filters.search ||
    filters.institution_id ||
    filters.parent_category_id ||
    filters.isActive !== undefined;

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

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        {/* Search Filter */}
        <div className='space-y-2'>
          <Label htmlFor='search'>Search</Label>
          <div className='relative'>
            <Search className='absolute left-3 top-3 h-4 w-4 text-muted-foreground' />
            <Input
              id='search'
              placeholder='Search by sub category name...'
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
            value={filters.institution_id || 'all'}
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

        {/* Parent Category Filter */}
        <div className='space-y-2'>
          <Label htmlFor='parent-category'>Parent Category</Label>
          <Select
            value={filters.parent_category_id || 'all'}
            onValueChange={(value) =>
              onFilterChange({
                parent_category_id: value === 'all' ? undefined : value
              })
            }
            disabled={!filters.institution_id || isLoadingParentCategories}
          >
            <SelectTrigger id='parent-category'>
              <SelectValue
                placeholder={
                  !filters.institution_id
                    ? 'Select institution first'
                    : isLoadingParentCategories
                    ? 'Loading categories...'
                    : 'All parent categories'
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All parent categories</SelectItem>
              {parentCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.parent_category_name}
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
