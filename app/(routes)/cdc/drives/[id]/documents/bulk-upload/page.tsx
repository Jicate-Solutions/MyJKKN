'use client';

/**
 * /cdc/drives/[id]/documents/bulk-upload — bulk offer-letter (and other letter) upload.
 *
 *   select files → PREVIEW (filenames only, nothing stored) → review:
 *     no match      → map a learner by hand, or remove
 *     multiple      → pick the learner, or remove
 *     existing file → Skip / Replace / Upload as new version
 *   → Confirm → one request per file with live progress → summary + error report.
 */

import Link from 'next/link';
import { use, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, Download, FileUp, Files, Info, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { useCdcDrive } from '@/hooks/cdc/use-cdc-drives';
import type { CdcBulkExistingMode, CdcBulkPreviewRow, CdcDocumentBatch, CdcDocumentType } from '@/types/cdc';
import { DriveStatusBadge } from '../../../_components/drive-status-badge';

const TYPE_LABEL: Record<CdcDocumentType, string> = {
  offer_letter: 'Offer Letter',
  appointment_letter: 'Appointment Letter',
  joining_letter: 'Joining Letter',
  internship_letter: 'Internship Letter',
  training_letter: 'Training Letter',
  salary_letter: 'Salary Letter',
  other: 'Other Document',
};
const ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png';
const CONCURRENCY = 3;
const NONE = '__none__';

interface Candidate {
  learner_id: string;
  name: string;
  register_number: string | null;
  roll_number: string | null;
}

type Outcome = 'uploaded' | 'replaced' | 'new_version' | 'skipped' | 'failed' | 'no_match' | 'multiple_match' | 'removed' | 'invalid';

interface WorkRow extends CdcBulkPreviewRow {
  key: string;
  /** Learner the file will go to (auto match, or the coordinator's manual choice). */
  target: string | null;
  mode: CdcBulkExistingMode;
  removed: boolean;
  outcome: Outcome | null;
  error: string | null;
}

const STATUS_BADGE: Record<CdcBulkPreviewRow['status'], { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  matched: { label: 'Matched', variant: 'default' },
  existing: { label: 'Existing file found', variant: 'secondary' },
  no_match: { label: 'No match', variant: 'destructive' },
  multiple_match: { label: 'Multiple match — review', variant: 'destructive' },
  duplicate_in_batch: { label: 'Duplicate in this upload', variant: 'outline' },
  invalid: { label: 'Not accepted', variant: 'outline' },
};
const OUTCOME_LABEL: Record<Outcome, string> = {
  uploaded: 'Uploaded',
  replaced: 'Replaced',
  new_version: 'New version',
  skipped: 'Skipped',
  failed: 'Failed',
  no_match: 'No match',
  multiple_match: 'Multiple match',
  removed: 'Removed',
  invalid: 'Not accepted',
};

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function CdcBulkDocumentUploadPage(props: { params: Promise<{ id: string }> }) {
  return (
    <PermissionGuard module="cdc.drives" action="edit">
      <Content {...props} />
    </PermissionGuard>
  );
}

function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const { data: detail } = useCdcDrive(id);
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<Map<string, File>>(new Map());

  const [docType, setDocType] = useState<CdcDocumentType>('offer_letter');
  const [rows, setRows] = useState<WorkRow[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pool, setPool] = useState<'selected' | 'participants' | 'willing' | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(0);
  const [batch, setBatch] = useState<CdcDocumentBatch | null>(null);

  const { data: history } = useQuery({
    queryKey: ['cdc-drive-document-batches', id],
    queryFn: async () => {
      const res = await fetch(`/api/cdc/drives/${id}/documents/bulk`);
      if (!res.ok) return { batches: [] as CdcDocumentBatch[] };
      return (await res.json()) as { batches: CdcDocumentBatch[] };
    },
  });

  const drive = detail?.data;
  const candidateOf = useMemo(() => new Map(candidates.map((c) => [c.learner_id, c])), [candidates]);
  const finished = !!batch && !uploading;

  // Learners targeted by more than one file → second one cannot go up.
  const targetCounts = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      if (!r.removed && r.target && r.status !== 'invalid') m.set(r.target, (m.get(r.target) ?? 0) + 1);
    });
    return m;
  }, [rows]);

  const ready = rows.filter((r) => !r.removed && r.status !== 'invalid' && r.target && (targetCounts.get(r.target) ?? 0) === 1 && !(r.existing && r.mode === 'skip'));
  const counts = {
    total: rows.length,
    matched: rows.filter((r) => r.status === 'matched').length,
    no_match: rows.filter((r) => r.status === 'no_match').length,
    multiple: rows.filter((r) => r.status === 'multiple_match').length,
    existing: rows.filter((r) => r.status === 'existing').length,
    invalid: rows.filter((r) => r.status === 'invalid' || r.status === 'duplicate_in_batch').length,
  };

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const picked = Array.from(list);
    filesRef.current = new Map(picked.map((f, i) => [`${i}:${f.name}`, f]));
    setBatch(null);
    setDone(0);
    setPreviewing(true);
    try {
      const res = await fetch(`/api/cdc/drives/${id}/documents/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', document_type: docType, files: picked.map((f) => ({ name: f.name, size: f.size })) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Preview failed');
      setCandidates(json.candidates as Candidate[]);
      setPool(json.pool);
      setRows(
        (json.rows as CdcBulkPreviewRow[]).map((r, i) => ({
          ...r,
          key: `${i}:${r.file_name}`,
          target: r.status === 'matched' || r.status === 'existing' ? r.learner_id : null,
          mode: 'skip',
          removed: false,
          outcome: null,
          error: null,
        }))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preview failed');
      setRows([]);
    } finally {
      setPreviewing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function patch(key: string, change: Partial<WorkRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  async function confirmUpload() {
    if (ready.length === 0) return;
    setUploading(true);
    setDone(0);
    let started: CdcDocumentBatch | null = null;
    try {
      const res = await fetch(`/api/cdc/drives/${id}/documents/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          document_type: docType,
          totals: { total_files: counts.total, matched: counts.matched + counts.existing, no_match: counts.no_match, multiple_match: counts.multiple, existing_found: counts.existing },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not start the batch');
      started = json.batch as CdcDocumentBatch;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the batch');
      setUploading(false);
      return;
    }

    const outcomes = new Map<string, { outcome: Outcome; error: string | null }>();
    const queue = [...ready];
    async function worker() {
      for (;;) {
        const row = queue.shift();
        if (!row) return;
        const file = filesRef.current.get(row.key);
        let result: { outcome: Outcome; error: string | null };
        if (!file) {
          result = { outcome: 'failed', error: 'File is no longer available in the browser' };
        } else {
          try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('learner_id', row.target!);
            fd.append('document_type', docType);
            fd.append('batch_id', started!.id);
            if (row.existing) fd.append('mode', row.mode);
            const r = await fetch(`/api/cdc/drives/${id}/documents/upload`, { method: 'POST', body: fd });
            const j = await r.json().catch(() => ({}));
            result = r.ok ? { outcome: j.outcome as Outcome, error: null } : { outcome: 'failed', error: j.error || `Upload failed (${r.status})` };
          } catch (err) {
            result = { outcome: 'failed', error: err instanceof Error ? err.message : 'Network error' };
          }
        }
        outcomes.set(row.key, result);
        patch(row.key, result);
        setDone((n) => n + 1);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()));

    const readyKeys = new Set(ready.map((r) => r.key));
    const results = rows.map((r) => {
      const o = outcomes.get(r.key);
      const c = r.target ? candidateOf.get(r.target) : undefined;
      let outcome: Outcome;
      let reason: string | null = r.reason;
      if (o) {
        outcome = o.outcome;
        reason = o.error;
      } else if (r.removed) outcome = 'removed';
      else if (r.status === 'invalid' || r.status === 'duplicate_in_batch') outcome = 'invalid';
      else if (r.existing && r.mode === 'skip') outcome = 'skipped';
      else if (!r.target) outcome = r.status === 'multiple_match' ? 'multiple_match' : 'no_match';
      else if (!readyKeys.has(r.key)) {
        outcome = 'skipped';
        reason = 'Another file targets the same learner';
      } else outcome = 'failed';
      return { file_name: r.file_name, outcome, learner_id: r.target, register_number: c?.register_number ?? r.register_number, reason };
    });
    setRows((prev) => prev.map((r, i) => (r.outcome ? r : { ...r, outcome: results[i].outcome })));

    try {
      const res = await fetch(`/api/cdc/drives/${id}/documents/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finish', batch_id: started.id, results }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not close the batch');
      setBatch(json.batch as CdcDocumentBatch);
      const b = json.batch as CdcDocumentBatch;
      toast[b.failed > 0 ? 'warning' : 'success'](`${b.batch_code}: ${b.uploaded} uploaded${b.failed ? `, ${b.failed} failed` : ''}`);
    } catch (err) {
      setBatch(started);
      toast.error(err instanceof Error ? err.message : 'Could not close the batch');
    } finally {
      setUploading(false);
      qc.invalidateQueries({ queryKey: ['cdc-drive-document-batches', id] });
    }
  }

  function downloadReport() {
    const header = ['File Name', 'Status', 'Learner', 'Register No', 'Result', 'Reason'];
    const lines = rows.map((r) => {
      const c = r.target ? candidateOf.get(r.target) : undefined;
      return [r.file_name, STATUS_BADGE[r.status].label, c?.name ?? r.learner_name ?? '', c?.register_number ?? r.register_number ?? '', r.outcome ? OUTCOME_LABEL[r.outcome] : '', r.error ?? r.reason ?? '']
        .map(csvEscape)
        .join(',');
    });
    const blob = new Blob([[header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${batch?.batch_code ?? 'bulk-upload'}_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    filesRef.current = new Map();
    setRows([]);
    setBatch(null);
    setDone(0);
  }

  return (
    <ContentLayout title="Bulk document upload">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/cdc/drives">Drives</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href={`/cdc/drives/${id}`}>{drive?.title ?? 'Drive'}</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Bulk upload</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Files className="h-5 w-5 text-muted-foreground" />
            Bulk document upload
          </h1>
          <div className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
            {drive ? <DriveStatusBadge status={drive.status} /> : null}
            <span>{drive?.title}</span>
            {detail?.recruiter?.name ? <span>· {detail.recruiter.name}</span> : null}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">1. Choose files</CardTitle>
            <CardDescription>
              Name each file with the learner&apos;s register or roll number, for example <code>2026001.pdf</code> or{' '}
              <code>2026001_Offer_Letter.pdf</code>. PDF, DOC, DOCX, JPG or PNG, up to 4 MB each, 500 files per upload.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Document type</p>
              <Select value={docType} onValueChange={(v) => setDocType(v as CdcDocumentType)} disabled={uploading || rows.length > 0}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABEL) as CdcDocumentType[]).map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <Button onClick={() => inputRef.current?.click()} disabled={previewing || uploading}>
              {previewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-2" />}
              {rows.length > 0 ? 'Choose different files' : 'Select multiple files'}
            </Button>
            {rows.length > 0 ? <span className="text-sm text-muted-foreground">Selected files: {rows.length}</span> : null}
          </CardContent>
        </Card>

        {pool && pool !== 'selected' && rows.length > 0 ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>{pool === 'willing' ? 'Participants are not finalized' : 'No learner is marked Selected yet'}</AlertTitle>
            <AlertDescription>
              Files are being matched against {pool === 'willing' ? 'learners who answered Willing' : 'all finalized participants'}.{' '}
              <Link href={`/cdc/drives/${id}/selected`} className="underline">Record selection decisions</Link> to match against selected learners only.
            </AlertDescription>
          </Alert>
        ) : null}

        {rows.length > 0 ? (
          <>
            <div className="grid gap-2 grid-cols-2 md:grid-cols-6">
              {([
                ['Total files', counts.total],
                ['Matched', counts.matched],
                ['Existing documents', counts.existing],
                ['No match', counts.no_match],
                ['Multiple match', counts.multiple],
                ['Not accepted', counts.invalid],
              ] as Array<[string, number]>).map(([label, n]) => (
                <div key={label} className="rounded-md border p-3">
                  <p className="text-2xl font-semibold leading-none">{n}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-base">{finished ? '3. Result' : '2. Review and confirm'}</CardTitle>
                    <CardDescription>
                      {finished
                        ? `Batch ${batch?.batch_code}: ${batch?.uploaded ?? 0} uploaded, ${batch?.failed ?? 0} failed.`
                        : 'Nothing is stored yet. Fix unmatched files, choose what to do with existing documents, then confirm.'}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={downloadReport}>
                      <Download className="h-4 w-4 mr-1" /> {finished ? 'Download report' : 'Download error report'}
                    </Button>
                    {finished ? (
                      <Button size="sm" onClick={reset}><FileUp className="h-4 w-4 mr-1" /> Upload more</Button>
                    ) : (
                      <Button size="sm" onClick={confirmUpload} disabled={uploading || ready.length === 0}>
                        {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                        {uploading ? `Uploading ${done} / ${ready.length}` : `Confirm upload (${ready.length})`}
                      </Button>
                    )}
                  </div>
                </div>
                {uploading ? <Progress className="mt-3" value={ready.length ? (done / ready.length) * 100 : 0} /> : null}
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File name</TableHead>
                        <TableHead>Matched learner</TableHead>
                        <TableHead>Register no</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => {
                        const c = r.target ? candidateOf.get(r.target) : undefined;
                        const clash = !!r.target && (targetCounts.get(r.target) ?? 0) > 1;
                        const locked = uploading || finished;
                        const choices: Candidate[] =
                          r.status === 'multiple_match'
                            ? r.options.map((o) => ({ learner_id: o.learner_id, name: o.name, register_number: o.register_number, roll_number: null }))
                            : candidates;
                        return (
                          <TableRow key={r.key} className={r.removed ? 'opacity-50' : undefined}>
                            <TableCell className="font-mono text-xs max-w-[240px] truncate" title={r.file_name}>{r.file_name}</TableCell>
                            <TableCell>
                              {r.status === 'no_match' || r.status === 'multiple_match' ? (
                                <Select value={r.target ?? NONE} onValueChange={(v) => patch(r.key, { target: v === NONE ? null : v })} disabled={locked || r.removed}>
                                  <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Map a learner" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={NONE}>Not mapped</SelectItem>
                                    {choices.slice(0, 600).map((o) => (
                                      <SelectItem key={o.learner_id} value={o.learner_id}>
                                        {o.register_number ?? o.roll_number ?? '—'} · {o.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-sm">{c?.name ?? r.learner_name ?? '—'}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{c?.register_number ?? r.register_number ?? '—'}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1 items-start">
                                <Badge variant={STATUS_BADGE[r.status].variant}>{STATUS_BADGE[r.status].label}</Badge>
                                {r.outcome ? (
                                  <Badge variant={r.outcome === 'failed' ? 'destructive' : ['uploaded', 'replaced', 'new_version'].includes(r.outcome) ? 'default' : 'outline'}>
                                    {OUTCOME_LABEL[r.outcome]}
                                  </Badge>
                                ) : null}
                                {clash && !r.removed ? <span className="text-xs text-destructive">Another file targets this learner</span> : null}
                                {r.error || r.reason ? <span className="text-xs text-muted-foreground">{r.error ?? r.reason}</span> : null}
                                {r.existing ? (
                                  <span className="text-xs text-muted-foreground">
                                    v{r.existing.version} · {new Date(r.existing.uploaded_at).toLocaleDateString()} ·{' '}
                                    <a className="underline" href={`/api/cdc/drives/${id}/documents/${r.existing.document_id}`} target="_blank" rel="noopener noreferrer">view</a>
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {r.existing ? (
                                  <Select value={r.mode} onValueChange={(v) => patch(r.key, { mode: v as CdcBulkExistingMode })} disabled={locked || r.removed}>
                                    <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="skip">Skip</SelectItem>
                                      <SelectItem value="replace">Replace</SelectItem>
                                      <SelectItem value="new_version">Upload as new version</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : null}
                                {!locked ? (
                                  <Button variant="ghost" size="sm" className="h-8" onClick={() => patch(r.key, { removed: !r.removed })}>
                                    <Trash2 className="h-3.5 w-3.5 mr-1" /> {r.removed ? 'Restore' : 'Remove'}
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Upload history</CardTitle>
            <CardDescription>Every bulk upload for this drive, newest first.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {(history?.batches ?? []).length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No bulk uploads yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead>Uploaded by</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Files</TableHead>
                      <TableHead className="text-right">Uploaded</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead className="text-right">Review</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history!.batches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-xs">{b.batch_code}</TableCell>
                        <TableCell>{TYPE_LABEL[b.document_type] ?? b.document_type}</TableCell>
                        <TableCell className="text-sm">{b.uploaded_by_name ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(b.started_at).toLocaleString()}</TableCell>
                        <TableCell className="text-right">{b.total_files}</TableCell>
                        <TableCell className="text-right">{b.uploaded}</TableCell>
                        <TableCell className="text-right">{b.failed}</TableCell>
                        <TableCell className="text-right">{b.no_match + b.multiple_match}</TableCell>
                        <TableCell>
                          <Badge variant={b.status === 'completed' ? 'default' : b.status === 'in_progress' ? 'secondary' : 'outline'}>
                            {b.status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
