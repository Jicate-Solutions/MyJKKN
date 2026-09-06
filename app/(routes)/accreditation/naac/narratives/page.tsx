// app/(routes)/accreditation/naac/narratives/page.tsx
// ============================================================================
// /accreditation/naac/narratives — the draft → verify → submit work-list.
//
// Lists the AI-drafted NAAC criteria narratives the viewer is allowed to see
// (RLS scopes the query: owners see their own; narrative.view holders see their
// institution's; admins see all). Each row shows the metric, institution,
// period, workflow status, the deterministic grounding verdict, and the owning
// Senior Learner (or the IQAC/admin queue when unassigned). Rows link to the
// detail page where the narrative is read, verified, and advanced.
//
// Gated by accreditation.naac.narrative.view (MENU_PERMISSIONS).
// ============================================================================

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Inbox,
  FileText,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  STATUS_LABEL,
  STATUS_BADGE_CLASS,
  NARRATIVE_STATUS_ORDER,
  UNASSIGNED_OWNER_LABEL,
  type NarrativeStatus,
  type GroundingVerdict,
} from './_lib/narrative-ui';

const BODY_CODE = 'NAAC';

interface NarrativeRow {
  id: string;
  institution_id: string;
  metric_code: string;
  period_label: string;
  status: NarrativeStatus;
  grounding_verdict: GroundingVerdict;
  owner_user_id: string | null;
  evidence_row_count: number | null;
  updated_at: string | null;
  // Return-edge measurement (20260928010000): how far the reviewer moved the
  // AI draft at okay. Optional — see the fallback in useNarratives.
  edit_ratio?: number | null;
}

// ----------------------------------------------------------------------------
// Data hooks — session client; RLS scopes what comes back. Metric names,
// institution names and owner names are enriched from lookup tables (metric_code
// is not a FK, so we join client-side, mirroring the NAAC dashboard).
// ----------------------------------------------------------------------------
const NARRATIVE_LIST_COLUMNS =
  'id, institution_id, metric_code, period_label, status, grounding_verdict, owner_user_id, evidence_row_count, updated_at';

function useNarratives() {
  return useQuery({
    queryKey: ['accreditation', 'naac', 'narratives', 'list'],
    queryFn: async (): Promise<NarrativeRow[]> => {
      const sb = createClientSupabaseClient() as any;
      // edit_ratio ships in migration 20260928010000. If code deploys before
      // that migration is applied, the explicit column would 400 the whole
      // work-list — so on an edit_ratio error we retry without it rather than
      // blacking out a fraud-critical review surface.
      let { data, error } = await sb
        .from('accreditation_metric_narratives')
        .select(`${NARRATIVE_LIST_COLUMNS}, edit_ratio`)
        .eq('body_code', BODY_CODE)
        .order('updated_at', { ascending: false });
      if (error && /edit_ratio/i.test(error.message ?? '')) {
        ({ data, error } = await sb
          .from('accreditation_metric_narratives')
          .select(NARRATIVE_LIST_COLUMNS)
          .eq('body_code', BODY_CODE)
          .order('updated_at', { ascending: false }));
      }
      if (error) throw error;
      return (data ?? []) as NarrativeRow[];
    },
    staleTime: 60 * 1000,
  });
}

function useMetricNames() {
  return useQuery({
    queryKey: ['accreditation', 'naac', 'metric-names'],
    queryFn: async (): Promise<Record<string, string>> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('sh_accreditation_metrics')
        .select('metric_code, metric_name')
        .eq('metric_type', BODY_CODE);
      if (error) throw error;
      return (data ?? []).reduce(
        (acc: Record<string, string>, r: any) => {
          acc[r.metric_code] = r.metric_name;
          return acc;
        },
        {},
      );
    },
    staleTime: 10 * 60 * 1000,
  });
}

function useInstitutionNames() {
  return useQuery({
    queryKey: ['institutions', 'names-map'],
    queryFn: async (): Promise<Record<string, string>> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb.from('institutions').select('id, name');
      if (error) throw error;
      return (data ?? []).reduce(
        (acc: Record<string, string>, r: any) => {
          acc[r.id] = r.name;
          return acc;
        },
        {},
      );
    },
    staleTime: 30 * 60 * 1000,
  });
}

