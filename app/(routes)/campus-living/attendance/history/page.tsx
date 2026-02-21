'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import {
  ArrowLeft,
  Search,
  Loader2,
  Download,
  Calendar,
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

// Placeholder data
const useAttendanceHistory = (filters: { block?: string; from?: string; to?: string; page?: number }) => {
  return {
    data: {
      records: [
        { date: '2026-02-21', block: 'Boys Hostel A', total: 295, present: 270, absent: 15, on_leave: 8, late: 2, rate: 91.5 },
        { date: '2026-02-21', block: 'Boys Hostel B', total: 210, present: 195, absent: 8, on_leave: 5, late: 2, rate: 92.9 },
        { date: '2026-02-21', block: 'Girls Hostel A', total: 380, present: 355, absent: 12, on_leave: 10, late: 3, rate: 93.4 },
        { date: '2026-02-20', block: 'Boys Hostel A', total: 295, present: 280, absent: 8, on_leave: 5, late: 2, rate: 94.9 },
        { date: '2026-02-20', block: 'Boys Hostel B', total: 210, present: 200, absent: 5, on_leave: 3, late: 2, rate: 95.2 },
        { date: '2026-02-20', block: 'Girls Hostel A', total: 380, present: 360, absent: 10, on_leave: 8, late: 2, rate: 94.7 },
        { date: '2026-02-19', block: 'Boys Hostel A', total: 295, present: 268, absent: 18, on_leave: 7, late: 2, rate: 90.8 },
        { date: '2026-02-19', block: 'Girls Hostel B', total: 280, present: 265, absent: 8, on_leave: 5, late: 2, rate: 94.6 },
        { date: '2026-02-18', block: 'Boys Hostel A', total: 295, present: 275, absent: 12, on_leave: 6, late: 2, rate: 93.2 },
        { date: '2026-02-18', block: 'Girls Hostel A', total: 380, present: 358, absent: 12, on_leave: 8, late: 2, rate: 94.2 },
      ],
      pagination: { page: 1, totalPages: 5, total: 50 },
    },
    isLoading: false,
    error: null,
  };
};

export default function AttendanceHistoryPage() {
  const { profile } = useAuth();
  const [selectedBlock, setSelectedBlock] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAttendanceHistory({ block: selectedBlock, from: fromDate, to: toDate, page });

  const blocks = [
    { id: 'all', name: 'All Blocks' },
    { id: '1', name: 'Boys Hostel A' },
    { id: '2', name: 'Boys Hostel B' },
    { id: '3', name: 'Girls Hostel A' },
    { id: '4', name: 'Girls Hostel B' },
    { id: '5', name: 'Girls Hostel C' },
    { id: '6', name: 'PG Hostel' },
  ];

  if (isLoading) {
    return (
      <ContentLayout title="Attendance History">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Attendance History">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Attendance', href: '/campus-living/attendance' },
          { label: 'History' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/campus-living/attendance">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold py-1">Attendance History</h1>
              <p className="text-sm text-muted-foreground">
                Historical attendance records with date range filters
              </p>
            </div>
          </div>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="space-y-1.5">
                <Label>Block</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={selectedBlock}
                  onChange={(e) => setSelectedBlock(e.target.value)}
                >
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>From Date</Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-44"
                />
              </div>
              <div className="space-y-1.5">
                <Label>To Date</Label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-44"
                />
              </div>
              <div className="space-y-1.5 flex-1">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Present</TableHead>
                  <TableHead className="text-center">Absent</TableHead>
                  <TableHead className="text-center">On Leave</TableHead>
                  <TableHead className="text-center">Late</TableHead>
                  <TableHead className="text-center">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.records.map((record, idx) => (
                  <TableRow key={`${record.date}-${record.block}-${idx}`}>
                    <TableCell className="font-medium">{record.date}</TableCell>
                    <TableCell>{record.block}</TableCell>
                    <TableCell className="text-center">{record.total}</TableCell>
                    <TableCell className="text-center text-green-600 font-medium">{record.present}</TableCell>
                    <TableCell className="text-center text-red-600 font-medium">{record.absent}</TableCell>
                    <TableCell className="text-center text-amber-600">{record.on_leave}</TableCell>
                    <TableCell className="text-center text-orange-600">{record.late}</TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={record.rate >= 90 ? 'success' : record.rate >= 75 ? 'default' : 'destructive'}
                        className="text-xs"
                      >
                        {record.rate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pagination */}
        {data?.pagination && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} records)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                disabled={page >= data.pagination.totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
