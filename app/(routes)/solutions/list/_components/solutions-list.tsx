'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  ArrowUpDown,
  MoreHorizontal,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// TODO: Replace with real hooks after service migration
// import { useSolutions } from '@/hooks/solutions/use-solutions';

interface SolutionsListProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

const typeConfig = {
  software: { icon: Hammer, color: 'text-blue-600', bg: 'bg-blue-100' },
  training: { icon: BookOpen, color: 'text-green-600', bg: 'bg-green-100' },
  content: { icon: Video, color: 'text-purple-600', bg: 'bg-purple-100' },
};

const statusConfig = {
  active: { label: 'Active', variant: 'default' as const },
  on_hold: { label: 'On Hold', variant: 'secondary' as const },
  completed: { label: 'Completed', variant: 'outline' as const },
  cancelled: { label: 'Cancelled', variant: 'destructive' as const },
  in_amc: { label: 'In AMC', variant: 'secondary' as const },
};

function formatCurrency(amount: number | null): string {
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

  // Placeholder data until hooks are migrated
  const solutions = [
    {
      id: '1',
      solution_code: 'JKKN-SOL-2026-001',
      title: 'Student Portal Enhancement',
      solution_type: 'software' as const,
      status: 'active' as const,
      client: { name: 'ABC University' },
      department: { name: 'CSE' },
      final_price: 500000,
      created_at: '2026-01-15',
    },
    {
      id: '2',
      solution_code: 'JKKN-SOL-2026-002',
      title: 'AI Workshop Series',
      solution_type: 'training' as const,
      status: 'active' as const,
      client: { name: 'XYZ Corp' },
      department: { name: 'IT' },
      final_price: 200000,
      created_at: '2026-01-20',
    },
    {
      id: '3',
      solution_code: 'JKKN-SOL-2026-003',
      title: 'Promotional Video Package',
      solution_type: 'content' as const,
      status: 'completed' as const,
      client: { name: 'DEF Institute' },
      department: { name: 'Media' },
      final_price: 75000,
      created_at: '2026-01-10',
    },
  ];
  const isLoading = false;

  const filteredSolutions = solutions.filter((solution) => {
    if (typeFilter !== 'all' && solution.solution_type !== typeFilter) return false;
    if (statusFilter !== 'all' && solution.status !== statusFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        solution.title.toLowerCase().includes(query) ||
        solution.solution_code.toLowerCase().includes(query) ||
        solution.client.name.toLowerCase().includes(query)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search solutions..."
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
                {filteredSolutions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No solutions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSolutions.map((solution) => {
                    const TypeIcon = typeConfig[solution.solution_type].icon;
                    const status = statusConfig[solution.status];
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
                            <TypeIcon
                              className={`h-4 w-4 ${typeConfig[solution.solution_type].color}`}
                            />
                            <span className="capitalize">{solution.solution_type}</span>
                          </div>
                        </TableCell>
                        <TableCell>{solution.client.name}</TableCell>
                        <TableCell>{solution.department.name}</TableCell>
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
    </div>
  );
}
