'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { X } from 'lucide-react';
import type { DegreesSearchParams } from './data-table-schema';

interface DegreesFiltersClientProps {
  searchParams: DegreesSearchParams;
}

export function DegreesFiltersClient({ searchParams }: DegreesFiltersClientProps) {
  const router = useRouter();
  const currentSearchParams = useSearchParams();

  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(currentSearchParams?.toString() ?? '');
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set('page', '1');
      router.push(`/organizations/degrees?${params.toString()}`);
    },
    [router, currentSearchParams]
  );

  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', '1');
    const pageSize = currentSearchParams?.get('pageSize');
    if (pageSize) {
      params.set('pageSize', pageSize);
    }
    router.push(`/organizations/degrees?${params.toString()}`);
  }, [router, currentSearchParams]);

  const hasActiveFilters =
    searchParams.search || searchParams.status || searchParams.degree_type;

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-col sm:flex-row gap-4'>
        {/* Search */}
        <div className='flex-1'>
          <Input
            placeholder='Search by name, code, or type...'
            defaultValue={searchParams.search || ''}
            onChange={(e) => handleFilterChange('search', e.target.value || undefined)}
            className='w-full'
          />
        </div>

        {/* Status Filter */}
        <Select
          value={searchParams.status || 'all'}
          onValueChange={(value) =>
            handleFilterChange('status', value === 'all' ? undefined : value)
          }
        >
          <SelectTrigger className='w-full sm:w-[180px]'>
            <SelectValue placeholder='Status' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Status</SelectItem>
            <SelectItem value='active'>Active</SelectItem>
            <SelectItem value='inactive'>Inactive</SelectItem>
          </SelectContent>
        </Select>

        {/* Degree Type Filter */}
        <Select
          value={searchParams.degree_type || 'all'}
          onValueChange={(value) =>
            handleFilterChange('degree_type', value === 'all' ? undefined : value)
          }
        >
          <SelectTrigger className='w-full sm:w-[180px]'>
            <SelectValue placeholder='Degree Type' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Types</SelectItem>
            <SelectItem value='ug'>UG</SelectItem>
            <SelectItem value='pg'>PG</SelectItem>
          </SelectContent>
        </Select>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button
            variant='ghost'
            onClick={handleClearFilters}
            className='w-full sm:w-auto'
          >
            <X className='mr-2 h-4 w-4' />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
