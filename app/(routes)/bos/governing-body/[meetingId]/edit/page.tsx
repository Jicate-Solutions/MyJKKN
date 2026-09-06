'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Save, Loader2, Plus, Trash2 } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GbAddMemberDialog } from '@/app/(routes)/bos/governing-body/_components/gb-add-member-dialog';

import { useBosMeeting, useUpdateBosMeeting } from '@/hooks/bos/use-bos-meetings';
import {
  useBosMembersByComposition,
  useRemoveBosMember,
} from '@/hooks/bos/use-bos-members';
import {
  bosMemberTypeLabel,
  isBosChairmanRow,
  type UpdateBosMeetingDto,
} from '@/types/bos';

// Dedicated edit page for Governing Body meetings. The shared BoS meeting
// form (/bos/meetings/[id]/edit) is board-centric — it requires a board and
// rejects council meeting types — so Governing Body meetings edit here instead
// (mirrors the Academic Council edit page). Roster add/remove reuses the same
// composition-scoped APIs as /bos/governing-body/new.
export default function EditGoverningBodyMeetingPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = use(params);
  return (
    <PermissionGuard module='academic.bos-governing-body' action='manage'>
      <EditGoverningBodyMeeting meetingId={meetingId} />
    </PermissionGuard>
  );
}

