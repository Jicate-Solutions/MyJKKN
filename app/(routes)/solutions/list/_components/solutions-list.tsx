'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Search,
  Filter,
  Hammer,
  BookOpen,
  Video,
  MoreHorizontal,
  AlertCircle,
  Download,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSolutions, type SolutionFilters } from '@/hooks/solutions/use-solutions';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { downloadCsv, formatDateForCsv, formatArrayForCsv, type CsvColumn } from '@/lib/utils/csv-export';
import type { SolutionType, SolutionStatus } from '@/lib/services/solutions/types';
import type { SolutionWithClient } from '@/lib/services/solutions/solutions-service';

interface SolutionsListProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

const typeConfig: Record<SolutionType, { icon: React.ElementType; color: string; bg: string }> = {
  software: { icon: Hammer, color: 'text-blue-600', bg: 'bg-blue-100' },
  training: { icon: BookOpen, color: 'text-green-600', bg: 'bg-green-100' },
  content: { icon: Video, color: 'text-purple-600', bg: 'bg-purple-100' },
};

const statusConfig: Record<SolutionStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  active: { label: 'Active', variant: 'default' },
  on_hold: { label: 'On Hold', variant: 'secondary' },
  completed: { label: 'Completed', variant: 'outline' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  in_amc: { label: 'In AMC', variant: 'secondary' },
};

function formatCurrency(amount: number | null | undefined): string {
  if (!amount) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function SolutionsList({ searchParams }: SolutionsListProps) {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounceValue(searchQuery, 300);

  // Build filters for API call
  const filters: SolutionFilters = {
    limit: 50,
  };

  if (typeFilter !== 'all') {
    filters.solution_type = typeFilter as SolutionType;
  }

  if (statusFilter !== 'all') {
    filters.status = statusFilter as SolutionStatus;
  }

  if (debouncedSearch) {
    filters.search = debouncedSearch;
  }

  // Fetch solutions from database
  const { data: solutionsData, isLoading, error } = useSolutions(filters);

  const solutions = solutionsData?.data || [];

  // CSV export column definitions
  const csvColumns: CsvColumn<SolutionWithClient>[] = [
    { header: 'Code', accessor: (r) => r.solution_code },
    { header: 'Title', accessor: (r) => r.title },
    { header: 'Type', accessor: (r) => r.solution_type },
    { header: 'Status', accessor: (r) => r.status },
    { header: 'Client', accessor: (r) => r.client?.name ?? '' },
    { header: 'Department', accessor: (r) => r.department?.name ?? '' },
    { header: 'Base Price', accessor: (r) => r.base_price ?? '' },
    { header: 'Discount %', accessor: (r) => r.discount_percentage ?? '' },
    { header: 'Final Price', accessor: (r) => r.final_price ?? '' },
    { header: 'Start Date', accessor: (r) => formatDateForCsv(r.start_date) },
    { header: 'Target Date', accessor: (r) => formatDateForCsv(r.target_date) },
    { header: 'Completion Date', accessor: (r) => formatDateForCsv(r.completion_date) },
    { header: 'Tags', accessor: (r) => formatArrayForCsv(r.tags) },
    { header: 'Created', accessor: (r) => formatDateForCsv(r.created_at) },
  ];

  const handleExport = () => {
    downloadCsv(solutions, csvColumns, 'solutions');
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search solutions by title or code..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="software">Software</SelectItem>
                <SelectItem value="training">Training</SelectItem>
                <SelectItem value="content">Content</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="in_amc">In AMC</SelectItem>
              </SelectContent>
            </Select>
            <Button asChild>
              <Link href="/solutions/new">
                <Plus className="mr-2 h-4 w-4" />
                New Solution
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card>
          <CardContent className="py-10">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <div>
                <h3 className="font-semibold">Failed to load solutions</h3>
                <p className="text-sm text-muted-foreground">
                  {error instanceof Error ? error.message : 'An error occurred'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {!error && (
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
                    <TableHead className="w-[140px]">Code</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {solutions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <div className="flex flex-col items-center gap-2">
                          <Hammer className="h-8 w-8 text-muted-foreground" />
                          <p className="text-muted-foreground">No solutions found</p>
                          {(searchQuery || typeFilter !== 'all' || statusFilter !== 'all') && (
                            <p className="text-sm text-muted-foreground">
                              Try adjusting your filters
                            </p>
                          )}
                          {!searchQuery && typeFilter === 'all' && statusFilter === 'all' && (
                            <Button asChild variant="outline" size="sm" className="mt-2">
                              <Link href="/solutions/new">Create First Solution</Link>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    solutions.map((solution) => {
                      const solutionType = solution.solution_type as SolutionType;
                      const TypeIcon = typeConfig[solutionType]?.icon || Hammer;
                      const typeColor = typeConfig[solutionType]?.color || 'text-gray-600';
                      const solutionStatus = solution.status as SolutionStatus;
                      const status = statusConfig[solutionStatus] || statusConfig.active;
                      return (
                        <TableRow key={solution.id}>
                          <TableCell className="font-mono text-sm">
                            <Link
                              href={`/solutions/${solution.id}`}
                              className="hover:underline text-primary"
                            >
                              {solution.solution_code}
                            </Link>
                          </TableCell>
                          <TableCell className="font-medium">
                            <Link
                              href={`/solutions/${solution.id}`}
                              className="hover:underline"
                            >
                              {solution.title}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <TypeIcon className={`h-4 w-4 ${typeColor}`} />
                              <span className="capitalize">{solution.solution_type}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {solution.client?.name || '-'}
                          </TableCell>
                          <TableCell>
                            {solution.department?.name || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(solution.final_price)}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <Link href={`/solutions/${solution.id}`}>View Details</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/solutions/${solution.id}/edit`}>Edit</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/solutions/${solution.id}/mou`}>Manage MoU</Link>
                                </DropdownMenuItem>
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
      )}
    </div>
  );
}
