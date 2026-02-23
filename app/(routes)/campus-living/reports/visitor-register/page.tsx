'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, ArrowLeft, UserPlus, Users, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useVisitorRegisterReport, useExportReport } from '@/hooks/campus-living/use-campus-living-reports';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';

function formatTs(ts: string | null | undefined): string {
  if (!ts) return '—';
  try {
    return format(new Date(ts), 'MMM d, h:mm a');
  } catch {
    return '—';
  }
}

export default function VisitorRegisterReportPage() {
  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(sevenDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [blockFilter, setBlockFilter] = useState('all');
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';

  const blockId = blockFilter === 'all' ? undefined : blockFilter;
  const { data: report, isLoading, isError } = useVisitorRegisterReport(institutionId, dateFrom, dateTo, blockId);
  const { data: blocksData } = useHostelBlocks(institutionId);
  const exportReport = useExportReport();

  const blocks = blocksData?.data ?? [];
  const visitors = report?.visitors ?? [];

  return (
    <ContentLayout title="Visitor Register Report">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Link href="/campus-living/reports">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Visitor Register Report</h1>
              <p className="text-muted-foreground">NCPCR-compliant visitor log with check-in/check-out records</p>
            </div>
          </div>
          <Button
            disabled={exportReport.isPending}
            onClick={() => exportReport.mutate({
              institutionId,
              reportType: 'visitor',
              format: 'csv',
              filters: { dateFrom, dateTo, blockId },
            })}
          >
            {exportReport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="rounded-lg bg-primary/10 p-2">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Visitors</p>
                <p className="text-2xl font-bold">{report?.total_visitors ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="rounded-lg bg-primary/10 p-2">
                <UserPlus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Currently Inside</p>
                <p className="text-2xl font-bold">{report?.checked_in ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="rounded-lg bg-primary/10 p-2">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unique Visitors</p>
                <p className="text-2xl font-bold">{report?.total_unique_visitors ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[180px]" />
              <span className="text-muted-foreground self-center">to</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[180px]" />
              <Select value={blockFilter} onValueChange={setBlockFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Block" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blocks</SelectItem>
                  {blocks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Visitor Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Visitor Register
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
                <p className="text-muted-foreground">Failed to load visitor data.</p>
              </div>
            )}
            {!isLoading && !isError && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Visitor Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Relation</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Check-out</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visitors.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No visitor records found for this period.
                      </TableCell>
                    </TableRow>
                  )}
                  {visitors.map((v: any, idx: number) => (
                    <TableRow key={v.id ?? idx}>
                      <TableCell className="font-medium">{v.visitor_name}</TableCell>
                      <TableCell className="text-sm">{v.visitor_phone ?? '—'}</TableCell>
                      <TableCell className="capitalize">{v.visitor_relationship?.replace(/_/g, ' ') ?? '—'}</TableCell>
                      <TableCell>{v.purpose ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatTs(v.check_in_time)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {v.check_out_time ? formatTs(v.check_out_time) : (
                          <Badge variant="outline" className="text-orange-600 border-orange-300">Still Inside</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          v.status === 'checked_out' ? 'default' :
                          v.status === 'checked_in' ? 'outline' :
                          v.status === 'rejected' ? 'destructive' : 'secondary'
                        }>
                          {v.status?.replace(/_/g, ' ') ?? '—'}
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
