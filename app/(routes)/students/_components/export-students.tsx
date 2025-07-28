'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react'; // Import Loader2
import type { StudentFilters } from '@/types/student'; // Import filters type if needed for options

interface ExportStudentsProps {
  currentFilters?: StudentFilters; // Optional: Pass current table filters for context
}

export function ExportStudents({ currentFilters }: ExportStudentsProps) {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [fileFormat, setFileFormat] = useState('xlsx');
  // Add more export options as needed
  const [includeInactive, setIncludeInactive] = useState(false);
  const [exportAll, setExportAll] = useState(true); // Option to export all or just current view (requires filter passing)

  const handleExport = async () => {
    try {
      setIsExporting(true);

      // Prepare query parameters for the export API
      const params = new URLSearchParams();
      params.append('format', fileFormat);
      params.append('includeInactive', String(includeInactive));

      // Pass current table filters to the export endpoint
      if (currentFilters) {
        Object.entries(currentFilters).forEach(([key, value]) => {
          if (
            value !== undefined &&
            value !== '' &&
            key !== 'page' &&
            key !== 'limit'
          ) {
            params.append(key, String(value));
          }
        });
      }

      // Make the request to the export endpoint
      const response = await fetch(
        `/api/students/export?${params.toString()}`,
        {
          method: 'GET'
          // No body needed for GET request
        }
      );

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          // Handle cases where the error response isn't JSON
          errorData = {
            message: `Export failed with status: ${response.status}`
          };
        }
        throw new Error(
          errorData.message || errorData.error || 'Failed to export students'
        );
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Determine filename from Content-Disposition header or create one
      const contentDisposition = response.headers.get('content-disposition');
      let filename = `students-export-${
        new Date().toISOString().split('T')[0]
      }.${fileFormat}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/i);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      // Create a URL for the blob
      const url = window.URL.createObjectURL(blob);

      // Create a link element and trigger the download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Export completed successfully');
      setOpen(false);
    } catch (error) {
      console.error('Error exporting students:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to export students'
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' className='w-full sm:w-auto'>
          <FileSpreadsheet className='mr-2 h-4 w-4' />
          Export Students
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Student Data</DialogTitle>
          <DialogDescription>
            Select the format and options for your student data export.
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-4'>
          <div className='space-y-2'>
            <Label htmlFor='fileFormat'>File Format</Label>
            <Select value={fileFormat} onValueChange={setFileFormat}>
              <SelectTrigger id='fileFormat'>
                <SelectValue placeholder='Select format' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='xlsx'>Excel (XLSX)</SelectItem>
                <SelectItem value='csv'>CSV</SelectItem>
                {/* Add other formats like JSON if needed */}
                <SelectItem value='json'>JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-4'>
            <Label>Export Options</Label>
            {/* Option to export all vs filtered - keep simple for now 
            <div className='flex items-center space-x-2'>
              <Checkbox
                id='exportAll'
                checked={exportAll}
                onCheckedChange={(checked) => setExportAll(checked as boolean)}
              />
              <Label htmlFor='exportAll' className='cursor-pointer'>
                Export all records (ignoring current filters)
              </Label>
            </div>
            */}
            <div className='flex items-center space-x-2'>
              <Checkbox
                id='includeInactive'
                checked={includeInactive}
                onCheckedChange={(checked) =>
                  setIncludeInactive(checked as boolean)
                }
              />
              <Label htmlFor='includeInactive' className='cursor-pointer'>
                Include inactive/exited/graduated students
              </Label>
            </div>
            {/* Add more specific filters if needed, e.g., by program, date range */}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => setOpen(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 size={16} className='mr-2 animate-spin' />
                Exporting...
              </>
            ) : (
              <>
                <Download className='mr-2 h-4 w-4' />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
