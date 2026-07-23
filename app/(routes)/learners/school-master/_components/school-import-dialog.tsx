'use client';

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { Download, UploadCloud, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { useBulkImportSchools } from '@/hooks/use-school-master';
import { getErrorMessage } from '@/lib/utils';
import type { SchoolMasterImportRow, SchoolMasterImportResult } from '@/types/school-master';

const TEMPLATE_HEADERS = ['District', 'School Name', 'Pincode', 'UDISE Code'];

interface SchoolImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after an import that inserted rows (DataTable refetch hook). */
  onSuccess?: () => void;
}

export function SchoolImportDialog({ open, onOpenChange, onSuccess }: SchoolImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<SchoolMasterImportRow[]>([]);
  const [result, setResult] = useState<SchoolMasterImportResult | null>(null);
  const [parsing, setParsing] = useState(false);

  const bulkImport = useBulkImportSchools();

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
    XLSX.utils.book_append_sheet(wb, ws, 'Schools');
    XLSX.writeFile(wb, 'school-master-import-template.xlsx');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        // Pick the data sheet by name — never blindly take SheetNames[0] when
        // a named sheet exists (see feedback_bulk_upload_pick_data_sheet_by_name).
        const sheetName = workbook.SheetNames.includes('Schools')
          ? 'Schools'
          : workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

        const parsed: SchoolMasterImportRow[] = jsonData
          .map((row) => ({
            district: String(row['District'] ?? '').trim(),
            school_name: String(row['School Name'] ?? '').trim(),
            pincode: String(row['Pincode'] ?? '').trim() || null,
            udise_code: String(row['UDISE Code'] ?? '').trim() || null,
          }))
          // Skip fully-empty rows
          .filter((r) => r.district || r.school_name || r.pincode || r.udise_code);

        setRows(parsed);
        if (parsed.length === 0) {
          toast.error('No rows found in the file');
        }
      } catch (error) {
        console.error('[school-import-dialog] Parse error:', error);
        toast.error('Failed to parse file');
      } finally {
        setParsing(false);
      }
    };
    reader.onerror = () => {
      setParsing(false);
      toast.error('Failed to read file');
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    try {
      const importResult = await bulkImport.mutateAsync({ rows, board: 'state_board' });
      setResult(importResult);
      if (importResult.inserted > 0) {
        toast.success(`Imported ${importResult.inserted} schools`);
        onSuccess?.();
      }
      if (importResult.errors.length > 0) {
        toast.error(`${importResult.errors.length} row(s) failed`);
      }
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setRows([]);
      setResult(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='w-[95vw] max-w-[560px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Import Schools</DialogTitle>
          <DialogDescription>
            Bulk-add schools from an Excel or CSV file (District, School Name, Pincode, UDISE Code).
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <Button variant='outline' onClick={downloadTemplate} className='w-full sm:w-auto'>
            <Download className='h-4 w-4 mr-2' />
            Download Template
          </Button>

          <input
            type='file'
            accept='.xlsx,.csv'
            onChange={handleFileSelect}
            className='hidden'
            ref={fileInputRef}
          />

          <div
            className='flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center cursor-pointer hover:bg-muted/50'
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud className='h-8 w-8 text-muted-foreground' />
            <p className='text-sm text-muted-foreground'>
              Click to choose a .xlsx or .csv file
            </p>
          </div>

          {parsing && (
            <div className='flex items-center justify-center gap-2 text-sm text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin' />
              Parsing file...
            </div>
          )}

          {!parsing && rows.length > 0 && !result && (
            <Alert>
              <CheckCircle2 className='h-4 w-4' />
              <AlertTitle>{rows.length} row(s) found</AlertTitle>
              <AlertDescription>Ready to import into the State Board school directory.</AlertDescription>
            </Alert>
          )}

          {result && (
            <div className='space-y-3'>
              <div className='grid grid-cols-2 gap-3'>
                <div className='rounded-lg border p-3 text-center'>
                  <p className='text-2xl font-semibold text-green-600'>{result.inserted}</p>
                  <p className='text-xs text-muted-foreground'>Inserted</p>
                </div>
                <div className='rounded-lg border p-3 text-center'>
                  <p className='text-2xl font-semibold text-amber-600'>{result.skippedDuplicates}</p>
                  <p className='text-xs text-muted-foreground'>Skipped duplicates</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <Alert variant='destructive'>
                  <AlertCircle className='h-4 w-4' />
                  <AlertTitle>{result.errors.length} row(s) had errors</AlertTitle>
                  <AlertDescription>
                    <ul className='mt-1 max-h-40 space-y-1 overflow-y-auto text-xs'>
                      {result.errors.map((err, idx) => (
                        <li key={idx}>
                          Row {err.row}: {err.message}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => handleOpenChange(false)}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button onClick={handleImport} disabled={rows.length === 0 || bulkImport.isPending}>
              {bulkImport.isPending && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}
              Import {rows.length > 0 ? `${rows.length} schools` : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
