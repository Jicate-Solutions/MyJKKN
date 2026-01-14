/**
 * Grades Table Component
 * Displays LTI grades in a searchable, sortable table
 *
 * Features:
 * - Sort by date, score, assignment name
 * - Filter by tool, status
 * - Search assignments
 * - Export to Excel
 *
 * Created: 2026-01-12
 */

'use client';

import { useState, useMemo } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowUpDown,
  Download,
  Search,
  CheckCircle2,
  Clock,
  XCircle
} from 'lucide-react';
import { format } from 'date-fns';

interface Grade {
  id: string;
  resource_link_title: string | null;
  score: number;
  score_maximum: number;
  score_percentage: number;
  activity_progress: string | null;
  grading_progress: string | null;
  graded_at: string | null;
  received_at: string;
  lti_tools: {
    name: string;
    tool_type: string;
  };
}

interface GradesTableProps {
  grades: Grade[];
}

// Activity Progress Badge
function ActivityProgressBadge({ progress }: { progress: string | null }) {
  if (!progress) return null;

  const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
    Completed: 'default',
    Submitted: 'secondary',
    InProgress: 'outline',
    Started: 'outline',
    Initialized: 'outline'
  };

  const icons: Record<string, React.ReactNode> = {
    Completed: <CheckCircle2 className="h-3 w-3 mr-1" />,
    Submitted: <CheckCircle2 className="h-3 w-3 mr-1" />,
    InProgress: <Clock className="h-3 w-3 mr-1" />,
    Started: <Clock className="h-3 w-3 mr-1" />
  };

  return (
    <Badge variant={variants[progress] || 'outline'} className="text-xs">
      {icons[progress]}
      {progress}
    </Badge>
  );
}

// Grading Progress Badge
function GradingProgressBadge({ progress }: { progress: string | null }) {
  if (!progress) return null;

  const variants: Record<
    string,
    'default' | 'secondary' | 'destructive' | 'outline'
  > = {
    FullyGraded: 'default',
    Pending: 'secondary',
    PendingManual: 'outline',
    Failed: 'destructive',
    NotReady: 'outline'
  };

  const icons: Record<string, React.ReactNode> = {
    FullyGraded: <CheckCircle2 className="h-3 w-3 mr-1" />,
    Failed: <XCircle className="h-3 w-3 mr-1" />,
    Pending: <Clock className="h-3 w-3 mr-1" />,
    PendingManual: <Clock className="h-3 w-3 mr-1" />
  };

  return (
    <Badge variant={variants[progress] || 'outline'} className="text-xs">
      {icons[progress]}
      {progress}
    </Badge>
  );
}

// Score Badge with color coding
function ScoreBadge({
  percentage
}: {
  percentage: number;
}) {
  let variant: 'default' | 'secondary' | 'destructive' = 'default';
  let bgColor = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';

  if (percentage < 50) {
    variant = 'destructive';
    bgColor = 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  } else if (percentage < 75) {
    variant = 'secondary';
    bgColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  }

  return (
    <Badge className={bgColor}>
      {percentage.toFixed(1)}%
    </Badge>
  );
}

export function GradesTable({ grades }: GradesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'graded_at', desc: true }
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns: ColumnDef<Grade>[] = useMemo(
    () => [
      {
        accessorKey: 'resource_link_title',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
            >
              Assignment
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          return (
            <div className="font-medium">
              {row.original.resource_link_title || 'Untitled Assignment'}
            </div>
          );
        }
      },
      {
        accessorKey: 'lti_tools.name',
        header: 'Tool',
        cell: ({ row }) => {
          return (
            <Badge variant="outline" className="text-xs">
              {row.original.lti_tools.name}
            </Badge>
          );
        }
      },
      {
        accessorKey: 'score',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
            >
              Score
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          return (
            <div className="space-y-1">
              <div className="font-medium">
                {row.original.score}/{row.original.score_maximum}
              </div>
              <ScoreBadge percentage={row.original.score_percentage} />
            </div>
          );
        }
      },
      {
        accessorKey: 'activity_progress',
        header: 'Activity',
        cell: ({ row }) => {
          return (
            <ActivityProgressBadge progress={row.original.activity_progress} />
          );
        }
      },
      {
        accessorKey: 'grading_progress',
        header: 'Grading',
        cell: ({ row }) => {
          return (
            <GradingProgressBadge progress={row.original.grading_progress} />
          );
        }
      },
      {
        accessorKey: 'graded_at',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
            >
              Date Graded
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          if (!row.original.graded_at) return '-';
          return format(new Date(row.original.graded_at), 'MMM dd, yyyy HH:mm');
        }
      }
    ],
    []
  );

  const table = useReactTable({
    data: grades,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString'
  });

  const handleExport = () => {
    // TODO: Implement Excel export
    alert('Export functionality coming soon!');
  };

  if (grades.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No grades yet. Complete assignments in external tools to see your
          grades here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assignments..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
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
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        Showing {table.getRowModel().rows.length} of {grades.length} grades
      </div>
    </div>
  );
}
