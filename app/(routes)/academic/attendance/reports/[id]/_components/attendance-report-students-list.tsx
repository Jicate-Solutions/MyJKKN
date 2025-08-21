'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Search,
  UserCheck,
  UserX,
  Filter,
  Download,
  Users,
  Mail
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AttendanceReportDetails } from '@/lib/services/academic/attendance-analytics-service';
import { toast } from 'sonner';

interface AttendanceReportStudentsListProps {
  reports: AttendanceReportDetails[];
  isLoading: boolean;
}

interface StudentAttendanceRecord {
  student_id: string;
  student_name: string;
  student_email: string;
  roll_number: string;
  status: 'Present' | 'Absent';
  marked_at: string;
  period_name: string;
  start_time: string;
  end_time: string;
}

export function AttendanceReportStudentsList({
  reports,
  isLoading
}: AttendanceReportStudentsListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name');

  // Flatten all student records from all periods
  const allStudentRecords: StudentAttendanceRecord[] = useMemo(() => {
    return reports.flatMap((report) =>
      report.students_data.map((student) => ({
        ...student,
        period_name: report.period_name,
        start_time: report.start_time,
        end_time: report.end_time
      }))
    );
  }, [reports]);

  // Get unique students and their consolidated attendance
  const consolidatedStudents = useMemo(() => {
    const studentMap = new Map<
      string,
      {
        student_id: string;
        student_name: string;
        student_email: string;
        roll_number: string;
        records: StudentAttendanceRecord[];
        totalPeriods: number;
        presentCount: number;
        absentCount: number;
        attendancePercentage: number;
      }
    >();

    allStudentRecords.forEach((record) => {
      const existing = studentMap.get(record.student_id);
      if (existing) {
        existing.records.push(record);
        existing.totalPeriods++;
        if (record.status === 'Present') {
          existing.presentCount++;
        } else {
          existing.absentCount++;
        }
      } else {
        studentMap.set(record.student_id, {
          student_id: record.student_id,
          student_name: record.student_name,
          student_email: record.student_email,
          roll_number: record.roll_number,
          records: [record],
          totalPeriods: 1,
          presentCount: record.status === 'Present' ? 1 : 0,
          absentCount: record.status === 'Absent' ? 1 : 0,
          attendancePercentage: 0
        });
      }
    });

    // Calculate attendance percentage for each student
    studentMap.forEach((student) => {
      student.attendancePercentage =
        student.totalPeriods > 0
          ? (student.presentCount / student.totalPeriods) * 100
          : 0;
    });

    return Array.from(studentMap.values());
  }, [allStudentRecords]);

  // Filter and sort students
  const filteredStudents = useMemo(() => {
    let filtered = consolidatedStudents;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (student) =>
          student.student_name
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          student.roll_number
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          student.student_email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'present') {
        filtered = filtered.filter(
          (student) => student.attendancePercentage === 100
        );
      } else if (statusFilter === 'absent') {
        filtered = filtered.filter(
          (student) => student.attendancePercentage === 0
        );
      } else if (statusFilter === 'partial') {
        filtered = filtered.filter(
          (student) =>
            student.attendancePercentage > 0 &&
            student.attendancePercentage < 100
        );
      }
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.student_name.localeCompare(b.student_name);
        case 'roll':
          return a.roll_number.localeCompare(b.roll_number);
        case 'attendance':
          return b.attendancePercentage - a.attendancePercentage;
        case 'present':
          return b.presentCount - a.presentCount;
        case 'absent':
          return b.absentCount - a.absentCount;
        default:
          return 0;
      }
    });

    return filtered;
  }, [consolidatedStudents, searchTerm, statusFilter, sortBy]);

  const handleExportCSV = () => {
    const csvData = [
      [
        'Student Name',
        'Roll Number',
        'Email',
        'Total Periods',
        'Present',
        'Absent',
        'Attendance %'
      ],
      ...filteredStudents.map((student) => [
        student.student_name,
        student.roll_number,
        student.student_email,
        student.totalPeriods,
        student.presentCount,
        student.absentCount,
        student.attendancePercentage.toFixed(1) + '%'
      ])
    ];

    const csvContent = csvData.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `attendance-students-${new Date().toISOString().split('T')[0]}.csv`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Student attendance data exported to CSV');
  };

  const getStatusBadge = (status: 'Present' | 'Absent') => {
    return status === 'Present' ? (
      <Badge className='bg-green-100 text-green-800'>
        <UserCheck className='h-3 w-3 mr-1' />
        Present
      </Badge>
    ) : (
      <Badge className='bg-red-100 text-red-800'>
        <UserX className='h-3 w-3 mr-1' />
        Absent
      </Badge>
    );
  };

  const getAttendancePercentageBadge = (percentage: number) => {
    if (percentage === 100) {
      return (
        <Badge className='bg-green-100 text-green-800 hover:text-white'>
          Perfect
        </Badge>
      );
    } else if (percentage >= 75) {
      return (
        <Badge className='bg-yellow-100 text-yellow-800 hover:text-white'>
          Good
        </Badge>
      );
    } else if (percentage >= 50) {
      return (
        <Badge className='bg-orange-100 text-orange-800 hover:text-white'>
          Average
        </Badge>
      );
    } else if (percentage > 0) {
      return (
        <Badge className='bg-red-100 text-red-800 hover:text-white'>Poor</Badge>
      );
    } else {
      return (
        <Badge className='bg-red-100 text-red-800 hover:text-white hover:bg-red-400'>
          Absent
        </Badge>
      );
    }
  };

  if (isLoading || reports.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <Skeleton className='h-6 w-32' />
            <div className='flex gap-2'>
              <Skeleton className='h-9 w-24' />
              <Skeleton className='h-9 w-20' />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className='flex items-center space-x-4 py-2'>
                <Skeleton className='h-8 w-8 rounded-full' />
                <Skeleton className='h-4 w-32' />
                <Skeleton className='h-4 w-24' />
                <Skeleton className='h-4 w-20' />
                <Skeleton className='h-6 w-16 rounded' />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div className='space-y-1'>
            <CardTitle className='text-lg font-medium flex items-center gap-2'>
              <Users className='h-5 w-5' />
              Students Attendance List
            </CardTitle>
            <p className='text-sm text-muted-foreground'>
              {filteredStudents.length} of {consolidatedStudents.length}{' '}
              students
            </p>
          </div>
          <Button variant='outline' size='sm' onClick={handleExportCSV}>
            <Download className='h-4 w-4 mr-1' />
            Export CSV
          </Button>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* Filters */}
        <div className='flex flex-col sm:flex-row gap-4'>
          <div className='relative flex-1'>
            <Search className='absolute left-3 top-3 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder='Search by name, roll number, or email...'
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className='pl-10'
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className='w-40'>
              <Filter className='h-4 w-4 mr-2' />
              <SelectValue placeholder='Filter by status' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Students</SelectItem>
              <SelectItem value='present'>Perfect Attendance</SelectItem>
              <SelectItem value='partial'>Partial Attendance</SelectItem>
              <SelectItem value='absent'>All Absent</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className='w-40'>
              <SelectValue placeholder='Sort by' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='name'>Name</SelectItem>
              <SelectItem value='roll'>Roll Number</SelectItem>
              <SelectItem value='attendance'>Attendance %</SelectItem>
              <SelectItem value='present'>Present Count</SelectItem>
              <SelectItem value='absent'>Absent Count</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Students Table */}
        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Roll Number</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Periods</TableHead>
                <TableHead>Present</TableHead>
                <TableHead>Absent</TableHead>
                <TableHead>Attendance %</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className='text-center py-8 text-muted-foreground'
                  >
                    No students found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredStudents.map((student) => (
                  <TableRow key={student.student_id}>
                    <TableCell>
                      <div className='flex items-center gap-3'>
                        <Avatar className='h-8 w-8'>
                          <AvatarImage src='' />
                          <AvatarFallback>
                            {student.student_name &&
                            student.student_name !== 'Unknown Student'
                              ? student.student_name
                                  .split(' ')
                                  .filter((n) => n)
                                  .map((n) => n[0])
                                  .join('')
                                  .toUpperCase()
                                  .slice(0, 2)
                              : 'S'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className='font-medium'>
                            {student.student_name || 'Unknown Student'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline'>{student.roll_number}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className='text-sm text-muted-foreground'>
                        {student.student_email || 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell className='text-center font-medium'>
                      {student.totalPeriods}
                    </TableCell>
                    <TableCell className='text-center'>
                      <span className='font-medium text-green-600'>
                        {student.presentCount}
                      </span>
                    </TableCell>
                    <TableCell className='text-center'>
                      <span className='font-medium text-red-600'>
                        {student.absentCount}
                      </span>
                    </TableCell>
                    <TableCell className='text-center'>
                      <span className='font-medium'>
                        {student.attendancePercentage.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      {getAttendancePercentageBadge(
                        student.attendancePercentage
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Summary Statistics */}
        {filteredStudents.length > 0 && (
          <div className='mt-4 p-4 bg-muted/30 rounded-lg'>
            <h4 className='font-medium mb-2'>Summary Statistics</h4>
            <div className='grid grid-cols-2 md:grid-cols-4 gap-4 text-sm'>
              <div>
                <span className='text-muted-foreground'>
                  Perfect Attendance:
                </span>
                <div className='font-medium'>
                  {
                    filteredStudents.filter(
                      (s) => s.attendancePercentage === 100
                    ).length
                  }{' '}
                  students
                </div>
              </div>
              <div>
                <span className='text-muted-foreground'>
                  Good Attendance (≥75%):
                </span>
                <div className='font-medium'>
                  {
                    filteredStudents.filter((s) => s.attendancePercentage >= 75)
                      .length
                  }{' '}
                  students
                </div>
              </div>
              <div>
                <span className='text-muted-foreground'>
                  Poor Attendance (≤50%):
                </span>
                <div className='font-medium'>
                  {
                    filteredStudents.filter((s) => s.attendancePercentage < 50)
                      .length
                  }{' '}
                  students
                </div>
              </div>
              <div>
                <span className='text-muted-foreground'>
                  Average Attendance:
                </span>
                <div className='font-medium'>
                  {filteredStudents.length > 0
                    ? (
                        filteredStudents.reduce(
                          (sum, s) => sum + s.attendancePercentage,
                          0
                        ) / filteredStudents.length
                      ).toFixed(1)
                    : '0'}
                  %
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
