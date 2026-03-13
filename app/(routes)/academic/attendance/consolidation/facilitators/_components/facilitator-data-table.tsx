'use client';

import { useState, Fragment } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getExpandedRowModel,
  flexRender,
  type SortingState,
  type ExpandedState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, CalendarClock } from 'lucide-react';
import { getFacilitatorColumns } from './facilitator-columns';
import { FacilitatorTrendChart } from './facilitator-trend-chart';
import type { FacilitatorAttendanceStat, FacilitatorTimetableAssignment } from '@/types/attendance';

interface Props {
  facilitators: FacilitatorAttendanceStat[];
  globalFilter: string;
}

function TimetableBreakdown({ assignments }: { assignments: FacilitatorTimetableAssignment[] }) {
  if (assignments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">No timetable assignments found.</p>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold flex items-center gap-1.5">
        <CalendarClock className="h-3.5 w-3.5" />
        Timetable Breakdown
      </h4>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-xs">
              <th className="text-left py-1.5 px-3 font-medium">Timetable</th>
              <th className="text-center py-1.5 px-3 font-medium">Assigned</th>
              <th className="text-center py-1.5 px-3 font-medium">Marked</th>
              <th className="text-center py-1.5 px-3 font-medium">Pending</th>
              <th className="text-center py-1.5 px-3 font-medium">Rate</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((ta) => {
              const rate = ta.assignedCount > 0
                ? Math.round((ta.markedCount / ta.assignedCount) * 100)
                : 0;
              const rateColor =
                rate >= 80 ? 'text-green-700 dark:text-green-400' :
                rate >= 60 ? 'text-blue-700 dark:text-blue-400' :
                rate >= 40 ? 'text-yellow-700 dark:text-yellow-400' :
                'text-red-600 dark:text-red-400';
              return (
                <tr key={ta.timetableId} className="border-t">
                  <td className="py-1.5 px-3 font-medium">{ta.timetableName}</td>
                  <td className="py-1.5 px-3 text-center text-indigo-700 dark:text-indigo-400 font-semibold">
                    {ta.assignedCount}
                  </td>
                  <td className="py-1.5 px-3 text-center text-green-700 dark:text-green-400 font-semibold">
                    {ta.markedCount}
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <span className={`font-semibold ${ta.pendingCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                      {ta.pendingCount}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <span className={`font-semibold ${rateColor}`}>{rate}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FacilitatorDataTable({ facilitators, globalFilter }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'periodsMarked', desc: true },
  ]);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const columns = getFacilitatorColumns();

  const table = useReactTable({
    data: facilitators,
    columns,
    state: { sorting, globalFilter, expanded },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Facilitator Details ({table.getFilteredRowModel().rows.length} records)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  <TableHead className="w-8" />
                  {hg.headers.map((h) => (
                    <TableHead key={h.id}>
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => row.toggleExpanded()}
                  >
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          row.toggleExpanded();
                        }}
                      >
                        {row.getIsExpanded() ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </Button>
                    </TableCell>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() && (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length + 1}
                        className="bg-muted/30 p-4"
                      >
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <TimetableBreakdown assignments={row.original.timetableAssignments ?? []} />
                          <div className="min-w-0">
                            <FacilitatorTrendChart facilitators={[row.original]} />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
              {table.getRowModel().rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + 1}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No facilitators found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
