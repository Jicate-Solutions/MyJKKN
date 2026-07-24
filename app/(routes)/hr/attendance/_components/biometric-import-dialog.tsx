'use client';

import { useState } from 'react';
import { Upload, CheckCircle2, AlertCircle, FileSpreadsheet, UserX, HelpCircle } from 'lucide-react';
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

interface SkippedStaff {
  code: string;
  name: string;
  role: string | null;
  days: number;
}

interface ImportReport {
  success: boolean;
  total_punches: number;
  total_punch_days: number;
  employees_in_file: number;
  loaded: number;
  faculty_matched: number;
  non_faculty_skipped: SkippedStaff[];
  unmatched_codes: string[];
  message?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

export function BiometricImportDialog({ open, onOpenChange, onImportComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setFile(null);
      setReport(null);
      setErrorMsg(null);
      setProgress(0);
    }
    onOpenChange(next);
  };

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (!f.name.endsWith('.xlsx')) {
      toast.error('Please upload the biometric .xlsx export.');
      return;
    }
    setFile(f);
    setReport(null);
    setErrorMsg(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(15);
    setErrorMsg(null);
    setReport(null);
    try {
      const body = new FormData();
      body.append('file', file);
      setProgress(45);
      const res = await fetch('/api/hr/attendance/import', { method: 'POST', body });
      setProgress(85);
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json?.message || json?.error || 'Import failed.');
        toast.error(json?.message || json?.error || 'Import failed.');
      } else {
        setReport(json as ImportReport);
        toast.success(json?.message || 'Import complete.');
        onImportComplete?.();
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Network error';
      setErrorMsg(m);
      toast.error(m);
    } finally {
      setProgress(100);
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import biometric punches</DialogTitle>
          <DialogDescription>
            Upload the biometric export (.xlsx). Each row is one punch; days are matched to faculty/HOD by
            Employee&nbsp;Id and loaded as present. Biometric is the system of record — a real punch always wins.
          </DialogDescription>
        </DialogHeader>

        {!report && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); pickFile(e.dataTransfer.files?.[0] ?? null); }}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
            }`}
          >
            <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
            {file ? (
              <p className="text-sm font-medium">{file.name}</p>
            ) : (
              <>
                <p className="text-sm">Drag &amp; drop the .xlsx here, or</p>
                <label className="cursor-pointer text-sm font-medium text-primary underline">
                  browse
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </>
            )}
          </div>
        )}

        {uploading && <Progress value={progress} className="mt-2" />}

        {errorMsg && (
          <Alert variant="destructive" className="mt-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}

        {report && (
          <div className="space-y-3">
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>
                Loaded <strong>{report.loaded}</strong> faculty/HOD punch-day(s) for{' '}
                <strong>{report.faculty_matched}</strong> employee(s) — from {report.total_punches} punches across{' '}
                {report.total_punch_days} day(s), {report.employees_in_file} employee(s) in file.
              </AlertDescription>
            </Alert>

            {report.non_faculty_skipped.length > 0 && (
              <div className="rounded-md border p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <UserX className="h-4 w-4 text-amber-600" />
                  Skipped — not faculty/HOD ({report.non_faculty_skipped.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {report.non_faculty_skipped.map((s) => (
                    <Badge key={s.code} variant="secondary" title={`${s.name || '—'} · ${s.role || 'no role'} · ${s.days}d`}>
                      {s.code}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {report.unmatched_codes.length > 0 && (
              <div className="rounded-md border p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <HelpCircle className="h-4 w-4 text-red-600" />
                  Unmatched codes — no staff record ({report.unmatched_codes.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {report.unmatched_codes.map((c) => (
                    <Badge key={c} variant="outline">{c}</Badge>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  These Employee Ids have no matching staff record. Send them to HR to link, then re-import.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {report ? (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={uploading}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={!file || uploading}>
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? 'Importing…' : 'Import'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
