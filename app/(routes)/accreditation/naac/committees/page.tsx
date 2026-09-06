// app/(routes)/accreditation/naac/committees/page.tsx
// ============================================================================
// /accreditation/naac/committees — IQAC committee list (PR-A8 commit 2).
//
// Scopes:
//   - super_admin's "All institutions" scope applies NO institution filter at
//     all — it returns committees from every institution, not only the colleges
//   - institution users see their own institution's committees
//   - RLS on accreditation_committees + role_has_institution_access() enforces
//
// Body-hard-coded to NAAC here. Same component shape will be copy-tweaked for
// PR-A9 (NIRF committees), PR-A10 (NBA cells), A12-A14 (inspection panels),
// A15 (NCTE/AICTE coordinators).
// ============================================================================

'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  Plus,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Building2,
  Network,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { findUmbrellaRow } from './_lib/umbrella-row';
import { decideCommitteeListAccess } from './_lib/committee-access';
import {
  useNAACCommittees,
  useCreateNAACCommittee,
} from '@/hooks/accreditation/use-naac-committees';
import { useMyCommitteeRoster } from '@/hooks/accreditation/use-my-committee-roster';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  AccreditationCommittee,
  CommitteeType,
} from '@/lib/services/accreditation/accreditation-committee-service';
import { toast } from 'sonner';

interface Institution {
  id: string;
  name: string;
  iqac_code: string | null;
  institution_type: string;
}

function useJKKNInstitutions() {
  return useQuery({
    queryKey: ['institutions', 'jkkn-iqac'],
    queryFn: async (): Promise<Institution[]> => {
      const sb = createClientSupabaseClient() as any;
      // NO iqac_code filter. It previously restricted this list to the 8 IQAC
      // colleges, which made a Cluster Academic Council impossible to express:
      // JKKN Main Office (its filing home) and BOTH schools (JKKN Matric Higher
      // Secondary School, Nattraja Vidhyalya CBSE) were absent from the picker,
      // and the CAC exists precisely to cluster the colleges AND the schools.
      const { data, error } = await sb
        .from('institutions')
        .select('id, name, iqac_code, institution_type')
        .order('name');
      if (error) throw error;
      return (data ?? []) as Institution[];
    },
    staleTime: 30 * 60 * 1000,
  });
}

// These keys are the ONLY values the database accepts (verified against the live
// accreditation_committees_committee_type_check constraint, 2026-07-26). The old
// list offered 'sub' / 'ad_hoc' / 'review' — all three rejected on save — and
// hid 'icc' / 'anti_ragging' / 'grievance' / 'coordinator' / 'statutory', so the
// cells NAAC 7.7 asks about could not be formed here at all.
const COMMITTEE_TYPE_LABELS: Record<CommitteeType, string> = {
  main: 'Main IQAC',
  coordinator: 'Department coordinator',
  icc: 'Internal Complaints Committee (ICC)',
  anti_ragging: 'Anti-ragging committee',
  grievance: 'Grievance redressal cell',
  inspection: 'Inspection panel',
  statutory: 'Statutory committee',
  cluster: 'Cluster council (CAC)',
};

