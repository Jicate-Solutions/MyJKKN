'use client';

// Bulk import dialog for external marathon registrations.
// Supports Excel (.xlsx) and CSV file upload with client-side validation,
// per-row error highlighting, preview, and import.

import { useCallback, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Loader2,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { useBulkRegisterParticipants } from '@/hooks/events/marathon/use-marathon-registrations';
import type { EventCategory } from '@/types/events';

// ============================================================================
// Types
// ============================================================================

type ImportPhase = 'upload' | 'preview' | 'importing' | 'result';

interface RowError {
  field: string;
  message: string;
}

interface ValidatedRow {
  raw: Record<string, unknown>;
  rowNum: number;
  name: string;
  phone: string;
  email: string;
  age: string;
  gender: string;
  category: string;
  institution: string;
  paymentStatus: string;
  errors: RowError[];
  isValid: boolean;
}

interface ImportResult {
  total: number;
  success: number;
  skipped: number;
  failed: number;
  errors: { row: number; field: string; message: string }[];
  registrations: { row: number; bib_number: string; name: string }[];
}

// ============================================================================
// Field extraction helper
// ============================================================================

function getField(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== '') return String(v).trim();
  }
  return '';
}

// ============================================================================
// Client-side validation
// ============================================================================

function validateRowsClientSide(
  rows: Record<string, unknown>[],
  validCategoryCodes: string[]
): ValidatedRow[] {
  const seenPhones = new Set<string>();

  return rows.map((raw, i) => {
    const errors: RowError[] = [];
    const rowNum = i + 2;

    const name = getField(raw, 'participant_name', 'Name *', 'Name');
    const phone = getField(raw, 'participant_phone', 'Phone *', 'Phone').replace(/\D/g, '');
    const email = getField(raw, 'participant_email', 'Email');
    const ageStr = getField(raw, 'participant_age', 'Age');
    const age = ageStr ? Number(ageStr) : undefined;
    const gender = getField(raw, 'participant_gender', 'Gender').toLowerCase();
    const category = getField(raw, 'category_code', 'Category Code *', 'Category Code').toUpperCase();
    const institution = getField(raw, 'institution_name', 'Institution / Organization');
    const paymentStatus = getField(raw, 'payment_status', 'Payment Status').toLowerCase();
    const paymentAmount = getField(raw, 'payment_amount', 'Amount Paid');
    const paymentMethod = getField(raw, 'payment_method', 'Payment Method').toLowerCase();

    // Required fields
    if (!name || name.length < 2) {
      errors.push({ field: 'Name', message: 'Required (min 2 characters)' });
    }

    if (!phone || phone.length < 10 || phone.length > 15) {
      errors.push({ field: 'Phone', message: 'Required (10-15 digits)' });
    } else if (seenPhones.has(phone)) {
      errors.push({ field: 'Phone', message: 'Duplicate phone number in file' });
    }
    if (phone) seenPhones.add(phone);

    if (!category) {
      errors.push({ field: 'Category', message: 'Required' });
    } else if (!validCategoryCodes.includes(category)) {
      errors.push({ field: 'Category', message: `Invalid. Use: ${validCategoryCodes.join(', ')}` });
    }

    // Optional fields
    if (age !== undefined && (isNaN(age) || age < 1 || age > 150)) {
      errors.push({ field: 'Age', message: 'Must be 1-150' });
    }

    if (gender && !['male', 'female', 'other'].includes(gender)) {
      errors.push({ field: 'Gender', message: 'Must be male/female/other' });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ field: 'Email', message: 'Invalid email format' });
    }

    // Payment validation
    const validPaymentStatuses = ['paid', 'pending', 'not_required', 'waived'];
    if (paymentStatus && !validPaymentStatuses.includes(paymentStatus)) {
      errors.push({ field: 'Payment Status', message: `Use: ${validPaymentStatuses.join(', ')}` });
    }

    if (paymentAmount && (isNaN(Number(paymentAmount)) || Number(paymentAmount) < 0)) {
      errors.push({ field: 'Amount', message: 'Must be a positive number' });
    }

    const validPaymentMethods = ['cash', 'upi', 'bank_transfer', 'card', 'online'];
    if (paymentMethod && !validPaymentMethods.includes(paymentMethod)) {
      errors.push({ field: 'Payment Method', message: `Use: ${validPaymentMethods.join(', ')}` });
    }

    return {
      raw,
      rowNum,
      name,
      phone,
      email,
      age: ageStr,
      gender,
      category,
      institution,
      paymentStatus,
      errors,
      isValid: errors.length === 0,
    };
  });
}

// ============================================================================
// Error indicator for cells
// ============================================================================

