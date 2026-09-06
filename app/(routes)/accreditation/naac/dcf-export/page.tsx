// app/(routes)/accreditation/naac/dcf-export/page.tsx
// ============================================================================
// /accreditation/naac/dcf-export — NAAC DCF 2025 / AQAR workbook export (PR-A8 c2).
//
// Super-admin-only page. Generates an XLSX stub containing the 26 seeded NAAC
// metrics with per-metric evidence counts sourced from quality_evidence_mappings.
// Values are placeholders ("auto-fill pending") — the full 90-row NAAC rubric
// with weighted formulas lands incrementally in follow-up PRs as each evidence
// fan-out trigger is retrofitted.
//
// On export, an accreditation_submissions row is written so the IQAC has a
// paper trail of who exported what, when, and for which cycle.
//
// Once that workbook has actually been filed with NAAC, "Freeze the filed
// figures" calls fn_accreditation_freeze_reported_figures — the write-once act
// that records the per-metric counts as at filing time, so the reported figure
// and the figure today can both be answered later. Director decision 7.
// ============================================================================

'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { FileDown, ShieldAlert, Download, FileSpreadsheet, Lock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  describeDrift,
  mergeReportedMetrics,
  readReportedSnapshot,
  type SubmissionMetadata,
} from '@/lib/services/accreditation/reported-figures';

type SubmissionType = 'NAAC_AQAR_2024_25' | 'NAAC_SSR_2027';

/** The row just written by an export, held so it can be frozen without a refetch. */
interface RecordedSubmission {
  id: string;
  periodLabel: string;
  metadata: SubmissionMetadata;
}

/** One row of fn_accreditation_reported_vs_actual. */
interface DriftRow {
  metric_code: string;
  reported: number | string | null;
  actual: number | string;
}

const SUBMISSION_TYPE_LABELS: Record<SubmissionType, string> = {
  NAAC_AQAR_2024_25: 'AQAR 2024-25 (Annual Quality Assurance Report)',
  NAAC_SSR_2027: 'SSR 2027 (Self-Study Report for next accreditation cycle)',
};

interface Institution {
  id: string;
  name: string;
  iqac_code: string | null;
  institution_type: string;
}

interface NAACMetric {
  metric_code: string;
  metric_name: string;
  category: string | null;
  max_score: number | null;
  calculation_method: string | null;
  data_sources: string[] | null;
  verification_requirements: string | null;
}

function useInstitutions() {
  return useQuery({
    queryKey: ['institutions', 'jkkn-iqac'],
    queryFn: async (): Promise<Institution[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('institutions')
        .select('id, name, iqac_code, institution_type')
        .not('iqac_code', 'is', null)
        .order('iqac_code');
      if (error) throw error;
      return (data ?? []) as Institution[];
    },
    staleTime: 30 * 60 * 1000,
  });
}

