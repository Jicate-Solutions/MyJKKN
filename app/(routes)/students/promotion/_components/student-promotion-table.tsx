'use client';

import React from 'react';
import Link from 'next/link';
import { EyeIcon, FileEdit, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Student } from '@/types/student';
import { Badge } from '@/components/ui/badge';

interface StudentPromotionTableProps {
  students: Student[];
  isLoading: boolean;
}

export default function StudentPromotionTable({
  students,
  isLoading
}: StudentPromotionTableProps) {
  if (isLoading) {
    return (
      <div className='py-8 text-center'>
        <div className='flex justify-center'>
          <div className='animate-spin h-6 w-6 border-b-2 border-primary rounded-full'></div>
        </div>
        <p className='mt-2 text-sm text-muted-foreground'>
          Loading students...
        </p>
      </div>
    );
  }

  if (!students || students.length === 0) {
    return (
      <div className='py-16 text-center'>
        <p className='text-muted-foreground'>
          No incomplete student profiles found.
        </p>
      </div>
    );
  }

  return (
    <div className='overflow-auto'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='w-[100px]'>ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Mobile</TableHead>
            <TableHead>Program</TableHead>
            <TableHead>Missing Info</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className='text-right'>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student) => {
            // Calculate what information is missing
            const missingFields = [];
            if (!student.roll_number) missingFields.push('Roll Number');
            if (!student.college_email) missingFields.push('College Email');
            if (!student.student_photo_url) missingFields.push('Photo');

            return (
              <TableRow key={student.id}>
                <TableCell className='font-medium'>
                  {student.admission_id || 'N/A'}
                </TableCell>
                <TableCell>{student.student_name}</TableCell>
                <TableCell>{student.student_mobile}</TableCell>
                <TableCell>
                  {student.program?.program_name || 'Not assigned'}
                </TableCell>
                <TableCell>
                  <div className='flex flex-wrap gap-1'>
                    {missingFields.map((field) => (
                      <Badge
                        key={field}
                        variant='outline'
                        className='bg-red-50'
                      >
                        {field}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      student.status === 'active' ? 'default' : 'secondary'
                    }
                  >
                    {student.status.charAt(0).toUpperCase() +
                      student.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell className='text-right'>
                  <div className='flex justify-end gap-2'>
                    <Button size='icon' variant='ghost' asChild>
                      <Link href={`/students/${student.id}`}>
                        <EyeIcon className='h-4 w-4' />
                        <span className='sr-only'>View student</span>
                      </Link>
                    </Button>
                    <Button size='icon' variant='ghost' asChild>
                      <Link
                        href={`/students/${student.id}/edit?returnTo=/students/promotion`}
                      >
                        <FileEdit className='h-4 w-4' />
                        <span className='sr-only'>Edit student</span>
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
