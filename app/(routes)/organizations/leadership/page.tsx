// ============================================================================
// ORGANIZATIONS — College Leadership.
// Created: 2026-08-04.
//
// Asks the question about the COLLEGE instead of the person. Leadership is
// stored on people (user_roles, committee rows, departments.head_of_department_id)
// and was never asked about per college, so the gaps were invisible: measured
// live 2026-08-04, 5 of 14 institutions had no Principal and 82 of 89
// departments had no Head.
//
// Every unfilled post therefore renders as an explicit "Not assigned" with an
// action next to it. Blank space is what hid the problem; this page must never
// produce any.
//
// ALL WRITES GO THROUGH fn_set_college_leadership. The page never writes
// user_roles / accreditation_committees / accreditation_committee_members /
// departments directly — doing so would require five permission keys, two of
// which (roles.create, roles.edit) are not institution-scoped and would hand a
// college officer global role management. See the migration header:
//   supabase/migrations/20260809101500_college_leadership.sql
//
// Reads go through fn_list_leadership_colleges / fn_get_college_leadership /
// fn_list_leadership_candidates for the same reason plus a sharper one:
// user_roles, user_institution_access and the committee tables are not readable
// without roles.edit / accreditation.naac.committees.view, and RLS denial is
// SILENT (zero rows, error null). Reading them directly would print
// "Not assigned" over posts that are filled — fabricated absence on the one
// screen whose whole job is showing real absence.
//
// 2026-08-05: Principal and Vice Principal now live in institution_leadership,
// one row per college, so one person can hold the post at more than one. See
//   supabase/migrations/20260809102100_institution_leadership_posts.sql
//
// 2026-08-05: a post also carries WHY it was given and the condition on which it
// ends, and this page SHOWS it. Dr. RAJENDIRAN K M is Principal of JKKN College
// of Education personally — explicitly not because he is CAO — until he leaves
// JKKN. Stored, that fact was indistinguishable from every other principalship,
// so the reasonable reading was that the next CAO inherits the post. A column
// nobody can see does not prevent the misunderstanding it exists to prevent, so
// "Personal — does not pass to a successor" is rendered next to the name, and a
// post whose basis was never recorded says exactly that rather than implying
// ex officio. See
//   supabase/migrations/20260809103500_leadership_appointment_basis.sql
// ============================================================================

'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  Building,
  CheckCircle2,
  HelpCircle,
  Lock,
  RefreshCw,
  UserX,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// Radix/cmdk reserve the empty string, so an "unassign" choice needs a
// sentinel that is translated back to NULL before it reaches the RPC.
const UNASSIGNED = '__unassigned__';

type PositionKey =
  | 'principal'
  | 'vice_principal'
  | 'iqac_chair'
  | 'iqac_coordinator'
  | 'department_head';

interface Person {
  user_id: string;
  full_name: string | null;
  email: string | null;
  // Only Principal and Vice Principal carry these, and only once
  // 20260809103500 has been applied — before that the RPC simply omits the keys,
  // which is what basisEnabled below detects. `basis_code: null` means nobody
  // has recorded why; it must never be rendered as ex officio.
  basis_code?: string | null;
  basis_label?: string | null;
  basis_passes_to_successor?: boolean | null;
  basis_note?: string | null;
  assigned_at?: string | null;
  assigned_by_name?: string | null;
}

interface AppointmentBasis {
  code: string;
  label: string;
  description: string;
  passes_to_successor: boolean;
}

interface DepartmentRow {
  department_id: string;
  department_name: string;
  department_code: string | null;
  head_user_id: string | null;
  head_name: string | null;
  head_email: string | null;
}

interface CollegeLeadership {
  institution_id: string;
  institution_name: string;
  committee_id: string | null;
  principal: Person | null;
  vice_principal: Person | null;
  iqac_chair: Person | null;
  iqac_coordinator: Person | null;
  departments: DepartmentRow[];
}

interface CollegeSummary {
  institution_id: string;
  institution_name: string;
  department_count: number;
  unfilled: number;
}