function useNAACMetrics() {
  return useQuery({
    queryKey: ['accreditation', 'naac', 'metrics-full'],
    queryFn: async (): Promise<NAACMetric[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('sh_accreditation_metrics')
        .select(
          'metric_code, metric_name, category, max_score, calculation_method, data_sources, verification_requirements',
        )
        .eq('metric_type', 'NAAC')
        .eq('is_active', true)
        .order('metric_code');
      if (error) throw error;
      return (data ?? []) as NAACMetric[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useEvidenceCountsByMetric(institutionId: string | 'cluster') {
  return useQuery({
    queryKey: ['accreditation', 'naac', 'evidence-by-metric', institutionId],
    queryFn: async (): Promise<Record<string, number>> => {
      const sb = createClientSupabaseClient() as any;
      let q = sb
        .from('quality_evidence_mappings')
        .select('metric_code')
        .eq('body_code', 'NAAC');
      if (institutionId !== 'cluster') {
        q = q.eq('institution_id', institutionId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).reduce<Record<string, number>>((acc, row: any) => {
        acc[row.metric_code] = (acc[row.metric_code] ?? 0) + 1;
        return acc;
      }, {});
    },
    staleTime: 2 * 60 * 1000,
  });
}

export default function NAACDCFExportPage() {
  const { isSuperAdmin, isLoading: permsLoading } = usePermissions();

  const [institutionId, setInstitutionId] = useState<string>('');
  const [submissionType, setSubmissionType] =
    useState<SubmissionType>('NAAC_AQAR_2024_25');
  const [exporting, setExporting] = useState(false);
  const [submission, setSubmission] = useState<RecordedSubmission | null>(null);
  const [freezing, setFreezing] = useState(false);
  const [driftRows, setDriftRows] = useState<DriftRow[] | null>(null);
  const [driftNote, setDriftNote] = useState<string | null>(null);

  const { data: institutions, isLoading: iLoading } = useInstitutions();
  const { data: metrics, isLoading: mLoading } = useNAACMetrics();
  const { data: evidenceCounts, isLoading: eLoading } = useEvidenceCountsByMetric(
    institutionId || 'cluster',
  );

  if (permsLoading) {
    return (
      <ContentLayout title="NAAC DCF / AQAR Export">
        <Skeleton className="h-40 w-full" />
      </ContentLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <ContentLayout title="NAAC DCF / AQAR Export">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Accreditation', href: '/accreditation' },
            { label: 'NAAC', href: '/accreditation/naac' },
            { label: 'DCF Export', href: '/accreditation/naac/dcf-export' },
          ]}
        />
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Super-admin access required</AlertTitle>
          <AlertDescription>
            NAAC DCF 2025 / AQAR submission exports are gated to super-admins.
            Ask the Director's office or IQAC Chairman to run this export.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const selectedInstitution = institutions?.find((i) => i.id === institutionId);
  const totalMetrics = metrics?.length ?? 0;
  const totalEvidence = Object.values(evidenceCounts ?? {}).reduce(
    (s, n) => s + n,
    0,
  );

  const handleExport = async () => {
    if (!institutionId) {
      toast.error('Select a college first');
      return;
    }
    if (!metrics || metrics.length === 0) {
      toast.error('No metrics loaded');
      return;
    }
    setExporting(true);
    try {
      // Build workbook rows: one per metric
      const sheetRows = metrics.map((m) => ({
        'Metric code': m.metric_code,
        'Metric name': m.metric_name,
        Category: m.category ?? '',
        'Max score': m.max_score ?? '',
        'Evidence rows in MyJKKN': evidenceCounts?.[m.metric_code] ?? 0,
        'Calculated value': 'auto-fill pending',
        'Calculation method': m.calculation_method ?? '',
        'Data sources': (m.data_sources ?? []).join(' | '),
        'Verification requirements': m.verification_requirements ?? '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(sheetRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'NAAC metrics');

      // Cover sheet with metadata
      const coverSheet = XLSX.utils.aoa_to_sheet([
        ['NAAC Data Capture Format export'],
        [''],
        ['Submission type', SUBMISSION_TYPE_LABELS[submissionType]],
        ['College', selectedInstitution?.name ?? '—'],
        ['IQAC code', selectedInstitution?.iqac_code ?? '—'],
        ['Exported at', new Date().toISOString()],
        ['Metrics seeded', totalMetrics],
        ['Evidence rows captured', totalEvidence],
        [''],
        ['Note: calculated values show "auto-fill pending" — the MyJKKN'],
        ['substrate captures evidence rows; weighted NAAC scoring lands'],
        ['incrementally as each evidence fan-out trigger is retrofitted.'],
      ]);
      XLSX.utils.book_append_sheet(workbook, coverSheet, 'Cover');

      // Trigger download
      const safeCode = (selectedInstitution?.iqac_code ?? 'cluster').replace(
        /[^A-Za-z0-9]+/g,
        '_',
      );
      const filename = `${submissionType}_${safeCode}_${new Date()
        .toISOString()
        .split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, filename);

      // Record submission row — paper trail for IQAC
      const sb = createClientSupabaseClient() as any;
      const periodLabel =
        submissionType === 'NAAC_AQAR_2024_25' ? '2024-25' : '2027';
      const coveragePct =
        totalMetrics === 0 ? 0 : Math.round((totalEvidence / totalMetrics) * 100);
      const submissionMetadata: SubmissionMetadata = {
        filename,
        metrics_seeded: totalMetrics,
        evidence_rows: totalEvidence,
        exported_at: new Date().toISOString(),
        note: 'Auto-generated stub export; values pending substrate fan-out',
      };
      const { data: insertedRow, error: insertError } = await sb
        .from('accreditation_submissions')
        .insert({
          institution_id: institutionId,
          body_code: 'NAAC',
          submission_type: submissionType,
          period_label: periodLabel,
          export_format: 'xlsx',
          // 'draft', not 'drafted' — the table's CHECK allows
          // ('draft','submitted','accepted','revision_requested','rejected','withdrawn').
          // 'drafted' violated it, so every insert from this page was rejected and
          // the paper trail below never existed.
          status: 'draft',
          coverage_snapshot: coveragePct,
          metadata: submissionMetadata,
        })
        .select('id, period_label, metadata')
        .single();
      if (insertError) {
        console.warn('[accreditation/dcf-export] submission row insert failed:', insertError);
        toast.warning(
          'Export downloaded, but submission record failed — contact engineering',
        );
      } else {
        setSubmission({
          id: insertedRow.id as string,
          periodLabel: insertedRow.period_label as string,
          metadata: (insertedRow.metadata ?? {}) as SubmissionMetadata,
        });
        setDriftRows(null);
        setDriftNote(null);
        toast.success('Export downloaded + submission recorded');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Export failed';
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

  // Reads back through the counterpart function so both numbers come from the
  // database rather than from anything this page happens to be holding.
  const loadDrift = async (periodLabel: string) => {
    const sb = createClientSupabaseClient() as any;
    const { data, error } = await sb.rpc('fn_accreditation_reported_vs_actual', {
      p_institution_id: institutionId,
      p_body_code: 'NAAC',
      p_period_label: periodLabel,
    });
    if (error) {
      setDriftRows(null);
      setDriftNote(
        'The figures are frozen. The reported-vs-actual reader is not available on this database yet, so the comparison below cannot be drawn.',
      );
      return;
    }
    setDriftRows((data ?? []) as DriftRow[]);
    setDriftNote(null);
  };

  const handleFreeze = async () => {
    if (!submission) return;
    setFreezing(true);
    try {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb.rpc(
        'fn_accreditation_freeze_reported_figures',
        { p_submission_id: submission.id },
      );
      if (error) throw new Error(error.message);

      const result = (data ?? {}) as {
        reported_metrics?: Record<string, number>;
        reported_at?: string;
      };
      const { merged } = mergeReportedMetrics(
        submission.metadata,
        result.reported_metrics ?? {},
        result.reported_at ?? new Date().toISOString(),
      );
      setSubmission({ ...submission, metadata: merged });
      toast.success('Filed figures frozen — this submission now keeps both numbers');
      await loadDrift(submission.periodLabel);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Freeze failed';
      toast.error(msg);
    } finally {
      setFreezing(false);
    }
  };

  const snapshot = submission ? readReportedSnapshot(submission.metadata) : null;

  return (
    <ContentLayout title="NAAC DCF / AQAR Export">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NAAC', href: '/accreditation/naac' },
          { label: 'DCF Export', href: '/accreditation/naac/dcf-export' },
        ]}
      />

      <div className="space-y-6">
        <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <FileSpreadsheet className="h-4 w-4" />
          <AlertTitle>DCF 2025 / AQAR stub export</AlertTitle>
          <AlertDescription>
            Exports a workbook with the <strong>{totalMetrics} seeded NAAC metrics</strong>{' '}
            and evidence-row counts from the current substrate. Calculated values
            are placeholders — the full 90-row NAAC rubric + weighted formulas land
            in follow-up PRs as each evidence fan-out is retrofitted.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <FileDown className="h-5 w-5 text-indigo-600" />
              Export workbook
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>College</Label>
                <Select
                  value={institutionId}
                  onValueChange={setInstitutionId}
                  disabled={iLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select college" />
                  </SelectTrigger>
                  <SelectContent>
                    {(institutions ?? []).map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.iqac_code ? `[${inst.iqac_code}] ` : ''}
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Submission type</Label>
                <Select
                  value={submissionType}
                  onValueChange={(v) => setSubmissionType(v as SubmissionType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SUBMISSION_TYPE_LABELS) as SubmissionType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {SUBMISSION_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <StatCell
                label="Metrics in scope"
                value={mLoading ? '—' : String(totalMetrics)}
              />
              <StatCell
                label="Evidence rows"
                value={eLoading ? '—' : String(totalEvidence)}
              />
              <StatCell
                label="Coverage"
                value={
                  mLoading || eLoading
                    ? '—'
                    : totalMetrics === 0
                    ? '0%'
                    : `${Math.round((totalEvidence / totalMetrics) * 100)}%`
                }
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                onClick={handleExport}
                disabled={exporting || !institutionId || mLoading}
              >
                <Download className="mr-2 h-4 w-4" />
                {exporting ? 'Generating workbook…' : 'Download XLSX'}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              A row is written to <code>accreditation_submissions</code> on every
              download with status <Badge variant="outline">draft</Badge> and the
              coverage snapshot captured at export time. The Director's office can
              trace who exported what, when, and against which submission cycle.
            </p>
          </CardContent>
        </Card>

        {submission && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Lock className="h-5 w-5 text-emerald-600" />
                Freeze the filed figures
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!snapshot ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Once this workbook has actually been filed with NAAC, freeze the
                    per-metric counts as they stand right now. Evidence keeps arriving
                    afterwards, and without this the figure that was reported becomes
                    unrecoverable — only the number as at today survives.
                  </p>
                  <Alert>
                    <AlertTitle>This can only be done once</AlertTitle>
                    <AlertDescription>
                      A filed figure is a historical fact. There is no re-freeze: the
                      database refuses a second attempt, because re-running it would
                      quietly rewrite the filing to match the present and erase the very
                      gap this exists to show.
                    </AlertDescription>
                  </Alert>
                  <div className="flex justify-end">
                    <Button onClick={handleFreeze} disabled={freezing} variant="secondary">
                      <Lock className="mr-2 h-4 w-4" />
                      {freezing ? 'Freezing…' : 'Freeze filed figures'}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <StatCell label="Metrics filed" value={String(snapshot.metricCount)} />
                    <StatCell
                      label="Evidence rows filed"
                      value={String(snapshot.evidenceRows)}
                    />
                    <StatCell
                      label="Frozen at"
                      value={
                        snapshot.reportedAt
                          ? new Date(snapshot.reportedAt).toLocaleString('en-IN')
                          : '—'
                      }
                    />
                  </div>

                  {snapshot.metricCount === 0 && (
                    <Alert>
                      <AlertTitle>Nothing matched this cycle</AlertTitle>
                      <AlertDescription>
                        No evidence rows carry period <code>{submission.periodLabel}</code>{' '}
                        for this college, so the filing was frozen as empty. That is
                        recorded honestly rather than back-filled — check that the
                        evidence period labels match the submission cycle.
                      </AlertDescription>
                    </Alert>
                  )}

                  {driftNote && (
                    <p className="text-sm text-muted-foreground">{driftNote}</p>
                  )}

                  {driftRows && driftRows.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Reported vs actual today</Label>
                      <ul className="divide-y rounded-lg border">
                        {driftRows.map((row) => (
                          <li
                            key={row.metric_code}
                            className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
                          >
                            <span className="font-medium">{row.metric_code}</span>
                            <span className="text-muted-foreground">
                              {describeDrift(
                                row.reported === null ? null : Number(row.reported),
                                Number(row.actual),
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
