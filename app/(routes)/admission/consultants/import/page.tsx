'use client';

// Referral file import — upload → validate → report → (senior) approve.
// Parsing is client-side; validation/enrichment/promotion run server-side.
// Anyone on the admission team can upload & preview; only a senior approves the
// save (D35). Approving records who is owed; it never pays (D20).

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { usePermissions } from '@/hooks/use-permissions';
import { FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, Upload } from 'lucide-react';
import { useImportRows, useImportBatch, useUploadReferralFile, usePromoteImport } from '@/hooks/admission/use-referral-import';
import { TEMPLATE_HEADERS, type ParsedRow, type ImportVerdict } from '@/types/referral-import';

const s = (v: any) => (v === null || v === undefined || v === '' ? null : String(v).trim());
const n = (v: any) => { const x = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isNaN(x) ? null : x; };
// grey example rows shipped in the template — never stage them even if left in
const EXAMPLES = new Set(['Bright Futures Consultancy|JKKN-CAS-1', 'MR. KANDASAMY M|JKKN-CAS-10']);
function rupees(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
}
const VERDICT: Record<ImportVerdict, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ok: { label: 'Ready', variant: 'default' },
  flagged: { label: 'Needs review', variant: 'secondary' },
  blocked: { label: 'Blocked', variant: 'destructive' },
  no_match: { label: 'No match', variant: 'outline' },
};

