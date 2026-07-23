'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ImportError {
  row: number;
  field?: string;
  message: string;
}

interface ImportResult {
  success: boolean;
  imported: number;
  errorCount: number;
  totalRows: number;
  errors: ImportError[];
}

export interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog title — e.g. "Import Workload" */
  title: string;
  /** Explanatory subtext shown under the title */
  description?: string;
  /** GET endpoint that returns the .xlsx template */
  templateUrl: string;
  /** POST endpoint that accepts multipart/form-data with a "file" field */
  uploadUrl: string;
  /** Column headers to show in the preview table */
  columns: string[];
  /** Callback fired after a successful import */
  onSuccess?: () => void;
  /** Template filename (without extension) */
  templateFilename?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BulkImportDialog({
  open,
  onOpenChange,
  title,
  description,
  templateUrl,
  uploadUrl,
  columns,
  onSuccess,
  templateFilename = 'import-template',
}: BulkImportDialogProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);

  // ── File handling ──────────────────────────────────────────────
  const handleFileSelect = useCallback(async (selectedFile: File | null) => {
    if (!selectedFile) {
      setFile(null);
      setPreviewRows([]);
      return;
    }

    if (!selectedFile.name.endsWith('.xlsx')) {
      toast.error('Only .xlsx files are accepted');
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      toast.error('File exceeds 5 MB limit');
      return;
    }

    setFile(selectedFile);
    setResult(null);

    // Parse preview (first 5 data rows) using ExcelJS on client
    try {
      const ExcelJS = (await import('exceljs')).default;
      const buf = await selectedFile.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.worksheets[0]; // first sheet
      if (ws) {
        const rows: string[][] = [];
        ws.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // skip header
          if (rows.length >= 5) return; // first 5 data rows
          const cells: string[] = [];
          for (let c = 1; c <= columns.length; c++) {
            const v = row.getCell(c).value;
            cells.push(v === null || v === undefined ? '' : String(v instanceof Date ? v.toISOString().split('T')[0] : v));
          }
          rows.push(cells);
        });
        setPreviewRows(rows);
      }
    } catch {
      // Preview is best-effort; if parsing fails, skip it
      setPreviewRows([]);
    }
  }, [columns.length]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
  };

  // ── Upload ─────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!file) { toast.error('Select a file first'); return; }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch(uploadUrl, { method: 'POST', body: fd });
      const data: ImportResult = await res.json();

      if (res.ok && data.success) {
        toast.success(`Imported ${data.imported} row${data.imported !== 1 ? 's' : ''} successfully`);
        setResult(data);
        onSuccess?.();
        router.refresh();
      } else {
        toast.error(`Import completed with ${data.errorCount} error(s)`);
        setResult(data);
      }
    } catch (err) {
      console.error('[BulkImportDialog] Upload error:', err);
      toast.error('Upload failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  // ── Template download ──────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch(templateUrl);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${templateFilename}-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Template downloaded');
    } catch {
      toast.error('Failed to download template');
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    setPreviewRows([]);
    onOpenChange(false);
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-6">
          {/* Template download */}
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleDownloadTemplate} size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>

          {/* Drag-and-drop zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">
              Drag and drop your .xlsx file here, or
            </p>
            <label htmlFor="bulk-import-file">
              <Button variant="outline" size="sm" asChild>
                <span>Browse Files</span>
              </Button>
            </label>
            <input
              id="bulk-import-file"
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
            />
            {file && (
              <div className="mt-3 flex items-center justify-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-green-600" />
                <span className="font-medium">{file.name}</span>
                <Badge variant="secondary">{(file.size / 1024).toFixed(0)} KB</Badge>
              </div>
            )}
          </div>

          {/* Preview table */}
          {previewRows.length > 0 && !result && (
            <div>
              <h4 className="text-sm font-medium mb-2">Preview (first {previewRows.length} rows)</h4>
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columns.map((col) => (
                        <TableHead key={col} className="text-xs whitespace-nowrap">{col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((cells, idx) => (
                      <TableRow key={idx}>
                        {cells.map((val, ci) => (
                          <TableCell key={ci} className="text-xs py-1.5">{val || '-'}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Import button */}
          {file && !result && (
            <div className="flex justify-end">
              <Button onClick={handleImport} disabled={importing}>
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Confirm Import
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-4">
              {result.success ? (
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertTitle>Import Successful</AlertTitle>
                  <AlertDescription>
                    {result.imported} row{result.imported !== 1 ? 's' : ''} imported.
                    {result.errorCount > 0 && ` ${result.errorCount} row(s) skipped due to errors.`}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Import Failed</AlertTitle>
                  <AlertDescription>
                    No rows imported. {result.errorCount} error(s) found.
                  </AlertDescription>
                </Alert>
              )}

              {result.errors.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    Errors ({result.errors.length})
                  </h4>
                  <div className="border rounded-md overflow-x-auto max-h-60 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Row</TableHead>
                          <TableHead className="w-28">Field</TableHead>
                          <TableHead>Message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.errors.map((err, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs">{err.row}</TableCell>
                            <TableCell className="text-xs">
                              {err.field ? <Badge variant="outline">{err.field}</Badge> : '-'}
                            </TableCell>
                            <TableCell className="text-xs">{err.message}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" onClick={handleClose}>Done</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
