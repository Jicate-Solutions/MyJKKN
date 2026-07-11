'use client';
/**
 * Refund Requests Filters Client Component
 *
 * URL-based filtering for the refund requests list page.
 * Updates URL search params instead of using local state.
 */

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

export function RefundRequestsFiltersClient() {
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
    // Keep only page, limit and status (tab selection)
    params.set('page', '1');
    const currentLimit = searchParams.get('limit');
    if (currentLimit) {
      params.set('limit', currentLimit);
    }
    const currentStatus = searchParams.get('status');
    if (currentStatus) {
      params.set('status', currentStatus);
    }

    startTransition(() => {
      router.push(`/billing/refunds?${params.toString()}`);
    });
  };

  const hasActiveFilters =
    searchParams.get('search') ||
    searchParams.get('refund_type') ||
    searchParams.get('date_from') ||
    searchParams.get('date_to');

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
              placeholder='Request number...'
              defaultValue={searchParams.get('search') || ''}
              onChange={(e) =>
                handleFilterChange('search', e.target.value || undefined)
              }
              disabled={isPending}
              className='pl-9'
            />
          </div>
        </div>

        {/* Refund Type Filter */}
        <div className='space-y-2'>
          <Label htmlFor='refund_type' className='text-sm'>
            Refund Type
          </Label>
          <Select
            value={searchParams.get('refund_type') || 'all'}
            onValueChange={(value) => handleFilterChange('refund_type', value)}
            disabled={isPending}
          >
            <SelectTrigger id='refund_type'>
              <SelectValue placeholder='All Types' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Types</SelectItem>
              <SelectItem value='withdrawal'>Withdrawal</SelectItem>
              <SelectItem value='adjustment'>Adjustment</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date From */}
        <div className='space-y-2'>
          <Label htmlFor='date_from' className='text-sm'>
            From Date
          </Label>
          <Input
            id='date_from'
            type='date'
            defaultValue={searchParams.get('date_from') || ''}
            onChange={(e) =>
              handleFilterChange('date_from', e.target.value || undefined)
            }
            disabled={isPending}
          />
        </div>

        {/* Date To */}
        <div className='space-y-2'>
          <Label htmlFor='date_to' className='text-sm'>
            To Date
          </Label>
          <Input
            id='date_to'
            type='date'
            defaultValue={searchParams.get('date_to') || ''}
            onChange={(e) =>
              handleFilterChange('date_to', e.target.value || undefined)
            }
            disabled={isPending}
          />
        </div>
      </div>
    </div>
  );
}
