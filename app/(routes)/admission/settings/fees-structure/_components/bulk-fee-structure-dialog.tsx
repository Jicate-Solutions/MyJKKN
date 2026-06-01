'use client';
// bulk-fee-structure-dialog.tsx — file upload + per-row error report. Shared by
// the Bulk Create and Export-for-Edit flows (both POST to /import).
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, UploadCloud, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

interface ImportResult {
  created: number;
  updated: number;
  failed: Array<{ row: number; name: string; error: string }>;
}

export function BulkFeeStructureDialog({
  open, onOpenChange, onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => { setFile(null); setResult(null); };

  const handleUpload = async () => {
    if (!file || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admission/fees-structure/import', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Import failed');
      setResult(json as ImportResult);
      const ok = (json.created ?? 0) + (json.updated ?? 0);
      if (ok > 0) { toast.success(`${json.created} created, ${json.updated} updated`); onImported(); }
      if ((json.failed?.length ?? 0) > 0) toast.error(`${json.failed.length} row(s) had errors`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Import failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Import Fee Structures</DialogTitle>
          <DialogDescription>
            Upload a filled template (or an edited export). Rows with a blank
            <strong> Fee Structure ID</strong> are created; rows with an ID are updated.
            Valid rows are saved even if others fail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />

          {result && (
            <div className="rounded-md border p-3 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {result.created} created · {result.updated} updated
              </div>
              {result.failed.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-destructive font-medium">
                    <AlertTriangle className="h-4 w-4" /> {result.failed.length} failed
                  </div>
                  <div className="max-h-56 overflow-auto rounded border divide-y">
                    {result.failed.map((f) => (
                      <div key={f.row} className="p-2 text-xs">
                        <span className="font-mono text-muted-foreground">Row {f.row}</span>
                        {f.name ? ` · ${f.name}` : ''} — <span className="text-destructive">{f.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Close</Button>
          <Button onClick={handleUpload} disabled={!file || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-1" />}
            Upload &amp; Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
