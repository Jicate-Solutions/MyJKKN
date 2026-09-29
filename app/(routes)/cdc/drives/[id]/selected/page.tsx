'use client';

/**
 * /cdc/drives/[id]/selected — selection decisions and selected-learner documents.
 *
 * The coordinator's working list after the drive day:
 *   finalized participants → attendance → decision → offer / appointment / joining letters.
 * Decisions are recorded in bulk or per learner; each selected learner shows
 * which letters exist, with single upload here and bulk upload one click away.
 */

import Link from 'next/link';
import { use, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Archive, Award, Download, Files, Info, Loader2, Search, Upload } from 'lucide-react';
import type {
  CdcDocumentType,
  CdcDriveSelectionRow,
  CdcDriveSelectionSummary,
  CdcDriveStatus,
  CdcSelectionDecision,
} from '@/types/cdc';
import { DriveStatusBadge } from '../../_components/drive-status-badge';
import { TablePager, usePager } from '../../_components/table-pager';

const DECISION_LABEL: Record<CdcSelectionDecision, string> = {
  selected: 'Selected',
  waitlisted: 'Waitlisted',
  rejected: 'Rejected',
  hold: 'Hold',
};
const DECISION_CLASS: Record<CdcSelectionDecision, string> = {
  selected: 'bg-green-600 hover:bg-green-600 text-white',
  waitlisted: 'bg-amber-500 hover:bg-amber-500 text-white',
  rejected: 'bg-red-600 hover:bg-red-600 text-white',
  hold: 'bg-blue-600 hover:bg-blue-600 text-white',
};
const ATTENDANCE_TEXT: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
  not_attended: 'Not attended',
};
const DOC_LABEL: Record<CdcDocumentType, string> = {
  offer_letter: 'Offer',
  appointment_letter: 'Appointment',
  joining_letter: 'Joining',
  internship_letter: 'Internship',
  training_letter: 'Training',
  salary_letter: 'Salary',
  other: 'Other',
};
/** The five working tabs. "Pending" = no decision recorded yet. */
type SelectionTab = 'pending' | CdcSelectionDecision;
const TABS: Array<{ key: SelectionTab; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'selected', label: 'Selected' },
  { key: 'waitlisted', label: 'Waitlisted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'hold', label: 'Hold' },
];
const DOC_FOLDER: Record<CdcDocumentType, string> = {
  offer_letter: 'Offer Letters',
  appointment_letter: 'Appointment Letters',
  joining_letter: 'Joining Letters',
  internship_letter: 'Internship Letters',
  training_letter: 'Training Letters',
  salary_letter: 'Salary Letters',
  other: 'Other Documents',
};
const ZIP_CONCURRENCY = 4;

