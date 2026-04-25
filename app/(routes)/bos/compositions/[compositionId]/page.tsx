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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useBosComposition } from '@/hooks/bos/use-bos-compositions';
import { useBosMembersByComposition, useAddBosMember, useRemoveBosMember } from '@/hooks/bos/use-bos-members';
import { usePermissions } from '@/hooks/use-permissions';
import {
  BosMember,
  BosMemberType,
  BOS_MEMBER_TYPE_LABELS,
} from '@/types/bos';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Member type display order ─────────────────────────────────────────────────

const MEMBER_GROUPS: { type: BosMemberType; label: string }[] = [
  { type: 'chairman',           label: 'Chairman' },
  { type: 'university_nominee', label: 'University Nominees' },
  { type: 'internal_member',    label: 'Internal Members' },
  { type: 'industry_expert',    label: 'Industry Experts' },
  { type: 'alumni',             label: 'Alumni Members' },
];

// ── Add Member Dialog ─────────────────────────────────────────────────────────

interface AddMemberDialogProps {
  open: boolean;
  onClose: () => void;
  compositionId: string;
  institutionsId: string;
}

function AddMemberDialog({ open, onClose, compositionId, institutionsId }: AddMemberDialogProps) {
  const addMember = useAddBosMember();
  const [memberType, setMemberType] = useState<BosMemberType>('internal_member');
  const [displayName, setDisplayName] = useState('');
  const [displayDesignation, setDisplayDesignation] = useState('');
  const [displayInstitution, setDisplayInstitution] = useState('');
  const [email, setEmail] = useState('');
  const [contactNo, setContactNo] = useState('');

  const reset = () => {
    setMemberType('internal_member');
    setDisplayName('');
    setDisplayDesignation('');
    setDisplayInstitution('');
    setEmail('');
    setContactNo('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) { toast.error('Display name is required'); return; }
    try {
      await addMember.mutateAsync({
        institutions_id: institutionsId,
        composition_id: compositionId,
        member_type: memberType,
        display_name: displayName.trim(),
        display_designation: displayDesignation.trim() || undefined,
        display_institution: displayInstitution.trim() || undefined,
        email: email.trim() || undefined,
        contact_no: contactNo.trim() || undefined,
        is_active: true,
        sort_order: 0,
      });
      toast.success('Member added');
      reset();
      onClose();
    } catch (err) {
      logger.error('academic/bos', 'Failed to add member', err);
      toast.error((err as Error).message || 'Failed to add member');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div className='space-y-2'>
            <Label>Member Type <span className='text-destructive'>*</span></Label>
            <Select value={memberType} onValueChange={(v) => setMemberType(v as BosMemberType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(BOS_MEMBER_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label>Full Name <span className='text-destructive'>*</span></Label>
            <Input
              placeholder='e.g. Dr. Rajesh Kumar'
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label>Designation</Label>
              <Input
                placeholder='e.g. Professor'
                value={displayDesignation}
                onChange={(e) => setDisplayDesignation(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label>Institution</Label>
              <Input
                placeholder='e.g. Anna University'
                value={displayInstitution}
                onChange={(e) => setDisplayInstitution(e.target.value)}
              />
            </div>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label>Email</Label>
              <Input
                type='email'
                placeholder='email@example.com'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label>Contact No.</Label>
              <Input
                placeholder='+91 98765 43210'
                value={contactNo}
                onChange={(e) => setContactNo(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => { reset(); onClose(); }}>
              Cancel
            </Button>
            <Button type='submit' disabled={addMember.isPending}>
              {addMember.isPending ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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

      {/* ── Members ─────────────────────────────────────────────────────── */}
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
