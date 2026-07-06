'use client';

import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Edit,
  Users,
  CalendarDays,
  CheckCircle2,
  XCircle,
  Building2,
  Mail,
  Phone,
  Plus,
  Trash2,
  GraduationCap,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useBosComposition } from '@/hooks/bos/use-bos-compositions';
import { useBosCommitteesByComposition } from '@/hooks/bos/use-bos-committees';
import { useBosMemberTypes } from '@/hooks/bos/use-bos-member-types';
import { useBosMembersByComposition, useRemoveBosMember } from '@/hooks/bos/use-bos-members';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useBosBoardScope,
  canEditComposition,
  canManageMembers,
} from '@/hooks/bos/use-bos-board-scope';
import { useAuth } from '@/hooks/use-auth-provider';
import { useInstitutionContextById } from '@/hooks/use-institution-context';
import {
  BosCommittee,
  BosMember,
  BosMemberType,
  BosMemberTypeRecord,
} from '@/types/bos';
import { logger } from '@/lib/utils/enhanced-logger';
import { AddMemberDialog } from '../_components/add-member-dialog';
import { CommitteeFormDialog } from '../../committees/_components/committee-form-dialog';
import { BoardProgrammesCard } from '../../_components/board-programmes-card';
import { ProgrammeOutcomesEditor } from '../../taxonomy/_components/programme-outcomes-editor';

interface Regulation {
  id: string;
  title: string;
  regulation_year: string;
  regulation_code: string;
}

// ── Member type display order ─────────────────────────────────────────────────

const MEMBER_GROUPS: { type: BosMemberType; label: string }[] = [
  { type: 'principal',          label: 'Principal' },
  { type: 'chairman',           label: 'Chairman' },
  { type: 'hod',                label: 'Head of Department' },
  { type: 'facilitator',        label: 'Facilitators' },
  { type: 'university_nominee', label: 'University Nominees' },
  { type: 'subject_expert',     label: 'Subject Experts' },
  { type: 'internal_member',    label: 'Internal Members' },
  { type: 'industry_expert',    label: 'Industry Experts' },
  { type: 'alumni',             label: 'Alumni Members' },
  { type: 'startup',            label: 'Startup Members' },
];

// ── Member type groups (within one committee section) ───────────────────────

