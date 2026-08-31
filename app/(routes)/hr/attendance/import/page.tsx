'use client';

// ============================================================================
// HR — Attendance › Import Biometric Punches
// Hosts the biometric importer for the attendance-reconciliation engine.
// The page is permissive; the /api/hr/attendance/import route enforces the
// admin/super-admin gate and returns an explicit 403 (surfaced in the dialog).
// ============================================================================

import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, Info, Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BiometricImportDialog } from '../_components/biometric-import-dialog';
import { BiometricPurgePanel } from '../_components/biometric-purge-panel';

export default function ImportBiometricPage() {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const downloadTemplate = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/hr/attendance/import/template');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || body?.error || `Template download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'biometric-attendance-import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Template download failed');
    } finally {
      setDownloading(false);
    }
  }, []);

  return (
    <ContentLayout title="Import Biometric Punches">
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Import Biometric Punches</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Load the biometric attendance export into MyJKKN so the reconciliation engine can find
            missed-punch days and propose corrections for HR review.
          </p>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Upload the export</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>• Upload the machine&rsquo;s <strong>Monthly Performance Report</strong> unchanged — <code className="rounded bg-muted px-1">.xls</code> or <code className="rounded bg-muted px-1">.xlsx</code>.</li>
              <li>• The machine must be configured with <strong>Dept.&nbsp;Name</strong> = institution code and <strong>CompName</strong> = institution name.</li>
              <li>• Unlinked enrolment codes are caught during the upload — the wizard offers a <strong>Link codes</strong> step so you never upload the file twice.</li>
              <li>• Present / half day / absent is <strong>recomputed from IN and OUT</strong> against the configured shift timings; the machine&rsquo;s own P/A is stored beside it, never in place of it.</li>
              <li>• Re-importing the same month overwrites cleanly — biometric is the system of record.</li>
            </ul>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Choose file &amp; import
              </Button>
              <Button variant="outline" onClick={downloadTemplate} disabled={downloading}>
                {downloading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Download template
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              The sample shows the exact layout the parser expects, documents the two fields to set
              on the machine, and lists every enrolment code currently linked to a staff member — so
              a mismatch can be spotted before an import rather than after.
            </p>
          </CardContent>
        </Card>

        {/* Renders nothing for anyone who is not a super admin. */}
        <BiometricPurgePanel />

        <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Importing never removes attendance. It only records present days from the biometric device.
            Missed-punch days that have corroborating work signals are proposed separately for HR to approve.
          </p>
        </div>
      </div>

      <BiometricImportDialog open={open} onOpenChange={setOpen} />
    </ContentLayout>
  );
}
