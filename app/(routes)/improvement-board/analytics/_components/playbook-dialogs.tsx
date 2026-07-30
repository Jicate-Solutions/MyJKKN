'use client';

// Small dialogs for department playbooks:
//  • ViewPlaybookDialog  — a clean, read-only view of an approved playbook with
//    a "Print / Save as PDF" button (opens a self-contained print window, so no
//    PDF library or new server route is needed). When the artifact is an UPLOADED
//    policy document there is nothing to print: it shows the document card and
//    opens the real file through a short-lived signed URL instead.
//  • RequestChangesDialog — lets a manager type WHAT needs fixing; the note is
//    saved (fn_mba_dept_artifact_request_changes p_review_notes) and shown.
//  • HistoryDialog — every version, newest first. For a policy this is also the
//    document trail: each uploaded file with its date and who replaced it.
//  • UploadPolicyDialog — officers (CEO / CAO / EAO) put the department's real
//    policy document on file. That upload becomes the policy.

import { useCallback, useEffect, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Printer, History, FileUp, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { displayHolder } from './holder-display';

type ArtifactType = 'organogram' | 'sop' | 'workflow' | 'policy';

const LABEL: Record<ArtifactType, string> = {
  organogram: 'Organogram',
  sop: 'Standard Operating Procedure',
  workflow: 'Workflow',
  policy: 'Department Policy',
};

/** Documents an officer may put on file as the department policy. */
const POLICY_ACCEPT = '.pdf,.doc,.docx';
const POLICY_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Ask the server for a five-minute signed URL and open it. The bucket is private,
 * so there is no link to hand out — the URL is minted per click, for the person
 * clicking, after the server re-checks that they may see the document.
 */
export async function openPolicyDocument(areaId: string, versionId?: string): Promise<void> {
  const qs = new URLSearchParams({ area_id: areaId });
  if (versionId) qs.set('version_id', versionId);
  try {
    const res = await fetch(`/api/mba/dept-artifacts/policy-file?${qs.toString()}`);
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !json.url) {
      toast.error(`Couldn't open the document — ${json.error || 'please try again.'}`);
      return;
    }
    const w = window.open(json.url, '_blank', 'noopener,noreferrer');
    if (!w) {
      toast.error('Your browser blocked the document window. Please allow pop-ups and try again.');
    }
  } catch {
    toast.error("Couldn't open the document — please check your connection and try again.");
  }
}

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
function errText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    return str((e as { message?: unknown }).message);
  }
  return str(e);
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
      // displayHolder, not str: this dialog is the read-only view AND the source of
      // the printed PDF, so a raw "[Manager to complete]" here leaves the placeholder
      // on a document someone hands to an accreditor.
      b: [displayHolder(r.holder), r.reports_to ? `reports to ${str(r.reports_to)}` : '']
        .filter(Boolean)
        .join(' · '),
    }));
  }
  if (artifactType === 'sop') {
    return asArray(content.steps).map((s) => ({ a: str(s.title), b: str(s.detail) }));
  }
  if (artifactType === 'policy') {
    return asArray(content.clauses).map((c) => ({ a: str(c.title), b: str(c.text) }));
  }
  return asArray(content.stages).map((s) => ({ a: str(s.name), b: str(s.action) }));
}