interface Candidate {
  id: string;
  full_name: string | null;
  email: string | null;
}

const POSITIONS: ReadonlyArray<{
  key: Exclude<PositionKey, 'department_head'>;
  label: string;
  why: string;
}> = [
  {
    key: 'principal',
    label: 'Principal',
    why: 'Heads the college and chairs its IQAC.',
  },
  {
    key: 'vice_principal',
    label: 'Vice Principal',
    why: 'Deputises for the Principal and coordinates the IQAC.',
  },
  {
    key: 'iqac_chair',
    label: 'IQAC Chairman',
    why: 'Chairs the Internal Quality Assurance Cell. Normally the Principal.',
  },
  {
    key: 'iqac_coordinator',
    label: 'IQAC Coordinator',
    why: 'Runs the IQAC day to day. Normally the Vice Principal.',
  },
];

function personName(p: Person | null): string | null {
  if (!p) return null;
  return p.full_name?.trim() || p.email || 'Unnamed person';
}

// ---------------------------------------------------------------------------
// An unfilled post. Deliberately loud: this is the finding, not an empty cell.
// ---------------------------------------------------------------------------
function NotAssigned() {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-500">
      <UserX className="h-4 w-4 shrink-0" aria-hidden />
      Not assigned
    </span>
  );
}

