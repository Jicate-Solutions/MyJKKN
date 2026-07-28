'use client';

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertBox } from '@/components/ui/alert-box';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, AlertCircle, Download, Settings, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import EditableCell from './editable-cell';
import { SchoolDefaultsFilters } from './school-defaults-filters';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SchoolWithDefaults {
  school_id: string;
  school_name: string;
  entity_type: string;
  degree_id: string | null;
  degree_name: string | null;
  degree_code: string | null;
  department_id: string | null;
  department_name: string | null;
  department_code: string | null;
  learner_count: number;
}

interface SchoolDefaultsTableProps {
  data: SchoolWithDefaults[];
  selectedIds: Set<string>;
  onSelectAll: (checked: boolean) => void;
  onSelectSchool: (schoolId: string, checked: boolean) => void;
  onRefresh: () => Promise<void>;
  onViewSchool: (school: SchoolWithDefaults) => void;
  onUpdateDegree?: (schoolId: string, degreeId: string | null, newName: string) => Promise<void>;
  onUpdateDepartment?: (schoolId: string, deptId: string | null, newName: string) => Promise<void>;
  searchText?: string;
  statusFilter?: string;
  onSearchChange?: (search: string) => void;
  onStatusChange?: (status: string) => void;
  sortBy?: 'name' | 'learners';
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: 'name' | 'learners', order: 'asc' | 'desc') => void;
}

export default function SchoolDefaultsTable({
  data,
  selectedIds,
  onSelectAll,
  onSelectSchool,
  onRefresh,
  onViewSchool,
  onUpdateDegree,
  onUpdateDepartment,
  searchText = '',
  statusFilter = 'all',
  onSearchChange,
  onStatusChange,
  sortBy = 'name',
  sortOrder = 'asc',
  onSort,
}: SchoolDefaultsTableProps) {
  const [currentPage, setCurrentPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);

  const hasDefaults = (school: SchoolWithDefaults) => !!school.degree_id;

  const defaultsCount = data.filter(hasDefaults).length;
  const missingCount = data.filter(s => !hasDefaults(s)).length;

  // Pagination calculations
  const totalPages = Math.ceil(data.length / rowsPerPage);
  const startIdx = (currentPage - 1) * rowsPerPage;
  const endIdx = startIdx + rowsPerPage;
  const paginatedData = data.slice(startIdx, endIdx);

  const SortIcon = ({ field }: { field: 'name' | 'learners' }) => {
    if (sortBy !== field) return <span className="text-muted-foreground">⇅</span>;
    return sortOrder === 'asc' ? <span>↑</span> : <span>↓</span>;
  };

  return (
    <div className="space-y-4">
      {/* Stats cards (scorecard) */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <div className="rounded-lg border p-6 bg-white">
          <div className="text-sm font-medium text-muted-foreground mb-2">Total Schools</div>
          <div className="text-3xl font-bold">{data.length}</div>
        </div>
        <div className="rounded-lg border p-6 bg-white">
          <div className="text-sm font-medium text-muted-foreground mb-2">With Defaults</div>
          <div className="text-3xl font-bold text-green-600">{defaultsCount}</div>
        </div>
        <div className="rounded-lg border p-6 bg-white">
          <div className="text-sm font-medium text-muted-foreground mb-2">Missing Defaults</div>
          <div className="text-3xl font-bold text-amber-600">{missingCount}</div>
        </div>
      </div>

      {/* Filters - below scorecard */}
      {onSearchChange && onStatusChange && (
        <SchoolDefaultsFilters
          onSearchChange={onSearchChange}
          onStatusChange={onStatusChange}
          defaultSearch={searchText}
          defaultStatus={statusFilter}
        />
      )}

      {/* Toolbar with pagination info and actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border rounded-lg p-4">
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{data.length}</span> of{' '}
            <span className="font-semibold text-foreground">{data.length}</span> schools
          </span>
          <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded font-medium">
            100% of total
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>View settings</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {missingCount > 0 && (
        <AlertBox
          type="warning"
          message={`${missingCount} school(s) are missing K-12 Program degree assignment. Run the batch auto-fill script to fix: npm run batch:autofill-schools`}
        />
      )}

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedIds.size === data.length && data.length > 0}
                  indeterminate={selectedIds.size > 0 && selectedIds.size < data.length ? true : undefined}
                  onCheckedChange={onSelectAll}
                />
              </TableHead>
              <TableHead className="min-w-48 cursor-pointer hover:bg-muted/70" onClick={() => {
                const newOrder = sortBy === 'name' && sortOrder === 'asc' ? 'desc' : 'asc';
                onSort?.('name', newOrder);
              }}>
                <div className="flex items-center gap-2">
                  School Name <SortIcon field="name" />
                </div>
              </TableHead>
              <TableHead className="w-20 cursor-pointer hover:bg-muted/70" onClick={() => {
                const newOrder = sortBy === 'learners' && sortOrder === 'asc' ? 'desc' : 'asc';
                onSort?.('learners', newOrder);
              }}>
                <div className="flex items-center gap-2">
                  Learners <SortIcon field="learners" />
                </div>
              </TableHead>
              <TableHead className="min-w-48">K-12 Program Degree</TableHead>
              <TableHead className="min-w-48">Academic Department</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.map(school => (
              <TableRow key={school.school_id}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(school.school_id)}
                    onCheckedChange={(checked) => onSelectSchool(school.school_id, checked as boolean)}
                  />
                </TableCell>
                <TableCell className="font-medium">{school.school_name}</TableCell>
                <TableCell>{school.learner_count}</TableCell>
                <TableCell>
                  {school.degree_name ? (
                    <EditableCell
                      value={school.degree_name}
                      onSave={async (newValue) => {
                        if (onUpdateDegree) {
                          await onUpdateDegree(school.school_id, school.degree_id, newValue);
                        }
                      }}
                      placeholder="Degree name"
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {school.department_name ? (
                    <EditableCell
                      value={school.department_name}
                      onSave={async (newValue) => {
                        if (onUpdateDepartment) {
                          await onUpdateDepartment(school.school_id, school.department_id, newValue);
                        }
                      }}
                      placeholder="Department name"
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {school.degree_id ? (
                    <Badge variant="outline" className="bg-green-50 border-green-300">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Configured
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-50 border-amber-300">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Missing
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewSchool(school)}
                  >
                    {school.degree_id ? 'View' : 'Create'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Table Footer - Pagination Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border rounded-lg p-4">
        <div className="text-sm text-muted-foreground">
          {selectedIds.size} of {data.length} row(s) selected.
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page</span>
            <Select value={rowsPerPage.toString()} onValueChange={(val) => {
              setRowsPerPage(Number(val));
              setCurrentPage(1);
            }}>
              <SelectTrigger className="w-20">
                <SelectValue>{rowsPerPage}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages || 1}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