export default function ReferralImportPage() {
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const isSenior = isSuperAdmin || isAdmissionGlobalUser;

  const [parseError, setParseError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);

  const upload = useUploadReferralFile();
  const promote = usePromoteImport();
  const { data: batch } = useImportBatch(batchId);
  const { data: rows, isLoading: rowsLoading } = useImportRows(batchId);

  const committed = batch?.status === 'committed';
  const mismatchShare = batch && batch.row_count > 0 ? batch.no_match_count / batch.row_count : 0;

  const grouped = useMemo(() => {
    const g: Record<ImportVerdict, number> = { ok: 0, flagged: 0, blocked: 0, no_match: 0 };
    (rows || []).forEach((r) => { if (r.verdict) g[r.verdict] += 1; });
    return g;
  }, [rows]);

  async function handleFile(file: File) {
    setParseError(null); setBatchId(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const sheetName = wb.SheetNames.find((nm) => nm !== 'Read me first') || wb.SheetNames[0];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[sheetName], { defval: null });
      if (!json.length) { setParseError('The sheet has no rows.'); return; }

      // D23 — refuse a file whose columns do not match the template
      const headers = Object.keys(json[0]);
      const missing = TEMPLATE_HEADERS.filter((h) => !headers.includes(h));
      if (missing.length) {
        setParseError(`This file does not match the template. Missing columns: ${missing.join(', ')}. Please use the provided template.`);
        return;
      }

      const parsed: ParsedRow[] = json.map((r) => ({
        referrer_name: s(r['Referrer Name *']),
        referrer_type: s(r['Referrer Type *'])?.toLowerCase() ?? null,
        referrer_code: s(r['Referrer Code']),
        referrer_contact: s(r['Referrer Phone/Email']),
        student_application_id: s(r['Student Application No. *']),
        student_name: s(r['Student Name *']),
        programme: s(r['Programme']),
        institution: s(r['Institution']),
        referral_date: s(r['Referral Date']),
        amount_agreed: n(r['Amount Agreed (Rs)']),
        amount_paid: n(r['Amount Already Paid (Rs)']),
        paid_date: s(r['Paid Date']),
        paid_method: s(r['Paid Method']),
        paid_reference: s(r['Paid Reference']),
      })).filter((r) =>
        (r.referrer_name || r.student_application_id) &&
        !EXAMPLES.has(`${r.referrer_name}|${r.student_application_id}`));

      if (!parsed.length) { setParseError('No data rows found (only blank or example rows).'); return; }

      const id = await upload.mutateAsync({ filename: file.name, rows: parsed });
      setBatchId(id);
    } catch (e: any) {
      setParseError(e?.message || 'Could not read the file.');
    }
  }

  return (
    <ContentLayout title="Import Referral File">
      <PermissionGuard module="admission.consultants.commissions" action="view">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Import Referral File</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Upload the filled referral template. Every row is checked against real admissions and
              sorted into ready / needs-review / blocked / no-match. Nothing is written until a senior
              approves. Approving records who is owed — it never pays anyone.
            </p>
          </div>

          {/* Upload */}
          <Card>
            <CardHeader>
              <CardTitle>1 · Upload</CardTitle>
              <CardDescription>Excel file (.xlsx) using the provided template.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-3 border-2 border-dashed rounded-lg p-6 cursor-pointer hover:bg-muted/40">
                <FileSpreadsheet className="h-8 w-8 text-green-600" />
                <div className="flex-1">
                  <div className="font-medium">Choose the referral template file</div>
                  <div className="text-xs text-muted-foreground">Delete the grey example rows first; they are ignored automatically.</div>
                </div>
                {upload.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
                <input type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ''; }} />
              </label>
              {parseError && (
                <Alert variant="destructive"><AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{parseError}</AlertDescription></Alert>
              )}
            </CardContent>
          </Card>

          {/* Report */}
          {batchId && (
            <Card>
              <CardHeader>
                <CardTitle>2 · Report</CardTitle>
                <CardDescription>{batch?.filename} — {batch?.row_count} row(s)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Stat label="Ready" value={grouped.ok} />
                  <Stat label="Needs review" value={grouped.flagged} warn={grouped.flagged > 0} />
                  <Stat label="Blocked" value={grouped.blocked} warn={grouped.blocked > 0} />
                  <Stat label="No match" value={grouped.no_match} warn={grouped.no_match > 0} />
                  <Stat label="Already paid" value={batch?.already_paid_count ?? 0} />
                </div>

                {/* D39 — high mismatch warning */}
                {mismatchShare >= 0.33 && !committed && (
                  <Alert variant="destructive"><AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {Math.round(mismatchShare * 100)}% of rows matched no admission. This often means the wrong
                      file or a column problem — please double-check before approving.
                    </AlertDescription></Alert>
                )}

                {committed && (
                  <Alert><CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>This batch has been approved and saved.</AlertDescription></Alert>
                )}

                {rowsLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Referrer</TableHead>
                          <TableHead>Learner</TableHead>
                          <TableHead>Verdict</TableHead>
                          <TableHead>Studying?</TableHead>
                          <TableHead className="text-right">Owed</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(rows || []).map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-muted-foreground">{r.row_number}</TableCell>
                            <TableCell>
                              <div>{r.referrer_name || '—'}</div>
                              <div className="text-xs text-muted-foreground capitalize">{r.referrer_type}</div>
                            </TableCell>
                            <TableCell>
                              <div>{r.student_name || '—'}</div>
                              <div className="text-xs font-mono text-muted-foreground">{r.student_application_id}</div>
                            </TableCell>
                            <TableCell><Badge variant={r.verdict ? VERDICT[r.verdict].variant : 'outline'}>
                              {r.verdict ? VERDICT[r.verdict].label : '—'}</Badge></TableCell>
                            <TableCell>
                              {r.verdict === 'no_match' ? <span className="text-muted-foreground text-xs">—</span>
                                : r.enrolment_status === 'confirmed'
                                  ? <Badge variant="default" className="bg-green-600 hover:bg-green-600">Confirmed</Badge>
                                  : <Badge variant="secondary">Registrar</Badge>}
                            </TableCell>
                            <TableCell className="text-right">
                              {r.amount_owed === null ? <span className="text-amber-600 text-xs">to be set</span> : rupees(r.amount_owed)}
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <div className="text-xs text-muted-foreground">
                                {(r.verdict_reasons || []).join('; ') || (r.is_already_paid ? 'Already paid' : '')}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Approve */}
          {batchId && !committed && (
            <Card>
              <CardHeader>
                <CardTitle>3 · Approve &amp; save</CardTitle>
                <CardDescription>
                  Only the <strong>{grouped.ok}</strong> ready row(s) are saved. Needs-review, blocked and
                  no-match rows stay for later. Already-paid rows are recorded so they can never be paid twice.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isSenior ? (
                  <Button onClick={() => setConfirmApprove(true)} disabled={promote.isPending || grouped.ok === 0}>
                    {promote.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    <Upload className="h-4 w-4 mr-1" /> Approve &amp; save {grouped.ok} row(s)
                  </Button>
                ) : (
                  <Alert><AlertTriangle className="h-4 w-4" />
                    <AlertDescription>You can upload and review, but a senior admin must approve the save.</AlertDescription></Alert>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <Dialog open={confirmApprove} onOpenChange={setConfirmApprove}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" /> Approve and save?
              </DialogTitle>
              <DialogDescription>
                This records {grouped.ok} referral(s) against the students named. It does not pay anyone —
                payment is a separate step. A referral already linked to a different referrer is kept as a
                conflict for review, never overwritten.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmApprove(false)}>Cancel</Button>
              <Button onClick={() => promote.mutate(batchId as string, { onSuccess: () => setConfirmApprove(false) })}
                disabled={promote.isPending}>
                {promote.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Yes, save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PermissionGuard>
    </ContentLayout>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${warn ? 'text-amber-600' : ''}`}>{value}</div>
    </div>
  );
}
