'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Download, Printer, Building2, Loader2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useOccupancyReport, useExportReport } from '@/hooks/campus-living/use-campus-living-reports';

export default function OccupancyReportPage() {
  const [blockFilter, setBlockFilter] = useState('all');
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';
  const { data: report, isLoading, isError } = useOccupancyReport(institutionId);
  const exportReport = useExportReport();

  const blocks = report?.blocks ?? [];
  const filteredBlocks = blocks.filter(b => blockFilter === 'all' || b.id === blockFilter);

  return (
    <ContentLayout title="Occupancy Report">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Occupancy Report</h1>
            <p className="text-muted-foreground">Room and bed occupancy status across all blocks</p>
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
                reportType: 'occupancy',
                format: 'json',
              })}
            >
              {exportReport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {report?.summary && (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">Total Blocks</p>
                <p className="text-3xl font-bold">{report.summary.total_blocks}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">Total Rooms</p>
                <p className="text-3xl font-bold">{report.summary.total_rooms}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">Total Capacity</p>
                <p className="text-3xl font-bold">{report.summary.total_capacity}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">Occupancy Rate</p>
                <p className={`text-3xl font-bold ${report.summary.overall_percentage >= 90 ? 'text-green-600' : report.summary.overall_percentage >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {report.summary.overall_percentage}%
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Block-wise Occupancy</CardTitle>
              <Select value={blockFilter} onValueChange={setBlockFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Block" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blocks</SelectItem>
                  {blocks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                <p className="text-muted-foreground">Failed to load occupancy data.</p>
              </div>
            )}
            {!isLoading && !isError && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Block</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Total Rooms</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Occupied</TableHead>
                    <TableHead>Vacant</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBlocks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No blocks found.
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredBlocks.map((block) => (
                    <TableRow key={block.id}>
                      <TableCell className="font-medium">{block.name}</TableCell>
                      <TableCell className="capitalize">{block.hostel_type?.replace('_', ' ') ?? '—'}</TableCell>
                      <TableCell>{block.total_rooms}</TableCell>
                      <TableCell>{block.total_capacity}</TableCell>
                      <TableCell>{block.current_occupancy}</TableCell>
                      <TableCell>
                        {(block.total_capacity - block.current_occupancy) > 0 ? (
                          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                            {block.total_capacity - block.current_occupancy}
                          </Badge>
                        ) : '0'}
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          block.occupancy_percentage >= 95
                            ? 'bg-green-100 text-green-800 hover:bg-green-100'
                            : block.occupancy_percentage >= 70
                              ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
                              : 'bg-red-100 text-red-800 hover:bg-red-100'
                        }>
                          {block.occupancy_percentage}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={block.status === 'active' ? 'default' : 'secondary'}>
                          {block.status}
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
