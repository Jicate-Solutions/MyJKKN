'use client';

/**
 * /admission/social/lead-ads
 *
 * Lead Ads admin: lists synced forms, lets admin edit field-mapping rules,
 * fire a test lead, and review the last 50 webhook events.
 *
 * Built as a single file (under 400 LOC) to keep the surface area small.
 * No new hooks/services — uses fetch directly against the admin API.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, FlaskConical, Settings2, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeadAdsSubmissions } from '@/hooks/admin/use-lead-ads-submissions';
import type { LeadAdsSubmission } from '@/lib/services/admin/lead-ads-service';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// --------------------------------------------------------------------------
// Types — local to this page to avoid pulling in new modules
// --------------------------------------------------------------------------

interface FormRow {
  id: string;
  fb_form_id: string;
  fb_page_id: string;
  name: string;
  status: string;
  locale: string | null;
  leads_count: number;
  institution_id: string | null;
  questions: Array<{ key: string; label: string; type?: string }>;
  is_active: boolean;
  last_synced_at: string | null;
  last_backfilled_at: string | null;
  mapping_count: number;
}

interface MappingRow {
  id: string;
  fb_field_key: string;
  lead_column: string;
  transform: string | null;
  is_required: boolean;
}

interface MappingsPayload {
  form: {
    id: string;
    fb_form_id: string;
    name: string;
    institution_id: string | null;
    questions: Array<{ key: string; label: string; type?: string }>;
  };
  mappings: MappingRow[];
  allowed_lead_columns: string[];
}

interface EventRow {
  id: string;
  fb_form_id: string | null;
  fb_leadgen_id: string;
  status: 'pending' | 'imported' | 'merged' | 'failed' | 'skipped';
  lead_id: string | null;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
  attempt_count: number;
}

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Admission', href: '/admission' },
  { label: 'Social Media', href: '/admission/social' },
  { label: 'Lead Ads' },
];

export default function LeadAdsAdminPage() {
  const qc = useQueryClient();
  const [editingForm, setEditingForm] = useState<FormRow | null>(null);

  // Forms list
  const formsQuery = useQuery({
    queryKey: ['lead-ads', 'forms'],
    queryFn: async (): Promise<FormRow[]> => {
      const res = await fetch('/api/admin/social/lead-ads/forms');
      if (!res.ok) throw new Error(`forms HTTP ${res.status}`);
      const json = (await res.json()) as { data: FormRow[] };
      return json.data ?? [];
    },
  });

  // Events list
  const eventsQuery = useQuery({
    queryKey: ['lead-ads', 'events'],
    queryFn: async (): Promise<EventRow[]> => {
      const res = await fetch('/api/admin/social/lead-ads/events?limit=50');
      if (!res.ok) throw new Error(`events HTTP ${res.status}`);
      const json = (await res.json()) as { data: EventRow[] };
      return json.data ?? [];
    },
    refetchInterval: 30_000,
  });

  const handleSync = useCallback(async () => {
    const res = await fetch('/api/admin/social/lead-ads/forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      alert(`Sync failed: ${j.error ?? res.statusText}`);
      return;
    }
    qc.invalidateQueries({ queryKey: ['lead-ads', 'forms'] });
  }, [qc]);

  return (
    <PermissionGuard
      module="social.lead_ads"
      action="view"
      fallback={
        <ContentLayout title="Lead Ads">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You do not have permission to view this page. Ask an administrator
            to grant the Social Media permissions to your role.
          </div>
        </ContentLayout>
      }
    >
    <ContentLayout title="Meta Lead Ads">
      <PageBreadcrumb items={breadcrumbItems} />

      <div className="mt-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Meta Lead Ads</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Synced Facebook Lead Generation forms, their question→column mappings,
              and the most recent webhook activity.
            </p>
          </div>
          <Button onClick={handleSync} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Sync forms from Meta
          </Button>
        </div>

        <FormsSection
          query={formsQuery}
          onEdit={(f) => setEditingForm(f)}
        />

        <ReceivedLeadsSection />

        <EventsSection query={eventsQuery} />
      </div>

      {editingForm && (
        <MappingsDialog
          form={editingForm}
          onClose={() => setEditingForm(null)}
        />
      )}
    </ContentLayout>
    </PermissionGuard>
  );
}

// --------------------------------------------------------------------------
// Forms section
// --------------------------------------------------------------------------

interface FormsSectionProps {
  query: ReturnType<typeof useQuery<FormRow[]>>;
  onEdit: (f: FormRow) => void;
}

function FormsSection({ query, onEdit }: FormsSectionProps) {
  if (query.isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }
  if (query.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load forms: {(query.error as Error).message}
        </AlertDescription>
      </Alert>
    );
  }
  const forms = query.data ?? [];
  if (forms.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No forms synced yet. Click <strong>Sync forms from Meta</strong> after the
          Page Access Token (META_LEAD_ADS_PAGE_ACCESS_TOKEN) and webhook subscription
          are configured.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="rounded-md border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Form</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead className="text-right">Mappings</TableHead>
            <TableHead>Last synced</TableHead>
            <TableHead>Last backfilled</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {forms.map((f) => (
            <TableRow key={f.id}>
              <TableCell>
                <div className="font-medium">{f.name}</div>
                <div className="text-xs text-muted-foreground">
                  page {f.fb_page_id} · form {f.fb_form_id}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={f.status === 'ACTIVE' ? 'default' : 'secondary'}>
                  {f.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{f.leads_count}</TableCell>
              <TableCell className="text-right">{f.mapping_count}</TableCell>
              <TableCell className="text-xs">{formatTs(f.last_synced_at)}</TableCell>
              <TableCell className="text-xs">{formatTs(f.last_backfilled_at)}</TableCell>
              <TableCell className="text-right space-x-2">
                <Button size="sm" variant="outline" onClick={() => onEdit(f)}>
                  <Settings2 className="w-4 h-4 mr-1" />
                  Mappings
                </Button>
                <TestLeadButton formId={f.id} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// --------------------------------------------------------------------------
// Mappings dialog
// --------------------------------------------------------------------------

interface MappingsDialogProps {
  form: FormRow;
  onClose: () => void;
}

function MappingsDialog({ form, onClose }: MappingsDialogProps) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<MappingRow[]>([]);
  const [institutionId, setInstitutionId] = useState<string>(form.institution_id ?? '');
  const [saving, setSaving] = useState(false);

  const mappingsQuery = useQuery({
    queryKey: ['lead-ads', 'mappings', form.id],
    queryFn: async (): Promise<MappingsPayload> => {
      const res = await fetch(`/api/admin/social/lead-ads/forms/${form.id}/mappings`);
      if (!res.ok) throw new Error(`mappings HTTP ${res.status}`);
      const json = (await res.json()) as { data: MappingsPayload };
      return json.data;
    },
  });

  useEffect(() => {
    if (mappingsQuery.data) {
      setDraft(mappingsQuery.data.mappings);
      setInstitutionId(mappingsQuery.data.form.institution_id ?? '');
    }
  }, [mappingsQuery.data]);

  const questions = mappingsQuery.data?.form.questions ?? [];
  const allowed = mappingsQuery.data?.allowed_lead_columns ?? [];

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/social/lead-ads/forms/${form.id}/mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings: draft.filter((m) => m.lead_column),
          institution_id: institutionId || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(`Save failed: ${j.error ?? res.statusText}`);
        return;
      }
      qc.invalidateQueries({ queryKey: ['lead-ads', 'forms'] });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Mappings — {form.name}</DialogTitle>
          <DialogDescription>
            Pick a MyJKKN lead column for each Meta question. Unmapped questions
            still land in the capture row&apos;s raw_payload for audit.
          </DialogDescription>
        </DialogHeader>

        {mappingsQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Default institution ID</label>
              <Input
                value={institutionId}
                onChange={(e) => setInstitutionId(e.target.value)}
                placeholder="UUID of institution (or leave blank for global policy fallback)"
              />
            </div>

            <div className="rounded-md border max-h-[50vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Meta question</TableHead>
                    <TableHead>Lead column</TableHead>
                    <TableHead>Transform</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {questions.map((q) => {
                    const current = draft.find((m) => m.fb_field_key === q.key);
                    return (
                      <TableRow key={q.key}>
                        <TableCell>
                          <div className="font-medium text-sm">{q.label}</div>
                          <div className="text-xs text-muted-foreground">{q.key}</div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={current?.lead_column ?? '__none__'}
                            onValueChange={(v) => {
                              setDraft((prev) => {
                                const next = prev.filter((m) => m.fb_field_key !== q.key);
                                if (v && v !== '__none__') {
                                  next.push({
                                    id: current?.id ?? crypto.randomUUID(),
                                    fb_field_key: q.key,
                                    lead_column: v,
                                    transform: current?.transform ?? null,
                                    is_required: current?.is_required ?? false,
                                  });
                                }
                                return next;
                              });
                            }}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="(unmapped)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">(unmapped)</SelectItem>
                              {allowed.map((col) => (
                                <SelectItem key={col} value={col}>{col}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={current?.transform ?? '__none__'}
                            onValueChange={(v) => {
                              setDraft((prev) => prev.map((m) =>
                                m.fb_field_key === q.key
                                  ? { ...m, transform: v === '__none__' ? null : v }
                                  : m
                              ));
                            }}
                            disabled={!current}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="(none)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">(none)</SelectItem>
                              <SelectItem value="trim">trim</SelectItem>
                              <SelectItem value="lowercase">lowercase</SelectItem>
                              <SelectItem value="phone_e164">phone_e164</SelectItem>
                              <SelectItem value="split_first_name">split_first_name</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {questions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                        No questions on file. Re-sync forms to refresh the question list.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || mappingsQuery.isLoading}>
            {saving ? 'Saving…' : 'Save mappings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------------------
// Test-lead button (no popup; runs inline + shows result via alert)
// --------------------------------------------------------------------------

function TestLeadButton({ formId }: { formId: string }) {
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/social/lead-ads/forms/${formId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: { status: string; reason?: string; leadId?: string };
        error?: string;
      };
      if (!res.ok || !json.ok) {
        alert(`Test failed: ${json.error ?? res.statusText}`);
      } else {
        const r = json.result;
        alert(`Test result: ${r?.status}\nLead id: ${r?.leadId ?? '—'}\n${r?.reason ?? ''}`);
        qc.invalidateQueries({ queryKey: ['lead-ads', 'events'] });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={busy}>
      <FlaskConical className="w-4 h-4 mr-1" />
      {busy ? 'Sending…' : 'Test lead'}
    </Button>
  );
}

// --------------------------------------------------------------------------
// Events log
// --------------------------------------------------------------------------

function EventsSection({ query }: { query: ReturnType<typeof useQuery<EventRow[]>> }) {
  const events = query.data ?? [];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Recent events</h2>
      {query.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="rounded-md border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Leadgen ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{formatTs(e.received_at)}</TableCell>
                  <TableCell className="text-xs">{e.fb_form_id ?? '—'}</TableCell>
                  <TableCell className="text-xs font-mono">{e.fb_leadgen_id}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(e.status)}>{e.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{e.lead_id ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {e.error_message ?? ''}
                  </TableCell>
                </TableRow>
              ))}
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                    No events yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Received Leads section
//
// Surfaces meta_leadgen_events hydrated by the importer, joined with the
// admission_leads row when the importer succeeded. This is the answer to
// "what Lead Ads submissions have we actually received and what happened
// to them?" — a level above the raw event log.
// --------------------------------------------------------------------------

function ReceivedLeadsSection() {
  const submissionsQuery = useLeadAdsSubmissions({ limit: 50 });
  const rows = submissionsQuery.data ?? [];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold">Received leads</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Webhook submissions with hydrated form data, linked to the CRM lead the
            importer created. Refreshes every 30 seconds.
          </p>
        </div>
      </div>

      {submissionsQuery.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : submissionsQuery.error ? (
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load submissions: {(submissionsQuery.error as Error).message}
          </AlertDescription>
        </Alert>
      ) : rows.length === 0 ? (
        <Alert>
          <AlertDescription>
            No Lead Ads submissions received yet. Once Meta sends a leadgen webhook,
            the row will appear here. If you see events in <strong>Recent events</strong>{' '}
            but nothing here, the importer hasn&apos;t hydrated them yet — check that
            the <code>meta.leadgen.is_enabled</code> policy is on and{' '}
            <code>META_LEAD_ADS_PAGE_ACCESS_TOKEN</code> is set.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-md border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Submitted</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>CRM lead</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <ReceivedLeadRow key={r.event_id} row={r} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ReceivedLeadRow({ row }: { row: LeadAdsSubmission }) {
  return (
    <TableRow>
      <TableCell className="text-xs">{formatTs(row.submitted_at)}</TableCell>
      <TableCell className="text-xs">
        <div className="font-medium">{row.form_name ?? '—'}</div>
        <div className="text-muted-foreground">{row.fb_form_id ?? ''}</div>
      </TableCell>
      <TableCell className="text-sm">{row.full_name ?? '—'}</TableCell>
      <TableCell className="text-xs">{row.email ?? '—'}</TableCell>
      <TableCell className="text-xs">{row.phone ?? '—'}</TableCell>
      <TableCell>
        {row.lead_id ? (
          <Link
            href={`/admission/leads/${row.lead_id}`}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            prefetch={false}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {row.lead_full_name ?? 'View lead'}
            <ExternalLink className="w-3 h-3" />
          </Link>
        ) : row.status === 'failed' || row.status === 'skipped' ? (
          <span
            className="inline-flex items-center gap-1 text-xs text-amber-600"
            title={row.error_message ?? ''}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            not created
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">processing…</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Badge variant={submissionStatusVariant(row.status)}>
          {row.status}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

function submissionStatusVariant(
  s: LeadAdsSubmission['status']
): 'default' | 'secondary' | 'destructive' {
  if (s === 'imported' || s === 'merged') return 'default';
  if (s === 'failed') return 'destructive';
  return 'secondary';
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function statusVariant(s: EventRow['status']): 'default' | 'secondary' | 'destructive' {
  if (s === 'imported' || s === 'merged') return 'default';
  if (s === 'failed') return 'destructive';
  return 'secondary';
}

function formatTs(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString();
}
