'use client';
// app/(routes)/resource-management/reservations/approvals/_components/approval-filters.tsx

import { Search, Filter, X, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

const ALL_INSTITUTIONS = 'all';

interface ApprovalFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  priorityFilter: string;
  onPriorityChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  institutionFilter: string;
  onInstitutionChange: (value: string) => void;
  onClearFilters: () => void;
}

export function ApprovalFilters({
  searchQuery,
  onSearchChange,
  priorityFilter,
  onPriorityChange,
  sortBy,
  onSortChange,
  institutionFilter,
  onInstitutionChange,
  onClearFilters
}: ApprovalFiltersProps) {
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();
  // Only show the institution selector when the current user can access
  // more than one institution. Single-institution users are already scoped
  // by RLS — a one-option dropdown would just be noise.
  const showInstitutionFilter = institutions.length > 1;

  const selectedInstitution =
    institutionFilter !== ALL_INSTITUTIONS
      ? institutions.find((i) => i.id === institutionFilter)
      : null;

  const hasActiveFilters =
    !!searchQuery ||
    priorityFilter !== 'all' ||
    sortBy !== 'created_at' ||
    (showInstitutionFilter && institutionFilter !== ALL_INSTITUTIONS);

  return (
    <div className='space-y-4'>
      {/* Search Bar */}
      <div className='relative'>
        <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          placeholder='Search by resource, user, or purpose...'
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className='pl-10'
        />
      </div>

      {/* Filter Row */}
      <div
        className={`grid gap-4 ${
          showInstitutionFilter
            ? 'md:grid-cols-2 lg:grid-cols-4'
            : 'md:grid-cols-3'
        }`}
      >
        {/* Institution Filter (multi-institution users only) */}
        {showInstitutionFilter && (
          <div className='space-y-2'>
            <label className='text-sm font-medium flex items-center gap-1'>
              <Building2 className='h-3.5 w-3.5' />
              Institution
            </label>
            <Select
              value={institutionFilter}
              onValueChange={onInstitutionChange}
              disabled={institutionsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder='All Institutions' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_INSTITUTIONS}>All Institutions</SelectItem>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Priority Filter */}
        <div className='space-y-2'>
          <label className='text-sm font-medium'>Priority</label>
          <Select value={priorityFilter} onValueChange={onPriorityChange}>
            <SelectTrigger>
              <SelectValue placeholder='All Priorities' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Priorities</SelectItem>
              <SelectItem value='3'>High Priority</SelectItem>
              <SelectItem value='2'>Normal Priority</SelectItem>
              <SelectItem value='1'>Low Priority</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sort By */}
        <div className='space-y-2'>
          <label className='text-sm font-medium'>Sort By</label>
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger>
              <SelectValue placeholder='Sort by...' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='created_at'>Newest First</SelectItem>
              <SelectItem value='start_time'>Start Time</SelectItem>
              <SelectItem value='priority'>Priority</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Clear Filters Button */}
        <div className='flex items-end'>
          <Button
            variant='outline'
            onClick={onClearFilters}
            disabled={!hasActiveFilters}
            className='w-full'
          >
            <X className='mr-2 h-4 w-4' />
            Clear Filters
          </Button>
        </div>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className='flex items-center gap-2 flex-wrap'>
          {searchQuery && (
            <Badge variant='secondary' className='gap-1'>
              <Filter className='h-3 w-3' />
              Search: {searchQuery}
            </Badge>
          )}
          {showInstitutionFilter && selectedInstitution && (
            <Badge variant='secondary' className='gap-1'>
              <Building2 className='h-3 w-3' />
              Institution: {selectedInstitution.name}
            </Badge>
          )}
          {priorityFilter !== 'all' && (
            <Badge variant='secondary' className='gap-1'>
              <Filter className='h-3 w-3' />
              Priority:{' '}
              {priorityFilter === '3'
                ? 'High'
                : priorityFilter === '2'
                ? 'Normal'
                : 'Low'}
            </Badge>
          )}
          {sortBy !== 'created_at' && (
            <Badge variant='secondary' className='gap-1'>
              <Filter className='h-3 w-3' />
              Sort:{' '}
              {sortBy === 'start_time'
                ? 'Start Time'
                : sortBy === 'priority'
                ? 'Priority'
                : 'Newest'}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
