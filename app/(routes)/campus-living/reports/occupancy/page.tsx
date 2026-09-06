'use client';

import { useState, useMemo } from 'react';
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
import { Download, Printer, Building2, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useExportReport,
  useOccupancyReport,
} from '@/hooks/campus-living/use-campus-living-reports';
import { PreviewBanner } from '../../_components/preview-banner';

// Row shape derived from generateOccupancyReport — kept local
// to avoid leaking report-shape types out of /reports scope.
type RoomRow = {
  id: string;
  block_id: string;
  room_number: string;
  floor: number | string | null;
  room_type: string;
  capacity: number;
  current_occupancy: number;
  status: string;
};

type FloorRollup = {
  block: string;
  blockId: string;
  floor: string;
  total_rooms: number;
  occupied: number;
  vacant: number;
  total_beds: number;
  beds_occupied: number;
};

export default function OccupancyReportPage() {
  const [blockFilter, setBlockFilter] = useState('all');
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';
  const exportReport = useExportReport();
  const { data: report, isLoading, error } = useOccupancyReport(institutionId);

  // Block list for filter dropdown
  const blocks = report?.blocks ?? [];

  // Roll up rooms to block × floor for the on-screen table.
  // generateOccupancyReport returns per-block + per-room data; we group by floor here.
  const floorData = useMemo<FloorRollup[]>(() => {
    if (!report?.blocks) return [];
    const out: FloorRollup[] = [];
    for (const block of report.blocks) {
      const rooms = (block.rooms ?? []) as RoomRow[];
      const byFloor: Record<string, FloorRollup> = {};
      for (const room of rooms) {
        const floorKey = room.floor === null || room.floor === undefined ? '—' : String(room.floor);
        if (!byFloor[floorKey]) {
          byFloor[floorKey] = {
            block: block.name,
            blockId: block.id,
            floor: floorKey,
            total_rooms: 0,
            occupied: 0,
            vacant: 0,
            total_beds: 0,
            beds_occupied: 0,
          };
        }
        const f = byFloor[floorKey];
        f.total_rooms += 1;
        if (room.status === 'full') f.occupied += 1;
        else if (room.status === 'available') f.vacant += 1;
        // 'partial', 'maintenance', etc. count as neither occupied-full nor fully-vacant
        f.total_beds += room.capacity ?? 0;
        f.beds_occupied += room.current_occupancy ?? 0;
      }
      // Sort floor keys naturally (Ground first if present)
      const sortedFloors = Object.values(byFloor).sort((a, b) => {
        if (a.floor === '—') return 1;
        if (b.floor === '—') return -1;
        const an = Number(a.floor);
        const bn = Number(b.floor);
        if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
        return a.floor.localeCompare(b.floor);
      });
      out.push(...sortedFloors);
    }
    return out;
  }, [report]);

  const filteredData = floorData.filter(
    (d) => blockFilter === 'all' || d.blockId === blockFilter,
  );

  if (isLoading) {
    return (
      <ContentLayout title="Occupancy Report">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Occupancy Report">
      <div className="space-y-6">
        <PreviewBanner
          feature="occupancy report"
          note="The on-screen table now shows live block/room data. Print button remains a placeholder and will be wired in a future PR."
        />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Occupancy Report</h1>
            <p className="text-muted-foreground">Room and bed occupancy status across all blocks</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => window.print()}
            >
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

        {error ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive">
              Failed to load occupancy data:{' '}
              {error instanceof Error ? error.message : 'unknown error'}
            </CardContent>
          </Card>
        ) : null}

        {/* Summary cards from live report */}
        {report?.summary ? (
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
                <p className="text-sm text-muted-foreground">Overall Occupancy</p>
                <p className={`text-3xl font-bold ${report.summary.overall_percentage >= 90 ? 'text-green-600' : 'text-yellow-600'}`}>
                  {report.summary.overall_percentage}%
                </p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Occupancy Details</CardTitle>
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
            {filteredData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Building2 className="h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 font-medium">No occupancy data found</p>
                <p className="mt-1 text-sm text-muted-foreground max-w-md">
                  No hostel blocks or rooms have been configured for this institution yet.
                  Once blocks and rooms are added, occupancy figures will appear here.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Block</TableHead>
                    <TableHead>Floor</TableHead>
                    <TableHead>Total Rooms</TableHead>
                    <TableHead>Occupied</TableHead>
                    <TableHead>Vacant</TableHead>
                    <TableHead>Total Beds</TableHead>
                    <TableHead>Beds Occupied</TableHead>
                    <TableHead>Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((row, idx) => {
                    const rate = row.total_beds > 0 ? Math.round((row.beds_occupied / row.total_beds) * 100) : 0;
                    return (
                      <TableRow key={`${row.blockId}-${row.floor}-${idx}`}>
                        <TableCell className="font-medium">{row.block}</TableCell>
                        <TableCell>{row.floor}</TableCell>
                        <TableCell>{row.total_rooms}</TableCell>
                        <TableCell>{row.occupied}</TableCell>
                        <TableCell>{row.vacant > 0 ? <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">{row.vacant}</Badge> : '0'}</TableCell>
                        <TableCell>{row.total_beds}</TableCell>
                        <TableCell>{row.beds_occupied}</TableCell>
                        <TableCell>
                          <Badge className={rate >= 95 ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'}>
                            {rate}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
