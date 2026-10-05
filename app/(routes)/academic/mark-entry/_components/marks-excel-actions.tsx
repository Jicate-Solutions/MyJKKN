'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import type { MarksImportIssue, MarksImportResult } from '@/lib/utils/mark-entry/marks-excel';

interface ActionsProps {
  /** Builds and downloads the template for the current screen. */
  onDownload: () => Promise<void>;
  /** Parses + validates the chosen file. Applying the rows is the caller's job. */
  onParse: (file: File) => Promise<MarksImportResult>;
  onImported: (result: MarksImportResult) => void;
  onIssues: (issues: MarksImportIssue[]) => void;
  /** Upload is hidden for view-only access; the template stays downloadable. */
  canUpload: boolean;
  disabled?: boolean;
}

/**
 * Template download + upload buttons, shared by the question-wise and direct
 * entry screens. Each screen supplies its own template builder and parser — the
 * two workbooks have different columns and different rules.
 */
export function MarksExcelActions({
  onDownload, onParse, onImported, onIssues, canUpload, disabled,
}: ActionsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'download' | 'upload' | null>(null);

  const handleDownload = async () => {
    setBusy('download');
    try {
      await onDownload();
    } catch {
      toast.error('Could not build the template');
    } finally {
      setBusy(null);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so choosing the SAME file again (after fixing it) still fires onChange.
    e.target.value = '';
    if (!file) return;
    setBusy('upload');
    try {
      const result = await onParse(file);
      if (result.issues.length) {
        onIssues(result.issues);
        toast.error(`Upload rejected — ${result.issues.length} problem(s). Nothing was imported.`);
        return;
      }
      onIssues([]);
      onImported(result);
      const absent = result.rows.filter((r) => r.isAbsent).length;
      toast.success(
        `Imported ${result.rows.length} learner(s)` +
          (absent ? ` (${absent} absent)` : '') +
          (result.blankRows ? ` · ${result.blankRows} blank row(s) left unchanged` : ''),
        { description: 'Review the grid, then press Save to store the marks.' }
      );
    } catch {
      toast.error('Could not read the file');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button
        variant='outline'
        size='sm'
        className='h-8'
        onClick={handleDownload}
        disabled={disabled || busy !== null}
        title='Excel template with this screen’s columns and rules built in'
      >
        {busy === 'download' ? (
          <Loader2 className='mr-1 h-4 w-4 animate-spin' />
        ) : (
          <FileSpreadsheet className='mr-1 h-4 w-4' />
        )}
        Template
      </Button>
      {canUpload && (
        <>
          <Button
            variant='outline'
            size='sm'
            className='h-8'
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy !== null}
            title='Upload the filled template — every rule is checked before anything is imported'
          >
            {busy === 'upload' ? (
              <Loader2 className='mr-1 h-4 w-4 animate-spin' />
            ) : (
              <Upload className='mr-1 h-4 w-4' />
            )}
            Upload
          </Button>
          <input
            ref={inputRef}
            type='file'
            accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            className='hidden'
            onChange={handleFile}
          />
        </>
      )}
    </>
  );
}

const SHOWN = 100;

/** Row-by-row list of what stopped an upload. Renders nothing when clean. */
export function MarksImportIssues({
  issues, onDismiss,
}: {
  issues: MarksImportIssue[];
  onDismiss: () => void;
}) {
  if (issues.length === 0) return null;
  return (
    <Alert variant='destructive'>
      <AlertTriangle className='h-4 w-4' />
      <AlertDescription>
        <div className='mb-1 flex items-start justify-between gap-2'>
          <p className='text-sm font-medium'>
            Upload rejected — {issues.length} problem{issues.length === 1 ? '' : 's'}. Nothing was
            imported; fix the file and upload it again.
          </p>
          <Button variant='ghost' size='sm' className='h-6 w-6 shrink-0 p-0' onClick={onDismiss} title='Dismiss'>
            <X className='h-3.5 w-3.5' />
          </Button>
        </div>
        <ul className='max-h-56 list-inside list-disc overflow-auto text-xs'>
          {issues.slice(0, SHOWN).map((issue, i) => (
            <li key={i}>
              {issue.row != null && <span className='font-medium'>Row {issue.row}</span>}
              {issue.register && <span className='font-mono'> · {issue.register}</span>}
              {(issue.row != null || issue.register) && ' — '}
              {issue.message}
            </li>
          ))}
        </ul>
        {issues.length > SHOWN && (
          <p className='mt-1 text-xs'>…and {issues.length - SHOWN} more.</p>
        )}
      </AlertDescription>
    </Alert>
  );
}