function CellWithError({
  value,
  fieldName,
  errors,
}: {
  value: string;
  fieldName: string;
  errors: RowError[];
}) {
  const fieldError = errors.find((e) => e.field === fieldName);
  if (!fieldError) {
    return <span>{value || <span className="text-muted-foreground">-</span>}</span>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-0.5 text-destructive font-medium cursor-help">
            {value || '(empty)'}
            <AlertTriangle className="h-3 w-3 shrink-0" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          {fieldError.message}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================================================
// Component
// ============================================================================

export function BulkImportDialog({
  eventId,
  categories,
  open,
  onOpenChange,
  onSuccess,
}: {
  eventId: string;
  categories: EventCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [phase, setPhase] = useState<ImportPhase>('upload');
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [parseError, setParseError] = useState('');

  const bulkMutation = useBulkRegisterParticipants();

  const categoryCodes = useMemo(
    () => categories.map((c) => c.code?.toUpperCase()).filter(Boolean) as string[],
    [categories]
  );

  // Client-side validation runs on preview
  const validatedRows = useMemo(
    () => (parsedRows.length > 0 ? validateRowsClientSide(parsedRows, categoryCodes) : []),
    [parsedRows, categoryCodes]
  );

  const validCount = useMemo(() => validatedRows.filter((r) => r.isValid).length, [validatedRows]);
  const errorCount = useMemo(() => validatedRows.filter((r) => !r.isValid).length, [validatedRows]);
  const totalErrors = useMemo(
    () => validatedRows.reduce((sum, r) => sum + r.errors.length, 0),
    [validatedRows]
  );

  const resetState = useCallback(() => {
    setPhase('upload');
    setFileName('');
    setParsedRows([]);
    setResult(null);
    setParseError('');
  }, []);

  const handleClose = useCallback(() => {
    if (phase === 'importing') return;
    if (result?.success) onSuccess();
    resetState();
    onOpenChange(false);
  }, [phase, result, onSuccess, resetState, onOpenChange]);

  // ── File parsing ────────────────────────────────────────────────

  const parseFile = useCallback((file: File) => {
    setParseError('');

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setParseError('File is too large (max 5MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        // Filter out empty rows
        const filtered = (jsonRows as Record<string, unknown>[]).filter((row) => {
          const name = getField(row, 'participant_name', 'Name *', 'Name');
          return name.length > 0;
        });

        if (filtered.length === 0) {
          setParseError('No data rows found in the file. Make sure row 1 has headers.');
          return;
        }

        if (filtered.length > 1000) {
          setParseError(`File has ${filtered.length} rows. Maximum is 1000 per import.`);
          return;
        }

        setParsedRows(filtered);
        setFileName(file.name);
        setPhase('preview');
      } catch {
        setParseError('Failed to parse file. Make sure it is a valid Excel or CSV file.');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.csv')) {
        setParseError('Only .xlsx and .csv files are supported');
        return;
      }
      parseFile(file);
    },
    [parseFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) parseFile(file);
      e.target.value = '';
    },
    [parseFile]
  );

  // ── Import execution ───────────────────────────────────────────

  const handleImport = useCallback(async () => {
    setPhase('importing');
    try {
      const importResult = await bulkMutation.mutateAsync({
        eventId,
        rows: parsedRows,
        categoryCodes,
      });
      setResult(importResult);
      setPhase('result');
    } catch {
      setPhase('preview');
    }
  }, [eventId, parsedRows, categoryCodes, bulkMutation]);

  // ── Template download ──────────────────────────────────────────

  const handleDownloadTemplate = useCallback(() => {
    window.open(`/api/events/marathon/${eventId}/bulk-register?action=template`, '_blank');
  }, [eventId]);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {phase === 'upload' && 'Import External Registrations'}
            {phase === 'preview' && 'Review & Validate'}
            {phase === 'importing' && 'Importing...'}
            {phase === 'result' && 'Import Complete'}
          </DialogTitle>
          <DialogDescription>
            {phase === 'upload' && 'Upload an Excel or CSV file with external participant data.'}
            {phase === 'preview' && `${parsedRows.length} rows found in ${fileName}.`}
            {phase === 'importing' && 'Please wait while registrations are being created...'}
            {phase === 'result' && 'Import has finished. See the results below.'}
          </DialogDescription>
        </DialogHeader>

        {/* ── Upload Phase ─────────────────────────────────────────── */}
        {phase === 'upload' && (
          <div className="space-y-4 py-2">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? 'border-primary bg-primary/5'
                  : parseError
                  ? 'border-destructive/50 bg-destructive/5'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleFileDrop}
            >
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm font-medium mb-1">
                Drag & drop your Excel or CSV file here
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Supports .xlsx and .csv files (max 1000 rows, 5MB)
              </p>
              <label>
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button variant="outline" size="sm" asChild>
                  <span className="cursor-pointer">
                    <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                    Browse Files
                  </span>
                </Button>
              </label>
            </div>

            {/* Parse error message */}
            {parseError && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {parseError}
              </div>
            )}

            <div className="flex items-center justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={handleDownloadTemplate}
              >
                <Download className="h-4 w-4" />
                Download Import Template
              </Button>
            </div>
          </div>
        )}

        {/* ── Preview Phase with Validation ─────────────────────────── */}
        {phase === 'preview' && (
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            {/* File info + validation summary */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{fileName}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={resetState}>
                <X className="h-4 w-4 mr-1" /> Change File
              </Button>
            </div>

            {/* Validation summary bar */}
            <div className="flex items-center gap-3 px-3 py-2 rounded-md border bg-muted/30 text-xs">
              {errorCount === 0 ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-green-500 shrink-0" />
                  <span className="text-green-700 dark:text-green-400 font-medium">
                    All {validCount} rows passed validation
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>
                    <span className="font-medium text-green-600 dark:text-green-400">{validCount} valid</span>
                    {' · '}
                    <span className="font-medium text-destructive">{errorCount} with errors ({totalErrors} issues)</span>
                  </span>
                </>
              )}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground ml-auto cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs max-w-[250px]">
                    Rows with errors will be skipped during import.
                    Hover over red cells to see the error details.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Data table with inline validation */}
            <ScrollArea className="flex-1 max-h-[320px] border rounded-md">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium w-8">#</th>
                      <th className="px-2 py-1.5 text-center font-medium w-6"></th>
                      <th className="px-2 py-1.5 text-left font-medium">Name</th>
                      <th className="px-2 py-1.5 text-left font-medium">Phone</th>
                      <th className="px-2 py-1.5 text-left font-medium">Category</th>
                      <th className="px-2 py-1.5 text-left font-medium">Institution</th>
                      <th className="px-2 py-1.5 text-left font-medium">Gender</th>
                      <th className="px-2 py-1.5 text-left font-medium">Age</th>
                      <th className="px-2 py-1.5 text-left font-medium">Email</th>
                      <th className="px-2 py-1.5 text-left font-medium">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {validatedRows.slice(0, 100).map((row) => (
                      <tr
                        key={row.rowNum}
                        className={`${
                          row.isValid
                            ? 'hover:bg-muted/30'
                            : 'bg-destructive/5 hover:bg-destructive/10'
                        }`}
                      >
                        <td className="px-2 py-1 text-muted-foreground">{row.rowNum - 1}</td>
                        <td className="px-2 py-1 text-center">
                          {row.isValid ? (
                            <CheckCircle2 className="h-3 w-3 text-green-500 inline" />
                          ) : (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <XCircle className="h-3 w-3 text-destructive inline cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="right" className="text-xs max-w-[250px]">
                                  <div className="space-y-0.5">
                                    {row.errors.map((e, i) => (
                                      <div key={i}>
                                        <span className="font-medium">{e.field}:</span> {e.message}
                                      </div>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </td>
                        <td className="px-2 py-1 font-medium max-w-[130px] truncate">
                          <CellWithError value={row.name} fieldName="Name" errors={row.errors} />
                        </td>
                        <td className="px-2 py-1 font-mono">
                          <CellWithError value={row.phone} fieldName="Phone" errors={row.errors} />
                        </td>
                        <td className="px-2 py-1">
                          {row.errors.some((e) => e.field === 'Category') ? (
                            <CellWithError value={row.category} fieldName="Category" errors={row.errors} />
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              {row.category || '-'}
                            </Badge>
                          )}
                        </td>
                        <td className="px-2 py-1 truncate max-w-[110px]">
                          {row.institution || <span className="text-muted-foreground">-</span>}
                        </td>
                        <td className="px-2 py-1">
                          <CellWithError value={row.gender} fieldName="Gender" errors={row.errors} />
                        </td>
                        <td className="px-2 py-1">
                          <CellWithError value={row.age} fieldName="Age" errors={row.errors} />
                        </td>
                        <td className="px-2 py-1 truncate max-w-[120px]">
                          <CellWithError value={row.email} fieldName="Email" errors={row.errors} />
                        </td>
                        <td className="px-2 py-1">
                          {row.errors.some((e) => e.field === 'Payment Status' || e.field === 'Amount' || e.field === 'Payment Method') ? (
                            <CellWithError
                              value={row.paymentStatus}
                              fieldName={
                                row.errors.find((e) => e.field === 'Payment Status')?.field ??
                                row.errors.find((e) => e.field === 'Amount')?.field ??
                                'Payment Method'
                              }
                              errors={row.errors}
                            />
                          ) : row.paymentStatus ? (
                            <Badge
                              variant={row.paymentStatus === 'paid' ? 'default' : row.paymentStatus === 'pending' ? 'outline' : 'secondary'}
                              className="text-[10px]"
                            >
                              {row.paymentStatus}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validatedRows.length > 100 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Showing first 100 of {validatedRows.length} rows
                  </p>
                )}
              </div>
            </ScrollArea>

            {/* Error details panel (only when errors exist) */}
            {errorCount > 0 && (
              <ScrollArea className="max-h-[120px] border border-destructive/20 rounded-md bg-destructive/5">
                <div className="p-2 space-y-0.5">
                  <p className="text-xs font-medium text-destructive px-1 mb-1">
                    {totalErrors} validation error{totalErrors !== 1 ? 's' : ''} in {errorCount} row{errorCount !== 1 ? 's' : ''}
                  </p>
                  {validatedRows
                    .filter((r) => !r.isValid)
                    .slice(0, 30)
                    .flatMap((r) =>
                      r.errors.map((err, i) => (
                        <div
                          key={`${r.rowNum}-${i}`}
                          className="flex items-start gap-2 text-xs py-0.5 px-1"
                        >
                          <span className="text-muted-foreground shrink-0 w-10">Row {r.rowNum - 1}</span>
                          <Badge variant="outline" className="text-[10px] shrink-0">{err.field}</Badge>
                          <span className="text-destructive">{err.message}</span>
                        </div>
                      ))
                    )}
                  {errorCount > 30 && (
                    <p className="text-xs text-muted-foreground px-1 pt-1">
                      ... and {errorCount - 30} more rows with errors
                    </p>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        )}

        {/* ── Importing Phase ──────────────────────────────────────── */}
        {phase === 'importing' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-sm font-medium">
                Importing {validCount} registration{validCount !== 1 ? 's' : ''}...
              </p>
              {errorCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {errorCount} invalid row{errorCount !== 1 ? 's' : ''} will be skipped
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Result Phase ─────────────────────────────────────────── */}
        {phase === 'result' && result && (
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card className={result.success > 0 ? 'border-green-200 dark:border-green-900' : ''}>
                <CardContent className="pt-3 pb-2 text-center">
                  <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-500" />
                  <div className="text-2xl font-bold text-green-600">{result.success}</div>
                  <div className="text-xs text-muted-foreground">Imported</div>
                </CardContent>
              </Card>
              <Card className={result.skipped > 0 ? 'border-amber-200 dark:border-amber-900' : ''}>
                <CardContent className="pt-3 pb-2 text-center">
                  <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-amber-500" />
                  <div className="text-2xl font-bold text-amber-600">{result.skipped}</div>
                  <div className="text-xs text-muted-foreground">Skipped (duplicates)</div>
                </CardContent>
              </Card>
              <Card className={result.failed > 0 ? 'border-red-200 dark:border-red-900' : ''}>
                <CardContent className="pt-3 pb-2 text-center">
                  <XCircle className="h-5 w-5 mx-auto mb-1 text-red-500" />
                  <div className="text-2xl font-bold text-red-600">{result.failed}</div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </CardContent>
              </Card>
            </div>

            {/* Successfully imported registrations */}
            {result.registrations.length > 0 && (
              <ScrollArea className="max-h-[150px] border border-green-200 dark:border-green-900 rounded-md bg-green-50/50 dark:bg-green-950/20">
                <div className="p-2 space-y-0.5">
                  <p className="text-xs font-medium text-green-700 dark:text-green-400 px-1 mb-1">
                    Created Registrations
                  </p>
                  {result.registrations.map((reg, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-0.5 px-1">
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0">{reg.bib_number}</Badge>
                      <span className="truncate">{reg.name}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {/* Errors/skipped details */}
            {result.errors.length > 0 && (
              <ScrollArea className="max-h-[150px] border rounded-md">
                <div className="p-2 space-y-0.5">
                  <p className="text-xs font-medium text-muted-foreground px-1 mb-1">
                    Issues ({result.errors.length})
                  </p>
                  {result.errors.map((err, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-xs py-0.5 px-1"
                    >
                      <span className="text-muted-foreground shrink-0 w-10">Row {err.row}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{err.field}</Badge>
                      <span className="text-destructive">{err.message}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────── */}
        <DialogFooter className="gap-2 sm:gap-0">
          {phase === 'preview' && (
            <>
              <Button variant="outline" onClick={resetState}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={validCount === 0}
                className="gap-1.5"
              >
                <Upload className="h-4 w-4" />
                Import {validCount} Registration{validCount !== 1 ? 's' : ''}
                {errorCount > 0 && (
                  <span className="text-xs opacity-75">
                    ({errorCount} skipped)
                  </span>
                )}
              </Button>
            </>
          )}
          {phase === 'result' && (
            <Button onClick={handleClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