export default function NAACCommitteesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSuperAdmin, userProfile, can, isLoading: permsLoading } =
    usePermissions();

  const hasViewPermission =
    isSuperAdmin || can('accreditation.naac.committees.view');
  const canCreate = isSuperAdmin || can('accreditation.naac.committees.create');

  // Director decision 8: the roster opens the page, not the job title. Only
  // asked for when the permission did NOT already open it — for a permission
  // holder this read would return every roster row on the platform and change
  // nothing about the answer.
  const { data: mySeats, isLoading: rosterLoading } =
    useMyCommitteeRoster({ enabled: !permsLoading && !hasViewPermission });

  // The gate is derived from that read, so it can never open wider than the
  // data: if RLS returned nothing, the viewer gets the refusal panel below
  // rather than an empty list that reads as "no committees exist". Director
  // decision 7: a seat whose term has ended does not open the page either, and
  // the panel names the date instead of pretending they were never appointed.
  const access = decideCommitteeListAccess({
    hasViewPermission,
    seats: mySeats ?? [],
  });
  const canView = access.allowed;
  const isRosterOnlyViewer = access.via === 'roster';

  const { data: institutions } = useJKKNInstitutions();

  // Filter state: URL param ?college=<id> or 'all' (super_admin default)
  const urlCollege = searchParams.get('college');
  const defaultScope = isSuperAdmin
    ? urlCollege ?? 'all'
    : userProfile?.institution_id ?? '';
  const [scope, setScope] = useState<string>(defaultScope);

  // usePermissions() resolves AFTER the first paint, so the initialiser above runs
  // while isSuperAdmin is still false and freezes `scope` to '' — the non-admin
  // branch — for a viewer who then turns out to BE a super admin. A useState
  // initialiser never re-runs, so that '' survives. Read as 'all', matching what
  // the query below already assumes, so the label and the picker agree with the
  // rows actually fetched instead of reading '—' against an unfiltered list.
  const superAdminScope = scope || 'all';

  // A roster-only viewer is NOT filtered to their own institution. A committee
  // is filed against one institution, but the people appointed to it need not
  // sit in it — the single IQAC on production today is filed under Arts and
  // Science (Self) while its chair's profile belongs to a different college.
  // Filtering such a viewer to their own institution_id would hand them an
  // empty list for a committee they chair. RLS already narrows this to exactly
  // the committees they are on, so let it.
  const effectiveScope = isSuperAdmin
    ? superAdminScope
    : isRosterOnlyViewer
      ? 'all'
      : userProfile?.institution_id ?? '';

  const { data: committees, isLoading } = useNAACCommittees(
    effectiveScope === '' ? 'all' : effectiveScope,
  );

  // 'all' passes institutionId: undefined to the service — i.e. NO institution
  // filter whatsoever. It is not "the 8 colleges"; it is every institution the
  // viewer's RLS lets through, schools and Main Office included. Say that.
  const activeInstitutionName = useMemo(() => {
    // A roster-only viewer is not looking at "all institutions" — they are
    // looking at the committees they were appointed to, wherever those are
    // filed. Saying "All institutions" to them would overstate what they see.
    if (isRosterOnlyViewer) return 'Committees you are on';
    if (effectiveScope === 'all') {
      return institutions
        ? `All institutions (${institutions.length})`
        : 'All institutions';
    }
    return institutions?.find((i) => i.id === effectiveScope)?.name ?? '—';
  }, [effectiveScope, institutions, isRosterOnlyViewer]);

  // A cluster council spans institutions; it is only FILED against one of them.
  // Listing it inside the per-institution table makes it read as belonging to
  // its filing row, so it gets its own section instead.
  const clusterCommittees = useMemo(
    () => (committees ?? []).filter((c) => c.committee_type === 'cluster'),
    [committees],
  );
  const institutionCommittees = useMemo(
    () => (committees ?? []).filter((c) => c.committee_type !== 'cluster'),
    [committees],
  );

  const institutionsById = useMemo(() => {
    const map = new Map<string, Institution>();
    (institutions ?? []).forEach((i) => map.set(i.id, i));
    return map;
  }, [institutions]);

  const handleScopeChange = (value: string) => {
    setScope(value);
    const params = new URLSearchParams(searchParams);
    if (value === 'all') params.delete('college');
    else params.set('college', value);
    router.replace(`/accreditation/naac/committees?${params.toString()}`);
  };

  // rosterLoading matters: refusing while the roster read is still in flight
  // would flash "no access" at a member who does have it.
  if (permsLoading || rosterLoading) {
    return (
      <ContentLayout title="NAAC IQAC Committees">
        <Skeleton className="h-40 w-full" />
      </ContentLayout>
    );
  }

  if (!canView) {
    return (
      <ContentLayout title="NAAC IQAC Committees">
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <p className="text-base font-semibold">{access.title}</p>
            <p className="mx-auto max-w-xl text-sm text-muted-foreground">
              {access.detail}
            </p>
            <p className="text-sm text-muted-foreground">
              Who to ask: <span className="font-medium">{access.contact}</span>
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="NAAC IQAC Committees">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NAAC', href: '/accreditation/naac' },
          { label: 'Committees', href: '/accreditation/naac/committees' },
        ]}
      />

      <div className="space-y-6">
        {/* Header + filters */}
        <Card className="border-2 border-indigo-300 bg-indigo-50/40 dark:bg-indigo-950/20">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <ShieldCheck className="h-6 w-6 text-indigo-600" />
                  IQAC Committees
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  Internal Quality Assurance Cell per NAAC mandate. Principal IS
                  the IQAC Chairman; HoDs are Department IQAC Coordinators.
                  External members (industry, alumni, practitioners) supported.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isSuperAdmin && (
                  <Select
                    value={superAdminScope}
                    onValueChange={handleScopeChange}
                  >
                    <SelectTrigger className="min-w-[240px] bg-card">
                      <SelectValue placeholder="Select college" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All institutions</SelectItem>
                      {(institutions ?? []).map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.iqac_code ? `[${inst.iqac_code}] ` : ''}
                          {inst.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {canCreate && (
                  <CreateCommitteeDialog
                    defaultInstitutionId={
                      effectiveScope === 'all' || effectiveScope === ''
                        ? undefined
                        : effectiveScope
                    }
                    institutions={institutions ?? []}
                    isSuperAdmin={isSuperAdmin}
                  />
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Scope</div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {activeInstitutionName}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Committees</div>
                <div className="text-2xl font-bold">
                  {isLoading ? '—' : committees?.length ?? 0}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Total active members</div>
                <div className="text-2xl font-bold">
                  {isLoading
                    ? '—'
                    : (committees ?? []).reduce((s, c) => s + c.member_count, 0)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cluster councils — bodies that span institutions, not bodies inside one */}
        {!isLoading && clusterCommittees.length > 0 && (
          <Card className="border-2 border-amber-300 bg-amber-50/40 dark:bg-amber-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="h-5 w-5 text-amber-600" />
                Cluster councils
              </CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                Councils that hold several institutions together rather than
                sitting inside one. Each is filed against a single row so it can
                be found and governed, but it belongs to every institution it
                spans.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {clusterCommittees.map((c) => (
                <ClusterCouncilCard
                  key={c.id}
                  committee={c}
                  institutionsById={institutionsById}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Committees held by one institution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : institutionCommittees.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                {clusterCommittees.length > 0 ? (
                  'No committee here is held by a single institution — the cluster councils above span several.'
                ) : (
                  <>
                    No committees yet.{' '}
                    {canCreate
                      ? 'Click “New committee” to form the first IQAC.'
                      : 'Ask your IQAC chairman to form a committee.'}
                  </>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Formed</TableHead>
                    <TableHead>Term end</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {institutionCommittees.map((c) => {
                    const institution = institutions?.find(
                      (i) => i.id === c.institution_id,
                    );
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="font-medium">{c.committee_name}</div>
                          {institution && (
                            <div className="text-xs text-muted-foreground">
                              {institution.iqac_code
                                ? `[${institution.iqac_code}] `
                                : ''}
                              {institution.name}
                            </div>
                          )}
                          {(c.member_institution_ids?.length ?? 0) > 0 && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              Spans {c.member_institution_ids!.length}{' '}
                              institutions
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[11px]">
                            {COMMITTEE_TYPE_LABELS[c.committee_type]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {c.formed_at}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.term_end ?? '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{c.member_count}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/accreditation/naac/committees/${c.id}`}>
                            <Button size="sm" variant="outline">
                              Manage
                              <ArrowRight className="ml-1 h-3 w-3" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

// ----------------------------------------------------------------------------
// Cluster council row — surfaces what makes the body a cluster: the roster of
// institutions it spans, and the fact that its institution_id is a filing
// location rather than an owner.
// ----------------------------------------------------------------------------

function ClusterCouncilCard({
  committee,
  institutionsById,
}: {
  committee: AccreditationCommittee & { member_count: number };
  institutionsById: Map<string, Institution>;
}) {
  const memberIds = committee.member_institution_ids ?? [];
  const memberNames = memberIds
    .map((id) => institutionsById.get(id))
    .filter((inst): inst is Institution => !!inst)
    .map((inst) => `${inst.iqac_code ? `[${inst.iqac_code}] ` : ''}${inst.name}`);
  const filedUnder = institutionsById.get(committee.institution_id)?.name;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{committee.committee_name}</span>
            <Badge variant="outline" className="text-[11px]">
              {COMMITTEE_TYPE_LABELS[committee.committee_type]}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Network className="h-4 w-4 text-amber-600" />
            {memberIds.length > 0
              ? `Spans ${memberIds.length} institution${
                  memberIds.length === 1 ? '' : 's'
                }`
              : 'Cluster roster not recorded'}
          </div>

          {memberNames.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {memberNames.join(' · ')}
            </p>
          )}

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Filed under {filedUnder ?? 'an institution row'} — a filing
              location, not an owner. The council belongs to every institution
              it spans.
            </span>
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-4">
          <div className="text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Formed {committee.formed_at}
            </div>
            <div>Term end {committee.term_end ?? '—'}</div>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{committee.member_count}</span>
          </div>
          <Link href={`/accreditation/naac/committees/${committee.id}`}>
            <Button size="sm" variant="outline">
              Manage
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Create-committee dialog
// ----------------------------------------------------------------------------

function CreateCommitteeDialog({
  defaultInstitutionId,
  institutions,
  isSuperAdmin,
}: {
  defaultInstitutionId?: string;
  institutions: Institution[];
  isSuperAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<CommitteeType>('main');
  const [institutionId, setInstitutionId] = useState<string>(
    defaultInstitutionId ?? '',
  );
  const [formedAt, setFormedAt] = useState<string>(
    new Date().toISOString().split('T')[0] ?? '',
  );
  const [termEnd, setTermEnd] = useState<string>('');
  const [notes, setNotes] = useState('');
  // Cluster roster. Seeded with every IQAC college the first time 'cluster' is
  // chosen; the schools are ticked by hand because nothing in the data marks an
  // institution as a school, and inventing that taxonomy here would be a guess.
  const [memberIds, setMemberIds] = useState<string[]>([]);

  const isCluster = type === 'cluster';
  const clusterRosterTooSmall = isCluster && memberIds.length < 2;

  const create = useCreateNAACCommittee();

  const toggleMember = (id: string) =>
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );

  // When the Director switches to a cluster council, pre-tick the colleges and
  // file it at Main Office — the umbrella row that belongs to every college and
  // none. Both remain editable.
  const handleTypeChange = (next: CommitteeType) => {
    setType(next);
    if (next === 'cluster') {
      if (memberIds.length === 0) {
        setMemberIds(
          (institutions ?? []).filter((i) => i.iqac_code).map((i) => i.id),
        );
      }
      const mainOffice = findUmbrellaRow(institutions ?? []);
      if (mainOffice) setInstitutionId(mainOffice.id);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !institutionId || !formedAt) {
      toast.error('Committee name, institution, and formed date are required');
      return;
    }
    if (clusterRosterTooSmall) {
      toast.error(
        'A cluster council must include at least two institutions — that is what makes it a cluster.',
      );
      return;
    }
    try {
      await create.mutateAsync({
        institution_id: institutionId,
        member_institution_ids: isCluster ? memberIds : [],
        body_code: 'NAAC',
        committee_name: name.trim(),
        committee_type: type,
        formed_at: formedAt,
        term_end: termEnd || null,
        metadata: notes.trim() ? { notes: notes.trim() } : null,
      });
      toast.success('Committee created');
      setOpen(false);
      setName('');
      setNotes('');
      setTermEnd('');
      setMemberIds([]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create committee';
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New committee
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isCluster
              ? 'Form the Cluster Academic Council'
              : 'Form new IQAC committee'}
          </DialogTitle>
          <DialogDescription>
            {isCluster
              ? 'One council across the whole of JKKN Institutions — every college and school together. It integrates academic planning, shares resources instead of duplicating them, and coordinates quality improvement across disciplinary lines, so time, money and effort are not spent twice.'
              : 'NAAC mandates one main IQAC per college, with the Principal as Chairman. Other committee types handle attribute-specific work.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {isSuperAdmin && (
            <div className="space-y-1.5">
              <Label>{isCluster ? 'Filed under' : 'Institution'}</Label>
              <Select value={institutionId} onValueChange={setInstitutionId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isCluster ? 'Select the umbrella row' : 'Select college'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(isCluster
                    ? institutions
                    : institutions.filter((i) => i.iqac_code)
                  ).map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.iqac_code ? `[${inst.iqac_code}] ` : ''}
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isCluster && (
                <p className="text-xs text-muted-foreground">
                  Where the council is filed, not who owns it. JKKN Main Office
                  is the umbrella row that belongs to every college and none.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Committee name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main IQAC – Academic Year 2026"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={type}
              onValueChange={(v) => handleTypeChange(v as CommitteeType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(COMMITTEE_TYPE_LABELS) as CommitteeType[]).map(
                  (t) => (
                    <SelectItem key={t} value={t}>
                      {COMMITTEE_TYPE_LABELS[t]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          {isCluster && (
            <div className="space-y-1.5">
              <Label>
                Institutions in the cluster{' '}
                <span className="font-normal text-muted-foreground">
                  ({memberIds.length} selected)
                </span>
              </Label>
              <p className="text-xs text-muted-foreground">
                Tick every college and school the council holds together. The
                colleges are pre-ticked; add the schools.
              </p>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
                {institutions.map((inst) => (
                  <label
                    key={inst.id}
                    htmlFor={`member-${inst.id}`}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/60"
                  >
                    <Checkbox
                      id={`member-${inst.id}`}
                      checked={memberIds.includes(inst.id)}
                      onCheckedChange={() => toggleMember(inst.id)}
                    />
                    <span>
                      {inst.iqac_code ? `[${inst.iqac_code}] ` : ''}
                      {inst.name}
                    </span>
                  </label>
                ))}
              </div>
              {clusterRosterTooSmall && (
                <p className="text-xs text-destructive">
                  Pick at least two — a cluster of one is not a cluster.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Formed on</Label>
              <Input
                type="date"
                value={formedAt}
                onChange={(e) => setFormedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Term end (optional)</Label>
              <Input
                type="date"
                value={termEnd}
                onChange={(e) => setTermEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Purpose, scope, terms of reference..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={create.isPending || clusterRosterTooSmall}
          >
            {create.isPending ? 'Creating…' : 'Create committee'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
