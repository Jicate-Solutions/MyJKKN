// app/(routes)/accreditation/naac/committees/[id]/page.tsx
// ============================================================================
// /accreditation/naac/committees/[id] — IQAC committee detail + member mgmt (PR-A8 c2).
//
// Manages accreditation_committee_members for a given committee:
//   - Internal members: picked from MyJKKN profiles (staff/faculty).
//   - External members: industry experts, alumni, practitioners — stored via
//     external_name/org/email with is_external=true + user_id=null.
//   - Roles: chair/coordinator/member/observer/secretary/convenor.
//   - Soft-remove (is_active=false) preserves historical term roster for audit.
// ============================================================================

'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
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
  UserPlus,
  Building2,
  Mail,
  Trash2,
  ExternalLink,
  Shield,
  Network,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  useNAACCommittee,
  useNAACCommitteeMembers,
  useAddInternalMember,
  useAddExternalMember,
  useRemoveMember,
  useDeactivateNAACCommittee,
} from '@/hooks/accreditation/use-naac-committees';
import { useMyCommitteeRoster } from '@/hooks/accreditation/use-my-committee-roster';
import { decideCommitteeDetailAccess, isSeatCurrent } from '../_lib/committee-access';
import { usePermissions } from '@/hooks/use-permissions';
import type { CommitteeMemberRole } from '@/lib/services/accreditation/accreditation-committee-service';
import { MeetingsSection } from './_components/meetings-section';
import { toast } from 'sonner';

const ROLE_LABELS: Record<CommitteeMemberRole, string> = {
  chair: 'Chairman',
  coordinator: 'Coordinator',
  member: 'Member',
  observer: 'Observer',
  secretary: 'Secretary',
  convenor: 'Convenor',
};

const ROLE_ACCENT: Record<CommitteeMemberRole, string> = {
  chair: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
  coordinator: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  member: 'bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200',
  observer: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  secretary: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  convenor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
};

interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  institution_id: string | null;
}

