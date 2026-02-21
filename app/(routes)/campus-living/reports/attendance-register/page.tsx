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
import { Download, Printer, Users } from 'lucide-react';
import { useState } from 'react';

export default function AttendanceRegisterPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [blockFilter, setBlockFilter] = useState('all');

  const students = [
    { name: 'Arun Kumar', roll: 'CS2024001', block: 'Block A', room: '101', morning: 'P', night: 'P', remarks: '' },
    { name: 'Priya Sharma', roll: 'EC2024015', block: 'Block B', room: '205', morning: 'P', night: 'P', remarks: '' },
    { name: 'Rahul Patel', roll: 'ME2024003', block: 'Block A', room: '103', morning: 'P', night: 'A', remarks: 'On leave' },
    { name: 'Sneha Reddy', roll: 'CS2024042', block: 'Block C', room: '312', morning: 'P', night: 'P', remarks: '' },
    { name: 'Vikram Singh', roll: 'EE2024010', block: 'Block A', room: '108', morning: 'A', night: 'A', remarks: 'Weekend leave' },
  ];

  const filteredStudents = students.filter(s => blockFilter === 'all' || s.block === blockFilter);

  return (
    <ContentLayout title="Attendance Register">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">NCPCR Daily Attendance Register</h1>
            <p className="text-muted-foreground">Daily attendance register as per National Commission for Protection of Child Rights guidelines</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline"><Printer className="mr-2 h-4 w-4" />Print</Button>
            <Button variant="outline"><Download className="mr-2 h-4 w-4" />Export</Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-[180px]" />
              <Select value={blockFilter} onValueChange={setBlockFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Block" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blocks</SelectItem>
                  <SelectItem value="Block A">Block A</SelectItem>
                  <SelectItem value="Block B">Block B</SelectItem>
                  <SelectItem value="Block C">Block C</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="outline" className="ml-auto">
                <Users className="mr-1 h-3 w-3" />
                Present: {filteredStudents.filter(s => s.morning === 'P').length} / {filteredStudents.length}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Daily Register - {selectedDate}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>S.No.</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Roll No.</TableHead>
                  <TableHead>Block / Room</TableHead>
                  <TableHead className="text-center">Morning</TableHead>
                  <TableHead className="text-center">Night</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((student, idx) => (
                  <TableRow key={student.roll}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium">{student.name}</TableCell>
                    <TableCell>{student.roll}</TableCell>
                    <TableCell>{student.block} - {student.room}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={student.morning === 'P' ? 'default' : 'destructive'}>{student.morning}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={student.night === 'P' ? 'default' : 'destructive'}>{student.night}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{student.remarks || '-'}</TableCell>
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
