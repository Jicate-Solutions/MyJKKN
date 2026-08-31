// ============================================================================
// PREMIUM ROOM — INVITE ROOMMATE (learner-facing, Phase 2)
// ============================================================================
// Created: 2026-05-19
//
// Rewritten 2026-08-14: a roll, not a search box.
//
// It used to require typing two characters before showing anyone — which only
// helps a learner who already knows who she wants to live with. She cannot see
// who else is in her room category, so she had nothing to type, and the page
// sent zero invites in three months.
//
// Flow now:
//   1. Learner arrives from My Hostel, or with ?allocation=<id>.
//   2. Everyone she MAY invite is listed by default, her own room category
//      first, carrying department / year / programme and the room they live in
//      today. Search and filters narrow that list rather than gate it.
//   3. Tick several, send one batch of invites.
//   4. Sent + received invites are listed below; received ones can be accepted,
//      which now actually moves her into the room.
//
// The candidate list comes from fn_premium_invite_candidates, which mirrors
// fn_premium_create_invite's eligibility exactly — so the screen can never
// offer someone the invite would refuse.
// ============================================================================

'use client';

export const navMeta = {
  label: 'Premium Room — Invite Roommate',
  icon: 'Users',
  invokedFrom: '/campus-living/my-hostel/premium',
} as const;

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { HostelAllocationService } from '@/lib/services/campus-living/hostel-allocation-service';
import {
  useConfirmRoommate,
  useDeclineRoommate,
  useLearnerPremiumInvites,
  usePremiumInviteCandidates,
  premiumAllocationKeys,
} from '@/hooks/campus-living/use-premium-allocation';
// Called directly rather than through useInviteRoommate: that hook toasts once
// per invite, which for a batch of five is five toasts nobody reads. One honest
// summary is emitted below instead.
import { inviteRoommate } from '@/lib/services/campus-living/hostel-premium-allocation-service';
import { useMyRoomDetails, useMyRoommates } from '@/hooks/campus-living/use-my-hostel';
import { InviteCandidateList } from '../_components/invite-candidate-list';
import {
  Users,
  Loader2,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const inviteStatusBadge = (status: string) => {
  switch (status) {
    case 'pending':
      return <Badge variant='secondary'><Clock className='h-3 w-3 mr-1' />Pending</Badge>;
    case 'accepted':
      return <Badge variant='success'><CheckCircle2 className='h-3 w-3 mr-1' />Accepted</Badge>;
    case 'declined':
      return <Badge variant='outline'><XCircle className='h-3 w-3 mr-1' />Declined</Badge>;
    case 'expired':
      return <Badge variant='outline'>Expired</Badge>;
    case 'cancelled':
      return <Badge variant='outline'>Cancelled</Badge>;
    default:
      return <Badge variant='outline'>{status}</Badge>;
  }
};

export default function InviteRoommatePage() {
  const searchParams = useSearchParams();
  const allocationIdParam = searchParams.get('allocation');
  const { profile } = useAuth();
  const userId = profile?.id ?? '';
  const qc = useQueryClient();

  // Find inviter's active premium allocation (param-provided OR auto-discover)
  const { data: allocations, isLoading: allocLoading } = useQuery({
    queryKey: ['hostel-allocations', 'by-learner', userId],
    queryFn: () => HostelAllocationService.getAllocationByLearner(userId, true),
    enabled: !!userId,
  });

  const activeAllocation = useMemo(() => {
    const list = (allocations ?? []) as any[];
    if (allocationIdParam) {
      return list.find((a) => a.id === allocationIdParam) ?? list[0];
    }
    return list[0];
  }, [allocations, allocationIdParam]);

  const confirmMutation = useConfirmRoommate();
  const declineMutation = useDeclineRoommate();

  const { data: invites, isLoading: invitesLoading } =
    useLearnerPremiumInvites(userId);

  const allocationId: string | undefined = activeAllocation?.id;
  const { data: candidates, isLoading: candidatesLoading, error: candidatesError } =
    usePremiumInviteCandidates(allocationId);

  // Her room, so the list can name her category and say how many beds are free.
  const { data: room } = useMyRoomDetails(activeAllocation?.room_id ?? null);
  const { data: roommates } = useMyRoommates(!!activeAllocation?.room_id);
  const emptyBeds =
    room?.capacity != null && roommates
      ? Math.max(0, room.capacity - 1 - roommates.length)
      : null;

  const [sending, setSending] = useState(false);

  /**
   * Send one invite per selected learner and report the batch honestly.
   *
   * Each is a separate RPC call — the invite has per-pair state (retry cap,
   * pending check) that only it can evaluate, so a partial success is a real
   * outcome, not an error. Failures are counted and named rather than collapsed
   * into one red toast.
   */
  async function handleInviteMany(profileIds: string[]) {
    if (!allocationId || profileIds.length === 0) return;
    setSending(true);
    let sent = 0;
    const failures: string[] = [];
    try {
      for (const id of profileIds) {
        try {
          await inviteRoommate({
            allocationId,
            inviterLearnerId: userId,
            invitedLearnerId: id,
          });
          sent += 1;
        } catch (e) {
          const name =
            (candidates ?? []).find((c) => c.profile_id === id)?.full_name ?? 'someone';
          failures.push(`${name}: ${e instanceof Error ? e.message : 'failed'}`);
        }
      }
    } finally {
      setSending(false);
      // Calling the service directly skips the hook's invalidation too, so the
      // invites table and the candidate list are refreshed here.
      qc.invalidateQueries({ queryKey: premiumAllocationKeys.all });
    }

    if (sent > 0 && failures.length === 0) {
      toast.success(`${sent} invite${sent === 1 ? '' : 's'} sent.`);
    } else if (sent > 0) {
      toast.success(`${sent} sent, ${failures.length} could not be: ${failures[0]}`);
    } else {
      toast.error(failures[0] ?? 'No invites could be sent.');
    }
  }

  if (allocLoading) {
    return (
      <ContentLayout title='Premium Room — Invite Roommate'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      </ContentLayout>
    );
  }

  // She needs a room before she can ask anyone into it. Whether her CATEGORY
  // allows sharing is decided server-side — fn_premium_invite_candidates returns
  // nothing when it does not — and the list component says so in words. This
  // deliberately does not test `tier_id`, as the page used to: every allocation
  // in the system carries one, pointing at the 'standard' tier, so that check
  // said yes to all 684 residents and the invite then refused every one of them.
  const canInvite = !!allocationId;

  // Her own room category, taken from the candidates who share it — the
  // same_category rows are by definition in her category. Saves a query, and
  // cannot drift from what the list is grouped by.
  const myCategoryName =
    (candidates ?? []).find((c) => c.same_category)?.current_room_category ?? null;

  return (
    <ContentLayout title='Premium Room — Invite Roommate'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'My Hostel', href: '/campus-living/my-hostel' },
          { label: 'Premium Room', href: '/campus-living/my-hostel/premium' },
          { label: 'Invite Roommate' },
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex items-start gap-3'>
          <Users className='h-7 w-7 text-primary mt-1' />
          <div>
            <h1 className='text-2xl font-bold py-1'>Invite a Roommate</h1>
            <p className='text-sm text-muted-foreground max-w-2xl'>
              Invite a same-gender, same-college learner to share your premium
              room. Invites expire after 48 hours and you have up to 2 retries
              per learner.
            </p>
          </div>
        </div>

        {/* Who she can ask */}
        {!canInvite ? (
          <Card className='border-amber-200 bg-amber-50/50'>
            <CardContent className='p-4 flex items-start gap-3'>
              <AlertCircle className='h-5 w-5 text-amber-600 mt-0.5' />
              <div className='text-sm'>
                <p className='font-medium text-amber-900'>
                  {activeAllocation
                    ? 'Your room category does not offer roommate invites.'
                    : "You don't have an active hostel allocation."}
                </p>
                <p className='text-amber-700 mt-1'>
                  {activeAllocation ? (
                    <>The hostel office can still place someone with you.</>
                  ) : (
                    <>
                      Check your hostel details on the{' '}
                      <Link
                        href='/campus-living/my-hostel'
                        className='underline underline-offset-2'
                      >
                        My Hostel page
                      </Link>
                      .
                    </>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Who you can ask</CardTitle>
              <CardDescription>
                Hostel residents in your college who are in the{' '}
                {myCategoryName ? <strong>{myCategoryName}</strong> : 'same room'}{' '}
                category as you, and the same gender. Someone in a different
                category cannot be invited — joining would change what they pay.
                Tick as many as you like and send in one go.
                {emptyBeds !== null && emptyBeds > 0 ? (
                  <>
                    {' '}You have {emptyBeds} empty{' '}
                    {emptyBeds === 1 ? 'bed' : 'beds'}.
                  </>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {candidatesError ? (
                <div className='rounded-md border p-6 text-center text-sm text-muted-foreground'>
                  We could not load the list right now. Please try again shortly.
                </div>
              ) : (
                <InviteCandidateList
                  candidates={candidates ?? []}
                  loading={candidatesLoading}
                  myCategoryName={myCategoryName}
                  emptyBeds={emptyBeds}
                  sending={sending}
                  onInvite={handleInviteMany}
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* Invites table */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Your invites</CardTitle>
            <CardDescription>
              Sent + received. Accept/decline a received invite below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invitesLoading ? (
              <div className='flex items-center justify-center py-6'>
                <Loader2 className='h-5 w-5 animate-spin text-primary' />
              </div>
            ) : !invites || invites.length === 0 ? (
              <div className='p-6 text-center text-sm text-muted-foreground'>
                No invites yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Direction</TableHead>
                    <TableHead>Counterparty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className='text-right'>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => {
                    const isInbound = invite.invited_learner_id === userId;
                    const counterpartyId = isInbound
                      ? invite.inviter_learner_id
                      : invite.invited_learner_id;
                    return (
                      <TableRow key={invite.id}>
                        <TableCell>
                          <Badge variant={isInbound ? 'default' : 'outline'}>
                            {isInbound ? 'Received' : 'Sent'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <code className='text-[11px]'>{counterpartyId.slice(0, 8)}…</code>
                        </TableCell>
                        <TableCell>{inviteStatusBadge(invite.status)}</TableCell>
                        <TableCell className='text-xs text-muted-foreground'>
                          {formatDistanceToNow(new Date(invite.created_at), {
                            addSuffix: true,
                          })}
                        </TableCell>
                        <TableCell className='text-xs text-muted-foreground'>
                          {invite.status === 'pending'
                            ? formatDistanceToNow(new Date(invite.expires_at), {
                                addSuffix: true,
                              })
                            : '—'}
                        </TableCell>
                        <TableCell className='text-right'>
                          {isInbound && invite.status === 'pending' && (
                            <div className='inline-flex gap-1'>
                              <Button
                                size='sm'
                                variant='outline'
                                disabled={confirmMutation.isPending}
                                onClick={() =>
                                  confirmMutation.mutate({
                                    inviteToken: invite.invite_token,
                                    actingLearnerId: userId,
                                  })
                                }
                              >
                                Accept
                              </Button>
                              <Button
                                size='sm'
                                variant='ghost'
                                disabled={declineMutation.isPending}
                                onClick={() =>
                                  declineMutation.mutate({
                                    inviteToken: invite.invite_token,
                                    actingLearnerId: userId,
                                  })
                                }
                              >
                                Decline
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Back to my-hostel */}
        <div>
          <Button asChild variant='outline' size='sm'>
            <Link href='/campus-living/my-hostel'>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back to My Hostel
            </Link>
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
