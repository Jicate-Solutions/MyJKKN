'use client';

import { useState } from 'react';
import { Loader2, Download } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';

type ExportFormat = 'csv' | 'xlsx' | 'json';

export function ExportSemesters() {
  const searchParams = useSearchParams();

  // State variables
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [includeAll, setIncludeAll] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  // Handle export action
  const handleExport = async () => {
    try {
      setIsExporting(true);

      // Build query parameters
      const params = new URLSearchParams();
      params.append('format', exportFormat);
      params.append('includeAll', includeAll.toString());
      params.append('includeInactive', includeInactive.toString());

      // Add any existing search parameters (e.g., filters)
      const currentSearchTerm = searchParams.get('search');
      if (currentSearchTerm) {
        params.append('search', currentSearchTerm);
      }

      // Make the API request
      const response = await fetch(
        `/api/organizations/semesters/export?${params.toString()}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Export API error:', errorData);
        throw new Error(
          `Export failed: ${errorData.error || response.statusText}`
        );
      }

      // Get the filename from the Content-Disposition header or use a default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'semesters-export';

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      } else {
        // Fallback filename with timestamp
        const dateStr = new Date().toISOString().split('T')[0];
        filename = `semesters-export-${dateStr}.${exportFormat}`;
      }

      // Handle the response based on export format
      let blob;

      switch (exportFormat) {
        case 'xlsx':
          blob = await response.blob();
          break;
        case 'csv':
          const csvText = await response.text();
          blob = new Blob([csvText], { type: 'text/csv' });
          break;
        case 'json':
          const data = await response.json();
          blob = new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json'
          });
          break;
      }

      // Create a download link and trigger the download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Close the dialog and show success message
      setOpen(false);
      toast.success('Semesters exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to export semesters'
      );
    } finally {
      setIsExporting(false);
    }
  };

  // Human-readable format labels
  const formatLabels = {
    csv: 'CSV (Comma Separated Values)',
    xlsx: 'Excel Spreadsheet (XLSX)',
    json: 'JSON (JavaScript Object Notation)'
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' size='sm' className='h-8 gap-1'>
          <Download className='h-3.5 w-3.5' />
          <span className='sr-only sm:not-sr-only sm:whitespace-nowrap'>
            Export
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-[425px]'>
        <DialogHeader>
          <DialogTitle>Export Semesters</DialogTitle>
          <DialogDescription>
            Choose your export format and options
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-4'>
          <div className='grid gap-2'>
            <Label htmlFor='export-format'>Export Format</Label>
            <Select
              value={exportFormat}
              onValueChange={(value) => setExportFormat(value as ExportFormat)}
            >
              <SelectTrigger id='export-format'>
                <SelectValue placeholder='Select format' />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(formatLabels) as ExportFormat[]).map((format) => (
                  <SelectItem key={format} value={format}>
                    {formatLabels[format]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='grid gap-2'>
            <Label>Export Options</Label>
            <div className='flex items-center space-x-2'>
              <Checkbox
                id='include-all'
                checked={includeAll}
                onCheckedChange={(checked) => setIncludeAll(checked === true)}
              />
              <label
                htmlFor='include-all'
                className='text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
              >
                Include all records (may impact performance)
              </label>
            </div>

            <div className='flex items-center space-x-2'>
              <Checkbox
                id='include-inactive'
                checked={includeInactive}
                onCheckedChange={(checked) =>
                  setIncludeInactive(checked === true)
                }
              />
              <label
                htmlFor='include-inactive'
                className='text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
              >
                Include inactive semesters
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                Exporting...
              </>
            ) : (
              'Export'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
