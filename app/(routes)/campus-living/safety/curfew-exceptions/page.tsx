'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Clock, Search, Plus, CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';

export default function CurfewExceptionsPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const exceptions = [
    { id: '1', student: 'Arun Kumar', roll: 'CS2024001', block: 'Block A', date: '2026-02-21', from: '10:00 PM', to: '11:30 PM', reason: 'Lab work submission deadline', approved_by: 'Prof. Kumar', status: 'approved' },
    { id: '2', student: 'Priya Sharma', roll: 'EC2024015', block: 'Block B', date: '2026-02-22', from: '10:00 PM', to: '6:00 AM', reason: 'Train arrival delayed', approved_by: null, status: 'pending' },
    { id: '3', student: 'Rahul Patel', roll: 'ME2024003', block: 'Block A', date: '2026-02-20', from: '10:00 PM', to: '12:00 AM', reason: 'Cultural event participation', approved_by: 'Warden', status: 'approved' },
    { id: '4', student: 'Sneha Reddy', roll: 'CS2024042', block: 'Block C', date: '2026-02-19', from: '10:00 PM', to: '11:00 PM', reason: 'Personal emergency', approved_by: null, status: 'rejected' },
  ];

  const filteredExceptions = exceptions.filter(
    (e) => e.student.toLowerCase().includes(searchQuery.toLowerCase()) || e.roll.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="mr-1 h-3 w-3" />Approved</Badge>;
      case 'pending': return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
      case 'rejected': return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="mr-1 h-3 w-3" />Rejected</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <ContentLayout title="Curfew Exceptions">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Curfew Exceptions</h1>
            <p className="text-muted-foreground">Manage curfew exception requests (Curfew: 10:00 PM - 6:00 AM)</p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Exception
          </Button>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Pending Requests</p>
              <p className="text-2xl font-bold text-yellow-600">{exceptions.filter(e => e.status === 'pending').length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Approved This Week</p>
              <p className="text-2xl font-bold text-green-600">{exceptions.filter(e => e.status === 'approved').length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Rejected</p>
              <p className="text-2xl font-bold text-red-600">{exceptions.filter(e => e.status === 'rejected').length}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search student..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Roll No.</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Exception Time</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Approved By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExceptions.map((exc) => (
                  <TableRow key={exc.id}>
                    <TableCell className="font-medium">{exc.student}</TableCell>
                    <TableCell>{exc.roll}</TableCell>
                    <TableCell>{exc.block}</TableCell>
                    <TableCell>{exc.date}</TableCell>
                    <TableCell className="text-sm">{exc.from} - {exc.to}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{exc.reason}</TableCell>
                    <TableCell className="text-sm">{exc.approved_by || '-'}</TableCell>
                    <TableCell>{getStatusBadge(exc.status)}</TableCell>
                    <TableCell className="text-right">
                      {exc.status === 'pending' && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" className="text-green-600">Approve</Button>
                          <Button variant="ghost" size="sm" className="text-red-600">Reject</Button>
                        </div>
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
