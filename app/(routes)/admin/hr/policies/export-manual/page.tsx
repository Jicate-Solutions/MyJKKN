'use client';

// =====================================================================
// /admin/hr/policies/export-manual — Wave 3 M10 manual auto-generator
// =====================================================================
// Director's R5-Q3 lock: PDF + HTML + JSON formats all required.
//
// This page is the user-facing entry to the policy-driven HR Manual
// auto-generator. The server-side endpoint `/api/hr/policies/export-manual`
// does the actual rendering; this page is a thin shell that:
//   1. Lets the user pick an institution
//   2. Shows a section-by-section preview (HTML), and
//   3. Provides three download buttons (PDF / HTML / JSON).
//
// Permission: super_admin only (PermissionGuard).
// =====================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileJson,
  FileText,
  Loader2,
  Printer,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import { useAuth } from '@/hooks/use-auth';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { MANUAL_SECTIONS } from '@/lib/services/hr/manual-exporter-service';

// ---------------------------------------------------------------------------
// Page wrapper
// ---------------------------------------------------------------------------

export default function ExportManualPage() {
  return (
    <PermissionGuard module="users" action="manage">
      <ContentLayout title="Export HR Policy Manual">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies', href: '/admin/hr/policies' },
            { label: 'Export manual' },
          ]}
        />
        <ExportManualContent />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

interface SummaryItem {
  number: number;
  title: string;
  policy_count: number;
}

interface BundleSummary {
  institution: { id: string; name: string };
  generated_at: string;
  section_count: number;
  policy_count: number;
  sections: SummaryItem[];
}