/** True when this content describes an uploaded file rather than drafted items. */
function isUploadedDoc(content: Record<string, unknown>): boolean {
  return str(content.source) === 'upload' && str(content.file_name).trim() !== '';
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
  areaId,
  areaLabel,
  artifactType,
  content,
  open,
  onOpenChange,
}: {
  areaId: string;
  areaLabel: string;
  artifactType: ArtifactType;
  content: Record<string, unknown>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const rows = rowsFor(artifactType, content);
  const note = str(content.note);
  const uploaded = isUploadedDoc(content);

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
          <DialogDescription>
            {uploaded
              ? 'An uploaded document is on file. That document is the policy.'
              : 'Approved playbook — read only.'}
          </DialogDescription>
        </DialogHeader>
        {note && (
          <p className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700">
            {note}
          </p>
        )}
        {uploaded ? (
          <DocumentCard
            fileName={str(content.file_name)}
            uploadedAt={str(content.uploaded_at)}
            onOpen={() => void openPolicyDocument(areaId)}
          />
        ) : (
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
        )}
        <DialogFooter>
          {!uploaded && (
            <Button onClick={print} className="h-8 text-xs">
              <Printer className="mr-1 h-3.5 w-3.5" />
              Print / Save as PDF
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The "there is a real document here" card, used in the view + history dialogs. */
function DocumentCard({
  fileName,
  uploadedAt,
  supersededNote,
  onOpen,
}: {
  fileName: string;
  uploadedAt?: string;
  supersededNote?: string;
  onOpen: () => void;
}) {
  const when = uploadedAt ? new Date(uploadedAt) : null;
  const whenText = when && !Number.isNaN(when.getTime()) ? when.toLocaleString() : null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{fileName || 'Policy document'}</p>
        <p className="text-muted-foreground text-[11px]">
          {whenText ? `Uploaded ${whenText}` : 'Uploaded document'}
          {supersededNote ? ` · ${supersededNote}` : ''}
        </p>
      </div>
      <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={onOpen}>
        <ExternalLink className="mr-1 h-3 w-3" />
        Open
      </Button>
    </div>
  );
}

/**
 * Officers put the department's real policy document on file. This upload becomes
 * the policy — any AI draft that was there is kept in the history but is no longer
 * the record. The control is only rendered for people who hold
 * improvement.area_policy.approve, so nobody is shown a button the server refuses.
 */
export function UploadPolicyDialog({
  areaId,
  areaLabel,
  hasExisting,
  open,
  onOpenChange,
  onUploaded,
}: {
  areaId: string;
  areaLabel: string;
  hasExisting: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setNote('');
    }
  }, [open]);

  const submit = useCallback(async () => {
    if (!file) return;
    if (file.size > POLICY_MAX_BYTES) {
      toast.error('That document is larger than 10 MB.');
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set('area_id', areaId);
      body.set('file', file);
      if (note.trim()) body.set('note', note.trim());
      const res = await fetch('/api/mba/dept-artifacts/policy-upload', { method: 'POST', body });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok !== true) {
        // Keep the dialog open so the chosen file is not lost on a retry.
        toast.error(`Couldn't upload — ${json.error || 'please try again.'}`);
        return;
      }
      toast.success('Policy document saved. This document is now the policy.');
      onOpenChange(false);
      onUploaded();
    } catch {
      toast.error("Couldn't upload — please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [areaId, file, note, onOpenChange, onUploaded]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {hasExisting ? 'Replace the policy document' : 'Upload the policy document'} —{' '}
            {areaLabel}
          </DialogTitle>
          <DialogDescription>
            {hasExisting
              ? 'The new file becomes the policy. The current one is kept in the history with the date it was replaced.'
              : 'Once a real document is on file, that document is the policy — any AI draft becomes a starting point kept in the history.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Input
              type="file"
              accept={POLICY_ACCEPT}
              className="h-9 text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-muted-foreground mt-1 text-[11px]">
              PDF, DOC or DOCX, up to 10 MB. Stored privately — it is opened through a
              link that expires after five minutes.
            </p>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional: a one-line note, e.g. approved at the June board meeting."
            className="min-h-16 text-sm"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !file}>
            {busy ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <FileUp className="mr-1 h-3.5 w-3.5" />
                {hasExisting ? 'Replace' : 'Upload'}
              </>
            )}
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
  source: string | null;
  file_name: string | null;
  uploaded_at: string | null;
  superseded_at: string | null;
  superseded_by_name: string | null;
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
      .then(async (r) => {
        if (r.ok) return (await r.json()) as { versions?: VersionRow[] };
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || 'the history could not be loaded');
      })
      .then((j) => setVersions(j.versions ?? []))
      .catch((e: unknown) => {
        // An empty list and a failed load look identical otherwise.
        setVersions([]);
        toast.error(`Couldn't load the history — ${errText(e) || 'please try again.'}`);
      })
      .finally(() => setLoading(false));
  }, [open, areaId, artifactType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <History className="h-4 w-4" /> History — {areaLabel} · {LABEL[artifactType]}
          </DialogTitle>
          <DialogDescription>
            Every version, newest first. Nothing is deleted when a newer one lands.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No versions on record yet.</p>
        ) : (
          <ol className="space-y-2">
            {versions.map((v) => {
              const rows = rowsFor(artifactType, v.content);
              const isOpen = openId === v.id;
              const isDoc = v.source === 'upload' && Boolean(v.file_name);
              const live = !v.superseded_at;
              const replacedNote = v.superseded_at
                ? `replaced ${new Date(v.superseded_at).toLocaleDateString()}${
                    v.superseded_by_name ? ` by ${v.superseded_by_name}` : ''
                  }`
                : 'current';
              return (
                <li key={v.id} className="rounded-md border">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : v.id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                  >
                    <span className="font-medium">
                      Version {v.version}
                      {isDoc && (
                        <span className="text-muted-foreground ml-1.5 font-normal">
                          · {live ? 'current document' : 'replaced'}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {v.approved_at ? new Date(v.approved_at).toLocaleString() : '—'}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t px-3 py-2">
                      {isDoc ? (
                        <DocumentCard
                          fileName={v.file_name ?? ''}
                          uploadedAt={v.uploaded_at ?? undefined}
                          supersededNote={replacedNote}
                          onOpen={() => void openPolicyDocument(areaId, v.id)}
                        />
                      ) : (
                        <ol className="space-y-1 text-sm">
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
                          {rows.length === 0 && (
                            <li className="text-muted-foreground">No items.</li>
                          )}
                        </ol>
                      )}
                    </div>
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
            history
            {artifactType === 'policy' ? ' and every uploaded document on record' : ''}. This
            cannot be undone.
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
