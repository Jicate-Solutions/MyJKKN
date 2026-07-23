'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { CommitteeSearchParams } from './data-table-schema';

interface CommitteeFiltersProps {
  searchParams: CommitteeSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
  isSuperAdmin?: boolean;
}

export function CommitteeFilters({
  searchParams,
  onFilterChange,
  onClearFilters,
  isSuperAdmin = false,
}: CommitteeFiltersProps) {
  // Same cached list the columns/dialog use (queryKey shared).
  const { data: institutionOptions = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['bos', 'institutions'],
    queryFn: async () => {
      const res = await fetch('/api/bos/institutions');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isSuperAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const hasActiveFilters = !!(searchParams.is_active || searchParams.institutionsId);

  return (
    <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap'>
        {/* Institution Filter (Super Admin Only) */}
        {isSuperAdmin && (
          <div className='min-w-[200px]'>
            <Select
              value={searchParams.institutionsId || 'all'}
              onValueChange={(val) =>
                onFilterChange('institutionsId', val === 'all' ? undefined : val)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='All institutions' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All institutions</SelectItem>
                {institutionOptions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Status Filter */}
        <div className='min-w-[140px]'>
          <Select
            value={searchParams.is_active ?? 'all'}
            onValueChange={(value) =>
              onFilterChange('is_active', value === 'all' ? undefined : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='All Status' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Status</SelectItem>
              <SelectItem value='true'>Active</SelectItem>
              <SelectItem value='false'>Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasActiveFilters && (
        <Button
          variant='ghost'
          onClick={onClearFilters}
          className='h-8 px-2 lg:px-3'
        >
          Reset
          <RotateCcw className='ml-2 h-4 w-4' />
        </Button>
      )}
    </div>
  );
}
