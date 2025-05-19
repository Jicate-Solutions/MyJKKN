'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { EyeIcon, FileEdit, Check, RefreshCw } from 'lucide-react';
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
import { usePermissions } from '@/hooks/use-permissions';
import { useQueryClient } from '@tanstack/react-query';
import { studentKeys } from '@/hooks/student/use-students';

interface StudentonboardingTableProps {
  students: Student[];
  isLoading: boolean;
  onRefresh?: () => void;
}

export default function StudentonboardingTable({
  students,
  isLoading,
  onRefresh
}: StudentonboardingTableProps) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  // Set up an interval to poll for new data
  useEffect(() => {
    // Check for student data changes every 5 seconds
    const intervalId = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      if (onRefresh) {
        onRefresh();
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [queryClient, onRefresh]);

  const handleManualRefresh = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      if (onRefresh) {
        await onRefresh();
      }
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    }
  };

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
      <div className='flex justify-end mb-2'>
        <Button
          size='sm'
          variant='outline'
          onClick={handleManualRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`}
          />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>S.No</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Mobile</TableHead>
            <TableHead>Program</TableHead>
            <TableHead>Missing Info</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className='text-right'>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student, index) => {
            // Calculate what information is missing
            const missingFields = [];
            if (!student.roll_number) missingFields.push('Roll Number');
            if (!student.college_email) missingFields.push('College Email');
            if (!student.student_photo_url) missingFields.push('Photo');
            if (!student.semester_id) missingFields.push('Semester');
            if (!student.section_id) missingFields.push('Section');

            return (
              <TableRow key={student.id}>
                <TableCell className='font-medium'>{index + 1}</TableCell>
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
                    {(isSuperAdmin || canAccess('students', 'view')) && (
                      <Button size='icon' variant='ghost' asChild>
                        <Link
                          href={`/students/${student.id}`}
                          aria-disabled={
                            !isSuperAdmin && !canAccess('students', 'view')
                          }
                          tabIndex={
                            isSuperAdmin || canAccess('students', 'view')
                              ? 0
                              : -1
                          }
                          style={{
                            opacity:
                              isSuperAdmin || canAccess('students', 'view')
                                ? 1
                                : 0.5,
                            pointerEvents:
                              isSuperAdmin || canAccess('students', 'view')
                                ? 'auto'
                                : 'none'
                          }}
                        >
                          <EyeIcon className='h-4 w-4' />
                          <span className='sr-only'>View student</span>
                        </Link>
                      </Button>
                    )}
                    {(isSuperAdmin || canAccess('students', 'edit')) && (
                      <Button size='icon' variant='ghost' asChild>
                        <Link
                          href={`/students/onboarding/edit?id=${student.id}&returnTo=/students/onboarding`}
                          aria-disabled={
                            !isSuperAdmin && !canAccess('students', 'edit')
                          }
                          tabIndex={
                            isSuperAdmin || canAccess('students', 'edit')
                              ? 0
                              : -1
                          }
                          style={{
                            opacity:
                              isSuperAdmin || canAccess('students', 'edit')
                                ? 1
                                : 0.5,
                            pointerEvents:
                              isSuperAdmin || canAccess('students', 'edit')
                                ? 'auto'
                                : 'none'
                          }}
                        >
                          <FileEdit className='h-4 w-4' />
                          <span className='sr-only'>Edit student</span>
                        </Link>
                      </Button>
                    )}
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
