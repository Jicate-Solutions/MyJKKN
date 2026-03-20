'use client';

import { Row } from '@tanstack/react-table';
import { MoreHorizontal, Eye, Download, FileText, FileSpreadsheet, FileImage } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { AttendanceReport } from '@/lib/services/academic/attendance-report-service';
import { AttendanceExportService } from '@/lib/services/academic/attendance-export-service';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row
}: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const report = row.original as AttendanceReport;

  // Validate report ID to prevent placeholder UUID errors
  const isValidId = report?.id && !report.id.includes('%%drp:id:');

  const handleViewReport = () => {
    if (!isValidId) {
      toast.error('Invalid report data. Please refresh the page.');
      return;
    }
    router.push(`/academic/attendance/reports/${report.id}`);
  };

  const handleExportExcel = async () => {
    if (!isValidId) {
      toast.error('Invalid report data. Please refresh the page.');
      return;
    }
    try {
      const result = await AttendanceExportService.exportToExcel(
        [report],
        `attendance-report-${report.attendance_date}`
      );
      if (result.success) {
        toast.success('Report exported to Excel successfully');
      } else {
        toast.error('Failed to export to Excel: ' + result.error);
      }
    } catch (error) {
      toast.error('An error occurred while exporting to Excel');
    }
  };

  const handleExportPDF = async () => {
    if (!isValidId) {
      toast.error('Invalid report data. Please refresh the page.');
      return;
    }
    try {
      const result = await AttendanceExportService.exportToPDF(
        [report],
        `attendance-report-${report.attendance_date}`
      );
      if (result.success) {
        toast.success('Report exported to PDF successfully');
      } else {
        toast.error('Failed to export to PDF: ' + result.error);
      }
    } catch (error) {
      toast.error('An error occurred while exporting to PDF');
    }
  };

  const handleExportCSV = async () => {
    if (!isValidId) {
      toast.error('Invalid report data. Please refresh the page.');
      return;
    }
    try {
      const result = await AttendanceExportService.exportToCSV(
        [report],
        `attendance-report-${report.attendance_date}`
      );
      if (result.success) {
        toast.success('Report exported to CSV successfully');
      } else {
        toast.error('Failed to export to CSV: ' + result.error);
      }
    } catch (error) {
      toast.error('An error occurred while exporting to CSV');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
        >
          <MoreHorizontal className='h-4 w-4' />
          <span className='sr-only'>Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-[160px]'>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleViewReport}>
          <Eye className='mr-2 h-4 w-4' />
          View Details
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Export</DropdownMenuLabel>
        <DropdownMenuItem onClick={handleExportExcel}>
          <FileSpreadsheet className='mr-2 h-4 w-4' />
          Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportPDF}>
          <FileText className='mr-2 h-4 w-4' />
          PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportCSV}>
          <FileImage className='mr-2 h-4 w-4' />
          CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}