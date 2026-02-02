'use client';

/**
 * Ticket List Component
 * F004: Grievance Ticketing System
 *
 * Client component for displaying and managing ticket lists with filtering
 */

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Search, Filter, RefreshCw } from 'lucide-react';
import { TicketsTable } from './tickets-table';
import { useGrievanceTickets } from '@/hooks/grievance/use-grievance-tickets';
import type { GrievanceTicketFilters } from '@/types/grievance';

interface TicketListProps {
  institutionId: string;
  isStaff?: boolean;
  initialFilters?: Partial<GrievanceTicketFilters>;
}

export function TicketList({ institutionId, isStaff = false, initialFilters = {} }: TicketListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local filter state
  const [filters, setFilters] = useState<GrievanceTicketFilters>({
    institution_id: institutionId,
    page: 1,
    limit: 10,
    sortBy: 'created_at',
    sortDirection: 'desc',
    ...initialFilters,
    // Parse from URL params
    status: (searchParams.get('status') as any) || initialFilters.status,
    priority: (searchParams.get('priority') as any) || initialFilters.priority,
    sla_status: (searchParams.get('sla_status') as any) || initialFilters.sla_status,
    search: searchParams.get('search') || initialFilters.search || ''
  });

  // Fetch tickets
  const { data, isLoading, refetch } = useGrievanceTickets(filters);

  // Handle filter changes
  const handleFilterChange = (key: keyof GrievanceTicketFilters, value: any) => {
    const newFilters = { ...filters, [key]: value, page: 1 };
    setFilters(newFilters);

    // Update URL params
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`?${params.toString()}`);
  };

  // Handle search
  const handleSearch = (value: string) => {
    handleFilterChange('search', value);
  };

  // Handle pagination
  const handlePageChange = (page: number) => {
    setFilters({ ...filters, page });
  };

  // Handle refresh
  const handleRefresh = () => {
    refetch();
  };

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tickets..."
                value={filters.search || ''}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status Filter */}
            <Select
              value={filters.status || 'all'}
              onValueChange={(value) =>
                handleFilterChange('status', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Status" />
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
              value={filters.priority || 'all'}
              onValueChange={(value) =>
                handleFilterChange('priority', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>

            {/* SLA Filter */}
            <Select
              value={filters.sla_status || 'all'}
              onValueChange={(value) =>
                handleFilterChange('sla_status', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All SLA" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All SLA</SelectItem>
                <SelectItem value="on_track">On Track</SelectItem>
                <SelectItem value="at_risk">At Risk</SelectItem>
                <SelectItem value="breached">Breached</SelectItem>
              </SelectContent>
            </Select>

            {/* Refresh Button */}
            <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tickets Table */}
      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ) : (
        <TicketsTable tickets={data?.data || []} isStaff={isStaff} />
      )}

      {/* Pagination */}
      {data && data.metadata.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(Math.max(1, filters.page! - 1))}
            disabled={filters.page === 1}
          >
            Previous
          </Button>
          <span className="flex items-center px-4 text-sm text-muted-foreground">
            Page {filters.page} of {data.metadata.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(Math.min(data.metadata.totalPages, filters.page! + 1))}
            disabled={filters.page === data.metadata.totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
