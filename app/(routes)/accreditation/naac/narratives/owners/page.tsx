// app/(routes)/accreditation/naac/narratives/owners/page.tsx
// ============================================================================
// /accreditation/naac/narratives/owners — the IQAC owner-assignment desk.
//
// Records WHO owns each (institution × NAAC metric) pair, so an AI-drafted
// narrative routes to a real person instead of landing in the unassigned queue.
// fn_accreditation_resolve_metric_owner reads this table AT DRAFT TIME, so a
// pair is listed here as soon as it has cited evidence — not only once a draft
// exists — otherwise every assignment would arrive too late to route its own
// draft. Pairs already carrying an owner are always listed too, so an existing
// assignment can never disappear from this page.
//
// Writes go straight through the session (browser) client: the
// accreditation_metric_owners FOR ALL policy carries both USING and WITH CHECK
// on user_has_permission('accreditation.naac.narrative.manage') AND
// role_has_institution_access(institution_id), so RLS is the whole guard and no
// SECURITY DEFINER RPC is needed. Because a blocked write comes back as an
// EMPTY result rather than an error, every write asserts on returned rows.
//
// Gated by accreditation.naac.narrative.manage (MENU_PERMISSIONS).
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
import { SearchableSelect } from '@/components/ui/searchable-select';
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
  UserCheck,
  Building2,
  Inbox,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import {
  BODY_LEVEL_CODE_LABEL,
  BODY_LEVEL_NAME_LABEL,
  groupPairsByInstitution,
  isBodyLevelPair,
  pairKey,
  type MetricPair,
} from './_lib/owner-desk-rows';

const BODY_CODE = 'NAAC';

/**
 * Roles a narrative owner may be drawn from. These are DB role keys, not copy —
 * the Senior Learner teaching roles plus the principal who signs the criteria
 * off. Kept as a named constant so the candidate pool is greppable.
 */
const OWNER_CANDIDATE_ROLES = ['faculty', 'hod', 'principal'];

/** Upper bound on the candidate pool; the dropdown searches within it. */
const CANDIDATE_LIMIT = 500;

const UNASSIGNED_VALUE = '__unassigned__';

interface OwnerRow {
  id: string;
  institution_id: string;
  body_code: string;
  /**
   * NULLABLE in production. NULL is a WHOLE-BODY assignment — every NAAC metric
   * at that campus inherits its owner. Typing this `string` is what let a bare
   * `.localeCompare()` reach a null and take the page down on 2026-08-14.
   */
  metric_code: string | null;
  owner_user_id: string | null;
}

interface CandidateProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

// ----------------------------------------------------------------------------
// Reads — session client throughout; RLS scopes every result.
// ----------------------------------------------------------------------------

/**
 * The assignable pairs: anything with a draft, anything with cited evidence,
 * and anything already assigned. Evidence lives behind its own permission
 * (accreditation.evidence.view), so a coordinator without it still gets the
 * narrative-backed pairs — that read degrades to empty instead of failing.
 */
function useMetricPairs() {
  return useQuery({
    queryKey: ['accreditation', 'naac', 'owner-desk', 'pairs'],
    queryFn: async (): Promise<MetricPair[]> => {
      const sb = createClientSupabaseClient() as any;

      const [narrativeRes, evidenceRes] = await Promise.all([
        sb
          .from('accreditation_metric_narratives')
          .select('institution_id, metric_code')
          .eq('body_code', BODY_CODE),
        sb
          .from('quality_evidence_mappings')
          .select('institution_id, metric_code')
          .eq('body_code', BODY_CODE),
      ]);

      if (narrativeRes.error) throw narrativeRes.error;

      const byKey = new Map<string, MetricPair>();
      const add = (
        institution_id: string | null,
        metric_code: string | null,
        from: 'narrative' | 'evidence',
      ) => {
        if (!institution_id || !metric_code) return;
        const key = `${institution_id}::${metric_code}`;
        const existing = byKey.get(key) ?? {
          institution_id,
          metric_code,
          hasNarrative: false,
          hasEvidence: false,
        };
        if (from === 'narrative') existing.hasNarrative = true;
        else existing.hasEvidence = true;
        byKey.set(key, existing);
      };

      for (const r of (narrativeRes.data ?? []) as any[]) {
        add(r.institution_id, r.metric_code, 'narrative');
      }
      // evidenceRes.error is intentionally swallowed — see the hook comment.
      for (const r of (evidenceRes.data ?? []) as any[]) {
        add(r.institution_id, r.metric_code, 'evidence');
      }

      return [...byKey.values()];
    },
    staleTime: 60 * 1000,
  });
}

