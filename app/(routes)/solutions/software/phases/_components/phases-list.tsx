'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, Filter, MoreHorizontal, Users, Calendar, GitBranch, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { usePhases, type PhaseFilters, PHASE_STATUSES } from '@/hooks/solutions/use-phases';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import type { PhaseStatus } from '@/lib/services/solutions/types';

function formatCurrency(amount: number | null): string {
  if (!amount) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

const statusConfig: Record<string, { label: string; color: string }> = {
  prospecting: { label: 'Prospecting', color: 'bg-gray-100 text-gray-800' },
  discovery: { label: 'Discovery', color: 'bg-blue-100 text-blue-800' },
  prd_writing: { label: 'PRD Writing', color: 'bg-indigo-100 text-indigo-800' },
  prototype_building: { label: 'Building', color: 'bg-yellow-100 text-yellow-800' },
  client_demo: { label: 'Demo', color: 'bg-orange-100 text-orange-800' },
  revisions: { label: 'Revisions', color: 'bg-pink-100 text-pink-800' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800' },
  deploying: { label: 'Deploying', color: 'bg-purple-100 text-purple-800' },
  training: { label: 'Training', color: 'bg-teal-100 text-teal-800' },
  live: { label: 'Live', color: 'bg-emerald-100 text-emerald-800' },
  completed: { label: 'Completed', color: 'bg-slate-100 text-slate-800' },
  on_hold: { label: 'On Hold', color: 'bg-amber-100 text-amber-800' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
};

export function PhasesList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const debouncedSearch = useDebounceValue(searchQuery, 300);

  // Build filters for API call
  const filters: PhaseFilters = {
    limit: 50,
  };

  if (statusFilter !== 'all') {
    filters.status = statusFilter as PhaseStatus;
  }

  if (debouncedSearch) {
    filters.search = debouncedSearch;
  }

  // Fetch phases from database
  const { data: phasesData, isLoading, error } = usePhases(filters);

  const phases = phasesData?.data || [];

  return (
    <div className="space-y-4">
      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load phases. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search phases..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {PHASE_STATUSES.map((status) => {
                  const config = statusConfig[status.value];
                  return (
                    <SelectItem key={status.value} value={status.value}>
                      {config?.label || status.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phase</TableHead>
                  <TableHead>Solution</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Builders</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {phases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <GitBranch className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">
                        {searchQuery || statusFilter !== 'all'
                          ? 'No phases match your filters'
                          : 'No phases found'}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  phases.map((phase) => {
                    const status = statusConfig[phase.status] || statusConfig.prospecting;
                    return (
                      <TableRow key={phase.id}>
                        <TableCell>
                          <Link
                            href={`/solutions/software/phases/${phase.id}`}
                            className="font-medium hover:underline"
                          >
                            Phase {phase.phase_number}: {phase.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div>
                            <Link
                              href={`/solutions/${phase.solution_id}`}
                              className="text-sm hover:underline"
                            >
                              {phase.solution?.solution_code || 'N/A'}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {phase.solution?.title || 'Unknown Solution'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={status.color}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Users className="h-3 w-3" />
                            {phase.assignments?.length || 0}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(phase.estimated_value)}
                        </TableCell>
                        <TableCell>
                          {phase.due_date ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(phase.due_date), 'dd MMM yyyy')}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/solutions/software/phases/${phase.id}`}>
                                  View Details
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem>Edit Phase</DropdownMenuItem>
                              <DropdownMenuItem>Manage Builders</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