function EditGoverningBodyMeeting({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const { data: meeting, isLoading } = useBosMeeting(meetingId);
  const updateMeeting = useUpdateBosMeeting();

  const compositionId = meeting?.composition_id ?? undefined;
  const institutionsId = meeting?.institutions_id;
  const { data: members = [], isLoading: membersLoading } =
    useBosMembersByComposition(compositionId);
  const removeMember = useRemoveBosMember();
  const [showAddMember, setShowAddMember] = useState(false);

  const [meetingNumber, setMeetingNumber] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [venue, setVenue] = useState('');
  const [agenda, setAgenda] = useState('');

  // Hydrate the form once the meeting loads.
  useEffect(() => {
    if (!meeting) return;
    setMeetingNumber(meeting.meeting_number ?? '');
    setTitle(meeting.meeting_title ?? '');
    setScheduledDate(meeting.scheduled_date ?? '');
    setScheduledTime(meeting.scheduled_time ?? '');
    setVenue(meeting.venue ?? '');
    setAgenda(meeting.agenda_text ?? '');
  }, [meeting]);

  const isDraft = meeting?.status === 'draft';
  // Roster changes are composition-scoped. Lock them after draft so notice /
  // attendance snapshots stay stable once the meeting has left draft.
  const canEditMembers = isDraft;

  const handleSave = async () => {
    if (!meeting) return;
    try {
      const data: UpdateBosMeetingDto = {
        meeting_number: meetingNumber === '' ? undefined : Number(meetingNumber),
        meeting_title: title.trim() || undefined,
        // Schedule fields are only mutable while the meeting is a draft — the
        // PUT route enforces the same rule, so sending them post-draft is a no-op.
        scheduled_date: scheduledDate || undefined,
        scheduled_time: scheduledTime || undefined,
        venue: venue.trim() || undefined,
        agenda_text: agenda.trim() || undefined,
      };
      await updateMeeting.mutateAsync({ id: meetingId, data });
      toast.success('Meeting updated.');
      router.push(`/bos/meetings/${meetingId}`);
    } catch (e) {
      toast.error((e as Error).message || 'Failed to update meeting');
    }
  };

  if (isLoading) {
    return (
      <div className='w-full max-w-3xl mx-auto space-y-4'>
        <Skeleton className='h-10 w-64' />
        <Skeleton className='h-64 w-full' />
      </div>
    );
  }

  if (!meeting) {
    return <p className='text-muted-foreground'>Meeting not found.</p>;
  }

  return (
    <div className='w-full max-w-3xl mx-auto space-y-6 overflow-x-hidden'>
      <PageHeader
        title='Edit Governing Body Meeting'
        description={`Governing Body · ${meeting.academic_year}`}
      >
        <Button variant='outline' size='sm' onClick={() => router.push(`/bos/meetings/${meetingId}`)}>
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back
        </Button>
      </PageHeader>

      {/* ── Members roster ──────────────────────────────────────────────── */}
      {compositionId && (
        <Card>
          <CardHeader className='flex flex-row items-center justify-between gap-3 space-y-0'>
            <CardTitle className='text-base'>
              Governing Body Members{' '}
              <span className='text-sm font-normal text-muted-foreground'>
                ({members.length})
              </span>
            </CardTitle>
            {canEditMembers && (
              <Button size='sm' variant='outline' onClick={() => setShowAddMember(true)}>
                <Plus className='mr-2 h-4 w-4' />
                Add Member
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!canEditMembers && (
              <p className='mb-3 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground'>
                Members can only be added or removed while the meeting is a draft.
              </p>
            )}
            {membersLoading ? (
              <div className='space-y-2'>
                <Skeleton className='h-10 w-full' />
                <Skeleton className='h-10 w-full' />
              </div>
            ) : members.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                No members yet. Use “Add Member” to include the Chairman, Deans, HoDs, or
                external experts.
              </p>
            ) : (
              <ul className='divide-y'>
                {members.map((m) => (
                  <li key={m.id} className='flex items-center justify-between gap-3 py-2'>
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-medium'>{m.display_name}</p>
                      {m.display_designation && (
                        <p className='truncate text-xs text-muted-foreground'>
                          {m.display_designation}
                        </p>
                      )}
                    </div>
                    <div className='flex shrink-0 items-center gap-2'>
                      <Badge variant={isBosChairmanRow(m) ? 'default' : 'secondary'}>
                        {m.member_type_rec?.name ?? bosMemberTypeLabel(m.member_type)}
                      </Badge>
                      {canEditMembers && (
                        <Button
                          size='icon'
                          variant='ghost'
                          className='h-7 w-7 text-muted-foreground hover:text-destructive'
                          title='Remove member'
                          disabled={m.id.startsWith('optimistic-') || removeMember.isPending}
                          onClick={() =>
                            removeMember.mutate(
                              { id: m.id, compositionId },
                              {
                                onError: (e) =>
                                  toast.error((e as Error).message || 'Failed to remove'),
                              },
                            )
                          }
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {compositionId && institutionsId && canEditMembers && (
        <GbAddMemberDialog
          open={showAddMember}
          onClose={() => setShowAddMember(false)}
          compositionId={compositionId}
          institutionsId={institutionsId}
          existingMembers={members.map((m) => ({
            staff_id: m.staff_id ?? null,
            expert_id: m.expert_id ?? null,
            member_type: m.member_type,
          }))}
        />
      )}

      {/* ── Meeting details ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Meeting Details</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label>
                Meeting Number <span className='text-destructive'>*</span>
              </Label>
              <Input
                type='number'
                min={1}
                value={meetingNumber}
                onChange={(e) =>
                  setMeetingNumber(e.target.value === '' ? '' : Number(e.target.value))
                }
              />
            </div>
            <div className='space-y-2'>
              <Label>Meeting Type</Label>
              <Input value='Governing Body' readOnly disabled />
            </div>
          </div>

          <div className='space-y-2'>
            <Label>Meeting Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label>Date</Label>
              <Input
                type='date'
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                disabled={!isDraft}
              />
            </div>
            <div className='space-y-2'>
              <Label>Time</Label>
              <Input
                type='time'
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                disabled={!isDraft}
              />
            </div>
          </div>

          <div className='space-y-2'>
            <Label>Venue</Label>
            <Input value={venue} onChange={(e) => setVenue(e.target.value)} disabled={!isDraft} />
          </div>

          {!isDraft && (
            <p className='rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground'>
              Date, time and venue can only be changed while the meeting is a draft.
            </p>
          )}

          <div className='space-y-2'>
            <Label>Agenda</Label>
            <Textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={4} />
          </div>

          <div className='flex justify-end gap-2'>
            <Button variant='outline' onClick={() => router.push(`/bos/meetings/${meetingId}`)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateMeeting.isPending}>
              {updateMeeting.isPending ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <Save className='mr-2 h-4 w-4' />
              )}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
