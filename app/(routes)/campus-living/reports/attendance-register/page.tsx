'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { Download, Printer, Users, Loader2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAttendanceRegisterReport, useExportReport } from '@/hooks/campus-living/use-campus-living-reports';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';

export default function AttendanceRegisterPage() {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [blockFilter, setBlockFilter] = useState('all');
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';

  const blockId = blockFilter === 'all' ? undefined : blockFilter;
  const { data: report, isLoading, isError } = useAttendanceRegisterReport(institutionId, dateFrom, dateTo, blockId);
  const { data: blocksData } = useHostelBlocks(institutionId);
  const exportReport = useExportReport();

  const blocks = blocksData?.data ?? [];
  const learners = report?.learners ?? [];
  const totalRecords = report?.total_records ?? 0;

  return (
    <ContentLayout title="Attendance Register">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">NCPCR Daily Attendance Register</h1>
            <p className="text-muted-foreground">Attendance summary as per NCPCR guidelines</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />Print
            </Button>
            <Button
              variant="outline"
              disabled={exportReport.isPending}
              onClick={() => exportReport.mutate({
                institutionId,
                reportType: 'attendance',
                format: 'json',
                filters: { dateFrom, dateTo, blockId },
              })}
            >
              {exportReport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[180px]"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[180px]"
              />
              <Select value={blockFilter} onValueChange={setBlockFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Block" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blocks</SelectItem>
                  {blocks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="outline" className="ml-auto">
                <Users className="mr-1 h-3 w-3" />
                {totalRecords} records &middot; {learners.length} students
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Data */}
        <Card>
          <CardHeader>
            <CardTitle>
              Attendance Summary — {dateFrom} to {dateTo}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
            {isError && (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground">Failed to load attendance data.</p>
              </div>
            )}
            {!isLoading && !isError && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>S.No.</TableHead>
                    <TableHead>Learner ID</TableHead>
                    <TableHead>Total Days</TableHead>
                    <TableHead className="text-center">Present</TableHead>
                    <TableHead className="text-center">Absent</TableHead>
                    <TableHead className="text-center">On Leave</TableHead>
                    <TableHead className="text-center">Late Entry</TableHead>
                    <TableHead className="text-center">Curfew Violations</TableHead>
                    <TableHead>Attendance %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {learners.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        No attendance records found for this period.
                      </TableCell>
                    </TableRow>
                  )}
                  {learners.map((l, idx) => (
                    <TableRow key={l.learner_id}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell className="font-mono text-sm">{l.learner_id?.slice(0, 8) ?? '—'}...</TableCell>
                      <TableCell>{l.total_days}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="default">{l.present}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={l.absent > 0 ? 'destructive' : 'outline'}>{l.absent}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{l.on_leave}</TableCell>
                      <TableCell className="text-center">{l.late_entry}</TableCell>
                      <TableCell className="text-center">
                        {l.curfew_violations > 0 ? (
                          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">{l.curfew_violations}</Badge>
                        ) : '0'}
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          l.attendance_percentage >= 90
                            ? 'bg-green-100 text-green-800 hover:bg-green-100'
                            : l.attendance_percentage >= 75
                              ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
                              : 'bg-red-100 text-red-800 hover:bg-red-100'
                        }>
                          {l.attendance_percentage}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
