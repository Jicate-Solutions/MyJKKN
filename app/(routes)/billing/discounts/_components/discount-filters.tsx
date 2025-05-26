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
import type {
  DiscountFilters,
  DiscountCategory,
  DiscountType,
  ApprovalStatus
} from '@/types/billing-schedule';

interface DiscountFiltersProps {
  filters: DiscountFilters;
  onFilterChange: (filters: Partial<DiscountFilters>) => void;
}

export function DiscountFilters({
  filters,
  onFilterChange
}: DiscountFiltersProps) {
  const handleClearFilters = () => {
    onFilterChange({
      search: '',
      bill_id: undefined,
      discount_category: undefined,
      discount_type: undefined,
      approval_status: undefined,
      effective_date_from: undefined,
      effective_date_to: undefined
    });
  };

  const hasActiveFilters =
    filters.search ||
    filters.bill_id ||
    filters.discount_category ||
    filters.discount_type ||
    filters.approval_status ||
    filters.effective_date_from ||
    filters.effective_date_to;

  return (
    <div className='space-y-4 mb-6'>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
        {/* Search */}
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
          <Input
            placeholder='Search discounts...'
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className='pl-10'
          />
        </div>

        {/* Discount Category Filter */}
        <Select
          value={filters.discount_category || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              discount_category:
                value === 'all' ? undefined : (value as DiscountCategory)
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='All categories' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All categories</SelectItem>
            <SelectItem value='merit_scholarship'>Merit Scholarship</SelectItem>
            <SelectItem value='financial_aid'>Financial Aid</SelectItem>
            <SelectItem value='staff_quota'>Staff Quota</SelectItem>
            <SelectItem value='sports_quota'>Sports Quota</SelectItem>
            <SelectItem value='special_circumstances'>
              Special Circumstances
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Discount Type Filter */}
        <Select
          value={filters.discount_type || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              discount_type:
                value === 'all' ? undefined : (value as DiscountType)
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='All types' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All types</SelectItem>
            <SelectItem value='amount'>Fixed Amount</SelectItem>
            <SelectItem value='percentage'>Percentage</SelectItem>
          </SelectContent>
        </Select>

        {/* Approval Status Filter */}
        <Select
          value={filters.approval_status || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              approval_status:
                value === 'all' ? undefined : (value as ApprovalStatus)
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='All statuses' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All statuses</SelectItem>
            <SelectItem value='pending'>Pending</SelectItem>
            <SelectItem value='approved'>Approved</SelectItem>
            <SelectItem value='rejected'>Rejected</SelectItem>
          </SelectContent>
        </Select>

        {/* Bill ID */}
        <Input
          placeholder='Bill ID...'
          value={filters.bill_id || ''}
          onChange={(e) => onFilterChange({ bill_id: e.target.value })}
        />

        {/* Effective Date From */}
        <Input
          type='date'
          placeholder='Effective date from'
          value={filters.effective_date_from || ''}
          onChange={(e) =>
            onFilterChange({ effective_date_from: e.target.value })
          }
        />

        {/* Effective Date To */}
        <Input
          type='date'
          placeholder='Effective date to'
          value={filters.effective_date_to || ''}
          onChange={(e) =>
            onFilterChange({ effective_date_to: e.target.value })
          }
        />
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
