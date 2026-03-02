'use client';

import { useState, useRef } from 'react';
import { Upload, X, CheckCircle2, AlertCircle, FileSpreadsheet, Loader2 } from 'lucide-react';
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
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CONSULTANT_COLUMN_MAPPING } from '@/lib/utils/mappings/consultant-excel-mappings';

/**
 * Import Dialog Component for Education Consultants
 *
 * Features:
 * - File upload with drag & drop
 * - Real-time progress tracking
 * - Detailed error reporting with row numbers
 * - Success/error summary
 * - Download template shortcut with data validation
 */

// ============================================================
// TYPE DEFINITIONS
// ============================================================

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
  duplicatePhones?: string[];
}

interface PreviewRow {
  rowNumber: number;
  name: string;
  phone: string;
  type: string;
  email: string;
  errors: string[];
  isValid: boolean;
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

// ============================================================
// VALIDATION HELPERS
// ============================================================

// Valid consultant types for client-side preview validation
const VALID_CONSULTANT_TYPES = new Set([
  'external', 'internal', 'institutional', 'alumni', 'student',
]);
const CONSULTANT_TYPE_ALIASES: Record<string, string> = {
  agent: 'external',
  partner: 'external',
};

function validatePreviewRow(
  mapped: Record<string, any>,
  rowNumber: number
): PreviewRow {
  const errors: string[] = [];

  const name = String(mapped.name || '').trim();
  const rawPhone = String(mapped.phone || '');
  const phone = rawPhone.replace(/\D/g, '');
  const typeRaw = String(mapped.consultant_type || '').toLowerCase().trim();
  const email = String(mapped.email || '').toLowerCase().trim();

  if (!name) errors.push('Missing: Name');

  if (!rawPhone) {
    errors.push('Missing: Phone');
  } else if (phone.length < 10) {
    errors.push(`Phone too short (${phone.length} digits, need ≥10)`);
  }

  if (!mapped.consultant_type) {
    errors.push('Missing: Type');
  }
  // Note: unknown types are silently normalized to 'external' by the server,
  // so we don't flag them as errors here to avoid false negatives in the preview.

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push(`Invalid email: ${email}`);
  }

  return {
    rowNumber,
    name: name || '—',
    phone: phone || rawPhone || '—',
    type: String(mapped.consultant_type || '') || '—',
    email: email || '—',
    errors,
    isValid: errors.length === 0,
  };
}

// ============================================================
// COMPONENT
// ============================================================

