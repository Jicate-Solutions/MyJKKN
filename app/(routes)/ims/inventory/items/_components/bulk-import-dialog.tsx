// app/(routes)/ims/inventory/items/_components/bulk-import-dialog.tsx
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

// ============================================================================
// TYPES (mirrors ImsImportResult from the API route)
// ============================================================================

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

// ============================================================================
// PROPS
// ============================================================================

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string | null;
  institutionId: string;
  onImportComplete?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function BulkImportDialog({
  open,
  onOpenChange,
  storeId,
  institutionId,
  onImportComplete,
}: BulkImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // ── Guard: store context required (IMS multi-store model) ────────────────
  const hasContext = !!storeId;

  // ── File handling ─────────────────────────────────────────────────────────
  const handleFileSelect = (selected: File | null) => {
    if (!selected) {
      setFile(null);
      return;
    }

    if (selected.name.endsWith('.xls') && !selected.name.endsWith('.xlsx')) {
      toast.error('The .xls format is not supported. Please save as .xlsx (Excel 2007+) and try again.');
      return;
    }

    if (!selected.name.endsWith('.xlsx')) {
      toast.error('Invalid file type. Please upload an Excel file (.xlsx)');
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds the 10 MB limit');
      return;
    }

    setFile(selected);
    setResult(null);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
  };

  // ── Download template ─────────────────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    if (!hasContext) {
      toast.error('Select a store before downloading the template');
      return;
    }

    try {
      const params = new URLSearchParams();
      if (storeId)      params.set('storeId', storeId);
      if (institutionId) params.set('institutionId', institutionId);

      const response = await fetch(
        `/api/ims/inventory/template?${params.toString()}`
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to download template');
      }

      const blob = await response.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `ims-items-template-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Template downloaded successfully');
    } catch (error) {
      console.error('[BulkImportDialog] Template download error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to download template');
    }
  };

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!file) {
      toast.error('Please select a file to import');
      return;
    }

    setImporting(true);

    try {
      const fd = new FormData();
      fd.append('file', file);
      if (storeId)      fd.append('storeId', storeId);
      if (institutionId) fd.append('institutionId', institutionId);

      const response = await fetch('/api/ims/inventory/import', {
        method: 'POST',
        body: fd,
      });

      const raw = await response.json();

      // Normalize: server may return { error, message } on 5xx, which lacks `errors` array
      const data: ImportResult = {
        success:      raw.success      ?? false,
        successCount: raw.successCount ?? 0,
        errorCount:   raw.errorCount   ?? 0,
        totalRows:    raw.totalRows    ?? 0,
        errors: Array.isArray(raw.errors)
          ? raw.errors
          : raw.error
            ? [{ row: 0, message: `Server error: ${raw.error}${raw.message ? ` — ${raw.message}` : ''}` }]
            : [],
        duplicateCodes: raw.duplicateCodes,
      };
      setResult(data);

      if (data.successCount > 0) {
        toast.success(
          `Imported ${data.successCount} item${data.successCount !== 1 ? 's' : ''} successfully`
        );
        onImportComplete?.();
      } else {
        toast.error(`Import failed — ${data.errors.length} error(s) found`);
      }
    } catch (error) {
      console.error('[BulkImportDialog] Import error:', error);
      toast.error('Failed to import items. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  // ── Close / reset ─────────────────────────────────────────────────────────
  const handleClose = () => {
    setFile(null);
    setResult(null);
    setDragActive(false);
    onOpenChange(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Items from Excel
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file to bulk-import inventory items. Use the template
            for correct formatting — categories and units are pre-loaded as
            dropdowns.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">

          {/* No context guard */}
          {!hasContext && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No store context</AlertTitle>
              <AlertDescription>
                Select a store before importing items.
              </AlertDescription>
            </Alert>
          )}

          {/* Template download */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              disabled={!hasContext}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
          </div>

          {/* Upload zone */}
          {!result && hasContext && (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/40'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Drag and drop your Excel file here, or
                </p>
                <label htmlFor="ims-file-upload">
                  <Button variant="outline" size="sm" asChild>
                    <span>Browse Files</span>
                  </Button>
                  <input
                    id="ims-file-upload"
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              {file && (
                <div className="mt-4 p-3 bg-muted rounded-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{file.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFileSelect(null)}
                    >
                      Remove
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-4">
              {/* Summary alert */}
              <Alert variant={result.successCount > 0 ? 'default' : 'destructive'}>
                {result.successCount > 0 ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertTitle>
                  {result.successCount > 0
                    ? result.errorCount > 0
                      ? 'Partial Import'
                      : 'Import Complete'
                    : 'Import Failed'}
                </AlertTitle>
                <AlertDescription>
                  <div className="mt-2 space-y-1">
                    <div>
                      <Badge variant="outline" className="mr-2">
                        {result.totalRows}
                      </Badge>
                      <span>Total rows processed</span>
                    </div>
                    {result.successCount > 0 && (
                      <div>
                        <Badge className="mr-2 bg-green-600 hover:bg-green-600">
                          {result.successCount}
                        </Badge>
                        <span>Successfully imported</span>
                      </div>
                    )}
                    {result.errorCount > 0 && (
                      <div>
                        <Badge variant="destructive" className="mr-2">
                          {result.errorCount}
                        </Badge>
                        <span>Errors found</span>
                      </div>
                    )}
                    {result.duplicateCodes && result.duplicateCodes.length > 0 && (
                      <div className="text-xs mt-2 text-muted-foreground">
                        Duplicate codes skipped:{' '}
                        <span className="font-mono">
                          {result.duplicateCodes.slice(0, 5).join(', ')}
                          {result.duplicateCodes.length > 5 &&
                            ` +${result.duplicateCodes.length - 5} more`}
                        </span>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>

              {/* Error detail table */}
              {result.errors.length > 0 && (
                <div className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    Error Details
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Row</TableHead>
                          <TableHead className="w-36">Field</TableHead>
                          <TableHead>Error Message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.errors.slice(0, 50).map((err, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">
                              {err.row ?? 'N/A'}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {err.field ?? '—'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {err.message}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {result.errors.length > 50 && (
                      <p className="text-xs text-muted-foreground text-center mt-2">
                        Showing first 50 of {result.errors.length} errors
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-2">
            {!result ? (
              <>
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!file || importing || !hasContext}
                >
                  {importing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing…
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Import
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setFile(null);
                    setResult(null);
                  }}
                >
                  Import Another File
                </Button>
                <Button onClick={handleClose}>
                  {result.successCount > 0 ? 'Done' : 'Close'}
                </Button>
              </>
            )}
          </div>

          {/* Instructions (shown before results) */}
          {!result && hasContext && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <h4 className="text-sm font-medium mb-2">Quick Instructions:</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Download the template — categories and units are pre-loaded as dropdowns</li>
                <li>
                  Fill data from row 3 (row 2 is a sample — delete or replace it)
                </li>
                <li>
                  Required: Code, Name, Category, Item Type, Base Unit, GST Rate,
                  Cost Price, MRP, Selling Price
                </li>
                <li>Valid rows are inserted; invalid rows are reported with row numbers</li>
                <li>
                  Optional: fill column V (Opening Stock) to set initial quantity;
                  add Batch Number (W) and Expiry Date (X) if tracking is enabled
                </li>
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
