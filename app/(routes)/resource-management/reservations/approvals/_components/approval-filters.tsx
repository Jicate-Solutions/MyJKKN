// app/(routes)/resource-management/reservations/approvals/_components/approval-filters.tsx
'use client';

import { Search, Filter, X } from 'lucide-react';
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
import { ReservationPriority } from '@/types/reservation';

interface ApprovalFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  priorityFilter: string;
  onPriorityChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  onClearFilters: () => void;
}

export function ApprovalFilters({
  searchQuery,
  onSearchChange,
  priorityFilter,
  onPriorityChange,
  sortBy,
  onSortChange,
  onClearFilters
}: ApprovalFiltersProps) {
  const hasActiveFilters =
    searchQuery || priorityFilter !== 'all' || sortBy !== 'created_at';

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
      <div className='grid gap-4 md:grid-cols-3'>
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
