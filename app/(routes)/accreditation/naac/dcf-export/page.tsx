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
import { FileDown, ShieldAlert, Download, FileSpreadsheet } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

type SubmissionType = 'NAAC_AQAR_2024_25' | 'NAAC_SSR_2027';

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
      const { error: insertError } = await sb
        .from('accreditation_submissions')
        .insert({
          institution_id: institutionId,
          body_code: 'NAAC',
          submission_type: submissionType,
          period_label: periodLabel,
          export_format: 'xlsx',
          status: 'drafted',
          coverage_snapshot: coveragePct,
          metadata: {
            filename,
            metrics_seeded: totalMetrics,
            evidence_rows: totalEvidence,
            exported_at: new Date().toISOString(),
            note: 'Auto-generated stub export; values pending substrate fan-out',
          },
        });
      if (insertError) {
        console.warn('[accreditation/dcf-export] submission row insert failed:', insertError);
        toast.warning(
          'Export downloaded, but submission record failed — contact engineering',
        );
      } else {
        toast.success('Export downloaded + submission recorded');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Export failed';
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

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
              download with status <Badge variant="outline">drafted</Badge> and the
              coverage snapshot captured at export time. The Director's office can
              trace who exported what, when, and against which submission cycle.
            </p>
          </CardContent>
        </Card>
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
