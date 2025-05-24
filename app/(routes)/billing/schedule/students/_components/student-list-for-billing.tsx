'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Eye,
  FileText,
  Phone,
  Mail,
  Building,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import type { StudentForBilling } from '@/types/billing-schedule';

interface StudentListForBillingProps {
  students: StudentForBilling[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function StudentListForBilling({
  students,
  metadata,
  onPageChange,
  onRefresh
}: StudentListForBillingProps) {
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);

  const handleSelectStudent = (studentId: string, checked: boolean) => {
    if (checked) {
      setSelectedStudents((prev) => [...prev, studentId]);
    } else {
      setSelectedStudents((prev) => prev.filter((id) => id !== studentId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStudents(students.map((student) => student.id));
    } else {
      setSelectedStudents([]);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getOutstandingBadge = (amount: number) => {
    if (amount === 0) {
      return (
        <Badge variant='outline' className='text-green-600 border-green-600'>
          No Dues
        </Badge>
      );
    } else if (amount > 0 && amount <= 10000) {
      return (
        <Badge variant='outline' className='text-yellow-600 border-yellow-600'>
          Low
        </Badge>
      );
    } else if (amount > 10000 && amount <= 50000) {
      return (
        <Badge variant='outline' className='text-orange-600 border-orange-600'>
          Medium
        </Badge>
      );
    } else {
      return (
        <Badge variant='outline' className='text-red-600 border-red-600'>
          High
        </Badge>
      );
    }
  };

  if (students.length === 0) {
    return (
      <div className='text-center py-12'>
        <Users className='mx-auto h-12 w-12 text-muted-foreground' />
        <h3 className='mt-4 text-lg font-semibold'>No students found</h3>
        <p className='mt-2 text-muted-foreground'>
          Try adjusting your search criteria or filters to find students.
        </p>
        <Button variant='outline' onClick={onRefresh} className='mt-4'>
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Bulk Actions */}
      {selectedStudents.length > 0 && (
        <div className='flex items-center gap-2 p-3 bg-muted/50 rounded-md'>
          <span className='text-sm font-medium'>
            {selectedStudents.length} student
            {selectedStudents.length > 1 ? 's' : ''} selected
          </span>
          <Button size='sm' variant='outline'>
            Bulk Create Bills
          </Button>
          <Button size='sm' variant='outline'>
            Export Selected
          </Button>
        </div>
      )}

      {/* Table */}
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-12'>
                <Checkbox
                  checked={selectedStudents.length === students.length}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Roll Number</TableHead>
              <TableHead>Student Name</TableHead>
              <TableHead>Father Name</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Degree</TableHead>
              <TableHead>Current Semester</TableHead>
              <TableHead className='text-right'>Outstanding Amount</TableHead>
              <TableHead className='text-center'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student) => (
              <TableRow key={student.id} className='hover:bg-muted/50'>
                <TableCell>
                  <Checkbox
                    checked={selectedStudents.includes(student.id)}
                    onCheckedChange={(checked) =>
                      handleSelectStudent(student.id, checked as boolean)
                    }
                  />
                </TableCell>
                <TableCell className='font-medium'>
                  {student.roll_number || 'N/A'}
                </TableCell>
                <TableCell>
                  <div className='space-y-1'>
                    <div className='font-medium'>{student.student_name}</div>
                    <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className='flex items-center gap-1'>
                              <Phone className='h-3 w-3' />
                              {student.student_mobile}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Mobile: {student.student_mobile}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className='flex items-center gap-1'>
                              <Mail className='h-3 w-3' />
                              {student.student_email?.substring(0, 15)}...
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Email: {student.student_email}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{student.father_name}</TableCell>
                <TableCell>
                  <div className='flex items-center gap-1'>
                    <Building className='h-3 w-3 text-muted-foreground' />
                    <span className='text-sm'>
                      {student.institution?.name || 'N/A'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {student.department?.department_name || 'N/A'}
                </TableCell>
                <TableCell>
                  <div className='flex items-center gap-1'>
                    <GraduationCap className='h-3 w-3 text-muted-foreground' />
                    <span className='text-sm'>
                      {student.program?.program_name || 'N/A'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {student.semester?.semester_name || 'N/A'}
                </TableCell>
                <TableCell className='text-right'>
                  <div className='space-y-1'>
                    <div className='font-medium'>
                      {formatCurrency(student.outstanding_amount)}
                    </div>
                    <div>{getOutstandingBadge(student.outstanding_amount)}</div>
                  </div>
                </TableCell>
                <TableCell className='text-center'>
                  <div className='flex items-center justify-center gap-1'>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant='ghost' size='sm' asChild>
                            <Link
                              href={`/billing/schedule/students/${student.id}`}
                            >
                              <Eye className='h-4 w-4' />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>View Bill Details</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant='ghost' size='sm' asChild>
                            <Link
                              href={`/billing/schedule/new?student_id=${student.id}`}
                            >
                              <FileText className='h-4 w-4' />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Create Bill</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className='flex items-center justify-between'>
        <div className='text-sm text-muted-foreground'>
          Showing {(metadata.page - 1) * metadata.limit + 1} to{' '}
          {Math.min(metadata.page * metadata.limit, metadata.total)} of{' '}
          {metadata.total} students
        </div>
        <div className='flex items-center space-x-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onPageChange(1)}
            disabled={metadata.page === 1}
          >
            <ChevronsLeft className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onPageChange(metadata.page - 1)}
            disabled={metadata.page === 1}
          >
            <ChevronLeft className='h-4 w-4' />
          </Button>
          <div className='flex items-center gap-1'>
            <span className='text-sm'>Page</span>
            <span className='text-sm font-medium'>{metadata.page}</span>
            <span className='text-sm'>of</span>
            <span className='text-sm font-medium'>{metadata.totalPages}</span>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onPageChange(metadata.page + 1)}
            disabled={metadata.page === metadata.totalPages}
          >
            <ChevronRight className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onPageChange(metadata.totalPages)}
            disabled={metadata.page === metadata.totalPages}
          >
            <ChevronsRight className='h-4 w-4' />
          </Button>
        </div>
      </div>
    </div>
  );
}
