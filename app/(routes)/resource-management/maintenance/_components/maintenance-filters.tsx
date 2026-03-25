// app/(routes)/resource-management/maintenance/_components/maintenance-filters.tsx
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
import {
  MaintenanceType,
  MaintenanceStatus,
  MaintenancePriority
} from '@/types/maintenance';

interface MaintenanceFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  typeFilter: string;
  onTypeChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  priorityFilter: string;
  onPriorityChange: (value: string) => void;
  onClearFilters: () => void;
}

export function MaintenanceFilters({
  searchQuery,
  onSearchChange,
  typeFilter,
  onTypeChange,
  statusFilter,
  onStatusChange,
  priorityFilter,
  onPriorityChange,
  onClearFilters
}: MaintenanceFiltersProps) {
  const hasActiveFilters =
    searchQuery ||
    typeFilter !== 'all' ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all';

  return (
    <div className='space-y-4'>
      {/* Search Bar */}
      <div className='relative'>
        <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          placeholder='Search by title or description...'
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className='pl-10'
        />
      </div>

      {/* Filter Row */}
      <div className='grid gap-4 md:grid-cols-4'>
        {/* Type Filter */}
        <div className='space-y-2'>
          <label className='text-sm font-medium'>Type</label>
          <Select value={typeFilter} onValueChange={onTypeChange}>
            <SelectTrigger>
              <SelectValue placeholder='All Types' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Types</SelectItem>
              <SelectItem value={MaintenanceType.PREVENTIVE}>
                Preventive
              </SelectItem>
              <SelectItem value={MaintenanceType.CORRECTIVE}>
                Corrective
              </SelectItem>
              <SelectItem value={MaintenanceType.PREDICTIVE}>
                Predictive
              </SelectItem>
              <SelectItem value={MaintenanceType.EMERGENCY}>
                Emergency
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status Filter */}
        <div className='space-y-2'>
          <label className='text-sm font-medium'>Status</label>
          <Select value={statusFilter} onValueChange={onStatusChange}>
            <SelectTrigger>
              <SelectValue placeholder='All Statuses' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Statuses</SelectItem>
              <SelectItem value={MaintenanceStatus.SCHEDULED}>
                Scheduled
              </SelectItem>
              <SelectItem value={MaintenanceStatus.IN_PROGRESS}>
                In Progress
              </SelectItem>
              <SelectItem value={MaintenanceStatus.COMPLETED}>
                Completed
              </SelectItem>
              <SelectItem value={MaintenanceStatus.CANCELLED}>
                Cancelled
              </SelectItem>
              <SelectItem value={MaintenanceStatus.OVERDUE}>Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Priority Filter */}
        <div className='space-y-2'>
          <label className='text-sm font-medium'>Priority</label>
          <Select value={priorityFilter} onValueChange={onPriorityChange}>
            <SelectTrigger>
              <SelectValue placeholder='All Priorities' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Priorities</SelectItem>
              <SelectItem value='4'>Critical</SelectItem>
              <SelectItem value='3'>High</SelectItem>
              <SelectItem value='2'>Normal</SelectItem>
              <SelectItem value='1'>Low</SelectItem>
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
          {typeFilter !== 'all' && (
            <Badge variant='secondary' className='gap-1'>
              <Filter className='h-3 w-3' />
              Type: {typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)}
            </Badge>
          )}
          {statusFilter !== 'all' && (
            <Badge variant='secondary' className='gap-1'>
              <Filter className='h-3 w-3' />
              Status:{' '}
              {statusFilter
                .split('_')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ')}
            </Badge>
          )}
          {priorityFilter !== 'all' && (
            <Badge variant='secondary' className='gap-1'>
              <Filter className='h-3 w-3' />
              Priority:{' '}
              {priorityFilter === '4'
                ? 'Critical'
                : priorityFilter === '3'
                ? 'High'
                : priorityFilter === '2'
                ? 'Normal'
                : 'Low'}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
