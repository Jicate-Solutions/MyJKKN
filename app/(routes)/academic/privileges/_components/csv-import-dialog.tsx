'use client';

import { useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';

interface ParsedRow {
  learner_id: string;
  roll_number?: string;
  name?: string;
  valid: boolean;
  error?: string;
}

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (learnerIds: string[]) => void;
  isImporting: boolean;
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split('\n');
  if (lines.length === 0) return [];

  // Detect header
  const firstLine = lines[0].toLowerCase().trim();
  const hasHeader =
    firstLine.includes('learner_id') ||
    firstLine.includes('roll_number') ||
    firstLine.includes('id');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .map((line) => {
      const cols = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      const learnerId = cols[0] || '';
      const rollNumber = cols[1] || undefined;
      const name = cols[2] || undefined;

      // Basic UUID-like validation
      const isValidUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(learnerId);

      return {
        learner_id: learnerId,
        roll_number: rollNumber,
        name,
        valid: isValidUUID,
        error: !learnerId
          ? 'Empty row'
          : !isValidUUID
          ? 'Invalid learner ID format (expected UUID)'
          : undefined,
      };
    })
    .filter((row) => row.learner_id.length > 0);
}

export function CsvImportDialog({
  open,
  onOpenChange,
  onImport,
  isImporting,
}: CsvImportDialogProps) {
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>('');

  const validRows = parsedRows.filter((r) => r.valid);
  const invalidRows = parsedRows.filter((r) => !r.valid);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        setParsedRows(rows);
      };
      reader.readAsText(file);
    },
    []
  );

  const handleImport = () => {
    const ids = validRows.map((r) => r.learner_id);
    onImport(ids);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setParsedRows([]);
      setFileName('');
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Members from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file with learner IDs. Expected format: learner_id, roll_number (optional),
            name (optional)
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto">
          {/* File Upload */}
          <div className="flex items-center gap-3">
            <label
              htmlFor="csv-file"
              className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-muted-foreground/30 px-4 py-3 hover:bg-muted/50 transition-colors flex-1"
            >
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {fileName || 'Click to select CSV file'}
              </span>
              <input
                id="csv-file"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>

          {/* Summary */}
          {parsedRows.length > 0 && (
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{parsedRows.length} rows parsed</span>
              <Badge variant="default" className="bg-green-100 text-green-800">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {validRows.length} valid
              </Badge>
              {invalidRows.length > 0 && (
                <Badge variant="destructive">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {invalidRows.length} invalid
                </Badge>
              )}
            </div>
          )}

          {/* Preview Table */}
          {parsedRows.length > 0 && (
            <div className="rounded-md border max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Status</TableHead>
                    <TableHead>Learner ID</TableHead>
                    <TableHead>Roll Number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.slice(0, 50).map((row, i) => (
                    <TableRow key={i} className={!row.valid ? 'bg-red-50/50' : ''}>
                      <TableCell>
                        {row.valid ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.learner_id}</TableCell>
                      <TableCell className="text-sm">{row.roll_number || '-'}</TableCell>
                      <TableCell className="text-sm">{row.name || '-'}</TableCell>
                      <TableCell className="text-xs text-red-500">{row.error || ''}</TableCell>
                    </TableRow>
                  ))}
                  {parsedRows.length > 50 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                        ... and {parsedRows.length - 50} more rows
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isImporting}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={validRows.length === 0 || isImporting}>
            {isImporting ? 'Importing...' : `Import ${validRows.length} Members`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