function safeName(v: string): string {
  return v.replace(/[^A-Za-z0-9._ -]+/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'drive';
}

const UPLOAD_TYPES: CdcDocumentType[] = ['offer_letter', 'appointment_letter', 'joining_letter', 'internship_letter', 'training_letter', 'salary_letter', 'other'];

interface SelectionResponse {
  drive: {
    id: string;
    title: string;
    status: CdcDriveStatus;
    drive_date: string | null;
    job_role_title: string | null;
    expected_package_lpa: number | null;
    recruiter_name: string | null;
    participants_finalized_at: string | null;
  };
  rows: CdcDriveSelectionRow[];
  summary: CdcDriveSelectionSummary;
  can_decide: boolean;
  decide_blocked_reason: string | null;
}

export default function CdcDriveSelectedPage(props: { params: Promise<{ id: string }> }) {
  return (
    <PermissionGuard module="cdc.drives" action="view">
      <Content {...props} />
    </PermissionGuard>
  );
}

function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<{ learnerId: string; type: CdcDocumentType } | null>(null);

  const [tab, setTab] = useState<SelectionTab>('pending');
  // Pending is where decisions are made, and only learners who turned up can be decided on.
  const [attendedOnly, setAttendedOnly] = useState(true);
  const [zip, setZip] = useState<{ done: number; total: number } | null>(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [remarks, setRemarks] = useState('');
  const [uploadType, setUploadType] = useState<CdcDocumentType>('offer_letter');
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['cdc-drive-selection', id],
    queryFn: async () => {
      const res = await fetch(`/api/cdc/drives/${id}/selection`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Selection failed (${res.status})`);
      return json as SelectionResponse;
    },
  });

  const decide = useMutation({
    mutationFn: async (input: { learner_ids: string[]; decision: CdcSelectionDecision | null }) => {
      const res = await fetch(`/api/cdc/drives/${id}/selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, remarks: remarks.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not save the decision');
      return json as { changed: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cdc-drive-selection', id] }),
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === 'pending' ? !!r.decision : r.decision !== tab) return false;
      if (attendedOnly && r.attendance_status !== 'present' && r.attendance_status !== 'late') return false;
      if (!q) return true;
      return [r.learner_name, r.register_number, r.department_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, tab, attendedOnly, search]);
  const pager = usePager(visible, 50);
  const zipCount = useMemo(
    () => visible.filter((r) => r.documents.some((d) => d.document_type === uploadType)).length,
    [visible, uploadType]
  );
  const tabCounts = useMemo(() => {
    const c: Record<SelectionTab, number> = { pending: 0, selected: 0, waitlisted: 0, rejected: 0, hold: 0 };
    rows.forEach((r) => {
      if (attendedOnly && r.attendance_status !== 'present' && r.attendance_status !== 'late') return;
      c[r.decision ?? 'pending'] += 1;
    });
    return c;
  }, [rows, attendedOnly]);

  if (isLoading) {
    return (
      <ContentLayout title="Selected learners">
        <p className="text-sm text-muted-foreground p-6">Loading…</p>
      </ContentLayout>
    );
  }
  if (error || !data) {
    return (
      <ContentLayout title="Selected learners">
        <p className="text-sm text-destructive p-6">{error instanceof Error ? error.message : 'Could not load this drive'}</p>
      </ContentLayout>
    );
  }

  const { drive, summary, can_decide } = data;
  const allVisibleOn = visible.length > 0 && visible.every((r) => picked.has(r.learner_id));

  function toggle(v: string) {
    const next = new Set(picked);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setPicked(next);
  }
  function setAllVisible(on: boolean) {
    const next = new Set(picked);
    visible.forEach((r) => (on ? next.add(r.learner_id) : next.delete(r.learner_id)));
    setPicked(next);
  }
  async function apply(decision: CdcSelectionDecision | null, ids: string[]) {
    if (ids.length === 0) return;
    try {
      const res = await decide.mutateAsync({ learner_ids: ids, decision });
      toast.success(decision ? `${res.changed} marked ${DECISION_LABEL[decision]}` : `${res.changed} decision${res.changed === 1 ? '' : 's'} cleared`);
      setPicked(new Set());
      setRemarks('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the decision');
    }
  }

  /**
   * Bulk download: every current document of the chosen type for the learners
   * the tab + filters show, packed into ONE .zip in the browser. Each file comes
   * through the same authenticated proxy as "View", so no new access path exists
   * and nothing large passes through a single server request.
   */
  async function downloadZip() {
    const targets = visible
      .map((r) => ({ row: r, doc: r.documents.find((d) => d.document_type === uploadType) }))
      .filter((t): t is { row: typeof t.row; doc: NonNullable<typeof t.doc> } => !!t.doc);
    if (targets.length === 0) {
      toast.info(`No ${DOC_LABEL[uploadType].toLowerCase()} letters to download in this tab.`);
      return;
    }
    setZip({ done: 0, total: targets.length });
    try {
      const { default: JSZip } = await import('jszip');
      const archive = new JSZip();
      const folder = archive.folder(DOC_FOLDER[uploadType]) ?? archive;
      const used = new Set<string>();
      const failed: string[] = [];
      const queue = [...targets];

      async function worker() {
        for (;;) {
          const t = queue.shift();
          if (!t) return;
          try {
            const res = await fetch(`/api/cdc/drives/${id}/documents/${t.doc.id}?download=1`);
            if (!res.ok) throw new Error(String(res.status));
            let name = t.doc.file_name || `${t.row.register_number ?? t.row.learner_id}.pdf`;
            // Two learners can never share a stored name, but stay safe against a clash.
            if (used.has(name)) name = `${t.row.learner_id.slice(0, 8)}_${name}`;
            used.add(name);
            folder.file(name, await res.arrayBuffer());
          } catch {
            failed.push(`${t.row.register_number ?? ''} ${t.row.learner_name ?? ''}`.trim());
          } finally {
            setZip((z) => (z ? { ...z, done: z.done + 1 } : z));
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(ZIP_CONCURRENCY, queue.length) }, () => worker()));

      if (failed.length === targets.length) throw new Error('None of the files could be downloaded.');
      if (failed.length > 0) {
        folder.file('_NOT_DOWNLOADED.txt', `These letters could not be fetched and are missing from this archive:\r\n\r\n${failed.join('\r\n')}\r\n`);
      }
      const blob = await archive.generateAsync({ type: 'blob', compression: 'STORE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName(data?.drive.title ?? 'drive')}_${DOC_FOLDER[uploadType].replace(/\s+/g, '_')}_${tab}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast[failed.length ? 'warning' : 'success'](
        `${targets.length - failed.length} letter${targets.length - failed.length === 1 ? '' : 's'} downloaded` +
          (failed.length ? ` · ${failed.length} failed (listed inside the archive)` : '')
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not build the archive');
    } finally {
      setZip(null);
    }
  }

  function startUpload(learnerId: string) {
    pendingUpload.current = { learnerId, type: uploadType };
    fileInput.current?.click();
  }
  async function handleFile(file: File | null) {
    const target = pendingUpload.current;
    if (fileInput.current) fileInput.current.value = '';
    if (!file || !target) return;
    const row = rows.find((r) => r.learner_id === target.learnerId);
    const hasCurrent = !!row?.documents.some((d) => d.document_type === target.type);
    if (hasCurrent && !window.confirm('This learner already has this document. Upload this file as a new version? The earlier version is kept.')) return;
    setUploadingFor(target.learnerId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('learner_id', target.learnerId);
      fd.append('document_type', target.type);
      if (hasCurrent) fd.append('mode', 'new_version');
      const res = await fetch(`/api/cdc/drives/${id}/documents/upload`, { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      toast.success(`${DOC_LABEL[target.type]} letter uploaded${json.version > 1 ? ` (v${json.version})` : ''}`);
      // The server told us exactly what was stored, so add the badge to this one
      // row and adjust the tiles here. Refetching rebuilt the whole roster
      // (every participant + attendance + decisions + documents) for one letter.
      if (json.document_id) {
        qc.setQueryData<SelectionResponse>(['cdc-drive-selection', id], (prev) => {
          if (!prev) return prev;
          const rows = prev.rows.map((r) =>
            r.learner_id !== target.learnerId
              ? r
              : {
                  ...r,
                  documents: [
                    ...r.documents.filter((d) => d.document_type !== target.type),
                    {
                      id: json.document_id as string,
                      document_type: target.type,
                      file_name: (json.file_name as string) ?? file.name,
                      version: (json.version as number) ?? 1,
                      status: 'uploaded',
                      uploaded_at: (json.uploaded_at as string) ?? new Date().toISOString(),
                    },
                  ],
                }
          );
          const selected = rows.filter((r) => r.decision === 'selected');
          const offer_uploaded = selected.filter((r) => r.documents.some((d) => d.document_type === 'offer_letter')).length;
          return { ...prev, rows, summary: { ...prev.summary, offer_uploaded, offer_pending: selected.length - offer_uploaded } };
        });
      } else {
        qc.invalidateQueries({ queryKey: ['cdc-drive-selection', id] });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingFor(null);
    }
  }

  return (
    <ContentLayout title="Selected learners">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/cdc/drives">Drives</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href={`/cdc/drives/${id}`}>{drive.title}</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Selected learners</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <input ref={fileInput} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />

      <div className="mt-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Award className="h-5 w-5 text-muted-foreground" />
              {drive.title}
            </h1>
            <div className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
              <DriveStatusBadge status={drive.status} />
              {drive.recruiter_name ? <span>{drive.recruiter_name}</span> : null}
              {drive.job_role_title ? <span>· {drive.job_role_title}</span> : null}
              {drive.expected_package_lpa ? <span>· {drive.expected_package_lpa} LPA</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={`/api/cdc/drives/${id}/selection?format=xlsx&decision=${tab === 'pending' ? 'undecided' : tab}${attendedOnly ? '&attended=1' : ''}`}>
                <Download className="h-4 w-4 mr-2" /> Download Excel
              </a>
            </Button>
            <Button variant="outline" onClick={downloadZip} disabled={!!zip || zipCount === 0} title={zipCount === 0 ? 'No letters of this type in this tab' : undefined}>
              {zip ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Archive className="h-4 w-4 mr-2" />}
              {zip ? `Packing ${zip.done} / ${zip.total}` : `Download ${DOC_LABEL[uploadType].toLowerCase()} letters (${zipCount})`}
            </Button>
            <PermissionGuard module="cdc.drives" action="edit" fallback={null}>
              <Button asChild>
                <Link href={`/cdc/drives/${id}/documents/bulk-upload`}>
                  <Files className="h-4 w-4 mr-2" /> Bulk upload offer letters
                </Link>
              </Button>
            </PermissionGuard>
          </div>
        </div>

        <div className="grid gap-2 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
          {([
            ['Participants', summary.participants],
            ['Attended', summary.attended],
            ['Selected', summary.selected],
            ['Waitlisted', summary.waitlisted],
            ['Rejected', summary.rejected],
            ['Undecided', summary.undecided],
            ['Offer uploaded', summary.offer_uploaded],
            ['Offer pending', summary.offer_pending],
          ] as Array<[string, number]>).map(([label, n]) => (
            <div key={label} className="rounded-md border p-3">
              <p className="text-2xl font-semibold leading-none">{n}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        {!drive.participants_finalized_at ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Participants are not finalized yet</AlertTitle>
            <AlertDescription>
              Decisions are recorded against the finalized participant list.{' '}
              <Link href={`/cdc/drives/${id}/participants`} className="underline">Finalize participants</Link> first.
            </AlertDescription>
          </Alert>
        ) : !can_decide && data.decide_blocked_reason ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>View only</AlertTitle>
            <AlertDescription>{data.decide_blocked_reason}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-base">Decisions and documents</CardTitle>
                <CardDescription>Learners see their result only after the drive status is moved to Selection Finalized (or Closed).</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox checked={attendedOnly} onCheckedChange={(v) => setAttendedOnly(v === true)} />
                  Attended only
                </label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8 w-56" placeholder="Search name / register no" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Pending | Selected | Waitlisted | Rejected | Hold */}
            <div className="mt-3 flex flex-wrap gap-1 border-b" role="tablist" aria-label="Selection status">
              {TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setTab(t.key);
                      setPicked(new Set());
                      pager.setPage(1);
                    }}
                    className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                      active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t.label}
                    <span
                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
                        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {tabCounts[t.key]}
                    </span>
                  </button>
                );
              })}
            </div>
            {zip ? <Progress className="mt-2" value={zip.total ? (zip.done / zip.total) * 100 : 0} /> : null}

            {can_decide ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2">
                <span className="text-xs text-muted-foreground px-1">{picked.size > 0 ? `${picked.size} selected` : 'Tick learners, then:'}</span>
                {(Object.keys(DECISION_LABEL) as CdcSelectionDecision[]).map((d) => (
                  <Button key={d} size="sm" variant="outline" disabled={picked.size === 0 || decide.isPending} onClick={() => apply(d, Array.from(picked))}>
                    {DECISION_LABEL[d]}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" disabled={picked.size === 0 || decide.isPending} onClick={() => apply(null, Array.from(picked))}>
                  Clear decision
                </Button>
                <Input className="h-8 w-56" placeholder="Remarks (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} />
              </div>
            ) : null}

            <PermissionGuard module="cdc.drives" action="edit" fallback={null}>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Document type (single upload and bulk download):</span>
                <Select value={uploadType} onValueChange={(v) => setUploadType(v as CdcDocumentType)}>
                  <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UPLOAD_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{DOC_LABEL[t]} letter</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </PermissionGuard>
          </CardHeader>

          <CardContent className="p-0">
            {visible.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                {summary.participants === 0
                  ? 'No finalized participants yet.'
                  : `No learners under ${TABS.find((t) => t.key === tab)?.label}${attendedOnly ? ' who attended. Untick "Attended only" to see everyone.' : '.'}`}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        {can_decide ? <Checkbox checked={allVisibleOn} onCheckedChange={(v) => setAllVisible(v === true)} aria-label="Select all shown" /> : null}
                      </TableHead>
                      <TableHead>Learner</TableHead>
                      <TableHead>Program / Dept</TableHead>
                      <TableHead>Attendance</TableHead>
                      <TableHead>Decision</TableHead>
                      <TableHead>Documents</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pager.pageRows.map((r) => (
                      <TableRow key={r.learner_id}>
                        <TableCell>{can_decide ? <Checkbox checked={picked.has(r.learner_id)} onCheckedChange={() => toggle(r.learner_id)} /> : null}</TableCell>
                        <TableCell>
                          <div className="font-medium">{r.learner_name ?? '—'}</div>
                          <div className="text-xs text-muted-foreground font-mono">{r.register_number ?? ''}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{r.department_name ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">{r.semester_label ?? ''}</div>
                        </TableCell>
                        <TableCell className="text-sm">{r.attendance_status ? ATTENDANCE_TEXT[r.attendance_status] : 'Not marked'}</TableCell>
                        <TableCell>
                          {r.decision ? (
                            <div>
                              <Badge className={DECISION_CLASS[r.decision]}>{DECISION_LABEL[r.decision]}</Badge>
                              {r.decided_at ? (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {new Date(r.decided_at).toLocaleDateString()}
                                  {r.decided_by_name ? ` · ${r.decided_by_name}` : ''}
                                </div>
                              ) : null}
                              {r.decision_remarks ? <div className="text-xs text-muted-foreground">{r.decision_remarks}</div> : null}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Undecided</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            {r.documents.map((d) => (
                              <a key={d.id} href={`/api/cdc/drives/${id}/documents/${d.id}`} target="_blank" rel="noopener noreferrer" title={d.file_name}>
                                <Badge variant="secondary" className="font-normal hover:bg-secondary/70">
                                  {DOC_LABEL[d.document_type]}{d.version > 1 ? ` v${d.version}` : ''}
                                </Badge>
                              </a>
                            ))}
                            {r.decision === 'selected' && !r.documents.some((d) => d.document_type === 'offer_letter') ? (
                              <Badge variant="outline" className="font-normal">Offer pending</Badge>
                            ) : null}
                            {r.decision === 'selected' ? (
                              <PermissionGuard module="cdc.drives" action="edit" fallback={null}>
                                <Button variant="ghost" size="sm" className="h-7" disabled={uploadingFor === r.learner_id} onClick={() => startUpload(r.learner_id)}>
                                  {uploadingFor === r.learner_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                                  Upload
                                </Button>
                              </PermissionGuard>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <TablePager pager={pager} />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
