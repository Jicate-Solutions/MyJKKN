'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';

// Key used to hand off parsed XLSX data from the list page to the
// new-syllabus form. The form checks sessionStorage on mount and prefills.
export const IMPORT_HANDOFF_KEY = 'bos.syllabus.import.handoff';

/**
 * Header action bar for /bos/syllabus.
 *
 * Three buttons:
 *  - Download Template  → /api/bos/syllabus/template
 *  - Import             → upload XLSX/PDF/DOCX → POST /api/bos/syllabus/extract
 *                         → stash parsed data in sessionStorage
 *                         → navigate to /bos/syllabus/new (form prefills)
 *  - New Syllabus       → /bos/syllabus/new
 */
export function SyllabusActions() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();

  const canCreate = isSuperAdmin || canAccess('academic.bos-syllabus', 'create');

  const handleDownloadTemplate = async () => {
    const tid = toast.loading('Preparing template…');
    try {
      const res = await fetch('/api/bos/syllabus/template');
      if (!res.ok) throw new Error('Failed to download template');
      const blob = await res.blob();
      triggerBrowserDownload(blob, 'syllabus-template.xlsx');
      toast.success('Template downloaded', { id: tid });
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    }
  };

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const tid = toast.loading('Extracting syllabus from file…');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/bos/syllabus/extract', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Extraction failed');

      // Hand off parsed data + warnings to the new-syllabus form via
      // sessionStorage. Using sessionStorage (not query params) because the
      // payload can be 50KB+.
      sessionStorage.setItem(IMPORT_HANDOFF_KEY, JSON.stringify(json));

      const counts = json.summary as Record<string, number>;
      const warnings = (json.warnings ?? []) as unknown[];
      const parts: string[] = [];
      if (counts.objectives) parts.push(`${counts.objectives} objectives`);
      if (counts.clos) parts.push(`${counts.clos} COs`);
      if (counts.units) parts.push(`${counts.units} units`);
      if (counts.po_mapping_rows) parts.push(`${counts.po_mapping_rows} CO mappings`);

      const summaryMsg = parts.length > 0
        ? `Imported ${parts.join(', ')}.`
        : 'No sections found.';
      const warningSuffix = warnings.length > 0
        ? ` ${warnings.length} issue${warnings.length === 1 ? '' : 's'} — review on next screen.`
        : '';

      toast.success(`${summaryMsg}${warningSuffix} Review and save.`, { id: tid });
      router.push('/bos/syllabus/new');
    } catch (err) {
      toast.error((err as Error).message, { id: tid });
    } finally {
      setIsImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <input
        ref={fileRef}
        type='file'
        accept='.pdf,.docx,.xlsx,.xls'
        onChange={handleImportFile}
        disabled={isImporting}
        className='hidden'
      />

      <Button
        variant='outline'
        size='sm'
        onClick={handleDownloadTemplate}
        className='gap-2'
      >
        <FileSpreadsheet className='h-4 w-4' />
        Download Template
      </Button>

      {canCreate && (
        <Button
          variant='outline'
          size='sm'
          onClick={() => fileRef.current?.click()}
          disabled={isImporting}
          className='gap-2'
        >
          {isImporting
            ? <Loader2 className='h-4 w-4 animate-spin' />
            : <Upload className='h-4 w-4' />}
          Import
        </Button>
      )}

      {canCreate && (
        <Button
          size='sm'
          onClick={() => router.push('/bos/syllabus/new')}
          className='gap-2'
        >
          <Plus className='h-4 w-4' />
          New Syllabus
        </Button>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseFilename(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/filename="([^"]+)"/);
  return m ? m[1] : null;
}

/**
 * Per-row "Export to Excel" helper used by the row-actions dropdown.
 */
export async function exportSyllabusToXlsx(
  syllabusId: string,
  courseCode?: string,
) {
  const tid = toast.loading(`Exporting ${courseCode ?? 'syllabus'}…`);
  try {
    const res = await fetch(`/api/bos/syllabus/${syllabusId}/export-xlsx`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'Failed to export');
    }
    const blob = await res.blob();
    const filename =
      parseFilename(res.headers.get('Content-Disposition')) ??
      `${courseCode ?? 'syllabus'}.xlsx`;
    triggerBrowserDownload(blob, filename);
    toast.success('Export downloaded', { id: tid });
  } catch (e) {
    toast.error((e as Error).message, { id: tid });
  }
}
