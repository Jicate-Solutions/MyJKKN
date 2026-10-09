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
import { useScholarshipSetup } from '@/hooks/billing/use-scholarship-setup';
import type {
  ScholarshipFilters,
  ScholarshipValueMode,
  ApprovalStatus
} from '@/types/billing-schedule';

interface ScholarshipFiltersProps {
  filters: ScholarshipFilters;
  onFilterChange: (filters: Partial<ScholarshipFilters>) => void;
}

export function ScholarshipFilters({
  filters,
  onFilterChange
}: ScholarshipFiltersProps) {
  const { data: scholarshipTree = [] } = useScholarshipSetup();
  const typesOfSelectedCategory =
    scholarshipTree.find((c) => c.id === filters.scholarship_category_id)
      ?.types ?? [];

  const handleClearFilters = () => {
    onFilterChange({
      search: '',
      bill_id: undefined,
      scholarship_category_id: undefined,
      scholarship_type_id: undefined,
      value_mode: undefined,
      approval_status: undefined,
      effective_date_from: undefined,
      effective_date_to: undefined
    });
  };

  const hasActiveFilters =
    filters.search ||
    filters.bill_id ||
    filters.scholarship_category_id ||
    filters.scholarship_type_id ||
    filters.value_mode ||
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
            placeholder='Search scholarships...'
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className='pl-10'
          />
        </div>

        {/* Scholarship Category Filter */}
        <Select
          value={filters.scholarship_category_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              scholarship_category_id: value === 'all' ? undefined : value,
              // A type belongs to one category — drop it when the category moves.
              scholarship_type_id: undefined
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='All categories' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All categories</SelectItem>
            {scholarshipTree.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
                {category.is_active ? '' : ' (inactive)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Scholarship Type Filter (depends on the category) */}
        <Select
          value={filters.scholarship_type_id || 'all'}
          disabled={!filters.scholarship_category_id}
          onValueChange={(value) =>
            onFilterChange({
              scholarship_type_id: value === 'all' ? undefined : value
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='All scholarship types' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All scholarship types</SelectItem>
            {typesOfSelectedCategory.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
                {type.is_active ? '' : ' (inactive)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Value Mode Filter */}
        <Select
          value={filters.value_mode || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              value_mode:
                value === 'all' ? undefined : (value as ScholarshipValueMode)
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='All value modes' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All value modes</SelectItem>
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
