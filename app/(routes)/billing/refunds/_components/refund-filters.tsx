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
  RefundFilters,
  RefundCategory,
  RefundMethod,
  ApprovalStatus
} from '@/types/billing-schedule';

interface RefundFiltersProps {
  filters: RefundFilters;
  onFilterChange: (filters: Partial<RefundFilters>) => void;
}

export function RefundFilters({ filters, onFilterChange }: RefundFiltersProps) {
  const handleClearFilters = () => {
    onFilterChange({
      search: '',
      receipt_id: undefined,
      refund_category: undefined,
      refund_method: undefined,
      approval_status: undefined,
      refund_date_from: undefined,
      refund_date_to: undefined
    });
  };

  const hasActiveFilters =
    filters.search ||
    filters.receipt_id ||
    filters.refund_category ||
    filters.refund_method ||
    filters.approval_status ||
    filters.refund_date_from ||
    filters.refund_date_to;

  return (
    <div className='space-y-4 mb-6'>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
        {/* Search */}
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
          <Input
            placeholder='Search refunds...'
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className='pl-10'
          />
        </div>

        {/* Refund Category Filter */}
        <Select
          value={filters.refund_category || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              refund_category:
                value === 'all' ? undefined : (value as RefundCategory)
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='All categories' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All categories</SelectItem>
            <SelectItem value='overpayment'>Overpayment</SelectItem>
            <SelectItem value='duplicate_payment'>Duplicate Payment</SelectItem>
            <SelectItem value='withdrawal'>Withdrawal</SelectItem>
            <SelectItem value='fee_adjustment'>Fee Adjustment</SelectItem>
            <SelectItem value='other'>Other</SelectItem>
          </SelectContent>
        </Select>

        {/* Refund Method Filter */}
        <Select
          value={filters.refund_method || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              refund_method:
                value === 'all' ? undefined : (value as RefundMethod)
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='All methods' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All methods</SelectItem>
            <SelectItem value='bank_transfer'>Bank Transfer</SelectItem>
            <SelectItem value='cash'>Cash</SelectItem>
            <SelectItem value='cheque'>Cheque</SelectItem>
            <SelectItem value='online'>Online</SelectItem>
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
            <SelectItem value='completed'>Completed</SelectItem>
            <SelectItem value='rejected'>Rejected</SelectItem>
          </SelectContent>
        </Select>

        {/* Receipt ID */}
        <Input
          placeholder='Receipt ID...'
          value={filters.receipt_id || ''}
          onChange={(e) => onFilterChange({ receipt_id: e.target.value })}
        />

        {/* Refund Date From */}
        <Input
          type='date'
          placeholder='Refund date from'
          value={filters.refund_date_from || ''}
          onChange={(e) => onFilterChange({ refund_date_from: e.target.value })}
        />

        {/* Refund Date To */}
        <Input
          type='date'
          placeholder='Refund date to'
          value={filters.refund_date_to || ''}
          onChange={(e) => onFilterChange({ refund_date_to: e.target.value })}
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
