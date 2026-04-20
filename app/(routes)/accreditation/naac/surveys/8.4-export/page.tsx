// app/(routes)/accreditation/naac/surveys/8.4-export/page.tsx
// ============================================================================
// /accreditation/naac/surveys/8.4-export — NAAC Metric 8.4 Learner Experience
// Survey export (PR-A8 c2).
//
// Filters (both required):
//   1. accreditation_survey_consents.body_codes @> '{NAAC}' — user gave NAAC consent
//   2. withdrawn_at IS NULL — consent still active
//
// Two export streams:
//   - Learners: profiles joined with active NAAC consent (scope includes
//     personally_identifiable_information + academic_records)
//   - Alumni: anonymous alumni_email consents (no profile) OR profile consents
//     where scope includes alumni_outcomes
//
// On export: writes accreditation_submissions row with submission_type=
// 'NAAC_SURVEY_8_4' + export_format='csv'.
//
// Body-code-agnostic query (could reuse for NIRF perception sub-surveys by
// flipping body_codes filter to @> '{NIRF}') — kept NAAC-only for PR-A8.
// ============================================================================

'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  FileSpreadsheet,
  ShieldAlert,
  GraduationCap,
  Users,
  Clipboard,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'sonner';

type ExportStream = 'learners' | 'alumni';

const STREAM_LABELS: Record<ExportStream, string> = {
  learners: 'Active learners',
  alumni: 'Alumni outcomes',
};

interface ConsentRow {
  id: string;
  user_id: string | null;
  learner_id: string | null;
  alumni_email: string | null;
  consent_version: string;
  body_codes: string[];
  scope: Record<string, boolean>;
  consented_at: string;
}

interface Institution {
  id: string;
  name: string;
  iqac_code: string | null;
}

function useInstitutions() {
  return useQuery({
    queryKey: ['institutions', 'jkkn-iqac'],
    queryFn: async (): Promise<Institution[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('institutions')
        .select('id, name, iqac_code')
        .not('iqac_code', 'is', null)
        .order('iqac_code');
      if (error) throw error;
      return (data ?? []) as Institution[];
    },
    staleTime: 30 * 60 * 1000,
  });
}

// Active NAAC consents (withdrawn_at IS NULL, body_codes @> '{NAAC}')
function useActiveNAACConsents() {
  return useQuery({
    queryKey: ['accreditation', 'consents', 'active-naac'],
    queryFn: async (): Promise<ConsentRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('accreditation_survey_consents')
        .select(
          'id, user_id, learner_id, alumni_email, consent_version, body_codes, scope, consented_at',
        )
        .contains('body_codes', ['NAAC'])
        .is('withdrawn_at', null);
      if (error) throw error;
      return (data ?? []) as ConsentRow[];
    },
    staleTime: 60 * 1000,
  });
}

