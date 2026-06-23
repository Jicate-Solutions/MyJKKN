'use client';

// components/events/shared/bulk-import-board.tsx
// Shared bulk roster/CSV import board for ANY event type (Events Platform Promotion PR7).
// Promoted from the marathon bulk-import dialog. Upload (or paste) a .xlsx/.csv roster, preview rows
// with inline validation, import, and see success/skipped/failed counts. Self-contained — drops into
// the shared <EventLogistics> "Bulk Import" tab. Read-only when canManage is false.

import { useCallback, useMemo, useState } from 'react';
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
  Info,
  ClipboardPaste,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  parseRosterFile,
  validateRosterRows,
  useEventCategoryCodes,
  useImportRoster,
  useDownloadRosterTemplate,
  type ValidatedRosterRow,
  type RosterRowError,
  type RosterImportResult,
} from '@/hooks/events/shared/use-event-bulk-register';

type ImportPhase = 'upload' | 'preview' | 'importing' | 'result';

// ── Inline cell error indicator ─────────────────────────────────────────────
function CellWithError({
  value,
  fieldName,
  errors,
}: {
  value: string;
  fieldName: string;
  errors: RosterRowError[];
}) {
  const fieldError = errors.find((e) => e.field === fieldName);
  if (!fieldError) {
    return <span>{value || <span className="text-muted-foreground">-</span>}</span>;
  }
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help items-center gap-0.5 font-medium text-destructive">
            {value || '(empty)'}
            <AlertTriangle className="h-3 w-3 shrink-0" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px] text-xs">
          {fieldError.message}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function BulkImportBoard({
  eventId,
  canManage = true,
}: {
  eventId: string;
  canManage?: boolean;
}) {
  const [phase, setPhase] = useState<ImportPhase>('upload');
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [result, setResult] = useState<RosterImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [parseError, setParseError] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const { data: categoryCodes = [] } = useEventCategoryCodes(eventId);
  const importMutation = useImportRoster();
  const downloadTemplate = useDownloadRosterTemplate();

  const validatedRows: ValidatedRosterRow[] = useMemo(
    () => (parsedRows.length > 0 ? validateRosterRows(parsedRows, categoryCodes) : []),
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
    setPasteText('');
  }, []);

  // ── File parse ────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setParseError('');
    const { rows, error } = await parseRosterFile(file);
    if (error) {
      setParseError(error);
      return;
    }
    setParsedRows(rows);
    setFileName(file.name);
    setPhase('preview');
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  const handleSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
      e.target.value = '';
    },
    [handleFile]
  );

  // ── Paste CSV ───────────────────────────────────────────────────────────────
  const handlePasteParse = useCallback(() => {
    setParseError('');
    try {
      const text = pasteText.trim();
      if (!text) {
        setParseError('Nothing pasted.');
        return;
      }
      const workbook = XLSX.read(text, { type: 'string' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
      const filtered = jsonRows.filter((row) => {
        for (const k of ['participant_name', 'Name *', 'Name']) {
          const v = row[k];
          if (v !== undefined && v !== null && String(v).trim() !== '') return true;
        }
        return false;
      });
      if (filtered.length === 0) {
        setParseError('No data rows found. The first line must be column headers.');
        return;
      }
      if (filtered.length > 1000) {
        setParseError(`Pasted ${filtered.length} rows. Maximum is 1000 per import.`);
        return;
      }
      setParsedRows(filtered);
      setFileName('Pasted data');
      setPasteOpen(false);
      setPhase('preview');
    } catch {
      setParseError('Could not parse the pasted data as CSV.');
    }
  }, [pasteText]);

  // ── Import ───────────────────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    setPhase('importing');
    try {
      const res = await importMutation.mutateAsync({ eventId, rows: parsedRows, categoryCodes });
      setResult(res);
      setPhase('result');
    } catch {
      setPhase('preview');
    }
  }, [eventId, parsedRows, categoryCodes, importMutation]);

  // ── Render ────────────────────────────────────────────────────────────────────
  if (!canManage) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        You don&apos;t have permission to import registrations for this event.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Bulk Import</h3>
          <p className="text-sm text-muted-foreground">
            Import a roster from Excel/CSV. Existing phone numbers are skipped automatically.
          </p>
        </div>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => downloadTemplate(eventId)}>
          <Download className="h-4 w-4" />
          Template
        </Button>
      </div>

      {/* ── Upload phase ────────────────────────────────────────────────────── */}
      {phase === 'upload' && (
        <div className="space-y-3">
          <div
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragActive
                ? 'border-primary bg-primary/5'
                : parseError
                ? 'border-destructive/50 bg-destructive/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="mb-1 text-sm font-medium">Drag &amp; drop your Excel or CSV file here</p>
            <p className="mb-3 text-xs text-muted-foreground">Supports .xlsx and .csv (max 1000 rows, 5MB)</p>
            <div className="flex items-center justify-center gap-2">
              <label>
                <input type="file" accept=".xlsx,.csv" className="hidden" onChange={handleSelect} />
                <Button variant="outline" size="sm" asChild>
                  <span className="cursor-pointer">
                    <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                    Browse Files
                  </span>
                </Button>
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setParseError('');
                  setPasteOpen((o) => !o);
                }}
              >
                <ClipboardPaste className="mr-1.5 h-4 w-4" />
                Paste CSV
              </Button>
            </div>
          </div>

          {pasteOpen && (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">
                Paste comma-separated rows. First line must be the headers (e.g. <code>Name *,Phone *,Category Code</code>).
              </p>
              <textarea
                className="h-32 w-full rounded-md border bg-background p-2 font-mono text-xs"
                placeholder={'Name *,Phone *,Email\nRavi Kumar,9876543210,ravi@example.com'}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setPasteOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handlePasteParse} disabled={!pasteText.trim()}>
                  Preview
                </Button>
              </div>
            </div>
          )}

          {parseError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {parseError}
            </div>
          )}
        </div>
      )}

      {/* ── Preview phase ───────────────────────────────────────────────────── */}
      {phase === 'preview' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{fileName}</span>
              <span className="text-xs text-muted-foreground">· {parsedRows.length} rows</span>
            </div>
            <Button variant="ghost" size="sm" onClick={resetState}>
              <X className="mr-1 h-4 w-4" /> Change
            </Button>
          </div>

          {/* Validation summary */}
          <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-xs">
            {errorCount === 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                <span className="font-medium text-green-700 dark:text-green-400">
                  All {validCount} rows passed validation
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                <span>
                  <span className="font-medium text-green-600 dark:text-green-400">{validCount} valid</span>
                  {' · '}
                  <span className="font-medium text-destructive">
                    {errorCount} with errors ({totalErrors} issues)
                  </span>
                </span>
              </>
            )}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="ml-auto h-3.5 w-3.5 cursor-help text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[250px] text-xs">
                  Rows with errors are skipped during import. Hover red cells for the reason.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Preview table */}
          <ScrollArea className="max-h-[320px] rounded-md border">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-muted/50">
                  <tr>
                    <th className="w-8 px-2 py-1.5 text-left font-medium">#</th>
                    <th className="w-6 px-2 py-1.5 text-center font-medium"></th>
                    <th className="px-2 py-1.5 text-left font-medium">Name</th>
                    <th className="px-2 py-1.5 text-left font-medium">Phone</th>
                    {categoryCodes.length > 0 && <th className="px-2 py-1.5 text-left font-medium">Category</th>}
                    <th className="px-2 py-1.5 text-left font-medium">Institution</th>
                    <th className="px-2 py-1.5 text-left font-medium">Gender</th>
                    <th className="px-2 py-1.5 text-left font-medium">Age</th>
                    <th className="px-2 py-1.5 text-left font-medium">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {validatedRows.slice(0, 100).map((row) => (
                    <tr
                      key={row.rowNum}
                      className={row.isValid ? 'hover:bg-muted/30' : 'bg-destructive/5 hover:bg-destructive/10'}
                    >
                      <td className="px-2 py-1 text-muted-foreground">{row.rowNum - 1}</td>
                      <td className="px-2 py-1 text-center">
                        {row.isValid ? (
                          <CheckCircle2 className="inline h-3 w-3 text-green-500" />
                        ) : (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <XCircle className="inline h-3 w-3 cursor-help text-destructive" />
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-[250px] text-xs">
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
                      <td className="max-w-[130px] truncate px-2 py-1 font-medium">
                        <CellWithError value={row.name} fieldName="Name" errors={row.errors} />
                      </td>
                      <td className="px-2 py-1 font-mono">
                        <CellWithError value={row.phone} fieldName="Phone" errors={row.errors} />
                      </td>
                      {categoryCodes.length > 0 && (
                        <td className="px-2 py-1">
                          {row.errors.some((e) => e.field === 'Category') ? (
                            <CellWithError value={row.category} fieldName="Category" errors={row.errors} />
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              {row.category || '-'}
                            </Badge>
                          )}
                        </td>
                      )}
                      <td className="max-w-[110px] truncate px-2 py-1">
                        {row.institution || <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-2 py-1">
                        <CellWithError value={row.gender} fieldName="Gender" errors={row.errors} />
                      </td>
                      <td className="px-2 py-1">
                        <CellWithError value={row.age} fieldName="Age" errors={row.errors} />
                      </td>
                      <td className="max-w-[120px] truncate px-2 py-1">
                        <CellWithError value={row.email} fieldName="Email" errors={row.errors} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {validatedRows.length > 100 && (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Showing first 100 of {validatedRows.length} rows
                </p>
              )}
            </div>
          </ScrollArea>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetState}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={validCount === 0} className="gap-1.5">
              <Upload className="h-4 w-4" />
              Import {validCount} row{validCount !== 1 ? 's' : ''}
              {errorCount > 0 && <span className="text-xs opacity-75">({errorCount} skipped)</span>}
            </Button>
          </div>
        </div>
      )}

      {/* ── Importing phase ─────────────────────────────────────────────────── */}
      {phase === 'importing' && (
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-center">
            <p className="text-sm font-medium">
              Importing {validCount} registration{validCount !== 1 ? 's' : ''}…
            </p>
            {errorCount > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {errorCount} invalid row{errorCount !== 1 ? 's' : ''} will be skipped
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Result phase ────────────────────────────────────────────────────── */}
      {phase === 'result' && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card className={result.success > 0 ? 'border-green-200 dark:border-green-900' : ''}>
              <CardContent className="pb-2 pt-3 text-center">
                <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-green-500" />
                <div className="text-2xl font-bold text-green-600">{result.success}</div>
                <div className="text-xs text-muted-foreground">Imported</div>
              </CardContent>
            </Card>
            <Card className={result.skipped > 0 ? 'border-amber-200 dark:border-amber-900' : ''}>
              <CardContent className="pb-2 pt-3 text-center">
                <AlertTriangle className="mx-auto mb-1 h-5 w-5 text-amber-500" />
                <div className="text-2xl font-bold text-amber-600">{result.skipped}</div>
                <div className="text-xs text-muted-foreground">Skipped (duplicates)</div>
              </CardContent>
            </Card>
            <Card className={result.failed > 0 ? 'border-red-200 dark:border-red-900' : ''}>
              <CardContent className="pb-2 pt-3 text-center">
                <XCircle className="mx-auto mb-1 h-5 w-5 text-red-500" />
                <div className="text-2xl font-bold text-red-600">{result.failed}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </CardContent>
            </Card>
          </div>

          {result.registrations.length > 0 && (
            <ScrollArea className="max-h-[150px] rounded-md border border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
              <div className="space-y-0.5 p-2">
                <p className="mb-1 px-1 text-xs font-medium text-green-700 dark:text-green-400">
                  Created Registrations
                </p>
                {result.registrations.map((reg, i) => (
                  <div key={i} className="flex items-center gap-2 px-1 py-0.5 text-xs">
                    <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                      {reg.bib_number}
                    </Badge>
                    <span className="truncate">{reg.name}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {result.errors.length > 0 && (
            <ScrollArea className="max-h-[150px] rounded-md border">
              <div className="space-y-0.5 p-2">
                <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">
                  Issues ({result.errors.length})
                </p>
                {result.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 px-1 py-0.5 text-xs">
                    <span className="w-10 shrink-0 text-muted-foreground">Row {err.row}</span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {err.field}
                    </Badge>
                    <span className="text-destructive">{err.message}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="flex justify-end">
            <Button onClick={resetState}>Import Another</Button>
          </div>
        </div>
      )}
    </div>
  );
}
