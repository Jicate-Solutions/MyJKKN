'use client';

// Two small dialogs for department playbooks:
//  • ViewPlaybookDialog  — a clean, read-only view of an approved playbook with
//    a "Print / Save as PDF" button (opens a self-contained print window, so no
//    PDF library or new server route is needed).
//  • RequestChangesDialog — lets a manager type WHAT needs fixing; the note is
//    saved (fn_mba_dept_artifact_request_changes p_review_notes) and shown.

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Printer, History } from 'lucide-react';
import { toast } from 'react-hot-toast';

type ArtifactType = 'organogram' | 'sop' | 'workflow';

const LABEL: Record<ArtifactType, string> = {
  organogram: 'Organogram',
  sop: 'Standard Operating Procedure',
  workflow: 'Workflow',
};

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Normalised rows per type: [{ primary, secondary }] for a simple table view. */
function rowsFor(
  artifactType: ArtifactType,
  content: Record<string, unknown>,
): Array<{ a: string; b: string }> {
  if (artifactType === 'organogram') {
    return asArray(content.roles).map((r) => ({
      a: str(r.title),
      b: [str(r.holder), r.reports_to ? `reports to ${str(r.reports_to)}` : '']
        .filter(Boolean)
        .join(' · '),
    }));
  }
  if (artifactType === 'sop') {
    return asArray(content.steps).map((s) => ({ a: str(s.title), b: str(s.detail) }));
  }
  return asArray(content.stages).map((s) => ({ a: str(s.name), b: str(s.action) }));
}

function buildPrintHtml(
  areaLabel: string,
  artifactType: ArtifactType,
  content: Record<string, unknown>,
): string {
  const rows = rowsFor(artifactType, content);
  const note = str(content.note);
  const body = rows
    .map(
      (r, i) =>
        `<tr><td class="n">${i + 1}</td><td class="a">${esc(r.a)}</td><td class="b">${esc(r.b)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(areaLabel)} — ${esc(LABEL[artifactType])}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:40px;}
  h1{font-size:20px;margin:0 0 2px;} .sub{color:#666;font-size:13px;margin-bottom:16px;}
  .note{background:#f5f3ff;border:1px solid #ddd6fe;color:#5b21b6;padding:8px 10px;border-radius:6px;font-size:13px;margin-bottom:16px;}
  table{width:100%;border-collapse:collapse;font-size:13px;} td{border-bottom:1px solid #eee;padding:6px 8px;vertical-align:top;}
  td.n{color:#999;width:28px;} td.a{font-weight:600;width:40%;} .foot{margin-top:24px;color:#999;font-size:11px;}
</style></head><body>
  <h1>${esc(areaLabel)} — ${esc(LABEL[artifactType])}</h1>
  <div class="sub">Approved department playbook · JKKN</div>
  ${note ? `<div class="note">${esc(note)}</div>` : ''}
  <table><tbody>${body || '<tr><td colspan="3">No items.</td></tr>'}</tbody></table>
  <div class="foot">Generated from MyJKKN. Review before official use.</div>
  <script>window.onload=function(){window.print();}</script>
</body></html>`;
}

export function ViewPlaybookDialog({
  areaLabel,
  artifactType,
  content,
  open,
  onOpenChange,
}: {
  areaLabel: string;
  artifactType: ArtifactType;
  content: Record<string, unknown>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const rows = rowsFor(artifactType, content);
  const note = str(content.note);

  function print() {
    const w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) {
      // Pop-up blocked — tell the user how to enable printing instead of a silent no-op.
      toast.error('Your browser blocked the print window. Please allow pop-ups for this site and try again.');
      return;
    }
    w.document.write(buildPrintHtml(areaLabel, artifactType, content));
    w.document.close();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {areaLabel} · {LABEL[artifactType]}
          </DialogTitle>
          <DialogDescription>Approved playbook — read only.</DialogDescription>
        </DialogHeader>
        {note && (
          <p className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700">
            {note}
          </p>
        )}
        <ol className="space-y-1.5 text-sm">
          {rows.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted-foreground w-5 shrink-0 text-right">{i + 1}.</span>
              <span>
                <span className="font-medium">{r.a || '—'}</span>
                {r.b && <span className="text-muted-foreground"> — {r.b}</span>}
              </span>
            </li>
          ))}
          {rows.length === 0 && <li className="text-muted-foreground">No items.</li>}
        </ol>
        <DialogFooter>
          <Button onClick={print} className="h-8 text-xs">
            <Printer className="mr-1 h-3.5 w-3.5" />
            Print / Save as PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RequestChangesDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (note: string) => Promise<void> | void;
}) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await onSubmit(note.trim());
      setNote('');
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request changes</DialogTitle>
          <DialogDescription>
            Say what needs fixing. Whoever redrafts this will see your note.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Add the night-shift roles and remove the duplicate approver step."
          className="min-h-24 text-sm"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !note.trim()}>
            {saving ? 'Sending…' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface VersionRow {
  id: string;
  version: number;
  content: Record<string, unknown>;
  approved_at: string | null;
}

export function HistoryDialog({
  areaLabel,
  artifactType,
  areaId,
  open,
  onOpenChange,
}: {
  areaLabel: string;
  artifactType: ArtifactType;
  areaId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(
      `/api/mba/dept-artifacts/history?area_id=${encodeURIComponent(areaId)}&artifact_type=${artifactType}`,
    )
      .then((r) => (r.ok ? r.json() : { versions: [] }))
      .then((j: { versions?: VersionRow[] }) => setVersions(j.versions ?? []))
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [open, areaId, artifactType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <History className="h-4 w-4" /> History — {areaLabel} · {LABEL[artifactType]}
          </DialogTitle>
          <DialogDescription>Every approved version, newest first.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No approved versions yet.</p>
        ) : (
          <ol className="space-y-2">
            {versions.map((v) => {
              const rows = rowsFor(artifactType, v.content);
              const isOpen = openId === v.id;
              return (
                <li key={v.id} className="rounded-md border">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : v.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                  >
                    <span className="font-medium">Version {v.version}</span>
                    <span className="text-muted-foreground text-xs">
                      {v.approved_at ? new Date(v.approved_at).toLocaleString() : '—'}
                    </span>
                  </button>
                  {isOpen && (
                    <ol className="space-y-1 border-t px-3 py-2 text-sm">
                      {rows.map((r, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-muted-foreground w-5 shrink-0 text-right">
                            {i + 1}.
                          </span>
                          <span>
                            <span className="font-medium">{r.a || '—'}</span>
                            {r.b && <span className="text-muted-foreground"> — {r.b}</span>}
                          </span>
                        </li>
                      ))}
                      {rows.length === 0 && <li className="text-muted-foreground">No items.</li>}
                    </ol>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDeleteDialog({
  areaLabel,
  artifactType,
  open,
  onOpenChange,
  onConfirm,
}: {
  areaLabel: string;
  artifactType: ArtifactType;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this playbook?</DialogTitle>
          <DialogDescription>
            This removes the {LABEL[artifactType]} for {areaLabel}, including its saved
            history. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button className="bg-rose-600 hover:bg-rose-700" onClick={confirm} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
