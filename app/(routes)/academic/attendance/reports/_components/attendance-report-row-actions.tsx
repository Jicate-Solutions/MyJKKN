'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import {
  Eye,
  Download,
  Share2,
  Copy,
  ExternalLink,
  FileText,
  Calendar,
  Users,
  BookOpen
} from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { AttendanceReportRecord } from '@/lib/services/academic/attendance-analytics-service';

interface AttendanceReportRowActionsProps {
  report: AttendanceReportRecord;
}

export function AttendanceReportRowActions({
  report
}: AttendanceReportRowActionsProps) {
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);

  const handleCopyReportId = () => {
    navigator.clipboard.writeText(report.id);
    toast.success('Report ID copied to clipboard');
  };

  const handleCopyReportLink = () => {
    const url = `${window.location.origin}/academic/attendance/reports/${report.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Report link copied to clipboard');
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Attendance Report - ${report.course_name}`,
          text: `Attendance report for ${report.course_name} on ${format(
            new Date(report.attendance_date),
            'dd MMM yyyy'
          )}`,
          url: `/academic/attendance/reports/${report.id}`
        });
      } catch (error) {
        // User cancelled or error occurred
      }
    } else {
      handleCopyReportLink();
    }
  };

  const handleDownloadPDF = () => {
    // This would typically trigger a PDF generation API call
    toast.info('PDF download will be available soon');
  };

  const getAttendanceStatusColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 75) return 'text-yellow-600';
    if (percentage >= 50) return 'text-orange-600';
    return 'text-red-600';
  };

  const getAttendanceStatusText = (percentage: number) => {
    if (percentage >= 90) return 'Excellent';
    if (percentage >= 75) return 'Good';
    if (percentage >= 50) return 'Average';
    return 'Poor';
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          >
            <DotsHorizontalIcon className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-[200px]'>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>

          <DropdownMenuItem onClick={() => setIsQuickViewOpen(true)}>
            <Eye className='mr-2 h-4 w-4' />
            Quick View
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href={`/academic/attendance/reports/${report.id}`}>
              <ExternalLink className='mr-2 h-4 w-4' />
              View Details
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleDownloadPDF}>
            <Download className='mr-2 h-4 w-4' />
            Download PDF
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleShare}>
            <Share2 className='mr-2 h-4 w-4' />
            Share Report
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleCopyReportId}>
            <Copy className='mr-2 h-4 w-4' />
            Copy Report ID
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleCopyReportLink}>
            <Copy className='mr-2 h-4 w-4' />
            Copy Link
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Quick View Dialog */}
      <Dialog open={isQuickViewOpen} onOpenChange={setIsQuickViewOpen}>
        <DialogContent className='max-w-2xl max-h-[90vh] overflow-hidden flex flex-col'>
          <DialogHeader className='flex-shrink-0'>
            <DialogTitle className='flex items-center gap-2'>
              <FileText className='h-5 w-5' />
              Attendance Report Quick View
            </DialogTitle>
            <DialogDescription>
              {format(new Date(report.attendance_date), 'EEEE, dd MMMM yyyy')}
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-6 overflow-y-auto flex-1 pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 dark:scrollbar-thumb-gray-700 dark:scrollbar-track-gray-800'>
            {/* Course Information */}
            <div className='space-y-3'>
              <h4 className='font-medium flex items-center gap-2'>
                <BookOpen className='h-4 w-4' />
                Course Information
              </h4>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                <div>
                  <span className='text-sm text-muted-foreground'>
                    Course Name:
                  </span>
                  <div className='font-medium'>{report.course_name}</div>
                </div>
                <div>
                  <span className='text-sm text-muted-foreground'>
                    Course Code:
                  </span>
                  <div>
                    <Badge variant='outline'>{report.course_code}</Badge>
                  </div>
                </div>
                <div>
                  <span className='text-sm text-muted-foreground'>Period:</span>
                  <div className='font-medium'>{report.period_name}</div>
                </div>
                <div>
                  <span className='text-sm text-muted-foreground'>Timing:</span>
                  <div className='font-medium'>
                    {report.start_time} - {report.end_time}
                  </div>
                </div>
              </div>
            </div>

            {/* Section Information */}
            <div className='space-y-3'>
              <h4 className='font-medium flex items-center gap-2'>
                <Users className='h-4 w-4' />
                Section Information
              </h4>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                <div>
                  <span className='text-sm text-muted-foreground'>
                    Section:
                  </span>
                  <div className='font-medium'>{report.section_name}</div>
                </div>
                <div>
                  <span className='text-sm text-muted-foreground'>
                    Semester:
                  </span>
                  <div className='font-medium'>{report.semester_name}</div>
                </div>
                <div>
                  <span className='text-sm text-muted-foreground'>
                    Department:
                  </span>
                  <div className='font-medium'>{report.department_name}</div>
                </div>
                <div>
                  <span className='text-sm text-muted-foreground'>
                    Program:
                  </span>
                  <div className='font-medium'>{report.program_name}</div>
                </div>
              </div>
            </div>

            {/* Attendance Statistics */}
            <div className='space-y-3'>
              <h4 className='font-medium flex items-center gap-2'>
                <Calendar className='h-4 w-4' />
                Attendance Statistics
              </h4>
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <div className='space-y-1'>
                    <div className='flex items-center gap-2'>
                      <span className='font-medium'>
                        {report.present_count} / {report.total_students}{' '}
                        students present
                      </span>
                      <Badge
                        variant='secondary'
                        className={getAttendanceStatusColor(
                          report.attendance_percentage
                        )}
                      >
                        {getAttendanceStatusText(report.attendance_percentage)}
                      </Badge>
                    </div>
                    <div className='text-sm text-muted-foreground'>
                      {report.absent_count} students absent
                    </div>
                  </div>
                  <div className='text-right'>
                    <div className='text-2xl font-bold'>
                      {report.attendance_percentage}%
                    </div>
                    <div className='text-sm text-muted-foreground'>
                      Attendance
                    </div>
                  </div>
                </div>

                <Progress
                  value={report.attendance_percentage}
                  className='h-3'
                />
              </div>
            </div>

            {/* Faculty and Marking Information */}
            <div className='space-y-3'>
              <h4 className='font-medium'>Faculty & Marking Details</h4>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                <div>
                  <span className='text-sm text-muted-foreground'>
                    Faculty:
                  </span>
                  <div className='font-medium'>{report.faculty_name}</div>
                </div>
                <div>
                  <span className='text-sm text-muted-foreground'>
                    Institution:
                  </span>
                  <div className='font-medium'>{report.institution_name}</div>
                </div>
                <div>
                  <span className='text-sm text-muted-foreground'>
                    Marked By:
                  </span>
                  <div className='font-medium'>{report.marked_by}</div>
                </div>
                <div>
                  <span className='text-sm text-muted-foreground'>
                    Marked At:
                  </span>
                  <div className='font-medium'>
                    {format(new Date(report.marked_at), 'dd MMM yyyy, HH:mm')}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-4 border-t'>
              <Button asChild className='w-full sm:w-auto'>
                <Link href={`/academic/attendance/reports/${report.id}`}>
                  <ExternalLink className='h-4 w-4 mr-2' />
                  View Full Details
                </Link>
              </Button>
              <Button variant='outline' onClick={handleDownloadPDF} className='w-full sm:w-auto'>
                <Download className='h-4 w-4 mr-2' />
                Download PDF
              </Button>
              <Button variant='outline' onClick={handleShare} className='w-full sm:w-auto'>
                <Share2 className='h-4 w-4 mr-2' />
                Share
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
