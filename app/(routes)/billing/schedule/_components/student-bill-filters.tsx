'use client';

import { useState, useEffect } from 'react';
import { Search, X, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { BillingItemCategoryService } from '@/lib/services/billing/categories/billing-item-category-service';
import type { Institution } from '@/types/organizations';
import type { BillingItemCategory } from '@/types/billing';
import type { StudentBillFilters, BillStatus } from '@/types/billing-schedule';

interface StudentBillFiltersProps {
  filters: StudentBillFilters;
  onFilterChange: (filters: Partial<StudentBillFilters>) => void;
}

export function StudentBillFilters({
  filters,
  onFilterChange
}: StudentBillFiltersProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [itemCategories, setItemCategories] = useState<BillingItemCategory[]>(
    []
  );
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);
  const [isLoadingItemCategories, setIsLoadingItemCategories] = useState(false);

  useEffect(() => {
    loadInstitutions();
  }, []);

  useEffect(() => {
    if (filters.institution_id) {
      loadItemCategories(filters.institution_id);
    } else {
      setItemCategories([]);
    }
  }, [filters.institution_id]);

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

  const loadItemCategories = async (institutionId: string) => {
    try {
      setIsLoadingItemCategories(true);
      const categories =
        await BillingItemCategoryService.getBillingItemCategoriesByInstitution(
          institutionId,
          true
        );
      setItemCategories(categories);
    } catch (error) {
      console.error('Error loading item categories:', error);
    } finally {
      setIsLoadingItemCategories(false);
    }
  };

  const handleClearFilters = () => {
    onFilterChange({
      search: '',
      institution_id: undefined,
      item_category_id: undefined,
      status: undefined,
      due_date_from: undefined,
      due_date_to: undefined,
      amount_from: undefined,
      amount_to: undefined,
      is_recurring: undefined
    });
  };

  const hasActiveFilters =
    filters.search ||
    filters.institution_id ||
    filters.item_category_id ||
    filters.status ||
    filters.due_date_from ||
    filters.due_date_to ||
    filters.amount_from ||
    filters.amount_to ||
    filters.is_recurring !== undefined;

  const statusOptions: { value: BillStatus; label: string; color: string }[] = [
    {
      value: 'unpaid',
      label: 'Unpaid',
      color: 'bg-orange-100 text-orange-800'
    },
    { value: 'paid', label: 'Paid', color: 'bg-green-100 text-green-800' },
    {
      value: 'partially_paid',
      label: 'Partially Paid',
      color: 'bg-blue-100 text-blue-800'
    },
    { value: 'overdue', label: 'Overdue', color: 'bg-red-100 text-red-800' },
    {
      value: 'cancelled',
      label: 'Cancelled',
      color: 'bg-gray-100 text-gray-800'
    },
    {
      value: 'refunded',
      label: 'Refunded',
      color: 'bg-purple-100 text-purple-800'
    }
  ];

  return (
    <div className='space-y-4 mb-6'>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
        {/* Search */}
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
          <Input
            placeholder='Search bills, students...'
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
              item_category_id: undefined
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

        {/* Item Category Filter */}
        <Select
          value={filters.item_category_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              item_category_id: value === 'all' ? undefined : value
            })
          }
          disabled={!filters.institution_id || isLoadingItemCategories}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !filters.institution_id
                  ? 'Select institution first'
                  : isLoadingItemCategories
                  ? 'Loading categories...'
                  : 'All item categories'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All item categories</SelectItem>
            {itemCategories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.item_category_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select
          value={filters.status || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              status: value === 'all' ? undefined : (value as BillStatus)
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='All statuses' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All statuses</SelectItem>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className='flex items-center gap-2'>
                  <Badge className={`text-xs ${option.color}`}>
                    {option.label}
                  </Badge>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date Range Filters */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        <div className='space-y-2'>
          <label className='text-sm font-medium'>Due Date From</label>
          <div className='relative'>
            <Calendar className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
            <Input
              type='date'
              value={filters.due_date_from || ''}
              onChange={(e) =>
                onFilterChange({ due_date_from: e.target.value })
              }
              className='pl-10'
            />
          </div>
        </div>

        <div className='space-y-2'>
          <label className='text-sm font-medium'>Due Date To</label>
          <div className='relative'>
            <Calendar className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
            <Input
              type='date'
              value={filters.due_date_to || ''}
              onChange={(e) => onFilterChange({ due_date_to: e.target.value })}
              className='pl-10'
            />
          </div>
        </div>

        <div className='space-y-2'>
          <label className='text-sm font-medium'>Amount From</label>
          <Input
            type='number'
            placeholder='Min amount'
            value={filters.amount_from || ''}
            onChange={(e) =>
              onFilterChange({
                amount_from: e.target.value
                  ? parseFloat(e.target.value)
                  : undefined
              })
            }
          />
        </div>

        <div className='space-y-2'>
          <label className='text-sm font-medium'>Amount To</label>
          <Input
            type='number'
            placeholder='Max amount'
            value={filters.amount_to || ''}
            onChange={(e) =>
              onFilterChange({
                amount_to: e.target.value
                  ? parseFloat(e.target.value)
                  : undefined
              })
            }
          />
        </div>
      </div>

      {/* Additional Filters */}
      <div className='flex flex-wrap gap-4 items-center'>
        <Select
          value={
            filters.is_recurring === undefined
              ? 'all'
              : filters.is_recurring.toString()
          }
          onValueChange={(value) =>
            onFilterChange({
              is_recurring: value === 'all' ? undefined : value === 'true'
            })
          }
        >
          <SelectTrigger className='w-48'>
            <SelectValue placeholder='Recurring bills' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All bills</SelectItem>
            <SelectItem value='true'>Recurring only</SelectItem>
            <SelectItem value='false'>One-time only</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant='outline'
            size='sm'
            onClick={handleClearFilters}
            className='flex items-center gap-2'
          >
            <X className='h-4 w-4' />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className='flex flex-wrap gap-2'>
          {filters.search && (
            <Badge variant='secondary' className='flex items-center gap-1'>
              Search: {filters.search}
              <X
                className='h-3 w-3 cursor-pointer'
                onClick={() => onFilterChange({ search: '' })}
              />
            </Badge>
          )}
          {filters.status && (
            <Badge variant='secondary' className='flex items-center gap-1'>
              Status:{' '}
              {statusOptions.find((s) => s.value === filters.status)?.label}
              <X
                className='h-3 w-3 cursor-pointer'
                onClick={() => onFilterChange({ status: undefined })}
              />
            </Badge>
          )}
          {filters.due_date_from && (
            <Badge variant='secondary' className='flex items-center gap-1'>
              From: {filters.due_date_from}
              <X
                className='h-3 w-3 cursor-pointer'
                onClick={() => onFilterChange({ due_date_from: undefined })}
              />
            </Badge>
          )}
          {filters.due_date_to && (
            <Badge variant='secondary' className='flex items-center gap-1'>
              To: {filters.due_date_to}
              <X
                className='h-3 w-3 cursor-pointer'
                onClick={() => onFilterChange({ due_date_to: undefined })}
              />
            </Badge>
          )}
          {filters.is_recurring !== undefined && (
            <Badge variant='secondary' className='flex items-center gap-1'>
              {filters.is_recurring ? 'Recurring' : 'One-time'}
              <X
                className='h-3 w-3 cursor-pointer'
                onClick={() => onFilterChange({ is_recurring: undefined })}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
