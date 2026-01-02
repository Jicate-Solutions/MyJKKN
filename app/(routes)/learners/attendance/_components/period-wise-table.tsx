/**
 * Period-wise Attendance Table Component
 * Created: 2025-12-29
 * Updated: 2025-01-02 - Upgraded to TanStack Table with advanced features
 * Description: Detailed table showing all attendance records by period with sorting, filtering
 */

'use client';

import { useState, useMemo } from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Check,
  X,
  Clock,
  BookOpen,
  Filter,
} from 'lucide-react';
import type { StudentAttendanceRecord } from '@/types/student-attendance';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface PeriodWiseAttendanceTableProps {
  data: StudentAttendanceRecord[];
}

/**
 * Format time from 24-hour to 12-hour format
 * e.g., "09:00:00" -> "9:00 AM"
 */
function formatTime(time: string): string {
  if (!time) return '-';

  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${minutes} ${period}`;
}

/**
 * Format time range
 * e.g., "09:00:00" - "10:00:00" -> "9:00 AM - 10:00 AM"
 */
function formatTimeRange(startTime: string, endTime: string): string {
  if (!startTime && !endTime) return '-';
  if (!startTime) return formatTime(endTime);
  if (!endTime) return formatTime(startTime);
  return `${formatTime(startTime)} - ${formatTime(endTime)}`;
}

export function PeriodWiseAttendanceTable({ data }: PeriodWiseAttendanceTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Define columns
  const columns: ColumnDef<StudentAttendanceRecord>[] = useMemo(
    () => [
      {
        accessorKey: 'date',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2 hover:bg-muted/50 -ml-2 font-semibold"
          >
            <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
            Date
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="font-medium">
            {format(parseISO(row.getValue('date')), 'MMM dd, yyyy')}
          </div>
        ),
        sortingFn: 'datetime',
      },
      {
        accessorKey: 'period_name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2 hover:bg-muted/50 -ml-2 font-semibold"
          >
            Period
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-normal">
              {row.getValue('period_name')}
            </Badge>
          </div>
        ),
      },
      {
        id: 'time',
        accessorFn: (row) => formatTimeRange(row.start_time, row.end_time),
        header: ({ column }) => (
          <div className="flex items-center gap-2 font-semibold text-muted-foreground">
            <Clock className="h-4 w-4" />
            Time
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-muted-foreground text-sm">
            {formatTimeRange(row.original.start_time, row.original.end_time)}
          </div>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'course_name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2 hover:bg-muted/50 -ml-2 font-semibold"
          >
            <BookOpen className="mr-2 h-4 w-4 text-muted-foreground" />
            Course
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="max-w-[250px]">
            <div className="font-medium truncate">{row.getValue('course_name')}</div>
            {row.original.course_code && (
              <div className="text-xs text-muted-foreground">
                {row.original.course_code}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2 hover:bg-muted/50 font-semibold"
          >
            Status
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const status = row.getValue('status') as string;
          const isPresent = status === 'Present';

          return (
            <div className="flex justify-center">
              <Badge
                className={cn(
                  'gap-1 px-2.5 py-0.5 font-medium',
                  isPresent
                    ? 'bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400'
                )}
              >
                {isPresent ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                {status}
              </Badge>
            </div>
          );
        },
        filterFn: (row, id, value) => {
          if (value === 'all') return true;
          return row.getValue(id) === value;
        },
      },
    ],
    []
  );

  // Filter data by status
  const filteredData = useMemo(() => {
    if (statusFilter === 'all') return data;
    return data.filter(record => record.status === statusFilter);
  }, [data, statusFilter]);

  // Initialize table
  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, columnId, filterValue) => {
      const search = filterValue.toLowerCase();
      return (
        row.original.course_name.toLowerCase().includes(search) ||
        row.original.course_code?.toLowerCase().includes(search) ||
        row.original.period_name.toLowerCase().includes(search)
      );
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  // Calculate stats
  const totalRecords = data.length;
  const presentCount = data.filter(r => r.status === 'Present').length;
  const absentCount = data.filter(r => r.status === 'Absent').length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Detailed Attendance Records
            </CardTitle>
            <CardDescription className="mt-1">
              Complete list of all attendance records for the selected semester
            </CardDescription>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-semibold">{totalRecords}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 dark:bg-green-900/20 rounded-md">
              <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              <span className="font-semibold text-green-700 dark:text-green-400">{presentCount}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded-md">
              <X className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              <span className="font-semibold text-red-700 dark:text-red-400">{absentCount}</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div className="flex flex-1 items-center gap-2 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by course, code, or period..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Present">
                  <div className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-green-600" />
                    Present
                  </div>
                </SelectItem>
                <SelectItem value="Absent">
                  <div className="flex items-center gap-2">
                    <X className="h-3.5 w-3.5 text-red-600" />
                    Absent
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Column Visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ml-auto">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[150px]">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  const columnNames: Record<string, string> = {
                    date: 'Date',
                    period_name: 'Period',
                    time: 'Time',
                    course_name: 'Course',
                    status: 'Status',
                  };
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {columnNames[column.id] || column.id}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Search Results Info */}
        {globalFilter && (
          <p className="text-sm text-muted-foreground mb-3">
            Found {table.getFilteredRowModel().rows.length} record{table.getFilteredRowModel().rows.length !== 1 ? 's' : ''} matching &quot;{globalFilter}&quot;
          </p>
        )}

        {/* Table */}
        {table.getRowModel().rows.length === 0 ? (
          <div className="rounded-md border">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground font-medium">
                {globalFilter || statusFilter !== 'all'
                  ? 'No records match your filters'
                  : 'No attendance records available'}
              </p>
              {(globalFilter || statusFilter !== 'all') && (
                <Button
                  variant="link"
                  className="mt-2"
                  onClick={() => {
                    setGlobalFilter('');
                    setStatusFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id} className="px-4">
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="px-4 py-3">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>
                  Showing{' '}
                  <span className="font-medium text-foreground">
                    {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
                  </span>
                  {' '}-{' '}
                  <span className="font-medium text-foreground">
                    {Math.min(
                      (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                      table.getFilteredRowModel().rows.length
                    )}
                  </span>
                  {' '}of{' '}
                  <span className="font-medium text-foreground">
                    {table.getFilteredRowModel().rows.length}
                  </span>
                  {' '}records
                </span>
              </div>

              <div className="flex items-center gap-4">
                {/* Rows per page */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Rows:</span>
                  <Select
                    value={`${table.getState().pagination.pageSize}`}
                    onValueChange={(value) => table.setPageSize(Number(value))}
                  >
                    <SelectTrigger className="h-8 w-[70px]">
                      <SelectValue placeholder={table.getState().pagination.pageSize} />
                    </SelectTrigger>
                    <SelectContent side="top">
                      {[10, 20, 30, 50, 100].map((pageSize) => (
                        <SelectItem key={pageSize} value={`${pageSize}`}>
                          {pageSize}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Page Navigation */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 hidden sm:flex"
                    onClick={() => table.setPageIndex(0)}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                    <span className="sr-only">First page</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline ml-1">Previous</span>
                  </Button>

                  <div className="flex items-center gap-1 px-2">
                    <span className="text-sm font-medium">
                      {table.getState().pagination.pageIndex + 1}
                    </span>
                    <span className="text-sm text-muted-foreground">/</span>
                    <span className="text-sm text-muted-foreground">
                      {table.getPageCount()}
                    </span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  >
                    <span className="hidden sm:inline mr-1">Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 hidden sm:flex"
                    onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                    disabled={!table.getCanNextPage()}
                  >
                    <ChevronsRight className="h-4 w-4" />
                    <span className="sr-only">Last page</span>
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
