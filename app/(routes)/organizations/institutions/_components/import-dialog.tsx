// app/(routes)/organizations/institutions/_components/import-dialog.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportError {
  row: number;
  field?: string;
  message: string;
}

interface ImportResult {
  success: boolean;
  successCount: number;
  errorCount: number;
  totalRows: number;
  errors: ImportError[];
  duplicateCodes?: string[];
}

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileSelect = (selectedFile: File | null) => {
    if (!selectedFile) {
      setFile(null);
      return;
    }

    // Validate file type
    if (
      !selectedFile.name.endsWith('.xlsx') &&
      !selectedFile.name.endsWith('.xls')
    ) {
      toast.error('Invalid file type. Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    // Validate file size (max 10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds 10MB limit');
      return;
    }

    setFile(selectedFile);
    setResult(null); // Clear previous results
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Please select a file to import');
      return;
    }

    setImporting(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        '/api/organizations/institutions/import',
        {
          method: 'POST',
          body: formData
        }
      );

      const data: ImportResult = await response.json();

      if (response.ok && data.success) {
        toast.success(
          `Successfully imported ${data.successCount} institution${data.successCount !== 1 ? 's' : ''}`
        );
        setResult(data);

        // Refresh the page after successful import
        router.refresh();
      } else {
        toast.error(`Import failed: ${data.errorCount} error(s) found`);
        setResult(data);
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import institutions. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch(
        '/api/organizations/institutions/template'
      );

      if (!response.ok) {
        throw new Error('Failed to download template');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `institutions-template-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Template downloaded successfully');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download template');
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='max-w-4xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Upload className='h-5 w-5' />
            Import Institutions from Excel
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file with institution data. Use the template for proper
            formatting.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-6'>
          {/* Download Template Button */}
          <div className='flex justify-end'>
            <Button
              variant='outline'
              size='sm'
              onClick={handleDownloadTemplate}
            >
              <Download className='mr-2 h-4 w-4' />
              Download Template
            </Button>
          </div>

          {/* File Upload Area */}
          {!result && (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <FileSpreadsheet className='mx-auto h-12 w-12 text-muted-foreground mb-4' />
              <div className='space-y-2'>
                <p className='text-sm text-muted-foreground'>
                  Drag and drop your Excel file here, or
                </p>
                <label htmlFor='file-upload'>
                  <Button variant='outline' size='sm' asChild>
                    <span>Browse Files</span>
                  </Button>
                  <input
                    id='file-upload'
                    type='file'
                    accept='.xlsx,.xls'
                    className='hidden'
                    onChange={(e) =>
                      handleFileSelect(e.target.files?.[0] || null)
                    }
                  />
                </label>
              </div>
              {file && (
                <div className='mt-4 p-3 bg-muted rounded-md'>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <FileSpreadsheet className='h-4 w-4 text-primary' />
                      <span className='text-sm font-medium'>{file.name}</span>
                    </div>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => handleFileSelect(null)}
                    >
                      Remove
                    </Button>
                  </div>
                  <p className='text-xs text-muted-foreground mt-1'>
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Import Results */}
          {result && (
            <div className='space-y-4'>
              {/* Summary */}
              <Alert variant={result.success ? 'default' : 'destructive'}>
                {result.success ? (
                  <CheckCircle className='h-4 w-4' />
                ) : (
                  <XCircle className='h-4 w-4' />
                )}
                <AlertTitle>
                  {result.success ? 'Import Completed' : 'Import Failed'}
                </AlertTitle>
                <AlertDescription>
                  <div className='mt-2 space-y-1'>
                    <div>
                      <Badge variant='outline' className='mr-2'>
                        {result.totalRows}
                      </Badge>
                      <span>Total rows processed</span>
                    </div>
                    {result.successCount > 0 && (
                      <div>
                        <Badge variant='default' className='mr-2 bg-green-600'>
                          {result.successCount}
                        </Badge>
                        <span>Successfully imported</span>
                      </div>
                    )}
                    {result.errorCount > 0 && (
                      <div>
                        <Badge variant='destructive' className='mr-2'>
                          {result.errorCount}
                        </Badge>
                        <span>Errors found</span>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>

              {/* Error Details */}
              {result.errors && result.errors.length > 0 && (
                <div className='border rounded-lg p-4 space-y-2'>
                  <div className='flex items-center gap-2 text-sm font-medium'>
                    <AlertCircle className='h-4 w-4 text-destructive' />
                    Error Details
                  </div>
                  <div className='max-h-64 overflow-y-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className='w-20'>Row</TableHead>
                          <TableHead className='w-32'>Field</TableHead>
                          <TableHead>Error Message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.errors.slice(0, 50).map((error, index) => (
                          <TableRow key={index}>
                            <TableCell className='font-mono text-xs'>
                              {error.row || 'N/A'}
                            </TableCell>
                            <TableCell className='font-mono text-xs'>
                              {error.field || 'N/A'}
                            </TableCell>
                            <TableCell className='text-sm'>
                              {error.message}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {result.errors.length > 50 && (
                      <p className='text-xs text-muted-foreground text-center mt-2'>
                        Showing first 50 of {result.errors.length} errors
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className='flex justify-end gap-2'>
            {!result ? (
              <>
                <Button variant='outline' onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!file || importing}
                >
                  {importing ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className='mr-2 h-4 w-4' />
                      Import
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant='outline'
                  onClick={() => {
                    setFile(null);
                    setResult(null);
                  }}
                >
                  Import Another File
                </Button>
                <Button onClick={handleClose}>
                  {result.success ? 'Done' : 'Close'}
                </Button>
              </>
            )}
          </div>

          {/* Instructions */}
          {!result && (
            <div className='border rounded-lg p-4 bg-muted/50'>
              <h4 className='text-sm font-medium mb-2'>Import Instructions:</h4>
              <ul className='text-sm text-muted-foreground space-y-1 list-disc list-inside'>
                <li>Download the template using the button above</li>
                <li>
                  Fill in your institution data (Institution Type, Category, and
                  Timetable Type must use the dropdowns)
                </li>
                <li>Save the file and upload it here</li>
                <li>Review the import results and fix any errors</li>
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