function useOwnerRows() {
  return useQuery({
    queryKey: ['accreditation', 'naac', 'owner-desk', 'owners'],
    queryFn: async (): Promise<OwnerRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('accreditation_metric_owners')
        .select('id, institution_id, body_code, metric_code, owner_user_id')
        .eq('body_code', BODY_CODE);
      if (error) throw error;
      return (data ?? []) as OwnerRow[];
    },
    staleTime: 30 * 1000,
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
      return (data ?? []).reduce((acc: Record<string, string>, r: any) => {
        acc[r.metric_code] = r.metric_name;
        return acc;
      }, {});
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
      return (data ?? []).reduce((acc: Record<string, string>, r: any) => {
        acc[r.id] = r.name;
        return acc;
      }, {});
    },
    staleTime: 30 * 60 * 1000,
  });
}

/** The pool a coordinator picks from. */
function useCandidateOwners() {
  return useQuery({
    queryKey: ['profiles', 'narrative-owner-candidates'],
    queryFn: async (): Promise<CandidateProfile[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('profiles')
        .select('id, full_name, email')
        .in('role', OWNER_CANDIDATE_ROLES)
        .order('full_name', { ascending: true })
        .limit(CANDIDATE_LIMIT);
      if (error) throw error;
      return (data ?? []) as CandidateProfile[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Names for people already recorded as owners. Someone whose role has since
 * changed would otherwise fall outside the candidate pool and render as a blank
 * dropdown — this keeps the current value visible and re-selectable. Keyed on a
 * STABLE joined string so a fresh array identity each render never re-fires it.
 */
function useAssignedOwnerNames(ownerIds: string[]) {
  const key = useMemo(() => [...new Set(ownerIds)].sort().join(','), [ownerIds]);
  return useQuery({
    queryKey: ['profiles', 'assigned-owner-names', key],
    enabled: key.length > 0,
    queryFn: async (): Promise<CandidateProfile[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('profiles')
        .select('id, full_name, email')
        .in('id', key.split(',').filter(Boolean));
      if (error) throw error;
      return (data ?? []) as CandidateProfile[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ----------------------------------------------------------------------------
function AccessDenied() {
  return (
    <ContentLayout title="Assign Narrative Owners">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-lg">
            You do not have access to this page
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Recording who owns each NAAC metric decides where an AI-drafted
            narrative is sent for review, so it is limited to the people who run
            IQAC for a campus.
          </p>
          <p>
            To get access, contact your IQAC coordinator and ask for the
            <span className="font-medium text-foreground">
              {' '}
              Assign Narrative Owners{' '}
            </span>
            permission (<code>accreditation.naac.narrative.manage</code>).
          </p>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}

function DeskSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 w-full" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full" />
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
export default function NAACNarrativeOwnersPage() {
  const qc = useQueryClient();
  const {
    can,
    isSuperAdmin,
    isLoading: permsLoading,
    userProfile,
  } = usePermissions();

  const [filter, setFilter] = useState<'all' | 'unassigned' | 'assigned'>('all');
  // Keyed `${institution_id}::${metric_code}` while a write is in flight.
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const canManage =
    isSuperAdmin || can('accreditation.naac.narrative.manage');

  const { data: pairs, isLoading: pairsLoading, error: pairsError } =
    useMetricPairs();
  const { data: ownerRows, isLoading: ownersLoading } = useOwnerRows();
  const { data: metricNames } = useMetricNames();
  const { data: institutionNames } = useInstitutionNames();
  const { data: candidates } = useCandidateOwners();

  // owner lookup: `${institution_id}::${metric_code}` → owner_user_id
  const ownerByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of ownerRows ?? []) {
      if (r.owner_user_id) m.set(pairKey(r.institution_id, r.metric_code), r.owner_user_id);
    }
    return m;
  }, [ownerRows]);

  /**
   * Every pair worth showing: the evidence/draft-backed ones PLUS any pair that
   * already carries an owner row. Without the second half, an owner whose metric
   * later lost its evidence (re-tagged metric_code, deleted draft) would vanish
   * from this page while STAYING live for fn_accreditation_resolve_metric_owner
   * — an invisible row that keeps misrouting drafts and cannot be cleared.
   */
  const allPairs = useMemo(() => {
    const byKey = new Map<string, MetricPair>();
    for (const p of pairs ?? []) byKey.set(pairKey(p.institution_id, p.metric_code), p);
    for (const r of ownerRows ?? []) {
      const key = pairKey(r.institution_id, r.metric_code);
      if (byKey.has(key)) continue;
      byKey.set(key, {
        institution_id: r.institution_id,
        metric_code: r.metric_code,
        hasNarrative: false,
        hasEvidence: false,
      });
    }
    return [...byKey.values()];
  }, [pairs, ownerRows]);

  const assignedIds = useMemo(
    () =>
      (ownerRows ?? [])
        .map((r) => r.owner_user_id)
        .filter((v): v is string => !!v),
    [ownerRows],
  );
  const { data: assignedProfiles } = useAssignedOwnerNames(assignedIds);

  // Candidate pool ∪ people already assigned, de-duplicated on id.
  const people = useMemo(() => {
    const m = new Map<string, CandidateProfile>();
    for (const p of candidates ?? []) m.set(p.id, p);
    for (const p of assignedProfiles ?? []) if (!m.has(p.id)) m.set(p.id, p);
    return m;
  }, [candidates, assignedProfiles]);

  const personLabel = (id: string) => {
    const p = people.get(id);
    if (!p) return 'Owner assigned';
    return p.full_name || p.email || 'Owner assigned';
  };

  const ownerOptions = useMemo(() => {
    const opts = [...people.values()]
      .map((p) => ({
        value: p.id,
        label: p.full_name || p.email || p.id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: UNASSIGNED_VALUE, label: 'Unassigned' }, ...opts];
  }, [people]);

  // Pairs → per-institution buckets, whole-body row first, then metric-code
  // sorted. Extracted to _lib/owner-desk-rows so the ordering is testable; a
  // null metric_code here used to throw and blank the whole page.
  const grouped = useMemo(
    () =>
      groupPairsByInstitution(allPairs, ownerByKey, filter, institutionNames),
    [allPairs, ownerByKey, filter, institutionNames],
  );

  const totals = useMemo(() => {
    const total = allPairs.length;
    const assigned = allPairs.filter((p) =>
      ownerByKey.has(pairKey(p.institution_id, p.metric_code)),
    ).length;
    return { total, assigned, unassigned: total - assigned };
  }, [allPairs, ownerByKey]);

  // --------------------------------------------------------------------------
  // Write — upsert on pick, delete on Unassigned. RLS refuses out-of-scope rows
  // by returning NOTHING rather than erroring, so both paths assert on the rows
  // actually returned; a silent no-op must never read as success.
  // --------------------------------------------------------------------------
  async function assignOwner(pair: MetricPair, nextValue: string) {
    const key = pairKey(pair.institution_id, pair.metric_code);
    // What to call this row in a toast. Interpolating a null metric_code would
    // literally read "null assigned to Priya."
    const pairLabel = isBodyLevelPair(pair)
      ? BODY_LEVEL_CODE_LABEL
      : pair.metric_code;
    const current = ownerByKey.get(key) ?? null;
    const next = nextValue === UNASSIGNED_VALUE ? null : nextValue;
    if (next === current) return;

    setSavingKey(key);
    try {
      const sb = createClientSupabaseClient() as any;

      if (next) {
        // created_by records the person who last set this owner — the table has
        // no separate updated_by, and "who routed this metric" is the fact IQAC
        // needs when a narrative turns up on the wrong desk.
        const { data, error } = await sb
          .from('accreditation_metric_owners')
          .upsert(
            {
              institution_id: pair.institution_id,
              body_code: BODY_CODE,
              metric_code: pair.metric_code,
              owner_user_id: next,
              created_by: userProfile?.id ?? null,
            },
            { onConflict: 'institution_id,body_code,metric_code' },
          )
          .select('id');
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(
            'The change was not saved — you may not have access to this campus.',
          );
        }
        toast.success(`${pairLabel} assigned to ${personLabel(next)}.`);
      } else {
        // This desk manages INSTITUTION-LEVEL ownership only. programme_id
        // NOT NULL is a different axis — one degree programme's slice (NBA) —
        // and the desk neither reads nor keys on it, so a programme-scoped row
        // collapses into the same visible row as the institution-level one.
        // Without `.is('programme_id', null)` the delete takes both and still
        // reports success. owner-digest.ts scopes institution ownership the
        // same way (institutionScopedRows).
        //
        // A whole-body row is then matched with .is(), not .eq(): PostgREST
        // turns .eq('metric_code', null) into `metric_code=eq.null`, which
        // never matches a real SQL NULL, so the delete removed nothing and the
        // guard below blamed the reader's permissions for a row they are
        // perfectly entitled to clear. Until this page crashed on sort, no row
        // could be clicked at all — fixing the sort is what makes both of these
        // paths reachable, which is why they are fixed here and not left.
        let del = sb
          .from('accreditation_metric_owners')
          .delete()
          .eq('institution_id', pair.institution_id)
          .eq('body_code', BODY_CODE)
          .is('programme_id', null);
        del = isBodyLevelPair(pair)
          ? del.is('metric_code', null)
          : del.eq('metric_code', pair.metric_code);

        const { data, error } = await del.select('id');
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(
            'The change was not saved — you may not have access to this campus.',
          );
        }
        toast.success(`${pairLabel} is now unassigned.`);
      }

      await qc.invalidateQueries({
        queryKey: ['accreditation', 'naac', 'owner-desk', 'owners'],
      });
    } catch (e) {
      toast.error((e as Error).message || 'Could not save the owner.');
    } finally {
      setSavingKey(null);
    }
  }

  // --------------------------------------------------------------------------
  // Permissions resolve asynchronously — render the skeleton while UNKNOWN, or
  // a real coordinator sees the denial card on every cold load.
  if (permsLoading) {
    return (
      <ContentLayout title="Assign Narrative Owners">
        <DeskSkeleton />
      </ContentLayout>
    );
  }
  if (!canManage) return <AccessDenied />;

  const loading = pairsLoading || ownersLoading;

  return (
    <ContentLayout title="Assign Narrative Owners">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NAAC', href: '/accreditation/naac' },
          { label: 'AI Narratives', href: '/accreditation/naac/narratives' },
          {
            label: 'Assign Owners',
            href: '/accreditation/naac/narratives/owners',
          },
        ]}
      />

      <div className="space-y-6">
        {/* Header */}
        <Card className="border-indigo-200 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <UserCheck className="h-6 w-6 text-indigo-600" />
              Who owns each NAAC metric
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              An AI-drafted narrative is routed to the Senior Learner recorded
              here for its metric. Assign the owner before the drafter runs and
              the draft arrives on the right desk; leave it blank and the draft
              waits in the IQAC queue for someone to pick up. A metric appears
              below as soon as it has cited evidence, so ownership can be set
              ahead of the first draft.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">
                  Metrics in scope
                </div>
                <div className="text-2xl font-bold">
                  {loading ? '—' : totals.total}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">
                  Owner assigned
                </div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {loading ? '—' : totals.assigned}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">
                  Still unassigned
                </div>
                <div
                  className={`text-2xl font-bold ${
                    totals.unassigned > 0 ? 'text-amber-600 dark:text-amber-400' : ''
                  }`}
                >
                  {loading ? '—' : totals.unassigned}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Show</span>
              <Select
                value={filter}
                onValueChange={(v) => setFilter(v as typeof filter)}
              >
                <SelectTrigger className="w-[220px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All metrics</SelectItem>
                  <SelectItem value="unassigned">Unassigned only</SelectItem>
                  <SelectItem value="assigned">Assigned only</SelectItem>
                </SelectContent>
              </Select>
              <Link
                href="/accreditation/naac/narratives"
                className="ml-auto"
              >
                <Button variant="outline" size="sm" className="gap-1">
                  <ArrowLeft className="h-4 w-4" />
                  Back to narratives
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Per-institution assignment tables */}
        {loading ? (
          <DeskSkeleton />
        ) : pairsError ? (
          <Card>
            <CardContent className="p-6 text-sm text-red-600 dark:text-red-400">
              Could not load metrics: {(pairsError as Error).message}
            </CardContent>
          </Card>
        ) : grouped.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <p className="text-sm">
                {totals.total === 0
                  ? 'No NAAC metrics carry evidence or a draft yet, so there is nothing to assign.'
                  : 'No metrics match this filter.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          grouped.map((group) => {
            const groupAssigned = group.rows.filter((r) =>
              ownerByKey.has(pairKey(r.institution_id, r.metric_code)),
            ).length;
            return (
              <Card key={group.institutionId}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    {group.institutionName}
                    <Badge variant="outline" className="font-normal">
                      {groupAssigned} of {group.rows.length} assigned
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table className="min-w-[640px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Metric</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Current owner</TableHead>
                          <TableHead className="w-[280px]">Assign to</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.rows.map((pair) => {
                          const key = pairKey(pair.institution_id, pair.metric_code);
                          const ownerId = ownerByKey.get(key) ?? null;
                          const busy = savingKey === key;
                          const bodyLevel = isBodyLevelPair(pair);
                          return (
                            <TableRow key={key} className="hover:bg-muted/40">
                              {/*
                                A whole-body row has NO metric code. Rendering
                                {null} gives React nothing, so both lines came
                                out blank and the row read as broken data — say
                                what it actually covers instead.
                              */}
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {bodyLevel
                                      ? BODY_LEVEL_CODE_LABEL
                                      : pair.metric_code}
                                  </span>
                                  <span className="text-sm font-medium">
                                    {bodyLevel
                                      ? BODY_LEVEL_NAME_LABEL
                                      : (metricNames?.[pair.metric_code!] ??
                                        pair.metric_code)}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {pair.hasNarrative && (
                                    <Badge
                                      variant="outline"
                                      className="font-normal"
                                    >
                                      Draft
                                    </Badge>
                                  )}
                                  {pair.hasEvidence && (
                                    <Badge
                                      variant="outline"
                                      className="font-normal"
                                    >
                                      Evidence
                                    </Badge>
                                  )}
                                  {!pair.hasNarrative && !pair.hasEvidence && (
                                    <Badge
                                      variant="outline"
                                      className="font-normal text-amber-700 dark:text-amber-300"
                                    >
                                      Owner record only
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {ownerId ? (
                                  personLabel(ownerId)
                                ) : (
                                  <span className="text-amber-700 dark:text-amber-300">
                                    Unassigned — IQAC queue
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <SearchableSelect
                                    className="w-[240px]"
                                    value={ownerId ?? UNASSIGNED_VALUE}
                                    onValueChange={(v) => assignOwner(pair, v)}
                                    options={ownerOptions}
                                    placeholder="Unassigned"
                                    searchPlaceholder="Search by name or email…"
                                    emptyMessage="No Senior Learner matches."
                                    disabled={busy}
                                  />
                                  {busy && (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                  )}
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
            );
          })
        )}
      </div>
    </ContentLayout>
  );
}
