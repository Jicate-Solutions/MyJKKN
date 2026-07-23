'use client';
// app/(routes)/resource-management/resources/_components/bulk-upload-resources.tsx
//
// Dialog component for uploading the resources bulk-import .xlsx template.
//
// Flow:
//   1. User selects file (drag/drop or click).
//   2. We POST multipart FormData to /api/resource-management/resources/import.
//   3. The route streams back an ImportResult with success/error counts +
//      row-level errors.
//   4. We render the counts as badges and the errors as a scrollable table.

import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-hot-toast';

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
}

interface BulkUploadResourcesProps {
  /** Called after a successful import so the parent page can refresh its list. */
  onImported?: () => void;
}

export default function BulkUploadResources({
  onImported
}: BulkUploadResourcesProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setResult(null);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClose = (next: boolean) => {
    if (uploading) return; // Don't allow close mid-upload
    setOpen(next);
    if (!next) {
      // Reset on close so the next open starts fresh
      setTimeout(reset, 200);
    }
  };

  const acceptFile = (candidate: File | null | undefined) => {
    if (!candidate) return;
    if (
      !candidate.name.toLowerCase().endsWith('.xlsx') &&
      !candidate.name.toLowerCase().endsWith('.xls')
    ) {
      toast.error('Please upload a .xlsx or .xls file');
      return;
    }
    setFile(candidate);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    acceptFile(dropped);
  };

  const handleUpload = async () => {
    if (!file || uploading) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(
        '/api/resource-management/resources/import',
        {
          method: 'POST',
          body: formData
        }
      );

      const payload = (await res.json()) as ImportResult & { error?: string };

      if (!res.ok && !payload.errors) {
        toast.error(payload.error || 'Upload failed');
        setResult(null);
        return;
      }

      setResult({
        success: payload.success ?? false,
        successCount: payload.successCount ?? 0,
        errorCount: payload.errorCount ?? 0,
        totalRows: payload.totalRows ?? 0,
        errors: payload.errors ?? []
      });

      if (payload.successCount && payload.successCount > 0) {
        toast.success(
          `Imported ${payload.successCount} of ${payload.totalRows} resources`
        );
        onImported?.();
      } else if (payload.errorCount && payload.errorCount > 0) {
        toast.error(`No rows imported. ${payload.errorCount} errors.`);
      }
    } catch (err) {
      console.error('[bulk-upload-resources] upload failed:', err);
      toast.error('Upload failed. Check console for details.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant='outline' className='w-full sm:w-auto'>
          <Upload className='mr-2 h-4 w-4' />
          Bulk Upload
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-3xl'>
        <DialogHeader>
          <DialogTitle>Bulk Upload Resources</DialogTitle>
          <DialogDescription>
            Upload the completed template. Each row that passes validation
            will be inserted. Failed rows are reported with row numbers so
            you can fix the file and re-upload only those.
          </DialogDescription>
        </DialogHeader>

        {/* ── Drop zone / file picker ──────────────────────────────────── */}
        {!result && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragging
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25'
            }`}
          >
            {file ? (
              <div className='flex items-center justify-center gap-3'>
                <FileSpreadsheet className='h-8 w-8 text-primary' />
                <div className='text-left'>
                  <p className='font-medium'>{file.name}</p>
                  <p className='text-xs text-muted-foreground'>
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => {
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = '';
                  }}
                  disabled={uploading}
                >
                  <X className='h-4 w-4' />
                </Button>
              </div>
            ) : (
              <>
                <Upload className='mx-auto h-10 w-10 text-muted-foreground/60' />
                <p className='mt-2 text-sm font-medium'>
                  Drag &amp; drop your .xlsx file here
                </p>
                <p className='text-xs text-muted-foreground'>
                  or click below to pick a file
                </p>
                <Button
                  variant='outline'
                  size='sm'
                  className='mt-3'
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                >
                  Choose file
                </Button>
              </>
            )}
            <input
              ref={inputRef}
              type='file'
              accept='.xlsx,.xls'
              className='hidden'
              onChange={(e) => acceptFile(e.target.files?.[0])}
            />
          </div>
        )}

        {/* ── Result summary + error table ─────────────────────────────── */}
        {result && (
          <div className='space-y-4'>
            <div className='flex flex-wrap gap-2'>
              <Badge variant='outline' className='gap-1.5'>
                <span className='text-muted-foreground'>Total rows:</span>
                <span className='font-semibold'>{result.totalRows}</span>
              </Badge>
              <Badge className='gap-1.5 bg-green-100 text-green-800 hover:bg-green-100'>
                <CheckCircle2 className='h-3.5 w-3.5' />
                <span className='font-semibold'>{result.successCount}</span>
                <span>imported</span>
              </Badge>
              {result.errorCount > 0 && (
                <Badge className='gap-1.5 bg-red-100 text-red-800 hover:bg-red-100'>
                  <AlertCircle className='h-3.5 w-3.5' />
                  <span className='font-semibold'>{result.errorCount}</span>
                  <span>failed</span>
                </Badge>
              )}
            </div>

            {result.errors.length > 0 && (
              <div className='rounded-md border'>
                <ScrollArea className='max-h-[300px]'>
                  <Table>
                    <TableHeader className='sticky top-0 bg-background'>
                      <TableRow>
                        <TableHead className='w-[80px]'>Row</TableHead>
                        <TableHead className='w-[180px]'>Field</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.errors.map((err, idx) => (
                        <TableRow key={idx}>
                          <TableCell className='font-mono text-xs'>
                            {err.row}
                          </TableCell>
                          <TableCell className='text-xs text-muted-foreground'>
                            {err.field || '—'}
                          </TableCell>
                          <TableCell className='text-sm'>
                            {err.message}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        {/* ── Footer actions ───────────────────────────────────────────── */}
        <div className='flex justify-end gap-2 pt-2'>
          {result ? (
            <>
              <Button variant='outline' onClick={reset}>
                Upload Another File
              </Button>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </>
          ) : (
            <>
              <Button
                variant='outline'
                onClick={() => handleClose(false)}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!file || uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className='mr-2 h-4 w-4' />
                    Upload &amp; Import
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
