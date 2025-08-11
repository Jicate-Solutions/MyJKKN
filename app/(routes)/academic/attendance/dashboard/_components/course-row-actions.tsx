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
  Users,
  Calendar,
  BarChart,
  BookOpen
} from 'lucide-react';
import { CourseAttendanceData } from './course-columns';
import { useRouter } from 'next/navigation';

interface CourseRowActionsProps {
  row: Row<CourseAttendanceData>;
}

export function CourseRowActions({ row }: CourseRowActionsProps) {
  const router = useRouter();
  const course = row.original;

  const handleViewDetails = () => {
    console.log('View details for course:', course.course_id);
  };

  const handleViewSchedule = () => {
    console.log('View schedule for course:', course.course_id);
  };

  const handleViewStudents = () => {
    console.log('View students for course:', course.course_id);
  };

  const handleGenerateReport = () => {
    console.log('Generate report for course:', course.course_id);
  };

  const handleViewStatistics = () => {
    console.log('View statistics for course:', course.course_id);
  };

  const handleViewCurriculum = () => {
    console.log('View curriculum for course:', course.course_id);
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
        <DropdownMenuItem onClick={handleViewCurriculum}>
          <BookOpen className='mr-2 h-4 w-4' />
          View Curriculum
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleViewSchedule}>
          <Calendar className='mr-2 h-4 w-4' />
          View Schedule
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleViewStudents}>
          <Users className='mr-2 h-4 w-4' />
          View Students
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleViewStatistics}>
          <BarChart className='mr-2 h-4 w-4' />
          View Statistics
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleGenerateReport}>
          <FileText className='mr-2 h-4 w-4' />
          Generate Report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}