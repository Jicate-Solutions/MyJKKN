// app/(routes)/accreditation/my-gaps/page.tsx
// ============================================================================
// /accreditation/my-gaps — the per-owner worklist.
//
// The body dashboards answer "what does NAAC want". This page answers the only
// question an accountable person actually has: what do I owe, where do I do it,
// and by when. It is scoped to the signed-in viewer and shows nobody else's
// workload — seeing across people is what the dashboards are for.
//
// There is no grade, no score and no ranking of people anywhere on this page,
// on purpose. Counting what somebody owes is not a measure of how good they
// are, and a leaderboard of who carries the most gaps would make this a page
// people avoid opening.
//
// Reads are session-client throughout, so RLS scopes every result. Every
// resolution rule lives in ./_lib/worklist.ts as pure functions with their own
// tests — importing this page would pull the Supabase client in at module
// scope, which cannot load under vitest.
//
// Gated accreditation.view (MENU_PERMISSIONS).
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
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Inbox,
  Loader2,
  MapPin,
  XCircle,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import {
  buildWorklist,
  classifyAssignment,
  daysUntil,
  metricCodesToScan,
  EVIDENCE_SCAN_LIMIT,
  type EvidenceRow,
  type MetricCatalogRow,
  type OwnerAssignmentRow,
  type SourceRegistryRow,
  type SubmissionRow,
  type WorklistItem,
} from './_lib/worklist';

/** Where IQAC assigns accreditation owners. Named in the empty state. */
const OWNER_DESK_ROUTE = '/accreditation/naac/narratives/owners';

/**
 * Roles that satisfy `is_admin()` in the database. Mirrored here for ONE
 * advisory purpose only (see canProbablyReadAssignments) — never to gate a
 * read, which RLS already does on its own.
 */
const DB_ADMIN_ROLES = ['admin', 'super_admin', 'administrator'];

/** Body landing pages, for the "where do I do it" link on each row. */
const BODY_ROUTES: Record<string, string> = {
  NAAC: '/accreditation/naac',
  NIRF: '/accreditation/nirf',
  NBA: '/accreditation/nba',
  QS: '/accreditation/qs',
  DCI: '/accreditation/dci',
  PCI: '/accreditation/pci',
  INC: '/accreditation/inc',
  NCTE: '/accreditation/ncte',
  AICTE: '/accreditation/aicte',
  UGC: '/accreditation/ugc',
  CAC: '/accreditation/cac',
};

const todayIso = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The viewer's own assignment rows. Scoped by owner_user_id, then again by RLS. */
function useMyAssignments(userId: string | undefined) {
  return useQuery({
    queryKey: ['accreditation', 'my-gaps', 'assignments', userId],
    enabled: !!userId,
    queryFn: async (): Promise<OwnerAssignmentRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('accreditation_metric_owners')
        .select(
          'id, institution_id, body_code, metric_code, programme_id, assignment_status, acknowledged_at, previous_owner_user_id, owner_changed_at',
        )
        .eq('owner_user_id', userId);
      if (error) throw error;
      return (data ?? []) as OwnerAssignmentRow[];
    },
    staleTime: 30 * 1000,
  });
}

