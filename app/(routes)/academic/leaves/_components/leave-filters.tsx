'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X, Search } from 'lucide-react';
import { useActiveLeaveTypes } from '@/hooks/academic/use-leave-types';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';
import { LEAVE_STATUS_OPTIONS, LEAVE_SCOPE_OPTIONS } from '@/types/leaves';
import type { LeavesSearchParams } from './data-table-schema';

interface LeaveFiltersComponentProps {
  searchParams: LeavesSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function LeaveFiltersComponent({
  searchParams,
  onFilterChange,
  onClearFilters
}: LeaveFiltersComponentProps) {
  const { userProfile, isSuperAdmin } = usePermissions();

  // For super admin, use selected institution from search params; for others, use their own institution
  const effectiveInstitutionId = isSuperAdmin
    ? searchParams.institution_id ?? null
    : userProfile?.institution_id ?? null;

  // Fetch institutions for super admin
  const { institutions, loading: instLoading } = useInstitutionsWithAccess({
    autoFetch: isSuperAdmin
  });

  const { leaveTypes } = useActiveLeaveTypes(effectiveInstitutionId);

  const hasFilters =
    searchParams.search ||
    searchParams.status ||
    searchParams.scope_level ||
    searchParams.leave_type_id ||
    searchParams.institution_id;

  return (
    <div className='flex flex-wrap gap-4'>
      {/* Search */}
      <div className='relative flex-1 min-w-[200px]'>
        <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
        <Input
          placeholder='Search leaves...'
          value={searchParams.search || ''}
          onChange={(e) =>
            onFilterChange('search', e.target.value || undefined)
          }
          className='pl-9'
        />
      </div>

      {/* Institution Filter - Only for Super Admin */}
      {isSuperAdmin && (
        <Select
          value={searchParams.institution_id || '_all'}
          onValueChange={(value) =>
            onFilterChange('institution_id', value === '_all' ? undefined : value)
          }
          disabled={instLoading}
        >
          <SelectTrigger className='w-[200px]'>
            <SelectValue placeholder='Institution' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='_all'>All Institutions</SelectItem>
            {institutions.map((inst) => (
              <SelectItem key={inst.id} value={inst.id}>
                {inst.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Status Filter */}
      <Select
        value={searchParams.status || '_all'}
        onValueChange={(value) =>
          onFilterChange('status', value === '_all' ? undefined : value)
        }
      >
        <SelectTrigger className='w-[150px]'>
          <SelectValue placeholder='Status' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='_all'>All Status</SelectItem>
          {LEAVE_STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Scope Filter */}
      <Select
        value={searchParams.scope_level || '_all'}
        onValueChange={(value) =>
          onFilterChange('scope_level', value === '_all' ? undefined : value)
        }
      >
        <SelectTrigger className='w-[150px]'>
          <SelectValue placeholder='Scope' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='_all'>All Scopes</SelectItem>
          {LEAVE_SCOPE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Leave Type Filter */}
      <Select
        value={searchParams.leave_type_id || '_all'}
        onValueChange={(value) =>
          onFilterChange('leave_type_id', value === '_all' ? undefined : value)
        }
      >
        <SelectTrigger className='w-[180px]'>
          <SelectValue placeholder='Leave Type' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='_all'>All Types</SelectItem>
          {leaveTypes.map((type) => (
            <SelectItem key={type.id} value={type.id}>
              <span className='flex items-center gap-2'>
                <span
                  className='w-2 h-2 rounded-full'
                  style={{ backgroundColor: type.color_code }}
                />
                {type.leave_type_name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear Filters */}
      {hasFilters && (
        <Button variant='ghost' size='sm' onClick={onClearFilters}>
          <X className='h-4 w-4 mr-1' />
          Clear
        </Button>
      )}
    </div>
  );
}
