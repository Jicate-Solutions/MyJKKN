'use client';

import { use, useState } from 'react';
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
  BosMember,
  BosMemberType,
} from '@/types/bos';
import { logger } from '@/lib/utils/enhanced-logger';
import { AddMemberDialog } from '../_components/add-member-dialog';
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
                  <Button size='sm' variant='outline' onClick={() => setAddDialogOpen(true)}>
                    <Plus className='mr-2 h-4 w-4' />
                    Add Member
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className='space-y-6'>
              {members.length === 0 ? (
                <div className='text-center py-8 text-muted-foreground'>
                  <Users className='h-8 w-8 mx-auto mb-2 opacity-40' />
                  <p className='text-sm'>No members added yet.</p>
                  {canManage && (
                    <Button variant='link' size='sm' onClick={() => setAddDialogOpen(true)}>
                      Add the first member →
                    </Button>
                  )}
                </div>
              ) : (
                MEMBER_GROUPS.map(({ type, label }) => {
                  const group = members.filter((m) => m.member_type === type);
                  if (group.length === 0) return null;
                  return (
                    <div key={type}>
                      <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2'>
                        {label} ({group.length})
                      </h4>
                      <div className='grid gap-2 sm:grid-cols-2'>
                        {group.map((member) => (
                          <MemberCard
                            key={member.id}
                            member={member}
                            canEdit={canManage}
                            onRemove={handleRemoveMember}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
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
          We pass the currently-assigned staff/expert IDs so the pickers can
          hide them — preventing the same person from being added twice. The
          DB also enforces uniqueness (see 20260516 migration). */}
      {composition.institutions_id && (
        <AddMemberDialog
          open={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          compositionId={compositionId}
          institutionsId={composition.institutions_id}
          assignedStaffIds={members
            .map((m) => m.staff_id)
            .filter((id): id is string => !!id)}
          assignedExpertIds={members
            .map((m) => m.expert_id)
            .filter((id): id is string => !!id)}
        />
      )}
    </div>
  );
}
