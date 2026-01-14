/**
 * Course Grades Table Component (Faculty View)
 * Displays all student grades with sorting and filtering
 *
 * Features:
 * - Sort by student name, score, date
 * - Search students
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
import { ArrowUpDown, Download, Search } from 'lucide-react';
import { format } from 'date-fns';

interface Grade {
  id: string;
  resource_link_id: string;
  resource_link_title: string | null;
  score: number;
  score_maximum: number;
  score_percentage: number;
  activity_progress: string | null;
  grading_progress: string | null;
  graded_at: string | null;
  lti_tools: {
    id: string;
    name: string;
    tool_type: string;
  };
  learners_profiles: {
    id: string;
    first_name: string;
    last_name: string;
    roll_number: string | null;
    programs: { name: string } | null;
    semesters: { name: string } | null;
    sections: { name: string } | null;
  };
}

interface CourseGradesTableProps {
  grades: Grade[];
}

// Score Badge with color coding
function ScoreBadge({ percentage }: { percentage: number }) {
  let bgColor =
    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';

  if (percentage < 50) {
    bgColor = 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  } else if (percentage < 75) {
    bgColor =
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  }

  return <Badge className={bgColor}>{percentage.toFixed(1)}%</Badge>;
}

export function CourseGradesTable({ grades }: CourseGradesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'graded_at', desc: true }
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns: ColumnDef<Grade>[] = useMemo(
    () => [
      {
        accessorKey: 'learners_profiles.first_name',
        id: 'student_name',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
            >
              Student
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const profile = row.original.learners_profiles;
          return (
            <div>
              <div className="font-medium">
                {profile.first_name} {profile.last_name}
              </div>
              {profile.roll_number && (
                <div className="text-xs text-muted-foreground">
                  {profile.roll_number}
                </div>
              )}
            </div>
          );
        }
      },
      {
        accessorKey: 'learners_profiles.programs.name',
        header: 'Program',
        cell: ({ row }) => {
          const profile = row.original.learners_profiles;
          return (
            <div className="text-sm">
              <div>{profile.programs?.name || '-'}</div>
              <div className="text-xs text-muted-foreground">
                {profile.semesters?.name} - {profile.sections?.name}
              </div>
            </div>
          );
        }
      },
      {
        accessorKey: 'resource_link_title',
        header: 'Assignment',
        cell: ({ row }) => {
          return (
            <div>
              <div className="font-medium">
                {row.original.resource_link_title || 'Untitled'}
              </div>
              <Badge variant="outline" className="text-xs mt-1">
                {row.original.lti_tools.name}
              </Badge>
            </div>
          );
        }
      },
      {
        accessorKey: 'score_percentage',
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
        accessorKey: 'grading_progress',
        header: 'Status',
        cell: ({ row }) => {
          const progress = row.original.grading_progress;
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

          return (
            <Badge
              variant={variants[progress || ''] || 'outline'}
              className="text-xs"
            >
              {progress || 'Unknown'}
            </Badge>
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
              Date
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          if (!row.original.graded_at) return '-';
          return format(new Date(row.original.graded_at), 'MMM dd, yyyy');
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
          No grades found. Adjust filters or wait for students to complete
          assignments.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Export */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search students, assignments..."
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