function ExportManualContent() {
  const { profile } = useAuth();
  const { institutions, loading: instLoading } = useInstitutionsWithAccess({
    entityType: 'institution',
  });

  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');
  const [summary, setSummary] = useState<BundleSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [downloading, setDownloading] = useState<null | 'pdf' | 'html' | 'json'>(
    null
  );

  // Default to user's institution.
  useEffect(() => {
    if (selectedInstitutionId) return;
    if (profile?.institution_id) {
      setSelectedInstitutionId(profile.institution_id);
      return;
    }
    if (institutions.length > 0) {
      setSelectedInstitutionId(institutions[0].id);
    }
  }, [profile?.institution_id, institutions, selectedInstitutionId]);

  // Load preview summary whenever institution changes.
  useEffect(() => {
    if (!selectedInstitutionId) return;
    let cancelled = false;
    (async () => {
      setLoadingSummary(true);
      try {
        const res = await fetch(
          `/api/hr/policies/export-manual?format=json&institution_id=${encodeURIComponent(selectedInstitutionId)}`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          institution: { id: string; name: string };
          generated_at: string;
          section_count: number;
          policy_count: number;
          sections: Array<{ number: number; title: string; policies: unknown[] }>;
        };
        if (cancelled) return;
        setSummary({
          institution: body.institution,
          generated_at: body.generated_at,
          section_count: body.section_count,
          policy_count: body.policy_count,
          sections: body.sections.map((s) => ({
            number: s.number,
            title: s.title,
            policy_count: s.policies.length,
          })),
        });
      } catch (e) {
        if (!cancelled) {
          toast.error(
            `Could not load manual preview: ${e instanceof Error ? e.message : String(e)}`
          );
          setSummary(null);
        }
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedInstitutionId]);

  const apiHref = useMemo(() => {
    if (!selectedInstitutionId) return '';
    return `/api/hr/policies/export-manual?format=html&institution_id=${encodeURIComponent(selectedInstitutionId)}`;
  }, [selectedInstitutionId]);

  async function downloadAs(format: 'pdf' | 'html' | 'json') {
    if (!selectedInstitutionId || !summary) return;
    setDownloading(format);
    try {
      const url = `/api/hr/policies/export-manual?format=${format}&institution_id=${encodeURIComponent(selectedInstitutionId)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || err?.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const filename = filenameFor(format, summary.institution.name);
      triggerBlobDownload(blob, filename);
      toast.success(`Downloaded ${filename}`);
    } catch (e) {
      toast.error(
        `Download failed: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setDownloading(null);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (instLoading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <Alert>
        <FileText className="h-4 w-4" />
        <AlertTitle>HR Policy Manual auto-generator</AlertTitle>
        <AlertDescription>
          This page renders the HR Policy Manual on-demand from the current
          state of <code>platform_policies</code>. Edit any policy in{' '}
          <code>/admin/hr/policies/*</code> and the next export reflects the
          change — no developer involvement. Three formats are available: PDF
          (print/email), HTML (web/preview), JSON (programmatic).
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Institution</CardTitle>
          <CardDescription>
            Each institution has its own policy state. Select one to preview
            and export.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="institution-select">Institution</Label>
            <Select
              value={selectedInstitutionId}
              onValueChange={setSelectedInstitutionId}
            >
              <SelectTrigger id="institution-select" className="max-w-md">
                <SelectValue placeholder="Select an institution" />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              type="button"
              onClick={() => downloadAs('pdf')}
              disabled={!summary || downloading !== null}
            >
              {downloading === 'pdf' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download PDF
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => downloadAs('html')}
              disabled={!summary || downloading !== null}
            >
              {downloading === 'html' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Download HTML
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => downloadAs('json')}
              disabled={!summary || downloading !== null}
            >
              {downloading === 'json' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileJson className="mr-2 h-4 w-4" />
              )}
              Download JSON
            </Button>
            <Button asChild type="button" variant="outline" disabled={!apiHref}>
              <Link href={apiHref} target="_blank" rel="noopener">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open HTML in new tab
              </Link>
            </Button>
            <Button asChild type="button" variant="outline">
              <Link href="/admin/hr/policies">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to policies
              </Link>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Tip: to print the manual on paper, open the HTML in a new tab and
            use your browser&apos;s <Printer className="inline h-3 w-3" />{' '}
            print dialog — it is print-stylesheet ready.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>
            {summary
              ? `${summary.policy_count} policies will render across ${summary.section_count} sections.`
              : 'Loading manual preview…'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingSummary ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          ) : !summary ? (
            <p className="text-sm text-muted-foreground">
              No preview available. Select an institution above.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{summary.institution.name}</Badge>
                <span>·</span>
                <span>
                  Generated{' '}
                  {new Date(summary.generated_at).toLocaleString('en-IN')}
                </span>
                <span>·</span>
                <Badge variant="secondary">
                  {summary.policy_count} polic
                  {summary.policy_count === 1 ? 'y' : 'ies'}
                </Badge>
              </div>
              <ol className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {summary.sections.map((s) => (
                  <li
                    key={s.number}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2"
                  >
                    <span className="truncate">
                      <span className="font-mono text-xs text-muted-foreground mr-2">
                        {String(s.number).padStart(2, '0')}
                      </span>
                      {s.title}
                    </span>
                    <Badge
                      variant={s.policy_count > 0 ? 'default' : 'outline'}
                      className="shrink-0"
                    >
                      {s.policy_count}
                    </Badge>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted-foreground">
                Sections with <Badge variant="outline">0</Badge> have no
                policy rows seeded for this institution yet — they render as
                empty placeholders in the manual.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Section coverage map</CardTitle>
          <CardDescription>
            The 25-section structure mirrors the legacy .docx HR Policy Manual.
            Each section is driven by one or more <code>hr.*</code> policy keys.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm">
            {MANUAL_SECTIONS.map((s) => (
              <li
                key={s.number}
                className="rounded-md border border-border bg-muted/20 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-mono text-xs text-muted-foreground mr-2">
                      {String(s.number).padStart(2, '0')}
                    </span>
                    <span className="font-medium">{s.title}</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      {s.description}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {s.keys.map((k) => (
                      <code key={k} className="text-[10px] text-muted-foreground">
                        {k}
                        {k.endsWith('.') ? '*' : ''}
                      </code>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function filenameFor(format: 'pdf' | 'html' | 'json', institution: string) {
  const slug =
    institution
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'institution';
  return `hr-policy-manual-${slug}.${format}`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