function useProfileLookup(userIds: string[]) {
  return useQuery({
    queryKey: ['profiles', 'lookup', [...userIds].sort().join(',')],
    queryFn: async (): Promise<Record<string, ProfileLite>> => {
      if (userIds.length === 0) return {};
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('profiles')
        .select('id, full_name, email, role, institution_id')
        .in('id', userIds);
      if (error) throw error;
      return ((data ?? []) as ProfileLite[]).reduce<Record<string, ProfileLite>>(
        (acc, p) => {
          acc[p.id] = p;
          return acc;
        },
        {},
      );
    },
    enabled: userIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

function useInstitutionLookup(institutionId: string | null) {
  return useQuery({
    queryKey: ['institution', 'lookup', institutionId],
    queryFn: async () => {
      if (!institutionId) return null;
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('institutions')
        .select('id, name, iqac_code, institution_type')
        .eq('id', institutionId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        iqac_code: string | null;
        institution_type: string;
      } | null;
    },
    enabled: !!institutionId,
    staleTime: 30 * 60 * 1000,
  });
}

export default function NAACCommitteeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { isSuperAdmin, can, isLoading: permsLoading } = usePermissions();

  const hasViewPermission =
    isSuperAdmin || can('accreditation.naac.committees.view');

  // Director decision 8: being named on THIS committee's roster opens it, no
  // matter what the viewer's job title is. Only read when the permission did
  // not already answer the question.
  const { data: mySeats, isLoading: rosterLoading } =
    useMyCommitteeRoster({ enabled: !permsLoading && !hasViewPermission });

  // Director decision 7: an expired seat is refused here, with the date, so
  // the viewer never falls through to the notFound() below and is told this
  // committee does not exist.
  const access = decideCommitteeDetailAccess({
    hasViewPermission,
    seats: mySeats ?? [],
    committeeId: id,
  });
  const canView = access.allowed;

  const canManageMembers =
    isSuperAdmin || can('accreditation.naac.committees.members.manage');
  const canManageMeetings =
    isSuperAdmin || can('accreditation.naac.committees.meetings.manage');
  const canEdit = isSuperAdmin || can('accreditation.naac.committees.edit');
  const canDelete = isSuperAdmin || can('accreditation.naac.committees.delete');

  const { data: committee, isLoading: cLoading, error } = useNAACCommittee(id);
  const { data: members, isLoading: mLoading } = useNAACCommitteeMembers(id);
  const { data: institution } = useInstitutionLookup(
    committee?.institution_id ?? null,
  );

  const memberUserIds = (members ?? [])
    .filter((m) => m.user_id)
    .map((m) => m.user_id as string);
  const chairId = committee?.chair_user_id ?? null;
  const profileIds = [...new Set([...memberUserIds, ...(chairId ? [chairId] : [])])];
  const { data: profiles } = useProfileLookup(profileIds);

  if (permsLoading || cLoading || rosterLoading) {
    return (
      <ContentLayout title="IQAC Committee">
        <Skeleton className="h-40 w-full" />
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="IQAC Committee">
        <Card>
          <CardContent className="py-10 text-center text-sm text-red-600">
            Failed to load committee: {(error as Error).message}
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  // Refusal is decided BEFORE notFound(). RLS denial in this repo is silent —
  // a denied read returns null with no error — so the previous order turned
  // "you are not allowed" into a 404, which tells the viewer the committee does
  // not exist. That is the same fabricated-absence failure the roster arm was
  // written to end, so it is fixed here rather than left to bite the first real
  // member. A genuine bad id still 404s, below.
  if (!canView) {
    return (
      <ContentLayout title="IQAC Committee">
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

  if (!committee) {
    notFound();
  }

  return (
    <ContentLayout title={committee.committee_name}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NAAC', href: '/accreditation/naac' },
          { label: 'Committees', href: '/accreditation/naac/committees' },
          {
            label: committee.committee_name,
            href: `/accreditation/naac/committees/${id}`,
          },
        ]}
      />

      <div className="space-y-6">
        {/* Header */}
        <Card className="border-2 border-indigo-300 bg-indigo-50/40 dark:bg-indigo-950/20">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Shield className="h-6 w-6 text-indigo-600" />
                  {committee.committee_name}
                </CardTitle>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{committee.committee_type}</Badge>
                  <Badge variant={committee.is_active ? 'default' : 'secondary'}>
                    {committee.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  {institution && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {institution.iqac_code ? `[${institution.iqac_code}] ` : ''}
                      {institution.name}
                      {committee.committee_type === 'cluster' &&
                        ' · filing location'}
                    </span>
                  )}
                </div>
              </div>
              {canDelete && committee.is_active && (
                <DeactivateCommitteeButton id={id} name={committee.committee_name} />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Formed</div>
                <div className="text-sm font-medium">{committee.formed_at}</div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Term end</div>
                <div className="text-sm font-medium">
                  {committee.term_end ?? '—'}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Chairman</div>
                <div className="text-sm font-medium">
                  {chairId
                    ? profileName(profiles?.[chairId]) ?? 'Not yet resolved'
                    : 'Not assigned'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cluster scope — only for councils that span institutions */}
        {committee.committee_type === 'cluster' && (
          <ClusterScopeCard
            memberInstitutionIds={committee.member_institution_ids ?? []}
            filedUnderLabel={institution?.name ?? null}
          />
        )}

        {/* Members */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5" />
                Members
                <Badge variant="outline" className="ml-2">
                  {mLoading ? '—' : members?.length ?? 0} active
                </Badge>
              </CardTitle>
              {canManageMembers && committee.is_active && (
                <AddMemberDialog committeeId={id} />
              )}
            </div>
          </CardHeader>
          <CardContent>
            {mLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (members ?? []).length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No active members yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Joined</TableHead>
                    {/* Director decision 7: access ends on this date, so the
                        list has to show it. Without it a manager reads an
                        expired member as a sitting one and cannot explain why
                        that person says the page is shut. */}
                    <TableHead>Term end</TableHead>
                    {canManageMembers && (
                      <TableHead className="text-right">Action</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(members ?? []).map((m) => {
                    const display = m.is_external
                      ? m.external_name ?? '—'
                      : profileName(profiles?.[m.user_id ?? '']) ?? 'Loading…';
                    const sub = m.is_external
                      ? [m.external_org, m.external_email]
                          .filter(Boolean)
                          .join(' · ')
                      : profiles?.[m.user_id ?? '']?.email ?? '';
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="font-medium">{display}</div>
                          {sub && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {m.is_external && <Mail className="h-3 w-3" />}
                              {sub}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`border-0 text-[11px] ${ROLE_ACCENT[m.role as CommitteeMemberRole]}`}
                          >
                            {ROLE_LABELS[m.role as CommitteeMemberRole] ?? m.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {m.is_external ? (
                            <Badge variant="outline" className="gap-1">
                              <ExternalLink className="h-3 w-3" />
                              External
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Internal</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{m.joined_at}</TableCell>
                        <TableCell className="text-xs">
                          {m.term_end ? (
                            <span className="flex flex-wrap items-center gap-1.5">
                              {m.term_end}
                              {!isSeatCurrent({
                                committeeId: m.committee_id,
                                termEnd: m.term_end,
                              }) && (
                                <Badge
                                  variant="outline"
                                  className="border-amber-300 bg-amber-50 text-[10px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-100"
                                >
                                  Term ended
                                </Badge>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              No end date
                            </span>
                          )}
                        </TableCell>
                        {canManageMembers && (
                          <TableCell className="text-right">
                            <RemoveMemberButton
                              memberId={m.id}
                              committeeId={id}
                              display={display}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Meetings — Loop Review (IQAC Meeting Loop, PR 2/3) */}
        <MeetingsSection committee={committee} canManage={canManageMeetings} />
      </div>
    </ContentLayout>
  );
}

function profileName(p: ProfileLite | undefined): string | null {
  if (!p) return null;
  return p.full_name?.trim() || (p.email ?? null);
}

// ----------------------------------------------------------------------------
// Cluster scope card — a cluster council (the Cluster Academic Council spans
// every college and both schools) is held by several institutions at once. Its
// institution_id is only where the row is FILED so RLS can reach it, never who
// owns it. Without this card the page rendered a cluster council identically to
// a single-institution committee: no roster, no span, no explanation of why it
// sits under one institution. Wording and colour match the "Cluster councils"
// section on the committees hub so the two surfaces agree.
//
// Mounted only when committee_type === 'cluster', so every other committee
// keeps its existing render path and issues no extra query.
// ----------------------------------------------------------------------------

interface ClusterMemberInstitution {
  id: string;
  name: string;
  iqac_code: string | null;
}

function ClusterScopeCard({
  memberInstitutionIds,
  filedUnderLabel,
}: {
  memberInstitutionIds: string[];
  filedUnderLabel: string | null;
}) {
  const { data: memberInstitutions, isLoading } = useQuery({
    queryKey: [
      'institutions',
      'cluster-roster',
      [...memberInstitutionIds].sort().join(','),
    ],
    queryFn: async (): Promise<ClusterMemberInstitution[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('institutions')
        .select('id, name, iqac_code')
        .in('id', memberInstitutionIds)
        .order('name');
      if (error) throw error;
      return (data ?? []) as ClusterMemberInstitution[];
    },
    enabled: memberInstitutionIds.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const resolved = memberInstitutions ?? [];
  // The roster is a plain uuid[]; institutions the viewer's RLS hides simply do
  // not come back. Say so rather than letting the count disagree with the list.
  const unresolvedCount = memberInstitutionIds.length - resolved.length;

  return (
    <Card className="border-2 border-amber-300 bg-amber-50/40 dark:bg-amber-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="h-5 w-5 text-amber-600" />
          Cluster council
        </CardTitle>
        <p className="mt-2 text-sm font-medium">
          {memberInstitutionIds.length > 0
            ? `Spans ${memberInstitutionIds.length} institution${
                memberInstitutionIds.length === 1 ? '' : 's'
              }`
            : 'Cluster roster not recorded'}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {memberInstitutionIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This council is marked as a cluster, but no member institutions are
            recorded against it yet.
          </p>
        ) : isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {resolved.map((inst) => (
              <div
                key={inst.id}
                className="flex items-start gap-2 rounded-lg border bg-card p-2.5 text-sm"
              >
                <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>
                  {inst.iqac_code ? `[${inst.iqac_code}] ` : ''}
                  {inst.name}
                </span>
              </div>
            ))}
          </div>
        )}

        {!isLoading && unresolvedCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {unresolvedCount} further institution
            {unresolvedCount === 1 ? ' is' : 's are'} on this roster but outside
            what you can see, so{' '}
            {unresolvedCount === 1 ? 'its name is' : 'their names are'} not
            listed here.
          </p>
        )}

        <p className="flex items-start gap-1.5 border-t pt-3 text-xs text-muted-foreground">
          <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Filed under {filedUnderLabel ?? 'an institution row'} — a filing
            location, not an owner. The council belongs to every institution it
            spans.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Add member dialog — two tabs: Internal (search profiles) / External (name+org+email)
// ----------------------------------------------------------------------------

/**
 * Default term end offered in the dialog: the 31 March on or after today — the
 * Indian academic year end, and the same date the database default uses for
 * machine write paths. Prefilled so the field is one click rather than a
 * chore, but still a real editable choice the appointer makes.
 *
 * Built from local calendar fields, never `new Date('YYYY-MM-DD')`, which
 * parses as UTC midnight and shifts the date for anyone behind Greenwich.
 */
function defaultTermEnd(now: Date = new Date()): string {
  const yearEnd = `${now.getFullYear()}-03-31`;
  const mm = `${now.getMonth() + 1}`.padStart(2, '0');
  const dd = `${now.getDate()}`.padStart(2, '0');
  const today = `${now.getFullYear()}-${mm}-${dd}`;
  return today <= yearEnd ? yearEnd : `${now.getFullYear() + 1}-03-31`;
}

function AddMemberDialog({ committeeId }: { committeeId: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'internal' | 'external'>('internal');
  const [role, setRole] = useState<CommitteeMemberRole>('member');
  // Director decision 7: required, not optional. Access ends on this date.
  const [termEnd, setTermEnd] = useState<string>(defaultTermEnd());

  // Internal state
  const [userSearch, setUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<ProfileLite | null>(null);

  // External state
  const [externalName, setExternalName] = useState('');
  const [externalOrg, setExternalOrg] = useState('');
  const [externalEmail, setExternalEmail] = useState('');

  const addInternal = useAddInternalMember();
  const addExternal = useAddExternalMember();

  // Debounced search of profiles table
  const { data: searchResults } = useQuery({
    queryKey: ['profiles', 'search', userSearch],
    queryFn: async (): Promise<ProfileLite[]> => {
      const q = userSearch.trim();
      if (q.length < 2) return [];
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('profiles')
        .select('id, full_name, email, role, institution_id')
        .or(
          `full_name.ilike.%${q}%,email.ilike.%${q}%`,
        )
        .limit(10);
      if (error) throw error;
      return (data ?? []) as ProfileLite[];
    },
    enabled: userSearch.trim().length >= 2,
    staleTime: 60 * 1000,
  });

  const reset = () => {
    setUserSearch('');
    setSelectedUser(null);
    setExternalName('');
    setExternalOrg('');
    setExternalEmail('');
    setRole('member');
    setTermEnd(defaultTermEnd());
    setTab('internal');
  };

  const handleSubmit = async () => {
    try {
      // Checked before either branch: the term end date is what ends this
      // person's access, so adding a member without one is not a thing the
      // dialog can do. The column is NOT NULL as well — this check exists so
      // the appointer is told in words rather than shown a raw 23502.
      if (!termEnd) {
        toast.error('A term end date is required — access ends on this date');
        return;
      }
      if (tab === 'internal') {
        if (!selectedUser) {
          toast.error('Select a user first');
          return;
        }
        await addInternal.mutateAsync({
          committee_id: committeeId,
          user_id: selectedUser.id,
          role,
          term_end: termEnd,
        });
      } else {
        if (!externalName.trim()) {
          toast.error('External member name is required');
          return;
        }
        await addExternal.mutateAsync({
          committee_id: committeeId,
          role,
          external_name: externalName.trim(),
          external_org: externalOrg.trim() || null,
          external_email: externalEmail.trim() || null,
          term_end: termEnd,
        });
      }
      toast.success('Member added');
      reset();
      setOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add member';
      toast.error(msg);
    }
  };

  const isPending = addInternal.isPending || addExternal.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Add member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add committee member</DialogTitle>
          <DialogDescription>
            Internal members are MyJKKN users (staff, faculty, leadership).
            External members are industry experts, alumni, or practitioners
            without MyJKKN accounts.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'internal' | 'external')}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="internal">Internal</TabsTrigger>
            <TabsTrigger value="external">External</TabsTrigger>
          </TabsList>

          <TabsContent value="internal" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label>Search by name or email</Label>
              <Input
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setSelectedUser(null);
                }}
                placeholder="Type at least 2 characters..."
              />
            </div>
            {searchResults && searchResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedUser(p);
                      setUserSearch(profileName(p) ?? '');
                    }}
                    className={`flex w-full items-start justify-between px-3 py-2 text-left text-sm hover:bg-muted ${
                      selectedUser?.id === p.id ? 'bg-muted' : ''
                    }`}
                  >
                    <div>
                      <div className="font-medium">{profileName(p) ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.email} {p.role && `· ${p.role}`}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedUser && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-100">
                Selected: {profileName(selectedUser)} ({selectedUser.email})
              </div>
            )}
          </TabsContent>

          <TabsContent value="external" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={externalName}
                onChange={(e) => setExternalName(e.target.value)}
                placeholder="Dr. Priya Menon"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Organisation (optional)</Label>
              <Input
                value={externalOrg}
                onChange={(e) => setExternalOrg(e.target.value)}
                placeholder="AIIMS Delhi / Infosys / Alumni"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email (optional)</Label>
              <Input
                type="email"
                value={externalEmail}
                onChange={(e) => setExternalEmail(e.target.value)}
                placeholder="priya@example.com"
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-1.5 pt-2">
          <Label htmlFor="member-term-end">
            Term end <span className="text-red-600">*</span>
          </Label>
          <Input
            id="member-term-end"
            type="date"
            required
            value={termEnd}
            onChange={(e) => setTermEnd(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            The last day of their term. Their access to this committee — its
            roster, meetings and resolutions — ends automatically the day after.
          </p>
        </div>

        <div className="space-y-1.5 pt-2">
          <Label>Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as CommitteeMemberRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as CommitteeMemberRole[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Adding…' : 'Add member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveMemberButton({
  memberId,
  committeeId,
  display,
}: {
  memberId: string;
  committeeId: string;
  display: string;
}) {
  const [open, setOpen] = useState(false);
  const remove = useRemoveMember();

  const handleConfirm = async () => {
    try {
      await remove.mutateAsync({ memberId, committeeId });
      toast.success(`Removed ${display}`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove member?</DialogTitle>
          <DialogDescription>
            {display} will be marked inactive on this committee. Their
            historical contributions (evidence tagged, notes, etc.) stay intact.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={remove.isPending}>
            {remove.isPending ? 'Removing…' : 'Remove member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateCommitteeButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const deactivate = useDeactivateNAACCommittee();

  const handleConfirm = async () => {
    try {
      await deactivate.mutateAsync(id);
      toast.success(`Committee "${name}" deactivated`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to deactivate');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Trash2 className="mr-2 h-4 w-4" />
          Deactivate
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate committee?</DialogTitle>
          <DialogDescription>
            "{name}" will be marked inactive. Historical data, evidence
            mappings, and member roster stay intact. This is reversible.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={deactivate.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={deactivate.isPending}>
            {deactivate.isPending ? 'Deactivating…' : 'Deactivate committee'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
