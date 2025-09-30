// app/(routes)/resource-management/analytics/_components/export-options.tsx
'use client';

import { useState } from 'react';
import { Download, FileText, Table, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';

interface ExportOptionsProps {
  dateRange?: {
    from: Date;
    to: Date;
  };
}

export function ExportOptions({ dateRange }: ExportOptionsProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const exportToCSV = async () => {
    setIsExporting(true);
    try {
      // Simulate export delay
      await new Promise((resolve) => setTimeout(resolve, 1500));

      toast({
        title: 'Export Successful',
        description: 'Analytics data exported to CSV',
        action: <CheckCircle2 className='h-5 w-5 text-green-600' />
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Failed to export data. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      // Simulate export delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      toast({
        title: 'Export Successful',
        description: 'Analytics report exported to PDF',
        action: <CheckCircle2 className='h-5 w-5 text-green-600' />
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Failed to export report. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const printReport = () => {
    window.print();
    toast({
      title: 'Print Dialog Opened',
      description: 'Select your printer to print the report'
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' disabled={isExporting}>
          {isExporting ? (
            <>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              Exporting...
            </>
          ) : (
            <>
              <Download className='mr-2 h-4 w-4' />
              Export
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-56'>
        <DropdownMenuLabel>Export Options</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={exportToCSV} disabled={isExporting}>
          <Table className='mr-2 h-4 w-4' />
          <span>Export to CSV</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToPDF} disabled={isExporting}>
          <FileText className='mr-2 h-4 w-4' />
          <span>Export to PDF</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={printReport}>
          <Download className='mr-2 h-4 w-4' />
          <span>Print Report</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