function useMetricCatalog() {
  return useQuery({
    queryKey: ['accreditation', 'my-gaps', 'metric-catalog'],
    queryFn: async (): Promise<MetricCatalogRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('sh_accreditation_metrics')
        .select('metric_type, metric_code, metric_name, category')
        .eq('is_active', true);
      if (error) throw error;
      return (data ?? []) as MetricCatalogRow[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Due dates. `accreditation.submissions.view` is held by no role today, so for
 * most people this read comes back empty and every row simply shows "no date
 * set". That degrades the page rather than breaking it, which is why the error
 * is swallowed instead of thrown — a missing due date must never cost somebody
 * the list of what they owe.
 */
function useSubmissions() {
  return useQuery({
    queryKey: ['accreditation', 'my-gaps', 'submissions'],
    queryFn: async (): Promise<SubmissionRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data } = await sb
        .from('accreditation_submissions')
        .select('institution_id, body_code, period_label, due_date, submitted_at');
      return (data ?? []) as SubmissionRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * What has actually been captured for the metrics the viewer owns. Bounded by
 * the owned metric codes AND by EVIDENCE_SCAN_LIMIT; when the cap is hit the
 * page says its counts are a minimum rather than under-reporting silently.
 */
function useEvidence(metricCodes: string[]) {
  const key = useMemo(() => metricCodes.join(','), [metricCodes]);
  return useQuery({
    queryKey: ['accreditation', 'my-gaps', 'evidence', key],
    enabled: key.length > 0,
    queryFn: async (): Promise<{ rows: EvidenceRow[]; truncated: boolean }> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('quality_evidence_mappings')
        .select('institution_id, body_code, metric_code, source_table')
        .in('metric_code', key.split(','))
        .limit(EVIDENCE_SCAN_LIMIT);
      // Swallowing this turned a failed read into the sentence "Nothing captured
      // yet — this is the gap", which is a factual claim about the college. A
      // read that did not happen must not render as an answer.
      //
      // Honest limit: this catches a thrown failure (42P01, a too-long URL, the
      // network). It CANNOT catch an RLS denial — PostgREST answers those with
      // 0 rows and error === null, which is indistinguishable from a real empty
      // result at this layer. Readability is enforced by the policy instead.
      if (error) throw error;
      const rows = (data ?? []) as EvidenceRow[];
      return { rows, truncated: rows.length >= EVIDENCE_SCAN_LIMIT };
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * The evidence source registry — the "where do I do it" half of the page.
 * `fix_route` / `fix_hint` arrive in a separate, currently unmerged change, so
 * the columns are never named in the select and are read defensively off each
 * row. This works identically before and after that change lands.
 */
function useSourceRegistry() {
  return useQuery({
    queryKey: ['accreditation', 'my-gaps', 'source-registry'],
    queryFn: async (): Promise<SourceRegistryRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data } = await sb.from('quality_evidence_source_registry').select('*');
      return (data ?? []) as SourceRegistryRow[];
    },
    staleTime: 30 * 60 * 1000,
  });
}

function useInstitutionNames() {
  return useQuery({
    queryKey: ['institutions', 'names-map'],
    queryFn: async (): Promise<Record<string, string>> => {
      const sb = createClientSupabaseClient() as any;
      const { data } = await sb.from('institutions').select('id, name');
      return (data ?? []).reduce((acc: Record<string, string>, r: any) => {
        acc[r.id] = r.name;
        return acc;
      }, {});
    },
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Names for programme-scoped assignments. A raw UUID is never rendered.
 *
 * The table is `programs` with `program_name` — NOT `programmes`/`programme_name`.
 * The column on this side reads `programme_id` (British spelling, matching the
 * Director's wording in decision 6) while the table it points at is American,
 * and prod confirms the direction: `accreditation_metric_owners.programme_id`
 * carries the FK annotation "Foreign Key to `programs.id`". Reading the local
 * column name as the remote table name returns 42P01 relation does not exist.
 *
 * The error is RE-THROWN. Swallowing it returned `{}` forever, so every
 * programme label silently vanished and the comment above stayed technically
 * true — a raw UUID was never rendered because nothing was. A page built on the
 * premise that a failure must never look like an answer cannot itself have a
 * read that fails quietly.
 *
 * This never fired in testing because `accreditation_metric_owners` holds 0 rows
 * and this query is gated on `enabled: key.length > 0`. It would have gone live
 * latent and surfaced on the first programme-scoped NBA assignment.
 */
function useProgrammeNames(programmeIds: string[]) {
  const key = useMemo(() => [...new Set(programmeIds)].sort().join(','), [programmeIds]);
  return useQuery({
    queryKey: ['programs', 'my-gaps-names', key],
    enabled: key.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('programs')
        .select('id, program_name')
        .in('id', key.split(','));
      if (error) throw error;
      return (data ?? []).reduce((acc: Record<string, string>, r: any) => {
        acc[r.id] = r.program_name;
        return acc;
      }, {});
    },
    staleTime: 30 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Write — acknowledgement
// ---------------------------------------------------------------------------

/**
 * Accept or decline one's OWN assignment.
 *
 * The write must go through fn_accreditation_acknowledge_ownership: the only
 * write policy on accreditation_metric_owners demands
 * accreditation.naac.narrative.manage, which is the power to ASSIGN and which
 * owners deliberately do not hold. A direct .update() is therefore refused by
 * RLS with a SILENT zero-row result and no error at all.
 *
 * Success is asserted on OBSERVED STATE — the row is re-read and its stored
 * status must be the one we asked for — never on the absence of an error, and
 * never on the RPC's return shape. Anyone who could see the button can read the
 * row, so this check cannot false-fail. The one exception is a decline that
 * also hands the row away: it then correctly disappears from the viewer's own
 * scope, which is success, not failure.
 */
async function acknowledge(assignmentId: string, decision: 'confirmed' | 'declined') {
  const sb = createClientSupabaseClient() as any;

  const { error } = await sb.rpc('fn_accreditation_acknowledge_ownership', {
    p_owner_id: assignmentId,
    p_decision: decision,
  });
  if (error) throw new Error(error.message);

  const { data: after, error: readError } = await sb
    .from('accreditation_metric_owners')
    .select('id, assignment_status')
    .eq('id', assignmentId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  if (!after) {
    if (decision === 'declined') return; // no longer yours to see — as intended
    throw new Error('The assignment could not be confirmed. Please ask IQAC to check it.');
  }
  const stored = classifyAssignment(after.assignment_status);
  const expected = decision === 'confirmed' ? 'owed' : 'declined';
  if (stored !== expected) {
    throw new Error('Your answer was not recorded. Please try again, or contact IQAC.');
  }
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

function AccessDenied() {
  return (
    <ContentLayout>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-lg">You do not have access to this page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            This page lists the accreditation work assigned to you personally, so
            it is limited to people who take part in accreditation.
          </p>
          <p>
            To get access, ask your IQAC coordinator for the{' '}
            <span className="font-medium text-foreground">View Accreditation Landing</span>{' '}
            permission (<code>accreditation.view</code>).
          </p>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}

function DueBadge({ dueDate, periodLabel }: { dueDate: string | null; periodLabel: string | null }) {
  if (!dueDate) {
    return (
      <span className="text-xs text-muted-foreground">No date set</span>
    );
  }
  const days = daysUntil(dueDate, todayIso());
  const tone =
    days < 0
      ? 'border-red-300 text-red-700 dark:border-red-900 dark:text-red-300'
      : days <= 14
        ? 'border-amber-300 text-amber-800 dark:border-amber-900 dark:text-amber-300'
        : 'border-muted-foreground/30 text-muted-foreground';
  const when =
    days < 0
      ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} past due`
      : days === 0
        ? 'due today'
        : `in ${days} day${days === 1 ? '' : 's'}`;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${tone}`}>
      <CalendarClock className="h-3 w-3" />
      {dueDate} — {when}
      {periodLabel ? <span className="opacity-70">({periodLabel})</span> : null}
    </span>
  );
}

function WorkRow({
  item,
  institutionName,
  programmeName,
}: {
  item: WorklistItem;
  institutionName: string | null;
  programmeName: string | null;
}) {
  const bodyRoute = BODY_ROUTES[item.bodyCode] ?? '/accreditation';
  const nothingCaptured = item.evidenceCount === 0;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-72 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{item.bodyCode}</Badge>
            {item.metricCode ? (
              <span className="font-medium">{item.metricCode}</span>
            ) : (
              <span className="font-medium">Every metric in this body</span>
            )}
            {item.via === 'inherited' && (
              <Badge variant="secondary" className="text-[11px] font-normal">
                via your whole-body assignment
              </Badge>
            )}
          </div>
          {item.metricName && (
            <p className="text-sm text-muted-foreground">{item.metricName}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {institutionName ?? 'Institution'}
            {programmeName ? ` · ${programmeName}` : ''}
            {item.category ? ` · ${item.category}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <DueBadge dueDate={item.dueDate} periodLabel={item.periodLabel} />
          <Button asChild variant="outline" size="sm">
            <Link href={bodyRoute}>
              Open {item.bodyCode}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <Separator className="my-3" />

      <div className="space-y-2 text-sm">
        {nothingCaptured ? (
          <p className="text-muted-foreground">
            {item.evidenceCountIsFloor
              ? 'No records found in the portion scanned. There may be more.'
              : 'Nothing captured yet — this is the gap.'}
          </p>
        ) : (
          <p className="text-muted-foreground">
            {item.evidenceCountIsFloor ? 'At least ' : ''}
            {item.evidenceCount} record{item.evidenceCount === 1 ? '' : 's'} already captured.
          </p>
        )}

        {item.sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            {item.sources.map((source) =>
              source.fixRoute ? (
                <Button key={source.sourceTable} asChild variant="ghost" size="sm" className="h-7 px-2">
                  <Link href={source.fixRoute} title={source.fixHint ?? undefined}>
                    {source.label}
                  </Link>
                </Button>
              ) : (
                <span
                  key={source.sourceTable}
                  className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  title={source.fixHint ?? undefined}
                >
                  {source.label}
                </span>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function MyAccreditationGapsPage() {
  const qc = useQueryClient();
  const { can, isSuperAdmin, isLoading: permsLoading, userProfile } = usePermissions();
  const [busyId, setBusyId] = useState<string | null>(null);

  const canView = isSuperAdmin || can('accreditation.view');
  const userId = userProfile?.id as string | undefined;

  /**
   * ADVISORY ONLY. The SELECT policy on accreditation_metric_owners is
   * `is_super_admin() OR is_admin() OR (user_has_permission(
   * 'accreditation.naac.narrative.view') AND role_has_institution_access(...))`
   * — it carries no clause for the named owner. An assigned owner without that
   * permission therefore reads ZERO rows with NO error, which is
   * indistinguishable from owning nothing.
   *
   * This flag never blocks the read; it only decides whether the empty state
   * adds a line saying the list may be incomplete, so the page can never tell
   * somebody "nothing is assigned to you" as though it were established fact.
   * Once the owner self-read clause lands the rows arrive and the line stops
   * appearing on its own.
   */
  const canProbablyReadAssignments =
    isSuperAdmin ||
    DB_ADMIN_ROLES.includes(String(userProfile?.role ?? '')) ||
    can('accreditation.naac.narrative.view');

  const { data: assignments, isLoading: assignmentsLoading, error: assignmentsError } =
    useMyAssignments(userId);
  const { data: metrics, isLoading: metricsLoading } = useMetricCatalog();
  const { data: submissions } = useSubmissions();
  const { data: registry } = useSourceRegistry();
  const { data: institutionNames } = useInstitutionNames();

  // Pass 1 — resolve what is owed so the evidence read can be scoped to it.
  const shape = useMemo(
    () =>
      buildWorklist({
        assignments: assignments ?? [],
        metrics: metrics ?? [],
        submissions: submissions ?? [],
        evidence: [],
        registry: [],
      }),
    [assignments, metrics, submissions],
  );

  const scanCodes = useMemo(() => metricCodesToScan(shape.owed), [shape.owed]);
  const { data: evidence } = useEvidence(scanCodes);

  const programmeIds = useMemo(
    () => (assignments ?? []).map((a) => a.programme_id).filter((p): p is string => !!p),
    [assignments],
  );
  const { data: programmeNames } = useProgrammeNames(programmeIds);

  // Pass 2 — the same pure function, now with evidence attached.
  const worklist = useMemo(
    () =>
      buildWorklist({
        assignments: assignments ?? [],
        metrics: metrics ?? [],
        submissions: submissions ?? [],
        evidence: evidence?.rows ?? [],
        registry: registry ?? [],
        evidenceTruncated: evidence?.truncated === true,
      }),
    [assignments, metrics, submissions, evidence, registry],
  );

  const respond = async (assignmentId: string, decision: 'confirmed' | 'declined') => {
    setBusyId(assignmentId);
    try {
      await acknowledge(assignmentId, decision);
      toast.success(decision === 'confirmed' ? 'Assignment accepted.' : 'Assignment declined.');
      await qc.invalidateQueries({ queryKey: ['accreditation', 'my-gaps', 'assignments'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record your answer.');
    } finally {
      setBusyId(null);
    }
  };

  if (permsLoading) {
    return (
      <ContentLayout>
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!canView) return <AccessDenied />;

  // `useMyAssignments` is gated on `enabled: !!userId`, and a DISABLED TanStack
  // query reports isLoading === false with error === null. Without `!userId`
  // here, any moment where the permission check has cleared but the profile id
  // has not yet resolved renders "Nothing is assigned to you yet." to someone
  // whose identity was never established — an answer to a question nobody asked.
  // Treat an unasked query as still loading.
  const loading = !userId || assignmentsLoading || metricsLoading;

  return (
    <ContentLayout>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'My Gaps', href: '/accreditation/my-gaps' },
        ]}
      />

      <div className="space-y-6">
        <Card className="border-indigo-200 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <ClipboardList className="h-6 w-6 text-indigo-600" />
              What you owe
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Only the accreditation work assigned to you, with where to do it
              and by when. Nobody else&apos;s workload appears here, and nothing
              on this page is a score.
            </p>
          </CardContent>
        </Card>

        {assignmentsError && (
          <Card className="border-red-200 dark:border-red-900/50">
            <CardContent className="flex items-start gap-3 pt-6 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div>
                <p className="font-medium">Your assignments could not be loaded.</p>
                <p className="text-muted-foreground">
                  This is a loading problem, not a sign that nothing is assigned
                  to you. Reload the page, and tell IQAC if it keeps happening.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {/* ── Awaiting your answer ─────────────────────────────────────────── */}
        {!loading && worklist.awaiting.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Waiting for your answer ({worklist.awaiting.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Somebody has put your name against this work. It is not yours
                until you say so.
              </p>
              {worklist.awaiting.map((item) => {
                const busy = busyId === item.assignmentId;
                return (
                  <div
                    key={item.assignmentId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{item.bodyCode}</Badge>
                        <span className="font-medium">
                          {item.metricCode ?? 'Every metric in this body'}
                        </span>
                      </div>
                      {item.metricName && (
                        <p className="text-sm text-muted-foreground">{item.metricName}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {institutionNames?.[item.institutionId] ?? 'Institution'}
                        {item.programmeId && programmeNames?.[item.programmeId]
                          ? ` · ${programmeNames[item.programmeId]}`
                          : ''}
                        {item.previousOwnerUserId ? ' · handed over from someone else' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => respond(item.assignmentId, 'confirmed')}
                      >
                        <CheckCircle2 className="mr-1 h-4 w-4" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => respond(item.assignmentId, 'declined')}
                      >
                        <XCircle className="mr-1 h-4 w-4" />
                        Decline
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* ── The worklist ─────────────────────────────────────────────────── */}
        {!loading && worklist.owed.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Yours to do ({worklist.owed.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {evidence?.truncated && (
                <p className="text-xs text-muted-foreground">
                  Counts below are a minimum — only the first{' '}
                  {EVIDENCE_SCAN_LIMIT.toLocaleString()} records were scanned.
                </p>
              )}
              {worklist.owed.map((item) => (
                <WorkRow
                  key={item.key}
                  item={item}
                  institutionName={institutionNames?.[item.institutionId] ?? null}
                  programmeName={
                    item.programmeId ? programmeNames?.[item.programmeId] ?? null : null
                  }
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Declined ─────────────────────────────────────────────────────── */}
        {!loading && worklist.declinedCount > 0 && (
          <p className="text-sm text-muted-foreground">
            You declined {worklist.declinedCount} assignment
            {worklist.declinedCount === 1 ? '' : 's'}. IQAC can reassign
            {worklist.declinedCount === 1 ? ' it' : ' them'}.
          </p>
        )}

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {/*
          With no owner rows in the system yet, this is what everybody sees on
          day one. It has to say plainly that nothing is assigned and who does
          the assigning — never a blank page, never "0 of 0".
        */}
        {!loading && !assignmentsError && worklist.isEmpty && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground" />
              <p className="text-base font-medium">Nothing is assigned to you yet.</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Accreditation work reaches this page once IQAC puts your name
                against a body or one of its metrics. Until then there is
                genuinely nothing here for you to do.
              </p>
              {!canProbablyReadAssignments && (
                <p className="max-w-md text-xs text-muted-foreground">
                  One caveat: your role cannot read the owner list directly, so
                  if you believe something has been assigned to you, ask IQAC to
                  confirm rather than treating this page as the last word.
                </p>
              )}
              <Button asChild variant="outline" size="sm" className="mt-1">
                <Link href={OWNER_DESK_ROUTE}>
                  Who assigns this?
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
