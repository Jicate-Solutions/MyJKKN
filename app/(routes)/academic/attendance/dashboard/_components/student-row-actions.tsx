'use client';

import { Row } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { 
  MoreHorizontal, 
  Eye, 
  FileText, 
  Mail, 
  UserCircle,
  Calendar,
  TrendingUp
} from 'lucide-react';
import { StudentAttendanceData } from './student-columns';
import { useRouter } from 'next/navigation';

interface StudentRowActionsProps {
  row: Row<StudentAttendanceData>;
}

export function StudentRowActions({ row }: StudentRowActionsProps) {
  const router = useRouter();
  const student = row.original;

  const handleViewDetails = () => {
    console.log('View details for student:', student.student_id);
  };

  const handleViewAttendanceHistory = () => {
    console.log('View attendance history for student:', student.student_id);
  };

  const handleGenerateReport = () => {
    console.log('Generate report for student:', student.student_id);
  };

  const handleSendNotification = () => {
    console.log('Send notification for student:', student.student_id);
  };

  const handleViewProfile = () => {
    console.log('View profile for student:', student.student_id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          className='h-8 w-8 p-0'
          aria-label='Open menu'
        >
          <span className='sr-only'>Open menu</span>
          <MoreHorizontal className='h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-[180px]'>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleViewDetails}>
          <Eye className='mr-2 h-4 w-4' />
          View Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleViewProfile}>
          <UserCircle className='mr-2 h-4 w-4' />
          View Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleViewAttendanceHistory}>
          <Calendar className='mr-2 h-4 w-4' />
          Attendance History
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleGenerateReport}>
          <FileText className='mr-2 h-4 w-4' />
          Generate Report
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSendNotification}>
          <Mail className='mr-2 h-4 w-4' />
          Send Notification
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}