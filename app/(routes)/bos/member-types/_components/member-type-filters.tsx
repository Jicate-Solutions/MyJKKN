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
import { MemberTypeSearchParams } from './data-table-schema';
import { BOS_MEMBER_TYPE_LABELS } from '@/types/bos';

interface MemberTypeFiltersProps {
  searchParams: MemberTypeSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
  isSuperAdmin?: boolean;
}

export function MemberTypeFilters({
  searchParams,
  onFilterChange,
  onClearFilters,
  isSuperAdmin = false,
}: MemberTypeFiltersProps) {
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

  const hasActiveFilters = !!(
    searchParams.baseType ||
    searchParams.is_active ||
    searchParams.institutionsId
  );

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

        {/* Behaves As Filter */}
        <div className='min-w-[180px]'>
          <Select
            value={searchParams.baseType ?? 'all'}
            onValueChange={(value) =>
              onFilterChange('baseType', value === 'all' ? undefined : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='All Behaviours' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Behaviours</SelectItem>
              {Object.entries(BOS_MEMBER_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
