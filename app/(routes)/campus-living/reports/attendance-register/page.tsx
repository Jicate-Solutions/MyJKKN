'use client';

import { useState, useMemo } from 'react';
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
import { Download, Printer, Users, Loader2, CalendarRange } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useExportReport,
  useAttendanceRegisterReport,
} from '@/hooks/campus-living/use-campus-living-reports';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import { PreviewBanner } from '../../_components/preview-banner';

// Live per-learner aggregate as returned by CampusLivingReports.generateAttendanceRegister
// (records[] is stripped on the server; we surface the rollup columns directly).
type LearnerRollup = {
  learner_id: string;
  total_days: number;
  present: number;
  absent: number;
  on_leave: number;
  late_entry: number;
  curfew_violations: number;
  attendance_percentage: number;
};

const todayIso = () => new Date().toISOString().split('T')[0];
const daysAgoIso = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

export default function AttendanceRegisterPage() {
  const [dateFrom, setDateFrom] = useState(daysAgoIso(30));
  const [dateTo, setDateTo] = useState(todayIso());
  const [blockFilter, setBlockFilter] = useState<string>('all');
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';
  const exportReport = useExportReport();
  const blocksQuery = useHostelBlocks(institutionId);

  const blockIdForQuery = blockFilter === 'all' ? undefined : blockFilter;
  const {
    data: report,
    isLoading,
    error,
  } = useAttendanceRegisterReport(institutionId, dateFrom, dateTo, blockIdForQuery);

  const learners = useMemo<LearnerRollup[]>(
    () => (report?.learners ?? []) as LearnerRollup[],
    [report],
  );

  const totals = useMemo(() => {
    const totalLearners = learners.length;
    const totalDays = learners.reduce((s, l) => s + l.total_days, 0);
    const totalPresent = learners.reduce((s, l) => s + l.present, 0);
    const totalAbsent = learners.reduce((s, l) => s + l.absent, 0);
    const totalLeave = learners.reduce((s, l) => s + l.on_leave, 0);
    const totalCurfew = learners.reduce((s, l) => s + l.curfew_violations, 0);
    const avgPct =
      totalDays > 0 ? Math.round((totalPresent / totalDays) * 100) : 0;
    return { totalLearners, totalDays, totalPresent, totalAbsent, totalLeave, totalCurfew, avgPct };
  }, [learners]);

  if (isLoading) {
    return (
      <ContentLayout title="Attendance Register">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Attendance Register">
      <div className="space-y-6">
        <PreviewBanner
          feature="attendance register"
          note="The on-screen table now shows live per-learner attendance rollups for the selected date range (NCPCR-compliant aggregates). Print button is a placeholder."
        />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">NCPCR Attendance Register</h1>
            <p className="text-muted-foreground">
              Per-learner attendance summary across the selected date range
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />Print
            </Button>
            <Button
              variant="outline"
              disabled={exportReport.isPending}
              onClick={() =>
                exportReport.mutate({
                  institutionId,
                  reportType: 'attendance',
                  format: 'json',
                  filters: { dateFrom, dateTo, blockId: blockIdForQuery },
                })
              }
            >
              {exportReport.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export
            </Button>
          </div>
        </div>

        {error ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive">
              Failed to load attendance:{' '}
              {error instanceof Error ? error.message : 'unknown error'}
            </CardContent>
          </Card>
        ) : null}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[180px]"
                aria-label="Date from"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[180px]"
                aria-label="Date to"
              />
              <Select value={blockFilter} onValueChange={setBlockFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Block" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blocks</SelectItem>
                  {(blocksQuery.data?.data ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="outline" className="ml-auto">
                <Users className="mr-1 h-3 w-3" />
                Learners: {totals.totalLearners} · Avg attendance: {totals.avgPct}%
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Summary cards */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Records in range</p>
              <p className="text-3xl font-bold">{report?.total_records ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Present</p>
              <p className="text-3xl font-bold text-green-600">{totals.totalPresent}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Absent</p>
              <p className="text-3xl font-bold text-red-600">{totals.totalAbsent}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Curfew Violations</p>
              <p className="text-3xl font-bold text-amber-600">{totals.totalCurfew}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarRange className="h-5 w-5" />
              {dateFrom} → {dateTo}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {learners.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 font-medium">No attendance records found</p>
                <p className="mt-1 text-sm text-muted-foreground max-w-md">
                  No hostel attendance entries exist between {dateFrom} and {dateTo}
                  {blockFilter !== 'all' ? ' for the selected block' : ''}.
                  Try widening the date range or selecting a different block.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>S.No.</TableHead>
                    <TableHead>Learner</TableHead>
                    <TableHead className="text-center">Days</TableHead>
                    <TableHead className="text-center">Present</TableHead>
                    <TableHead className="text-center">Absent</TableHead>
                    <TableHead className="text-center">On Leave</TableHead>
                    <TableHead className="text-center">Late Entry</TableHead>
                    <TableHead className="text-center">Curfew</TableHead>
                    <TableHead className="text-center">Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {learners.map((row, idx) => (
                    <TableRow key={row.learner_id}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.learner_id.slice(0, 8)}…
                      </TableCell>
                      <TableCell className="text-center">{row.total_days}</TableCell>
                      <TableCell className="text-center text-green-700">{row.present}</TableCell>
                      <TableCell className="text-center text-red-700">{row.absent}</TableCell>
                      <TableCell className="text-center">{row.on_leave}</TableCell>
                      <TableCell className="text-center">{row.late_entry}</TableCell>
                      <TableCell className="text-center">
                        {row.curfew_violations > 0 ? (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                            {row.curfew_violations}
                          </Badge>
                        ) : (
                          '0'
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={
                            row.attendance_percentage >= 85
                              ? 'bg-green-100 text-green-800 hover:bg-green-100'
                              : row.attendance_percentage >= 70
                              ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
                              : 'bg-red-100 text-red-800 hover:bg-red-100'
                          }
                        >
                          {row.attendance_percentage}%
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