export function ConsultantImportDialog({
  open,
  onOpenChange,
  onImportComplete
}: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewRow[] | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const parseFileForPreview = async (file: File) => {
    setIsParsing(true);
    setPreviewData(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);

      // Find the "Consultants" sheet, or the first non-instructions sheet
      const sheetName =
        workbook.SheetNames.find((n) => n.toLowerCase().includes('consultant')) ??
        workbook.SheetNames.find(
          (n) =>
            !n.toLowerCase().includes('instruction') &&
            !n.toLowerCase().includes('reference')
        ) ??
        workbook.SheetNames[0];

      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        setPreviewData([]);
        return;
      }
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

      const rows: PreviewRow[] = jsonData.map((row, index) => {
        // Normalize row keys: strip trailing asterisks (template marks required fields with *)
        const normalizedRow: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
          normalizedRow[key.replace(/\*+$/, '').trim()] = value;
        }
        // CONSULTANT_COLUMN_MAPPING is { excelHeader: dbField }
        const mapped: Record<string, any> = {};
        for (const [header, field] of Object.entries(CONSULTANT_COLUMN_MAPPING)) {
          if (normalizedRow[header] !== undefined && normalizedRow[header] !== null && normalizedRow[header] !== '') {
            mapped[field] = normalizedRow[header];
          }
        }
        return validatePreviewRow(mapped, index + 2);
      });

      setPreviewData(rows);
    } catch {
      // Silently fail preview — server will catch real errors on upload
      setPreviewData(null);
    } finally {
      setIsParsing(false);
    }
  };

  const startProgressAnimation = () => {
    setProgress(0);
    let p = 0;
    progressIntervalRef.current = setInterval(() => {
      p = Math.min(p + 1, 99);
      setProgress(p);
      if (p >= 99) clearInterval(progressIntervalRef.current!);
    }, 60); // 60ms per tick ≈ 6 seconds to reach 99%
  };

  const stopProgressAnimation = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setProgress(100);
  };

  const getProgressLabel = (p: number): string => {
    if (p < 25) return 'Uploading file...';
    if (p < 50) return 'Parsing Excel...';
    if (p < 75) return 'Checking duplicates...';
    return 'Creating records...';
  };

  // ============================================================
  // HANDLERS
  // ============================================================

  // Reset state when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setFile(null);
      setResult(null);
      setProgress(0);
      setPreviewData(null);
      setIsParsing(false);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }
    onOpenChange(newOpen);
  };

  // Handle file selection
  const handleFileChange = (selectedFile: File | null) => {
    if (selectedFile) {
      // Validate file type
      if (
        !selectedFile.name.endsWith('.xlsx') &&
        !selectedFile.name.endsWith('.xls')
      ) {
        toast.error('Invalid file type. Please upload an Excel file (.xlsx or .xls)');
        return;
      }

      setFile(selectedFile);
      setResult(null);
      setPreviewData(null);
      parseFileForPreview(selectedFile);
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileChange(droppedFile);
    }
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!file) return;

    startProgressAnimation();
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/admission/consultants/import', {
        method: 'POST',
        body: formData
      });

      const data: ImportResult = await response.json();
      setResult(data);

      if (data.success) {
        toast.success(
          `Successfully imported ${data.successCount} consultant${data.successCount !== 1 ? 's' : ''}!`
        );
        if (onImportComplete) {
          setTimeout(() => {
            onImportComplete();
          }, 500);
        }
      } else if (data.successCount > 0) {
        toast.warning(
          `Imported ${data.successCount} consultant${data.successCount !== 1 ? 's' : ''} with ${data.errorCount} error${data.errorCount !== 1 ? 's' : ''}`
        );
        if (onImportComplete) {
          setTimeout(() => {
            onImportComplete();
          }, 500);
        }
      } else {
        toast.error(
          `Import failed with ${data.errorCount} error${data.errorCount !== 1 ? 's' : ''}`
        );
      }
    } catch (error) {
      console.error('[ConsultantImportDialog] Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      toast.error('Upload failed');
      setResult({
        success: false,
        successCount: 0,
        errorCount: 1,
        totalRows: 0,
        errors: [{ row: 0, message: errorMessage }]
      });
    } finally {
      stopProgressAnimation();
      setUploading(false);
    }
  };

  // Download template
  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/admission/consultants/template');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `consultant-import-template-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded successfully');
    } catch (error) {
      console.error('[ConsultantImportDialog] Template download error:', error);
      toast.error('Failed to download template');
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  const validRowCount = previewData?.filter((r) => r.isValid).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Consultants
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file to import multiple consultant records at once.
            The file must include required fields: Name, Phone, and Type.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Download Section */}
          <Alert>
            <FileSpreadsheet className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span className="text-sm">
                Don&apos;t have a template? Download it with dropdown validation for type, tier, and status.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                className="ml-2"
              >
                Download Template
              </Button>
            </AlertDescription>
          </Alert>

          {/* File Upload Section */}
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
                  <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Drag and drop your Excel file here, or click to browse
                  </p>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                    className="hidden"
                    id="consultant-file-upload"
                  />
                  <label htmlFor="consultant-file-upload">
                    <Button variant="outline" size="sm" asChild>
                      <span>Choose File</span>
                    </Button>
                  </label>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="h-8 w-8 text-green-600" />
                      <div className="text-left">
                        <p className="font-medium">{file.name}</p>
                        <p className="text-sm text-gray-500">
                          {(file.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFile(null);
                        setPreviewData(null);
                        setIsParsing(false);
                      }}
                      disabled={uploading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {isParsing && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Analyzing file...
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Preview Table — shown after client-side parse, before upload */}
          {previewData !== null && previewData.length > 0 && !result && (
            <div className="space-y-2">
              {/* Summary bar */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground font-medium">
                  {previewData.length} row{previewData.length !== 1 ? 's' : ''} detected
                </span>
                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300">
                  ✓ {previewData.filter((r) => r.isValid).length} valid
                </Badge>
                {previewData.some((r) => !r.isValid) && (
                  <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300">
                    ✗ {previewData.filter((r) => !r.isValid).length} errors
                  </Badge>
                )}
              </div>

              {/* Scrollable table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0 z-10">
                      <tr>
                        <th className="px-2 py-2 text-left font-medium text-muted-foreground w-10">#</th>
                        <th className="px-2 py-2 text-left font-medium text-muted-foreground">Name</th>
                        <th className="px-2 py-2 text-left font-medium text-muted-foreground">Phone</th>
                        <th className="px-2 py-2 text-left font-medium text-muted-foreground">Type</th>
                        <th className="px-2 py-2 text-left font-medium text-muted-foreground">Email</th>
                        <th className="px-2 py-2 w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <TooltipProvider>
                        {previewData.slice(0, 100).map((row) => (
                          <Tooltip key={row.rowNumber}>
                            <TooltipTrigger asChild>
                              <tr
                                tabIndex={0}
                                className={
                                  row.isValid
                                    ? 'hover:bg-muted/30 cursor-default'
                                    : 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100/70 dark:hover:bg-red-900/20 cursor-default'
                                }
                              >
                                <td className="px-2 py-1.5 text-muted-foreground">{row.rowNumber}</td>
                                <td
                                  title={row.name !== '—' ? row.name : undefined}
                                  className={`px-2 py-1.5 max-w-[140px] truncate ${
                                    row.errors.some((e) => e.includes('Name'))
                                      ? 'text-red-600 dark:text-red-400 font-medium'
                                      : ''
                                  }`}
                                >
                                  {row.name}
                                </td>
                                <td
                                  className={`px-2 py-1.5 ${
                                    row.errors.some((e) => e.includes('Phone'))
                                      ? 'text-red-600 dark:text-red-400 font-medium'
                                      : ''
                                  }`}
                                >
                                  {row.phone}
                                </td>
                                <td
                                  className={`px-2 py-1.5 ${
                                    row.errors.some((e) => e.includes('type') || e.includes('Type'))
                                      ? 'text-red-600 dark:text-red-400 font-medium'
                                      : ''
                                  }`}
                                >
                                  {row.type}
                                </td>
                                <td
                                  title={row.email !== '—' ? row.email : undefined}
                                  className={`px-2 py-1.5 max-w-[140px] truncate ${
                                    row.errors.some((e) => e.includes('email') || e.includes('Email'))
                                      ? 'text-red-600 dark:text-red-400 font-medium'
                                      : ''
                                  }`}
                                >
                                  {row.email}
                                </td>
                                <td className="px-2 py-1.5">
                                  {row.isValid ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                  ) : (
                                    <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                                  )}
                                </td>
                              </tr>
                            </TooltipTrigger>
                            {!row.isValid && (
                              <TooltipContent side="left" className="max-w-xs">
                                <ul className="text-xs space-y-0.5">
                                  {row.errors.map((e, i) => (
                                    <li key={i}>• {e}</li>
                                  ))}
                                </ul>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        ))}
                      </TooltipProvider>
                    </tbody>
                  </table>
                </div>
                {previewData.length > 100 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/50">
                    ... and {previewData.length - 100} more rows (all will be imported)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty file warning */}
          {previewData !== null && previewData.length === 0 && !result && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No data rows found in the file. Make sure the Excel sheet is named &quot;Consultants&quot; and has data below the header row.
              </AlertDescription>
            </Alert>
          )}

          {/* Progress Bar */}
          {uploading && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-center text-gray-600 dark:text-gray-400">
                {getProgressLabel(progress)}
              </p>
            </div>
          )}

          {/* Results Section */}
          {result && (
            <div className="space-y-4">
              {/* Success Summary */}
              {result.success && (
                <Alert className="border-green-200 bg-green-50 dark:bg-green-900/10">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-green-800 dark:text-green-200">
                          Import Successful!
                        </p>
                        <p className="text-sm text-green-700 dark:text-green-300">
                          Successfully imported {result.successCount} consultant
                          {result.successCount !== 1 ? 's' : ''} out of {result.totalRows}{' '}
                          row{result.totalRows !== 1 ? 's' : ''}.
                        </p>
                      </div>
                      <Badge variant="outline" className="bg-green-100 text-green-800">
                        {result.successCount}/{result.totalRows}
                      </Badge>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Partial Success Summary */}
              {!result.success && result.successCount > 0 && (
                <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-yellow-800 dark:text-yellow-200">
                          Partial Import
                        </p>
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                          Imported {result.successCount} of {result.totalRows} rows.{' '}
                          {result.errorCount} row{result.errorCount !== 1 ? 's' : ''} had errors.
                        </p>
                      </div>
                      <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                        {result.successCount}/{result.totalRows}
                      </Badge>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Error Summary */}
              {!result.success && result.successCount === 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Import Failed</p>
                          <p className="text-sm">
                            {result.errorCount} error{result.errorCount !== 1 ? 's' : ''}{' '}
                            found in {result.totalRows} row
                            {result.totalRows !== 1 ? 's' : ''}.
                          </p>
                        </div>
                        <Badge variant="outline" className="bg-red-100 text-red-800">
                          {result.errorCount} error{result.errorCount !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Duplicate Phones */}
              {result.duplicatePhones && result.duplicatePhones.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium mb-2">Duplicate Phone Numbers Found:</p>
                    <ul className="list-disc list-inside text-sm space-y-1 max-h-24 overflow-y-auto">
                      {result.duplicatePhones.map((phone, index) => (
                        <li key={index}>{phone}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Error Details */}
              {result.errors && result.errors.length > 0 && (
                <div className="border rounded-lg p-4 max-h-80 overflow-y-auto bg-gray-50 dark:bg-gray-900">
                  <p className="font-medium mb-3 text-sm">Error Details:</p>
                  <div className="space-y-2">
                    {result.errors.slice(0, 50).map((error, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 text-sm p-2 bg-white dark:bg-gray-800 rounded border"
                      >
                        <Badge variant="outline" className="mt-0.5">
                          Row {error.row}
                        </Badge>
                        <div className="flex-1">
                          {error.field && (
                            <span className="font-medium text-red-600 dark:text-red-400">
                              {error.field}:{' '}
                            </span>
                          )}
                          <span className="text-gray-700 dark:text-gray-300">
                            {error.message}
                          </span>
                        </div>
                      </div>
                    ))}
                    {result.errors.length > 50 && (
                      <p className="text-sm text-gray-500 text-center pt-2">
                        ... and {result.errors.length - 50} more errors
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={!file || uploading || isParsing}>
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : isParsing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : previewData && previewData.length > 0 ? (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import {validRowCount} row{validRowCount !== 1 ? 's' : ''}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              {result.success || result.successCount > 0 ? (
                <Button onClick={() => handleOpenChange(false)}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Done
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFile(null);
                      setResult(null);
                      setProgress(0);
                      setPreviewData(null);
                      setIsParsing(false);
                    }}
                  >
                    Try Again
                  </Button>
                  <Button onClick={() => handleOpenChange(false)}>Close</Button>
                </>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
