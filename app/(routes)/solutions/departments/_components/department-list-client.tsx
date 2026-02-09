'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useDepartmentRevenueList } from '@/hooks/use-department-tracker';
import { Card, CardContent } from '@/components/ui/card';
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
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { DepartmentRevenue, DepartmentStatus } from '@/hooks/use-department-tracker';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);

function getStatusBadge(status: DepartmentStatus) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-0">Active</Badge>;
    case 'at_risk':
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border-0">At Risk</Badge>;
    case 'dormant':
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-200 border-0">Dormant</Badge>;
    case 'pending_approval':
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-0">Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

type SortField = 'department_name' | 'institution_name' | 'status' | 'revenue' | 'target' | 'achievement_pct' | 'growth_rate' | 'active_solutions';

function SortIcon({ field, sortBy, sortDir }: { field: SortField; sortBy: string; sortDir: 'asc' | 'desc' }) {
  if (sortBy !== field) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50" />;
  return sortDir === 'asc'
    ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-foreground" />
    : <ArrowDown className="ml-1 h-3.5 w-3.5 text-foreground" />;
}

export function DepartmentListClient() {
  const router = useRouter();
  const { revenues, loading, error } = useDepartmentRevenueList();

  const [sortBy, setSortBy] = useState<SortField>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [institutionFilter, setInstitutionFilter] = useState<string>('all');

  // Derive unique institutions from the data
  const institutions = useMemo(() => {
    const seen = new Map<string, string>();
    revenues.forEach((r) => {
      if (r.institution_id && r.institution_name && !seen.has(r.institution_id)) {
        seen.set(r.institution_id, r.institution_name);
      }
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [revenues]);

  // Filter
  const filtered = useMemo(() => {
    return revenues.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (institutionFilter !== 'all' && r.institution_id !== institutionFilter) return false;
      return true;
    });
  }, [revenues, statusFilter, institutionFilter]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let aVal: string | number = 0;
      let bVal: string | number = 0;

      switch (sortBy) {
        case 'department_name':
          aVal = a.department_name.toLowerCase();
          bVal = b.department_name.toLowerCase();
          break;
        case 'institution_name':
          aVal = a.institution_name.toLowerCase();
          bVal = b.institution_name.toLowerCase();
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'revenue':
          aVal = a.revenue;
          bVal = b.revenue;
          break;
        case 'target':
          aVal = a.target;
          bVal = b.target;
          break;
        case 'achievement_pct':
          aVal = a.achievement_pct;
          bVal = b.achievement_pct;
          break;
        case 'growth_rate':
          aVal = a.growth_rate ?? -Infinity;
          bVal = b.growth_rate ?? -Infinity;
          break;
        case 'active_solutions':
          aVal = a.active_solutions;
          bVal = b.active_solutions;
          break;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return copy;
  }, [filtered, sortBy, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const handleRowClick = (dept: DepartmentRevenue) => {
    router.push(`/solutions/departments/${dept.department_id}`);
  };

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-destructive">Failed to load departments: {error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="at_risk">At Risk</SelectItem>
            <SelectItem value="dormant">Dormant</SelectItem>
            <SelectItem value="pending_approval">Pending Approval</SelectItem>
          </SelectContent>
        </Select>

        <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Filter by institution" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Institutions</SelectItem>
            {institutions.map((inst) => (
              <SelectItem key={inst.id} value={inst.id}>
                {inst.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(statusFilter !== 'all' || institutionFilter !== 'all') && (
          <button
            onClick={() => {
              setStatusFilter('all');
              setInstitutionFilter('all');
            }}
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Results count */}
      {!loading && (
        <p className="text-sm text-muted-foreground">
          Showing {sorted.length} of {revenues.length} departments
        </p>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort('department_name')}
                  >
                    <span className="flex items-center">
                      Department
                      <SortIcon field="department_name" sortBy={sortBy} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort('institution_name')}
                  >
                    <span className="flex items-center">
                      Institution
                      <SortIcon field="institution_name" sortBy={sortBy} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort('status')}
                  >
                    <span className="flex items-center">
                      Status
                      <SortIcon field="status" sortBy={sortBy} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap text-right"
                    onClick={() => handleSort('revenue')}
                  >
                    <span className="flex items-center justify-end">
                      Revenue (Qtr)
                      <SortIcon field="revenue" sortBy={sortBy} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap text-right"
                    onClick={() => handleSort('target')}
                  >
                    <span className="flex items-center justify-end">
                      Target
                      <SortIcon field="target" sortBy={sortBy} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap text-right"
                    onClick={() => handleSort('achievement_pct')}
                  >
                    <span className="flex items-center justify-end">
                      Achievement %
                      <SortIcon field="achievement_pct" sortBy={sortBy} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap text-right"
                    onClick={() => handleSort('growth_rate')}
                  >
                    <span className="flex items-center justify-end">
                      Growth
                      <SortIcon field="growth_rate" sortBy={sortBy} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap text-right"
                    onClick={() => handleSort('active_solutions')}
                  >
                    <span className="flex items-center justify-end">
                      Solutions
                      <SortIcon field="active_solutions" sortBy={sortBy} sortDir={sortDir} />
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No departments found matching the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((dept) => (
                    <TableRow
                      key={dept.department_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(dept)}
                    >
                      <TableCell className="font-medium">
                        <div>
                          <div>{dept.department_name}</div>
                          <div className="text-xs text-muted-foreground">{dept.department_code}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{dept.institution_name}</TableCell>
                      <TableCell>{getStatusBadge(dept.status)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(dept.revenue)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {dept.target > 0 ? formatCurrency(dept.target) : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {dept.target > 0 ? (
                          <span className={dept.achievement_pct >= 100 ? 'text-green-600 font-medium' : dept.achievement_pct >= 50 ? 'text-amber-600' : 'text-red-600'}>
                            {dept.achievement_pct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {dept.growth_rate !== null ? (
                          <span className={dept.growth_rate >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {dept.growth_rate >= 0 ? '+' : ''}{dept.growth_rate.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{dept.active_solutions}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
