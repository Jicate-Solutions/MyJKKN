'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { DoorOpen, Search, LogIn, LogOut, AlertTriangle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export default function AccessLogPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const accessRecords = [
    { id: '1', name: 'Arun Kumar', roll: 'CS2024001', type: 'entry', gate: 'Main Gate', time: '6:45 AM', flagged: false },
    { id: '2', name: 'Priya Sharma', roll: 'EC2024015', type: 'exit', gate: 'Main Gate', time: '8:30 AM', flagged: false },
    { id: '3', name: 'Unknown Person', roll: '-', type: 'entry', gate: 'Side Gate', time: '11:30 PM', flagged: true },
    { id: '4', name: 'Rahul Patel', roll: 'ME2024003', type: 'entry', gate: 'Main Gate', time: '10:45 PM', flagged: true },
    { id: '5', name: 'Sneha Reddy', roll: 'CS2024042', type: 'exit', gate: 'Main Gate', time: '3:00 PM', flagged: false },
    { id: '6', name: 'Vikram Singh', roll: 'EE2024010', type: 'entry', gate: 'Main Gate', time: '9:30 PM', flagged: false },
  ];

  const filteredRecords = accessRecords.filter((r) => {
    const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.roll.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || r.type === typeFilter || (typeFilter === 'flagged' && r.flagged);
    return matchesSearch && matchesType;
  });

  return (
    <ContentLayout title="Access Log">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Gate Access Log</h1>
            <p className="text-muted-foreground">Entry and exit records for all hostel gates</p>
          </div>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export Log
          </Button>
        </div>

        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Entries</p>
              <p className="text-2xl font-bold">{accessRecords.filter(r => r.type === 'entry').length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Exits</p>
              <p className="text-2xl font-bold">{accessRecords.filter(r => r.type === 'exit').length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Currently Outside</p>
              <p className="text-2xl font-bold text-blue-600">15</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Flagged Entries</p>
              <p className="text-2xl font-bold text-red-600">{accessRecords.filter(r => r.flagged).length}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by name or roll..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-[180px]" />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="entry">Entry Only</SelectItem>
                  <SelectItem value="exit">Exit Only</SelectItem>
                  <SelectItem value="flagged">Flagged</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Roll No.</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Gate</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Flag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record) => (
                  <TableRow key={record.id} className={record.flagged ? 'bg-red-50' : ''}>
                    <TableCell className="font-medium">{record.name}</TableCell>
                    <TableCell>{record.roll}</TableCell>
                    <TableCell>
                      <Badge variant={record.type === 'entry' ? 'default' : 'secondary'}>
                        {record.type === 'entry' ? <LogIn className="mr-1 h-3 w-3" /> : <LogOut className="mr-1 h-3 w-3" />}
                        {record.type}
                      </Badge>
                    </TableCell>
                    <TableCell>{record.gate}</TableCell>
                    <TableCell>{record.time}</TableCell>
                    <TableCell>
                      {record.flagged && (
                        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                          <AlertTriangle className="mr-1 h-3 w-3" />Flagged
                        </Badge>
                      )}
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
