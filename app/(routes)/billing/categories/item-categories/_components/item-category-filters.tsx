'use client';

import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { BillingParentCategoryService } from '@/lib/services/billing/categories/billing-parent-category-service';
import { BillingSubCategoryService } from '@/lib/services/billing/categories/billing-sub-category-service';
import type { Institution } from '@/types/organizations';
import type {
  BillingParentCategory,
  BillingSubCategory,
  BillingItemCategoryFilters
} from '@/types/billing';

interface ItemCategoryFiltersProps {
  filters: BillingItemCategoryFilters;
  onFilterChange: (filters: Partial<BillingItemCategoryFilters>) => void;
}

export function ItemCategoryFilters({
  filters,
  onFilterChange
}: ItemCategoryFiltersProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [parentCategories, setParentCategories] = useState<
    BillingParentCategory[]
  >([]);
  const [subCategories, setSubCategories] = useState<BillingSubCategory[]>([]);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);
  const [isLoadingParentCategories, setIsLoadingParentCategories] =
    useState(false);
  const [isLoadingSubCategories, setIsLoadingSubCategories] = useState(false);

  useEffect(() => {
    loadInstitutions();
  }, []);

  useEffect(() => {
    if (filters.institution_id) {
      loadParentCategories(filters.institution_id);
    } else {
      setParentCategories([]);
      setSubCategories([]);
    }
  }, [filters.institution_id]);

  useEffect(() => {
    if (filters.parent_category_id) {
      loadSubCategories(filters.parent_category_id);
    } else {
      setSubCategories([]);
    }
  }, [filters.parent_category_id]);

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
          true
        );
      setParentCategories(categories);
    } catch (error) {
      console.error('Error loading parent categories:', error);
    } finally {
      setIsLoadingParentCategories(false);
    }
  };

  const loadSubCategories = async (parentCategoryId: string) => {
    try {
      setIsLoadingSubCategories(true);
      const categories =
        await BillingSubCategoryService.getBillingSubCategoriesByParentCategory(
          parentCategoryId,
          true
        );
      setSubCategories(categories);
    } catch (error) {
      console.error('Error loading sub categories:', error);
    } finally {
      setIsLoadingSubCategories(false);
    }
  };

  const handleClearFilters = () => {
    onFilterChange({
      search: '',
      institution_id: undefined,
      parent_category_id: undefined,
      sub_category_id: undefined,
      frequency: undefined,
      isActive: undefined
    });
  };

  const hasActiveFilters =
    filters.search ||
    filters.institution_id ||
    filters.parent_category_id ||
    filters.sub_category_id ||
    filters.frequency ||
    filters.isActive !== undefined;

  return (
    <div className='space-y-4 mb-6'>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
        {/* Search */}
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
          <Input
            placeholder='Search item categories...'
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className='pl-10'
          />
        </div>

        {/* Institution Filter */}
        <Select
          value={filters.institution_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              institution_id: value === 'all' ? undefined : value,
              parent_category_id: '',
              sub_category_id: ''
            })
          }
        >
          <SelectTrigger>
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

        {/* Parent Category Filter */}
        <Select
          value={filters.parent_category_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              parent_category_id: value === 'all' ? undefined : value,
              sub_category_id: ''
            })
          }
          disabled={!filters.institution_id || isLoadingParentCategories}
        >
          <SelectTrigger>
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

        {/* Sub Category Filter */}
        <Select
          value={filters.sub_category_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              sub_category_id: value === 'all' ? undefined : value
            })
          }
          disabled={!filters.parent_category_id || isLoadingSubCategories}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !filters.parent_category_id
                  ? 'Select parent category first'
                  : isLoadingSubCategories
                  ? 'Loading sub categories...'
                  : 'All sub categories'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All sub categories</SelectItem>
            {subCategories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.sub_category_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Frequency Filter */}
        <Select
          value={filters.frequency || 'all'}
          onValueChange={(value) =>
            onFilterChange({ frequency: value === 'all' ? undefined : value })
          }
        >
          <SelectTrigger>
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

        {/* Status Filter */}
        <Select
          value={
            filters.isActive === undefined
              ? 'all'
              : filters.isActive
              ? 'active'
              : 'inactive'
          }
          onValueChange={(value) =>
            onFilterChange({
              isActive:
                value === 'all' ? undefined : value === 'active' ? true : false
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='All statuses' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All statuses</SelectItem>
            <SelectItem value='active'>Active</SelectItem>
            <SelectItem value='inactive'>Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <div className='flex justify-end'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleClearFilters}
            className='h-8'
          >
            <X className='mr-2 h-4 w-4' />
            Clear Filters
          </Button>
        </div>
      )}
    </div>
  );
}
