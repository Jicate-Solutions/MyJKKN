'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'react-hot-toast';
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
import { BeatLoader } from 'react-spinners';

export default function ExportInstitutions() {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [fileFormat, setFileFormat] = useState('csv');
  const [includeAll, setIncludeAll] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);

      // Prepare query parameters
      const params = new URLSearchParams();
      params.append('format', fileFormat);
      params.append('includeAll', String(includeAll));
      params.append('includeInactive', String(includeInactive));

      // Make the request to the export endpoint
      const response = await fetch(
        `/api/organizations/institutions/export?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to export institutions');
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Create a URL for the blob
      const url = window.URL.createObjectURL(blob);

      // Create a link element and trigger the download
      const a = document.createElement('a');
      a.href = url;
      a.download = `institutions-export-${
        new Date().toISOString().split('T')[0]
      }.${fileFormat}`;
      document.body.appendChild(a);
      a.click();

      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Export completed successfully');
      setOpen(false);
    } catch (error) {
      console.error('Error exporting institutions:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to export institutions'
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
          Export
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Institutions</DialogTitle>
          <DialogDescription>
            Download institution data in your preferred format.
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
                <SelectItem value='csv'>CSV</SelectItem>
                <SelectItem value='xlsx'>Excel (XLSX)</SelectItem>
                <SelectItem value='json'>JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-4'>
            <Label>Export Options</Label>

            <div className='flex items-center space-x-2'>
              <Checkbox
                id='includeAll'
                checked={includeAll}
                onCheckedChange={(checked) => setIncludeAll(checked as boolean)}
              />
              <Label htmlFor='includeAll' className='cursor-pointer'>
                Export all records (may take longer for large datasets)
              </Label>
            </div>

            <div className='flex items-center space-x-2'>
              <Checkbox
                id='includeInactive'
                checked={includeInactive}
                onCheckedChange={(checked) =>
                  setIncludeInactive(checked as boolean)
                }
              />
              <Label htmlFor='includeInactive' className='cursor-pointer'>
                Include inactive institutions
              </Label>
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
                <BeatLoader size={8} color='#ffffff' className='mr-2' />
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