function recordedOn(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Why this post was given. The whole reason the columns exist: a record that
// only the database can see does not stop anyone assuming the successor
// inherits the post.
//
// An unrecorded basis says "Not recorded" in those words. It is never rendered
// as ex officio, because for the eleven appointments nobody has discussed, "it
// comes with the other post" is a guess — and it is the exact guess the
// Director ruled out for the one appointment we do know about.
// ---------------------------------------------------------------------------
function BasisLine({ holder }: { holder: Person }) {
  const recorded = holder.basis_code != null;
  const personal = holder.basis_passes_to_successor === false;
  const when = recordedOn(holder.assigned_at);

  if (!recorded) {
    return (
      <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <HelpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Why this post was given is not recorded.
      </p>
    );
  }

  return (
    <div className="mt-1.5 space-y-1">
      <Badge
        variant="outline"
        className={
          personal
            ? 'border-violet-500 text-violet-700 dark:text-violet-400'
            : 'border-border text-muted-foreground'
        }
      >
        {personal && <Lock className="mr-1 h-3 w-3" aria-hidden />}
        {holder.basis_label ?? holder.basis_code}
      </Badge>
      {personal && (
        <p className="text-xs font-medium text-violet-700 dark:text-violet-400">
          Does not pass to a successor.
        </p>
      )}
      {holder.basis_note && (
        <p className="max-w-prose text-xs text-muted-foreground">{holder.basis_note}</p>
      )}
      {(holder.assigned_by_name || when) && (
        <p className="text-xs text-muted-foreground">
          Recorded
          {holder.assigned_by_name ? ` by ${holder.assigned_by_name}` : ''}
          {when ? ` on ${when}` : ''}.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recording it. Without a way in, the only appointment that would ever carry a
// basis is the one the migration backfilled.
// ---------------------------------------------------------------------------
function BasisEditor({
  holder,
  options,
  busy,
  onCancel,
  onSave,
}: {
  holder: Person;
  options: AppointmentBasis[];
  busy: boolean;
  onCancel: () => void;
  onSave: (basisCode: string, basisNote: string) => void;
}) {
  const [code, setCode] = useState<string>(holder.basis_code ?? '');
  const [note, setNote] = useState<string>(holder.basis_note ?? '');
  const chosen = options.find((o) => o.code === code);

  return (
    <div className="mt-3 space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Why was this post given?
        </label>
        <SearchableSelect
          value={code}
          onValueChange={setCode}
          options={options.map((o) => ({ value: o.code, label: o.label }))}
          placeholder="Choose a reason…"
          searchPlaceholder="Search reasons…"
          disabled={busy}
          className="w-full sm:w-[340px]"
        />
        {chosen && (
          <p className="mt-1.5 max-w-prose text-xs text-muted-foreground">
            {chosen.description}
          </p>
        )}
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Conditions, in your own words — including when it ends
        </label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
          rows={3}
          placeholder="e.g. Personal to this individual, until they leave JKKN. Does not pass to whoever succeeds them as CAO."
          className="max-w-prose"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !code} onClick={() => onSave(code, note)}>
          Save reason
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reads. react-query rather than useEffect + useState: the effect form calls
// setState from inside the effect, which react-hooks/set-state-in-effect
// rejects and which causes cascading renders. This is also the house pattern
// (see app/(routes)/accreditation/my-gaps/page.tsx).
// ---------------------------------------------------------------------------
const QK = {
  colleges: ['organizations', 'leadership', 'colleges'] as const,
  detail: (id: string) => ['organizations', 'leadership', 'detail', id] as const,
  people: (id: string) => ['organizations', 'leadership', 'people', id] as const,
  basis: ['organizations', 'leadership', 'basis'] as const,
};

/** The appointment-basis vocabulary.
 *
 *  Read from the table rather than hardcoded here, and `passes_to_successor`
 *  comes from the row rather than from a map keyed on the code. That is the
 *  point of storing the vocabulary as a table: a basis added later ("acting",
 *  "in charge") arrives with its own answer to "does this pass on?" instead of
 *  falling into whatever branch a hardcoded list happened to default to — which
 *  would be the same wrong inheritance assumption this feature exists to stop.
 *
 *  `retry: false` because the one failure worth distinguishing is "the table is
 *  not there yet" (the migration is Director-gated and may not be applied), and
 *  that is not worth three round trips. An error simply hides the basis UI: the
 *  rest of the page keeps working exactly as before. */
function useAppointmentBasis() {
  return useQuery({
    queryKey: QK.basis,
    retry: false,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<AppointmentBasis[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('leadership_appointment_basis')
        .select('code, label, description, passes_to_successor')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AppointmentBasis[];
    },
  });
}

function useLeadershipColleges() {
  return useQuery({
    queryKey: QK.colleges,
    queryFn: async (): Promise<CollegeSummary[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb.rpc('fn_list_leadership_colleges');
      if (error) throw error;
      return (data ?? []) as CollegeSummary[];
    },
    staleTime: 30 * 1000,
  });
}

function useCollegeLeadership(institutionId: string) {
  return useQuery({
    queryKey: QK.detail(institutionId),
    enabled: !!institutionId,
    queryFn: async (): Promise<CollegeLeadership> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb.rpc('fn_get_college_leadership', {
        p_institution_id: institutionId,
      });
      if (error) throw error;
      return data as CollegeLeadership;
    },
    staleTime: 30 * 1000,
  });
}

/** Everyone who could hold a post at this college.
 *
 *  Reads fn_list_leadership_candidates rather than filtering profiles by
 *  institution_id directly. profiles.institution_id is single-valued, so that
 *  filter hid anyone serving a second college — Dr Dhanasekar Balakrishnan is
 *  Principal of Dental AND of Allied Health, and his profile can only name one
 *  of them, so he never appeared in the other's picker. The RPC returns the same
 *  people plus anyone holding an active user_institution_access grant, which is
 *  exactly the set fn_set_college_leadership accepts, and it is SECURITY DEFINER
 *  because user_institution_access is not readable by a college officer and RLS
 *  denial is silent — a direct read would quietly return a short list. */
function useCollegePeople(institutionId: string) {
  return useQuery({
    queryKey: QK.people(institutionId),
    enabled: !!institutionId,
    queryFn: async (): Promise<Candidate[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb.rpc('fn_list_leadership_candidates', {
        p_institution_id: institutionId,
      });
      if (error) throw error;
      return (data ?? []) as Candidate[];
    },
    staleTime: 60 * 1000,
  });
}

function LeadershipPageBody() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editingBasis, setEditingBasis] = useState<string | null>(null);

  const collegesQuery = useLeadershipColleges();
  const colleges = collegesQuery.data ?? [];

  // The basis feature is inert until 20260809103500 is applied. Failing to read
  // the vocabulary is the signal, and it is a soft one on purpose: the rest of
  // this page must keep working unchanged whether the migration has landed or
  // not, so the code half of the PR can deploy in either order.
  const basisQuery = useAppointmentBasis();
  const basisOptions = basisQuery.data ?? [];
  const basisEnabled = !basisQuery.isError && basisOptions.length > 0;

  // The picker defaults to the first college without storing that in an
  // effect: an empty selection simply resolves to the first row.
  const effectiveId = selectedId || colleges[0]?.institution_id || '';

  const detailQuery = useCollegeLeadership(effectiveId);
  const peopleQuery = useCollegePeople(effectiveId);

  const detail = detailQuery.data ?? null;
  const loadingList = collegesQuery.isLoading;
  const loadingDetail = detailQuery.isLoading;

  const loadError =
    (collegesQuery.error as Error | null)?.message ??
    (detailQuery.error as Error | null)?.message ??
    null;

  // --- the single write path ------------------------------------------------
  const assign = useCallback(
    async (
      position: PositionKey,
      rawUserId: string,
      opts?: {
        departmentId?: string;
        label?: string;
        basisCode?: string;
        basisNote?: string;
      },
    ) => {
      if (!effectiveId) return;
      const userId = rawUserId === UNASSIGNED ? null : rawUserId;
      setSavingKey(opts?.departmentId ?? position);

      const sb = createClientSupabaseClient() as any;
      // The basis arguments are sent ONLY when the caller has one to record.
      // Omitting them keeps this a four-argument call, which resolves against
      // the pre-migration function too — so changing a post-holder keeps working
      // whether or not 20260809103500 has been applied. Omitting them also
      // leaves an already-recorded reason untouched; the RPC preserves it while
      // the holder is unchanged.
      const { error } = await sb.rpc('fn_set_college_leadership', {
        p_institution_id: effectiveId,
        p_position: position,
        p_user_id: userId,
        p_department_id: opts?.departmentId ?? null,
        ...(opts?.basisCode
          ? { p_basis_code: opts.basisCode, p_basis_note: opts.basisNote ?? null }
          : {}),
      });

      setSavingKey(null);

      if (error) {
        // The RPC raises a plain-English reason for every refusal (wrong
        // institution, missing permission, unknown department). Surface it
        // verbatim rather than a generic failure.
        toast.error(error.message);
        return;
      }

      toast.success(
        opts?.basisCode
          ? `Reason recorded for ${opts?.label ?? 'this position'}.`
          : userId
            ? `${opts?.label ?? 'Position'} updated.`
            : `${opts?.label ?? 'Position'} cleared.`,
      );
      setEditingBasis(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: QK.detail(effectiveId) }),
        qc.invalidateQueries({ queryKey: QK.colleges }),
      ]);
    },
    [effectiveId, qc],
  );

  const candidateOptions = useMemo(
    () => [
      { value: UNASSIGNED, label: '— Not assigned —' },
      ...(peopleQuery.data ?? []).map((c) => ({
        value: c.id,
        label: c.full_name?.trim() || c.email || 'Unnamed person',
      })),
    ],
    [peopleQuery.data],
  );

  const selectedSummary = colleges.find((c) => c.institution_id === effectiveId);
  const totalUnfilled = colleges.reduce((sum, c) => sum + c.unfilled, 0);

  const headlessDepartments =
    detail?.departments.filter((d) => !d.head_user_id).length ?? 0;
  const unfilledPositions =
    detail === null
      ? 0
      : POSITIONS.filter((p) => detail[p.key] === null).length;

  // ------------------------------------------------------------------------
  if (loadError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm">
        <p className="font-medium text-destructive">Could not load leadership.</p>
        <p className="mt-2 text-muted-foreground">{loadError}</p>
        <p className="mt-2 text-muted-foreground">
          If this says you do not have access, ask a super admin to grant you the{' '}
          <code className="rounded bg-muted px-1 py-0.5">
            organizations.leadership.manage
          </code>{' '}
          permission in Role Management.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => {
            void collegesQuery.refetch();
            void detailQuery.refetch();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    );
  }

  if (loadingList) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (colleges.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        No colleges are in scope for your role, so there is nothing to show here.
        Ask a super admin to widen your institution access.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* --- the count. Making absence visible is the point of the page. --- */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-5">
        <div>
          <p className="text-sm text-muted-foreground">
            Unfilled leadership positions across the {colleges.length} college
            {colleges.length === 1 ? '' : 's'} you can manage
          </p>
          <p
            className={
              totalUnfilled > 0
                ? 'mt-1 text-3xl font-semibold text-amber-700 dark:text-amber-500'
                : 'mt-1 text-3xl font-semibold text-emerald-700 dark:text-emerald-500'
            }
          >
            {totalUnfilled}
          </p>
        </div>
        <div className="min-w-[260px]">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            College
          </label>
          <SearchableSelect
            value={effectiveId}
            onValueChange={setSelectedId}
            options={colleges.map((c) => ({
              value: c.institution_id,
              label:
                c.unfilled > 0
                  ? `${c.institution_name} — ${c.unfilled} unfilled`
                  : `${c.institution_name} — complete`,
            }))}
            placeholder="Choose a college"
            searchPlaceholder="Search colleges…"
            className="w-full"
          />
        </div>
      </div>

      {loadingDetail && <Skeleton className="h-64 w-full" />}

      {!loadingDetail && detail && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Building className="h-5 w-5 text-muted-foreground" aria-hidden />
            <h2 className="text-lg font-semibold">{detail.institution_name}</h2>
            {selectedSummary && selectedSummary.unfilled > 0 ? (
              <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-500">
                <AlertCircle className="mr-1 h-3.5 w-3.5" />
                {unfilledPositions} of 4 senior posts empty · {headlessDepartments} department
                {headlessDepartments === 1 ? '' : 's'} without a Head
              </Badge>
            ) : (
              <Badge variant="outline" className="border-emerald-500 text-emerald-700 dark:text-emerald-500">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Fully staffed
              </Badge>
            )}
          </div>

          {/* --- the four senior posts --- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Senior positions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {detail.committee_id === null && (
                <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  This college has no IQAC committee record yet. Naming a
                  Chairman or Coordinator creates one automatically.
                </p>
              )}
              {POSITIONS.map((pos) => {
                const holder = detail[pos.key];
                const name = personName(holder);
                // Only Principal and Vice Principal have anywhere to keep a
                // basis — IQAC office bearers live on the committee row and the
                // RPC refuses one for them rather than pretending to store it.
                const canRecordBasis =
                  basisEnabled &&
                  holder !== null &&
                  (pos.key === 'principal' || pos.key === 'vice_principal');
                return (
                  <div
                    key={pos.key}
                    className="flex flex-col gap-3 border-b border-border pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{pos.label}</p>
                      <p className="text-xs text-muted-foreground">{pos.why}</p>
                      <div className="mt-1">
                        {name ? (
                          <span className="text-sm">
                            {name}
                            {holder?.email && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {holder.email}
                              </span>
                            )}
                          </span>
                        ) : (
                          <NotAssigned />
                        )}
                      </div>

                      {canRecordBasis && holder && (
                        <>
                          <BasisLine holder={holder} />
                          {editingBasis === pos.key ? (
                            <BasisEditor
                              holder={holder}
                              options={basisOptions}
                              busy={savingKey !== null}
                              onCancel={() => setEditingBasis(null)}
                              onSave={(basisCode, basisNote) =>
                                void assign(pos.key, holder.user_id, {
                                  label: pos.label,
                                  basisCode,
                                  basisNote,
                                })
                              }
                            />
                          ) : (
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto px-0 text-xs"
                              disabled={savingKey !== null}
                              onClick={() => setEditingBasis(pos.key)}
                            >
                              {holder.basis_code
                                ? 'Change the reason'
                                : 'Record why this post was given'}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                    <SearchableSelect
                      value={holder?.user_id ?? UNASSIGNED}
                      onValueChange={(v) =>
                        void assign(pos.key, v, { label: pos.label })
                      }
                      options={candidateOptions}
                      placeholder={name ? 'Change…' : 'Assign someone…'}
                      searchPlaceholder="Search people…"
                      disabled={savingKey !== null}
                      loading={savingKey === pos.key}
                      className="w-full shrink-0 sm:w-[280px]"
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* --- every department, with or without a Head --- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Departments ({detail.departments.length})
                {headlessDepartments > 0 && (
                  <span className="ml-2 text-sm font-normal text-amber-700 dark:text-amber-500">
                    · {headlessDepartments} without a Head
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {detail.departments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This college has no departments on record.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Department</TableHead>
                        <TableHead className="w-24">Code</TableHead>
                        <TableHead>Head of Department</TableHead>
                        <TableHead className="w-[300px]">Assign</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.departments.map((d) => (
                        <TableRow key={d.department_id}>
                          <TableCell className="font-medium">
                            {d.department_name}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {d.department_code ?? '—'}
                          </TableCell>
                          <TableCell>
                            {d.head_user_id ? (
                              <span className="text-sm">
                                {d.head_name?.trim() || d.head_email || 'Unnamed person'}
                              </span>
                            ) : (
                              <NotAssigned />
                            )}
                          </TableCell>
                          <TableCell>
                            <SearchableSelect
                              value={d.head_user_id ?? UNASSIGNED}
                              onValueChange={(v) =>
                                void assign('department_head', v, {
                                  departmentId: d.department_id,
                                  label: `${d.department_name} Head`,
                                })
                              }
                              options={candidateOptions}
                              placeholder={
                                d.head_user_id ? 'Change…' : 'Assign someone…'
                              }
                              searchPlaceholder="Search people…"
                              disabled={savingKey !== null}
                              loading={savingKey === d.department_id}
                              className="w-full"
                            />
                          </TableCell>
                        </TableRow>
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
  );
}

// A denial must say so out loud and name who can fix it — never a silent
// redirect that leaves the user clicking the same link forever.
const DENIED = (
  <div className="rounded-md border border-border bg-muted/30 p-6 text-sm">
    <p className="font-medium">You do not have access to College Leadership.</p>
    <p className="mt-2 text-muted-foreground">
      This page assigns Principals, Vice Principals, IQAC office bearers and
      Heads of Department. Ask a super admin to grant you the{' '}
      <code className="rounded bg-muted px-1 py-0.5">
        organizations.leadership.manage
      </code>{' '}
      permission in Users → Role Management.
    </p>
  </div>
);

export default function CollegeLeadershipPage() {
  return (
    <PermissionGuard
      module="organizations.leadership"
      action="manage"
      fallback={<ContentLayout title="College Leadership">{DENIED}</ContentLayout>}
      loading={
        <ContentLayout title="College Leadership">
          <Skeleton className="h-40 w-full" />
        </ContentLayout>
      }
    >
      <ContentLayout title="College Leadership">
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              What this page is for
            </h3>
            <p>
              Leadership used to be recorded on the person and never asked about
              the college, so an empty post looked exactly like a filled one. This
              page asks per college and shows every gap.
            </p>
            <p className="mt-2">
              The IQAC rule is <strong>Principal chairs, Vice Principal
              coordinates</strong>. Naming an IQAC Chairman or Coordinator for a
              college that has no committee record creates that record here.
            </p>
            <p className="mt-2">
              A Principal or Vice Principal post can also record{' '}
              <strong>why it was given</strong>. Some posts come with another job
              and pass to whoever holds that job next; others are given to one
              person and end with them. Record it here so nobody has to guess.
            </p>
          </div>
          <LeadershipPageBody />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
