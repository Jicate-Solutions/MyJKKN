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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, Filter, MoreHorizontal, Users, Calendar } from 'lucide-react';
import { format } from 'date-fns';

// TODO: Replace with real hooks after service migration
// import { usePhases } from '@/hooks/solutions/use-phases';

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
  const [statusFilter, setStatusFilter] = useState('all');

  // Placeholder data
  const phases = [
    {
      id: '1',
      phase_number: 1,
      title: 'Core Features',
      solution: { id: '1', solution_code: 'JKKN-SOL-2026-001', title: 'Student Portal' },
      status: 'prototype_building',
      estimated_value: 150000,
      builder_count: 2,
      due_date: '2026-03-15',
    },
    {
      id: '2',
      phase_number: 1,
      title: 'Authentication Module',
      solution: { id: '2', solution_code: 'JKKN-SOL-2026-002', title: 'HR System' },
      status: 'client_demo',
      estimated_value: 75000,
      builder_count: 1,
      due_date: '2026-02-28',
    },
    {
      id: '3',
      phase_number: 2,
      title: 'Reporting Dashboard',
      solution: { id: '1', solution_code: 'JKKN-SOL-2026-001', title: 'Student Portal' },
      status: 'approved',
      estimated_value: 100000,
      builder_count: 3,
      due_date: '2026-04-30',
    },
    {
      id: '4',
      phase_number: 1,
      title: 'MVP Development',
      solution: { id: '3', solution_code: 'JKKN-SOL-2026-005', title: 'Inventory App' },
      status: 'prospecting',
      estimated_value: 200000,
      builder_count: 0,
      due_date: null,
    },
  ];

  const filteredPhases = phases.filter((phase) => {
    if (statusFilter !== 'all' && phase.status !== statusFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        phase.title.toLowerCase().includes(query) ||
        phase.solution.solution_code.toLowerCase().includes(query) ||
        phase.solution.title.toLowerCase().includes(query)
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
                {Object.entries(statusConfig).map(([value, config]) => (
                  <SelectItem key={value} value={value}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
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
              {filteredPhases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No phases found
                  </TableCell>
                </TableRow>
              ) : (
                filteredPhases.map((phase) => {
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
                            href={`/solutions/${phase.solution.id}`}
                            className="text-sm hover:underline"
                          >
                            {phase.solution.solution_code}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {phase.solution.title}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={status.color}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Users className="h-3 w-3" />
                          {phase.builder_count}
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
        </CardContent>
      </Card>
    </div>
  );
}
