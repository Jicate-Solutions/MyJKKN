/**
 * Export Actions Component
 * Created: 2025-12-29
 * Description: Buttons for exporting attendance data to PDF and Excel
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileDown, FileText, Sheet, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ExportActionsProps {
  learnerId: string;
  semesterId: string;
}

export function ExportActions({ learnerId, semesterId }: ExportActionsProps) {
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const { toast } = useToast();

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const response = await fetch('/api/learners/attendance/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learnerId, semesterId })
      });

      if (!response.ok) {
        throw new Error('Failed to export PDF');
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-report-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Export Successful',
        description: 'Attendance report downloaded as PDF',
      });
    } catch (error) {
      console.error('[learners/attendance] PDF export failed:', error);
      toast({
        title: 'Export Failed',
        description: 'Failed to generate PDF report. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const response = await fetch('/api/learners/attendance/export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learnerId, semesterId })
      });

      if (!response.ok) {
        throw new Error('Failed to export Excel');
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Export Successful',
        description: 'Attendance report downloaded as Excel',
      });
    } catch (error) {
      console.error('[learners/attendance] Excel export failed:', error);
      toast({
        title: 'Export Failed',
        description: 'Failed to generate Excel report. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileDown className="h-5 w-5" />
          Export Attendance
        </CardTitle>
        <CardDescription>
          Download your attendance records in PDF or Excel format
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          <Button
            onClick={handleExportPdf}
            disabled={exportingPdf}
            variant="outline"
            className="flex items-center gap-2"
          >
            {exportingPdf ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating PDF...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Export as PDF
              </>
            )}
          </Button>

          <Button
            onClick={handleExportExcel}
            disabled={exportingExcel}
            variant="outline"
            className="flex items-center gap-2"
          >
            {exportingExcel ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating Excel...
              </>
            ) : (
              <>
                <Sheet className="h-4 w-4" />
                Export as Excel
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
