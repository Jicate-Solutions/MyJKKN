'use client';

import { useState } from 'react';
import { Upload, X, CheckCircle2, AlertCircle, FileSpreadsheet } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import toast from 'react-hot-toast';
import type { ImportResult } from '@/lib/utils/mappings/student-bill-excel-mappings';

interface ImportBillsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

/**
 * Dialog for uploading a Student Bills Excel file.
 *
 * Mirrors the existing import-dialog pattern used elsewhere in the app
 * (e.g. organizations/programs) but is retargeted at the bills endpoints
 * and uses copy that makes the per-row contract obvious to the user.
 */
export function ImportBillsDialog({
  open,
  onOpenChange,
  onImportComplete
}: ImportBillsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const resetState = () => {
    setFile(null);
    setResult(null);
    setProgress(0);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetState();
    onOpenChange(next);
  };

  const handleFileChange = (selected: File | null) => {
    if (!selected) return;
    if (!selected.name.endsWith('.xlsx') && !selected.name.endsWith('.xls')) {
      toast.error('Invalid file type — please select .xlsx or .xls', {
        icon: <FileSpreadsheet className='h-4 w-4' />,
        duration: 5000
      });
      return;
    }
    setFile(selected);
    setResult(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileChange(dropped);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(10);

    try {
      const formData = new FormData();
      formData.append('file', file);
      setProgress(30);

      const response = await fetch('/api/billing/schedule/bills/import', {
        method: 'POST',
        body: formData
      });

      setProgress(70);

      const data: ImportResult = await response.json();
      setProgress(100);
      setResult(data);

      if (data.success) {
        toast.success(
          `Imported ${data.successCount} bill${data.successCount !== 1 ? 's' : ''} successfully.`,
          { icon: <CheckCircle2 className='h-4 w-4' />, duration: 5000 }
        );
        if (onImportComplete) {
          setTimeout(() => onImportComplete(), 500);
        }
      } else if (data.successCount > 0) {
        // Partial success: some rows committed, some failed
        toast(
          `Imported ${data.successCount} of ${data.totalRows} rows. ${data.errorCount} row${data.errorCount !== 1 ? 's' : ''} failed — see error report below.`,
          { icon: <AlertCircle className='h-4 w-4 text-orange-500' />, duration: 6000 }
        );
        if (onImportComplete) {
          setTimeout(() => onImportComplete(), 500);
        }
      } else {
        toast.error(
          `Import failed — ${data.errorCount} error${data.errorCount !== 1 ? 's' : ''}.`,
          { icon: <AlertCircle className='h-4 w-4' />, duration: 5000 }
        );
      }
    } catch (error) {
      console.error('[ImportBillsDialog] Upload error:', error);
      const message = error instanceof Error ? error.message : 'Upload failed';
      toast.error('Upload failed — see console for details.', {
        icon: <AlertCircle className='h-4 w-4' />,
        duration: 5000
      });
      setResult({
        success: false,
        successCount: 0,
        errorCount: 1,
        totalRows: 0,
        errors: [{ row: 0, message }]
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/billing/schedule/bills/template');
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Template download failed');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `student-bills-template-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded.');
    } catch (error) {
      console.error('[ImportBillsDialog] Template download error:', error);
      toast.error('Failed to download template.');
    }
  };

  // Treat any commit (full or partial) as worth showing the green summary
  const committedAny = !!result && result.successCount > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-w-3xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Upload className='h-5 w-5' />
            Bulk Upload Bills from Excel
          </DialogTitle>
          <DialogDescription>
            Each row in the Excel file becomes one bill. Roll numbers must
            already exist in the system; billing categories must match the
            dropdown values from the template.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {/* Template Download */}
          <Alert>
            <FileSpreadsheet className='h-4 w-4' />
            <AlertDescription className='flex items-center justify-between'>
              <span className='text-sm'>
                Don&apos;t have a template? Download the latest one — its dropdown
                only lists active billing categories.
              </span>
              <Button
                variant='outline'
                size='sm'
                onClick={handleDownloadTemplate}
                className='ml-2 shrink-0'
              >
                Download Template
              </Button>
            </AlertDescription>
          </Alert>

          {/* File Upload */}
          {!result && (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {!file ? (
                <>
                  <Upload className='h-12 w-12 mx-auto mb-4 text-gray-400' />
                  <p className='text-sm text-gray-600 dark:text-gray-400 mb-2'>
                    Drag and drop your Excel file here, or click to browse
                  </p>
                  <input
                    type='file'
                    accept='.xlsx,.xls'
                    onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                    className='hidden'
                    id='bills-file-upload'
                  />
                  <label htmlFor='bills-file-upload'>
                    <Button variant='outline' size='sm' asChild>
                      <span>Choose File</span>
                    </Button>
                  </label>
                </>
              ) : (
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-3'>
                    <FileSpreadsheet className='h-8 w-8 text-green-600' />
                    <div className='text-left'>
                      <p className='font-medium'>{file.name}</p>
                      <p className='text-sm text-gray-500'>
                        {(file.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  </div>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => setFile(null)}
                    disabled={uploading}
                  >
                    <X className='h-4 w-4' />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Progress */}
          {uploading && (
            <div className='space-y-2'>
              <Progress value={progress} className='h-2' />
              <p className='text-sm text-center text-gray-600 dark:text-gray-400'>
                {progress < 30 && 'Uploading file...'}
                {progress >= 30 && progress < 70 && 'Validating rows...'}
                {progress >= 70 && 'Saving bills...'}
              </p>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className='space-y-4'>
              {committedAny && (
                <Alert className='border-green-200 bg-green-50 dark:bg-green-900/10'>
                  <CheckCircle2 className='h-4 w-4 text-green-600' />
                  <AlertDescription>
                    <div className='flex items-center justify-between'>
                      <div>
                        <p className='font-medium text-green-800 dark:text-green-200'>
                          {result.errorCount === 0 ? 'Import Successful!' : 'Partial Import'}
                        </p>
                        <p className='text-sm text-green-700 dark:text-green-300'>
                          Imported {result.successCount} bill
                          {result.successCount !== 1 ? 's' : ''} out of {result.totalRows}{' '}
                          row{result.totalRows !== 1 ? 's' : ''}.
                        </p>
                      </div>
                      <Badge variant='outline' className='bg-green-100 text-green-800'>
                        {result.successCount}/{result.totalRows}
                      </Badge>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {!committedAny && (
                <Alert variant='destructive'>
                  <AlertCircle className='h-4 w-4' />
                  <AlertDescription>
                    <div className='flex items-center justify-between'>
                      <div>
                        <p className='font-medium'>Import Failed</p>
                        <p className='text-sm'>
                          {result.errorCount} error{result.errorCount !== 1 ? 's' : ''} found
                          {result.totalRows > 0
                            ? ` in ${result.totalRows} row${result.totalRows !== 1 ? 's' : ''}.`
                            : '.'}
                        </p>
                      </div>
                      <Badge variant='outline' className='bg-red-100 text-red-800'>
                        {result.errorCount} error{result.errorCount !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {result.errors && result.errors.length > 0 && (
                <div className='border rounded-lg p-4 max-h-80 overflow-y-auto bg-gray-50 dark:bg-gray-900'>
                  <p className='font-medium mb-3 text-sm'>Error Details:</p>
                  <div className='space-y-2'>
                    {result.errors.map((error, index) => (
                      <div
                        key={index}
                        className='flex items-start gap-2 text-sm p-2 bg-white dark:bg-gray-800 rounded border'
                      >
                        <Badge variant='outline' className='mt-0.5 shrink-0'>
                          Row {error.row}
                        </Badge>
                        <div className='flex-1'>
                          {error.field && (
                            <span className='font-medium text-red-600 dark:text-red-400'>
                              {error.field}:{' '}
                            </span>
                          )}
                          <span className='text-gray-700 dark:text-gray-300'>
                            {error.message}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!result ? (
            <>
              <Button variant='outline' onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={!file || uploading}>
                {uploading ? (
                  <>
                    <span className='animate-spin mr-2'>⏳</span>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className='h-4 w-4 mr-2' />
                    Upload & Import
                  </>
                )}
              </Button>
            </>
          ) : committedAny ? (
            <>
              <Button variant='outline' onClick={resetState}>
                Upload Another
              </Button>
              <Button onClick={() => handleOpenChange(false)}>
                <CheckCircle2 className='h-4 w-4 mr-2' />
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant='outline' onClick={resetState}>
                Try Again
              </Button>
              <Button onClick={() => handleOpenChange(false)}>Close</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