function MemberTypeGroups({
  members,
  memberTypes,
  canManage,
  onRemove,
}: {
  members: BosMember[];
  /** Institution's bos_member_types rows (already ordered by sort_order). */
  memberTypes: BosMemberTypeRecord[];
  canManage: boolean;
  onRemove: (id: string) => void;
}) {
  // Primary grouping: table-driven member types (member_type_id). Old rows
  // whose member_type_id is null (or points at a deleted type) fall back to
  // the legacy enum groups so nothing disappears.
  const knownTypeIds = new Set(memberTypes.map((t) => t.id));
  const leftovers = members.filter(
    (m) => !m.member_type_id || !knownTypeIds.has(m.member_type_id)
  );

  const sections: { key: string; label: string; items: BosMember[] }[] = [
    ...memberTypes.map((t) => ({
      key: t.id,
      label: t.name,
      items: members.filter((m) => m.member_type_id === t.id),
    })),
    ...MEMBER_GROUPS.map(({ type, label }) => ({
      key: `legacy:${type}`,
      label,
      items: leftovers.filter((m) => m.member_type === type),
    })),
  ];

  return (
    <div className='space-y-4'>
      {sections.map(({ key, label, items }) => {
        if (items.length === 0) return null;
        return (
          <div key={key}>
            <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2'>
              {label} ({items.length})
            </h4>
            <div className='grid gap-2 sm:grid-cols-2'>
              {items.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  canEdit={canManage}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Committee tabs ──────────────────────────────────────────────────────────
// A composition can hold several committees. Rather than an ever-growing
// vertical stack, each committee gets a tab; the active tab shows that
// committee's members grouped by type. A virtual "General" tab collects rows
// with no committee (or whose committee was deleted).

const GENERAL_TAB = '__general__';

function CommitteeTabs({
  committees,
  members,
  memberTypes,
  canManage,
  onRemove,
  onAddMember,
}: {
  committees: BosCommittee[];
  /** membersForGrouping — member_type_id already collapsed to canonical rows. */
  members: BosMember[];
  memberTypes: BosMemberTypeRecord[];
  canManage: boolean;
  onRemove: (id: string) => void;
  onAddMember: () => void;
}) {
  const knownIds = new Set(committees.map((c) => c.id));
  const general = members.filter(
    (m) => !m.committee_id || !knownIds.has(m.committee_id)
  );

  const sections = [
    ...committees.map((c) => ({
      value: c.id,
      committee: c as BosCommittee | null,
      items: members.filter((m) => m.committee_id === c.id),
    })),
    ...(general.length > 0
      ? [{ value: GENERAL_TAB, committee: null, items: general }]
      : []),
  ];

  if (sections.length === 0) return null;

  return (
    <Tabs defaultValue={sections[0].value} className='space-y-4'>
      {/* Horizontal, scrollable committee bar — scales past the viewport width
          instead of wrapping into a tall block. */}
      <div className='overflow-x-auto pb-1'>
        <TabsList className='inline-flex h-auto flex-nowrap justify-start gap-1 p-1'>
          {sections.map((s) => (
            <TabsTrigger
              key={s.value}
              value={s.value}
              className='shrink-0 gap-1.5 data-[state=active]:bg-background'
            >
              <span className='max-w-[14rem] truncate'>
                {s.committee ? s.committee.name : 'General'}
              </span>
              <span className='rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums'>
                {s.items.length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {sections.map((s) => (
        <TabsContent key={s.value} value={s.value} className='mt-0'>
          <div className='rounded-lg border p-4'>
            <div className='mb-3 flex items-center gap-2'>
              <h3 className='text-sm font-semibold'>
                {s.committee ? s.committee.name : 'General'}
              </h3>
              {s.committee?.short_code && (
                <Badge variant='outline' className='text-xs'>
                  {s.committee.short_code}
                </Badge>
              )}
              {s.committee && !s.committee.is_active && (
                <Badge variant='secondary' className='text-xs'>Inactive</Badge>
              )}
              <span className='ml-auto text-xs text-muted-foreground'>
                {s.items.length} member{s.items.length === 1 ? '' : 's'}
              </span>
            </div>
            {s.items.length === 0 ? (
              <div className='flex flex-col items-start gap-2 py-2'>
                <p className='text-xs text-muted-foreground'>
                  No members in this committee yet.
                </p>
                {canManage && (
                  <Button size='sm' variant='outline' onClick={onAddMember}>
                    <Plus className='mr-2 h-4 w-4' />
                    Add Member
                  </Button>
                )}
              </div>
            ) : (
              <MemberTypeGroups
                members={s.items}
                memberTypes={memberTypes}
                canManage={canManage}
                onRemove={onRemove}
              />
            )}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}

// ── Member Card ───────────────────────────────────────────────────────────────

function MemberCard({
  member,
  canEdit,
  onRemove,
}: {
  member: BosMember;
  canEdit: boolean;
  onRemove: (id: string) => void;
}) {
  return (
    <div className='flex items-start gap-3 rounded-lg border p-3'>
      <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted'>
        <Users className='h-4 w-4 text-muted-foreground' />
      </div>
      <div className='flex-1 min-w-0'>
        <p className='font-medium text-sm truncate'>{member.display_name}</p>
        {member.display_designation && (
          <p className='text-xs text-muted-foreground truncate'>{member.display_designation}</p>
        )}
        {member.display_institution && (
          <p className='flex items-center gap-1 text-xs text-muted-foreground mt-0.5'>
            <Building2 className='h-3 w-3 shrink-0' />
            <span className='truncate'>{member.display_institution}</span>
          </p>
        )}
        <div className='flex flex-wrap gap-3 mt-1'>
          {member.email && (
            <a href={`mailto:${member.email}`} className='flex items-center gap-1 text-xs text-primary hover:underline'>
              <Mail className='h-3 w-3' />{member.email}
            </a>
          )}
          {member.contact_no && (
            <span className='flex items-center gap-1 text-xs text-muted-foreground'>
              <Phone className='h-3 w-3' />{member.contact_no}
            </span>
          )}
        </div>
      </div>
      <div className='flex items-center gap-1 shrink-0'>
        {!member.is_active && (
          <Badge variant='secondary' className='text-xs'>Inactive</Badge>
        )}
        {canEdit && (
          <Button
            variant='ghost'
            size='icon'
            className='h-7 w-7 text-muted-foreground hover:text-destructive'
            onClick={() => onRemove(member.id)}
          >
            <Trash2 className='h-3.5 w-3.5' />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface CompositionDetailPageProps {
  params: Promise<{ compositionId: string }>;
}

export default function CompositionDetailPage({ params }: CompositionDetailPageProps) {
  const { compositionId } = use(params);
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const boardScope = useBosBoardScope();
  const { profile } = useAuth();
  const { data: composition, isLoading: loadingComposition } = useBosComposition(compositionId);
  const { data: members = [], isLoading: loadingMembers } = useBosMembersByComposition(compositionId);
  const removeMember = useRemoveBosMember();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addCommitteeOpen, setAddCommitteeOpen] = useState(false);

  // Bootstrap case: the user who created this row keeps edit + member-roster
  // access until a chairman is appointed. Without it the creator can't
  // finish setting up their own composition.
  const createdByMe = !!(composition?.created_by && profile?.id && composition.created_by === profile.id);

  // canEdit drives header "Edit" button + the BoardProgrammesCard.
  // canManage drives the per-member "Add"/"Remove" controls. They differ in
  // intent today (programmes editing vs roster management) but both unlock
  // for: super-admin, chairman of this comp, or creator of this comp.
  const hasRolePermEdit = isSuperAdmin || canAccess('academic.bos-compositions', 'edit');
  const canEdit = hasRolePermEdit && canEditComposition(boardScope, compositionId, createdByMe);
  const canManage = hasRolePermEdit && canManageMembers(boardScope, compositionId, createdByMe);

  // Resolve all sibling institution IDs for the COMPOSITION'S institution
  // (not the logged-in user's). For CAS colleges, this expands a single
  // institutions_id into the pair of Aided + Self-Financing UUIDs via the
  // shared counselling_code. Needed so regulations/taxonomy/programmes
  // lookups don't miss rows stored under the sibling UUID.
  const institutionCtx = useInstitutionContextById(composition?.institutions_id);
  const allInstitutionIds: string[] = institutionCtx.data?.myjkkn_institution_ids?.length
    ? institutionCtx.data.myjkkn_institution_ids
    : composition?.institutions_id ? [composition.institutions_id] : [];

  const isLoading = loadingComposition || loadingMembers;

  const [selectedRegulationId, setSelectedRegulationId] = useState('');

  // CAS-aware: a composition may be tied to one of two sibling institution
  // UUIDs (Aided/Self-Financing), but the regulation + taxonomy rows might
  // live under either. Pass the full sibling list so both are searched.
  const institutionIdsCsv = allInstitutionIds.join(',');

  // Committees of THIS composition (20260706 — committees are composition-owned).
  // Members are grouped by committee below. Inactive committees are included so
  // legacy sections still show their name.
  const { data: committees = [] } = useBosCommitteesByComposition(compositionId);

  // Member types of this institution — drive the Add Member dropdown and the
  // per-type grouping inside each committee section. Inactive types included
  // for display (old rows keep their label); the dialog gets active only.
  const { data: rawMemberTypeRows = [] } = useBosMemberTypes(institutionIdsCsv || null);

  // CAS colleges seed the same 10 member types under BOTH sibling institution
  // UUIDs (20260611 seeds per institutions_id). The CAS-expanded query above
  // then returns each type twice, so the dropdown and the group headers double
  // up (see [[feedback_cas_institution_lookup]]). Collapse by name to a single
  // canonical row (lowest sort_order wins) and remember which raw ids fold into
  // it, so an existing member pointing at the dropped sibling's row still groups
  // under the surviving one instead of falling back to a duplicate legacy group.
  const { memberTypeRows, canonicalTypeId } = useMemo(() => {
    const byName = new Map<string, BosMemberTypeRecord>();
    const idMap = new Map<string, string>();
    const sorted = [...rawMemberTypeRows].sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );
    for (const t of sorted) {
      const key = t.name.trim().toLowerCase();
      const existing = byName.get(key);
      if (existing) {
        idMap.set(t.id, existing.id);   // fold this duplicate into the survivor
      } else {
        byName.set(key, t);
        idMap.set(t.id, t.id);
      }
    }
    return {
      memberTypeRows: Array.from(byName.values()),
      canonicalTypeId: idMap,
    };
  }, [rawMemberTypeRows]);

  // Members with their member_type_id re-pointed to the canonical (deduped)
  // type row — used only for the per-type grouping below. The originals (with
  // real ids) are kept for removal + the Add Member dialog's exclusion set.
  const membersForGrouping = useMemo(
    () =>
      members.map((m) => ({
        ...m,
        member_type_id: m.member_type_id
          ? canonicalTypeId.get(m.member_type_id) ?? m.member_type_id
          : m.member_type_id,
      })),
    [members, canonicalTypeId]
  );

  // Regulations for this institution (all CAS siblings)
  const { data: regulations = [], isLoading: loadingRegs } = useQuery<Regulation[]>({
    queryKey: ['bos', 'regulations', institutionIdsCsv],
    queryFn: async () => {
      const res = await fetch(`/api/bos/regulations?institutionIds=${institutionIdsCsv}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: allInstitutionIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Taxonomy assignments — only regulations with a taxonomy can have PO/PSO
  const { data: taxonomyAssignments = [] } = useQuery<{ regulation_id: string }[]>({
    queryKey: ['bos', 'taxonomy-assignments', institutionIdsCsv],
    queryFn: async () => {
      const res = await fetch(`/api/bos/taxonomy?institutionsIds=${institutionIdsCsv}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: allInstitutionIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const assignedRegIds = new Set(taxonomyAssignments.map((a) => a.regulation_id));
  const regulationsWithTaxonomy = regulations.filter((r) => assignedRegIds.has(r.id));

  const handleRemoveMember = async (memberId: string) => {
    try {
      await removeMember.mutateAsync({ id: memberId, compositionId });
      toast.success('Member removed');
    } catch (err) {
      logger.error('academic/bos', 'Failed to remove member', err);
      toast.error('Failed to remove member');
    }
  };

  if (isLoading) {
    return (
      <div className='max-w-4xl space-y-4'>
        <Skeleton className='h-10 w-72' />
        <Skeleton className='h-32 w-full' />
        <Skeleton className='h-64 w-full' />
      </div>
    );
  }

  if (!composition) {
    return <div className='max-w-4xl'><p className='text-muted-foreground'>Composition not found.</p></div>;
  }

  const activeMembers = members.filter((m) => m.is_active);
  const formatDate = (d?: string) => d ? format(new Date(d), 'dd MMM yyyy') : '—';

  return (
    <div className='max-w-4xl space-y-6'>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        title={composition.composition_title}
        description={
          composition.board
            ? `${composition.board.board_name} (${composition.board.board_code})`
            : 'Board of Studies Composition'
        }
      >
        {canEdit && (
          <Button size='sm' onClick={() => router.push(`/bos/compositions/${compositionId}/edit`)}>
            <Edit className='mr-2 h-4 w-4' />
            Edit
          </Button>
        )}
      </PageHeader>

      {/* ── Info Strip ──────────────────────────────────────────────────── */}
      <Card>
        <CardContent className='p-4'>
          <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
            <div>
              <p className='text-xs text-muted-foreground'>Academic Year</p>
              <p className='text-sm font-medium'>{composition.academic_year}</p>
            </div>
            <div>
              <p className='text-xs text-muted-foreground'>Term</p>
              <p className='text-sm font-medium'>
                {formatDate(composition.term_start_date)} – {formatDate(composition.term_end_date)}
              </p>
            </div>
            <div>
              <p className='text-xs text-muted-foreground'>Status</p>
              <div className='flex items-center gap-1 mt-0.5'>
                {composition.is_active ? (
                  <><CheckCircle2 className='h-3.5 w-3.5 text-green-600' /><span className='text-sm font-medium text-green-700'>Active</span></>
                ) : (
                  <><XCircle className='h-3.5 w-3.5 text-muted-foreground' /><span className='text-sm font-medium text-muted-foreground'>Inactive</span></>
                )}
              </div>
            </div>
            <div>
              <p className='text-xs text-muted-foreground'>GC Ratified</p>
              <div className='flex items-center gap-1 mt-0.5'>
                {composition.ratified_by_gc ? (
                  <><CheckCircle2 className='h-3.5 w-3.5 text-green-600' /><span className='text-sm font-medium text-green-700'>{composition.ratified_date ? formatDate(composition.ratified_date) : 'Yes'}</span></>
                ) : (
                  <span className='text-sm text-muted-foreground'>Not yet</span>
                )}
              </div>
            </div>
          </div>
          {composition.constituted_by && (
            <>
              <Separator className='my-3' />
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <CalendarDays className='h-4 w-4 shrink-0' />
                <span>Constituted by: <strong className='text-foreground'>{composition.constituted_by}</strong></span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Tabbed sections ─────────────────────────────────────────────── */}
      <Tabs defaultValue='members'>
        <TabsList>
          <TabsTrigger value='members'>
            Members
            {activeMembers.length > 0 && (
              <Badge variant='secondary' className='ml-2 text-xs'>{activeMembers.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value='programmes'>Programmes</TabsTrigger>
          <TabsTrigger value='outcomes'>
            <GraduationCap className='h-3.5 w-3.5 mr-1.5' />
            Outcomes (PO/PSO)
          </TabsTrigger>
        </TabsList>

        {/* Members tab */}
        <TabsContent value='members'>
          <Card>
            <CardHeader className='pb-3'>
              <div className='flex items-center justify-between'>
                <CardTitle className='text-base'>
                  Members
                  <span className='ml-2 text-sm font-normal text-muted-foreground'>
                    ({activeMembers.length} active)
                  </span>
                </CardTitle>
                {canManage && (
                  <div className='flex items-center gap-2'>
                    <Button size='sm' variant='ghost' onClick={() => setAddCommitteeOpen(true)}>
                      <Plus className='mr-2 h-4 w-4' />
                      Add Committee
                    </Button>
                    <Button size='sm' variant='outline' onClick={() => setAddDialogOpen(true)}>
                      <Plus className='mr-2 h-4 w-4' />
                      Add Member
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className='space-y-6'>
              {members.length === 0 && committees.length === 0 ? (
                <div className='text-center py-8 text-muted-foreground'>
                  <Users className='h-8 w-8 mx-auto mb-2 opacity-40' />
                  <p className='text-sm'>No committees or members yet.</p>
                  {canManage && (
                    <Button variant='link' size='sm' onClick={() => setAddCommitteeOpen(true)}>
                      Add the first committee →
                    </Button>
                  )}
                </div>
              ) : (
                <CommitteeTabs
                  committees={committees}
                  members={membersForGrouping}
                  memberTypes={memberTypeRows}
                  canManage={canManage}
                  onRemove={handleRemoveMember}
                  onAddMember={() => setAddDialogOpen(true)}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Programmes tab */}
        <TabsContent value='programmes'>
          {composition.institutions_id ? (
            <BoardProgrammesCard
              boardId={composition.board_id}
              institutionsId={composition.institutions_id}
              allInstitutionIds={allInstitutionIds}
              canEdit={canEdit}
            />
          ) : (
            <p className='text-sm text-muted-foreground text-center py-8'>
              Institution not linked to this composition.
            </p>
          )}
        </TabsContent>

        {/* Outcomes (PO/PSO) tab */}
        <TabsContent value='outcomes' className='space-y-4'>
          {loadingRegs ? (
            <Skeleton className='h-9 w-56' />
          ) : regulationsWithTaxonomy.length === 0 ? (
            <div className='flex flex-col items-center gap-3 py-12 border rounded-md border-dashed text-center'>
              <GraduationCap className='h-8 w-8 text-muted-foreground/40' />
              <p className='text-sm text-muted-foreground'>
                No regulations with taxonomy configured for this institution.
              </p>
              <Button variant='outline' size='sm' onClick={() => router.push('/bos/taxonomy')}>
                Configure in Taxonomy →
              </Button>
            </div>
          ) : (
            <>
              <div className='flex items-center gap-3'>
                <span className='text-sm font-medium shrink-0'>Regulation</span>
                <Select value={selectedRegulationId} onValueChange={setSelectedRegulationId}>
                  <SelectTrigger className='w-[260px]'>
                    <SelectValue placeholder='Select regulation…' />
                  </SelectTrigger>
                  <SelectContent>
                    {regulationsWithTaxonomy.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.regulation_code} — {r.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedRegulationId ? (
                <ProgrammeOutcomesEditor
                  regulationId={selectedRegulationId}
                  boardId={composition.board_id}
                  institutionsId={composition.institutions_id}
                />
              ) : (
                <p className='text-sm text-muted-foreground text-center py-6'>
                  Select a regulation above to view and edit POs/PSOs.
                </p>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {composition.notes && (
        <Card>
          <CardContent className='p-4'>
            <p className='text-xs text-muted-foreground mb-1'>Internal Notes</p>
            <p className='text-sm text-muted-foreground'>{composition.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Add Member Dialog ───────────────────────────────────────────── */}
      {/* AddMemberDialog resolves CAS siblings itself via useInstitutionContextById
          (no need to pass allInstitutionIds — see FacilitatorPicker).
          We pass the existing members (with their committee) so the pickers
          can hide people already on the SELECTED committee — the same person
          may sit on two different committees. The DB enforces the same rule
          via per-(composition, committee) unique indexes (20260610). */}
      {composition.institutions_id && (
        <AddMemberDialog
          open={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          compositionId={compositionId}
          institutionsId={composition.institutions_id}
          committees={committees.filter((c) => c.is_active)}
          memberTypes={memberTypeRows.filter((t) => t.is_active)}
          existingMembers={members.map((m) => ({
            staff_id: m.staff_id,
            expert_id: m.expert_id,
            committee_id: m.committee_id,
          }))}
        />
      )}

      {/* ── Add Committee Dialog ────────────────────────────────────────── */}
      {/* Committees are owned by this composition (20260706). Institution is
          inherited from the composition, so the picker is suppressed. */}
      {composition.institutions_id && (
        <CommitteeFormDialog
          open={addCommitteeOpen}
          onClose={() => setAddCommitteeOpen(false)}
          institutions={[]}
          isSuperAdmin={isSuperAdmin}
          defaultInstitutionsId={composition.institutions_id}
          compositionId={compositionId}
        />
      )}
    </div>
  );
}
