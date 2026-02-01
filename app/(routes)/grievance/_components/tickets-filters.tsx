'use client';

// app/(routes)/grievance/_components/tickets-filters.tsx
// F004: Grievance Ticketing System - Tickets Filters Component

import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { useCallback } from 'react';

interface TicketsFiltersProps {
  institutionId: string;
}

export function TicketsFilters({ institutionId }: TicketsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set('page', '1'); // Reset to page 1 on filter change
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  const clearFilters = () => {
    router.push(`?institution_id=${institutionId}`);
  };

  const hasFilters =
    searchParams.get('search') ||
    searchParams.get('status') ||
    searchParams.get('priority') ||
    searchParams.get('sla_status');

  return (
    <div className="flex flex-wrap gap-4 items-center">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tickets..."
          className="pl-9"
          defaultValue={searchParams.get('search') || ''}
          onChange={(e) => {
            const value = e.target.value;
            // Debounce search
            const timeoutId = setTimeout(() => {
              updateParams('search', value || null);
            }, 300);
            return () => clearTimeout(timeoutId);
          }}
        />
      </div>

      {/* Status Filter */}
      <Select
        value={searchParams.get('status') || 'all'}
        onValueChange={(value) => updateParams('status', value === 'all' ? null : value)}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="pending_info">Pending Info</SelectItem>
          <SelectItem value="resolved">Resolved</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
          <SelectItem value="reopened">Reopened</SelectItem>
        </SelectContent>
      </Select>

      {/* Priority Filter */}
      <Select
        value={searchParams.get('priority') || 'all'}
        onValueChange={(value) => updateParams('priority', value === 'all' ? null : value)}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priority</SelectItem>
          <SelectItem value="urgent">Urgent</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>

      {/* SLA Status Filter */}
      <Select
        value={searchParams.get('sla_status') || 'all'}
        onValueChange={(value) => updateParams('sla_status', value === 'all' ? null : value)}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="SLA Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All SLA</SelectItem>
          <SelectItem value="on_track">On Track</SelectItem>
          <SelectItem value="at_risk">At Risk</SelectItem>
          <SelectItem value="breached">Breached</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear Filters */}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
