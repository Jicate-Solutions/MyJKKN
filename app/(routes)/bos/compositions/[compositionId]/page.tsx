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
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBosComposition } from '@/hooks/bos/use-bos-compositions';
import { useBosMembersByComposition, useRemoveBosMember } from '@/hooks/bos/use-bos-members';
import { usePermissions } from '@/hooks/use-permissions';
import {
  BosMember,
  BosMemberType,
} from '@/types/bos';
import { logger } from '@/lib/utils/enhanced-logger';
import { AddMemberDialog } from '../_components/add-member-dialog';
import { BoardProgrammesCard } from '../../_components/board-programmes-card';

// ── Member type display order ─────────────────────────────────────────────────

const MEMBER_GROUPS: { type: BosMemberType; label: string }[] = [
  { type: 'chairman',           label: 'Chairman' },
  { type: 'university_nominee', label: 'University Nominees' },
  { type: 'internal_member',    label: 'Internal Members' },
  { type: 'industry_expert',    label: 'Industry Experts' },
  { type: 'alumni',             label: 'Alumni Members' },
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
  const { data: composition, isLoading: loadingComposition } = useBosComposition(compositionId);
  const { data: members = [], isLoading: loadingMembers } = useBosMembersByComposition(compositionId);
  const removeMember = useRemoveBosMember();
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const canEdit = isSuperAdmin || canAccess('academic.bos-compositions', 'edit');
  const isLoading = loadingComposition || loadingMembers;

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
                {canEdit && (
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
                  {canEdit && (
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
                            canEdit={canEdit}
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
              canEdit={canEdit}
            />
          ) : (
            <p className='text-sm text-muted-foreground text-center py-8'>
              Institution not linked to this composition.
            </p>
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
      {composition.institutions_id && (
        <AddMemberDialog
          open={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          compositionId={compositionId}
          institutionsId={composition.institutions_id}
        />
      )}
    </div>
  );
}
