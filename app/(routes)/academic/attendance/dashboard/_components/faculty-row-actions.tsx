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
  BarChart
} from 'lucide-react';
import { FacultyAttendanceData } from './faculty-columns';
import { useRouter } from 'next/navigation';

interface FacultyRowActionsProps {
  row: Row<FacultyAttendanceData>;
}

export function FacultyRowActions({ row }: FacultyRowActionsProps) {
  const router = useRouter();
  const faculty = row.original;

  const handleViewDetails = () => {
    console.log('View details for faculty:', faculty.staff_id);
  };

  const handleViewSchedule = () => {
    console.log('View schedule for faculty:', faculty.staff_id);
  };

  const handleGenerateReport = () => {
    console.log('Generate report for faculty:', faculty.staff_id);
  };

  const handleSendReminder = () => {
    console.log('Send reminder to faculty:', faculty.staff_id);
  };

  const handleViewProfile = () => {
    console.log('View profile for faculty:', faculty.staff_id);
  };

  const handleViewStatistics = () => {
    console.log('View statistics for faculty:', faculty.staff_id);
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
        <DropdownMenuItem onClick={handleViewSchedule}>
          <Calendar className='mr-2 h-4 w-4' />
          View Schedule
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleViewStatistics}>
          <BarChart className='mr-2 h-4 w-4' />
          View Statistics
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleGenerateReport}>
          <FileText className='mr-2 h-4 w-4' />
          Generate Report
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSendReminder}>
          <Mail className='mr-2 h-4 w-4' />
          Send Reminder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}