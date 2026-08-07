// app/(routes)/accreditation/manage/owners/page.tsx
// ============================================================================
// /accreditation/manage/owners — where IQAC assigns accountability and the
// named person accepts it.
//
// Production carries 107 metrics across 10 bodies and ZERO owner rows, so every
// metric is currently somebody-else's-problem. This page is what turns "here is
// a gap" into "here is YOUR gap". Director decisions 2 and 8, locked 2026-08-01.
//
// Three levels, one table. `accreditation_metric_owners` distinguishes them by
// `metric_code`:
//   Level 1  metric_code NULL  → one accountable person per body per campus.
//                                69 NAAC metrics owned by a single row.
//   Level 3  metric_code set   → the exceptions, which override the inherited
//                                body owner and render as such.
// Level 2 (committee) is READ-ONLY here: convenor/chair already live in
// accreditation_committee_members.role, and a second place to set them would be
// two answers to one question. This page shows what that roster says and links
// to the committee that owns editing it.
//
// An assignment is PENDING until the named person confirms it — accountability
// accepted, not imposed (decision 8). The live CHECK
// `(assignment_status = 'pending') = (acknowledged_at IS NULL)` makes the two
// facts inseparable, so every write here sets them as a pair.
//
// Deliberately absent: no overall grade, no total score, no ranking of colleges
// or of people. The CAC and IQAC dashboards both made that call and this page
// matches them. Counting who is accountable is not scoring how good they are.
//
// Writes go through the session (browser) client. The FOR ALL policy on
// accreditation_metric_owners carries USING and WITH CHECK on
// user_has_permission('accreditation.naac.narrative.manage') AND
// role_has_institution_access(institution_id), so RLS is the whole guard. A
// blocked write comes back EMPTY rather than as an error, so every write here
// asserts on the rows actually returned.
//
// Gated by accreditation.naac.narrative.VIEW (MENU_PERMISSIONS). Opening the
// page and answering an assignment addressed to you needs only view; assigning
// or reassigning anyone else additionally needs .manage. Gating the whole page
// on .manage shipped the accept/decline buttons to an audience of nobody —
// that key is true on one role held by one person, while the 102 HODs and 10
// principals who are the intended owners hit the access-denied panel.
//
// The acknowledgement write goes through fn_accreditation_acknowledge_ownership
// rather than a direct update, because the FOR ALL policy below demands .manage
// for every write. A permissive row policy would have been the wrong fix: RLS
// restricts rows and cannot restrict columns, so it would also have let an owner
// rewrite owner_user_id and hand their accountability to somebody else.
//
// Accept/Decline must exist at BOTH levels. The first version rendered them only
// in the body-owner table, so every metric-level exception — and every row the
// "assign a whole category" control writes — landed as pending with no button
// anywhere to answer it: the same unreachable-button dead end one level down.
// The pair therefore also renders on an EXPLICIT metric row addressed to the
// signed-in person, and never on an inherited one (whose row is the body row,
// already answerable above). "Assigned to me" exists for the same reason — a
// pending row counts as owned and so vanishes from the 'unassigned' view the
// page opens on.
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
  Users,
  Inbox,
  Loader2,
  Check,
  X,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import {
  resolveMetricOwners,
  tallyOwnership,
  tallyByBody,
  findBodyOwnerRow,
  metricCodesInCategory,
  categoriesForBody,
  bodyCodes as listBodyCodes,
  ownerSourceLabel,
  canAnswerAssignment,
  isAssignedTo,
  shouldSkipAssign,
  type OwnerRow,
  type FrameworkMetric,
  type ResolvedOwner,
  type AssignmentStatus,
} from './_lib/owner-inheritance';
import {
  filterMetricsToScope,
  bodiesForScope,
  appliesToNobody,
  scopeSentence,
} from '../../_lib/institution-body-scope';
import { useInstitutionBodyScope } from '@/hooks/accreditation/use-institution-bodies';

/**
 * The pool a coordinator picks from. Mirrors the narrative owner desk
 * (faculty / hod / principal) and adds accreditation_officer — the role
 * literally named for this job.
 */
const OWNER_CANDIDATE_ROLES = [
  'principal',
  'hod',
  'faculty',
  'accreditation_officer',
];

const CANDIDATE_LIMIT = 500;
const UNASSIGNED_VALUE = '__unassigned__';

/**
 * The conflict target must name every column of the live constraint
 * `UNIQUE NULLS NOT DISTINCT (institution_id, body_code, metric_code,
 * programme_id)`. NULLS NOT DISTINCT is what lets the body-level row (whose
 * metric_code is NULL) upsert onto itself instead of inserting a duplicate.
 */
const ON_CONFLICT = 'institution_id,body_code,metric_code,programme_id';

interface CandidateProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface InstitutionRow {
  id: string;
  name: string;
}

interface CommitteeLead {
  committee_id: string;
  committee_name: string;
  body_code: string | null;
  role: string;
  user_id: string | null;
  external_name: string | null;
}

// ----------------------------------------------------------------------------
// Reads — session client throughout; RLS scopes every result.
// ----------------------------------------------------------------------------