// Owner names, keyed on a STABLE joined-string so the array identity changing
// every render never re-fires the fetch (an inline array prop would loop).
function useOwnerNames(ownerIds: string[]) {
  const key = useMemo(
    () => [...new Set(ownerIds)].sort().join(','),
    [ownerIds],
  );
  return useQuery({
    queryKey: ['profiles', 'owner-names', key],
    enabled: key.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const sb = createClientSupabaseClient() as any;
      const ids = key.split(',').filter(Boolean);
      const { data, error } = await sb
        .from('profiles')
        .select('id, full_name')
        .in('id', ids);
      if (error) throw error;
      return (data ?? []).reduce(
        (acc: Record<string, string>, r: any) => {
          acc[r.id] = r.full_name;
          return acc;
        },
        {},
      );
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ----------------------------------------------------------------------------
function GroundingBadge({ verdict }: { verdict: GroundingVerdict }) {
  if (verdict === 'grounded') {
    return (
      <Badge className="gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
        <ShieldCheck className="h-3 w-3" />
        Grounded
      </Badge>
    );
  }
  if (verdict === 'ungrounded') {
    return (
      <Badge className="gap-1 bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200">
        <ShieldAlert className="h-3 w-3" />
        Ungrounded
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Not validated
    </Badge>
  );
}

// ----------------------------------------------------------------------------
export default function NAACNarrativesListPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: narratives, isLoading, error } = useNarratives();
  const { data: metricNames } = useMetricNames();
  const { data: institutionNames } = useInstitutionNames();

  const ownerIds = useMemo(
    () =>
      (narratives ?? [])
        .map((n) => n.owner_user_id)
        .filter((v): v is string => !!v),
    [narratives],
  );
  const { data: ownerNames } = useOwnerNames(ownerIds);

  // Counts per status for the summary strip.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of narratives ?? []) c[n.status] = (c[n.status] ?? 0) + 1;
    return c;
  }, [narratives]);

  const ungroundedCount = useMemo(
    () => (narratives ?? []).filter((n) => n.grounding_verdict === 'ungrounded').length,
    [narratives],
  );

  const filtered = useMemo(
    () =>
      (narratives ?? []).filter(
        (n) => statusFilter === 'all' || n.status === statusFilter,
      ),
    [narratives, statusFilter],
  );

  return (
    <ContentLayout title="NAAC — AI Narrative Drafts">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NAAC', href: '/accreditation/naac' },
          { label: 'AI Narratives', href: '/accreditation/naac/narratives' },
        ]}
      />

      <div className="space-y-6">
        {/* Header */}
        <Card className="border-indigo-200 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-6 w-6 text-indigo-600" />
              AI-drafted NAAC criteria narratives
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Each narrative is drafted only from the metric&apos;s cited evidence,
              then checked by a deterministic grounding gate. The owning Senior
              Learner reviews and okays it, then the Principal approves and the
              Director submits. Nothing advances on its own, and a draft that fails
              the grounding gate can never be advanced.
            </p>

            {/* Stat strip */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Total drafts</div>
                <div className="text-2xl font-bold">
                  {isLoading ? '—' : (narratives ?? []).length}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Awaiting owner okay</div>
                <div className="text-2xl font-bold">
                  {isLoading
                    ? '—'
                    : (counts['ai_drafted'] ?? 0) + (counts['revision_requested'] ?? 0)}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Director submitted</div>
                <div className="text-2xl font-bold">
                  {isLoading ? '—' : counts['director_submitted'] ?? 0}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Ungrounded (blocked)</div>
                <div
                  className={`text-2xl font-bold ${ungroundedCount > 0 ? 'text-red-600 dark:text-red-400' : ''}`}
                >
                  {isLoading ? '—' : ungroundedCount}
                </div>
              </div>
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Filter</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[240px] bg-card">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {NARRATIVE_STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                      {counts[s] ? ` (${counts[s]})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Work-list */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="p-6 text-sm text-red-600 dark:text-red-400">
                Could not load narratives: {(error as Error).message}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
                <Inbox className="h-8 w-8" />
                <p className="text-sm">
                  {(narratives ?? []).length === 0
                    ? 'No narratives yet. Drafts appear here once the drafter has run for a period.'
                    : 'No narratives match this filter.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[780px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      <TableHead>Institution</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Grounding</TableHead>
                      <TableHead>Edited</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((n) => (
                      <TableRow key={n.id} className="hover:bg-muted/40">
                        <TableCell>
                          <Link
                            href={`/accreditation/naac/narratives/${n.id}`}
                            className="group flex flex-col"
                          >
                            <span className="font-mono text-xs text-muted-foreground">
                              {n.metric_code}
                            </span>
                            <span className="text-sm font-medium group-hover:underline">
                              {metricNames?.[n.metric_code] ?? n.metric_code}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          {institutionNames?.[n.institution_id] ?? '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {n.period_label}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_BADGE_CLASS[n.status]}>
                            {STATUS_LABEL[n.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <GroundingBadge verdict={n.grounding_verdict} />
                        </TableCell>
                        <TableCell
                          className="whitespace-nowrap text-sm text-muted-foreground"
                          title="How much the reviewer changed the AI draft at okay (0% = accepted verbatim)"
                        >
                          {n.edit_ratio == null
                            ? '—'
                            : `${Math.round(Number(n.edit_ratio) * 100)}%`}
                        </TableCell>
                        <TableCell className="text-sm">
                          {n.owner_user_id ? (
                            ownerNames?.[n.owner_user_id] ?? 'Owner assigned'
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                              <FileText className="h-3.5 w-3.5" />
                              {UNASSIGNED_OWNER_LABEL}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link href={`/accreditation/naac/narratives/${n.id}`}>
                            <Button variant="ghost" size="icon" aria-label="Open narrative">
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </Link>
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
