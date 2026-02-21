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
import { Download, Printer, Building2 } from 'lucide-react';
import { useState } from 'react';

export default function OccupancyReportPage() {
  const [blockFilter, setBlockFilter] = useState('all');

  const occupancyData = [
    { block: 'Block A', floor: 'Ground', total_rooms: 25, occupied: 24, vacant: 1, total_beds: 50, beds_occupied: 48 },
    { block: 'Block A', floor: '1st', total_rooms: 25, occupied: 25, vacant: 0, total_beds: 50, beds_occupied: 50 },
    { block: 'Block A', floor: '2nd', total_rooms: 25, occupied: 23, vacant: 2, total_beds: 50, beds_occupied: 46 },
    { block: 'Block B', floor: 'Ground', total_rooms: 20, occupied: 19, vacant: 1, total_beds: 40, beds_occupied: 37 },
    { block: 'Block B', floor: '1st', total_rooms: 20, occupied: 20, vacant: 0, total_beds: 40, beds_occupied: 40 },
    { block: 'Block C', floor: 'Ground', total_rooms: 30, occupied: 28, vacant: 2, total_beds: 60, beds_occupied: 57 },
    { block: 'Block C', floor: '1st', total_rooms: 30, occupied: 30, vacant: 0, total_beds: 60, beds_occupied: 60 },
  ];

  const filteredData = occupancyData.filter(d => blockFilter === 'all' || d.block === blockFilter);

  return (
    <ContentLayout title="Occupancy Report">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Occupancy Report</h1>
            <p className="text-muted-foreground">Room and bed occupancy status across all blocks</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline"><Printer className="mr-2 h-4 w-4" />Print</Button>
            <Button variant="outline"><Download className="mr-2 h-4 w-4" />Export PDF</Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Occupancy Details</CardTitle>
              <Select value={blockFilter} onValueChange={setBlockFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Block" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blocks</SelectItem>
                  <SelectItem value="Block A">Block A</SelectItem>
                  <SelectItem value="Block B">Block B</SelectItem>
                  <SelectItem value="Block C">Block C</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
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
                {filteredData.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{row.block}</TableCell>
                    <TableCell>{row.floor}</TableCell>
                    <TableCell>{row.total_rooms}</TableCell>
                    <TableCell>{row.occupied}</TableCell>
                    <TableCell>{row.vacant > 0 ? <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">{row.vacant}</Badge> : '0'}</TableCell>
                    <TableCell>{row.total_beds}</TableCell>
                    <TableCell>{row.beds_occupied}</TableCell>
                    <TableCell>
                      <Badge className={Math.round((row.beds_occupied / row.total_beds) * 100) >= 95 ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'}>
                        {Math.round((row.beds_occupied / row.total_beds) * 100)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