/** The 107-row master framework. `metric_type` IS the awarding body. */
function useFramework() {
  return useQuery({
    queryKey: ['accreditation', 'framework', 'metrics'],
    queryFn: async (): Promise<FrameworkMetric[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('sh_accreditation_metrics')
        .select('metric_code, metric_type, category, metric_name')
        .eq('is_active', true)
        .order('metric_type')
        .order('metric_code');
      if (error) throw error;
      return (data ?? []) as FrameworkMetric[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

function useOwnerRows(institutionId: string | null) {
  return useQuery({
    queryKey: ['accreditation', 'metric-owners', institutionId],
    enabled: !!institutionId,
    queryFn: async (): Promise<OwnerRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('accreditation_metric_owners')
        .select(
          'id, institution_id, body_code, metric_code, programme_id, owner_user_id, assignment_status, acknowledged_at, previous_owner_user_id, owner_changed_at',
        )
        .eq('institution_id', institutionId);
      if (error) throw error;
      return (data ?? []) as OwnerRow[];
    },
    staleTime: 15 * 1000,
  });
}

function useInstitutions() {
  return useQuery({
    queryKey: ['institutions', 'owner-desk'],
    queryFn: async (): Promise<InstitutionRow[]> => {
      const sb = createClientSupabaseClient() as any;

      // `institutions` carries a blanket `institutions_select USING (true)`
      // policy, so reading the table directly offers EVERY campus to everyone —
      // including a strictly own-scoped HOD. That is not a data leak (the owner
      // rows themselves are correctly scoped by accred_metric_owners_select),
      // and that is exactly what makes it dangerous: picking another campus
      // returns 0 rows silently, so the page renders "nobody named" about a
      // college that may have every owner assigned. A denied read must never
      // render as a factual claim.
      //
      // `_user_accessible_institutions()` is the existing helper for this —
      // STABLE SECURITY DEFINER, takes no argument so the caller is derived
      // from auth.uid() rather than supplied, and returns exactly the ids where
      // role_has_institution_access() holds.
      const { data: allowedIds, error: allowedError } = await sb.rpc(
        '_user_accessible_institutions',
      );
      if (allowedError) throw allowedError;

      const ids = (allowedIds ?? []) as string[];
      if (ids.length === 0) return [];

      const { data, error } = await sb
        .from('institutions')
        .select('id, name')
        .in('id', ids)
        .order('name');
      if (error) throw error;
      return (data ?? []) as InstitutionRow[];
    },
    staleTime: 30 * 60 * 1000,
  });
}

function useCandidateOwners() {
  return useQuery({
    queryKey: ['profiles', 'metric-owner-candidates'],
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
 * dropdown. Keyed on a STABLE joined string so a fresh array each render never
 * re-fires it.
 */
function useAssignedOwnerNames(ownerIds: string[]) {
  const key = useMemo(() => [...new Set(ownerIds)].sort().join(','), [ownerIds]);
  return useQuery({
    queryKey: ['profiles', 'metric-owner-names', key],
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

/**
 * Level 2 — who convenes each committee, read from the roster that already
 * records it. `accreditation_committee_members.role` carries chair /
 * coordinator / secretary / member / observer; only the first two lead.
 */
function useCommitteeLeads(institutionId: string | null) {
  return useQuery({
    queryKey: ['accreditation', 'committee-leads', institutionId],
    enabled: !!institutionId,
    queryFn: async (): Promise<CommitteeLead[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data: committees, error } = await sb
        .from('accreditation_committees')
        .select('id, committee_name, body_code')
        .eq('institution_id', institutionId)
        .eq('is_active', true);
      if (error) throw error;

      const rows = (committees ?? []) as Array<{
        id: string;
        committee_name: string;
        body_code: string | null;
      }>;
      if (rows.length === 0) return [];

      const { data: members, error: memberError } = await sb
        .from('accreditation_committee_members')
        .select('committee_id, role, user_id, external_name')
        .in(
          'committee_id',
          rows.map((c) => c.id),
        )
        .in('role', ['chair', 'coordinator'])
        .eq('is_active', true);
      if (memberError) throw memberError;

      const byId = new Map(rows.map((c) => [c.id, c]));
      return ((members ?? []) as any[]).map((m) => ({
        committee_id: m.committee_id,
        committee_name: byId.get(m.committee_id)?.committee_name ?? 'Committee',
        body_code: byId.get(m.committee_id)?.body_code ?? null,
        role: m.role,
        user_id: m.user_id,
        external_name: m.external_name,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ----------------------------------------------------------------------------
function AccessDenied() {
  return (
    <ContentLayout title="Assign Metric Owners">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-lg">
            You do not have access to this page
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Recording who is accountable for each accreditation metric decides
            where every evidence request and reminder is sent, so it is limited
            to the people who run IQAC for a campus.
          </p>
          <p>
            To get access, contact your IQAC coordinator and ask for the
            <span className="font-medium text-foreground"> View Owners </span>
            permission (<code>accreditation.naac.narrative.view</code>). That is
            enough to see who is accountable and to answer an assignment made to
            you; assigning others additionally needs
            <code> accreditation.naac.narrative.manage</code>.
          </p>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}

function StatusBadge({ status }: { status: AssignmentStatus | null }) {
  if (status === 'confirmed') {
    return (
      <Badge className="border-emerald-300 bg-emerald-50 font-normal text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        Accepted
      </Badge>
    );
  }
  if (status === 'declined') {
    return (
      <Badge className="border-red-300 bg-red-50 font-normal text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        Declined
      </Badge>
    );
  }
  if (status === 'pending') {
    return (
      <Badge className="border-amber-300 bg-amber-50 font-normal text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        Awaiting acceptance
      </Badge>
    );
  }
  return null;
}

// ----------------------------------------------------------------------------
export default function AccreditationOwnersPage() {
  const qc = useQueryClient();
  const {
    can,
    isSuperAdmin,
    isLoading: permsLoading,
    userProfile,
  } = usePermissions();

  // Two powers, deliberately separate (Director decision 8).
  //
  //   canManage — ASSIGN and reassign. One role holds it, held by one person.
  //   canView   — open the page and answer an assignment addressed to you.
  //
  // Gating the whole page on canManage shipped the accept/decline buttons to an
  // audience of nobody: the 102 HODs and 10 principals who are the intended
  // owners never got past the access-denied panel. Widening manage to reach them
  // would have been the wrong fix — manage is the power to assign, and giving it
  // to every prospective owner lets anyone reassign anyone, which is exactly the
  // imposition decision 8 exists to prevent. So the page opens on view, and the
  // assign controls stay behind manage.
  const canManage = isSuperAdmin || can('accreditation.naac.narrative.manage');
  const canView = canManage || can('accreditation.naac.narrative.view');

  // profiles.id IS auth.users.id, so this is the same identity the RPC derives
  // from auth.uid() and the same one accreditation_metric_owners.owner_user_id
  // stores. Compared here because RLS cannot express "the row's own owner" for
  // rendering purposes — only the function enforces it on the write.
  const currentUserId = (userProfile?.id as string | undefined) ?? null;

  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [bodyFilter, setBodyFilter] = useState<string>('all');
  // 107 of 107 are unowned, so the gap IS the page — open on it.
  //
  // 'mine' exists because the default hides the rows that most need answering.
  // A metric-level assignment lands as PENDING, and pending counts as owned, so
  // it drops straight out of the 'unassigned' view the page opens on. Without a
  // way to ask "what is addressed to me", the named owner would have to switch
  // to 'assigned' and scan 107 rows for their own name.
  const [showFilter, setShowFilter] = useState<
    'unassigned' | 'all' | 'assigned' | 'mine'
  >('unassigned');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const { data: institutions } = useInstitutions();
  const { data: framework, isLoading: frameworkLoading } = useFramework();

  // Default to the viewer's own campus; fall back to the first they can read.
  const activeInstitution =
    institutionId ??
    (userProfile as any)?.institution_id ??
    institutions?.[0]?.id ??
    null;

  // Second half of the same guard. The picker above now only offers campuses
  // this viewer may read, but `institutionId` also arrives from state a user
  // can reach directly. If the selected campus is not one they may read, the
  // owner query returns 0 rows with error === null (RLS denial is silent), and
  // the page would state "nobody named" about a college it cannot actually see.
  // Say so instead. `institutions === undefined` means still loading — not a
  // denial — so only judge once the list has resolved.
  const campusOutOfScope =
    Array.isArray(institutions) &&
    institutions.length > 0 &&
    activeInstitution != null &&
    !institutions.some((i) => i.id === activeInstitution);

  const { data: ownerRows, isLoading: ownersLoading } =
    useOwnerRows(activeInstitution);
  const { data: candidates } = useCandidateOwners();
  const { data: committeeLeads } = useCommitteeLeads(activeInstitution);

  // Which awarding bodies this campus actually answers to (Director decisions,
  // 2026-08-06). Until migration 20260816010000 is applied this resolves to
  // `unprovisioned` and narrows nothing, so the page behaves exactly as it does
  // today; the filter switches itself on when the mapping table appears.
  const { scope: bodyScope, isLoading: scopeLoading } =
    useInstitutionBodyScope(activeInstitution);

  // 🔴 THE FILTER SITS HERE — between the read and the count, never between
  // the count and the render. `tally`, `byBody` and `visibleMetrics` all derive
  // from `metrics`, so narrowing it moves the DENOMINATOR with the list.
  // Filtering only what is drawn would leave "of 107" in place, and the
  // unreachable total IS the bug: 7 of the 107 metrics can never apply to an
  // engineering college, so 107 is a target that college cannot hit.
  // Engineering reads NAAC 69 + NIRF 17 + NBA 9 + AICTE 1 + ABET 0 = 96.
  const metrics = useMemo(
    () => filterMetricsToScope(framework ?? [], bodyScope),
    [framework, bodyScope],
  );
  const rows = useMemo(() => ownerRows ?? [], [ownerRows]);

  // An entity that answers to nobody — Main Office, Jicate Solutions, the
  // Incubation Forum, the Testing Institution. Say so; never a blank table and
  // never a silent redirect. `appliesToNobody` is false for an unread scope, so
  // a failed read is never rendered as "not accredited".
  const noBodiesApply = appliesToNobody(bodyScope);
  const activeInstitutionName =
    institutions?.find((i) => i.id === activeInstitution)?.name ?? null;

  const resolved = useMemo(
    () =>
      activeInstitution
        ? resolveMetricOwners(metrics, rows, activeInstitution)
        : [],
    [metrics, rows, activeInstitution],
  );
  const tally = useMemo(() => tallyOwnership(resolved), [resolved]);
  const byBody = useMemo(() => tallyByBody(resolved), [resolved]);
  // A mapped body with no metrics yet (all five added on 2026-08-06 are) still
  // needs an accountable person, so the body list comes from the mapping rather
  // than from whichever bodies happen to carry rows in the framework.
  const bodies = useMemo(
    () => bodiesForScope(bodyScope, listBodyCodes(metrics)),
    [bodyScope, metrics],
  );

  const assignedIds = useMemo(
    () => rows.map((r) => r.owner_user_id).filter(Boolean),
    [rows],
  );
  const { data: assignedProfiles } = useAssignedOwnerNames(assignedIds);

  const people = useMemo(() => {
    const m = new Map<string, CandidateProfile>();
    for (const p of candidates ?? []) m.set(p.id, p);
    for (const p of assignedProfiles ?? []) if (!m.has(p.id)) m.set(p.id, p);
    return m;
  }, [candidates, assignedProfiles]);

  const personLabel = (id: string | null) => {
    if (!id) return 'Nobody';
    const p = people.get(id);
    return p?.full_name || p?.email || 'Owner assigned';
  };

  const ownerOptions = useMemo(() => {
    const opts = [...people.values()]
      .map((p) => ({ value: p.id, label: p.full_name || p.email || p.id }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: UNASSIGNED_VALUE, label: 'Nobody yet' }, ...opts];
  }, [people]);

  // --------------------------------------------------------------------------
  // Writes. Every one asserts on returned rows: RLS refuses out-of-scope writes
  // by returning NOTHING rather than erroring, and a silent no-op must never
  // read as success.
  // --------------------------------------------------------------------------

  /** Refresh only this campus's owner rows. */
  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: ['accreditation', 'metric-owners', activeInstitution],
    });

  /**
   * Assign (or reassign) one scope. `metricCode === null` writes the body-level
   * row that every metric of that body inherits.
   *
   * A reassignment records one hop of history — who held it immediately before,
   * and when it moved — and resets to pending, because the NEW person has not
   * agreed to anything yet. acknowledged_at is cleared in the same statement to
   * satisfy the paired CHECK.
   */
  async function assignScope(
    bodyCode: string,
    metricCode: string | null,
    nextOwnerId: string,
    label: string,
  ) {
    if (!activeInstitution) return;
    const key = `${bodyCode}::${metricCode ?? '*'}`;
    const existing = rows.find(
      (r) =>
        r.body_code === bodyCode &&
        r.metric_code === metricCode &&
        r.programme_id === null,
    );
    if (shouldSkipAssign(existing, nextOwnerId)) return;
    // Past the guard, this is only true for a DECLINED row being re-sent to the
    // same person — a re-ask, not a move.
    const sameOwner = existing?.owner_user_id === nextOwnerId;

    setSavingKey(key);
    try {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('accreditation_metric_owners')
        .upsert(
          {
            institution_id: activeInstitution,
            body_code: bodyCode,
            metric_code: metricCode,
            programme_id: null,
            owner_user_id: nextOwnerId,
            assignment_status: 'pending',
            acknowledged_at: null,
            acknowledged_by: null,
            // History records a MOVE. Re-sending a declined assignment to the
            // same person is not one, and stamping it would render
            // "moved from <the person who still holds it>".
            previous_owner_user_id: sameOwner
              ? (existing?.previous_owner_user_id ?? null)
              : (existing?.owner_user_id ?? null),
            owner_changed_at: sameOwner
              ? (existing?.owner_changed_at ?? null)
              : existing
                ? new Date().toISOString()
                : null,
            created_by: userProfile?.id ?? null,
          },
          { onConflict: ON_CONFLICT },
        )
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          'The change was not saved — you may not have access to this campus.',
        );
      }
      toast.success(
        `${label} sent to ${personLabel(nextOwnerId)} — awaiting acceptance.`,
      );
      await invalidate();
    } catch (e) {
      toast.error((e as Error).message || 'Could not save the owner.');
    } finally {
      setSavingKey(null);
    }
  }

  /**
   * Remove one scope. owner_user_id is NOT NULL in the table, so "nobody" is
   * expressed by deleting the row, not by blanking a column.
   */
  async function clearScope(
    bodyCode: string,
    metricCode: string | null,
    label: string,
  ) {
    if (!activeInstitution) return;

    // A metric with only an INHERITED owner has no row of its own. Deleting
    // would match nothing, and the empty result is indistinguishable from an
    // RLS refusal — so it would raise "not saved" for a no-op. Nothing to
    // clear means nothing to do.
    const existing = rows.find(
      (r) =>
        r.body_code === bodyCode &&
        r.metric_code === metricCode &&
        r.programme_id === null,
    );
    if (!existing) return;

    const key = `${bodyCode}::${metricCode ?? '*'}`;
    setSavingKey(key);
    try {
      const sb = createClientSupabaseClient() as any;
      let query = sb
        .from('accreditation_metric_owners')
        .delete()
        .eq('institution_id', activeInstitution)
        .eq('body_code', bodyCode)
        .is('programme_id', null);
      query = metricCode === null
        ? query.is('metric_code', null)
        : query.eq('metric_code', metricCode);

      const { data, error } = await query.select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          'The change was not saved — you may not have access to this campus.',
        );
      }
      toast.success(`${label} now has no owner.`);
      await invalidate();
    } catch (e) {
      toast.error((e as Error).message || 'Could not clear the owner.');
    } finally {
      setSavingKey(null);
    }
  }

  /**
   * The named person accepts or refuses. The paired CHECK
   * `(assignment_status = 'pending') = (acknowledged_at IS NULL)` means BOTH
   * outcomes must stamp acknowledged_at — a decline is an acknowledgement too.
   */
  async function acknowledge(row: OwnerRow, decision: 'confirmed' | 'declined') {
    const key = `ack::${row.id}`;
    setSavingKey(key);
    try {
      const sb = createClientSupabaseClient() as any;
      // Routed through an RPC rather than a direct update. The only write policy
      // on this table demands accreditation.naac.narrative.manage — the ASSIGN
      // power — so a direct update by the named owner came back as a silent
      // zero-row refusal. Adding a permissive row policy instead would have let
      // the owner edit every other column too, owner_user_id included, because
      // RLS restricts rows and cannot restrict columns. The function writes
      // exactly three and takes the caller from the session, never as an argument.
      const { data, error } = await sb.rpc('fn_accreditation_acknowledge_ownership', {
        p_owner_id: row.id,
        p_decision: decision,
      });
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('That response was not saved.');
      }
      toast.success(
        decision === 'confirmed'
          ? 'Accepted. You are now the recorded owner.'
          : 'Declined. IQAC will see this needs reassigning.',
      );
      await invalidate();
    } catch (e) {
      toast.error((e as Error).message || 'Could not record your response.');
    } finally {
      setSavingKey(null);
    }
  }

  /** Assign every metric of one category at once. */
  async function bulkAssignCategory(
    bodyCode: string,
    category: string,
    ownerId: string,
  ) {
    if (!activeInstitution) return;
    const codes = metricCodesInCategory(metrics, bodyCode, category);
    if (codes.length === 0) return;

    const key = `bulk::${bodyCode}::${category}`;
    setSavingKey(key);
    try {
      const sb = createClientSupabaseClient() as any;
      const now = new Date().toISOString();
      const payload = codes.map((code) => {
        const existing = rows.find(
          (r) =>
            r.body_code === bodyCode &&
            r.metric_code === code &&
            r.programme_id === null,
        );
        return {
          institution_id: activeInstitution,
          body_code: bodyCode,
          metric_code: code,
          programme_id: null,
          owner_user_id: ownerId,
          assignment_status: 'pending',
          acknowledged_at: null,
          acknowledged_by: null,
          previous_owner_user_id: existing?.owner_user_id ?? null,
          owner_changed_at: existing ? now : null,
          created_by: userProfile?.id ?? null,
        };
      });

      const { data, error } = await sb
        .from('accreditation_metric_owners')
        .upsert(payload, { onConflict: ON_CONFLICT })
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          'Nothing was saved — you may not have access to this campus.',
        );
      }
      toast.success(
        `${data.length} of ${codes.length} metrics sent to ${personLabel(ownerId)}.`,
      );
      await invalidate();
    } catch (e) {
      toast.error((e as Error).message || 'Could not assign the category.');
    } finally {
      setSavingKey(null);
    }
  }

  // --------------------------------------------------------------------------
  // Level 3 rows, after the filters.
  const visibleMetrics = useMemo(() => {
    const byCode = new Map(resolved.map((r) => [`${r.bodyCode}::${r.metricCode}`, r]));
    return metrics
      .filter((m) => bodyFilter === 'all' || m.metric_type === bodyFilter)
      .map((m) => ({
        metric: m,
        owner: byCode.get(`${m.metric_type}::${m.metric_code}`)!,
      }))
      .filter(({ owner }) => {
        if (!owner) return false;
        if (showFilter === 'unassigned') return !owner.isOwned;
        if (showFilter === 'assigned') return owner.isOwned;
        // Everything the signed-in person is named on, inherited included — a
        // declined row stays in view because it is still addressed to them and
        // is exactly the thing they may want to revisit.
        if (showFilter === 'mine') return isAssignedTo(owner, currentUserId);
        return true;
      });
  }, [metrics, resolved, bodyFilter, showFilter, currentUserId]);

  /** Categories offered for bulk assignment, only for a single chosen body. */
  const bulkCategories = useMemo(
    () => (bodyFilter === 'all' ? [] : categoriesForBody(metrics, bodyFilter)),
    [metrics, bodyFilter],
  );

  // --------------------------------------------------------------------------
  if (permsLoading) {
    return (
      <ContentLayout title="Assign Metric Owners">
        <Skeleton className="h-40 w-full" />
      </ContentLayout>
    );
  }
  if (!canView) return <AccessDenied />;

  // The scope decides the denominator, so a count rendered before it resolves
  // would be the wrong one shown as fact for a moment.
  const loading = frameworkLoading || ownersLoading || scopeLoading;

  return (
    <ContentLayout title="Assign Metric Owners">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'Assign Owners', href: '/accreditation/manage/owners' },
        ]}
      />

      <div className="space-y-6">
        {/* ---------------------------------------------------------------- */}
        {/* Where the gap is. No grade, no score — a count of who is named.  */}
        <Card className="border-indigo-200 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <UserCheck className="h-6 w-6 text-indigo-600" />
              Who is accountable for each metric
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Name one person per awarding body and every metric beneath it
              inherits them — then set only the exceptions. An assignment stays{' '}
              <span className="font-medium text-foreground">
                awaiting acceptance
              </span>{' '}
              until the named person confirms it, so accountability is accepted
              rather than imposed.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">Campus</span>
              <SearchableSelect
                className="w-[300px] bg-card"
                value={activeInstitution ?? ''}
                onValueChange={setInstitutionId}
                options={(institutions ?? []).map((i) => ({
                  value: i.id,
                  label: i.name,
                }))}
                placeholder="Choose a campus"
                searchPlaceholder="Search campuses…"
                emptyMessage="No campus you can access."
              />
            </div>

            {/* Which bodies this campus answers to, said out loud, so a
                narrowed list is never mistaken for a short one. */}
            {!campusOutOfScope && !loading && (
              <p className="text-xs text-muted-foreground">
                {scopeSentence(bodyScope, activeInstitutionName)}
                {bodyScope.kind === 'unprovisioned' && (
                  <>
                    {' '}
                    <Link
                      href="/accreditation/manage/bodies"
                      className="underline underline-offset-2"
                    >
                      Record them
                    </Link>
                    .
                  </>
                )}
              </p>
            )}

            {campusOutOfScope ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
                <div className="font-medium">
                  This campus is outside your access
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  You can only read accreditation ownership for the campuses
                  your role covers, so nothing is shown here. This is not a
                  statement that the campus has no owners — it means this page
                  cannot see them. Ask a super admin for access to this campus
                  if you need it.
                </p>
              </div>
            ) : noBodiesApply ? (
              /* Offices and companies are not accredited by anybody. An empty
                 table would read as "107 metrics, none owned"; a redirect would
                 read as a broken link. Say the true thing. */
              <div className="rounded-lg border bg-card p-4">
                <div className="font-medium">
                  Accreditation does not apply to{' '}
                  {activeInstitutionName ?? 'this entity'}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  No awarding body is recorded against it, so there are no
                  metrics to own and nobody to name. Offices, companies and
                  shared entities sit outside every accreditation framework —
                  this is a recorded fact, not a gap to fill.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  If that is wrong, add the bodies it answers to in{' '}
                  <Link
                    href="/accreditation/manage/bodies"
                    className="underline underline-offset-2"
                  >
                    Awarding Bodies
                  </Link>
                  , and this page will follow.
                </p>
              </div>
            ) : (
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground">Owners set</div>
              <div className="text-3xl font-bold">
                {loading ? '—' : `${tally.assigned} of ${tally.total}`}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <span className="text-emerald-700 dark:text-emerald-400">
                  {loading ? '—' : tally.confirmed} accepted
                </span>
                <span className="text-amber-700 dark:text-amber-400">
                  {loading ? '—' : tally.pending} awaiting acceptance
                </span>
                <span className="text-red-700 dark:text-red-400">
                  {loading ? '—' : tally.declined} declined
                </span>
                <span className="text-muted-foreground">
                  {loading ? '—' : tally.unassigned} nobody named
                </span>
              </div>
            </div>
            )}

            {/* Per-body breakdown */}
            <div className="flex flex-wrap gap-2">
              {(campusOutOfScope || noBodiesApply ? [] : byBody).map((b) => (
                <Badge
                  key={b.bodyCode}
                  variant="outline"
                  className={`font-normal ${
                    b.tally.assigned === 0
                      ? 'border-amber-300 text-amber-700 dark:border-amber-900 dark:text-amber-300'
                      : ''
                  }`}
                >
                  {b.bodyCode} {b.tally.assigned}/{b.tally.total}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Everything below answers "who owns which metric". For an entity
            that answers to no awarding body there are no metrics to own, and
            the three tables would each render their own flavour of nothing —
            an empty body list, and a "every metric has someone accountable"
            message that is true only vacuously. */}
        {!noBodiesApply && (
        <>
        {/* ---------------------------------------------------------------- */}
        {/* Level 1 — one owner per body. The fastest win on this page.      */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-5 w-5 text-muted-foreground" />
              Body owners
              <Badge variant="outline" className="font-normal">
                inherited by every metric below
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Awarding body</TableHead>
                    <TableHead>Metrics covered</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[280px]">Accountable person</TableHead>
                    <TableHead className="w-[180px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="p-6">
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ) : (
                    bodies.map((body) => {
                      const bodyRow = activeInstitution
                        ? findBodyOwnerRow(rows, activeInstitution, body)
                        : null;
                      const count =
                        byBody.find((b) => b.bodyCode === body)?.tally.total ?? 0;
                      const key = `${body}::*`;
                      const busy = savingKey === key;
                      const isMine =
                        !!bodyRow && bodyRow.owner_user_id === userProfile?.id;
                      return (
                        <TableRow key={body} className="hover:bg-muted/40">
                          <TableCell className="font-medium">{body}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {count}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              status={bodyRow?.assignment_status ?? null}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {/* Assigning is the manage power. A viewer sees
                                  who owns this body and can answer their own
                                  assignment, but cannot hand it to anyone. */}
                              {!canManage && (
                                <span className="text-sm text-muted-foreground">
                                  {bodyRow?.owner_user_id
                                    ? personLabel(bodyRow.owner_user_id)
                                    : 'Nobody yet'}
                                </span>
                              )}
                              {canManage && (
                              <SearchableSelect
                                className="w-[240px]"
                                value={bodyRow?.owner_user_id ?? UNASSIGNED_VALUE}
                                onValueChange={(v) =>
                                  v === UNASSIGNED_VALUE
                                    ? clearScope(body, null, `${body} ownership`)
                                    : assignScope(body, null, v, `${body} ownership`)
                                }
                                options={ownerOptions}
                                placeholder="Nobody yet"
                                searchPlaceholder="Search by name or email…"
                                emptyMessage="No candidate matches."
                                disabled={busy}
                              />
                              )}
                              {busy && (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {/* Only the named person may accept — the point of
                                decision 8. RLS cannot express "the row's own
                                owner", so identity is checked here. */}
                            {isMine && bodyRow?.assignment_status === 'pending' && (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  disabled={savingKey === `ack::${bodyRow.id}`}
                                  onClick={() => acknowledge(bodyRow, 'confirmed')}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1"
                                  disabled={savingKey === `ack::${bodyRow.id}`}
                                  onClick={() => acknowledge(bodyRow, 'declined')}
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Decline
                                </Button>
                              </div>
                            )}
                            {bodyRow?.previous_owner_user_id && (
                              <div className="text-xs text-muted-foreground">
                                moved from {personLabel(bodyRow.previous_owner_user_id)}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Level 2 — committee leads, read from the roster that owns them.  */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-muted-foreground" />
              Committee leads
              <Badge variant="outline" className="font-normal">
                read-only
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Convenor and chair already live on each committee&apos;s roster.
              They are shown here so ownership can be read in one place, and
              edited in the one place that owns them.
            </p>
            {(committeeLeads ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active committee on this campus records a chair or convenor
                yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {(committeeLeads ?? []).map((lead) => (
                  <div
                    key={`${lead.committee_id}-${lead.role}-${lead.user_id ?? lead.external_name}`}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
                  >
                    <Badge variant="outline" className="font-normal capitalize">
                      {lead.role}
                    </Badge>
                    <span className="font-medium">
                      {lead.user_id
                        ? personLabel(lead.user_id)
                        : lead.external_name || 'External member'}
                    </span>
                    <span className="text-muted-foreground">
                      — {lead.committee_name}
                    </span>
                    <Link
                      href={`/accreditation/naac/committees/${lead.committee_id}`}
                      className="ml-auto"
                    >
                      <Button variant="ghost" size="sm" className="gap-1">
                        Open committee
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Level 3 — the exceptions, opened on what nobody owns.            */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Metric owners</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={showFilter} onValueChange={(v) => setShowFilter(v as any)}>
                <SelectTrigger className="w-[200px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Nobody named</SelectItem>
                  <SelectItem value="mine">Assigned to me</SelectItem>
                  <SelectItem value="assigned">Has an owner</SelectItem>
                  <SelectItem value="all">All metrics</SelectItem>
                </SelectContent>
              </Select>

              <Select value={bodyFilter} onValueChange={setBodyFilter}>
                <SelectTrigger className="w-[180px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All bodies</SelectItem>
                  {bodies.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span className="text-sm text-muted-foreground">
                {loading ? '' : `${visibleMetrics.length} shown`}
              </span>
            </div>

            {/* Bulk assign — only once a single body is chosen, because a
                category name is only unambiguous within its body. */}
            {canManage && bulkCategories.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="mb-1 text-sm font-medium">
                  Assign a whole category
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Every metric in the category is sent to that person and waits
                  for their acceptance. Existing owners are replaced.
                </p>
                <div className="flex flex-wrap gap-2">
                  {bulkCategories.map((c) => {
                    const codes = metricCodesInCategory(metrics, bodyFilter, c);
                    const key = `bulk::${bodyFilter}::${c}`;
                    return (
                      <div
                        key={c}
                        className="flex items-center gap-2 rounded border bg-card px-2 py-1"
                      >
                        <span className="text-xs">
                          {c} ({codes.length})
                        </span>
                        <SearchableSelect
                          className="h-8 w-[190px]"
                          value={UNASSIGNED_VALUE}
                          onValueChange={(v) => {
                            if (v !== UNASSIGNED_VALUE) {
                              bulkAssignCategory(bodyFilter, c, v);
                            }
                          }}
                          options={ownerOptions}
                          placeholder="Assign all…"
                          searchPlaceholder="Search…"
                          emptyMessage="No candidate matches."
                          disabled={savingKey === key}
                        />
                        {savingKey === key && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : visibleMetrics.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
                <Inbox className="h-8 w-8" />
                <p className="text-sm">
                  {showFilter === 'unassigned'
                    ? 'Every metric in view has someone accountable.'
                    : showFilter === 'mine'
                      ? 'No metric in view is assigned to you.'
                      : 'No metrics match these filters.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[820px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[260px]">Set an exception</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleMetrics.map(({ metric, owner }) => (
                      <MetricRow
                        key={`${metric.metric_type}::${metric.metric_code}`}
                        metric={metric}
                        owner={owner}
                        ownerOptions={ownerOptions}
                        personLabel={personLabel}
                        canManage={canManage}
                        currentUserId={currentUserId}
                        ackBusy={
                          !!owner?.row && savingKey === `ack::${owner.row.id}`
                        }
                        onAcknowledge={acknowledge}
                        busy={
                          savingKey === `${metric.metric_type}::${metric.metric_code}`
                        }
                        onAssign={(v) =>
                          v === UNASSIGNED_VALUE
                            ? clearScope(
                                metric.metric_type,
                                metric.metric_code,
                                metric.metric_code,
                              )
                            : assignScope(
                                metric.metric_type,
                                metric.metric_code,
                                v,
                                metric.metric_code,
                              )
                        }
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        </>
        )}
      </div>
    </ContentLayout>
  );
}

// ----------------------------------------------------------------------------
/**
 * One metric. An INHERITED owner is rendered muted and labelled with the body
 * it came from, so a coordinator can tell at a glance which metrics somebody
 * actually chose and which are riding on the body-level default.
 */
function MetricRow({
  metric,
  owner,
  ownerOptions,
  personLabel,
  busy,
  canManage,
  currentUserId,
  ackBusy,
  onAcknowledge,
  onAssign,
}: {
  metric: FrameworkMetric;
  owner: ResolvedOwner;
  ownerOptions: Array<{ value: string; label: string }>;
  personLabel: (id: string | null) => string;
  busy: boolean;
  canManage: boolean;
  currentUserId: string | null;
  ackBusy: boolean;
  onAcknowledge: (row: OwnerRow, decision: 'confirmed' | 'declined') => void;
  onAssign: (value: string) => void;
}) {
  const inherited = owner.source === 'inherited';
  // The same rule the body table applies, one level down. See
  // canAnswerAssignment for why inherited rows are deliberately excluded.
  const canAnswer = canAnswerAssignment(owner, currentUserId);

  return (
    <TableRow className="hover:bg-muted/40">
      <TableCell>
        <div className="flex flex-col">
          <span className="font-mono text-xs text-muted-foreground">
            {metric.metric_type} {metric.metric_code}
          </span>
          <span className="line-clamp-2 max-w-[320px] text-sm font-medium">
            {metric.metric_name}
          </span>
        </div>
      </TableCell>
      <TableCell className="max-w-[160px] text-xs text-muted-foreground">
        {metric.category ?? '—'}
      </TableCell>
      <TableCell className="text-sm">
        {owner.source === 'none' ? (
          <span className="text-amber-700 dark:text-amber-300">Nobody named</span>
        ) : (
          <div className={inherited ? 'text-muted-foreground' : ''}>
            <div>{personLabel(owner.ownerUserId)}</div>
            <div className="text-xs text-muted-foreground">
              {ownerSourceLabel(owner)}
            </div>
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1.5">
          <StatusBadge status={owner.status} />
          {canAnswer && (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2"
                disabled={ackBusy}
                onClick={() => onAcknowledge(owner.row!, 'confirmed')}
              >
                <Check className="h-3.5 w-3.5" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2"
                disabled={ackBusy}
                onClick={() => onAcknowledge(owner.row!, 'declined')}
              >
                <X className="h-3.5 w-3.5" />
                Decline
              </Button>
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {!canManage && (
            <span className="text-xs text-muted-foreground">
              {owner.source === 'none' ? '—' : 'Set by IQAC'}
            </span>
          )}
          {canManage && (
          <SearchableSelect
            className="w-[220px]"
            value={
              owner.source === 'explicit'
                ? (owner.ownerUserId ?? UNASSIGNED_VALUE)
                : UNASSIGNED_VALUE
            }
            onValueChange={onAssign}
            options={ownerOptions}
            placeholder={inherited ? 'Override…' : 'Nobody yet'}
            searchPlaceholder="Search by name or email…"
            emptyMessage="No candidate matches."
            disabled={busy}
          />
          )}
          {busy && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
