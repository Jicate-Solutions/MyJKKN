'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { ExpertSearchParams } from './data-table-schema';
import { BOS_EXPERT_CATEGORY_LABELS } from '@/types/bos';

interface ExpertFiltersProps {
  searchParams: ExpertSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
  isSuperAdmin?: boolean;
}

export function ExpertFilters({
  searchParams,
  onFilterChange,
  onClearFilters,
  isSuperAdmin = false,
}: ExpertFiltersProps) {
  const [institutionOptions, setInstitutionOptions] = useState<{ id: string; name: string }[]>([]);
  const institutionsAbortControllerRef = useRef<AbortController | null>(null);

  // Fetch institutions (for super admins)
  useEffect(() => {
    if (!isSuperAdmin) return;

    if (institutionsAbortControllerRef.current) {
      institutionsAbortControllerRef.current.abort();
    }
    institutionsAbortControllerRef.current = new AbortController();

    const fetchInstitutions = async () => {
      try {
        const res = await fetch('/api/bos/institutions', {
          signal: institutionsAbortControllerRef.current?.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setInstitutionOptions(data || []);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Failed to fetch institutions:', err);
        }
      }
    };

    fetchInstitutions();

    return () => {
      institutionsAbortControllerRef.current?.abort();
    };
  }, [isSuperAdmin]);

  const hasActiveFilters = !!(searchParams.category || searchParams.is_active || searchParams.institutionsId);

  return (
    <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap'>
        {/* Institution Filter (Super Admin Only) */}
        {isSuperAdmin && (
          <div className='min-w-[200px]'>
            <Select
              value={searchParams.institutionsId || 'all'}
              onValueChange={(val) => onFilterChange('institutionsId', val === 'all' ? undefined : val)}
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

        {/* Category Filter */}
        <div className='min-w-[180px]'>
          <Select
            value={searchParams.category ?? 'all'}
            onValueChange={(value) =>
              onFilterChange('category', value === 'all' ? undefined : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='All Categories' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Categories</SelectItem>
              {Object.entries(BOS_EXPERT_CATEGORY_LABELS).map(([value, label]) => (
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
