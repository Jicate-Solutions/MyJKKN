// app/(routes)/resource-management/reservations/my-reservations/_components/reservation-filters.tsx
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
import { ReservationStatus } from '@/types/reservation';

interface ReservationFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  dateFilter: string;
  onDateFilterChange: (value: string) => void;
  onClearFilters: () => void;
}

export function ReservationFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  dateFilter,
  onDateFilterChange,
  onClearFilters
}: ReservationFiltersProps) {
  const hasActiveFilters =
    searchQuery || statusFilter !== 'all' || dateFilter !== 'all';

  return (
    <div className='space-y-4'>
      {/* Search Bar */}
      <div className='relative'>
        <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          placeholder='Search by resource name or purpose...'
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className='pl-10'
        />
      </div>

      {/* Filter Row */}
      <div className='grid gap-4 md:grid-cols-3'>
        {/* Status Filter */}
        <div className='space-y-2'>
          <label className='text-sm font-medium'>Status</label>
          <Select value={statusFilter} onValueChange={onStatusChange}>
            <SelectTrigger>
              <SelectValue placeholder='All Status' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Status</SelectItem>
              <SelectItem value={ReservationStatus.PENDING}>Pending</SelectItem>
              <SelectItem value={ReservationStatus.APPROVED}>
                Approved
              </SelectItem>
              <SelectItem value={ReservationStatus.REJECTED}>
                Rejected
              </SelectItem>
              <SelectItem value={ReservationStatus.CANCELLED}>
                Cancelled
              </SelectItem>
              <SelectItem value={ReservationStatus.COMPLETED}>
                Completed
              </SelectItem>
              <SelectItem value={ReservationStatus.NO_SHOW}>No Show</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date Filter */}
        <div className='space-y-2'>
          <label className='text-sm font-medium'>Time Period</label>
          <Select value={dateFilter} onValueChange={onDateFilterChange}>
            <SelectTrigger>
              <SelectValue placeholder='All Reservations' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Reservations</SelectItem>
              <SelectItem value='upcoming'>Upcoming</SelectItem>
              <SelectItem value='past'>Past</SelectItem>
              <SelectItem value='today'>Today</SelectItem>
              <SelectItem value='this_week'>This Week</SelectItem>
              <SelectItem value='this_month'>This Month</SelectItem>
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
          {statusFilter !== 'all' && (
            <Badge variant='secondary' className='gap-1'>
              <Filter className='h-3 w-3' />
              Status:{' '}
              {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
            </Badge>
          )}
          {dateFilter !== 'all' && (
            <Badge variant='secondary' className='gap-1'>
              <Filter className='h-3 w-3' />
              Period:{' '}
              {dateFilter
                .split('_')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ')}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