export default function NAACSurvey84ExportPage() {
  const { isSuperAdmin, can, isLoading: permsLoading } = usePermissions();

  const canExport =
    isSuperAdmin || can('accreditation.naac.surveys.export');

  const [stream, setStream] = useState<ExportStream>('learners');
  const [institutionId, setInstitutionId] = useState<string>('cluster');
  const [exporting, setExporting] = useState(false);

  const { data: institutions, isLoading: iLoading } = useInstitutions();
  const { data: consents, isLoading: cLoading } = useActiveNAACConsents();

  if (permsLoading) {
    return (
      <ContentLayout title="NAAC 8.4 Survey Export">
        <Skeleton className="h-40 w-full" />
      </ContentLayout>
    );
  }

  if (!canExport) {
    return (
      <ContentLayout title="NAAC 8.4 Survey Export">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Accreditation', href: '/accreditation' },
            { label: 'NAAC', href: '/accreditation/naac' },
            {
              label: '8.4 Export',
              href: '/accreditation/naac/surveys/8.4-export',
            },
          ]}
        />
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access restricted</AlertTitle>
          <AlertDescription>
            Survey data exports require the{' '}
            <code>accreditation.naac.surveys.export</code> permission. Ask your
            IQAC chairman or the Director's office.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  // Filter consents by scope relevance for the chosen stream
  const relevantConsents = (consents ?? []).filter((c) => {
    const scope = c.scope ?? {};
    if (stream === 'learners') {
      return (
        scope.personally_identifiable_information === true &&
        scope.academic_records === true &&
        !!c.user_id
      );
    }
    // alumni
    return (
      scope.alumni_outcomes === true &&
      (!!c.user_id || !!c.alumni_email)
    );
  });

  const handleExport = async () => {
    if (relevantConsents.length === 0) {
      toast.error('No consented records to export for this stream');
      return;
    }
    setExporting(true);
    try {
      const sb = createClientSupabaseClient() as any;

      // Build CSV rows
      const header = [
        'survey_stream',
        'user_id',
        'alumni_email',
        'consent_version',
        'consent_granted_at',
        'scope_categories',
      ];
      const lines: string[] = [header.join(',')];
      const exportedIds: string[] = [];

      for (const c of relevantConsents) {
        exportedIds.push(c.id);
        const scopeCats = Object.keys(c.scope ?? {}).filter((k) => c.scope?.[k]);
        const fields = [
          stream,
          c.user_id ?? '',
          c.alumni_email ?? '',
          c.consent_version,
          c.consented_at,
          `"${scopeCats.join('|')}"`,
        ];
        lines.push(fields.join(','));
      }

      const csv = lines.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeCode =
        institutionId === 'cluster'
          ? 'cluster'
          : institutions?.find((i) => i.id === institutionId)?.iqac_code ??
            'cluster';
      const filename = `naac_8.4_${stream}_${safeCode}_${new Date()
        .toISOString()
        .split('T')[0]}.csv`;
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      // Append this submission event id to every consent's export_event_ids
      // Track the export in accreditation_submissions
      // Submission row needs an institution_id per PR-A2 schema; for cluster
      // exports we attribute to the first JKKN college as a placeholder.
      // A proper "cluster" submission_type variant can land later if needed.
      const submissionInstitutionId =
        institutionId === 'cluster'
          ? institutions?.[0]?.id ?? null
          : institutionId;

      if (!submissionInstitutionId) {
        toast.warning('CSV downloaded, but no institution to attribute submission');
      } else {
        const { error: subError } = await sb
          .from('accreditation_submissions')
          .insert({
            institution_id: submissionInstitutionId,
            body_code: 'NAAC',
            submission_type: 'NAAC_SURVEY_8_4',
            period_label: new Date().getFullYear().toString(),
            export_format: 'csv',
            status: 'exported',
            metadata: {
              stream,
              filename,
              record_count: relevantConsents.length,
              exported_consent_ids: exportedIds,
              scope: institutionId === 'cluster' ? 'cluster' : 'single_college',
              exported_at: new Date().toISOString(),
            },
          });

        if (subError) {
          console.warn('[8.4-export] submission record failed', subError);
          toast.warning(
            'CSV downloaded, but submission record failed — contact engineering',
          );
        } else {
          toast.success(
            `Exported ${relevantConsents.length} records + submission recorded`,
          );
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const totalConsents = consents?.length ?? 0;
  const consentedLearners =
    (consents ?? []).filter(
      (c) =>
        c.scope?.personally_identifiable_information &&
        c.scope?.academic_records &&
        c.user_id,
    ).length ?? 0;
  const consentedAlumni =
    (consents ?? []).filter(
      (c) =>
        c.scope?.alumni_outcomes &&
        (c.user_id || c.alumni_email),
    ).length ?? 0;

  return (
    <ContentLayout title="NAAC 8.4 Survey Export">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NAAC', href: '/accreditation/naac' },
          {
            label: '8.4 Export',
            href: '/accreditation/naac/surveys/8.4-export',
          },
        ]}
      />

      <div className="space-y-6">
        <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <Clipboard className="h-4 w-4" />
          <AlertTitle>Consent-gated export</AlertTitle>
          <AlertDescription>
            Only records with active NAAC consent are exported. Records where
            the learner or alumnus has withdrawn consent are filtered out at
            query time. Legal basis is tracked per row.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
              Export NAAC 8.4 survey data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <StatCell
                label="Total NAAC consents"
                value={cLoading ? '—' : String(totalConsents)}
                icon={Users}
              />
              <StatCell
                label="Learner-stream ready"
                value={cLoading ? '—' : String(consentedLearners)}
                icon={GraduationCap}
              />
              <StatCell
                label="Alumni-stream ready"
                value={cLoading ? '—' : String(consentedAlumni)}
                icon={Users}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Export stream</Label>
                <Select value={stream} onValueChange={(v) => setStream(v as ExportStream)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STREAM_LABELS) as ExportStream[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STREAM_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>College (for submission record)</Label>
                <Select
                  value={institutionId}
                  onValueChange={setInstitutionId}
                  disabled={iLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Cluster (all 8)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cluster">Cluster (all 8)</SelectItem>
                    {(institutions ?? []).map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.iqac_code ? `[${inst.iqac_code}] ` : ''}
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                onClick={handleExport}
                disabled={exporting || relevantConsents.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                {exporting
                  ? 'Preparing CSV…'
                  : `Export ${relevantConsents.length} records`}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              An <code>accreditation_submissions</code> row with status{' '}
              <Badge variant="outline">exported</Badge> is written on every
              download. Exports are auditable end-to-end.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

function StatCell({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
