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
import { Shield, Search, Download, Send, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useState } from 'react';

export default function AntiRaggingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const students = [
    { id: '1', name: 'Arun Kumar', roll: 'CS2024001', year: '2nd Year', block: 'Block A', affidavit: 'submitted', parent_affidavit: 'submitted', submitted_date: '2025-07-15' },
    { id: '2', name: 'Priya Sharma', roll: 'EC2024015', year: '2nd Year', block: 'Block B', affidavit: 'submitted', parent_affidavit: 'submitted', submitted_date: '2025-07-18' },
    { id: '3', name: 'Rahul Patel', roll: 'ME2024003', year: '2nd Year', block: 'Block A', affidavit: 'submitted', parent_affidavit: 'pending', submitted_date: '2025-07-20' },
    { id: '4', name: 'Sneha Reddy', roll: 'CS2025001', year: '1st Year', block: 'Block C', affidavit: 'pending', parent_affidavit: 'pending', submitted_date: null },
    { id: '5', name: 'Vikram Singh', roll: 'EE2025010', year: '1st Year', block: 'Block A', affidavit: 'submitted', parent_affidavit: 'pending', submitted_date: '2025-08-01' },
  ];

  const filteredStudents = students.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.roll.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'submitted' && s.affidavit === 'submitted' && s.parent_affidavit === 'submitted') ||
      (statusFilter === 'partial' && (s.affidavit === 'submitted' || s.parent_affidavit === 'submitted') && !(s.affidavit === 'submitted' && s.parent_affidavit === 'submitted')) ||
      (statusFilter === 'pending' && s.affidavit === 'pending' && s.parent_affidavit === 'pending');
    return matchesSearch && matchesStatus;
  });

  const totalStudents = students.length;
  const fullySubmitted = students.filter(s => s.affidavit === 'submitted' && s.parent_affidavit === 'submitted').length;
  const partialSubmitted = students.filter(s => (s.affidavit === 'submitted') !== (s.parent_affidavit === 'submitted')).length;

  return (
    <ContentLayout title="Anti-Ragging Compliance">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Anti-Ragging Affidavit Tracker</h1>
            <p className="text-muted-foreground">
              Track student and parent anti-ragging affidavit submissions
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Send className="mr-2 h-4 w-4" />
              Send Reminders
            </Button>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Students</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalStudents}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Fully Submitted</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{fullySubmitted}</div>
              <p className="text-xs text-muted-foreground">{Math.round((fullySubmitted / totalStudents) * 100)}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Partial</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{partialSubmitted}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Not Submitted</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{totalStudents - fullySubmitted - partialSubmitted}</div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search students..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="submitted">Fully Submitted</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="pending">Not Submitted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Roll No.</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead>Student Affidavit</TableHead>
                  <TableHead>Parent Affidavit</TableHead>
                  <TableHead>Date Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">{student.name}</TableCell>
                    <TableCell>{student.roll}</TableCell>
                    <TableCell>{student.year}</TableCell>
                    <TableCell>{student.block}</TableCell>
                    <TableCell>
                      {student.affidavit === 'submitted' ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                          <CheckCircle2 className="mr-1 h-3 w-3" />Submitted
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                          <XCircle className="mr-1 h-3 w-3" />Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {student.parent_affidavit === 'submitted' ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                          <CheckCircle2 className="mr-1 h-3 w-3" />Submitted
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                          <XCircle className="mr-1 h-3 w-3" />Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{student.submitted_date || '-'}</TableCell>
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
