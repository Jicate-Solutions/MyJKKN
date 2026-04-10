'use client';

// Bulk import dialog for external marathon registrations.
// Supports Excel (.xlsx) and CSV file upload with preview, validation, and import.

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
  Loader2,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useBulkRegisterParticipants } from '@/hooks/events/marathon/use-marathon-registrations';
import type { EventCategory } from '@/types/events';

// ============================================================================
// Types
// ============================================================================

type ImportPhase = 'upload' | 'preview' | 'importing' | 'result';

interface ImportResult {
  total: number;
  success: number;
  skipped: number;
  failed: number;
  errors: { row: number; field: string; message: string }[];
  registrations: { row: number; bib_number: string; name: string }[];
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

  const bulkMutation = useBulkRegisterParticipants();

  const categoryCodes = useMemo(
    () => categories.map((c) => c.code?.toUpperCase()).filter(Boolean) as string[],
    [categories]
  );

  const resetState = useCallback(() => {
    setPhase('upload');
    setFileName('');
    setParsedRows([]);
    setResult(null);
  }, []);

  const handleClose = useCallback(() => {
    if (phase === 'importing') return; // Don't close during import
    if (result?.success) onSuccess();
    resetState();
    onOpenChange(false);
  }, [phase, result, onSuccess, resetState, onOpenChange]);

  // ── File parsing ────────────────────────────────────────────────

  const parseFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        // Filter out empty rows and sample rows (italic placeholder data)
        const filtered = (jsonRows as Record<string, unknown>[]).filter((row) => {
          const name = String(row['Name *'] ?? row['participant_name'] ?? row['Name'] ?? '').trim();
          return name.length > 0;
        });

        setParsedRows(filtered);
        setFileName(file.name);
        setPhase('preview');
      } catch {
        setParsedRows([]);
        setFileName('');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.csv'))) {
        parseFile(file);
      }
    },
    [parseFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) parseFile(file);
      e.target.value = ''; // Reset input
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
      setPhase('preview'); // Go back to preview on error
    }
  }, [eventId, parsedRows, categoryCodes, bulkMutation]);

  // ── Template download ──────────────────────────────────────────

  const handleDownloadTemplate = useCallback(() => {
    window.open(`/api/events/marathon/${eventId}/bulk-register?action=template`, '_blank');
  }, [eventId]);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {phase === 'upload' && 'Import External Registrations'}
            {phase === 'preview' && 'Preview Import Data'}
            {phase === 'importing' && 'Importing...'}
            {phase === 'result' && 'Import Complete'}
          </DialogTitle>
          <DialogDescription>
            {phase === 'upload' && 'Upload an Excel or CSV file with external participant data.'}
            {phase === 'preview' && `${parsedRows.length} rows found in ${fileName}. Review before importing.`}
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
                Supports .xlsx and .csv files (max 1000 rows)
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

        {/* ── Preview Phase ────────────────────────────────────────── */}
        {phase === 'preview' && (
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{fileName}</span>
                <Badge variant="secondary" className="text-xs">{parsedRows.length} rows</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={resetState}>
                <X className="h-4 w-4 mr-1" /> Change File
              </Button>
            </div>

            <ScrollArea className="flex-1 max-h-[350px] border rounded-md">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">#</th>
                      <th className="px-2 py-1.5 text-left font-medium">Name</th>
                      <th className="px-2 py-1.5 text-left font-medium">Phone</th>
                      <th className="px-2 py-1.5 text-left font-medium">Category</th>
                      <th className="px-2 py-1.5 text-left font-medium">Institution</th>
                      <th className="px-2 py-1.5 text-left font-medium">Gender</th>
                      <th className="px-2 py-1.5 text-left font-medium">Age</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsedRows.slice(0, 50).map((row, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                        <td className="px-2 py-1 font-medium truncate max-w-[150px]">
                          {String(row['Name *'] ?? row['participant_name'] ?? row['Name'] ?? '-')}
                        </td>
                        <td className="px-2 py-1 font-mono">
                          {String(row['Phone *'] ?? row['participant_phone'] ?? row['Phone'] ?? '-')}
                        </td>
                        <td className="px-2 py-1">
                          <Badge variant="outline" className="text-[10px]">
                            {String(row['Category Code *'] ?? row['category_code'] ?? row['Category Code'] ?? '-')}
                          </Badge>
                        </td>
                        <td className="px-2 py-1 truncate max-w-[120px]">
                          {String(row['Institution / Organization'] ?? row['institution_name'] ?? '-')}
                        </td>
                        <td className="px-2 py-1">
                          {String(row['Gender'] ?? row['participant_gender'] ?? '-')}
                        </td>
                        <td className="px-2 py-1">
                          {String(row['Age'] ?? row['participant_age'] ?? '-')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Showing first 50 of {parsedRows.length} rows
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* ── Importing Phase ──────────────────────────────────────── */}
        {phase === 'importing' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Importing {parsedRows.length} registrations...
            </p>
          </div>
        )}

        {/* ── Result Phase ─────────────────────────────────────────── */}
        {phase === 'result' && result && (
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-3 pb-2 text-center">
                  <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-500" />
                  <div className="text-2xl font-bold text-green-600">{result.success}</div>
                  <div className="text-xs text-muted-foreground">Imported</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-3 pb-2 text-center">
                  <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-amber-500" />
                  <div className="text-2xl font-bold text-amber-600">{result.skipped}</div>
                  <div className="text-xs text-muted-foreground">Skipped</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-3 pb-2 text-center">
                  <XCircle className="h-5 w-5 mx-auto mb-1 text-red-500" />
                  <div className="text-2xl font-bold text-red-600">{result.failed}</div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </CardContent>
              </Card>
            </div>

            {/* Errors list */}
            {result.errors.length > 0 && (
              <ScrollArea className="max-h-[200px] border rounded-md">
                <div className="p-2 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground px-1 mb-1">
                    Issues ({result.errors.length})
                  </p>
                  {result.errors.map((err, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-xs py-1 px-2 rounded bg-destructive/5"
                    >
                      <span className="text-muted-foreground shrink-0">Row {err.row}</span>
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
              <Button onClick={handleImport} disabled={parsedRows.length === 0}>
                <Upload className="h-4 w-4 mr-1.5" />
                Import {parsedRows.length} Registrations
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
