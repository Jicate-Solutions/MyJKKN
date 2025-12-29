/**
 * Period-wise Attendance Table Component
 * Created: 2025-12-29
 * Description: Detailed table showing all attendance records by period
 */

'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { StudentAttendanceRecord } from '@/types/student-attendance';
import { format, parseISO } from 'date-fns';

interface PeriodWiseAttendanceTableProps {
  data: StudentAttendanceRecord[];
}

const ITEMS_PER_PAGE = 10;

export function PeriodWiseAttendanceTable({ data }: PeriodWiseAttendanceTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter data based on search query
  const filteredData = useMemo(() => {
    if (!searchQuery) return data;

    const query = searchQuery.toLowerCase();
    return data.filter(
      record =>
        record.course_name.toLowerCase().includes(query) ||
        record.course_code?.toLowerCase().includes(query) ||
        record.period_name.toLowerCase().includes(query)
    );
  }, [data, searchQuery]);

  // Paginate filtered data
  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredData, currentPage]);

  // Reset to page 1 when search changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Detailed Attendance Records
        </CardTitle>
        <CardDescription>
          Complete list of all attendance records for the selected semester
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by course name, code, or period..."
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          {searchQuery && (
            <p className="text-sm text-muted-foreground mt-2">
              Found {filteredData.length} record{filteredData.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Table */}
        {paginatedData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {searchQuery ? 'No records match your search' : 'No attendance records available'}
          </p>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map((record, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {format(parseISO(record.date), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>{record.period_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {record.start_time && record.end_time
                          ? `${record.start_time} - ${record.end_time}`
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{record.course_name}</div>
                          {record.course_code && (
                            <div className="text-xs text-muted-foreground">
                              {record.course_code}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={record.status === 'Present' ? 'default' : 'destructive'}
                        >
                          {record.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
                  {Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)} of{' '}
                  {filteredData.length} records
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
