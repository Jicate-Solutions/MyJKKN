'use client';

import { useState } from 'react';
import {
  Download,
  FileText,
  FileSpreadsheet,
  Loader2,
  File
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ExportService } from '@/lib/services/export-service';
import { UsageReport } from '@/types/resources';

interface ExportDropdownProps {
  reports: UsageReport[];
  singleReport?: UsageReport;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function ExportDropdown({
  reports,
  singleReport,
  variant = 'outline',
  size = 'sm'
}: ExportDropdownProps) {
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<
    'csv' | 'excel' | 'pdf' | null
  >(null);

  const handleExport = async (exportType: 'csv' | 'excel' | 'pdf') => {
    try {
      setExporting(true);
      setExportFormat(exportType);

      // If we have a single report, export just that one
      if (singleReport) {
        ExportService.exportUsageReport(singleReport, exportType);
        toast.success(`Report exported as ${exportType.toUpperCase()}`);
      }
      // Otherwise export all reports
      else if (reports.length > 0) {
        ExportService.exportMultipleUsageReports(reports, exportType);
        toast.success(`Reports exported as ${exportType.toUpperCase()}`);
      } else {
        toast.error('No reports to export');
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export report');
    } finally {
      setExporting(false);
      setExportFormat(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          disabled={exporting}
          className={size === 'icon' ? 'w-full justify-start px-2' : ''}
        >
          {exporting ? (
            <>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              {exportFormat &&
                size !== 'icon' &&
                `Exporting ${exportFormat.toUpperCase()}...`}
            </>
          ) : (
            <>
              <Download className='mr-2 h-4 w-4' />
              {size !== 'icon' ? 'Export' : <span>Export</span>}
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='min-w-[160px]'>
        <DropdownMenuLabel>Export Options</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => handleExport('csv')}
          disabled={exporting}
          className='cursor-pointer'
        >
          <FileText className='mr-2 h-4 w-4' />
          <span>Export as CSV</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport('excel')}
          disabled={exporting}
          className='cursor-pointer'
        >
          <FileSpreadsheet className='mr-2 h-4 w-4' />
          <span>Export as Excel</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport('pdf')}
          disabled={exporting}
          className='cursor-pointer'
        >
          <File className='mr-2 h-4 w-4' />
          <span>Export as PDF</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
