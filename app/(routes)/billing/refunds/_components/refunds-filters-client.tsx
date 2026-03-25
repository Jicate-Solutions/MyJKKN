/**
 * Refunds Filters Client Component
 *
 * URL-based filtering for refund list page.
 * Updates URL search params instead of using local state.
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
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
import { Search, X, Filter } from 'lucide-react';

export function RefundsFiltersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleFilterChange = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams);

    if (value && value !== 'all') {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    // Reset to page 1 when filters change
    params.set('page', '1');

    startTransition(() => {
      router.push(`/billing/refunds?${params.toString()}`);
    });
  };

  const handleClearFilters = () => {
    const params = new URLSearchParams();
    // Keep only page and limit
    params.set('page', '1');
    const currentLimit = searchParams.get('limit');
    if (currentLimit) {
      params.set('limit', currentLimit);
    }

    startTransition(() => {
      router.push(`/billing/refunds?${params.toString()}`);
    });
  };

  const hasActiveFilters =
    searchParams.get('search') ||
    searchParams.get('approval_status') ||
    searchParams.get('refund_category') ||
    searchParams.get('refund_method') ||
    searchParams.get('refund_date_from') ||
    searchParams.get('refund_date_to');

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <Filter className='h-4 w-4 text-muted-foreground' />
          <h3 className='text-sm font-medium'>Filters</h3>
        </div>
        {hasActiveFilters && (
          <Button
            variant='ghost'
            size='sm'
            onClick={handleClearFilters}
            disabled={isPending}
          >
            <X className='mr-2 h-4 w-4' />
            Clear All
          </Button>
        )}
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        {/* Search Input */}
        <div className='space-y-2'>
          <Label htmlFor='search' className='text-sm'>
            Search
          </Label>
          <div className='relative'>
            <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input
              id='search'
              placeholder='Student, receipt number...'
              defaultValue={searchParams.get('search') || ''}
              onChange={(e) =>
                handleFilterChange('search', e.target.value || undefined)
              }
              disabled={isPending}
              className='pl-9'
            />
          </div>
        </div>

        {/* Approval Status Filter */}
        <div className='space-y-2'>
          <Label htmlFor='approval_status' className='text-sm'>
            Approval Status
          </Label>
          <Select
            value={searchParams.get('approval_status') || 'all'}
            onValueChange={(value) => handleFilterChange('approval_status', value)}
            disabled={isPending}
          >
            <SelectTrigger id='approval_status'>
              <SelectValue placeholder='All Statuses' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Statuses</SelectItem>
              <SelectItem value='pending'>Pending</SelectItem>
              <SelectItem value='approved'>Approved</SelectItem>
              <SelectItem value='rejected'>Rejected</SelectItem>
              <SelectItem value='processed'>Processed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Refund Category Filter */}
        <div className='space-y-2'>
          <Label htmlFor='refund_category' className='text-sm'>
            Refund Category
          </Label>
          <Select
            value={searchParams.get('refund_category') || 'all'}
            onValueChange={(value) => handleFilterChange('refund_category', value)}
            disabled={isPending}
          >
            <SelectTrigger id='refund_category'>
              <SelectValue placeholder='All Categories' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Categories</SelectItem>
              <SelectItem value='full_refund'>Full Refund</SelectItem>
              <SelectItem value='partial_refund'>Partial Refund</SelectItem>
              <SelectItem value='overpayment'>Overpayment</SelectItem>
              <SelectItem value='duplicate_payment'>Duplicate Payment</SelectItem>
              <SelectItem value='cancellation'>Cancellation</SelectItem>
              <SelectItem value='other'>Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Refund Method Filter */}
        <div className='space-y-2'>
          <Label htmlFor='refund_method' className='text-sm'>
            Refund Method
          </Label>
          <Select
            value={searchParams.get('refund_method') || 'all'}
            onValueChange={(value) => handleFilterChange('refund_method', value)}
            disabled={isPending}
          >
            <SelectTrigger id='refund_method'>
              <SelectValue placeholder='All Methods' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Methods</SelectItem>
              <SelectItem value='bank_transfer'>Bank Transfer</SelectItem>
              <SelectItem value='cash'>Cash</SelectItem>
              <SelectItem value='cheque'>Cheque</SelectItem>
              <SelectItem value='original_payment_method'>Original Payment Method</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date From */}
        <div className='space-y-2'>
          <Label htmlFor='refund_date_from' className='text-sm'>
            From Date
          </Label>
          <Input
            id='refund_date_from'
            type='date'
            defaultValue={searchParams.get('refund_date_from') || ''}
            onChange={(e) =>
              handleFilterChange('refund_date_from', e.target.value || undefined)
            }
            disabled={isPending}
          />
        </div>

        {/* Date To */}
        <div className='space-y-2'>
          <Label htmlFor='refund_date_to' className='text-sm'>
            To Date
          </Label>
          <Input
            id='refund_date_to'
            type='date'
            defaultValue={searchParams.get('refund_date_to') || ''}
            onChange={(e) =>
              handleFilterChange('refund_date_to', e.target.value || undefined)
            }
            disabled={isPending}
          />
        </div>

        {/* Sort By */}
        <div className='space-y-2'>
          <Label htmlFor='sortBy' className='text-sm'>
            Sort By
          </Label>
          <Select
            value={searchParams.get('sortBy') || 'refund_date'}
            onValueChange={(value) => handleFilterChange('sortBy', value)}
            disabled={isPending}
          >
            <SelectTrigger id='sortBy'>
              <SelectValue placeholder='Sort By' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='refund_date'>Refund Date</SelectItem>
              <SelectItem value='refund_amount'>Refund Amount</SelectItem>
              <SelectItem value='approval_status'>Approval Status</SelectItem>
              <SelectItem value='student_name'>Student Name</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sort Direction */}
        <div className='space-y-2'>
          <Label htmlFor='sortDirection' className='text-sm'>
            Order
          </Label>
          <Select
            value={searchParams.get('sortDirection') || 'desc'}
            onValueChange={(value) => handleFilterChange('sortDirection', value)}
            disabled={isPending}
          >
            <SelectTrigger id='sortDirection'>
              <SelectValue placeholder='Order' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='asc'>Ascending</SelectItem>
              <SelectItem value='desc'>Descending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
