/**
 * Invoices Filters Client Component
 *
 * URL-based filtering for invoice list page.
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

export function InvoicesFiltersClient() {
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
      router.push(`/billing/invoices?${params.toString()}`);
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
      router.push(`/billing/invoices?${params.toString()}`);
    });
  };

  const hasActiveFilters =
    searchParams.get('search') ||
    searchParams.get('institution_id') ||
    searchParams.get('student_id') ||
    searchParams.get('invoice_type') ||
    searchParams.get('invoice_date_from') ||
    searchParams.get('invoice_date_to');

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
              placeholder='Invoice number, student...'
              defaultValue={searchParams.get('search') || ''}
              onChange={(e) =>
                handleFilterChange('search', e.target.value || undefined)
              }
              disabled={isPending}
              className='pl-9'
            />
          </div>
        </div>

        {/* Invoice Type Filter */}
        <div className='space-y-2'>
          <Label htmlFor='invoice_type' className='text-sm'>
            Invoice Type
          </Label>
          <Select
            value={searchParams.get('invoice_type') || 'all'}
            onValueChange={(value) => handleFilterChange('invoice_type', value)}
            disabled={isPending}
          >
            <SelectTrigger id='invoice_type'>
              <SelectValue placeholder='All Types' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Types</SelectItem>
              <SelectItem value='individual'>Individual</SelectItem>
              <SelectItem value='consolidated'>Consolidated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date From */}
        <div className='space-y-2'>
          <Label htmlFor='invoice_date_from' className='text-sm'>
            From Date
          </Label>
          <Input
            id='invoice_date_from'
            type='date'
            defaultValue={searchParams.get('invoice_date_from') || ''}
            onChange={(e) =>
              handleFilterChange('invoice_date_from', e.target.value || undefined)
            }
            disabled={isPending}
          />
        </div>

        {/* Date To */}
        <div className='space-y-2'>
          <Label htmlFor='invoice_date_to' className='text-sm'>
            To Date
          </Label>
          <Input
            id='invoice_date_to'
            type='date'
            defaultValue={searchParams.get('invoice_date_to') || ''}
            onChange={(e) =>
              handleFilterChange('invoice_date_to', e.target.value || undefined)
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
            value={searchParams.get('sortBy') || 'invoice_date'}
            onValueChange={(value) => handleFilterChange('sortBy', value)}
            disabled={isPending}
          >
            <SelectTrigger id='sortBy'>
              <SelectValue placeholder='Sort By' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='invoice_date'>Invoice Date</SelectItem>
              <SelectItem value='invoice_number'>Invoice Number</SelectItem>
              <SelectItem value='grand_total'>Grand Total</SelectItem>
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
